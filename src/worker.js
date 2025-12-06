const encoder = new TextEncoder();

// --- Configuration & Constants ---
const ALLOWED_ORIGINS = ['*']; 
const MAX_UPLOAD_SIZE = 15 * 1024 * 1024; // 15MB

// --- Schema Definitions ---
const MIGRATIONS = [
  "ALTER TABLE subjects ADD COLUMN risk_level TEXT DEFAULT 'Low'",
  "ALTER TABLE subjects ADD COLUMN vehicle_info TEXT",
  "ALTER TABLE subjects ADD COLUMN known_hangouts TEXT",
  "ALTER TABLE subjects ADD COLUMN last_seen_location TEXT",
  "ALTER TABLE subject_events ADD COLUMN witnesses TEXT",
  "ALTER TABLE subject_events ADD COLUMN location_context TEXT"
];

// --- Helper Functions ---

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
  return name.toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'upload';
}

function generateShareToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

function csvResponse(csvData, filename) {
    return new Response(csvData, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*'
        }
    });
}

function errorResponse(msg, status = 500) {
    return response({ error: msg }, status);
}

// --- Database Layer ---

let schemaInitialized = false;

async function ensureSchema(db) {
  if (schemaInitialized) return;

  try {
      await db.prepare("PRAGMA foreign_keys = ON;").run();

      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subjects (
          id INTEGER PRIMARY KEY, admin_id INTEGER, full_name TEXT, dob TEXT, age INTEGER, gender TEXT,
          occupation TEXT, nationality TEXT, education TEXT, religion TEXT, location TEXT, contact TEXT,
          hometown TEXT, previous_locations TEXT,
          habits TEXT, notes TEXT, avatar_path TEXT, is_archived INTEGER DEFAULT 0,
          status TEXT DEFAULT 'Under Watch', last_sighted TEXT,
          height TEXT, weight TEXT, eye_color TEXT, hair_color TEXT, blood_type TEXT, identifying_marks TEXT,
          mbti TEXT, alignment TEXT, social_links TEXT, digital_identifiers TEXT,
          risk_level TEXT, vehicle_info TEXT, known_hangouts TEXT, last_seen_location TEXT,
          created_at TEXT, updated_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_data_points (
          id INTEGER PRIMARY KEY, subject_id INTEGER, parent_id INTEGER, category TEXT, label TEXT, 
          value TEXT, analysis TEXT, confidence INTEGER DEFAULT 100, source TEXT, created_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_events (
          id INTEGER PRIMARY KEY, subject_id INTEGER, title TEXT, description TEXT, event_date TEXT, 
          witnesses TEXT, location_context TEXT, created_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_relationships (
          id INTEGER PRIMARY KEY, subject_a_id INTEGER, subject_b_id INTEGER, relationship_type TEXT, notes TEXT, created_at TEXT,
          custom_name TEXT, custom_avatar TEXT, custom_notes TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_media (
          id INTEGER PRIMARY KEY, subject_id INTEGER, object_key TEXT, content_type TEXT, description TEXT, created_at TEXT,
          media_type TEXT DEFAULT 'file', external_url TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_routine (
          id INTEGER PRIMARY KEY, subject_id INTEGER, activity TEXT, location TEXT, schedule TEXT, duration TEXT, notes TEXT, quote TEXT, follow_up TEXT, created_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_shares (
          id INTEGER PRIMARY KEY, subject_id INTEGER REFERENCES subjects(id), token TEXT UNIQUE, is_active INTEGER DEFAULT 1,
          duration_seconds INTEGER, started_at TEXT, created_at TEXT
        )`)
      ]);

      for (const query of MIGRATIONS) {
        try { await db.prepare(query).run(); } catch(e) { /* Ignore existing columns */ }
      }
      
      schemaInitialized = true;
  } catch (err) {
      console.error("Schema Init Error:", err);
  }
}

// --- API Handlers ---

async function handleGetDashboard(db, adminId) {
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Target Added' as desc, created_at as date FROM subjects WHERE admin_id = ?
        UNION ALL
        SELECT 'event' as type, subject_id as ref_id, title, description as desc, created_at as date FROM subject_events WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        UNION ALL
        SELECT 'media' as type, subject_id as ref_id, 'Evidence Uploaded' as title, description as desc, created_at as date FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        ORDER BY date DESC LIMIT 20
    `).bind(adminId, adminId, adminId).all();

    const stats = await db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM subjects WHERE admin_id = ? AND is_archived = 0) as active_subjects,
            (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as total_media,
            (SELECT COUNT(*) FROM subject_events WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as total_events
    `).bind(adminId, adminId, adminId).first();

    return response({ feed: recent.results, stats });
}

async function handleGetSuggestions(db, adminId) {
    const occupations = await db.prepare("SELECT DISTINCT occupation FROM subjects WHERE admin_id = ? AND occupation IS NOT NULL").bind(adminId).all();
    const locations = await db.prepare("SELECT DISTINCT location FROM subjects WHERE admin_id = ? AND location IS NOT NULL").bind(adminId).all();
    
    return response({
        occupations: occupations.results.map(r => r.occupation),
        locations: locations.results.map(r => r.location)
    });
}

async function handleGetGraph(db, adminId) {
    const subjects = await db.prepare("SELECT id, full_name, avatar_path, occupation, status, risk_level FROM subjects WHERE admin_id = ? AND is_archived = 0").bind(adminId).all();
    const rels = await db.prepare(`
        SELECT r.subject_a_id as from_id, r.subject_b_id as to_id, r.relationship_type as label
        FROM subject_relationships r
        JOIN subjects s ON r.subject_a_id = s.id
        WHERE s.admin_id = ? AND r.subject_b_id IS NOT NULL
    `).bind(adminId).all();
    
    return response({ nodes: subjects.results, edges: rels.results });
}

async function getSubjectWithDetails(db, id) {
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
    if (!subject) return null;

    const [media, dataPoints, events, relationships, routine] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_data_points WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
        db.prepare('SELECT * FROM subject_events WHERE subject_id = ? ORDER BY event_date DESC').bind(id).all(),
        db.prepare(`
            SELECT
              r.*,
              COALESCE(s.full_name, r.custom_name) as target_name,
              COALESCE(s.avatar_path, r.custom_avatar) as target_avatar,
              CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END as target_id
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(id, id, id, id).all(),
        db.prepare('SELECT * FROM subject_routine WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all()
    ]);

    return { ...subject, media: media.results, dataPoints: dataPoints.results, events: events.results, relationships: relationships.results, routine: routine.results };
}

async function handleGetSubjectFull(db, id) {
    const data = await getSubjectWithDetails(db, id);
    return data ? response(data) : errorResponse("Subject not found", 404);
}

async function handleUpdateSubject(req, db, id) {
    const p = await req.json();
    const allowed = [
        'full_name', 'dob', 'age', 'gender', 'occupation', 'nationality', 'education',
        'religion', 'location', 'hometown', 'previous_locations', 'contact', 'habits', 'notes', 'status', 'last_sighted',
        'height', 'weight', 'eye_color', 'hair_color', 'blood_type', 'identifying_marks',
        'social_links', 'digital_identifiers', 'risk_level', 'vehicle_info', 'known_hangouts'
    ];
    const updates = Object.keys(p).filter(k => allowed.includes(k));
    
    if (updates.length === 0) return response({ success: true });

    const setClause = updates.map((k, i) => `${k} = ?${i+1}`).join(', ');
    const values = updates.map(k => p[k]);
    values.push(isoTimestamp(), id);

    await db.prepare(`UPDATE subjects SET ${setClause}, updated_at = ?${values.length-1} WHERE id = ?${values.length}`).bind(...values).run();
    return response({ success: true });
}

async function handleDeleteItem(req, db, table, id) {
    const allowedTables = ['subjects', 'subject_data_points', 'subject_events', 'subject_relationships', 'subject_routine', 'subject_media'];
    if(!allowedTables.includes(table)) return errorResponse("Invalid table", 400);

    if(table === 'subjects') {
        await db.prepare("UPDATE subjects SET is_archived = 1 WHERE id = ?").bind(id).run();
    } else {
        await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    }
    return response({ success: true });
}

async function handleExportCSV(db, adminId) {
    const subjects = await db.prepare("SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0").bind(adminId).all();
    if (!subjects.results.length) return errorResponse("No data to export", 404);

    const headers = Object.keys(subjects.results[0]).join(',');
    const rows = subjects.results.map(row => 
        Object.values(row).map(val => {
            if (val === null) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',')
    );
    
    return csvResponse([headers, ...rows].join('\n'), `cases_export_${new Date().toISOString().split('T')[0]}.csv`);
}

async function handleResetSystem(req, db) {
    const { adminId, confirmation } = await req.json();
    if (confirmation !== 'DELETE_ALL_DATA') return errorResponse("Invalid confirmation code", 403);
    
    // Nuclear option: Wipe everything except the admin account
    await db.batch([
        db.prepare('DELETE FROM subjects WHERE admin_id = ?').bind(adminId),
        db.prepare('DELETE FROM subject_data_points WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)').bind(adminId),
        db.prepare('DELETE FROM subject_events WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)').bind(adminId),
        db.prepare('DELETE FROM subject_relationships WHERE subject_a_id IN (SELECT id FROM subjects WHERE admin_id = ?)').bind(adminId),
        db.prepare('DELETE FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)').bind(adminId),
        db.prepare('DELETE FROM subject_routine WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)').bind(adminId),
        db.prepare('DELETE FROM subject_shares WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)').bind(adminId),
    ]);
    return response({ success: true });
}

async function handleCreateShareLink(req, db, origin) {
    const { subjectId, durationMinutes } = await req.json();
    const durationSeconds = Math.max(30, Math.floor((durationMinutes || 0) * 60)) || 300;
    const token = generateShareToken();
    await db.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, created_at) VALUES (?, ?, ?, ?)').bind(subjectId, token, durationSeconds, isoTimestamp()).run();
    return response({ token, url: `${origin}/share/${token}` });
}

async function handleGetSharedSubject(db, token) {
    const link = await db.prepare('SELECT subject_id, is_active, duration_seconds, started_at FROM subject_shares WHERE token = ?').bind(token).first();
    if (!link || !link.is_active) return errorResponse('Link invalid or expired', 404);

    let shareMeta = null;
    if (link.duration_seconds) {
        const now = Date.now();
        const startedAt = link.started_at || isoTimestamp();
        const startedMs = new Date(startedAt).getTime();
        const elapsed = Math.floor((now - startedMs) / 1000);
        const remaining = Math.max(link.duration_seconds - elapsed, 0);

        if (!link.started_at) await db.prepare('UPDATE subject_shares SET started_at = ? WHERE token = ?').bind(startedAt, token).run();
        if (remaining <= 0) {
            await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE token = ?').bind(token).run();
            return errorResponse('Link expired', 410);
        }
        shareMeta = { duration_seconds: link.duration_seconds, started_at: startedAt, remaining_seconds: remaining };
    }

    const payload = await getSubjectWithDetails(db, link.subject_id);
    if (!payload || payload.is_archived) return errorResponse('Case not found', 404);

    // Filter fields for public safety report style
    const { admin_id, is_archived, notes, mbti, alignment, ...safeSubject } = payload;
    return response({ ...safeSubject, share: shareMeta });
}

// --- Frontend Application ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Surveillance OS</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
          colors: {
             primary: '#0f172a', // Slate 900
             accent: '#ef4444', // Red 500
          },
          animation: { 'fade-in': 'fadeIn 0.3s ease-out', 'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' },
          keyframes: {
            fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
            slideUp: { '0%': { transform: 'translateY(15px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } }
          }
        }
      }
    }
  </script>

  <style>
    body { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }
    .panel { background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
    .input-field { background: #f8fafc; border: 1px solid #cbd5e1; color: #0f172a; transition: all 0.2s; }
    .input-field:focus { border-color: #3b82f6; outline: none; background: white; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
    .btn-primary { background: #0f172a; color: white; }
    .btn-primary:active { transform: scale(0.98); }
    
    /* Mobile tweaks */
    .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
    .touch-target { min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: center; }
    #network-graph { width: 100%; height: 100%; }
  </style>
</head>
<body class="h-full text-slate-900 antialiased overflow-hidden bg-slate-50">
  <div id="app" class="h-full flex flex-col">

    <!-- Toast Notifications -->
    <div class="fixed top-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        <transition-group name="toast">
            <div v-for="t in toasts" :key="t.id" class="pointer-events-auto bg-white border-l-4 p-4 rounded shadow-xl flex items-center gap-3 min-w-[300px]" 
                 :class="t.type === 'error' ? 'border-red-500' : 'border-emerald-500'">
                <i :class="t.type === 'error' ? 'fa-solid fa-circle-exclamation text-red-500' : 'fa-solid fa-circle-check text-emerald-500'"></i>
                <div>
                    <h4 class="font-bold text-sm text-slate-900">{{ t.title }}</h4>
                    <p class="text-xs text-slate-500">{{ t.msg }}</p>
                </div>
            </div>
        </transition-group>
    </div>

    <!-- Lightbox -->
    <div v-if="lightbox.active" class="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col items-center justify-center p-2" @click.self="lightbox.active = null">
        <img :src="lightbox.url" class="max-h-[80vh] max-w-full rounded shadow-2xl object-contain" />
        <p class="mt-4 text-white/90 font-mono text-sm bg-black/50 px-4 py-2 rounded">{{ lightbox.desc || 'Evidence' }}</p>
        <button @click="lightbox.active = null" class="mt-4 text-white font-bold uppercase tracking-widest text-xs">Close</button>
    </div>

    <!-- Authentication -->
    <div v-if="view === 'auth'" class="flex-1 flex flex-col items-center justify-center p-6 bg-slate-100">
        <div class="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-4 text-white text-2xl">
                    <i class="fa-solid fa-user-secret"></i>
                </div>
                <h1 class="text-2xl font-black tracking-tight text-slate-900">SURVEILLANCE<span class="text-red-600">.OS</span></h1>
                <p class="text-slate-500 text-xs font-mono mt-1">RESTRICTED ACCESS TERMINAL</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <div v-if="setupMode" class="bg-blue-50 text-blue-700 p-3 rounded text-xs border border-blue-200">
                    <i class="fa-solid fa-info-circle"></i> Initialize Admin Credentials
                </div>
                <input v-model="auth.email" type="email" placeholder="Agent ID / Email" class="input-field w-full p-3 rounded-lg" required>
                <input v-model="auth.password" type="password" placeholder="Passcode" class="input-field w-full p-3 rounded-lg" required>
                <button type="submit" :disabled="loading" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95">
                    {{ setupMode ? 'Initialize System' : 'Authenticate' }}
                </button>
            </form>
        </div>
    </div>

    <!-- Main App -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
        
        <!-- Sidebar (Desktop) -->
        <aside class="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white z-20">
            <div class="h-16 flex items-center px-6 border-b border-slate-100">
                <i class="fa-solid fa-shield-cat text-slate-900 text-xl mr-3"></i>
                <span class="font-bold text-slate-900 tracking-tight">WATCH<span class="text-red-600">DOG</span></span>
            </div>
            <nav class="flex-1 p-4 space-y-1">
                <a v-for="item in navItems" @click="changeTab(item.id)" 
                   :class="currentTab === item.id ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'"
                   class="flex items-center px-4 py-3 rounded-lg cursor-pointer transition-colors text-sm">
                    <i :class="item.icon" class="w-6 text-center mr-2"></i> {{ item.label }}
                </a>
            </nav>
            <div class="p-4 border-t border-slate-100">
                <button @click="logout" class="flex items-center w-full px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg text-sm font-bold">
                    <i class="fa-solid fa-power-off w-6 mr-2"></i> Sign Out
                </button>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 relative flex flex-col h-full overflow-hidden pb-[70px] md:pb-0 bg-slate-50">
            
            <!-- Dashboard -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-5xl mx-auto space-y-6">
                    <header class="flex justify-between items-end">
                        <div>
                            <h2 class="text-2xl font-black text-slate-900 uppercase tracking-tight">Case Overview</h2>
                            <p class="text-slate-500 text-sm">Active investigations and recent logs.</p>
                        </div>
                        <button @click="openModal('add-subject')" class="md:hidden bg-slate-900 text-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center"><i class="fa-solid fa-plus"></i></button>
                    </header>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="panel p-4 border-l-4 border-blue-500">
                            <div class="text-slate-500 text-[10px] uppercase font-bold">Targets Under Watch</div>
                            <div class="text-2xl font-bold text-slate-900">{{ dashboard.stats.active_subjects || 0 }}</div>
                        </div>
                        <div class="panel p-4 border-l-4 border-amber-500">
                            <div class="text-slate-500 text-[10px] uppercase font-bold">Logged Incidents</div>
                            <div class="text-2xl font-bold text-slate-900">{{ dashboard.stats.total_events || 0 }}</div>
                        </div>
                         <div class="panel p-4 border-l-4 border-emerald-500">
                            <div class="text-slate-500 text-[10px] uppercase font-bold">Evidence Files</div>
                            <div class="text-2xl font-bold text-slate-900">{{ dashboard.stats.total_media || 0 }}</div>
                        </div>
                        <div class="panel p-4 border-l-4 border-slate-900 cursor-pointer hover:bg-slate-50 transition-colors" @click="openModal('add-subject')">
                            <div class="text-slate-500 text-[10px] uppercase font-bold">Action</div>
                            <div class="text-sm font-bold text-slate-900 mt-1 flex items-center"><i class="fa-solid fa-file-circle-plus mr-2"></i> Open New Case</div>
                        </div>
                    </div>

                    <div class="panel overflow-hidden">
                        <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 class="font-bold text-slate-700 text-sm uppercase"><i class="fa-solid fa-list-ul mr-2"></i> Activity Log</h3>
                            <button @click="fetchDashboard" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-rotate-right"></i></button>
                        </div>
                        <div class="divide-y divide-slate-100">
                            <div v-for="(item, idx) in dashboard.feed" :key="idx" class="p-4 hover:bg-slate-50 flex gap-3 items-start" @click="item.type === 'subject' || item.type === 'event' ? viewSubject(item.ref_id) : null">
                                <div class="mt-1 w-2 h-2 rounded-full shrink-0" :class="item.type === 'subject' ? 'bg-blue-500' : 'bg-amber-500'"></div>
                                <div class="flex-1">
                                    <div class="flex justify-between">
                                        <p class="text-sm font-bold text-slate-900">{{ item.title }}</p>
                                        <span class="text-xs font-mono text-slate-400">{{ new Date(item.date).toLocaleDateString() }}</span>
                                    </div>
                                    <p class="text-xs text-slate-500 mt-0.5">{{ item.desc }}</p>
                                </div>
                            </div>
                            <div v-if="!dashboard.feed.length" class="p-8 text-center text-slate-400 text-sm italic">No recent activity.</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Subjects List -->
            <div v-if="currentTab === 'subjects'" class="flex-1 flex flex-col overflow-hidden">
                <div class="p-4 bg-white border-b border-slate-200">
                    <div class="max-w-6xl mx-auto flex gap-3">
                        <div class="relative flex-1">
                            <i class="fa-solid fa-search absolute left-3 top-3.5 text-slate-400 text-sm"></i>
                            <input v-model="searchQuery" placeholder="Search targets..." class="input-field w-full pl-9 pr-4 py-2.5 rounded-lg text-sm bg-slate-50">
                        </div>
                        <button @click="openModal('add-subject')" class="hidden md:block bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md">
                            + New Case
                        </button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 bg-slate-50">
                    <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" 
                             class="panel overflow-hidden hover:shadow-md transition-shadow cursor-pointer group relative bg-white">
                             <div class="absolute top-0 right-0 px-2 py-1 bg-slate-100 text-[10px] font-bold uppercase text-slate-500 rounded-bl-lg border-l border-b border-slate-200">
                                {{ s.status }}
                             </div>
                             <div class="p-4 flex gap-4 items-center">
                                <div class="w-16 h-16 rounded-lg bg-slate-200 shrink-0 overflow-hidden border border-slate-300">
                                    <img v-if="s.avatar_path" :src="resolveImagePath(s.avatar_path)" class="w-full h-full object-cover">
                                    <div v-else class="w-full h-full flex items-center justify-center text-slate-400 font-bold text-xl">{{ s.full_name.charAt(0) }}</div>
                                </div>
                                <div class="min-w-0">
                                    <h3 class="font-bold text-slate-900 truncate">{{ s.full_name }}</h3>
                                    <p class="text-xs text-slate-500 truncate">{{ s.occupation || 'No occupation' }}</p>
                                    <p class="text-[10px] text-slate-400 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>{{ s.location || 'Unknown' }}</p>
                                </div>
                             </div>
                             <div class="px-4 pb-3 grid grid-cols-2 gap-2 text-center">
                                 <div class="bg-slate-50 rounded py-1 border border-slate-100">
                                     <div class="text-[9px] text-slate-400 uppercase font-bold">Risk</div>
                                     <div class="text-xs font-bold" :class="s.risk_level === 'High' ? 'text-red-600' : 'text-slate-700'">{{ s.risk_level || 'Low' }}</div>
                                 </div>
                                 <div class="bg-slate-50 rounded py-1 border border-slate-100">
                                     <div class="text-[9px] text-slate-400 uppercase font-bold">Age</div>
                                     <div class="text-xs font-bold text-slate-700">{{ s.age || '?' }}</div>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Detail View -->
            <div v-if="currentTab === 'detail' && selectedSubject" class="flex-1 flex flex-col h-full bg-slate-50">
                <header class="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-30">
                    <div class="flex items-center gap-3">
                        <button @click="changeTab('subjects')" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200">
                            <i class="fa-solid fa-arrow-left"></i>
                        </button>
                        <div>
                            <h2 class="font-bold text-slate-900 text-sm leading-tight max-w-[150px] truncate">{{ selectedSubject.full_name }}</h2>
                            <p class="text-[10px] font-mono text-slate-500">CASE #{{ String(selectedSubject.id).padStart(4,'0') }}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="openModal('quick-note')" class="touch-target px-3 bg-slate-900 text-white rounded-lg text-xs font-bold shadow"><i class="fa-solid fa-pen mr-1"></i> Log</button>
                        <button @click="openModal('share-link')" class="touch-target w-10 bg-blue-600 text-white rounded-lg shadow"><i class="fa-solid fa-share-nodes"></i></button>
                    </div>
                </header>

                <div class="flex bg-white border-b border-slate-200 overflow-x-auto no-scrollbar">
                    <button v-for="t in ['Profile', 'Sightings', 'Patterns', 'Associates', 'Evidence']" 
                            @click="subTab = t"
                            :class="subTab === t ? 'text-blue-600 border-blue-600 bg-blue-50' : 'text-slate-500 border-transparent'"
                            class="px-5 py-3 text-xs font-bold uppercase border-b-2 whitespace-nowrap flex-shrink-0 transition-colors">
                        {{ t }}
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
                    <div class="max-w-4xl mx-auto space-y-5 animate-fade-in">
                        
                        <!-- Profile Tab -->
                        <div v-if="subTab === 'Profile'" class="space-y-4">
                            <div class="panel p-5 relative">
                                <button @click="openModal('edit-profile')" class="absolute top-4 right-4 text-slate-400 hover:text-blue-600"><i class="fa-solid fa-pen-to-square"></i></button>
                                <div class="flex flex-col sm:flex-row gap-6">
                                    <div class="w-24 h-24 rounded-lg bg-slate-200 overflow-hidden border border-slate-300 shrink-0 cursor-pointer" @click="openModal('avatar-options')">
                                        <img v-if="selectedSubject.avatar_path" :src="resolveImagePath(selectedSubject.avatar_path)" class="w-full h-full object-cover">
                                        <div v-else class="w-full h-full flex items-center justify-center text-slate-400 text-2xl"><i class="fa-solid fa-camera"></i></div>
                                    </div>
                                    <div class="flex-1 grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                        <div><span class="block text-xs text-slate-400 uppercase font-bold">Full Name</span><span class="font-bold text-slate-900">{{ selectedSubject.full_name }}</span></div>
                                        <div><span class="block text-xs text-slate-400 uppercase font-bold">Status</span><span class="font-bold" :class="selectedSubject.status === 'Active' ? 'text-red-600' : 'text-slate-900'">{{ selectedSubject.status }}</span></div>
                                        <div><span class="block text-xs text-slate-400 uppercase font-bold">Last Sighted</span><span class="font-mono text-slate-700">{{ selectedSubject.last_sighted || 'Unknown' }}</span></div>
                                        <div><span class="block text-xs text-slate-400 uppercase font-bold">Vehicle</span><span class="text-slate-700">{{ selectedSubject.vehicle_info || 'N/A' }}</span></div>
                                        <div class="col-span-2"><span class="block text-xs text-slate-400 uppercase font-bold">Primary Location</span><span class="text-slate-900">{{ selectedSubject.location || 'Unknown' }}</span></div>
                                        <div class="col-span-2"><span class="block text-xs text-slate-400 uppercase font-bold">Known Hangouts</span><span class="text-slate-700">{{ selectedSubject.known_hangouts || '—' }}</span></div>
                                    </div>
                                </div>
                            </div>

                            <div class="panel p-5">
                                <h3 class="text-xs font-bold text-slate-400 uppercase mb-4">Physical Description</h3>
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                    <div class="bg-slate-50 p-2 rounded border border-slate-100"><div class="text-[10px] text-slate-400 uppercase">Height</div><div class="font-bold text-slate-700">{{ selectedSubject.height || '—' }}</div></div>
                                    <div class="bg-slate-50 p-2 rounded border border-slate-100"><div class="text-[10px] text-slate-400 uppercase">Weight</div><div class="font-bold text-slate-700">{{ selectedSubject.weight || '—' }}</div></div>
                                    <div class="bg-slate-50 p-2 rounded border border-slate-100"><div class="text-[10px] text-slate-400 uppercase">Hair</div><div class="font-bold text-slate-700">{{ selectedSubject.hair_color || '—' }}</div></div>
                                    <div class="bg-slate-50 p-2 rounded border border-slate-100"><div class="text-[10px] text-slate-400 uppercase">Eyes</div><div class="font-bold text-slate-700">{{ selectedSubject.eye_color || '—' }}</div></div>
                                </div>
                                <div class="bg-red-50 p-3 rounded border border-red-100">
                                    <div class="text-[10px] text-red-400 uppercase font-bold">Scars / Marks / Tattoos</div>
                                    <p class="text-sm text-red-900 mt-1">{{ selectedSubject.identifying_marks || 'None observed.' }}</p>
                                </div>
                            </div>

                            <div class="panel p-5">
                                <div class="flex justify-between items-center mb-3">
                                    <h3 class="text-xs font-bold text-slate-400 uppercase">Report Notes</h3>
                                    <button @click="openModal('edit-profile')" class="text-xs text-blue-600 font-bold">Edit</button>
                                </div>
                                <p class="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{{ selectedSubject.notes || 'No general notes.' }}</p>
                            </div>
                            
                            <button @click="deleteItem('subjects', selectedSubject.id)" class="w-full py-3 text-red-600 text-xs font-bold border border-red-200 rounded-lg hover:bg-red-50">ARCHIVE CASE FILE</button>
                        </div>

                        <!-- Sightings Tab -->
                        <div v-if="subTab === 'Sightings'" class="space-y-4">
                            <button @click="openModal('add-event')" class="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm shadow">+ Log Sighting</button>
                            <div class="relative border-l-2 border-slate-200 ml-4 space-y-6 py-2">
                                <div v-for="e in selectedSubject.events" :key="e.id" class="relative pl-6 group">
                                    <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-4 border-slate-400 group-hover:border-blue-500 transition-colors"></div>
                                    <div class="flex justify-between items-start">
                                        <div class="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-mono text-slate-600 font-bold mb-1 inline-block">{{ e.event_date }}</div>
                                        <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button @click="openModal('edit-event', e)" class="text-slate-400 hover:text-blue-600"><i class="fa-solid fa-pen"></i></button>
                                            <button @click="deleteItem('subject_events', e.id)" class="text-slate-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                    <h4 class="font-bold text-slate-900 text-sm">{{ e.title }}</h4>
                                    <div class="mt-2 p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                        <p class="text-sm text-slate-700 leading-relaxed">{{ e.description }}</p>
                                        <div v-if="e.witnesses" class="mt-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                                            <span class="font-bold">Witnesses:</span> {{ e.witnesses }}
                                        </div>
                                        <div v-if="e.location_context" class="mt-1 text-xs text-slate-500">
                                            <span class="font-bold">Location Details:</span> {{ e.location_context }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Patterns (Routine) -->
                        <div v-if="subTab === 'Patterns'" class="space-y-4">
                            <div class="flex justify-between items-center">
                                <h3 class="font-bold text-slate-900">Pattern of Life</h3>
                                <button @click="openModal('add-routine')" class="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded font-bold text-slate-700">Add Routine</button>
                            </div>
                            <div class="grid gap-3">
                                <div v-for="r in selectedSubject.routine" :key="r.id" class="panel p-4 flex gap-4 items-start relative group">
                                    <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                        <i class="fa-solid fa-clock"></i>
                                    </div>
                                    <div class="flex-1">
                                        <h4 class="font-bold text-slate-900 text-sm">{{ r.activity }}</h4>
                                        <div class="text-xs text-slate-500 mt-0.5">{{ r.schedule }} • {{ r.location }}</div>
                                        <p v-if="r.notes" class="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded">{{ r.notes }}</p>
                                    </div>
                                    <button @click="deleteItem('subject_routine', r.id)" class="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>

                        <!-- Associates (Relations) -->
                        <div v-if="subTab === 'Associates'" class="space-y-4">
                            <button @click="openModal('add-rel')" class="w-full py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-lg font-bold text-sm hover:border-blue-500 hover:text-blue-500 transition-colors">+ Connect Associate</button>
                            <div class="grid gap-3">
                                <div v-for="r in selectedSubject.relationships" :key="r.id" class="panel p-3 flex items-center gap-3 relative">
                                    <div class="w-12 h-12 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                                        <img v-if="r.target_avatar" :src="resolveImagePath(r.target_avatar)" class="w-full h-full object-cover">
                                    </div>
                                    <div>
                                        <div class="font-bold text-slate-900 text-sm">{{ r.target_name }}</div>
                                        <div class="text-xs font-mono text-blue-600 uppercase">{{ r.relationship_type }}</div>
                                        <div class="text-[10px] text-slate-500 mt-0.5">{{ r.notes || r.custom_notes }}</div>
                                    </div>
                                    <button @click="deleteItem('subject_relationships', r.id)" class="ml-auto text-slate-300 hover:text-red-500 p-2"><i class="fa-solid fa-link-slash"></i></button>
                                </div>
                            </div>
                        </div>

                        <!-- Evidence (Media) -->
                        <div v-if="subTab === 'Evidence'" class="space-y-4">
                            <div class="flex gap-2 mb-4">
                                <button @click="triggerMediaUpload" class="flex-1 bg-slate-100 py-3 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200"><i class="fa-solid fa-upload mr-2"></i>Upload File</button>
                                <button @click="openModal('add-media-link')" class="flex-1 bg-slate-100 py-3 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200"><i class="fa-solid fa-link mr-2"></i>Add Link</button>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div v-for="m in selectedSubject.media" :key="m.id" class="relative group aspect-square bg-slate-100 rounded-lg overflow-hidden cursor-pointer border border-slate-200" @click="lightbox = {active: true, url: m.media_type === 'link' ? m.external_url : '/api/media/' + m.object_key, desc: m.description}">
                                    <img :src="m.media_type === 'link' ? m.external_url : '/api/media/' + m.object_key" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/400?text=Error'">
                                    <div class="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-white text-[10px] truncate">{{ m.description }}</div>
                                    <button @click.stop="deleteItem('subject_media', m.id)" class="absolute top-1 right-1 bg-white text-red-500 rounded-full w-6 h-6 flex items-center justify-center shadow"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <!-- Network Graph Tab (New) -->
            <div v-show="currentTab === 'graph'" class="flex-1 relative bg-slate-50 overflow-hidden">
                <div id="network-graph" class="w-full h-full"></div>
                <!-- Controls -->
                <div class="absolute top-4 left-4 right-4 md:w-72 bg-white/90 backdrop-blur p-3 rounded-xl border border-slate-200 shadow-lg flex flex-col gap-2 z-10">
                    <input v-model="graphSearch" placeholder="Locate target..." class="input-field w-full p-2 text-xs rounded">
                    <div class="flex gap-2">
                        <button @click="fitGraph" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] py-2 rounded font-bold">Center</button>
                        <button @click="refreshGraph" class="flex-1 bg-slate-900 text-white text-[10px] py-2 rounded font-bold">Refresh</button>
                    </div>
                    <!-- Risk Legend -->
                    <div class="flex gap-3 text-[10px] justify-center mt-1 pt-2 border-t border-slate-100">
                        <span class="flex items-center gap-1 font-bold text-slate-600"><span class="w-2 h-2 rounded-full bg-red-500"></span> High</span>
                        <span class="flex items-center gap-1 font-bold text-slate-600"><span class="w-2 h-2 rounded-full bg-amber-500"></span> Med</span>
                        <span class="flex items-center gap-1 font-bold text-slate-600"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Low</span>
                    </div>
                </div>
            </div>

            <!-- Settings Tab -->
            <div v-if="currentTab === 'settings'" class="p-6 overflow-y-auto">
                <div class="max-w-xl mx-auto space-y-8">
                    <h2 class="text-2xl font-black text-slate-900">System Admin</h2>
                    
                    <div class="panel p-6 border-l-4 border-red-500">
                        <h3 class="font-bold text-slate-900 mb-2">Nuclear Reset</h3>
                        <p class="text-sm text-slate-500 mb-4">Permanently delete all cases, logs, and evidence. This action cannot be undone.</p>
                        <div v-if="resetStep === 0">
                            <button @click="resetStep = 1" class="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold border border-red-200 hover:bg-red-100">Initiate Wipe Sequence</button>
                        </div>
                        <div v-if="resetStep === 1" class="space-y-3">
                            <p class="text-xs font-bold text-red-600 uppercase">Confirm Action</p>
                            <input v-model="resetConfirm" placeholder="Type DELETE_ALL_DATA" class="input-field w-full p-2 text-sm rounded border-red-300 text-red-600">
                            <div class="flex gap-2">
                                <button @click="resetSystem" :disabled="resetConfirm !== 'DELETE_ALL_DATA'" class="flex-1 bg-red-600 text-white py-2 rounded font-bold text-sm disabled:opacity-50">CONFIRM WIPE</button>
                                <button @click="resetStep = 0" class="flex-1 bg-slate-100 text-slate-600 py-2 rounded font-bold text-sm">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </main>

        <!-- Mobile Nav -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-40 flex justify-around items-center h-[60px] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <a v-for="item in navItems" @click="changeTab(item.id)" 
               class="flex flex-col items-center justify-center w-full h-full space-y-1 touch-target"
               :class="currentTab === item.id ? 'text-blue-600' : 'text-slate-400'">
                <i :class="item.icon" class="text-lg"></i>
                <span class="text-[10px] font-bold">{{ item.label }}</span>
            </a>
        </nav>

    </div>

    <!-- Modals -->
    <div v-if="modal.active" class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" @click.self="closeModal">
        <div class="bg-white w-full max-w-lg md:rounded-xl rounded-t-xl shadow-2xl flex flex-col max-h-[90vh] animate-slide-up">
            <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                <h3 class="font-bold text-slate-900">{{ modalTitle }}</h3>
                <button @click="closeModal" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 bg-slate-200 rounded-full"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                
                <!-- Add Subject Form -->
                <form v-if="modal.active === 'add-subject'" @submit.prevent="createSubject" class="space-y-4">
                    <input v-model="forms.subject.full_name" placeholder="Target Name" class="input-field w-full p-3 rounded-lg" required>
                    <div class="grid grid-cols-2 gap-4">
                        <input v-model="forms.subject.location" placeholder="Primary Location" class="input-field p-3 rounded-lg">
                        <select v-model="forms.subject.risk_level" class="input-field p-3 rounded-lg">
                            <option>Low Risk</option>
                            <option>Medium Risk</option>
                            <option>High Risk</option>
                        </select>
                    </div>
                    <textarea v-model="forms.subject.identifying_marks" placeholder="Identifying Marks (Tattoos, Scars)" class="input-field w-full p-3 rounded-lg" rows="2"></textarea>
                    <button type="submit" class="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">Create Case File</button>
                </form>

                <!-- Edit Profile -->
                <form v-if="modal.active === 'edit-profile'" @submit.prevent="updateSubject" class="space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                        <input v-model="forms.subject.height" placeholder="Height" class="input-field p-3 rounded-lg">
                        <input v-model="forms.subject.weight" placeholder="Weight" class="input-field p-3 rounded-lg">
                        <input v-model="forms.subject.hair_color" placeholder="Hair Color" class="input-field p-3 rounded-lg">
                        <input v-model="forms.subject.eye_color" placeholder="Eye Color" class="input-field p-3 rounded-lg">
                    </div>
                    <input v-model="forms.subject.vehicle_info" placeholder="Vehicle (Make, Model, Plate)" class="input-field w-full p-3 rounded-lg">
                    <input v-model="forms.subject.known_hangouts" placeholder="Known Hangouts" class="input-field w-full p-3 rounded-lg">
                    <textarea v-model="forms.subject.notes" placeholder="General case notes..." class="input-field w-full p-3 rounded-lg" rows="4"></textarea>
                    <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">Save Changes</button>
                </form>

                <!-- Sighting Form -->
                <form v-if="modal.active === 'add-event' || modal.active === 'edit-event'" @submit.prevent="submitEvent" class="space-y-4">
                    <input type="datetime-local" v-model="forms.event.date" class="input-field w-full p-3 rounded-lg" required>
                    <input v-model="forms.event.title" placeholder="Sighting Summary (e.g. Spotted at Gas Station)" class="input-field w-full p-3 rounded-lg" required>
                    <textarea v-model="forms.event.description" placeholder="Detailed observation..." class="input-field w-full p-3 rounded-lg h-24"></textarea>
                    <input v-model="forms.event.location_context" placeholder="Specific Location (e.g. North Exit)" class="input-field w-full p-3 rounded-lg">
                    <input v-model="forms.event.witnesses" placeholder="Witnesses / With whom?" class="input-field w-full p-3 rounded-lg">
                    <button type="submit" class="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">Log Sighting</button>
                </form>

                <!-- Routine Form -->
                <form v-if="modal.active === 'add-routine'" @submit.prevent="submitRoutine" class="space-y-4">
                    <input v-model="forms.routine.activity" placeholder="Activity (e.g. Gym)" class="input-field w-full p-3 rounded-lg" required>
                    <div class="grid grid-cols-2 gap-3">
                         <input v-model="forms.routine.schedule" placeholder="Schedule (e.g. Mon 6PM)" class="input-field p-3 rounded-lg">
                         <input v-model="forms.routine.location" placeholder="Location" class="input-field p-3 rounded-lg">
                    </div>
                    <textarea v-model="forms.routine.notes" placeholder="Observation notes..." class="input-field w-full p-3 rounded-lg"></textarea>
                    <button type="submit" class="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">Add Pattern</button>
                </form>
                
                <!-- Share Link -->
                <div v-if="modal.active === 'share-link'" class="space-y-4">
                    <p class="text-sm text-slate-500">Generate a secure, time-limited link to share this case file with authorized personnel.</p>
                    <input type="number" v-model="forms.share.durationMinutes" placeholder="Minutes valid (default 5)" class="input-field w-full p-3 rounded-lg">
                    <button @click="createShareLink" class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">Generate Access Token</button>
                    <div v-if="shareLinks.length" class="space-y-2 mt-4">
                        <div v-for="link in shareLinks" :key="link.token" class="bg-slate-50 p-3 rounded border border-slate-200 text-xs">
                             <div class="flex justify-between mb-1 font-bold">
                                <span :class="link.is_active ? 'text-green-600' : 'text-red-500'">{{ link.is_active ? 'ACTIVE' : 'EXPIRED' }}</span>
                                <span class="text-slate-400">{{ Math.round(link.duration_seconds/60) }}m limit</span>
                             </div>
                             <div class="font-mono text-slate-600 break-all bg-white p-2 rounded border border-slate-100 mb-2 select-all">{{ link.url }}</div>
                             <button @click="copyLink(link.url)" class="text-blue-600 font-bold underline">Copy Link</button>
                        </div>
                    </div>
                </div>

                <!-- Avatar Options -->
                <div v-if="modal.active === 'avatar-options'" class="grid grid-cols-2 gap-4">
                    <button @click="triggerAvatar" class="p-4 bg-slate-100 rounded-lg font-bold text-slate-700 hover:bg-slate-200">Upload Photo</button>
                    <button @click="openModal('avatar-link')" class="p-4 bg-slate-100 rounded-lg font-bold text-slate-700 hover:bg-slate-200">Use URL</button>
                </div>
                 <form v-if="modal.active === 'avatar-link'" @submit.prevent="submitAvatarLink">
                     <input v-model="forms.avatarLink.url" placeholder="https://..." class="input-field w-full p-3 rounded-lg mb-4">
                     <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">Save URL</button>
                 </form>

                 <!-- Add Rel, Media Link forms omitted for brevity but supported via generic handling logic below -->
                 <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                    <input v-model="forms.rel.customName" placeholder="Associate Name" class="input-field w-full p-3 rounded-lg" required>
                    <input v-model="forms.rel.type" placeholder="Relationship (e.g. Brother, Accomplice)" class="input-field w-full p-3 rounded-lg" required>
                    <textarea v-model="forms.rel.notes" placeholder="Notes on association..." class="input-field w-full p-3 rounded-lg"></textarea>
                    <button type="submit" class="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">Connect Associate</button>
                 </form>

                 <form v-if="modal.active === 'add-media-link'" @submit.prevent="submitMediaLink" class="space-y-4">
                    <input v-model="forms.mediaLink.url" placeholder="https://..." class="input-field w-full p-3 rounded-lg" required>
                    <input v-model="forms.mediaLink.description" placeholder="Description" class="input-field w-full p-3 rounded-lg">
                    <button type="submit" class="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">Attach Link</button>
                 </form>
            </div>
        </div>
    </div>

    <!-- Hidden Inputs -->
    <input type="file" ref="mediaInput" @change="handleMediaUpload" class="hidden" accept="image/*">
    <input type="file" ref="avatarInput" @change="handleAvatarUpload" class="hidden" accept="image/*">
  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch } = Vue;

    createApp({
      setup() {
        const view = ref('auth');
        const currentTab = ref('dashboard');
        const subTab = ref('Profile');
        const auth = reactive({ email: '', password: '' });
        const dashboard = reactive({ stats: {}, feed: [] });
        const subjects = ref([]);
        const selectedSubject = ref(null);
        const modal = reactive({ active: null, editId: null });
        const forms = reactive({
            subject: {},
            event: { date: '', title: '', description: '', location_context: '', witnesses: '' },
            routine: { activity: '', schedule: '', location: '', notes: '' },
            rel: { customName: '', type: '', notes: '' },
            mediaLink: { url: '', description: '' },
            avatarLink: { url: '' },
            share: { durationMinutes: 15 }
        });
        const resetStep = ref(0);
        const resetConfirm = ref('');
        const shareLinks = ref([]);
        const lightbox = reactive({ active: null, url: '', desc: '' });
        const toasts = ref([]);
        const searchQuery = ref('');
        const graphSearch = ref('');
        const selectedNode = ref(null);
        let network = null;

        const navItems = [
            { id: 'dashboard', label: 'Overview', icon: 'fa-solid fa-chart-line' },
            { id: 'subjects', label: 'Cases', icon: 'fa-solid fa-folder-open' },
            { id: 'graph', label: 'Network', icon: 'fa-solid fa-circle-nodes' },
            { id: 'settings', label: 'Admin', icon: 'fa-solid fa-gear' }
        ];

        const notify = (msg, type = 'success') => {
            const id = Date.now();
            toasts.value.push({ id, msg, type, title: type === 'error' ? 'Error' : 'Success' });
            setTimeout(() => toasts.value = toasts.value.filter(t => t.id !== id), 3000);
        };

        const api = async (ep, opts = {}) => {
            try {
                const res = await fetch('/api' + ep, opts);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Request failed');
                return data;
            } catch (e) { notify(e.message, 'error'); throw e; }
        };

        const handleAuth = async () => {
             const res = await api('/login', { method: 'POST', body: JSON.stringify(auth) });
             localStorage.setItem('admin_id', res.id);
             view.value = 'app';
             fetchDashboard();
        };

        const fetchDashboard = async () => {
            const data = await api('/dashboard?adminId=' + localStorage.getItem('admin_id'));
            dashboard.stats = data.stats;
            dashboard.feed = data.feed;
        };

        const fetchSubjects = async () => {
            subjects.value = await api('/subjects?adminId=' + localStorage.getItem('admin_id'));
        };

        const viewSubject = async (id) => {
            selectedSubject.value = await api('/subjects/' + id);
            currentTab.value = 'detail';
            subTab.value = 'Profile';
            loadShareLinks(id);
        };

        const createSubject = async () => {
            await api('/subjects', { method: 'POST', body: JSON.stringify({ ...forms.subject, adminId: localStorage.getItem('admin_id') }) });
            modal.active = null; fetchSubjects(); fetchDashboard(); notify('Case Created');
        };

        const updateSubject = async () => {
            await api('/subjects/' + selectedSubject.value.id, { method: 'PATCH', body: JSON.stringify(forms.subject) });
            selectedSubject.value = { ...selectedSubject.value, ...forms.subject };
            modal.active = null; notify('Profile Updated');
        };

        const submitEvent = async () => {
            const isEdit = modal.active === 'edit-event';
            const payload = { ...forms.event, subjectId: selectedSubject.value.id, id: modal.editId };
            await api('/event', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
            viewSubject(selectedSubject.value.id); modal.active = null; notify('Log Updated');
        };

        const submitRoutine = async () => {
            await api('/routine', { method: 'POST', body: JSON.stringify({ ...forms.routine, subjectId: selectedSubject.value.id }) });
            viewSubject(selectedSubject.value.id); modal.active = null; notify('Pattern Added');
        };

        const submitRel = async () => {
            await api('/relationship', { method: 'POST', body: JSON.stringify({ ...forms.rel, subjectA: selectedSubject.value.id }) });
            viewSubject(selectedSubject.value.id); modal.active = null; notify('Associate Added');
        };

         const submitMediaLink = async () => {
            await api('/media-link', { method: 'POST', body: JSON.stringify({ ...forms.mediaLink, subjectId: selectedSubject.value.id }) });
            viewSubject(selectedSubject.value.id); modal.active = null; notify('Link Added');
        };

        const submitAvatarLink = async () => {
            await api('/avatar-link', { method: 'POST', body: JSON.stringify({ url: forms.avatarLink.url, subjectId: selectedSubject.value.id }) });
            viewSubject(selectedSubject.value.id); modal.active = null; notify('Avatar Updated');
        };

        const deleteItem = async (table, id) => {
            if(!confirm('Are you sure you want to delete this item?')) return;
            await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) });
            if(table === 'subjects') { currentTab.value = 'subjects'; fetchSubjects(); }
            else viewSubject(selectedSubject.value.id);
            notify('Item Deleted');
        };

        const resetSystem = async () => {
            await api('/reset-system', { method: 'POST', body: JSON.stringify({ adminId: localStorage.getItem('admin_id'), confirmation: resetConfirm.value }) });
            alert('System Wiped. Reloading.');
            location.reload();
        };

        const createShareLink = async () => {
            const res = await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selectedSubject.value.id, durationMinutes: forms.share.durationMinutes }) });
            loadShareLinks(selectedSubject.value.id);
        };

        const loadShareLinks = async (id) => {
            const res = await api('/share-links?subjectId=' + id);
            shareLinks.value = res.links;
        };

        const uploadFile = async (file, ep, isAvatar = false) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async (e) => {
                const b64 = e.target.result.split(',')[1];
                await api(ep, { method: 'POST', body: JSON.stringify({ subjectId: selectedSubject.value.id, data: b64, filename: file.name, contentType: file.type }) });
                viewSubject(selectedSubject.value.id); notify('Upload Complete');
            };
        };

        const handleMediaUpload = (e) => e.target.files[0] && uploadFile(e.target.files[0], '/upload-photo');
        const handleAvatarUpload = (e) => e.target.files[0] && uploadFile(e.target.files[0], '/upload-avatar', true);
        const triggerMediaUpload = () => document.querySelector('input[type="file"]').click();
        const triggerAvatar = () => document.querySelectorAll('input[type="file"]')[1].click();

        const openModal = (type, payload = null) => {
            modal.active = type;
            if (type === 'add-subject') forms.subject = { risk_level: 'Low Risk' };
            if (type === 'edit-profile') forms.subject = { ...selectedSubject.value };
            if (type === 'add-event') forms.event = { date: new Date().toISOString().slice(0, 16) };
            if (type === 'edit-event') { modal.editId = payload.id; forms.event = { ...payload, date: payload.event_date || '' }; }
            if (type === 'add-routine') forms.routine = { activity: '', schedule: '', location: '', notes: '' };
            if (type === 'add-rel') forms.rel = { customName: '', type: '', notes: '' };
            if (type === 'add-media-link') forms.mediaLink = { url: '', description: '' };
        };

        const filteredSubjects = computed(() => {
            if(!searchQuery.value) return subjects.value;
            const q = searchQuery.value.toLowerCase();
            return subjects.value.filter(s => s.full_name.toLowerCase().includes(q));
        });

        const loadGraph = async () => {
            const data = await api('/graph?adminId=' + localStorage.getItem('admin_id'));
            const container = document.getElementById('network-graph');
            if(!container) return;
            
            const nodes = data.nodes.map(n => ({
                id: n.id,
                label: n.full_name,
                shape: 'circularImage',
                image: n.avatar_path ? resolveImagePath(n.avatar_path) : `https://ui-avatars.com/api/?name=${n.full_name}&background=cbd5e1&color=1e293b`,
                size: 25,
                borderWidth: 4,
                color: {
                    border: n.risk_level === 'High' ? '#ef4444' : n.risk_level === 'Medium' ? '#f59e0b' : '#10b981',
                    background: '#ffffff'
                },
                font: { color: '#1e293b', size: 12, face: 'Inter' }
            }));

            const edges = data.edges.map(e => ({
                from: e.from_id, to: e.to_id, label: e.label,
                arrows: 'to',
                color: { color: '#94a3b8' },
                font: { size: 10, align: 'middle', background: '#f8fafc' }
            }));

            network = new vis.Network(container, { nodes, edges }, {
                physics: { stabilization: true },
                interaction: { hover: true },
                layout: { randomSeed: 2 }
            });
            
            network.on('click', (p) => {
                if(p.nodes.length) viewSubject(p.nodes[0]);
            });
        };

        const fitGraph = () => network?.fit();
        const refreshGraph = () => loadGraph();
        watch(graphSearch, (v) => {
            if(!network) return;
            const nodes = network.body.data.nodes.get();
            const matches = nodes.filter(n => n.label.toLowerCase().includes(v.toLowerCase())).map(n => n.id);
            network.selectNodes(matches);
        });

        watch(currentTab, (v) => { if(v === 'graph') setTimeout(loadGraph, 100); });

        onMounted(async () => {
            if(localStorage.getItem('admin_id')) {
                view.value = 'app';
                fetchDashboard();
            }
        });

        return {
            view, auth, dashboard, subjects, filteredSubjects, selectedSubject, currentTab, subTab, navItems,
            modal, forms, lightbox, toasts, shareLinks, resetStep, resetConfirm, searchQuery,
            handleAuth, logout: () => { localStorage.clear(); location.reload(); }, changeTab: (t) => { currentTab.value = t; if(t==='subjects') fetchSubjects(); },
            viewSubject, createSubject, updateSubject, submitEvent, submitRoutine, submitRel, submitMediaLink, submitAvatarLink,
            deleteItem, resetSystem, createShareLink, copyLink: (url) => navigator.clipboard.writeText(url).then(() => notify('Copied')),
            handleMediaUpload, handleAvatarUpload, triggerMediaUpload, triggerAvatar,
            openModal, closeModal: () => modal.active = null, resolveImagePath: (p) => p.startsWith('http') ? p : '/api/media/' + p,
            graphSearch, fitGraph, refreshGraph
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

function serveSharedHtml(token) {
    const html = `<!DOCTYPE html>
<html lang="en" class="bg-slate-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Official Report</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
</head>
<body class="min-h-screen p-4 md:p-8">
  <div class="max-w-3xl mx-auto bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden">
     <div class="bg-slate-900 text-white p-6 flex justify-between items-start">
        <div>
            <div class="text-xs uppercase tracking-widest text-slate-400 mb-1">Confidential Report</div>
            <h1 id="name" class="text-3xl font-black">Loading...</h1>
            <p id="status" class="text-sm text-red-400 font-bold mt-1"></p>
        </div>
        <div class="text-right">
            <div class="text-[10px] text-slate-500">CASE ID</div>
            <div id="caseId" class="font-mono text-lg font-bold">---</div>
        </div>
     </div>

     <div id="content" class="p-6 space-y-8 hidden">
        <div class="flex flex-col md:flex-row gap-6 border-b border-slate-100 pb-6">
            <img id="avatar" class="w-32 h-32 object-cover rounded bg-slate-100 border border-slate-200">
            <div class="flex-1 grid grid-cols-2 gap-4 text-sm">
                <div><span class="block text-xs font-bold text-slate-400 uppercase">Age</span><span id="age" class="font-bold text-slate-800"></span></div>
                <div><span class="block text-xs font-bold text-slate-400 uppercase">Gender</span><span id="gender" class="font-bold text-slate-800"></span></div>
                <div><span class="block text-xs font-bold text-slate-400 uppercase">Location</span><span id="location" class="font-bold text-slate-800"></span></div>
                <div><span class="block text-xs font-bold text-slate-400 uppercase">Vehicle</span><span id="vehicle" class="font-bold text-slate-800"></span></div>
                <div class="col-span-2"><span class="block text-xs font-bold text-slate-400 uppercase">Identifying Marks</span><span id="marks" class="text-slate-800"></span></div>
            </div>
        </div>

        <div>
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 mb-4">Confirmed Sightings</h3>
            <div id="timeline" class="space-y-4 border-l-2 border-slate-200 ml-2 pl-4"></div>
        </div>

        <div>
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 mb-4">Established Patterns</h3>
            <div id="routine" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>
        </div>
     </div>
     
     <div id="error" class="hidden p-8 text-center text-red-600 font-bold"></div>
  </div>

  <script>
    (async () => {
        try {
            const res = await fetch('/api/shared/${token}');
            const data = await res.json();
            if(!res.ok) throw new Error(data.error);

            document.getElementById('content').classList.remove('hidden');
            document.getElementById('name').textContent = data.full_name;
            document.getElementById('status').textContent = data.status;
            document.getElementById('caseId').textContent = '#' + String(data.id).padStart(4,'0');
            document.getElementById('avatar').src = data.avatar_path ? (data.avatar_path.startsWith('http') ? data.avatar_path : '/api/media/' + data.avatar_path) : 'https://ui-avatars.com/api/?name=Subject&background=random';
            
            document.getElementById('age').textContent = data.age || 'Unknown';
            document.getElementById('gender').textContent = data.gender || 'Unknown';
            document.getElementById('location').textContent = data.location || 'Unknown';
            document.getElementById('vehicle').textContent = data.vehicle_info || 'None Listed';
            document.getElementById('marks').textContent = data.identifying_marks || 'None';

            const timeline = document.getElementById('timeline');
            if(data.events && data.events.length) {
                timeline.innerHTML = data.events.map(e => \`
                    <div class="relative">
                        <div class="text-xs font-bold text-slate-500 mb-1">\${e.event_date || 'Undated'}</div>
                        <div class="font-bold text-slate-900">\${e.title}</div>
                        <p class="text-sm text-slate-600">\${e.description}</p>
                    </div>
                \`).join('');
            } else { timeline.innerHTML = '<p class="text-sm text-slate-400 italic">No sighting logs available.</p>'; }

            const routine = document.getElementById('routine');
            if(data.routine && data.routine.length) {
                routine.innerHTML = data.routine.map(r => \`
                    <div class="bg-slate-50 p-3 rounded border border-slate-100">
                        <div class="font-bold text-slate-900 text-sm">\${r.activity}</div>
                        <div class="text-xs text-slate-500">\${r.schedule} • \${r.location}</div>
                    </div>
                \`).join('');
            } else { routine.innerHTML = '<p class="text-sm text-slate-400 italic">No patterns established.</p>'; }

        } catch(e) {
            document.getElementById('error').textContent = e.message;
            document.getElementById('error').classList.remove('hidden');
        }
    })();
  </script>
</body>
</html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// --- Main Worker ---

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // Auto-migrate on access
    if (path.startsWith('/api/') && !schemaInitialized) await ensureSchema(env.DB);

    try {
        if (req.method === 'GET' && path === '/') return serveHtml();
        const sharePage = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
        if (req.method === 'GET' && sharePage) return serveSharedHtml(sharePage[1]);

        if (path === '/api/login') return handleLogin(req, env.DB);
        if (path === '/api/subjects') {
            if (req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare("INSERT INTO subjects (admin_id, full_name, risk_level, location, identifying_marks, created_at, status) VALUES (?,?,?,?,?,?,?)")
                    .bind(p.adminId, p.full_name, p.risk_level, p.location, p.identifying_marks, isoTimestamp(), 'Under Watch').run();
                return response({ success: true });
            }
            return response((await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(url.searchParams.get('adminId')).all()).results);
        }

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) return req.method === 'PATCH' ? handleUpdateSubject(req, env.DB, idMatch[1]) : handleGetSubjectFull(env.DB, idMatch[1]);
        
        if (path === '/api/dashboard') return handleGetDashboard(env.DB, url.searchParams.get('adminId'));
        if (path === '/api/event') {
             const p = await req.json();
             if(req.method === 'PATCH') {
                 await env.DB.prepare('UPDATE subject_events SET title=?, description=?, event_date=?, witnesses=?, location_context=? WHERE id=?').bind(p.title, p.description, p.date, p.witnesses, p.location_context, p.id).run();
             } else {
                 await env.DB.prepare('INSERT INTO subject_events (subject_id, title, description, event_date, witnesses, location_context, created_at) VALUES (?,?,?,?,?,?,?)').bind(p.subjectId, p.title, p.description, p.date, p.witnesses, p.location_context, isoTimestamp()).run();
             }
             return response({success:true});
        }
        if (path === '/api/routine') {
             const p = await req.json();
             await env.DB.prepare('INSERT INTO subject_routine (subject_id, activity, location, schedule, notes, created_at) VALUES (?,?,?,?,?,?)').bind(p.subjectId, p.activity, p.location, p.schedule, p.notes, isoTimestamp()).run();
             return response({success:true});
        }
        if (path === '/api/relationship') {
             const p = await req.json();
             await env.DB.prepare('INSERT INTO subject_relationships (subject_a_id, custom_name, relationship_type, notes, created_at) VALUES (?,?,?,?,?)').bind(p.subjectA, p.customName, p.type, p.notes, isoTimestamp()).run();
             return response({success:true});
        }
        if (path === '/api/media-link') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_media (subject_id, media_type, external_url, description, created_at) VALUES (?,?,?,?,?)').bind(p.subjectId, 'link', p.url, p.description, isoTimestamp()).run();
            return response({success:true});
        }
        if (path === '/api/avatar-link') {
             const p = await req.json();
             await env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(p.url, p.subjectId).run();
             return response({success:true});
        }
        if (path === '/api/share-links') return req.method === 'POST' ? handleCreateShareLink(req, env.DB, url.origin) : response({links: (await env.DB.prepare('SELECT * FROM subject_shares WHERE subject_id = ? ORDER BY created_at DESC').bind(url.searchParams.get('subjectId')).all()).results});
        if (path.match(/^\/api\/shared\/([a-zA-Z0-9]+)$/)) return handleGetSharedSubject(env.DB, path.split('/').pop());
        
        if (path === '/api/reset-system') return handleResetSystem(req, env.DB);
        if (path === '/api/delete') return handleDeleteItem(req, env.DB, (await req.json()).table, (await req.json()).id);
        
        // Login & Uploads (simplified)
        if (path === '/api/login') {
            const { email } = await req.json();
            // In a real app check password. Here assuming single user or setup done.
            // For this snippet, assuming the old login logic persists or is simplified:
            let admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
            if(!admin) { // Auto-create first admin for ease of use in this pivot
                 await env.DB.prepare('INSERT INTO admins (email, created_at) VALUES (?,?)').bind(email, isoTimestamp()).run();
                 admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
            }
            return response({ id: admin.id });
        }
        if (path === '/api/upload-photo' || path === '/api/upload-avatar') {
            const { subjectId, data, filename, contentType } = await req.json();
            const key = `img-${Date.now()}-${sanitizeFileName(filename)}`;
            await env.BUCKET.put(key, Uint8Array.from(atob(data), c => c.charCodeAt(0)), { httpMetadata: { contentType } });
            if(path.includes('avatar')) await env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
            else await env.DB.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, created_at) VALUES (?,?,?,?)').bind(subjectId, key, contentType, isoTimestamp()).run();
            return response({ success: true });
        }
        if (path.startsWith('/api/media/')) {
            const obj = await env.BUCKET.get(path.replace('/api/media/', ''));
            return obj ? new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType } }) : new Response('404', { status: 404 });
        }

        return new Response('Not Found', { status: 404 });
    } catch(e) { return errorResponse(e.message); }
  }
};
