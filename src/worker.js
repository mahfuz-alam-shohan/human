import { serveAdminHtml } from './templates/adminApp.js';
import { serveSharedHtml } from './templates/sharedView.js';
import { SUBJECT_COLUMNS } from './constants.js';
import { createToken, verifyToken, hashPassword } from './security.js';
import { ensureSchema, nukeDatabase } from './db/schema.js';
import { errorResponse, isoTimestamp, response, safeVal, sanitizeFileName } from './utils.js';
import { handleGetDashboard, handleGetGlobalNetwork, handleGetMapData, handleGetSuggestions } from './handlers/dashboardHandlers.js';
import { handleGetSubjectFull } from './handlers/subjectHandlers.js';
import { handleCreateShareLink, handleGetSharedSubject, handleListShareLinks, handleRevokeShareLink } from './handlers/shareHandlers.js';
import { handleInteraction, handleIntel, handleLocation, handleMediaLink, handleRelationship, handleSkills } from './handlers/entityHandlers.js';

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
            if (!admin) {
                // Auto register for demo
                const hash = await hashPassword(password);
                const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)').bind(email, hash, isoTimestamp()).run();
                const token = await createToken({ id: res.meta.last_row_id, email }, JWT_SECRET);
                return response({ token });
            }
            const hashed = await hashPassword(password);
            if (hashed !== admin.password_hash) return errorResponse('ACCESS DENIED', 401);
            
            const token = await createToken({ id: admin.id, email }, JWT_SECRET);
            return response({ token });
        }

        // --- PROTECTED ROUTES ---
        const authHeader = req.headers.get('Authorization');
        const token = authHeader && authHeader.split(' ')[1];
        const user = await verifyToken(token, JWT_SECRET);
        
        if (!user) return errorResponse("Unauthorized", 401);
        const adminId = user.id;

        // Dashboard & Stats
        if (path === '/api/dashboard') return handleGetDashboard(env.DB, adminId);
        if (path === '/api/suggestions') return handleGetSuggestions(env.DB, adminId);
        if (path === '/api/global-network') return handleGetGlobalNetwork(env.DB, adminId);
        
        // Subject CRUD
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                const p = await req.json();
                const now = isoTimestamp();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, dob, age, height, weight, blood_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(adminId, safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.dob), safeVal(p.age), safeVal(p.height), safeVal(p.weight), safeVal(p.blood_type), now, now).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(adminId).all();
            return response(res.results);
        }

        if (path === '/api/map-data') return handleGetMapData(env.DB, adminId);

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const id = idMatch[1];
            
            const owner = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(id, adminId).first();
            if(!owner) return errorResponse("Subject not found", 404);

            if(req.method === 'PATCH') {
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
            return handleGetSubjectFull(env.DB, id, adminId);
        }

        // Sub-resources
        if (path === '/api/interaction') {
            return handleInteraction(req, env.DB, adminId);
        }
        if (path === '/api/location') {
            return handleLocation(req, env.DB, adminId);
        }
        if (path === '/api/intel') {
            return handleIntel(req, env.DB, adminId);
        }
        if (path === '/api/skills') {
            return handleSkills(req, env.DB, adminId);
        }
        if (path === '/api/relationship') {
            return handleRelationship(req, env.DB);
        }
        if (path === '/api/media-link') {
            return handleMediaLink(req, env.DB, adminId);
        }

        // Sharing
        if (path === '/api/share-links') {
            if(req.method === 'DELETE') return handleRevokeShareLink(env.DB, url.searchParams.get('token'));
            if(req.method === 'POST') return handleCreateShareLink(req, env.DB, url.origin, adminId);
            return handleListShareLinks(env.DB, url.searchParams.get('subjectId'), adminId);
        }

        if (path === '/api/delete') {
            const { table, id } = await req.json();
            const safeTables = ['subjects','subject_interactions','subject_locations','subject_intel','subject_relationships','subject_media'];
            if(safeTables.includes(table)) {
                if(table === 'subjects') await env.DB.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ? AND admin_id = ?').bind(id, adminId).run();
                else await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
                return response({success:true});
            }
        }

        // File Ops
        if (path === '/api/upload-avatar' || path === '/api/upload-media') {
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
            await nukeDatabase(env.DB);
            return response({success:true});
        }

        return new Response('Not Found', { status: 404 });
    } catch(e) {
        return errorResponse(e.message);
    }
  }
};
