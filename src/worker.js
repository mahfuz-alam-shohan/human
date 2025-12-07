const encoder = new TextEncoder();

// --- Configuration & Constants ---
const APP_TITLE = "PEOPLE OS // INTELLIGENCE";

// --- Helper Functions ---

function isoTimestamp() { return new Date().toISOString(); }

async function hashPassword(secret) {
  const data = encoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
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

function errorResponse(msg, status = 500) {
    return response({ error: msg }, status);
}

function safeVal(v) {
    return v === undefined || v === '' ? null : v;
}

// --- Database Layer ---

let schemaInitialized = false;

async function ensureSchema(db) {
  if (schemaInitialized) return;
  try {
      await db.prepare("PRAGMA foreign_keys = ON;").run();

      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY, 
            email TEXT UNIQUE, 
            password_hash TEXT, 
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
          created_at TEXT, 
          updated_at TEXT
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
          views INTEGER DEFAULT 0,
          started_at TEXT, 
          created_at TEXT
        )`)
      ]);

      schemaInitialized = true;
  } catch (err) { 
      console.error("Init Error", err); 
  }
}

async function nukeDatabase(db) {
    const tables = [
        'subject_shares', 'subject_locations', 'subject_interactions', 
        'subject_relationships', 'subject_media', 'subject_intel', 
        'subjects', 'admins'
    ];
    
    await db.prepare("PRAGMA foreign_keys = OFF;").run();
    for(const t of tables) {
        try { await db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); } catch(e) { console.error(`Failed to drop ${t}`, e); }
    }
    await db.prepare("PRAGMA foreign_keys = ON;").run();
    schemaInitialized = false; 
    return true;
}

// --- Analysis Engine ---

function analyzeProfile(subject, interactions, intel) {
    // Simple aggregator for the new "clean" vibe
    const textBank = [
        subject.modus_operandi, 
        subject.notes,
        subject.occupation,
        ...interactions.map(i => i.transcript),
        ...intel.map(i => i.value)
    ].join(' ').toLowerCase();

    const tags = [];
    
    // Auto-tagging based on content (Extensible)
    if (textBank.includes('money') || textBank.includes('finance') || textBank.includes('bank')) tags.push('Financial');
    if (textBank.includes('family') || textBank.includes('spouse') || textBank.includes('child')) tags.push('Family');
    if (textBank.includes('politics') || textBank.includes('government')) tags.push('Political');
    if (textBank.includes('tech') || textBank.includes('code') || textBank.includes('cyber')) tags.push('Technical');
    
    return {
        summary: tags.length > 0 ? `Key Context: ${tags.join(', ')}` : "No specific context tags generated.",
        tags: tags,
        generated_at: isoTimestamp()
    };
}

// --- API Handlers ---

async function handleGetDashboard(db, adminId) {
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Profile Created' as desc, created_at as date FROM subjects WHERE admin_id = ?
        UNION ALL
        SELECT 'interaction' as type, subject_id as ref_id, type as title, conclusion as desc, created_at as date FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        UNION ALL
        SELECT 'location' as type, subject_id as ref_id, name as title, type as desc, created_at as date FROM subject_locations WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        ORDER BY date DESC LIMIT 50
    `).bind(adminId, adminId, adminId).all();

    const stats = await db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM subjects WHERE admin_id = ? AND is_archived = 0) as targets,
            (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as evidence,
            (SELECT COUNT(*) FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as encounters
    `).bind(adminId, adminId, adminId).first();

    return response({ feed: recent.results, stats });
}

async function handleGetSuggestions(db, adminId) {
    const occupations = await db.prepare("SELECT DISTINCT occupation FROM subjects WHERE admin_id = ?").bind(adminId).all();
    const nationalities = await db.prepare("SELECT DISTINCT nationality FROM subjects WHERE admin_id = ?").bind(adminId).all();
    
    return response({
        occupations: occupations.results.map(r => r.occupation).filter(Boolean),
        nationalities: nationalities.results.map(r => r.nationality).filter(Boolean)
    });
}

async function handleGetSubjectFull(db, id) {
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
    if (!subject) return errorResponse("Subject not found", 404);

    const [media, intel, relationships, interactions, locations] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_intel WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
        db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.id as target_id
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(id, id, id).all(),
        db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_locations WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all()
    ]);

    return response({
        ...subject,
        media: media.results,
        intel: intel.results,
        relationships: relationships.results,
        interactions: interactions.results,
        locations: locations.results
    });
}

// Global Map Data
async function handleGetMapData(db, adminId) {
    const query = `
        SELECT l.id, l.name, l.lat, l.lng, l.type, s.id as subject_id, s.full_name, s.avatar_path, s.status
        FROM subject_locations l
        JOIN subjects s ON l.subject_id = s.id
        WHERE s.admin_id = ? AND s.is_archived = 0 AND l.lat IS NOT NULL
    `;
    const res = await db.prepare(query).bind(adminId).all();
    return response(res.results);
}

// Global Network Data (New)
async function handleGetNetworkData(db, adminId) {
    const subjects = await db.prepare("SELECT id, full_name, avatar_path, status FROM subjects WHERE admin_id = ? AND is_archived = 0").bind(adminId).all();
    const relationships = await db.prepare(`
        SELECT r.subject_a_id, r.subject_b_id, r.relationship_type 
        FROM subject_relationships r
        JOIN subjects sa ON r.subject_a_id = sa.id
        WHERE sa.admin_id = ?
    `).bind(adminId).all();

    return response({
        nodes: subjects.results.map(s => ({
            id: s.id,
            label: s.full_name,
            image: s.avatar_path, // Will need resolution on frontend
            status: s.status
        })),
        edges: relationships.results.map(r => ({
            from: r.subject_a_id,
            to: r.subject_b_id,
            label: r.relationship_type
        }))
    });
}

// --- Share Logic ---

async function handleCreateShareLink(req, db, origin) {
    const { subjectId, durationMinutes } = await req.json();
    if (!subjectId) return errorResponse('subjectId required', 400);
    const durationSeconds = Math.max(30, Math.floor((durationMinutes || 60) * 60)); 
    const token = generateToken();
    await db.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, created_at, is_active, views) VALUES (?, ?, ?, ?, 1, 0)')
        .bind(subjectId, token, durationSeconds, isoTimestamp()).run();
    
    const url = `${origin}/share/${token}`;
    return response({ url, token, duration_seconds: durationSeconds });
}

async function handleListShareLinks(db, subjectId) {
    const res = await db.prepare('SELECT * FROM subject_shares WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
    return response(res.results);
}

async function handleRevokeShareLink(db, token) {
    await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE token = ?').bind(token).run();
    return response({ success: true });
}

async function handleGetSharedSubject(db, token) {
    const link = await db.prepare('SELECT * FROM subject_shares WHERE token = ?').bind(token).first();
    if (!link) return errorResponse('Link Invalid', 404);
    if (!link.is_active) return errorResponse('Link Revoked', 410);

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
            return errorResponse('Link Expired', 410);
        }
        
        await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();

        const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(link.subject_id).first();
        const interactions = await db.prepare('SELECT date, type, conclusion FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC LIMIT 10').bind(link.subject_id).all();
        const locations = await db.prepare('SELECT name, type, address, lat, lng FROM subject_locations WHERE subject_id = ?').bind(link.subject_id).all();
        const media = await db.prepare('SELECT object_key, description, content_type FROM subject_media WHERE subject_id = ?').bind(link.subject_id).all();

        return response({
            ...subject,
            interactions: interactions.results,
            locations: locations.results,
            media: media.results,
            meta: { remaining_seconds: Math.floor(remaining) }
        });
    }
    return errorResponse('Invalid Config', 500);
}


// --- Frontend: Shared Link View (Clean Read-Only) ---
function serveSharedHtml(token) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Subject Profile</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <style>
        body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #1e293b; }
        .card { background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-4 bg-slate-50">
    <div id="app" class="w-full max-w-4xl mx-auto my-8">
        <div v-if="loading" class="text-center py-20">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500"></i>
            <p class="mt-4 text-sm text-slate-400">Loading Profile...</p>
        </div>
        <div v-else-if="error" class="text-center py-20">
            <h1 class="text-2xl font-bold text-slate-800 mb-2">Unavailable</h1>
            <p class="text-slate-500">{{error}}</p>
        </div>
        <div v-else class="space-y-6">
            <div class="card p-6 flex items-center justify-between bg-white">
                <div>
                    <h1 class="text-xl font-bold text-slate-800">Subject Profile</h1>
                    <div class="text-sm text-slate-500">Shared Access View</div>
                </div>
                <div v-if="meta" class="text-right">
                    <div class="text-[10px] text-slate-400 uppercase font-bold">Expires In</div>
                    <div class="font-mono text-xl text-slate-700">{{ formatTime(timer) }}</div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Sidebar Info -->
                <div class="space-y-6">
                    <div class="card p-2">
                        <img :src="resolveImg(data.avatar_path)" class="w-full aspect-square object-cover rounded-lg bg-slate-100">
                    </div>
                    <div class="card p-6 space-y-4">
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Details</h3>
                        <div class="grid grid-cols-1 gap-4 text-sm">
                            <div class="flex justify-between border-b border-slate-100 pb-2">
                                <span class="text-slate-500">Occupation</span>
                                <span class="font-medium">{{data.occupation || 'N/A'}}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-100 pb-2">
                                <span class="text-slate-500">Nationality</span>
                                <span class="font-medium">{{data.nationality || 'N/A'}}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-100 pb-2">
                                <span class="text-slate-500">Age</span>
                                <span class="font-medium">{{data.age || 'N/A'}}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Main Content -->
                <div class="md:col-span-2 space-y-6">
                    <div class="card p-8">
                        <h2 class="text-3xl font-bold text-slate-900 mb-2">{{data.full_name}}</h2>
                        <div class="text-blue-600 text-sm font-medium mb-6" v-if="data.alias">{{data.alias}}</div>
                        
                        <div class="prose prose-sm max-w-none text-slate-600">
                            <p class="whitespace-pre-wrap">{{ data.notes || data.modus_operandi || 'No detailed biography available.' }}</p>
                        </div>
                    </div>

                    <div class="card p-6">
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Locations</h3>
                        <div class="space-y-2">
                            <div v-for="loc in data.locations" class="p-3 bg-slate-50 rounded border border-slate-100 flex justify-between">
                                <span class="font-medium text-slate-700">{{loc.name}}</span>
                                <span class="text-sm text-slate-500">{{loc.address}}</span>
                            </div>
                             <div v-if="!data.locations?.length" class="text-slate-400 text-sm italic">No locations recorded.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script>
        const { createApp, ref, onMounted } = Vue;
        createApp({
            setup() {
                const loading = ref(true);
                const error = ref(null);
                const data = ref(null);
                const meta = ref(null);
                const timer = ref(0);
                const token = window.location.pathname.split('/').pop();
                
                const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : 'https://www.transparenttextures.com/patterns/cubes.png';
                const formatTime = (s) => {
                    const m = Math.floor(s / 60);
                    const sec = Math.floor(s % 60);
                    return \`\${m}:\${sec.toString().padStart(2, '0')}\`;
                };
                
                onMounted(async () => {
                    try {
                        const res = await fetch('/api/share/' + token);
                        const json = await res.json();
                        if(json.error) throw new Error(json.error);
                        data.value = json;
                        meta.value = json.meta;
                        if(json.meta?.remaining_seconds) {
                            timer.value = json.meta.remaining_seconds;
                            setInterval(() => {
                                if(timer.value > 0) timer.value--;
                                else if(!error.value && timer.value <= 0) window.location.reload();
                            }, 1000);
                        }
                        loading.value = false;
                    } catch(e) {
                        error.value = e.message;
                        loading.value = false;
                    }
                });
                return { loading, error, data, meta, timer, resolveImg, formatTime };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
}


// --- Frontend: Main Admin App (v3.0 - Intelligence Edition) ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-100">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>PEOPLE OS // INTELLIGENCE</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-timeline/standalone/umd/vis-timeline-graph2d.min.js"></script>
  <link href="https://unpkg.com/vis-timeline/styles/vis-timeline-graph2d.min.css" rel="stylesheet" type="text/css" />
  
  <style>
    :root { --primary: #2563eb; --bg-dark: #0f172a; }
    body { font-family: 'Inter', sans-serif; color: #334155; background: #f1f5f9; }
    
    .glass { background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border-radius: 0.75rem; }
    .glass-dark { background: #1e293b; color: white; border: 1px solid #334155; }
    .glass-input { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; transition: all 0.2s; border-radius: 0.5rem; }
    .glass-input:focus { border-color: var(--primary); outline: none; ring: 2px solid #bfdbfe; }
    
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }

    /* Map & Network Overrides */
    .vis-network { outline: none; }
    .leaflet-popup-content-wrapper { border-radius: 0.5rem; font-family: 'Inter'; font-size: 13px; }
    .leaflet-popup-content-wrapper .leaflet-popup-content { margin: 12px; }
    .leaflet-container { font: inherit; }

    @media print {
        .no-print { display: none !important; }
        body { background: white; }
        .glass { box-shadow: none; border: 1px solid #000; }
    }
  </style>
</head>
<body class="h-full overflow-hidden">
  <div id="app" class="h-full flex flex-col">

    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 bg-slate-900 relative">
        <div class="w-full max-w-sm glass p-8 shadow-2xl relative z-10">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-3xl shadow-lg">
                    <i class="fa-solid fa-users-viewfinder"></i>
                </div>
                <h1 class="text-2xl font-bold text-slate-800 tracking-tight">PEOPLE<span class="text-blue-600">OS</span></h1>
                <p class="text-slate-500 text-sm mt-1">Personal Intelligence System</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Identity" class="glass-input w-full p-3 text-sm" required>
                <input v-model="auth.password" type="password" placeholder="Passkey" class="glass-input w-full p-3 text-sm" required>
                <button type="submit" :disabled="loading" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-lg text-sm transition-all shadow-lg">
                    {{ loading ? 'Authenticating...' : 'Enter System' }}
                </button>
            </form>
        </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
        
        <!-- SIDEBAR -->
        <nav class="hidden md:flex flex-col w-20 bg-slate-900 items-center py-6 z-20 shadow-xl no-print">
            <div class="mb-8 text-white text-2xl"><i class="fa-solid fa-layer-group"></i></div>
            <div class="flex-1 space-y-4 w-full px-3">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'" class="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all" :title="t.label">
                    <i :class="t.icon" class="text-xl"></i>
                </button>
            </div>
            <button @click="openSettings" class="text-slate-500 hover:text-white p-4"><i class="fa-solid fa-gear"></i></button>
        </nav>

        <!-- MOBILE HEADER -->
        <header class="md:hidden h-14 bg-slate-900 flex items-center justify-between px-4 text-white z-20 shrink-0">
            <span class="font-bold">PEOPLE<span class="text-blue-500">OS</span></span>
            <div class="flex gap-4">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'text-blue-400' : 'text-slate-500'"><i :class="t.icon"></i></button>
            </div>
        </header>

        <!-- CONTENT -->
        <main class="flex-1 relative overflow-hidden bg-slate-50 flex flex-col">

            <!-- DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="glass p-5 border-t-4 border-blue-500">
                            <div class="text-xs text-slate-500 font-bold uppercase tracking-wide">Total Subjects</div>
                            <div class="text-3xl font-bold text-slate-800 mt-1">{{ stats.targets || 0 }}</div>
                        </div>
                        <div class="glass p-5 border-t-4 border-emerald-500">
                            <div class="text-xs text-slate-500 font-bold uppercase tracking-wide">Total Intel</div>
                            <div class="text-3xl font-bold text-slate-800 mt-1">{{ stats.encounters || 0 }}</div>
                        </div>
                        <div class="glass p-5 border-t-4 border-purple-500">
                            <div class="text-xs text-slate-500 font-bold uppercase tracking-wide">Assets</div>
                            <div class="text-3xl font-bold text-slate-800 mt-1">{{ stats.evidence || 0 }}</div>
                        </div>
                        <button @click="openModal('add-subject')" class="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1">
                            <i class="fa-solid fa-plus text-xl"></i>
                            <span class="text-xs font-bold uppercase">Add Subject</span>
                        </button>
                    </div>

                    <div class="glass overflow-hidden">
                        <div class="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wide">Recent Intelligence</h3>
                            <button @click="fetchData" class="text-slate-400 hover:text-blue-600"><i class="fa-solid fa-rotate-right"></i></button>
                        </div>
                        <div class="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 hover:bg-slate-50 cursor-pointer flex gap-4 items-start transition-colors">
                                <div class="w-24 shrink-0 text-xs text-slate-400 text-right font-mono pt-1">{{ new Date(item.date).toLocaleDateString() }}</div>
                                <div>
                                    <div class="text-sm font-bold text-slate-800">{{ item.title }}</div>
                                    <div class="text-xs text-slate-500 mt-1">{{ item.desc }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- NEXUS (GLOBAL GRAPH) -->
            <div v-if="currentTab === 'nexus'" class="flex-1 flex relative bg-slate-900">
                <div id="nexusGraph" class="w-full h-full z-0"></div>
                
                <!-- Nexus Overlay UI -->
                <div class="absolute top-4 left-4 z-10 flex flex-col gap-2 w-72">
                    <div class="glass-dark p-3 rounded-lg shadow-xl">
                        <div class="flex items-center gap-2 bg-slate-800 rounded px-2 py-1.5 border border-slate-700">
                            <i class="fa-solid fa-search text-slate-400 text-xs"></i>
                            <input v-model="nexusSearch" @input="searchNexus" placeholder="Find Node..." class="bg-transparent border-none outline-none text-white text-xs w-full">
                        </div>
                        <div v-if="nexusSearchResults.length" class="mt-2 max-h-40 overflow-y-auto bg-slate-800 rounded border border-slate-700">
                            <div v-for="n in nexusSearchResults" @click="focusNode(n.id)" class="p-2 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer flex items-center gap-2">
                                <img :src="resolveImg(n.image)" class="w-5 h-5 rounded-full object-cover">
                                {{n.label}}
                            </div>
                        </div>
                    </div>
                    <div class="glass-dark p-3 rounded-lg shadow-xl text-xs text-slate-400">
                        <p><strong class="text-white">{{nexusStats.nodes}}</strong> Subjects</p>
                        <p><strong class="text-white">{{nexusStats.edges}}</strong> Connections</p>
                    </div>
                </div>
                
                <div class="absolute bottom-6 right-6 z-10">
                    <button @click="reloadNexus" class="bg-slate-800 text-white p-3 rounded-full shadow-lg hover:bg-slate-700"><i class="fa-solid fa-rotate"></i></button>
                </div>
            </div>

            <!-- GLOBAL MAP -->
            <div v-if="currentTab === 'map'" class="flex-1 relative bg-slate-200">
                <div id="globalRefMap" class="w-full h-full z-0"></div>
                <div class="absolute top-4 right-4 z-[400] glass p-4 shadow-xl max-w-xs">
                     <h3 class="text-xs font-bold text-slate-800 uppercase mb-2">Location Index</h3>
                     <div class="max-h-60 overflow-y-auto space-y-2">
                         <div v-for="loc in allLocations" @click="flyTo(loc, 'globalRefMap')" class="text-xs p-2 bg-slate-50 hover:bg-blue-50 cursor-pointer rounded border border-slate-200 flex justify-between items-center group">
                             <div class="truncate flex-1">
                                 <div class="font-bold text-slate-700">{{loc.full_name}}</div>
                                 <div class="text-slate-500 truncate">{{loc.name}}</div>
                             </div>
                             <i class="fa-solid fa-location-arrow text-slate-300 group-hover:text-blue-500"></i>
                         </div>
                     </div>
                </div>
            </div>

            <!-- TARGETS LIST -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col">
                <div class="p-4 border-b border-slate-200 bg-white flex gap-3 shadow-sm z-10 no-print">
                    <div class="relative flex-1 max-w-xl mx-auto">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-slate-400"></i>
                        <input v-model="search" placeholder="Search Database..." class="w-full bg-slate-100 border-none rounded-lg py-3 pl-10 text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 bg-slate-50">
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto content-start">
                        <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="glass p-4 cursor-pointer hover:shadow-md transition-all group flex items-center gap-4 bg-white">
                            <div class="w-14 h-14 rounded-full bg-slate-200 overflow-hidden shrink-0 border border-slate-100">
                                <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all">
                                <div v-else class="w-full h-full flex items-center justify-center text-slate-400"><i class="fa-solid fa-user"></i></div>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="font-bold text-slate-800 text-sm truncate">{{ s.full_name }}</div>
                                <div class="text-xs text-slate-500 truncate">{{ s.occupation || 'No Data' }}</div>
                                <div class="flex gap-2 mt-1">
                                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold uppercase">{{ s.status }}</span>
                                </div>
                            </div>
                            <i class="fa-solid fa-chevron-right text-slate-300"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SUBJECT DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col h-full bg-white">
                <!-- Toolbar -->
                <div class="h-14 border-b border-slate-200 flex items-center px-4 justify-between bg-white shrink-0 z-10 no-print">
                    <div class="flex items-center gap-4">
                        <button @click="changeTab('targets')" class="text-slate-400 hover:text-slate-800 transition-colors"><i class="fa-solid fa-arrow-left"></i> Back</button>
                    </div>
                    <div class="flex gap-2">
                        <button @click="openModal('share-secure')" class="text-slate-400 hover:text-blue-600 px-3 transition-colors text-sm" title="Share"><i class="fa-solid fa-share-nodes"></i> Share</button>
                        <button @click="printDossier" class="text-slate-400 hover:text-slate-800 px-3 transition-colors text-sm" title="Print"><i class="fa-solid fa-print"></i></button>
                    </div>
                </div>

                <!-- Profile Header -->
                <div class="p-6 md:p-8 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row gap-6 items-start">
                    <div class="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-white shadow-sm border border-slate-200 p-1 shrink-0 relative group overflow-hidden">
                        <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover rounded-lg">
                        <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white" @click="triggerUpload('avatar')"><i class="fa-solid fa-camera"></i></div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h1 class="text-2xl md:text-3xl font-bold text-slate-900">{{ selected.full_name }}</h1>
                        <p class="text-slate-500 text-sm mb-4">{{ selected.alias ? '"'+selected.alias+'"' : '' }} {{ selected.occupation ? ' • ' + selected.occupation : '' }}</p>
                        <div class="flex flex-wrap gap-2">
                            <span class="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600">{{selected.nationality || 'Nationality Unk.'}}</span>
                            <span class="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600">{{selected.age ? selected.age + ' Years' : 'Age Unk.'}}</span>
                            <button @click="openModal('edit-profile')" class="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs font-bold uppercase ml-2">Edit Details</button>
                        </div>
                    </div>
                </div>

                <!-- Sub Tabs -->
                <div class="flex border-b border-slate-200 overflow-x-auto bg-white shrink-0 no-print px-4">
                    <button v-for="t in ['overview', 'locations', 'network', 'intel', 'assets']" 
                        @click="changeSubTab(t)" 
                        :class="subTab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'"
                        class="px-5 py-4 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors">
                        {{ t }}
                    </button>
                </div>

                <!-- Detail Content -->
                <div class="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50">
                    
                    <!-- OVERVIEW -->
                    <div v-if="subTab === 'overview'" class="max-w-4xl space-y-6">
                        <div class="card p-6">
                            <h3 class="text-sm font-bold text-slate-900 mb-4">Bio / Notes</h3>
                            <p class="text-slate-600 whitespace-pre-wrap leading-relaxed text-sm">{{ selected.notes || selected.modus_operandi || 'No notes added.' }}</p>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="card p-6">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-sm font-bold text-slate-900">Contact Info</h3>
                                </div>
                                <div class="space-y-3 text-sm">
                                    <div v-if="selected.contact" class="flex gap-3"><i class="fa-solid fa-address-card text-slate-400 mt-1"></i> <span>{{selected.contact}}</span></div>
                                    <div v-if="selected.social_links" class="flex gap-3"><i class="fa-solid fa-link text-slate-400 mt-1"></i> <span class="text-blue-600 truncate">{{selected.social_links}}</span></div>
                                    <div v-if="!selected.contact && !selected.social_links" class="text-slate-400 italic">No contact info recorded.</div>
                                </div>
                            </div>
                             <div class="card p-6">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-sm font-bold text-slate-900">Digital Footprint</h3>
                                </div>
                                <div class="space-y-2 text-sm">
                                    <div v-for="(val, key) in parseDigital(selected.digital_identifiers)" class="flex justify-between border-b border-slate-50 pb-1">
                                        <span class="text-slate-500 capitalize">{{key}}</span>
                                        <span class="font-mono text-slate-700">{{val}}</span>
                                    </div>
                                    <div v-if="!selected.digital_identifiers" class="text-slate-400 italic">No identifiers.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- LOCATIONS -->
                    <div v-if="subTab === 'locations'" class="h-full flex flex-col max-w-6xl mx-auto">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-lg font-bold text-slate-800">Known Locations</h2>
                            <button @click="openModal('add-location')" class="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700">+ Add Location</button>
                        </div>
                        <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 h-[500px]">
                            <div class="md:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden relative">
                                <div id="subjectMap" class="w-full h-full z-0"></div>
                            </div>
                            <div class="space-y-3 overflow-y-auto">
                                <div v-for="loc in selected.locations" :key="loc.id" class="card p-4 cursor-pointer hover:border-blue-500 transition-colors group" @click="flyTo(loc, 'subjectMap')">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <div class="font-bold text-slate-800 text-sm">{{loc.name}}</div>
                                            <div class="text-xs text-slate-500 mt-1">{{loc.address}}</div>
                                        </div>
                                        <span class="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-600 font-bold uppercase">{{loc.type}}</span>
                                    </div>
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-red-400 hover:text-red-600 text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Remove</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- NETWORK (Personal) -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                             <h2 class="text-lg font-bold text-slate-800">Connections</h2>
                             <button @click="openModal('add-rel')" class="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700">+ Connect</button>
                        </div>
                        <div class="flex-1 card relative overflow-hidden min-h-[500px]">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
                    </div>

                    <!-- INTEL -->
                    <div v-if="subTab === 'intel'" class="max-w-3xl mx-auto space-y-6">
                        <div class="flex justify-between items-center">
                            <h2 class="text-lg font-bold text-slate-800">Interaction Log</h2>
                            <button @click="openModal('add-interaction')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700">Log Interaction</button>
                        </div>
                        
                        <div class="relative border-l-2 border-slate-200 ml-4 space-y-8 pl-8 py-2">
                             <div v-for="ix in selected.interactions" :key="ix.id" class="relative">
                                <span class="absolute -left-[41px] top-0 w-5 h-5 rounded-full bg-slate-100 border-2 border-blue-500"></span>
                                <div class="card p-5 hover:shadow-md transition-shadow">
                                    <div class="flex justify-between items-start mb-2">
                                        <div>
                                            <span class="text-blue-600 font-bold text-xs uppercase">{{ix.type}}</span>
                                            <span class="text-slate-400 text-xs ml-2">{{ new Date(ix.date).toLocaleString() }}</span>
                                        </div>
                                        <button @click="deleteItem('subject_interactions', ix.id)" class="text-slate-300 hover:text-red-500"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                    <p class="text-slate-700 text-sm whitespace-pre-wrap">{{ix.transcript}}</p>
                                </div>
                             </div>
                             <div v-if="!selected.interactions.length" class="text-slate-400 italic text-sm">No interactions logged.</div>
                        </div>
                    </div>

                    <!-- ASSETS -->
                    <div v-if="subTab === 'assets'" class="max-w-6xl mx-auto">
                        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                            <div @click="triggerUpload('media')" class="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 text-slate-400 hover:text-blue-500 transition-colors">
                                <i class="fa-solid fa-cloud-arrow-up text-2xl mb-2"></i>
                                <span class="text-xs font-bold uppercase">Upload</span>
                            </div>
                            <div v-for="m in selected.media" :key="m.id" class="relative group aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                                <img v-if="m.content_type.startsWith('image')" :src="'/api/media/' + m.object_key" class="w-full h-full object-cover">
                                <div v-else class="w-full h-full flex items-center justify-center text-slate-400"><i class="fa-solid fa-file text-3xl"></i></div>
                                
                                <a :href="'/api/media/' + m.object_key" download class="absolute inset-0 z-10"></a>
                                <div class="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-white text-[10px] truncate">{{m.description}}</div>
                                <button @click.stop="deleteItem('subject_media', m.id)" class="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-20"><i class="fa-solid fa-times"></i></button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </main>
    </div>

    <!-- MODALS (Generic) -->
    <div v-if="modal.active" class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
                <h3 class="text-lg font-bold text-slate-800">{{ modalTitle }}</h3>
                <button @click="closeModal" class="text-slate-400 hover:text-slate-800"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            
            <div class="overflow-y-auto p-6 space-y-4">
                <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-4">
                    <input v-model="forms.subject.full_name" placeholder="Full Name" class="glass-input w-full p-3 text-sm" required>
                    <input v-model="forms.subject.alias" placeholder="Alias / Nickname" class="glass-input w-full p-3 text-sm">
                    <div class="grid grid-cols-2 gap-4">
                        <input v-model="forms.subject.occupation" list="list-occupations" placeholder="Occupation" class="glass-input p-3 text-sm">
                        <input v-model="forms.subject.nationality" list="list-nationalities" placeholder="Nationality" class="glass-input p-3 text-sm">
                    </div>
                    <textarea v-model="forms.subject.digital_identifiers" placeholder="Digital Identifiers (JSON format: {'ip':'...'})" rows="2" class="glass-input w-full p-3 text-sm font-mono"></textarea>
                    <textarea v-model="forms.subject.modus_operandi" placeholder="Biography / Notes" rows="4" class="glass-input w-full p-3 text-sm"></textarea>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm">Save Profile</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="glass-input p-3 text-sm" required>
                        <select v-model="forms.interaction.type" class="glass-input p-3 text-sm">
                            <option>Meeting</option><option>Call</option><option>Email</option><option>Observation</option>
                        </select>
                    </div>
                    <textarea v-model="forms.interaction.transcript" placeholder="Details..." rows="6" class="glass-input w-full p-3 text-sm"></textarea>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm">Log Entry</button>
                </form>

                <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                     <div class="relative z-[100]">
                         <input v-model="locationSearchQuery" @keyup.enter="searchLocations" placeholder="Search Place..." class="glass-input w-full p-3 pl-10 text-sm">
                         <i class="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-slate-400"></i>
                         <div v-if="locationSearchResults.length" class="absolute w-full bg-white border border-slate-200 max-h-48 overflow-y-auto mt-1 shadow-xl rounded z-[101]">
                             <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-slate-50 cursor-pointer text-xs border-b border-slate-100 text-slate-700">
                                 {{ res.display_name }}
                             </div>
                         </div>
                    </div>
                    <div class="h-48 w-full bg-slate-100 rounded border border-slate-200 relative overflow-hidden">
                        <div id="locationPickerMap" class="absolute inset-0 z-0"></div>
                    </div>
                    <input v-model="forms.location.name" placeholder="Location Name (e.g. Home, Work)" class="glass-input w-full p-3 text-sm">
                    <select v-model="forms.location.type" class="glass-input w-full p-3 text-sm">
                        <option>Residence</option><option>Workplace</option><option>Frequent</option><option>Other</option>
                    </select>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm">Save Location</button>
                </form>

                <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                    <select v-model="forms.rel.targetId" class="glass-input w-full p-3 text-sm">
                        <option v-for="s in subjects" :value="s.id">{{s.full_name}} ({{s.alias}})</option>
                    </select>
                    <input v-model="forms.rel.type" placeholder="Relationship Type (e.g. Spouse, Colleague)" class="glass-input w-full p-3 text-sm">
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm">Connect</button>
                 </form>

                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <div class="bg-slate-50 p-4 rounded border border-slate-200 flex gap-2">
                        <input v-model.number="forms.share.minutes" type="number" class="glass-input w-24 text-center" placeholder="Hrs">
                        <button @click="createShareLink" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-sm">Generate Link</button>
                    </div>
                    <div class="space-y-2 max-h-60 overflow-y-auto">
                        <div v-for="link in activeShareLinks" class="flex justify-between items-center p-3 bg-white rounded border border-slate-200">
                            <span class="text-xs font-mono text-slate-500">...{{link.token.slice(-6)}} <span v-if="!link.is_active" class="text-red-500">[Revoked]</span></span>
                            <div class="flex gap-2">
                                <button @click="copyToClipboard(getShareUrl(link.token))" class="text-slate-400 hover:text-blue-600"><i class="fa-regular fa-copy"></i></button>
                                <button v-if="link.is_active" @click="revokeLink(link.token)" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-ban"></i></button>
                            </div>
                        </div>
                    </div>
                 </div>

            </div>
        </div>
    </div>

    <!-- Hidden File Input -->
    <input type="file" ref="fileInput" class="hidden" @change="handleFile">
    <datalist id="list-occupations"><option v-for="i in suggestions.occupations" :value="i"></option></datalist>
    <datalist id="list-nationalities"><option v-for="i in suggestions.nationalities" :value="i"></option></datalist>

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        const view = ref('auth');
        const loading = ref(false);
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', icon: 'fa-solid fa-chart-pie', label: 'Dashboard' },
            { id: 'targets', icon: 'fa-solid fa-address-card', label: 'Subjects' },
            { id: 'nexus', icon: 'fa-solid fa-circle-nodes', label: 'Nexus Graph' },
            { id: 'map', icon: 'fa-solid fa-earth-americas', label: 'Global Map' }
        ];
        
        // Router Logic
        const params = new URLSearchParams(window.location.search);
        const currentTab = ref(params.get('tab') || 'dashboard');
        const subTab = ref(params.get('subTab') || 'overview');
        
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const suggestions = reactive({ occupations: [], nationalities: [] });
        const selected = ref(null);
        const activeShareLinks = ref([]);
        const search = ref('');
        const modal = reactive({ active: null, shake: false });
        
        // Map & Location
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        const allLocations = ref([]);
        let pickerMapInstance = null;
        let mapInstance = null;
        let nexusNetwork = null;
        let nexusData = { nodes: [], edges: [] };
        const nexusSearch = ref('');
        const nexusSearchResults = ref([]);
        const nexusStats = reactive({ nodes: 0, edges: 0 });

        const forms = reactive({
            subject: {}, interaction: {}, location: {}, intel: {}, rel: {}, share: { minutes: 24 }
        });

        const filteredSubjects = computed(() => subjects.value.filter(s => 
            s.full_name.toLowerCase().includes(search.value.toLowerCase()) || 
            (s.alias && s.alias.toLowerCase().includes(search.value.toLowerCase()))
        ));

        const modalTitle = computed(() => {
             const m = { 'add-subject':'New Subject', 'edit-profile':'Edit Details', 'add-interaction':'Log Interaction', 'add-location':'Add Location', 'add-rel':'Connect Subject', 'share-secure':'Share Profile' };
             return m[modal.active] || 'System Dialog';
        });

        const api = async (ep, opts = {}) => {
            try {
                const res = await fetch('/api' + ep, opts);
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                return data;
            } catch(e) { alert(e.message); throw e; }
        };

        const handleAuth = async () => {
            loading.value = true;
            try {
                const res = await api('/login', { method: 'POST', body: JSON.stringify(auth) });
                localStorage.setItem('admin_id', res.id);
                view.value = 'app';
                fetchData();
            } catch(e) {} finally { loading.value = false; }
        };

        const fetchData = async () => {
            const adminId = localStorage.getItem('admin_id');
            const [d, s, sugg] = await Promise.all([
                api('/dashboard?adminId='+adminId),
                api('/subjects?adminId='+adminId),
                api('/suggestions?adminId='+adminId)
            ]);
            stats.value = d.stats;
            feed.value = d.feed;
            subjects.value = s;
            Object.assign(suggestions, sugg);
        };

        const viewSubject = async (id) => {
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            subTab.value = 'overview'; 
            search.value = ''; // clear search
        };

        // --- Nexus Graph Functions ---
        const initNexus = async () => {
            const container = document.getElementById('nexusGraph');
            if(!container) return;
            
            const data = await api('/network?adminId=' + localStorage.getItem('admin_id'));
            nexusData = {
                nodes: new vis.DataSet(data.nodes.map(n => ({ 
                    id: n.id, 
                    label: n.label, 
                    shape: 'circularImage', 
                    image: resolveImg(n.image),
                    size: 25,
                    borderWidth: 2,
                    color: { border: '#2563eb', background: '#ffffff' }
                }))),
                edges: new vis.DataSet(data.edges.map(e => ({ from: e.from, to: e.to, label: e.label, color: { color: '#64748b' } })))
            };
            
            nexusStats.nodes = nexusData.nodes.length;
            nexusStats.edges = nexusData.edges.length;

            const options = {
                nodes: { font: { color: '#cbd5e1' } }, // Light text for dark mode graph bg
                physics: { stabilization: false, barnesHut: { gravitationalConstant: -3000 } },
                interaction: { hover: true, tooltipDelay: 200 }
            };
            
            nexusNetwork = new vis.Network(container, nexusData, options);
            nexusNetwork.on("click", (p) => {
                if(p.nodes.length) viewSubject(p.nodes[0]);
            });
        };

        const searchNexus = () => {
            if(!nexusSearch.value) { nexusSearchResults.value = []; return; }
            nexusSearchResults.value = nexusData.nodes.get().filter(n => n.label.toLowerCase().includes(nexusSearch.value.toLowerCase()));
        };

        const focusNode = (id) => {
            nexusNetwork.focus(id, { scale: 1.5, animation: true });
            nexusSearchResults.value = [];
            nexusSearch.value = '';
        };
        
        const reloadNexus = () => initNexus();

        // --- Map Functions ---
        const initMap = (id, data, isPicker = false) => {
            const el = document.getElementById(id);
            if(!el) return;
            if(isPicker && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; }
            if(!isPicker && id === 'subjectMap' && mapInstance) { mapInstance.remove(); mapInstance = null; }
            if(!isPicker && id === 'globalRefMap' && mapInstance) { mapInstance.remove(); mapInstance = null; }

            const map = L.map(id, { attributionControl: false, zoomControl: !isPicker }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

            if(isPicker) {
                 pickerMapInstance = map;
                 map.on('dblclick', e => {
                    forms.location.lat = e.latlng.lat;
                    forms.location.lng = e.latlng.lng;
                    map.eachLayer(l => { if(l instanceof L.Marker) map.removeLayer(l); });
                    L.marker(e.latlng).addTo(map);
                 });
                 setTimeout(() => map.invalidateSize(), 100);
            } else {
                mapInstance = map;
                const bounds = [];
                data.forEach(d => {
                    if(d.lat) {
                        const m = L.marker([d.lat, d.lng]).addTo(map)
                            .bindPopup(`<b>${d.full_name || d.name}</b><br>${d.type || ''}`);
                        bounds.push([d.lat, d.lng]);
                    }
                });
                if(bounds.length) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            }
        };

        const searchLocations = async () => {
            if(!locationSearchQuery.value) return;
            try { const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(locationSearchQuery.value)}\`); locationSearchResults.value = await res.json(); } catch(e) {}
        };
        const selectLocation = (res) => {
            forms.location.lat = parseFloat(res.lat); forms.location.lng = parseFloat(res.lon); forms.location.address = res.display_name;
            locationSearchResults.value = [];
            if(pickerMapInstance) { pickerMapInstance.setView([res.lat, res.lon], 15); L.marker([res.lat, res.lon]).addTo(pickerMapInstance); }
        };

        // --- CRUD ---
        const submitSubject = async () => {
            const isEdit = modal.active === 'edit-profile';
            const ep = isEdit ? '/subjects/' + selected.value.id : '/subjects';
            const method = isEdit ? 'PATCH' : 'POST';
            await api(ep, { method, body: JSON.stringify(forms.subject) });
            if(isEdit) selected.value = { ...selected.value, ...forms.subject };
            else fetchData();
            closeModal();
        };
        const submitInteraction = async () => { await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) }); viewSubject(selected.value.id); closeModal(); };
        const submitLocation = async () => { await api('/location', { method: 'POST', body: JSON.stringify(forms.location) }); viewSubject(selected.value.id); closeModal(); };
        const submitRel = async () => { await api('/relationship', { method: 'POST', body: JSON.stringify({...forms.rel, subjectA: selected.value.id}) }); viewSubject(selected.value.id); closeModal(); };
        const deleteItem = async (table, id) => { if(confirm('Are you sure?')) { await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) }); viewSubject(selected.value.id); } };
        
        const fileInput = ref(null);
        const uploadType = ref(null);
        const triggerUpload = (type) => { uploadType.value = type; fileInput.value.click(); };
        const handleFile = async (e) => {
             const f = e.target.files[0];
             if(!f) return;
             const reader = new FileReader();
             reader.readAsDataURL(f);
             reader.onload = async (ev) => {
                 const b64 = ev.target.result.split(',')[1];
                 const ep = uploadType.value === 'avatar' ? '/upload-avatar' : '/upload-media';
                 await api(ep, { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, data: b64, filename: f.name, contentType: f.type }) });
                 viewSubject(selected.value.id);
             };
        };

        const fetchShareLinks = async () => activeShareLinks.value = await api('/share-links?subjectId=' + selected.value.id);
        const createShareLink = async () => { await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes }) }); fetchShareLinks(); };
        const revokeLink = async (t) => { await api('/share-links?token='+t, { method: 'DELETE' }); fetchShareLinks(); };
        const copyToClipboard = (t) => navigator.clipboard.writeText(t);
        const getShareUrl = (t) => window.location.origin + '/share/' + t;
        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
        
        const flyTo = (loc, mapId) => {
             const map = mapId === 'subjectMap' ? mapInstance : mapInstance; // Re-use logic for now
             map?.flyTo([loc.lat, loc.lng], 15);
        };
        const printDossier = () => window.print();
        const openSettings = () => { if(confirm("Clear ALL Data? This cannot be undone.")) api('/nuke', {method:'POST'}).then(()=>location.reload()) };
        const parseDigital = (jsonStr) => { try { return JSON.parse(jsonStr); } catch(e) { return {}; } };

        // Watchers
        const changeTab = (t) => { currentTab.value = t; };
        const changeSubTab = (t) => { subTab.value = t; };
        const openModal = (t) => {
             modal.active = t;
             if(t === 'add-subject') forms.subject = { admin_id: localStorage.getItem('admin_id'), status: 'Active' };
             if(t === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) };
             if(t === 'add-rel') forms.rel = { subjectA: selected.value.id };
             if(t === 'add-location') {
                 forms.location = { subject_id: selected.value.id };
                 locationSearchQuery.value = '';
                 locationSearchResults.value = [];
                 nextTick(() => initMap('locationPickerMap', [], true));
             }
             if(t === 'share-secure') { fetchShareLinks(); }
        };
        const closeModal = () => modal.active = null;

        watch(() => subTab.value, (val) => {
            if(val === 'locations') nextTick(() => initMap('subjectMap', selected.value.locations || []));
            if(val === 'network') nextTick(() => {
                 const container = document.getElementById('relNetwork');
                 if(!container || !selected.value) return;
                 const nodes = [{id: selected.value.id, label: selected.value.alias || selected.value.full_name, color: '#2563eb', shape:'dot', size: 30}];
                 const edges = [];
                 selected.value.relationships.forEach(r => {
                    const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                    nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, color: '#94a3b8', shape: 'dot' });
                    edges.push({ from: selected.value.id, to: targetId || 'ext-'+r.id, label: r.relationship_type });
                 });
                 new vis.Network(container, { nodes, edges }, { nodes: { font: { color: '#334155' } }, edges: { color: '#cbd5e1' } });
            });
        });
        watch(() => currentTab.value, (val) => {
             if(val === 'map') nextTick(async () => {
                 const d = await api('/map-data?adminId=' + localStorage.getItem('admin_id'));
                 allLocations.value = d;
                 initMap('globalRefMap', d);
             });
             if(val === 'nexus') nextTick(initNexus);
        });

        onMounted(() => {
            if(localStorage.getItem('admin_id')) {
                view.value = 'app';
                fetchData();
                const id = params.get('id');
                if(id) viewSubject(id);
            }
        });

        return {
            view, loading, auth, tabs, currentTab, subTab, stats, feed, subjects, filteredSubjects, selected, search, modal, forms,
            locationSearchQuery, locationSearchResults, modalTitle,
            nexusSearch, nexusSearchResults, nexusStats, allLocations,
            handleAuth, fetchData, viewSubject, changeTab, changeSubTab, openModal, closeModal,
            submitSubject, submitInteraction, submitLocation, submitRel, triggerUpload, handleFile, deleteItem,
            fetchShareLinks, createShareLink, revokeLink, copyToClipboard, getShareUrl, resolveImg,
            activeShareLinks, suggestions, printDossier, openSettings, flyTo, searchLocations, selectLocation,
            searchNexus, focusNode, reloadNexus, parseDigital
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// --- Route Handling ---

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
        if (!schemaInitialized) await ensureSchema(env.DB);

        // Public Views
        const shareMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
        if (req.method === 'GET' && shareMatch) return new Response(serveSharedHtml(shareMatch[1]), { headers: {'Content-Type': 'text/html'} });

        // Main App
        if (req.method === 'GET' && path === '/') return serveHtml();

        // Auth
        if (path === '/api/login') {
            const { email, password } = await req.json();
            const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
            if (!admin) {
                const hash = await hashPassword(password);
                const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)').bind(email, hash, isoTimestamp()).run();
                return response({ id: res.meta.last_row_id });
            }
            const hashed = await hashPassword(password);
            if (hashed !== admin.password_hash) return errorResponse('Access Denied', 401);
            return response({ id: admin.id });
        }

        // Dashboard & Stats
        if (path === '/api/dashboard') return handleGetDashboard(env.DB, url.searchParams.get('adminId'));
        if (path === '/api/suggestions') return handleGetSuggestions(env.DB, url.searchParams.get('adminId'));
        
        // Subject CRUD
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, status, occupation, nationality, modus_operandi, digital_identifiers, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
                .bind(safeVal(p.admin_id), safeVal(p.full_name), safeVal(p.alias), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.modus_operandi), safeVal(p.digital_identifiers), isoTimestamp()).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(url.searchParams.get('adminId')).all();
            return response(res.results);
        }

        if (path === '/api/map-data') return handleGetMapData(env.DB, url.searchParams.get('adminId'));
        if (path === '/api/network') return handleGetNetworkData(env.DB, url.searchParams.get('adminId'));

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const id = idMatch[1];
            if(req.method === 'PATCH') {
                const p = await req.json();
                const keys = Object.keys(p).filter(k => k !== 'id' && k !== 'created_at');
                const set = keys.map(k => `${k} = ?`).join(', ');
                const vals = keys.map(k => safeVal(p[k]));
                await env.DB.prepare(`UPDATE subjects SET ${set} WHERE id = ?`).bind(...vals, id).run();
                return response({success:true});
            }
            return handleGetSubjectFull(env.DB, id);
        }

        // Sub-resources
        if (path === '/api/interaction') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, evidence_url, created_at) VALUES (?,?,?,?,?,?,?)')
                .bind(p.subject_id, p.date, p.type, safeVal(p.transcript), safeVal(p.conclusion), safeVal(p.evidence_url), isoTimestamp()).run();
            return response({success:true});
        }
        if (path === '/api/location') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_locations (subject_id, name, address, lat, lng, type, notes, created_at) VALUES (?,?,?,?,?,?,?,?)')
                .bind(p.subject_id, p.name, safeVal(p.address), safeVal(p.lat), safeVal(p.lng), p.type, safeVal(p.notes), isoTimestamp()).run();
            return response({success:true});
        }
        if (path === '/api/relationship') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, created_at) VALUES (?,?,?,?)')
                .bind(p.subjectA, p.targetId, p.type, isoTimestamp()).run();
            return response({success:true});
        }

        // Sharing
        if (path === '/api/share-links') {
            if(req.method === 'DELETE') return handleRevokeShareLink(env.DB, url.searchParams.get('token'));
            if(req.method === 'POST') return handleCreateShareLink(req, env.DB, url.origin);
            return handleListShareLinks(env.DB, url.searchParams.get('subjectId'));
        }
        const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
        if (shareApiMatch) return handleGetSharedSubject(env.DB, shareApiMatch[1]);

        if (path === '/api/delete') {
            const { table, id } = await req.json();
            const safeTables = ['subjects','subject_interactions','subject_locations','subject_intel','subject_relationships','subject_media'];
            if(safeTables.includes(table)) {
                if(table === 'subjects') await env.DB.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ?').bind(id).run();
                else await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
                return response({success:true});
            }
        }

        // File Ops
        if (path === '/api/upload-avatar' || path === '/api/upload-media') {
            const { subjectId, data, filename, contentType } = await req.json();
            const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(filename)}`;
            const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            await env.BUCKET.put(key, binary, { httpMetadata: { contentType } });
            
            if (path.includes('avatar')) await env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
            else await env.DB.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?,?,?,?,?)').bind(subjectId, key, contentType, 'Attached File', isoTimestamp()).run();
            return response({success:true});
        }

        if (path.startsWith('/api/media/')) {
            const key = path.replace('/api/media/', '');
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response('Not found', { status: 404 });
            return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' }});
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
