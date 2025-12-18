import { serveAdminHtml } from './templates/adminApp.js';
import { serveSharedHtml } from './templates/sharedView.js';
import { SUBJECT_COLUMNS } from './constants.js';
import { createToken, verifyToken, hashPassword } from './security.js';
import { ensureSchema, nukeDatabase } from './db/schema.js';
import { errorResponse, isoTimestamp, response, safeVal, sanitizeFileName } from './utils.js';
import { canAccessTab, canPerform, normalizeAllowedSections } from './permissions.js';
import { handleGetDashboard, handleGetGlobalNetwork, handleGetMapData, handleGetSuggestions } from './handlers/dashboardHandlers.js';
import { handleGetSubjectFull } from './handlers/subjectHandlers.js';
import { handleCreateShareLink, handleGetSharedSubject, handleListShareLinks, handleRevokeShareLink } from './handlers/shareHandlers.js';
import { handleInteraction, handleIntel, handleLocation, handleMediaLink, handleRelationship, handleSkills } from './handlers/entityHandlers.js';
import { handleCreateAdmin, handleListAdminLogins, handleListAdmins, handleUpdateAdmin, recordAdminLogin, sanitizeAdmin } from './handlers/adminHandlers.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    const JWT_SECRET = env.JWT_SECRET || "CHANGE_ME_IN_PROD";

    try {
        await ensureSchema(env.DB);

        // Share Page
        const shareMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
        if (req.method === 'GET' && shareMatch) return serveSharedHtml(shareMatch[1]);
        const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
        if (shareApiMatch) return handleGetSharedSubject(env.DB, shareApiMatch[1], req);

        // Main App
        if (req.method === 'GET' && path === '/') return serveAdminHtml();

        // Media Files
        if (path.startsWith('/api/media/')) {
            const key = path.replace('/api/media/', '');
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response('Not found', { status: 404 });
            return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' }});
        }

        // Auth
        if (path === '/api/login') {
            const { email, password } = await req.json();
            const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
            const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
            const agent = req.headers.get('User-Agent');
            if (!admin) {
                const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM admins').first();
                if (countRow?.c === 0) {
                    const hash = await hashPassword(password);
                    const allowed = JSON.stringify(normalizeAllowedSections());
                    const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, allowed_sections, is_master, created_at) VALUES (?, ?, ?, 1, ?)').bind(email, hash, allowed, isoTimestamp()).run();
                    const token = await createToken({ id: res.meta.last_row_id, email, token_version: 0 }, JWT_SECRET);
                    await recordAdminLogin(env.DB, res.meta.last_row_id, agent, ip);
                    const adminRow = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(res.meta.last_row_id).first();
                    return response({ token, admin: sanitizeAdmin(adminRow) });
                }
                return errorResponse('Admin not found', 404);
            }
            if (admin.is_disabled) return errorResponse('Account disabled', 403);
            const hashed = await hashPassword(password);
            if (hashed !== admin.password_hash) return errorResponse('ACCESS DENIED', 401);
            
            const token = await createToken({ id: admin.id, email, token_version: admin.token_version || 0 }, JWT_SECRET);
            await recordAdminLogin(env.DB, admin.id, agent, ip);
            return response({ token, admin: sanitizeAdmin(admin) });
        }

        // --- PROTECTED ROUTES ---
        const authHeader = req.headers.get('Authorization');
        const token = authHeader && authHeader.split(' ')[1];
        const user = await verifyToken(token, JWT_SECRET);
        
        if (!user) return errorResponse("Unauthorized", 401);
        const adminId = user.id;
        const adminRow = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(adminId).first();
        if (!adminRow || adminRow.is_disabled) return errorResponse("Unauthorized", 401);
        if ((adminRow.token_version || 0) !== (user.token_version || 0)) return errorResponse("Unauthorized", 401);
        adminRow.allowed_sections = normalizeAllowedSections(adminRow.allowed_sections);

        const requireTab = (tab) => canAccessTab(adminRow, tab) ? null : errorResponse('Forbidden', 403);
        const requirePermission = (perm) => canPerform(adminRow, perm) ? null : errorResponse('Forbidden', 403);
        const requireMaster = () => adminRow.is_master ? null : errorResponse('Forbidden', 403);

        if (path === '/api/me') return response(sanitizeAdmin(adminRow));

        if (path === '/api/admins' && req.method === 'GET') {
            const err = requireMaster(); if (err) return err;
            return handleListAdmins(env.DB);
        }
        if (path === '/api/admins' && req.method === 'POST') {
            const err = requireMaster(); if (err) return err;
            return handleCreateAdmin(req, env.DB);
        }
        const adminMatch = path.match(/^\/api\/admins\/(\d+)$/);
        if (adminMatch && req.method === 'PATCH') {
            const err = requireMaster(); if (err) return err;
            return handleUpdateAdmin(req, env.DB, adminMatch[1], adminId);
        }
        if (path === '/api/admins/logins') {
            const err = requireMaster(); if (err) return err;
            return handleListAdminLogins(env.DB);
        }

        // Dashboard & Stats
        if (path === '/api/dashboard') {
            const err = requireTab('dashboard'); if (err) return err;
            return handleGetDashboard(env.DB, adminId);
        }
        if (path === '/api/suggestions') {
            const err = requireTab('targets'); if (err) return err;
            return handleGetSuggestions(env.DB, adminId);
        }
        if (path === '/api/global-network') {
            const err = requireTab('network'); if (err) return err;
            return handleGetGlobalNetwork(env.DB, adminId);
        }
        
        // Subject CRUD
        if (path === '/api/subjects') {
            const errTab = requireTab('targets'); if (errTab) return errTab;
            if(req.method === 'POST') {
                const err = requirePermission('createSubjects'); if (err) return err;
                const p = await req.json();
                const now = isoTimestamp();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, dob, age, height, weight, blood_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(adminId, safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.dob), safeVal(p.age), safeVal(p.height), safeVal(p.weight), safeVal(p.blood_type), now, now).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(adminId).all();
            return response(res.results);
        }

        if (path === '/api/map-data') {
            const err = requireTab('map'); if (err) return err;
            return handleGetMapData(env.DB, adminId);
        }

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const errTab = requireTab('targets'); if (errTab) return errTab;
            const id = idMatch[1];
            
            const owner = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(id, adminId).first();
            if(!owner) return errorResponse("Subject not found", 404);

            if(req.method === 'PATCH') {
                const err = requirePermission('editSubjects'); if (err) return err;
                const p = await req.json();
                const keys = Object.keys(p).filter(k => SUBJECT_COLUMNS.includes(k));
                if(keys.length > 0) {
                    const set = keys.map(k => `${k} = ?`).join(', ') + ", updated_at = ?";
                    const vals = keys.map(k => safeVal(p[k]));
                    vals.push(isoTimestamp());
                    await env.DB.prepare(`UPDATE subjects SET ${set} WHERE id = ?`).bind(...vals, id).run();
                }
                return response({success:true});
            }
            return handleGetSubjectFull(env.DB, id, adminId, adminRow);
        }

        // Sub-resources
        if (path === '/api/interaction') {
            const err = requirePermission('manageIntel'); if (err) return err;
            return handleInteraction(req, env.DB, adminId);
        }
        if (path === '/api/location') {
            const err = requirePermission('manageLocations'); if (err) return err;
            return handleLocation(req, env.DB, adminId);
        }
        if (path === '/api/intel') {
            const err = requirePermission('manageIntel'); if (err) return err;
            return handleIntel(req, env.DB, adminId);
        }
        if (path === '/api/skills') {
            const err = requirePermission('manageIntel'); if (err) return err;
            return handleSkills(req, env.DB, adminId);
        }
        if (path === '/api/relationship') {
            const err = requirePermission('manageRelationships'); if (err) return err;
            return handleRelationship(req, env.DB, adminId);
        }
        if (path === '/api/media-link') {
            const err = requirePermission('manageFiles'); if (err) return err;
            return handleMediaLink(req, env.DB, adminId);
        }

        // Sharing
        if (path === '/api/share-links') {
            const err = requirePermission('manageShares'); if (err) return err;
            if(req.method === 'DELETE') return handleRevokeShareLink(env.DB, url.searchParams.get('token'));
            if(req.method === 'POST') return handleCreateShareLink(req, env.DB, url.origin, adminId);
            return handleListShareLinks(env.DB, url.searchParams.get('subjectId'), adminId);
        }

        if (path === '/api/delete') {
            const { table, id } = await req.json();
            const safeTables = ['subjects','subject_interactions','subject_locations','subject_intel','subject_relationships','subject_media'];
            if(safeTables.includes(table)) {
                const permMap = {
                    subjects: 'deleteSubjects',
                    subject_interactions: 'manageIntel',
                    subject_locations: 'manageLocations',
                    subject_intel: 'manageIntel',
                    subject_relationships: 'manageRelationships',
                    subject_media: 'manageFiles'
                };
                const perm = permMap[table] || 'editSubjects';
                const permErr = requirePermission(perm); if (permErr) return permErr;

                if(table === 'subjects') {
                    await env.DB.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ? AND admin_id = ?').bind(id, adminId).run();
                } else {
                    let subjectId = null;
                    if (table === 'subject_relationships') {
                        const rel = await env.DB.prepare('SELECT subject_a_id, subject_b_id FROM subject_relationships WHERE id = ?').bind(id).first();
                        if (!rel) return errorResponse("Not found", 404);
                        const owner = await env.DB.prepare('SELECT id FROM subjects WHERE (id = ? OR id = ?) AND admin_id = ?').bind(rel.subject_a_id, rel.subject_b_id, adminId).first();
                        if (!owner) return errorResponse("Unauthorized", 403);
                    } else {
                        const row = await env.DB.prepare(`SELECT subject_id FROM ${table} WHERE id = ?`).bind(id).first();
                        subjectId = row?.subject_id;
                        if (!row) return errorResponse("Not found", 404);
                        const owner = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(subjectId, adminId).first();
                        if (!owner) return errorResponse("Unauthorized", 403);
                    }
                    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
                }
                return response({success:true});
            }
        }

        // File Ops
        if (path === '/api/upload-avatar' || path === '/api/upload-media') {
            const err = requirePermission('manageFiles'); if (err) return err;
            const { subjectId, data, filename, contentType } = await req.json();
            const owner = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(subjectId, adminId).first();
            if(!owner) return errorResponse("Unauthorized", 403);

            const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(filename)}`;
            const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            await env.BUCKET.put(key, binary, { httpMetadata: { contentType } });
            
            if (path.includes('avatar')) await env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
            else await env.DB.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?,?,?,?,?)').bind(subjectId, key, contentType, 'Attached File', isoTimestamp()).run();
            return response({success:true});
        }

        if (path === '/api/nuke') {
            const err = requireMaster(); if (err) return err;
            await nukeDatabase(env.DB);
            return response({success:true});
        }

        return new Response('Not Found', { status: 404 });
    } catch(e) {
        return errorResponse(e.message);
    }
  }
};
