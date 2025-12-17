import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { serveAdminHtml } from './templates/adminApp.js';
import { serveSharedHtml } from './templates/sharedView.js';

const app = new Hono();

app.use('/*', cors());

// --- GLOBAL ERROR HANDLER (Prevents "Unexpected token I" errors) ---
app.onError((err, c) => {
  console.error('Server Error:', err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});

// --- 1. AUTH MIDDLEWARE ---
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/login' || c.req.path.startsWith('/api/share-links') || c.req.path.startsWith('/api/media/')) {
    return next();
  }

  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const user = await verify(token, c.env.JWT_SECRET);
    c.set('user', user);
    
    if (user.role === 'super_admin') {
        c.set('permissions', { all: true }); 
    } else {
        // Fetch permissions for sub-admin
        // We use a try/catch here in case table is missing during dev
        try {
            const admin = await c.env.DB.prepare('SELECT permissions FROM sub_admins WHERE id = ?').bind(user.id).first();
            if (!admin) return c.json({ error: 'Account Deleted' }, 401);
            c.set('permissions', JSON.parse(admin.permissions || '{}'));
        } catch(e) {
            return c.json({ error: 'System Error: DB not ready' }, 500);
        }
    }
    
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid Token' }, 401);
  }
});

// --- 2. DATABASE SETUP ---
async function initDB(db) {
  // Main Data Tables
  await db.prepare(`CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, full_name TEXT, alias TEXT, occupation TEXT, nationality TEXT, dob TEXT, age INTEGER, height TEXT, weight TEXT, blood_type TEXT, eye_color TEXT, hair_color TEXT, scars TEXT, threat_level TEXT, status TEXT, ideology TEXT, modus_operandi TEXT, weakness TEXT, avatar_path TEXT, network_x INTEGER, network_y INTEGER, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, date TEXT, type TEXT, location TEXT, participants TEXT, transcript TEXT, conclusion TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS intel (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, category TEXT, label TEXT, value TEXT, reliability TEXT, source TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, name TEXT, address TEXT, lat REAL, lng REAL, type TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_a_id TEXT, subject_b_id TEXT, relationship_type TEXT, role_b TEXT, reciprocal_type TEXT, notes TEXT, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS share_links (token TEXT PRIMARY KEY, subject_id TEXT, created_at INTEGER, expires_at INTEGER, is_active INTEGER, views INTEGER, require_location INTEGER, allowed_tabs TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, object_key TEXT, filename TEXT, content_type TEXT, size INTEGER, uploaded_at INTEGER, description TEXT, media_type TEXT, external_url TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS skills (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT, skill_name TEXT, score INTEGER, created_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS admin_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT, admin_email TEXT, action TEXT, ip TEXT, lat REAL, lng REAL, timestamp INTEGER)`).run();

  // --- SUPER ADMIN TABLE ---
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS super_admin (
      email TEXT PRIMARY KEY, 
      password TEXT
    )
  `).run();

  // Insert Default Super Admin if missing
  try {
      await db.prepare(`INSERT INTO super_admin (email, password) VALUES ('admin@human.com', 'password')`).run();
  } catch (e) {
      // Ignore unique constraint error if admin exists
  }

  // --- SUB ADMINS TABLE ---
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sub_admins (
      id TEXT PRIMARY KEY, 
      email TEXT UNIQUE, 
      password TEXT, 
      role TEXT, 
      permissions TEXT, 
      require_location INTEGER DEFAULT 1, 
      created_at INTEGER
    )
  `).run();
}

// --- 3. LOGIN ROUTE ---
app.post('/api/login', async (c) => {
  const { email, password, lat, lng } = await c.req.json();

  let user = null;
  let isSuperAdmin = false;

  // --- AUTO-INIT DB ON FIRST LOGIN ATTEMPT ---
  // We try to select. If it fails (table missing), we run initDB and retry.
  try {
      // Try fetching Super Admin
      const superRes = await c.env.DB.prepare('SELECT * FROM super_admin WHERE email = ? AND password = ?').bind(email, password).first();
      
      if (superRes) {
          user = { id: 'root', email: superRes.email, role: 'super_admin' };
          isSuperAdmin = true;
      } else {
          // If not super, try sub-admin
          // (We do this in the same try block to catch missing table error here too)
          const subRes = await c.env.DB.prepare('SELECT * FROM sub_admins WHERE email = ? AND password = ?').bind(email, password).first();
          if (subRes) user = subRes;
      }
  } catch (e) {
      // Error likely means "no such table". Let's initialize!
      console.log("Database tables missing. Initializing...");
      await initDB(c.env.DB);
      
      // Retry the check after initialization
      const superResRetry = await c.env.DB.prepare('SELECT * FROM super_admin WHERE email = ? AND password = ?').bind(email, password).first();
      if (superResRetry) {
          user = { id: 'root', email: superResRetry.email, role: 'super_admin' };
          isSuperAdmin = true;
      }
  }

  if (!user) return c.json({ error: 'Invalid credentials' }, 401);

  // CHECK LOCATION
  const isLocationRequired = !isSuperAdmin && (user.require_location === 1 || user.require_location === undefined);

  if (isLocationRequired && (!lat || !lng)) {
      return c.json({ error: 'Location Access Mandatory. Please enable GPS.' }, 403);
  }

  // LOG
  try {
      await c.env.DB.prepare(`INSERT INTO admin_logs (admin_id, admin_email, action, ip, lat, lng, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(user.id, user.email, 'LOGIN', c.req.header('CF-Connecting-IP') || '?', lat, lng, Date.now()).run();
  } catch(e) {}

  const token = await sign({ id: user.id, email: user.email, role: user.role }, c.env.JWT_SECRET);
  
  return c.json({ 
      token, 
      user: { 
          id: user.id, 
          email: user.email, 
          role: user.role, 
          permissions: isSuperAdmin ? { all: true } : JSON.parse(user.permissions || '{}') 
      } 
  });
});

// --- 4. SUPER ADMIN MANAGEMENT ---

// Update Super Admin Password
app.post('/api/super-admin/update', async (c) => {
    const user = c.get('user');
    if (user.role !== 'super_admin') return c.json({ error: 'Denied' }, 403);
    
    const { email, password } = await c.req.json();
    await c.env.DB.prepare('UPDATE super_admin SET email = ?, password = ?').bind(email, password).run();
    return c.json({ success: true });
});

// --- 5. SUB-ADMIN MANAGEMENT ---

app.post('/api/admins', async (c) => {
    if (c.get('user').role !== 'super_admin') return c.json({ error: 'Only Super Admin can add users' }, 403);

    const { email, password, role, permissions, requireLocation } = await c.req.json();
    const id = crypto.randomUUID();

    try {
        await c.env.DB.prepare('INSERT INTO sub_admins (id, email, password, role, permissions, require_location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(id, email, password, role || 'agent', JSON.stringify(permissions || {}), requireLocation ? 1 : 0, Date.now())
            .run();
        return c.json({ success: true, id });
    } catch(e) {
        return c.json({ error: 'Email exists' }, 400);
    }
});

app.get('/api/admins', async (c) => {
    if (c.get('user').role !== 'super_admin') return c.json({ error: 'Denied' }, 403);
    const list = await c.env.DB.prepare('SELECT id, email, role, permissions, require_location, created_at FROM sub_admins').all();
    return c.json(list.results);
});

app.post('/api/admins/delete', async (c) => {
    if (c.get('user').role !== 'super_admin') return c.json({ error: 'Denied' }, 403);
    const { id } = await c.req.json();
    await c.env.DB.prepare('DELETE FROM sub_admins WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

app.patch('/api/admins/:id', async (c) => {
    if (c.get('user').role !== 'super_admin') return c.json({ error: 'Denied' }, 403);
    const id = c.req.param('id');
    const { permissions, role, password, requireLocation } = await c.req.json();
    
    let query = 'UPDATE sub_admins SET ';
    const params = [];
    const updates = [];

    if (permissions) { updates.push('permissions = ?'); params.push(JSON.stringify(permissions)); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (password) { updates.push('password = ?'); params.push(password); }
    if (requireLocation !== undefined) { updates.push('require_location = ?'); params.push(requireLocation ? 1 : 0); }

    if (updates.length > 0) {
        query += updates.join(', ') + ' WHERE id = ?';
        params.push(id);
        await c.env.DB.prepare(query).bind(...params).run();
    }
    return c.json({ success: true });
});

app.get('/api/admin-logs', async (c) => {
    if (c.get('user').role !== 'super_admin') return c.json({ error: 'Denied' }, 403);
    const logs = await c.env.DB.prepare('SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT 100').all();
    return c.json(logs.results);
});

// --- 6. STANDARD API ---

app.get('/api/dashboard', async (c) => {
  // Safe check if tables exist before querying dashboard
  try {
      const stats = await c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM subjects) as targets, (SELECT COUNT(*) FROM interactions) as encounters, (SELECT COUNT(*) FROM intel) as evidence`).first();
      const feed = await c.env.DB.prepare(`SELECT id as ref_id, full_name as title, occupation as desc, created_at as date, 'subject' as type FROM subjects UNION ALL SELECT id as ref_id, type as title, conclusion as desc, date, 'interaction' as type FROM interactions ORDER BY date DESC LIMIT 10`).all();
      return c.json({ stats, feed: feed.results });
  } catch(e) {
      return c.json({ stats: { targets: 0, encounters: 0, evidence: 0 }, feed: [] });
  }
});

app.get('/api/subjects', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM subjects ORDER BY created_at DESC').all()).results));

app.get('/api/subjects/:id', async (c) => {
  const id = c.req.param('id');
  const subject = await c.env.DB.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
  if (!subject) return c.json({ error: 'Not found' }, 404);
  const [intel, interactions, locations, rels, media, skills] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM intel WHERE subject_id = ?').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM locations WHERE subject_id = ?').bind(id).all(),
    c.env.DB.prepare(`SELECT r.*, s.full_name as target_name, s.avatar_path as target_avatar FROM relationships r LEFT JOIN subjects s ON (s.id = r.subject_a_id OR s.id = r.subject_b_id) WHERE (r.subject_a_id = ? OR r.subject_b_id = ?) AND s.id != ?`).bind(id, id, id).all(),
    c.env.DB.prepare('SELECT * FROM media WHERE subject_id = ? ORDER BY uploaded_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM skills WHERE subject_id = ?').bind(id).all()
  ]);
  const familyIds = rels.results.filter(r => ['Father', 'Mother', 'Parent', 'Son', 'Daughter', 'Child', 'Brother', 'Sister', 'Sibling'].includes(r.relationship_type) || ['Father', 'Mother', 'Parent', 'Son', 'Daughter', 'Child', 'Brother', 'Sister', 'Sibling'].includes(r.role_b));
  const familyReport = familyIds.map(f => ({ id: f.subject_a_id === id ? f.subject_b_id : f.subject_a_id, name: f.target_name, avatar: f.target_avatar, role: f.subject_a_id === id ? f.relationship_type : (f.role_b || f.relationship_type) }));
  return c.json({ ...subject, intel: intel.results, interactions: interactions.results, locations: locations.results, relationships: rels.results, media: media.results, skills: skills.results, familyReport });
});

app.post('/api/subjects', async (c) => { const b = await c.req.json(); const id = crypto.randomUUID(); await c.env.DB.prepare(`INSERT INTO subjects (id, full_name, alias, occupation, nationality, dob, age, height, weight, blood_type, eye_color, hair_color, scars, threat_level, status, ideology, modus_operandi, weakness, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, b.full_name, b.alias, b.occupation, b.nationality, b.dob, b.age, b.height, b.weight, b.blood_type, b.eye_color, b.hair_color, b.scars, b.threat_level, b.status, b.ideology, b.modus_operandi, b.weakness, Date.now()).run(); return c.json({ success: true, id }); });
app.patch('/api/subjects/:id', async (c) => { const id = c.req.param('id'); const b = await c.req.json(); const k = Object.keys(b).filter(k => k !== 'id' && k !== 'created_at'); if (!k.length) return c.json({ success: true }); await c.env.DB.prepare(`UPDATE subjects SET ${k.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...k.map(x => b[x]), id).run(); return c.json({ success: true }); });

app.post('/api/interaction', async (c) => { const b = await c.req.json(); await c.env.DB.prepare('INSERT INTO interactions (subject_id, date, type, transcript, created_at) VALUES (?, ?, ?, ?, ?)').bind(b.subject_id, b.date, b.type, b.transcript, Date.now()).run(); return c.json({ success: true }); });
app.post('/api/intel', async (c) => { const b = await c.req.json(); await c.env.DB.prepare('INSERT INTO intel (subject_id, category, label, value, created_at) VALUES (?, ?, ?, ?, ?)').bind(b.subject_id, b.category, b.label, b.value, Date.now()).run(); return c.json({ success: true }); });
app.post('/api/location', async (c) => { const b = await c.req.json(); await c.env.DB.prepare('INSERT INTO locations (subject_id, name, address, lat, lng, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(b.subject_id, b.name, b.address, b.lat, b.lng, b.type, Date.now()).run(); return c.json({ success: true }); });
app.patch('/api/location', async (c) => { const b = await c.req.json(); await c.env.DB.prepare('UPDATE locations SET name=?, address=?, lat=?, lng=?, type=? WHERE id=?').bind(b.name, b.address, b.lat, b.lng, b.type, b.id).run(); return c.json({ success: true }); });
app.post('/api/relationship', async (c) => { const b = await c.req.json(); await c.env.DB.prepare('INSERT INTO relationships (subject_a_id, subject_b_id, relationship_type, role_b, reciprocal_type, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(b.subjectA, b.targetId, b.type, b.reciprocal, b.reciprocal, Date.now()).run(); return c.json({ success: true }); });
app.patch('/api/relationship', async (c) => { const b = await c.req.json(); await c.env.DB.prepare('UPDATE relationships SET relationship_type=?, role_b=?, reciprocal_type=? WHERE id=?').bind(b.type, b.reciprocal, b.reciprocal, b.id).run(); return c.json({ success: true }); });
app.post('/api/skills', async (c) => { const { subject_id, skill_name, score } = await c.req.json(); const ex = await c.env.DB.prepare('SELECT id FROM skills WHERE subject_id = ? AND skill_name = ?').bind(subject_id, skill_name).first(); if(ex) await c.env.DB.prepare('UPDATE skills SET score = ? WHERE id = ?').bind(score, ex.id).run(); else await c.env.DB.prepare('INSERT INTO skills (subject_id, skill_name, score, created_at) VALUES (?, ?, ?, ?)').bind(subject_id, skill_name, score, Date.now()).run(); return c.json({ success: true }); });

app.get('/api/map-data', async (c) => c.json((await c.env.DB.prepare(`SELECT s.id as subject_id, s.full_name, s.avatar_path, l.lat, l.lng, l.name, l.type FROM locations l JOIN subjects s ON l.subject_id = s.id WHERE l.lat IS NOT NULL`).all()).results));
app.get('/api/global-network', async (c) => { const s = await c.env.DB.prepare('SELECT id, full_name, occupation, avatar_path, threat_level, network_x, network_y FROM subjects').all(); const r = await c.env.DB.prepare('SELECT * FROM relationships').all(); return c.json({ nodes: s.results.map(x => ({ id: x.id, label: x.full_name, group: x.threat_level, occupation: x.occupation, image: x.avatar_path, x: x.network_x, y: x.network_y })), edges: r.results.map(x => ({ from: x.subject_a_id, to: x.subject_b_id, label: x.relationship_type })) }); });

app.post('/api/delete', async (c) => { 
    const { table, id } = await c.req.json(); 
    if(!['subjects','interactions','intel','locations','relationships','media'].includes(table)) return c.json({error: 'Invalid'}, 400);
    const perms = c.get('permissions');
    if(!perms.all && !perms.can_delete_data) return c.json({error: 'Denied'}, 403);
    await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    if(table === 'subjects') { 
        await c.env.DB.prepare('DELETE FROM interactions WHERE subject_id = ?').bind(id).run();
        await c.env.DB.prepare('DELETE FROM intel WHERE subject_id = ?').bind(id).run();
        await c.env.DB.prepare('DELETE FROM locations WHERE subject_id = ?').bind(id).run();
        await c.env.DB.prepare('DELETE FROM relationships WHERE subject_a_id = ? OR subject_b_id = ?').bind(id, id).run();
    }
    return c.json({ success: true });
});

// Media
app.post('/api/upload-avatar', async (c) => { const { subjectId, data, filename, contentType } = await c.req.json(); const key = `avatars/${subjectId}-${Date.now()}-${filename}`; await c.env.R2.put(key, Uint8Array.from(atob(data), c => c.charCodeAt(0)), { httpMetadata: { contentType } }); await c.env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run(); return c.json({ success: true, path: key }); });
app.post('/api/upload-media', async (c) => { const { subjectId, data, filename, contentType } = await c.req.json(); const key = `media/${subjectId}-${Date.now()}-${filename}`; await c.env.R2.put(key, Uint8Array.from(atob(data), c => c.charCodeAt(0)), { httpMetadata: { contentType } }); await c.env.DB.prepare('INSERT INTO media (subject_id, object_key, filename, content_type, size, uploaded_at, media_type) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(subjectId, key, filename, contentType, data.length, Date.now(), 'file').run(); return c.json({ success: true, path: key }); });
app.post('/api/media-link', async (c) => { const b = await c.req.json(); await c.env.DB.prepare('INSERT INTO media (subject_id, external_url, description, content_type, uploaded_at, media_type) VALUES (?, ?, ?, ?, ?, ?)').bind(b.subjectId, b.url, b.description, b.type, Date.now(), 'link').run(); return c.json({ success: true }); });
app.get('/api/media/:key', async (c) => { const o = await c.env.R2.get(c.req.param('key')); if (!o) return c.json({ error: '404' }, 404); const h = new Headers(); o.writeHttpMetadata(h); h.set('etag', o.httpEtag); return new Response(o.body, { headers: h }); });

// Share
app.post('/api/share-links', async (c) => { const b = await c.req.json(); const t = crypto.randomUUID().replace(/-/g, ''); await c.env.DB.prepare('INSERT INTO share_links (token, subject_id, created_at, expires_at, is_active, views, require_location, allowed_tabs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(t, b.subjectId, Date.now(), Date.now() + (b.durationMinutes * 60000), 1, 0, b.requireLocation?1:0, JSON.stringify(b.allowedTabs||[])).run(); return c.json({ success: true, token: t }); });
app.get('/api/share-links', async (c) => { const sid = c.req.query('subjectId'); await c.env.DB.prepare('UPDATE share_links SET is_active = 0 WHERE expires_at < ?').bind(Date.now()).run(); if (sid) return c.json((await c.env.DB.prepare('SELECT * FROM share_links WHERE subject_id = ? ORDER BY created_at DESC').bind(sid).all()).results); return c.json([]); });
app.delete('/api/share-links', async (c) => { await c.env.DB.prepare('DELETE FROM share_links WHERE token = ?').bind(c.req.query('token')).run(); return c.json({ success: true }); });
app.get('/share/:token', async (c) => { const link = await c.env.DB.prepare('SELECT * FROM share_links WHERE token = ? AND is_active = 1').bind(c.req.param('token')).first(); if (!link || link.expires_at < Date.now()) return c.text('Expired', 404); await c.env.DB.prepare('UPDATE share_links SET views = views + 1 WHERE token = ?').bind(c.req.param('token')).run(); return serveSharedHtml(link); });

app.get('/api/suggestions', async (c) => { const [o, n, i] = await Promise.all([c.env.DB.prepare('SELECT DISTINCT occupation FROM subjects').all(), c.env.DB.prepare('SELECT DISTINCT nationality FROM subjects').all(), c.env.DB.prepare('SELECT DISTINCT ideology FROM subjects').all()]); return c.json({ occupations: o.results.map(x => x.occupation), nationalities: n.results.map(x => x.nationality), ideologies: i.results.map(x => x.ideology) }); });

app.post('/api/nuke', async (c) => { 
    if (c.get('user').role !== 'super_admin') return c.json({ error: 'Denied' }, 403); 
    await c.env.DB.exec(`DROP TABLE IF EXISTS subjects; DROP TABLE IF EXISTS interactions; DROP TABLE IF EXISTS intel; DROP TABLE IF EXISTS locations; DROP TABLE IF EXISTS relationships; DROP TABLE IF EXISTS share_links; DROP TABLE IF EXISTS media; DROP TABLE IF EXISTS skills; DROP TABLE IF EXISTS sub_admins; DROP TABLE IF EXISTS admin_logs; DROP TABLE IF EXISTS super_admin;`); 
    await initDB(c.env.DB); 
    return c.json({ success: true }); 
});

app.get('/', serveAdminHtml);
app.get('/admin', serveAdminHtml);

export default { fetch: app.fetch };
