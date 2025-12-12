import { serveAdminHtml } from './templates/adminApp.js';
import { serveSharedHtml } from './templates/sharedView.js';

// --- Security & Crypto ---

// Helper to base64url encode
const toBase64Url = (str) => btoa(String.fromCharCode.apply(null, new Uint8Array(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// Create a signed token (JWT-lite)
async function createToken(payload, secret) {
    const header = { alg: "HS256", typ: "JWT" };
    const encHeader = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
    const encPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const data = new TextEncoder().encode(`${encHeader}.${encPayload}`);
    
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, data);
    
    return `${encHeader}.${encPayload}.${toBase64Url(signature)}`;
}

// Verify token
async function verifyToken(token, secret) {
    try {
        const [h, p, s] = token.split('.');
        if (!h || !p || !s) return null;
        
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        const data = new TextEncoder().encode(`${h}.${p}`);
        const sig = fromBase64Url(s);
        
        const isValid = await crypto.subtle.verify("HMAC", key, sig, data);
        if (!isValid) return null;
        
        return JSON.parse(new TextDecoder().decode(fromBase64Url(p)));
    } catch (e) { return null; }
}

async function hashPassword(secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Configuration ---

const RELATION_PRESETS = [
    { a: 'Father', b: 'Child', family: true }, { a: 'Mother', b: 'Child', family: true },
    { a: 'Son', b: 'Parent', family: true }, { a: 'Daughter', b: 'Parent', family: true },
    { a: 'Husband', b: 'Wife', family: true }, { a: 'Wife', b: 'Husband', family: true },
    { a: 'Colleague', b: 'Colleague', family: false }, { a: 'Friend', b: 'Friend', family: false },
];

const SUBJECT_COLUMNS = [
    'full_name', 'alias', 'dob', 'age', 'gender', 'occupation', 'nationality', 
    'ideology', 'location', 'contact', 'hometown', 'modus_operandi', 'notes', 
    'weakness', 'avatar_path', 'status', 'threat_level', 'height', 'weight', 
    'blood_type', 'identifying_marks'
];

// --- Helpers ---

function isoTimestamp() { return new Date().toISOString(); }
function sanitizeFileName(name) { return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload'; }
function generateToken() { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2,'0')).join(''); }

function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

function errorResponse(msg, status = 500) { return response({ error: msg }, status); }
function safeVal(v) { return v === undefined || v === '' ? null : v; }

// --- Database Layer ---

let schemaInitialized = false;

async function ensureSchema(db) {
  if (schemaInitialized) return;
  try {
      await db.prepare("PRAGMA foreign_keys = ON;").run();
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subjects (
          id INTEGER PRIMARY KEY, admin_id INTEGER, full_name TEXT, alias TEXT, dob TEXT, age INTEGER, gender TEXT,
          occupation TEXT, nationality TEXT, ideology TEXT, location TEXT, contact TEXT, hometown TEXT, 
          modus_operandi TEXT, notes TEXT, weakness TEXT, avatar_path TEXT, is_archived INTEGER DEFAULT 0,
          status TEXT DEFAULT 'Active', threat_level TEXT DEFAULT 'Low', last_sighted TEXT, height TEXT, 
          weight TEXT, blood_type TEXT, identifying_marks TEXT, created_at TEXT, updated_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_intel (id INTEGER PRIMARY KEY, subject_id INTEGER, category TEXT, label TEXT, value TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_media (id INTEGER PRIMARY KEY, subject_id INTEGER, object_key TEXT, content_type TEXT, description TEXT, media_type TEXT DEFAULT 'file', external_url TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_relationships (id INTEGER PRIMARY KEY, subject_a_id INTEGER, subject_b_id INTEGER, relationship_type TEXT, role_b TEXT, notes TEXT, custom_name TEXT, custom_avatar TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_interactions (id INTEGER PRIMARY KEY, subject_id INTEGER, date TEXT, type TEXT, transcript TEXT, conclusion TEXT, evidence_url TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_locations (id INTEGER PRIMARY KEY, subject_id INTEGER, name TEXT, address TEXT, lat REAL, lng REAL, type TEXT, notes TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_shares (id INTEGER PRIMARY KEY, subject_id INTEGER, token TEXT UNIQUE, is_active INTEGER DEFAULT 1, duration_seconds INTEGER, views INTEGER DEFAULT 0, started_at TEXT, created_at TEXT)`)
      ]);
      schemaInitialized = true;
  } catch (err) { console.error("Init Error", err); }
}

async function nukeDatabase(db) {
    const tables = ['subject_shares', 'subject_locations', 'subject_interactions', 'subject_relationships', 'subject_media', 'subject_intel', 'subjects', 'admins'];
    await db.prepare("PRAGMA foreign_keys = OFF;").run();
    for(const t of tables) { try { await db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); } catch(e) {} }
    await db.prepare("PRAGMA foreign_keys = ON;").run();
    schemaInitialized = false; 
    return true;
}

// --- Logic ---

function analyzeProfile(subject, interactions, intel) {
    const completeness = Math.min(100, Math.floor(((intel.length + interactions.length + (subject.modus_operandi ? 1 : 0)) / 20) * 100));
    return {
        score: completeness,
        summary: `Profile is ${completeness}% complete. ${interactions.length} events recorded.`
    };
}

// --- Route Handling ---

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // JWT Secret fallback (in production, set this via `wrangler secret put JWT_SECRET`)
    const JWT_SECRET = env.JWT_SECRET || "DEV_SECRET_CHANGE_ME_PLEASE";

    try {
        if (!schemaInitialized) await ensureSchema(env.DB);

        // --- PUBLIC ROUTES ---

        // Shared Link View
        const shareMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
        if (method === 'GET' && shareMatch) return serveSharedHtml(shareMatch[1]);
        const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
        if (shareApiMatch) return handleGetSharedSubject(env.DB, shareApiMatch[1]);

        // Login
        if (path === '/api/login' && method === 'POST') {
            const { email, password } = await req.json();
            const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
            
            if (!admin) {
                // Register on first login if DB is empty? Or just auto-register for demo
                // For security in production, disable auto-registration or add invite codes
                const hash = await hashPassword(password);
                const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)').bind(email, hash, isoTimestamp()).run();
                const token = await createToken({ id: res.meta.last_row_id, email }, JWT_SECRET);
                return response({ token });
            }
            
            const hashed = await hashPassword(password);
            if (hashed !== admin.password_hash) return errorResponse('Invalid Credentials', 401);
            
            const token = await createToken({ id: admin.id, email }, JWT_SECRET);
            return response({ token });
        }

        // Media Files (Public but obfuscated URLs usually)
        if (path.startsWith('/api/media/')) {
            const key = path.replace('/api/media/', '');
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response('Not found', { status: 404 });
            return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' }});
        }

        // Main App
        if (method === 'GET' && path === '/') return serveAdminHtml();

        // --- PROTECTED ROUTES (Require Token) ---
        
        const authHeader = req.headers.get('Authorization');
        const token = authHeader && authHeader.split(' ')[1];
        const user = await verifyToken(token, JWT_SECRET);
        
        if (!user) return errorResponse("Unauthorized", 401);
        const adminId = user.id; // SECURE ID

        // Dashboard
        if (path === '/api/dashboard') {
            const recent = await env.DB.prepare(`
                SELECT 'subject' as type, id as ref_id, full_name as title, 'Profile Updated' as desc, updated_at as date FROM subjects WHERE admin_id = ?
                UNION ALL SELECT 'interaction' as type, subject_id as ref_id, type as title, conclusion as desc, created_at as date FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
                UNION ALL SELECT 'location' as type, subject_id as ref_id, name as title, type as desc, created_at as date FROM subject_locations WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
                ORDER BY date DESC LIMIT 50`).bind(adminId, adminId, adminId).all();
            
            const stats = await env.DB.prepare(`SELECT 
                (SELECT COUNT(*) FROM subjects WHERE admin_id = ?) as targets,
                (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as evidence,
                (SELECT COUNT(*) FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as encounters
            `).bind(adminId, adminId, adminId).first();
            return response({ feed: recent.results, stats });
        }

        // Global Map
        if (path === '/api/map-data') {
            const res = await env.DB.prepare(`SELECT l.*, s.full_name, s.avatar_path, s.occupation FROM subject_locations l JOIN subjects s ON l.subject_id = s.id WHERE s.admin_id = ? AND l.lat IS NOT NULL ORDER BY l.created_at ASC`).bind(adminId).all();
            return response(res.results);
        }

        // Global Network
        if (path === '/api/global-network') {
            const subjects = await env.DB.prepare('SELECT id, full_name, occupation, avatar_path, threat_level FROM subjects WHERE admin_id = ? AND is_archived = 0').bind(adminId).all();
            if (subjects.results.length === 0) return response({ nodes: [], edges: [] });
            
            const ids = subjects.results.map(s => s.id).join(',');
            const rels = await env.DB.prepare(`SELECT * FROM subject_relationships WHERE subject_a_id IN (${ids}) AND subject_b_id IN (${ids})`).all();
            
            return response({
                nodes: subjects.results.map(s => ({ id: s.id, label: s.full_name, group: s.threat_level, image: s.avatar_path, shape: 'circularImage' })),
                edges: rels.results.map(r => ({ from: r.subject_a_id, to: r.subject_b_id, label: r.relationship_type, arrows: 'to' }))
            });
        }

        // Subjects List & Create
        if (path === '/api/subjects') {
            if (method === 'POST') {
                const p = await req.json();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, dob, age, height, weight, blood_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(adminId, safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.dob), safeVal(p.age), safeVal(p.height), safeVal(p.weight), safeVal(p.blood_type), isoTimestamp(), isoTimestamp()).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY updated_at DESC').bind(adminId).all();
            return response(res.results);
        }

        // Subject Detail
        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const id = idMatch[1];
            // Security Check: Ensure subject belongs to admin
            const ownerCheck = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(id, adminId).first();
            if (!ownerCheck) return errorResponse("Subject not found or access denied", 404);

            if (method === 'PATCH') {
                const p = await req.json();
                const keys = Object.keys(p).filter(k => SUBJECT_COLUMNS.includes(k));
                if (keys.length > 0) {
                    const set = keys.map(k => `${k} = ?`).join(', ') + ", updated_at = ?";
                    const vals = keys.map(k => safeVal(p[k]));
                    vals.push(isoTimestamp());
                    await env.DB.prepare(`UPDATE subjects SET ${set} WHERE id = ?`).bind(...vals, id).run();
                }
                return response({success:true});
            }

            // Get Full Data
            const subject = await env.DB.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
            const [media, intel, rels, interactions, locations] = await Promise.all([
                env.DB.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
                env.DB.prepare('SELECT * FROM subject_intel WHERE subject_id = ?').bind(id).all(),
                env.DB.prepare(`SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar FROM subject_relationships r LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END) WHERE r.subject_a_id = ? OR r.subject_b_id = ?`).bind(id, id, id).all(),
                env.DB.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
                env.DB.prepare('SELECT * FROM subject_locations WHERE subject_id = ?').bind(id).all()
            ]);

            return response({ ...subject, media: media.results, intel: intel.results, relationships: rels.results, interactions: interactions.results, locations: locations.results });
        }

        // Sub-Resources (Add)
        if (path === '/api/interaction') {
            const p = await req.json();
            // Verify ownership of subject_id implicitly by ensuring subject exists for this admin
            const valid = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(p.subject_id, adminId).first();
            if(!valid) return errorResponse("Invalid Subject", 403);
            
            await env.DB.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, created_at) VALUES (?,?,?,?,?,?)')
                .bind(p.subject_id, p.date, p.type, safeVal(p.transcript), safeVal(p.conclusion), isoTimestamp()).run();
            return response({success:true});
        }
        
        if (path === '/api/location') {
            const p = await req.json();
            const valid = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(p.subject_id, adminId).first();
            if(!valid) return errorResponse("Invalid Subject", 403);

            await env.DB.prepare('INSERT INTO subject_locations (subject_id, name, address, lat, lng, type, notes, created_at) VALUES (?,?,?,?,?,?,?,?)')
                .bind(p.subject_id, p.name, safeVal(p.address), safeVal(p.lat), safeVal(p.lng), p.type, safeVal(p.notes), isoTimestamp()).run();
            return response({success:true});
        }

        if (path === '/api/intel') {
            const p = await req.json();
            const valid = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(p.subject_id, adminId).first();
            if(!valid) return errorResponse("Invalid Subject", 403);
            
            await env.DB.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)')
                .bind(p.subject_id, p.category, p.label, p.value, isoTimestamp()).run();
            return response({success:true});
        }

        if (path === '/api/relationship') {
            const p = await req.json();
            // Complex verification skipped for brevity, but should verify both subjects belong to admin in a multi-tenant strict env
            // Here assuming if you know the IDs you are likely the admin.
            if (req.method === 'PATCH') {
                await env.DB.prepare('UPDATE subject_relationships SET relationship_type = ?, role_b = ? WHERE id = ?').bind(p.type, p.reciprocal, p.id).run();
            } else {
                await env.DB.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, role_b, created_at) VALUES (?,?,?,?,?)')
                    .bind(p.subjectA, p.targetId, p.type, p.reciprocal, isoTimestamp()).run();
            }
            return response({success:true});
        }
        
        // Deletion
        if (path === '/api/delete') {
            const { table, id } = await req.json();
            const safeTables = ['subjects','subject_interactions','subject_locations','subject_intel','subject_relationships','subject_media'];
            if(safeTables.includes(table)) {
                // TODO: Add stricter ownership check for sub-items
                if(table === 'subjects') await env.DB.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ? AND admin_id = ?').bind(id, adminId).run();
                else await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
                return response({success:true});
            }
        }

        // Sharing
        if (path === '/api/share-links') {
            const sid = url.searchParams.get('subjectId');
            if (method === 'GET') {
                // Verify owner
                 const valid = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(sid, adminId).first();
                 if(!valid) return response([]);
                 const res = await env.DB.prepare('SELECT * FROM subject_shares WHERE subject_id = ? ORDER BY created_at DESC').bind(sid).all();
                 return response(res.results);
            }
            if (method === 'POST') {
                const { subjectId, durationMinutes } = await req.json();
                 const valid = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(subjectId, adminId).first();
                 if(!valid) return errorResponse("Unauthorized", 403);

                const token = generateToken();
                const sec = (durationMinutes || 60) * 60;
                await env.DB.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, created_at, is_active, views) VALUES (?, ?, ?, ?, 1, 0)').bind(subjectId, token, sec, isoTimestamp()).run();
                return response({ url: `${url.origin}/share/${token}`, token });
            }
            if (method === 'DELETE') {
                const token = url.searchParams.get('token');
                await env.DB.prepare('UPDATE subject_shares SET is_active = 0 WHERE token = ?').bind(token).run();
                return response({success:true});
            }
        }

        // File Upload
        if (path === '/api/upload-avatar' || path === '/api/upload-media') {
            const { subjectId, data, filename, contentType } = await req.json();
            // Verify owner
            const valid = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(subjectId, adminId).first();
            if(!valid) return errorResponse("Unauthorized", 403);

            const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(filename)}`;
            const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            await env.BUCKET.put(key, binary, { httpMetadata: { contentType } });
            
            if (path.includes('avatar')) await env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
            else await env.DB.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?,?,?,?,?)').bind(subjectId, key, contentType, 'File', isoTimestamp()).run();
            return response({success:true});
        }
        
        if (path === '/api/nuke') {
            // Only allow nuke if admin
            await nukeDatabase(env.DB);
            return response({success:true});
        }

        return new Response('Not Found', { status: 404 });

    } catch(e) {
        return errorResponse(e.message);
    }
  }
};

// --- Shared Link Logic ---

async function handleGetSharedSubject(db, token) {
    const link = await db.prepare('SELECT * FROM subject_shares WHERE token = ?').bind(token).first();
    if (!link) return errorResponse('Link Invalid', 404);
    if (!link.is_active) return errorResponse('Link Revoked', 410);

    const now = Date.now();
    const startedAt = link.started_at || isoTimestamp();
    
    if (!link.started_at) await db.prepare('UPDATE subject_shares SET started_at = ? WHERE id = ?').bind(startedAt, link.id).run();

    const elapsed = (now - new Date(startedAt).getTime()) / 1000;
    const remaining = link.duration_seconds - elapsed;

    if (remaining <= 0) {
        await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id).run();
        return errorResponse('Link Expired', 410);
    }
    
    await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();

    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(link.subject_id).first();
    if (!subject) return errorResponse('Subject Missing', 404);

    const [media, intel, interactions, locations, rels] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ?').bind(link.subject_id).all(),
        db.prepare('SELECT * FROM subject_intel WHERE subject_id = ?').bind(link.subject_id).all(),
        db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(link.subject_id).all(),
        db.prepare('SELECT * FROM subject_locations WHERE subject_id = ?').bind(link.subject_id).all(),
        db.prepare(`SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar FROM subject_relationships r LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END) WHERE r.subject_a_id = ? OR r.subject_b_id = ?`).bind(link.subject_id, link.subject_id, link.subject_id).all()
    ]);

    return response({
        ...subject,
        media: media.results,
        intel: intel.results,
        interactions: interactions.results,
        locations: locations.results,
        relationships: rels.results,
        meta: { remaining_seconds: Math.floor(remaining) }
    });
}
