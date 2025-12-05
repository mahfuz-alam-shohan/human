const encoder = new TextEncoder();

const ADMIN_EMAIL_MAX = 320;
const PASSWORD_MIN = 8;

function isoTimestamp() {
  return new Date().toISOString();
}

async function hashPassword(secret) {
  const data = encoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'upload';
}

async function ensureSchema(db) {
  const statements = [
    db.prepare(
      'CREATE TABLE IF NOT EXISTS admins (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'email TEXT NOT NULL UNIQUE,\n' +
        'password_hash TEXT NOT NULL,\n' +
        'created_at TEXT NOT NULL\n' +
        ')'
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS subjects (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'admin_id INTEGER NOT NULL REFERENCES admins(id),\n' +
        'full_name TEXT NOT NULL,\n' +
        'contact TEXT,\n' +
        'habits TEXT,\n' +
        'notes TEXT,\n' +
        'created_at TEXT NOT NULL,\n' +
        'updated_at TEXT NOT NULL\n' +
        ')'
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS subject_media (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'subject_id INTEGER NOT NULL REFERENCES subjects(id),\n' +
        'object_key TEXT NOT NULL UNIQUE,\n' +
        'content_type TEXT NOT NULL,\n' +
        'created_at TEXT NOT NULL\n' +
        ')'
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_subjects_admin ON subjects(admin_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(full_name)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_media_subject ON subject_media(subject_id)'),
  ];

  await db.batch(statements);
}

async function adminExists(db) {
  const stmt = db.prepare('SELECT COUNT(id) AS count FROM admins');
  const result = await stmt.first();
  const count = result?.count ?? 0;
  return count > 0;
}

async function createAdmin(db, email, password) {
  const hashed = await hashPassword(password);
  const createdAt = isoTimestamp();
  const stmt = db.prepare(
    'INSERT INTO admins (email, password_hash, created_at) VALUES (?1, ?2, ?3)'
  );
  await stmt.bind(email, hashed, createdAt).run();
}

async function addSubject(db, payload) {
  const createdAt = isoTimestamp();
  const stmt = db.prepare(
    'INSERT INTO subjects (admin_id, full_name, contact, habits, notes, created_at, updated_at) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
  );

  const result = await stmt
    .bind(
      payload.adminId,
      payload.fullName,
      payload.contact ?? null,
      payload.habits ?? null,
      payload.notes ?? null,
      createdAt,
      createdAt
    )
    .run();

  return { id: result.meta.last_row_id, createdAt };
}

async function recordMedia(db, subjectId, objectKey, contentType) {
  const createdAt = isoTimestamp();
  const stmt = db.prepare(
    'INSERT INTO subject_media (subject_id, object_key, content_type, created_at) VALUES (?1, ?2, ?3, ?4)'
  );
  await stmt.bind(subjectId, objectKey, contentType, createdAt).run();
}

async function serveHome(request, env, ctx) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Human Mind Observation</title>
  <style>
    :root { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; }
    body { margin: 0; padding: 0; }
    header { padding: 1.5rem; background: linear-gradient(135deg, #0ea5e9, #6366f1); color: white; text-align: center; }
    main { max-width: 960px; margin: 2rem auto; padding: 1.5rem; background: white; border-radius: 14px; box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 0.4rem 0; font-size: 1.9rem; }
    p { margin: 0.4rem 0; color: #334155; }
    section { margin-top: 1.25rem; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem 1.25rem; background: #f8fafc; }
    label { display: block; margin-top: 0.8rem; font-weight: 600; }
    input, textarea { width: 100%; padding: 0.7rem; margin-top: 0.3rem; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 1rem; }
    button { margin-top: 1rem; padding: 0.8rem 1.2rem; border: none; border-radius: 10px; background: #0ea5e9; color: white; font-weight: 700; cursor: pointer; box-shadow: 0 10px 20px rgba(14, 165, 233, 0.3); transition: transform 150ms ease, box-shadow 150ms ease; }
    button:hover { transform: translateY(-1px); box-shadow: 0 14px 22px rgba(99, 102, 241, 0.35); }
    .pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.7rem; background: #ecfeff; color: #0ea5e9; border-radius: 999px; font-weight: 600; font-size: 0.9rem; }
    .status { margin-top: 0.5rem; font-weight: 700; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <header>
    <h1>Human Mind Observation Console</h1>
    <p>Private, SaaS-style dashboard for first-time admin provisioning and longitudinal research.</p>
  </header>
  <main>
    <section id="setup" class="card">
      <div class="pill">First-time setup</div>
      <h2>Create the primary admin</h2>
      <p>Provision the first administrator to protect all subject observations. This step runs only once.</p>
      <form id="admin-form">
        <label>Email <input type="email" id="admin-email" required maxlength="${ADMIN_EMAIL_MAX}" /></label>
        <label>Password <input type="password" id="admin-password" required minlength="${PASSWORD_MIN}" /></label>
        <button type="submit">Create admin</button>
        <div id="admin-status" class="status"></div>
      </form>
    </section>
    <section id="dashboard" class="card hidden">
      <div class="pill">Dashboard</div>
      <h2>Log a new subject</h2>
      <p>Capture details, habits, and contextual notes for every individual you observe.</p>
      <form id="subject-form">
        <label>Admin ID <input type="number" id="subject-admin-id" required min="1" /></label>
        <label>Full name <input type="text" id="subject-name" required /></label>
        <label>Contact <input type="text" id="subject-contact" /></label>
        <label>Habits <textarea id="subject-habits" rows="2"></textarea></label>
        <label>Notes <textarea id="subject-notes" rows="2"></textarea></label>
        <button type="submit">Save subject</button>
        <div id="subject-status" class="status"></div>
      </form>
    </section>
  </main>
  <script>
    async function loadStatus() {
      const res = await fetch('/api/status', { cache: 'no-store' });
      const data = await res.json();
      const setup = document.getElementById('setup');
      const dashboard = document.getElementById('dashboard');
      if (data.adminExists) {
        setup.classList.add('hidden');
        dashboard.classList.remove('hidden');
      }
    }

    document.getElementById('admin-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('admin-status');
      status.textContent = 'Creating admin...';
      const res = await fetch('/api/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('admin-email').value,
          password: document.getElementById('admin-password').value,
        }),
      });
      if (res.ok) {
        status.textContent = 'Admin created. Dashboard unlocked.';
        await loadStatus();
      } else {
        const body = await res.json();
        status.textContent = body.error || 'Unable to create admin.';
      }
    });

    document.getElementById('subject-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('subject-status');
      status.textContent = 'Saving subject...';
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: Number.parseInt(document.getElementById('subject-admin-id').value, 10),
          fullName: document.getElementById('subject-name').value,
          contact: document.getElementById('subject-contact').value,
          habits: document.getElementById('subject-habits').value,
          notes: document.getElementById('subject-notes').value,
        }),
      });
      if (res.ok) {
        const payload = await res.json();
        status.textContent = 'Subject saved with ID ' + payload.id + '.';
        event.target.reset();
      } else {
        const body = await res.json();
        status.textContent = body.error || 'Unable to save subject.';
      }
    });

    loadStatus();
  </script>
</body>
</html>`;

  const response = new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });

  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function handleStatus(db) {
  const exists = await adminExists(db);
  return Response.json({ adminExists: exists });
}

async function handleSetupAdmin(request, db) {
  const payload = await request.json();
  const email = (payload.email || '').trim();
  const password = payload.password || '';

  if (!email || !password) {
    return Response.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  if (email.length > ADMIN_EMAIL_MAX || password.length < PASSWORD_MIN) {
    return Response.json(
      { error: 'Email or password does not meet the requirements.' },
      { status: 400 }
    );
  }

  if (await adminExists(db)) {
    return Response.json({ error: 'An admin already exists.' }, { status: 409 });
  }

  await createAdmin(db, email, password);
  return Response.json({ success: true });
}

async function handleCreateSubject(request, db) {
  const payload = await request.json();
  const adminId = Number(payload?.adminId);
  const fullName = (payload?.fullName || '').trim();

  if (!adminId || adminId < 1 || !fullName) {
    return Response.json({ error: 'adminId and fullName are required.' }, { status: 400 });
  }

  const result = await addSubject(db, {
    adminId,
    fullName,
    contact: payload.contact?.trim() || null,
    habits: payload.habits?.trim() || null,
    notes: payload.notes?.trim() || null,
  });

  return Response.json({ id: result.id, createdAt: result.createdAt });
}

async function handleUploadPhoto(request, db, bucket) {
  const payload = await request.json();
  const subjectId = Number(payload.subjectId);
  const rawName = (payload.filename || '').trim();
  const contentType = (payload.contentType || '').trim();
  const base64 = payload.data;

  if (!subjectId || subjectId < 1 || !rawName || !base64 || !contentType) {
    return Response.json(
      { error: 'subjectId, filename, contentType, and base64 data are required.' },
      { status: 400 }
    );
  }

  const sanitized = sanitizeFileName(rawName);
  const key = `${subjectId}-${Date.now()}-${sanitized}`;
  const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  await bucket.put(key, binary, { httpMetadata: { contentType } });
  await recordMedia(db, subjectId, key, contentType);

  return Response.json({ key });
}

export default {
  async fetch(request, env, ctx) {
    await env.DB.exec('PRAGMA foreign_keys = ON;');
    await ensureSchema(env.DB);

    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'GET' && pathname === '/') {
      return serveHome(request, env, ctx);
    }

    if (request.method === 'GET' && pathname === '/api/status') {
      return handleStatus(env.DB);
    }

    if (request.method === 'POST' && pathname === '/api/setup-admin') {
      return handleSetupAdmin(request, env.DB);
    }

    if (request.method === 'POST' && pathname === '/api/subjects') {
      return handleCreateSubject(request, env.DB);
    }

    if (request.method === 'POST' && pathname === '/api/upload-photo') {
      return handleUploadPhoto(request, env.DB, env.BUCKET);
    }

    return new Response('Not found', { status: 404 });
  },
};
