import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
// Removed unused import: import { serveStatic } from 'hono/cloudflare-workers';
import { serveAdminHtml } from './templates/adminApp.js';
import { serveSharedHtml } from './templates/sharedView.js';

const app = new Hono();

// --- Middleware ---
app.use('/*', cors());

// Auth Middleware with Admin Context
app.use('/api/*', async (c, next) => {
  // Public routes
  if (c.req.path === '/api/login' || c.req.path.startsWith('/api/share-links') || c.req.path.startsWith('/api/media/')) {
    return next();
  }

  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const decoded = await verify(token, c.env.JWT_SECRET);
    c.set('user', decoded);
    
    // Fetch latest permissions from DB to ensure real-time access control
    if (decoded.id !== 'root') {
        const admin = await c.env.DB.prepare('SELECT permissions, role FROM admins WHERE id = ?').bind(decoded.id).first();
        if (!admin) return c.json({ error: 'Account revoked' }, 401);
        c.set('permissions', JSON.parse(admin.permissions || '{}'));
    } else {
        // Root always has full access
        c.set('permissions', { all: true }); 
    }
    
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid Token' }, 401);
  }
});

// --- Initialize DB (Run once or via /api/nuke) ---
async function initDB(db) {
  // Original Tables
  await db.prepare(`CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, full_name TEXT, alias TEXT, occupation TEXT, nationality TEXT, dob TEXT, age INTEGER, height TEXT, weight TEXT, blood_type TEXT, eye_color TEXT, hair_color TEXT, scars TEXT, threat_level TEXT, status TEXT, ideology TEXT, modus_operandi TEXT, weakness TEXT, avatar_path TEXT, network_x INTEGER, network_y INTEGER, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, date TEXT, type TEXT, location TEXT, participants TEXT, transcript TEXT, conclusion TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS intel (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, category TEXT, label TEXT, value TEXT, reliability TEXT, source TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, name TEXT, address TEXT, lat REAL, lng REAL, type TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_a_id TEXT, subject_b_id TEXT, relationship_type TEXT, role_b TEXT, reciprocal_type TEXT, notes TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS share_links (token TEXT PRIMARY KEY, subject_id TEXT, created_at INTEGER, expires_at INTEGER, is_active INTEGER, views INTEGER, require_location INTEGER, allowed_tabs TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, object_key TEXT, filename TEXT, content_type TEXT, size INTEGER, uploaded_at INTEGER, description TEXT, media_type TEXT, external_url TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS skills (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, skill_name TEXT, score INTEGER, created_at INTEGER)`).run();

  // --- NEW: Admin & Logs Tables ---
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY, 
      email TEXT UNIQUE, 
      password TEXT, 
      role TEXT, 
      permissions TEXT, 
      created_at INTEGER
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      admin_id TEXT, 
      admin_email TEXT,
      action TEXT, 
      ip TEXT, 
      lat REAL, 
      lng REAL, 
      timestamp INTEGER
    )
  `).run();
}

// --- API Routes ---

// 1. AUTHENTICATION (Updated for Multi-Admin & Location)
app.post('/api/login', async (c) => {
  const { email, password, lat, lng } = await c.req.json();

  // MANDATORY LOCATION CHECK
  if (!lat || !lng) {
      return c.json({ error: 'Location coordinates are MANDATORY for secure login. Please enable GPS.' }, 403);
  }

  let admin = null;
  let isRoot = false;

  // Check Root (Env)
  if (email === c.env.ADMIN_EMAIL && password === c.env.ADMIN_PASSWORD) {
    admin = { id: 'root', email, role: 'super_admin', permissions: JSON.stringify({ all: true }) };
    isRoot = true;
  } else {
    // Check DB
    const res = await c.env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
    // Note: In production, use bcrypt. Here we compare plaintext for simplicity/compatibility.
    if (res && res.password === password) {
        admin = res;
    }
  }

  if (!admin) return c.json({ error: 'Invalid credentials' }, 401);

  // LOG LOGIN LOCATION
  try {
      await c.env.DB.prepare(`INSERT INTO admin_logs (admin_id, admin_email, action, ip, lat, lng, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(admin.id, admin.email, 'LOGIN', c.req.header('CF-Connecting-IP') || 'unknown', lat, lng, Date.now()).run();
  } catch(e) { console.error("Logging failed", e); }

  const token = await sign({ id: admin.id, email: admin.email, role: admin.role }, c.env.JWT_SECRET);
  
  return c.json({ 
      token, 
      user: { 
          id: admin.id, 
          email: admin.email, 
          role: admin.role,
          permissions: JSON.parse(admin.permissions || '{}')
      } 
  });
});

// --- ADMIN MANAGEMENT ROUTES ---

// Create New Admin
app.post('/api/admins', async (c) => {
    const user = c.get('user');
    const perms = c.get('permissions');

    // Only Root or Super Admins can create users
    if (user.id !== 'root' && !perms.can_manage_admins) return c.json({ error: 'Permission denied' }, 403);

    const { email, password, role, permissions } = await c.req.json();
    const id = crypto.randomUUID();

    try {
        await c.env.DB.prepare('INSERT INTO admins (id, email, password, role, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(id, email, password, role || 'agent', JSON.stringify(permissions || {}), Date.now())
            .run();
        return c.json({ success: true, id });
    } catch(e) {
        return c.json({ error: 'Email already exists or DB error' }, 400);
    }
});

// List Admins
app.get('/api/admins', async (c) => {
    const user = c.get('user');
    const perms = c.get('permissions');
    if (user.id !== 'root' && !perms.can_manage_admins) return c.json({ error: 'Permission denied' }, 403);

    const list = await c.env.DB.prepare('SELECT id, email, role, permissions, created_at FROM admins').all();
    return c.json(list.results);
});

// Delete Admin
app.post('/api/admins/delete', async (c) => {
    const user = c.get('user');
    const perms = c.get('permissions');
    if (user.id !== 'root' && !perms.can_manage_admins) return c.json({ error: 'Permission denied' }, 403);

    const { id } = await c.req.json();
    if (id === 'root') return c.json({ error: "Cannot delete root" }, 400);

    await c.env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// Update Admin Permissions
app.patch('/api/admins/:id', async (c) => {
    const user = c.get('user');
    const perms = c.get('permissions');
    if (user.id !== 'root' && !perms.can_manage_admins) return c.json({ error: 'Permission denied' }, 403);

    const id = c.req.param('id');
    const { permissions, role, password } = await c.req.json();

    let query = 'UPDATE admins SET ';
    const params = [];
    const updates = [];

    if (permissions) { updates.push('permissions = ?'); params.push(JSON.stringify(permissions)); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (password) { updates.push('password = ?'); params.push(password); }

    if (updates.length === 0) return c.json({ success: true }); // Nothing to update

    query += updates.join(', ') + ' WHERE id = ?';
    params.push(id);

    await c.env.DB.prepare(query).bind(...params).run();
    return c.json({ success: true });
});

// View Access Logs
app.get('/api/admin-logs', async (c) => {
    const user = c.get('user');
    const perms = c.get('permissions');
    // Only Viewable by authorized admins
    if (user.id !== 'root' && !perms.can_view_logs) return c.json({ error: 'Permission denied' }, 403);

    const logs = await c.env.DB.prepare('SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT 100').all();
    return c.json(logs.results);
});


// --- SUBJECTS & DATA API (Existing functionality preserved) ---

app.get('/api/dashboard', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM subjects) as targets,
      (SELECT COUNT(*) FROM interactions) as encounters,
      (SELECT COUNT(*) FROM intel) as evidence
  `).first();

  const feed = await c.env.DB.prepare(`
    SELECT id as ref_id, full_name as title, occupation as desc, created_at as date, 'subject' as type FROM subjects
    UNION ALL
    SELECT id as ref_id, type as title, conclusion as desc, date, 'interaction' as type FROM interactions
    ORDER BY date DESC LIMIT 10
  `).all();

  return c.json({ stats, feed: feed.results });
});

app.get('/api/subjects', async (c) => {
  // TODO: Add filtering based on permissions if needed later
  const res = await c.env.DB.prepare('SELECT * FROM subjects ORDER BY created_at DESC').all();
  return c.json(res.results);
});

app.get('/api/subjects/:id', async (c) => {
  const id = c.req.param('id');
  const subject = await c.env.DB.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
  if (!subject) return c.json({ error: 'Not found' }, 404);

  const [intel, interactions, locations, rels, media, skills] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM intel WHERE subject_id = ?').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM locations WHERE subject_id = ?').bind(id).all(),
    c.env.DB.prepare(`
      SELECT r.*, s.full_name as target_name, s.avatar_path as target_avatar 
      FROM relationships r 
      LEFT JOIN subjects s ON (s.id = r.subject_a_id OR s.id = r.subject_b_id) 
      WHERE (r.subject_a_id = ? OR r.subject_b_id = ?) AND s.id != ?
    `).bind(id, id, id).all(),
    c.env.DB.prepare('SELECT * FROM media WHERE subject_id = ? ORDER BY uploaded_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM skills WHERE subject_id = ?').bind(id).all()
  ]);

  // Family Report Logic (Grandparents, Parents, Siblings, Children)
  // Re-using relationships to build a mini-tree
  const familyIds = rels.results.filter(r => 
      ['Father', 'Mother', 'Parent', 'Son', 'Daughter', 'Child', 'Brother', 'Sister', 'Sibling'].includes(r.relationship_type) ||
      ['Father', 'Mother', 'Parent', 'Son', 'Daughter', 'Child', 'Brother', 'Sister', 'Sibling'].includes(r.role_b)
  );
  
  const familyReport = familyIds.map(f => ({
      id: f.subject_a_id === id ? f.subject_b_id : f.subject_a_id,
      name: f.target_name,
      avatar: f.target_avatar,
      role: f.subject_a_id === id ? f.relationship_type : (f.role_b || f.relationship_type)
  }));

  return c.json({ 
    ...subject, 
    intel: intel.results, 
    interactions: interactions.results, 
    locations: locations.results,
    relationships: rels.results,
    media: media.results,
    skills: skills.results,
    familyReport
  });
});

app.post('/api/subjects', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO subjects (id, full_name, alias, occupation, nationality, dob, age, height, weight, blood_type, eye_color, hair_color, scars, threat_level, status, ideology, modus_operandi, weakness, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, body.full_name, body.alias, body.occupation, body.nationality, body.dob, body.age, body.height, body.weight, body.blood_type, body.eye_color, body.hair_color, body.scars, body.threat_level, body.status, body.ideology, body.modus_operandi, body.weakness, Date.now()).run();
  return c.json({ success: true, id });
});

app.patch('/api/subjects/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const keys = Object.keys(body).filter(k => k !== 'id' && k !== 'created_at');
  if (keys.length === 0) return c.json({ success: true });
  const query = `UPDATE subjects SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  await c.env.DB.prepare(query).bind(...keys.map(k => body[k]), id).run();
  return c.json({ success: true });
});

// --- INTERACTIONS, INTEL, LOCATIONS, ETC. ---

app.post('/api/interaction', async (c) => {
  const body = await c.req.json();
  await c.env.DB.prepare('INSERT INTO interactions (subject_id, date, type, transcript, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(body.subject_id, body.date, body.type, body.transcript, Date.now()).run();
  return c.json({ success: true });
});

app.post('/api/intel', async (c) => {
  const body = await c.req.json();
  await c.env.DB.prepare('INSERT INTO intel (subject_id, category, label, value, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(body.subject_id, body.category, body.label, body.value, Date.now()).run();
  return c.json({ success: true });
});

app.post('/api/location', async (c) => {
  const body = await c.req.json();
  await c.env.DB.prepare('INSERT INTO locations (subject_id, name, address, lat, lng, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(body.subject_id, body.name, body.address, body.lat, body.lng, body.type, Date.now()).run();
  return c.json({ success: true });
});

app.patch('/api/location', async (c) => {
    const body = await c.req.json();
    await c.env.DB.prepare('UPDATE locations SET name=?, address=?, lat=?, lng=?, type=? WHERE id=?')
        .bind(body.name, body.address, body.lat, body.lng, body.type, body.id).run();
    return c.json({ success: true });
});

app.post('/api/relationship', async (c) => {
    const body = await c.req.json();
    await c.env.DB.prepare('INSERT INTO relationships (subject_a_id, subject_b_id, relationship_type, role_b, reciprocal_type, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(body.subjectA, body.targetId, body.type, body.reciprocal, body.reciprocal, Date.now()).run();
    return c.json({ success: true });
});

app.patch('/api/relationship', async (c) => {
    const body = await c.req.json();
    await c.env.DB.prepare('UPDATE relationships SET relationship_type=?, role_b=?, reciprocal_type=? WHERE id=?')
        .bind(body.type, body.reciprocal, body.reciprocal, body.id).run();
    return c.json({ success: true });
});

app.post('/api/skills', async (c) => {
    const { subject_id, skill_name, score } = await c.req.json();
    // Check if exists
    const exists = await c.env.DB.prepare('SELECT id FROM skills WHERE subject_id = ? AND skill_name = ?').bind(subject_id, skill_name).first();
    if(exists) {
        await c.env.DB.prepare('UPDATE skills SET score = ? WHERE id = ?').bind(score, exists.id).run();
    } else {
        await c.env.DB.prepare('INSERT INTO skills (subject_id, skill_name, score, created_at) VALUES (?, ?, ?, ?)').bind(subject_id, skill_name, score, Date.now()).run();
    }
    return c.json({ success: true });
});

// --- MAP & NETWORK DATA ---

app.get('/api/map-data', async (c) => {
    // Get all subjects and their primary locations
    // We join locations to subjects.
    // Filter logic can be added here for permissions (e.g., restricted subjects)
    const res = await c.env.DB.prepare(`
        SELECT s.id as subject_id, s.full_name, s.avatar_path, l.lat, l.lng, l.name, l.type 
        FROM locations l 
        JOIN subjects s ON l.subject_id = s.id 
        WHERE l.lat IS NOT NULL
    `).all();
    return c.json(res.results);
});

app.get('/api/global-network', async (c) => {
    const subjects = await c.env.DB.prepare('SELECT id, full_name, occupation, avatar_path, threat_level, network_x, network_y FROM subjects').all();
    const rels = await c.env.DB.prepare('SELECT * FROM relationships').all();

    const nodes = subjects.results.map(s => ({
        id: s.id,
        label: s.full_name,
        group: s.threat_level,
        occupation: s.occupation,
        image: s.avatar_path,
        x: s.network_x,
        y: s.network_y
    }));

    const edges = rels.results.map(r => ({
        from: r.subject_a_id,
        to: r.subject_b_id,
        label: r.relationship_type
    }));

    return c.json({ nodes, edges });
});

app.post('/api/delete', async (c) => {
    const { table, id } = await c.req.json();
    const allow = ['subjects', 'interactions', 'intel', 'locations', 'relationships', 'media'];
    if(!allow.includes(table)) return c.json({error: 'Invalid table'}, 400);
    
    // Check Permissions before delete
    const perms = c.get('permissions');
    // Basic check: if you can't delete, reject. 
    // You can make this more granular (e.g. can_delete_subjects vs can_delete_intel)
    if(c.get('user').id !== 'root' && !perms.can_delete_data) return c.json({error: 'Delete permission denied'}, 403);

    await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    
    // Cleanup cascade
    if(table === 'subjects') {
        await c.env.DB.prepare('DELETE FROM interactions WHERE subject_id = ?').bind(id).run();
        await c.env.DB.prepare('DELETE FROM intel WHERE subject_id = ?').bind(id).run();
        await c.env.DB.prepare('DELETE FROM locations WHERE subject_id = ?').bind(id).run();
        await c.env.DB.prepare('DELETE FROM relationships WHERE subject_a_id = ? OR subject_b_id = ?').bind(id, id).run();
    }
    return c.json({ success: true });
});

// --- MEDIA HANDLING ---
app.post('/api/upload-avatar', async (c) => {
    const { subjectId, data, filename, contentType } = await c.req.json();
    const key = `avatars/${subjectId}-${Date.now()}-${filename}`;
    const buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    await c.env.R2.put(key, buffer, { httpMetadata: { contentType } });
    await c.env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
    return c.json({ success: true, path: key });
});

app.post('/api/upload-media', async (c) => {
    const { subjectId, data, filename, contentType } = await c.req.json();
    const key = `media/${subjectId}-${Date.now()}-${filename}`;
    const buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    await c.env.R2.put(key, buffer, { httpMetadata: { contentType } });
    
    await c.env.DB.prepare('INSERT INTO media (subject_id, object_key, filename, content_type, size, uploaded_at, media_type) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(subjectId, key, filename, contentType, buffer.length, Date.now(), 'file').run();
    
    return c.json({ success: true, path: key });
});

app.post('/api/media-link', async (c) => {
    const { subjectId, url, description, type } = await c.req.json();
    await c.env.DB.prepare('INSERT INTO media (subject_id, external_url, description, content_type, uploaded_at, media_type) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(subjectId, url, description, type, Date.now(), 'link').run();
    return c.json({ success: true });
});

app.get('/api/media/:key', async (c) => {
    const key = c.req.param('key');
    const object = await c.env.R2.get(key); // R2 bucket binding
    if (!object) return c.json({ error: 'Not found' }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    return new Response(object.body, { headers });
});

// --- SHARE LINKS & PUBLIC ACCESS ---

app.post('/api/share-links', async (c) => {
    const { subjectId, durationMinutes, requireLocation, allowedTabs } = await c.req.json();
    const token = crypto.randomUUID().replace(/-/g, '');
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    
    await c.env.DB.prepare('INSERT INTO share_links (token, subject_id, created_at, expires_at, is_active, views, require_location, allowed_tabs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(token, subjectId, Date.now(), expiresAt, 1, 0, requireLocation ? 1 : 0, JSON.stringify(allowedTabs || [])).run();
        
    return c.json({ success: true, token });
});

app.get('/api/share-links', async (c) => {
    const subjectId = c.req.query('subjectId');
    // Clean up expired
    await c.env.DB.prepare('UPDATE share_links SET is_active = 0 WHERE expires_at < ?').bind(Date.now()).run();
    
    if (subjectId) {
        const res = await c.env.DB.prepare('SELECT * FROM share_links WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
        return c.json(res.results);
    }
    return c.json([]);
});

app.delete('/api/share-links', async (c) => {
    const token = c.req.query('token');
    await c.env.DB.prepare('DELETE FROM share_links WHERE token = ?').bind(token).run();
    return c.json({ success: true });
});

app.get('/share/:token', async (c) => {
    const token = c.req.param('token');
    const link = await c.env.DB.prepare('SELECT * FROM share_links WHERE token = ? AND is_active = 1').bind(token).first();
    
    if (!link || link.expires_at < Date.now()) {
        return c.text('Link Expired or Invalid', 404);
    }
    
    // Update View Count
    await c.env.DB.prepare('UPDATE share_links SET views = views + 1 WHERE token = ?').bind(token).run();

    return serveSharedHtml(link);
});

// --- SYSTEM ---
app.get('/api/suggestions', async (c) => {
    const [occ, nat, ideo] = await Promise.all([
        c.env.DB.prepare('SELECT DISTINCT occupation FROM subjects WHERE occupation IS NOT NULL').all(),
        c.env.DB.prepare('SELECT DISTINCT nationality FROM subjects WHERE nationality IS NOT NULL').all(),
        c.env.DB.prepare('SELECT DISTINCT ideology FROM subjects WHERE ideology IS NOT NULL').all(),
    ]);
    return c.json({
        occupations: occ.results.map(r => r.occupation),
        nationalities: nat.results.map(r => r.nationality),
        ideologies: ideo.results.map(r => r.ideology)
    });
});

app.post('/api/nuke', async (c) => {
    // Factory Reset - requires Super Admin
    if (c.get('user').id !== 'root') return c.json({ error: 'Permission denied' }, 403);

    await c.env.DB.prepare('DROP TABLE IF EXISTS subjects').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS interactions').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS intel').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS locations').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS relationships').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS share_links').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS media').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS skills').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS admins').run();
    await c.env.DB.prepare('DROP TABLE IF EXISTS admin_logs').run();
    await initDB(c.env.DB);
    return c.json({ success: true });
});

// Frontend Routes
app.get('/', serveAdminHtml);
app.get('/admin', serveAdminHtml);

export default {
    fetch: app.fetch
};
