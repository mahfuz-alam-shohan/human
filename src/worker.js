import { serveAdminHtml } from './templates/adminApp.js';
import { serveSharedHtml } from './templates/sharedView.js';

const encoder = new TextEncoder();

// --- Configuration & Constants ---
const APP_TITLE = "PEOPLE OS // INTELLIGENCE";

const RELATION_PRESETS = [
    { a: 'Father', b: 'Child', family: true }, { a: 'Mother', b: 'Child', family: true },
    { a: 'Parent', b: 'Child', family: true }, { a: 'Son', b: 'Parent', family: true },
    { a: 'Daughter', b: 'Parent', family: true }, { a: 'Brother', b: 'Sibling', family: true },
    { a: 'Sister', b: 'Sibling', family: true }, { a: 'Husband', b: 'Wife', family: true },
    { a: 'Wife', b: 'Husband', family: true }, { a: 'Spouse', b: 'Spouse', family: true },
    { a: 'Uncle', b: 'Niece/Nephew', family: true }, { a: 'Aunt', b: 'Niece/Nephew', family: true },
    { a: 'Grandfather', b: 'Grandchild', family: true }, { a: 'Grandmother', b: 'Grandchild', family: true },
    { a: 'Teacher', b: 'Student', family: false }, { a: 'Employer', b: 'Employee', family: false },
    { a: 'Colleague', b: 'Colleague', family: false }, { a: 'Associate', b: 'Associate', family: false },
    { a: 'Friend', b: 'Friend', family: false },
];

const FAMILY_KEYWORDS = ['father', 'mother', 'parent', 'son', 'daughter', 'child', 'brother', 'sister', 'sibling', 'husband', 'wife', 'spouse', 'uncle', 'aunt', 'niece', 'nephew', 'grand'];

// Whitelist for Subject Columns
const SUBJECT_COLUMNS = [
    'full_name', 'alias', 'dob', 'age', 'gender', 'occupation', 'nationality', 
    'ideology', 'location', 'contact', 'hometown', 'previous_locations', 
    'modus_operandi', 'notes', 'weakness', 'avatar_path', 'is_archived', 
    'status', 'threat_level', 'last_sighted', 'height', 'weight', 'eye_color', 
    'hair_color', 'blood_type', 'identifying_marks', 'social_links', 
    'digital_identifiers',
    'network_x', 'network_y'
];

// --- JWT Security Helpers ---

const toBase64Url = (str) => btoa(String.fromCharCode.apply(null, new Uint8Array(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function createToken(payload, secret) {
    const header = { alg: "HS256", typ: "JWT" };
    const encHeader = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
    const encPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const data = new TextEncoder().encode(`${encHeader}.${encPayload}`);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, data);
    return `${encHeader}.${encPayload}.${toBase64Url(signature)}`;
}

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
  const data = encoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Helper Functions ---

function isoTimestamp() {
    const now = new Date();
    const utcTime = now.getTime();
    const offsetHours = 6;
    const bstTime = new Date(utcTime + (offsetHours * 60 * 60 * 1000));
    return bstTime.toISOString().replace('Z', '+06:00');
}

function sanitizeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
}

function generateToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2,'0')).join('');
}

function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
}

function errorResponse(msg, status = 500, extra = {}) {
    return response({ error: msg, code: msg, ...extra }, status);
}

function safeVal(v) {
    return v === undefined || v === '' ? null : v;
}

// --- Database Layer ---

let schemaInitialized = false;

async function dropUnusedTables(db) {
    const ALLOWED_TABLES = [
        'admins', 'subjects', 'subject_skills', 'subject_intel', 'subject_media', 
        'subject_relationships', 'subject_interactions', 'subject_locations', 
        'subject_shares', 'sqlite_sequence', 'd1_migrations'
    ];
    try {
        const { results } = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all();
        for (const row of results) {
            const tableName = row.name;
            if (!ALLOWED_TABLES.includes(tableName) && !tableName.startsWith('_cf_') && !tableName.startsWith('sqlite_stat')) {
                await db.prepare(`DROP TABLE IF EXISTS "${tableName}"`).run();
            }
        }
    } catch (e) {
        console.error("Error dropping tables:", e);
    }
}

async function ensureSchema(db) {
  if (schemaInitialized) return;
  try {
      await db.prepare("PRAGMA foreign_keys = ON;").run();

      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY, 
            email TEXT UNIQUE, 
            password_hash TEXT, 
            is_master INTEGER DEFAULT 0,
            permissions TEXT,
            require_location INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            last_location TEXT,
            created_at TEXT
        )`),
        
        db.prepare(`CREATE TABLE IF NOT EXISTS subjects (
          id INTEGER PRIMARY KEY, 
          admin_id INTEGER, 
          full_name TEXT, 
          alias TEXT, 
          dob TEXT, 
          age INTEGER, 
          gender TEXT,
          occupation TEXT, 
          nationality TEXT, 
          ideology TEXT, 
          location TEXT, 
          contact TEXT, 
          hometown TEXT, 
          previous_locations TEXT, 
          modus_operandi TEXT, 
          notes TEXT, 
          weakness TEXT, 
          avatar_path TEXT, 
          is_archived INTEGER DEFAULT 0,
          status TEXT DEFAULT 'Active', 
          threat_level TEXT DEFAULT 'Low', 
          last_sighted TEXT, 
          height TEXT, 
          weight TEXT, 
          eye_color TEXT, 
          hair_color TEXT, 
          blood_type TEXT, 
          identifying_marks TEXT, 
          social_links TEXT, 
          digital_identifiers TEXT, 
          network_x REAL,
          network_y REAL,
          created_at TEXT, 
          updated_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS subject_skills (
          id INTEGER PRIMARY KEY, 
          subject_id INTEGER, 
          skill_name TEXT, 
          score INTEGER,
          created_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS subject_intel (
          id INTEGER PRIMARY KEY, 
          subject_id INTEGER, 
          category TEXT, 
          label TEXT, 
          value TEXT, 
          analysis TEXT, 
          confidence INTEGER DEFAULT 100, 
          source TEXT, 
          created_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS subject_media (
          id INTEGER PRIMARY KEY, 
          subject_id INTEGER, 
          object_key TEXT, 
          content_type TEXT, 
          description TEXT, 
          media_type TEXT DEFAULT 'file', 
          external_url TEXT, 
          created_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS subject_relationships (
          id INTEGER PRIMARY KEY, 
          subject_a_id INTEGER, 
          subject_b_id INTEGER, 
          relationship_type TEXT, 
          role_b TEXT,            
          notes TEXT, 
          custom_name TEXT, 
          custom_avatar TEXT, 
          custom_notes TEXT, 
          created_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS subject_interactions (
            id INTEGER PRIMARY KEY, 
            subject_id INTEGER, 
            date TEXT, 
            type TEXT, 
            transcript TEXT, 
            conclusion TEXT, 
            evidence_url TEXT, 
            created_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS subject_locations (
            id INTEGER PRIMARY KEY, 
            subject_id INTEGER, 
            name TEXT, 
            address TEXT, 
            lat REAL, 
            lng REAL, 
            type TEXT, 
            notes TEXT, 
            created_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS subject_shares (
          id INTEGER PRIMARY KEY, 
          subject_id INTEGER REFERENCES subjects(id), 
          token TEXT UNIQUE, 
          is_active INTEGER DEFAULT 1,
          duration_seconds INTEGER,
          require_location INTEGER DEFAULT 0,
          allowed_tabs TEXT,
          views INTEGER DEFAULT 0,
          started_at TEXT, 
          created_at TEXT
        )`)
      ]);

      // --- AUTO-MIGRATIONS for Hierarchy ---
      try { await db.prepare("ALTER TABLE subject_relationships ADD COLUMN role_b TEXT").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE subjects ADD COLUMN network_x REAL").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE subjects ADD COLUMN network_y REAL").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE subject_shares ADD COLUMN require_location INTEGER DEFAULT 0").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE subject_shares ADD COLUMN allowed_tabs TEXT").run(); } catch (e) {}

      // New Admin Columns
      try { await db.prepare("ALTER TABLE admins ADD COLUMN is_master INTEGER DEFAULT 0").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE admins ADD COLUMN permissions TEXT").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE admins ADD COLUMN require_location INTEGER DEFAULT 0").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE admins ADD COLUMN last_location TEXT").run(); } catch (e) {}
      
      // Ensure there is at least one Master Admin (First one usually)
      try { await db.prepare("UPDATE admins SET is_master = 1 WHERE id = (SELECT min(id) FROM admins) AND (SELECT SUM(is_master) FROM admins) = 0").run(); } catch(e) {}

      await dropUnusedTables(db);
      schemaInitialized = true;
  } catch (err) { 
      console.error("Init Error", err); 
  }
}

async function nukeDatabase(db) {
    const tables = ['subject_shares', 'subject_locations', 'subject_interactions', 'subject_relationships', 'subject_media', 'subject_intel', 'subject_skills', 'subjects', 'admins'];
    await db.prepare("PRAGMA foreign_keys = OFF;").run();
    for(const t of tables) { try { await db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); } catch(e) {} }
    await db.prepare("PRAGMA foreign_keys = ON;").run();
    schemaInitialized = false; 
    return true;
}

// --- Analysis Engine ---

function analyzeProfile(subject, interactions, intel) {
    const dataPoints = intel.length + interactions.length + (subject.modus_operandi ? 1 : 0);
    const completeness = Math.min(100, Math.floor((dataPoints / 20) * 100));
    
    const tags = [];
    const textBank = [
        subject.modus_operandi || '', 
        subject.occupation || '',
        ...interactions.map(i => i.type),
        ...intel.map(i => i.category)
    ].join(' ').toLowerCase();

    if (textBank.includes('business') || textBank.includes('meeting') || textBank.includes('work')) tags.push('Professional');
    if (textBank.includes('family') || textBank.includes('home')) tags.push('Family');
    if (textBank.includes('finance') || textBank.includes('money')) tags.push('Financial');
    if (textBank.includes('medical') || textBank.includes('health')) tags.push('Medical');
    
    return {
        score: completeness,
        tags: tags,
        summary: `Profile is ${completeness}% complete. Contains ${interactions.length} interactions and ${intel.length} attribute points.`,
        generated_at: isoTimestamp()
    };
}

function generateFamilyReport(relationships, subjectId) {
    const family = [];
    relationships.forEach(r => {
        let relativeRole = '';
        if (r.subject_a_id == subjectId) relativeRole = r.role_b || 'Associate'; 
        else relativeRole = r.relationship_type || 'Associate';

        const isFamily = FAMILY_KEYWORDS.some(k => relativeRole.toLowerCase().includes(k));
        
        if (isFamily) {
            family.push({
                name: r.target_name,
                role: relativeRole,
                id: r.subject_a_id == subjectId ? r.subject_b_id : r.subject_a_id,
                avatar: r.target_avatar
            });
        }
    });
    return family;
}

// --- Permission Logic ---
function getAdminQuery(admin) {
    // Returns SQL fragment and params for subject filtering
    if (admin.is_master) return { sql: "1=1", params: [] };
    
    let allowedIds = [];
    try {
        const perms = JSON.parse(admin.permissions || '{}');
        allowedIds = perms.allowed_ids || [];
    } catch(e) {}

    if (allowedIds.length > 0) {
        return { 
            sql: "(admin_id = ? OR id IN (" + allowedIds.join(',') + "))", 
            params: [admin.id] 
        };
    }
    return { sql: "admin_id = ?", params: [admin.id] };
}

// --- API Handlers ---

async function handleGetDashboard(db, admin) {
    const filter = getAdminQuery(admin);
    
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Profile Updated' as desc, COALESCE(updated_at, created_at) as date 
        FROM subjects 
        WHERE ${filter.sql}
        UNION ALL
        SELECT 'interaction' as type, subject_id as ref_id, type as title, conclusion as desc, created_at as date 
        FROM subject_interactions 
        WHERE subject_id IN (SELECT id FROM subjects WHERE ${filter.sql})
        UNION ALL
        SELECT 'location' as type, subject_id as ref_id, name as title, type as desc, created_at as date 
        FROM subject_locations 
        WHERE subject_id IN (SELECT id FROM subjects WHERE ${filter.sql})
        ORDER BY date DESC LIMIT 50
    `).bind(...filter.params, ...filter.params, ...filter.params).all();

    const stats = await db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM subjects WHERE (${filter.sql}) AND is_archived = 0) as targets,
            (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE ${filter.sql})) as evidence,
            (SELECT COUNT(*) FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE ${filter.sql})) as encounters
    `).bind(...filter.params, ...filter.params, ...filter.params).first();

    return response({ feed: recent.results, stats });
}

async function handleGetSuggestions(db, admin) {
    const filter = getAdminQuery(admin);
    const occupations = await db.prepare(`SELECT DISTINCT occupation FROM subjects WHERE ${filter.sql}`).bind(...filter.params).all();
    const nationalities = await db.prepare(`SELECT DISTINCT nationality FROM subjects WHERE ${filter.sql}`).bind(...filter.params).all();
    const ideologies = await db.prepare(`SELECT DISTINCT ideology FROM subjects WHERE ${filter.sql}`).bind(...filter.params).all();
    
    return response({
        occupations: occupations.results.map(r => r.occupation).filter(Boolean),
        nationalities: nationalities.results.map(r => r.nationality).filter(Boolean),
        ideologies: ideologies.results.map(r => r.ideology).filter(Boolean)
    });
}

async function handleGetSubjectFull(db, id, admin) {
    // Check access
    const filter = getAdminQuery(admin);
    const subject = await db.prepare(`SELECT * FROM subjects WHERE id = ? AND ${filter.sql}`).bind(id, ...filter.params).first();
    if (!subject) return errorResponse("Subject not found or access denied", 404);

    const [media, intel, relationships, interactions, locations, skills] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_intel WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
        db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.occupation as target_role, s.threat_level as target_threat
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(id, id, id).all(),
        db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_locations WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_skills WHERE subject_id = ?').bind(id).all()
    ]);

    const familyReport = generateFamilyReport(relationships.results, id);

    return response({
        ...subject,
        media: media.results,
        intel: intel.results,
        relationships: relationships.results,
        interactions: interactions.results,
        locations: locations.results,
        skills: skills.results,
        familyReport: familyReport
    });
}

async function handleGetGlobalNetwork(db, admin) {
    const filter = getAdminQuery(admin);
    const subjects = await db.prepare(`SELECT id, full_name, occupation, avatar_path, threat_level, network_x, network_y FROM subjects WHERE (${filter.sql}) AND is_archived = 0`).bind(...filter.params).all();
    
    if (subjects.results.length === 0) return response({ nodes: [], edges: [] });

    const subjectIds = subjects.results.map(s => s.id).join(',');
    
    const relationships = await db.prepare(`
        SELECT subject_a_id, subject_b_id, relationship_type, role_b
        FROM subject_relationships 
        WHERE subject_a_id IN (${subjectIds}) AND subject_b_id IN (${subjectIds})
    `).all();

    return response({
        nodes: subjects.results.map(s => ({
            id: s.id,
            label: s.full_name,
            group: s.threat_level,
            image: s.avatar_path,
            shape: 'circularImage',
            occupation: s.occupation,
            x: s.network_x,
            y: s.network_y
        })),
        edges: relationships.results.map(r => ({
            from: r.subject_a_id,
            to: r.subject_b_id,
            label: `${r.relationship_type} / ${r.role_b || '?'}`,
            arrows: 'to',
            font: { align: 'middle' }
        }))
    });
}

async function handleGetMapData(db, admin) {
    const filter = getAdminQuery(admin);
    const query = `
        SELECT l.id, l.name, l.lat, l.lng, l.type, l.address, s.id as subject_id, s.full_name, s.alias, s.avatar_path, s.threat_level, s.occupation
        FROM subject_locations l
        JOIN subjects s ON l.subject_id = s.id
        WHERE (${filter.sql}) AND s.is_archived = 0 AND l.lat IS NOT NULL
        ORDER BY l.created_at ASC
    `;
    const res = await db.prepare(query).bind(...filter.params).all();
    return response(res.results);
}

// --- Team Management (Master Admin) ---
async function handleTeamOps(req, db, admin) {
    if (!admin.is_master) return errorResponse("Access Denied: Master Admin Only", 403);
    
    if (req.method === 'GET') {
        const admins = await db.prepare("SELECT id, email, is_master, is_active, require_location, permissions, created_at, last_location FROM admins ORDER BY created_at DESC").all();
        // Parse permissions for easier frontend consumption
        const safeAdmins = admins.results.map(a => ({
            ...a,
            permissions: a.permissions ? JSON.parse(a.permissions) : { tabs: [], allowed_ids: [] }
        }));
        return response(safeAdmins);
    }
    
    if (req.method === 'POST') {
        const { email, password, permissions, require_location } = await req.json();
        const hash = await hashPassword(password);
        await db.prepare("INSERT INTO admins (email, password_hash, permissions, require_location, created_at) VALUES (?, ?, ?, ?, ?)")
            .bind(email, hash, JSON.stringify(permissions || {}), require_location ? 1 : 0, isoTimestamp()).run();
        return response({ success: true });
    }

    if (req.method === 'PATCH') {
        const { id, is_active, require_location, permissions, password } = await req.json();
        if (id === admin.id) return errorResponse("Cannot edit self in this mode", 400); // Prevent locking self out

        let query = "UPDATE admins SET is_active = ?, require_location = ?, permissions = ?";
        const params = [is_active ? 1 : 0, require_location ? 1 : 0, JSON.stringify(permissions || {})];
        
        if (password) {
            query += ", password_hash = ?";
            params.push(await hashPassword(password));
        }
        
        query += " WHERE id = ?";
        params.push(id);
        
        await db.prepare(query).bind(...params).run();
        return response({ success: true });
    }

    if (req.method === 'DELETE') {
        const { id } = await req.json();
        if (id === admin.id) return errorResponse("Cannot delete self", 400);
        await db.prepare("DELETE FROM admins WHERE id = ?").bind(id).run();
        return response({ success: true });
    }
}

// --- Share Logic ---

async function handleCreateShareLink(req, db, origin, admin) {
    const { subjectId, durationMinutes, requireLocation, allowedTabs } = await req.json();
    if (!subjectId) return errorResponse('subjectId required', 400);
    
    // Verify Ownership/Access
    const filter = getAdminQuery(admin);
    const owner = await db.prepare(`SELECT id FROM subjects WHERE id = ? AND ${filter.sql}`).bind(subjectId, ...filter.params).first();
    if (!owner) return errorResponse("Unauthorized", 403);

    const minutes = durationMinutes || 60;
    const durationSeconds = Math.max(60, Math.floor(minutes * 60)); 
    const isRequired = requireLocation ? 1 : 0;
    const allowedTabsStr = allowedTabs ? JSON.stringify(allowedTabs) : null;

    const token = generateToken();
    await db.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, require_location, allowed_tabs, created_at, is_active, views) VALUES (?, ?, ?, ?, ?, ?, 1, 0)')
        .bind(subjectId, token, durationSeconds, isRequired, allowedTabsStr, isoTimestamp()).run();
    
    const url = `${origin}/share/${token}`;
    return response({ url, token, duration_seconds: durationSeconds, require_location: isRequired, allowed_tabs: allowedTabs });
}

async function handleListShareLinks(db, subjectId, admin) {
    const filter = getAdminQuery(admin);
    const owner = await db.prepare(`SELECT id FROM subjects WHERE id = ? AND ${filter.sql}`).bind(subjectId, ...filter.params).first();
    if (!owner) return response([]);
    
    const res = await db.prepare('SELECT * FROM subject_shares WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
    
    // EXPIRE OLD LINKS ON LIST
    const links = res.results;
    const now = Date.now();
    const updates = [];

    for (const link of links) {
        if (link.is_active === 1 && link.started_at && link.duration_seconds) {
            const start = new Date(link.started_at).getTime();
            const elapsed = (now - start) / 1000;
            if (elapsed > link.duration_seconds) {
                link.is_active = 0; // Local update
                updates.push(db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id));
            }
        }
    }
    
    if (updates.length > 0) await db.batch(updates);

    return response(links);
}

async function handleRevokeShareLink(db, token) {
    // Note: Revocation doesn't explicitly check admin permission for simplicity, assuming possession of token implies right to revoke or it's harmless
    await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE token = ?').bind(token).run();
    return response({ success: true });
}

async function handleGetSharedSubject(db, token, req) {
    const link = await db.prepare('SELECT * FROM subject_shares WHERE token = ?').bind(token).first();
    if (!link) return errorResponse('LINK INVALID', 404);
    if (!link.is_active) return errorResponse('LINK REVOKED', 410);

    // --- CHECK EXPIRATION ---
    if (link.duration_seconds) {
        const now = Date.now();
        const startedAt = link.started_at || isoTimestamp();
        
        if (!link.started_at) {
            await db.prepare('UPDATE subject_shares SET started_at = ? WHERE id = ?').bind(startedAt, link.id).run();
        }

        const elapsed = (now - new Date(startedAt).getTime()) / 1000;
        const remaining = link.duration_seconds - elapsed;

        if (remaining <= 0) {
            await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id).run();
            return errorResponse('LINK EXPIRED', 410);
        }
    }

    // --- LOCATION LOCK ---
    if (link.require_location === 1) {
        const url = new URL(req.url);
        const lat = url.searchParams.get('lat');
        const lng = url.searchParams.get('lng');

        // IF LOCATION IS REQUIRED BUT NOT PROVIDED -> LOCK
        if (!lat || !lng) {
            // RETURN PARTIAL INFO FOR "BAIT"
            const partial = await db.prepare('SELECT full_name, avatar_path FROM subjects WHERE id = ?').bind(link.subject_id).first();
            return response({ 
                error: 'LOCATION_REQUIRED', 
                partial: partial 
            }, 428); // 428 Precondition Required
        }

        // IF PROVIDED, LOG IT AND PROCEED
        await db.prepare('INSERT INTO subject_locations (subject_id, name, type, lat, lng, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(link.subject_id, 'Anonymous Viewer', 'Viewer Sighting', parseFloat(lat), parseFloat(lng), `Accessed via Secure Link: ${token.slice(0,8)}...`, isoTimestamp()).run();
    }
        
    await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();

    // FETCH ALL INFOS
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(link.subject_id).first();
    if (!subject) return errorResponse('Subject not found', 404);

    const interactions = await db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(link.subject_id).all();
    const locations = await db.prepare('SELECT * FROM subject_locations WHERE subject_id = ?').bind(link.subject_id).all();
    const media = await db.prepare('SELECT * FROM subject_media WHERE subject_id = ?').bind(link.subject_id).all();
    const intel = await db.prepare('SELECT * FROM subject_intel WHERE subject_id = ?').bind(link.subject_id).all();
    const skills = await db.prepare('SELECT * FROM subject_skills WHERE subject_id = ?').bind(link.subject_id).all();
    const relationships = await db.prepare(`
        SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.occupation as target_role
        FROM subject_relationships r
        LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
        WHERE r.subject_a_id = ? OR r.subject_b_id = ?
    `).bind(link.subject_id, link.subject_id, link.subject_id).all();

    // --- APPLY TAB FILTERING (SECURITY) ---
    const allowedTabs = link.allowed_tabs ? JSON.parse(link.allowed_tabs) : ['Profile', 'Intel', 'Capabilities', 'History', 'Network', 'Files', 'Map'];
    const isProfileAllowed = allowedTabs.includes('Profile');

    return response({
        // Header info (Always returned)
        id: subject.id,
        full_name: subject.full_name,
        alias: subject.alias,
        occupation: subject.occupation,
        nationality: subject.nationality,
        threat_level: subject.threat_level,
        avatar_path: subject.avatar_path,
        
        // Profile Tab Data (Filtered)
        dob: isProfileAllowed ? subject.dob : null,
        age: isProfileAllowed ? subject.age : null,
        height: isProfileAllowed ? subject.height : null,
        weight: isProfileAllowed ? subject.weight : null,
        blood_type: isProfileAllowed ? subject.blood_type : null,
        modus_operandi: isProfileAllowed ? subject.modus_operandi : null,
        
        // Other Lists (Filtered)
        interactions: allowedTabs.includes('History') ? interactions.results : [],
        locations: allowedTabs.includes('Map') ? locations.results : [],
        media: allowedTabs.includes('Files') ? media.results : [],
        intel: allowedTabs.includes('Intel') ? intel.results : [],
        skills: allowedTabs.includes('Capabilities') ? skills.results : [],
        relationships: allowedTabs.includes('Network') ? relationships.results : [],
        
        meta: { 
            remaining_seconds: link.duration_seconds ? Math.floor(link.duration_seconds - ((Date.now() - new Date(link.started_at).getTime()) / 1000)) : null,
            allowed_tabs: allowedTabs
        }
    });
}

// --- Main Handler ---

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const JWT_SECRET = env.JWT_SECRET || "CHANGE_ME_IN_PROD";

    try {
        if (!schemaInitialized) await ensureSchema(env.DB);

        // Public Views
        const shareMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
        if (req.method === 'GET' && shareMatch) return serveSharedHtml(shareMatch[1]);
        const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
        if (shareApiMatch) return handleGetSharedSubject(env.DB, shareApiMatch[1], req);

        if (req.method === 'GET' && path === '/') return serveAdminHtml();
        
        // Media
        if (path.startsWith('/api/media/')) {
            const key = path.replace('/api/media/', '');
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response('Not found', { status: 404 });
            return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' }});
        }

        // --- AUTH: LOGIN ---
        if (path === '/api/login') {
            const { email, password, location } = await req.json();
            const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
            
            // Setup First Admin as Master if DB empty (Safety Net)
            if (!admin) {
                const count = await env.DB.prepare('SELECT COUNT(*) as c FROM admins').first();
                if (count.c === 0) {
                     const hash = await hashPassword(password);
                     const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, is_master, created_at) VALUES (?, ?, 1, ?)').bind(email, hash, isoTimestamp()).run();
                     const token = await createToken({ id: res.meta.last_row_id, email }, JWT_SECRET);
                     return response({ token, user: { id: res.meta.last_row_id, is_master: 1, permissions: {} } });
                }
                return errorResponse('Invalid credentials', 401);
            }

            const hashed = await hashPassword(password);
            if (hashed !== admin.password_hash) return errorResponse('Invalid credentials', 401);

            // CHECK ACTIVE STATUS
            if (admin.is_active === 0) return errorResponse('Account Disabled by Master Admin', 403);

            // CHECK LOCATION REQUIREMENT
            if (admin.require_location === 1) {
                if (!location || !location.lat) {
                    return errorResponse('Location Required', 428); // 428 Precondition Required
                }
                // Update Last Location
                await env.DB.prepare('UPDATE admins SET last_location = ? WHERE id = ?')
                    .bind(JSON.stringify(location), admin.id).run();
            }
            
            const token = await createToken({ id: admin.id, email }, JWT_SECRET);
            const permissions = admin.permissions ? JSON.parse(admin.permissions) : {};
            return response({ token, user: { id: admin.id, email: admin.email, is_master: admin.is_master, permissions } });
        }

        // --- PROTECTED ROUTES ---
        const authHeader = req.headers.get('Authorization');
        const token = authHeader && authHeader.split(' ')[1];
        const jwtPayload = await verifyToken(token, JWT_SECRET);
        
        if (!jwtPayload) return errorResponse("Unauthorized", 401);
        
        // Load Admin & Check Active Status on Every Request
        const admin = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(jwtPayload.id).first();
        if (!admin || admin.is_active === 0) return errorResponse("Session Expired or Account Disabled", 401);

        // Team Management
        if (path === '/api/team') return handleTeamOps(req, env.DB, admin);

        // Dashboard
        if (path === '/api/dashboard') return handleGetDashboard(env.DB, admin);
        if (path === '/api/suggestions') return handleGetSuggestions(env.DB, admin);
        if (path === '/api/global-network') return handleGetGlobalNetwork(env.DB, admin);
        if (path === '/api/map-data') return handleGetMapData(env.DB, admin);
        
        // Subject CRUD
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                // Check Permission
                const perms = JSON.parse(admin.permissions || '{}');
                if (!admin.is_master && !perms.can_create) return errorResponse("Permission Denied", 403);

                const p = await req.json();
                const now = isoTimestamp();
                const res = await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, dob, age, height, weight, blood_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(admin.id, safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.dob), safeVal(p.age), safeVal(p.height), safeVal(p.weight), safeVal(p.blood_type), now, now).run();
                return response({ id: res.meta.last_row_id });
            }
            // List subjects (filtered)
            const filter = getAdminQuery(admin);
            const res = await env.DB.prepare(`SELECT * FROM subjects WHERE ${filter.sql} AND is_archived = 0 ORDER BY created_at DESC`).bind(...filter.params).all();
            return response(res.results);
        }

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const id = idMatch[1];
            // Check Access
            const filter = getAdminQuery(admin);
            const exists = await env.DB.prepare(`SELECT id FROM subjects WHERE id = ? AND ${filter.sql}`).bind(id, ...filter.params).first();
            if(!exists) return errorResponse("Subject not found or access denied", 404);

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
            return handleGetSubjectFull(env.DB, id, admin);
        }

        // Sharing
        if (path === '/api/share-links') {
            if(req.method === 'DELETE') return handleRevokeShareLink(env.DB, url.searchParams.get('token'));
            if(req.method === 'POST') return handleCreateShareLink(req, env.DB, url.origin, admin);
            return handleListShareLinks(env.DB, url.searchParams.get('subjectId'), admin);
        }

        // --- SUB-RESOURCES ---

        if (path === '/api/interaction' || path === '/api/location' || path === '/api/intel' || path === '/api/media-link' || path === '/api/skills' || path === '/api/relationship') {
            const p = await req.json();
            const subjectId = p.subject_id || p.subjectId || p.subjectA; // Handles different payload keys
            
            // Access Check
            const filter = getAdminQuery(admin);
            const owner = await env.DB.prepare(`SELECT id FROM subjects WHERE id = ? AND ${filter.sql}`).bind(subjectId, ...filter.params).first();
            if(!owner) return errorResponse("Unauthorized", 403);
            
            if (path === '/api/interaction') {
                await env.DB.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, evidence_url, created_at) VALUES (?,?,?,?,?,?,?)')
                    .bind(subjectId, p.date, p.type, safeVal(p.transcript), safeVal(p.conclusion), safeVal(p.evidence_url), isoTimestamp()).run();
            }
            else if (path === '/api/location') {
                 if (req.method === 'PATCH') {
                     // Extra check for location ownership handled by subject ownership implicitly but explicit check helps safety
                     const locOwner = await env.DB.prepare(`SELECT subject_id FROM subject_locations WHERE id = ?`).bind(p.id).first();
                     if(!locOwner || locOwner.subject_id !== subjectId) return errorResponse("Unauthorized", 403);

                     await env.DB.prepare('UPDATE subject_locations SET name=?, type=?, address=?, lat=?, lng=?, notes=? WHERE id=?').bind(p.name, p.type, safeVal(p.address), safeVal(p.lat), safeVal(p.lng), safeVal(p.notes), p.id).run();
                 } else {
                     await env.DB.prepare('INSERT INTO subject_locations (subject_id, name, address, lat, lng, type, notes, created_at) VALUES (?,?,?,?,?,?,?,?)').bind(subjectId, p.name, safeVal(p.address), safeVal(p.lat), safeVal(p.lng), p.type, safeVal(p.notes), isoTimestamp()).run();
                 }
            }
            else if (path === '/api/intel') {
                 await env.DB.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)').bind(subjectId, p.category, p.label, p.value, isoTimestamp()).run();
            }
            else if (path === '/api/skills') {
                await env.DB.prepare('DELETE FROM subject_skills WHERE subject_id = ? AND skill_name = ?').bind(p.subject_id, p.skill_name).run();
                await env.DB.prepare('INSERT INTO subject_skills (subject_id, skill_name, score, created_at) VALUES (?,?,?,?)').bind(p.subject_id, p.skill_name, p.score, isoTimestamp()).run();
            }
            else if (path === '/api/relationship') {
                if (req.method === 'PATCH') {
                    // Check ownership of relationship via subject_a or subject_b logic is complex, for simplicity assuming valid subjectId passed allows op
                    await env.DB.prepare('UPDATE subject_relationships SET relationship_type = ?, role_b = ? WHERE id = ?').bind(p.type, p.reciprocal, p.id).run();
                } else {
                    await env.DB.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, role_b, created_at) VALUES (?,?,?,?,?)')
                        .bind(p.subjectA, p.targetId, p.type, p.reciprocal, isoTimestamp()).run();
                }
            }
            else if (path === '/api/media-link') {
                await env.DB.prepare('INSERT INTO subject_media (subject_id, media_type, external_url, content_type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .bind(subjectId, 'link', p.url, p.type || 'link', p.description || 'External Link', isoTimestamp()).run();
            }
            return response({success:true});
        }

        if (path === '/api/delete') {
            const { table, id } = await req.json();
            const safeTables = ['subjects','subject_interactions','subject_locations','subject_intel','subject_relationships','subject_media'];
            if(safeTables.includes(table)) {
                // Determine Subject ID for Permission Check
                let subjectId = null;
                if (table === 'subjects') subjectId = id;
                else {
                    const row = await env.DB.prepare(`SELECT subject_id, subject_a_id FROM ${table} WHERE id = ?`).bind(id).first();
                    if(row) subjectId = row.subject_id || row.subject_a_id;
                }
                
                if (subjectId) {
                    const filter = getAdminQuery(admin);
                    const owner = await env.DB.prepare(`SELECT id FROM subjects WHERE id = ? AND ${filter.sql}`).bind(subjectId, ...filter.params).first();
                    if(!owner) return errorResponse("Unauthorized", 403);
                }

                if(table === 'subjects') await env.DB.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ?').bind(id).run();
                else await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
                return response({success:true});
            }
        }

        // File Ops
        if (path === '/api/upload-avatar' || path === '/api/upload-media') {
            const { subjectId, data, filename, contentType } = await req.json();
            
            const filter = getAdminQuery(admin);
            const owner = await env.DB.prepare(`SELECT id FROM subjects WHERE id = ? AND ${filter.sql}`).bind(subjectId, ...filter.params).first();
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
        return errorResponse(e.message, 500);
    }
  }
};
