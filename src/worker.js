const encoder = new TextEncoder();

// --- Configuration & Constants ---
const ALLOWED_ORIGINS = ['*']; 
const APP_TITLE = "PEOPLE OS";

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

// Helper to convert undefined to null for D1 compatibility
function safeVal(v) {
    return v === undefined || v === '' ? null : v;
}

// --- Database Layer ---

let schemaInitialized = false;

async function ensureSchema(db) {
  if (schemaInitialized) return;
  try {
      // Enable Foreign Keys
      await db.prepare("PRAGMA foreign_keys = ON;").run();

      // Consolidated Schema - No ALTER statements needed for fresh install
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
      // If error is table exists but schema wrong, we might need a manual burn
  }
}

async function nukeDatabase(db, bucket) {
    // The "Burn Protocol" - Drops all tables explicitly
    const tables = [
        'subject_shares', 'subject_locations', 'subject_interactions', 
        'subject_relationships', 'subject_media', 'subject_intel', 
        'subjects', 'admins'
    ];
    
    // Disable FK constraints temporarily to allow dropping
    await db.prepare("PRAGMA foreign_keys = OFF;").run();
    
    for(const t of tables) {
        try { await db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); } catch(e) { console.error(`Failed to drop ${t}`, e); }
    }
    
    // Attempt to list and delete bucket contents (Best effort)
    try {
        const list = await bucket.list();
        if(list.objects) {
            await Promise.all(list.objects.map(o => bucket.delete(o.key)));
        }
    } catch(e) { console.error("Bucket clean error", e); }

    await db.prepare("PRAGMA foreign_keys = ON;").run();
    schemaInitialized = false; // Force ensureSchema on next run
    return true;
}

// --- API Handlers ---

async function handleGetDashboard(db, adminId) {
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Contact Added' as desc, created_at as date FROM subjects WHERE admin_id = ?
        UNION ALL
        SELECT 'interaction' as type, subject_id as ref_id, type as title, conclusion as desc, created_at as date FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        UNION ALL
        SELECT 'location' as type, subject_id as ref_id, name as title, type as desc, created_at as date FROM subject_locations WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        ORDER BY date DESC LIMIT 20
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
    const ideologies = await db.prepare("SELECT DISTINCT ideology FROM subjects WHERE admin_id = ?").bind(adminId).all();
    
    return response({
        occupations: occupations.results.map(r => r.occupation).filter(Boolean),
        nationalities: nationalities.results.map(r => r.nationality).filter(Boolean),
        ideologies: ideologies.results.map(r => r.ideology).filter(Boolean)
    });
}

async function handleGetSubjectFull(db, id) {
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
    if (!subject) return errorResponse("Subject not found", 404);

    const [media, intel, relationships, interactions, locations] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_intel WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
        db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar
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

async function handleGetMapData(db, adminId) {
    const query = `
        SELECT l.id, l.name, l.lat, l.lng, l.type, s.id as subject_id, s.full_name, s.alias, s.avatar_path, s.threat_level 
        FROM subject_locations l
        JOIN subjects s ON l.subject_id = s.id
        WHERE s.admin_id = ? AND s.is_archived = 0 AND l.lat IS NOT NULL
    `;
    const res = await db.prepare(query).bind(adminId).all();
    return response(res.results);
}

// --- Share Logic ---

async function handleCreateShareLink(req, db, origin) {
    const { subjectId, durationMinutes } = await req.json();
    if (!subjectId) return errorResponse('subjectId required', 400);
    const durationSeconds = Math.max(30, Math.floor((durationMinutes || 15) * 60)); 
    const token = generateToken();
    await db.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, created_at, is_active, views) VALUES (?, ?, ?, ?, 1, 0)')
        .bind(subjectId, token, durationSeconds, isoTimestamp()).run();
    return response({ url: `${origin}/share/${token}` });
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
    if (!link) return errorResponse('LINK INVALID', 404);
    if (!link.is_active) return errorResponse('LINK REVOKED', 410);

    // Timer Logic & View Counting
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
        
        // Increment View
        await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();

        // Fetch limited data
        const subject = await db.prepare('SELECT full_name, alias, occupation, nationality, ideology, threat_level, avatar_path, status, created_at FROM subjects WHERE id = ?').bind(link.subject_id).first();
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
}

// --- Frontend HTML ---

function serveSharedHtml(token) {
    const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-gray-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>People OS | Secure Share</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; }
    .glass { background: white; border: 1px solid #e5e7eb; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    [v-cloak] { display: none; }
  </style>
</head>
<body class="bg-gray-100 h-full overflow-hidden">
  <div id="app" v-cloak class="h-full flex flex-col max-w-2xl mx-auto bg-white shadow-2xl overflow-hidden relative">
    
    <div v-if="loading" class="flex-1 flex items-center justify-center flex-col gap-4">
        <div class="animate-spin text-blue-600 text-3xl"><i class="fa-solid fa-circle-notch"></i></div>
        <div class="text-xs font-bold uppercase tracking-widest text-gray-400">Decrypting Link...</div>
    </div>

    <div v-else-if="error" class="flex-1 flex items-center justify-center p-8 text-center">
        <div>
            <div class="text-red-500 text-5xl mb-4"><i class="fa-solid fa-lock"></i></div>
            <h1 class="text-xl font-bold text-gray-900 mb-2">{{ error }}</h1>
            <p class="text-gray-500 text-sm">This secure link is no longer valid or has expired.</p>
        </div>
    </div>

    <div v-else class="flex-1 flex flex-col h-full overflow-hidden">
        <!-- Secure Header -->
        <div class="bg-gray-900 text-white p-4 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-shield-halved text-green-400"></i>
                <span class="font-bold text-sm tracking-wide uppercase">Secure View</span>
            </div>
            <div class="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300" :class="{'text-red-400 animate-pulse': timer < 60}">
                <i class="fa-regular fa-clock mr-1"></i> {{ formatTime(timer) }}
            </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-8">
            <!-- Header -->
            <div class="flex items-start gap-4">
                 <div class="w-20 h-20 bg-gray-200 rounded-xl overflow-hidden border-4 border-gray-100 shadow-sm shrink-0">
                    <img v-if="data.avatar_path" :src="'/api/media/'+data.avatar_path" class="w-full h-full object-cover">
                    <div v-else class="w-full h-full flex items-center justify-center text-gray-400"><i class="fa-solid fa-user text-2xl"></i></div>
                </div>
                <div>
                    <h1 class="text-2xl font-black text-gray-900 leading-tight">{{ data.full_name }}</h1>
                    <div class="text-sm text-gray-500 font-medium mb-2">{{ data.occupation || 'Unknown Occupation' }}</div>
                    <div class="flex flex-wrap gap-2">
                         <span class="px-2 py-1 rounded bg-gray-100 text-gray-600 text-[10px] font-bold uppercase">{{ data.nationality }}</span>
                         <span class="px-2 py-1 rounded text-[10px] font-bold uppercase" :class="getThreatColor(data.threat_level, true)">{{ data.threat_level }} Priority</span>
                    </div>
                </div>
            </div>

            <!-- Sections -->
            <div class="space-y-6">
                <div class="glass p-5">
                    <h3 class="text-xs font-bold text-gray-400 uppercase mb-3">Recent Activity</h3>
                    <div v-if="data.interactions.length === 0" class="text-sm text-gray-400 italic">No recent activity logged.</div>
                    <div v-for="ix in data.interactions" class="mb-3 last:mb-0 border-l-2 border-blue-200 pl-3 pb-1">
                        <div class="flex justify-between items-baseline mb-1">
                            <span class="text-xs font-bold text-blue-600 uppercase">{{ ix.type }}</span>
                            <span class="text-[10px] text-gray-400">{{ new Date(ix.date).toLocaleDateString() }}</span>
                        </div>
                        <p class="text-sm text-gray-700 leading-snug">{{ ix.conclusion || 'No summary available.' }}</p>
                    </div>
                </div>

                <div class="glass p-5">
                    <h3 class="text-xs font-bold text-gray-400 uppercase mb-3">Known Locations</h3>
                    <div v-if="data.locations.length === 0" class="text-sm text-gray-400 italic">No locations pinned.</div>
                    <div class="space-y-2">
                        <div v-for="loc in data.locations" class="flex items-center gap-3 text-sm p-2 bg-gray-50 rounded-lg">
                            <i class="fa-solid fa-location-dot text-gray-400"></i>
                            <div class="flex-1">
                                <div class="font-bold text-gray-900">{{ loc.name }}</div>
                                <div class="text-xs text-gray-500">{{ loc.address }}</div>
                            </div>
                            <a :href="'https://www.google.com/maps/search/?api=1&query='+loc.lat+','+loc.lng" target="_blank" class="text-blue-600 hover:text-blue-800"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                        </div>
                    </div>
                </div>

                 <div class="glass p-5">
                    <h3 class="text-xs font-bold text-gray-400 uppercase mb-3">Attached Media</h3>
                    <div v-if="data.media.length === 0" class="text-sm text-gray-400 italic">No media attached.</div>
                    <div class="grid grid-cols-2 gap-2">
                         <a v-for="m in data.media" :href="'/api/media/'+m.object_key" target="_blank" class="block bg-gray-50 rounded-lg p-3 text-center hover:bg-blue-50 transition-colors border border-gray-100">
                            <i class="fa-solid fa-file-arrow-down text-xl text-gray-400 mb-2"></i>
                            <div class="text-[10px] font-bold text-gray-700 truncate">{{ m.description }}</div>
                         </a>
                    </div>
                </div>
            </div>
            
            <div class="text-center text-[10px] text-gray-400 py-4">
                Generated via PeopleOS. Access logged.
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
            const timer = ref(0);
            
            const token = "${token}";

            const formatTime = (s) => {
                const m = Math.floor(s / 60);
                const sec = s % 60;
                return \`\${m}:\${sec.toString().padStart(2, '0')}\`;
            };

            const getThreatColor = (l, isBg = false) => {
                const colors = {
                    'Low': isBg ? 'bg-green-100 text-green-700' : 'text-green-600',
                    'Medium': isBg ? 'bg-amber-100 text-amber-700' : 'text-amber-600',
                    'High': isBg ? 'bg-orange-100 text-orange-700' : 'text-orange-600',
                    'Critical': isBg ? 'bg-red-100 text-red-700' : 'text-red-600'
                };
                return colors[l] || (isBg ? 'bg-gray-100 text-gray-700' : 'text-gray-500');
            };

            onMounted(async () => {
                try {
                    const res = await fetch('/api/share/' + token);
                    const json = await res.json();
                    if(json.error) throw new Error(json.error);
                    
                    data.value = json;
                    timer.value = json.meta.remaining_seconds;
                    
                    setInterval(() => {
                        if(timer.value > 0) timer.value--;
                        else if(!error.value) error.value = "Link Expired";
                    }, 1000);
                    
                } catch(e) {
                    error.value = e.message || "Access Denied";
                } finally {
                    loading.value = false;
                }
            });

            return { loading, error, data, timer, formatTime, getThreatColor };
        }
    }).mount('#app');
  </script>
</body>
</html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' }});
}

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-gray-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, interactive-widget=resizes-content" />
  <title>People OS</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  
  <style>
    :root { --primary: #2563eb; --accent: #0ea5e9; --danger: #ef4444; }
    body { font-family: 'Inter', sans-serif; color: #1f2937; }
    
    .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(229, 231, 235, 0.5); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border-radius: 1rem; }
    .glass-input { background: #ffffff; border: 1px solid #d1d5db; color: #111827; transition: all 0.2s; border-radius: 0.5rem; }
    .glass-input:focus { border-color: var(--primary); outline: none; ring: 2px solid rgba(37, 99, 235, 0.1); }
    .glass-input.error { border-color: var(--danger); background: #fef2f2; }
    
    .threat-low { border-left: 4px solid #10b981; }
    .threat-medium { border-left: 4px solid #f59e0b; }
    .threat-high { border-left: 4px solid #f97316; }
    .threat-critical { border-left: 4px solid #ef4444; }
    
    .marker-pin {
        width: 30px; height: 30px; border-radius: 50% 50% 50% 0; background: #2563eb; position: absolute; transform: rotate(-45deg);
        left: 50%; top: 50%; margin: -15px 0 0 -15px;
        box-shadow: 0px 2px 5px rgba(0,0,0,0.3);
    }
    .marker-pin::after {
        content: ''; width: 24px; height: 24px; margin: 3px 0 0 3px; background: #fff; position: absolute; border-radius: 50%;
    }
    .custom-div-icon { background: transparent; border: none; }
    .custom-div-icon img {
        width: 24px; height: 24px; border-radius: 50%; position: absolute; top: 3px; left: 3px; transform: rotate(45deg); z-index: 2; object-fit: cover;
    }

    .leaflet-popup-content-wrapper { background: white; color: #111827; border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: 12px; }
    .leaflet-popup-tip { background: white; }
    
    .touch-target { min-height: 48px; }
    
    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }

    .shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
    @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
  </style>
</head>
<body class="h-full overflow-hidden selection:bg-blue-100 selection:text-blue-900">
  <div id="app" class="h-full flex flex-col">

    <!-- Auth Screen -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div class="w-full max-w-sm glass p-8 shadow-xl">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-3xl shadow-lg shadow-blue-500/30">
                    <i class="fa-solid fa-users-viewfinder"></i>
                </div>
                <h1 class="text-2xl font-extrabold text-gray-900 tracking-tight">People<span class="text-blue-600">OS</span></h1>
                <p class="text-gray-500 text-sm mt-1">Professional Network Intelligence</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <div>
                    <label class="text-xs font-bold text-gray-500 uppercase ml-1">Email / ID</label>
                    <input v-model="auth.email" type="email" placeholder="user@domain.com" class="glass-input w-full p-3 text-base md:text-sm mt-1" required>
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-500 uppercase ml-1">Password</label>
                    <input v-model="auth.password" type="password" placeholder="••••••••" class="glass-input w-full p-3 text-base md:text-sm mt-1" required>
                </div>
                <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-sm transition-all shadow-lg shadow-blue-500/20">
                    {{ loading ? 'Accessing...' : 'Secure Login' }}
                </button>
            </form>
        </div>
    </div>

    <!-- Main App -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
        
        <!-- Sidebar -->
        <nav class="hidden md:flex flex-col w-20 bg-white border-r border-gray-200 items-center py-6 z-20 shadow-sm">
            <div class="mb-8 text-blue-600 text-2xl"><i class="fa-solid fa-layer-group"></i></div>
            <div class="flex-1 space-y-4 w-full px-3">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'" class="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all">
                    <i :class="t.icon" class="text-xl"></i>
                    <span class="text-[10px] font-bold">{{t.label}}</span>
                </button>
            </div>
            <button @click="openSettings" class="text-gray-400 hover:text-gray-600 p-4"><i class="fa-solid fa-gear"></i></button>
        </nav>

        <!-- Mobile Header -->
        <header class="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20 shrink-0 shadow-sm">
            <span class="font-extrabold text-gray-900 tracking-tight text-lg">People<span class="text-blue-600">OS</span></span>
            <button @click="openSettings"><i class="fa-solid fa-gear text-gray-500"></i></button>
        </header>

        <!-- Content Area -->
        <main class="flex-1 relative overflow-hidden bg-gray-50 flex flex-col">
            
            <!-- Dashboard -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="glass p-5 border-t-4 border-blue-500">
                            <div class="text-xs text-gray-500 font-bold uppercase tracking-wider">Contacts</div>
                            <div class="text-3xl font-black text-gray-900 mt-1">{{ stats.targets || 0 }}</div>
                        </div>
                        <div class="glass p-5 border-t-4 border-amber-500">
                            <div class="text-xs text-gray-500 font-bold uppercase tracking-wider">Meetings</div>
                            <div class="text-3xl font-black text-gray-900 mt-1">{{ stats.encounters || 0 }}</div>
                        </div>
                        <div class="glass p-5 border-t-4 border-emerald-500">
                            <div class="text-xs text-gray-500 font-bold uppercase tracking-wider">Documents</div>
                            <div class="text-3xl font-black text-gray-900 mt-1">{{ stats.evidence || 0 }}</div>
                        </div>
                        <button @click="openModal('add-subject')" class="bg-white border-2 border-dashed border-gray-300 p-4 flex flex-col items-center justify-center group transition-all cursor-pointer hover:border-blue-500 hover:bg-blue-50 rounded-2xl">
                            <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"><i class="fa-solid fa-plus"></i></div>
                            <span class="text-xs font-bold text-gray-600 uppercase">Add Contact</span>
                        </button>
                    </div>

                    <div class="glass p-0 overflow-hidden">
                        <div class="bg-gray-50/50 p-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 class="text-sm font-bold text-gray-800"><i class="fa-solid fa-rss mr-2 text-blue-500"></i>Activity Feed</h3>
                            <button @click="fetchData" class="text-gray-400 hover:text-blue-600"><i class="fa-solid fa-rotate-right text-sm"></i></button>
                        </div>
                        <div class="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 hover:bg-gray-50 cursor-pointer flex gap-4 items-start transition-colors">
                                <div class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" :class="item.type === 'interaction' ? 'bg-amber-500' : 'bg-blue-500'"></div>
                                <div>
                                    <div class="text-sm font-semibold text-gray-900">{{ item.title }} <span class="text-gray-400 font-normal mx-1">&bull;</span> <span class="text-gray-500">{{ item.desc }}</span></div>
                                    <div class="text-xs text-gray-400 mt-1">{{ new Date(item.date).toLocaleString() }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Contacts List -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-white flex gap-3 shadow-sm z-10">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-search absolute left-3 top-3.5 text-gray-400"></i>
                        <input v-model="search" placeholder="Search contacts..." class="w-full bg-gray-100 border-none rounded-lg py-3 pl-10 text-base md:text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                    <button @click="openModal('add-subject')" class="bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 transition-all"><i class="fa-solid fa-user-plus mr-2"></i>New</button>
                </div>
                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="glass p-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all group relative overflow-hidden" :class="'threat-' + s.threat_level.toLowerCase()">
                        <div class="flex items-start justify-between">
                            <div class="flex gap-3">
                                <div class="w-12 h-12 bg-gray-200 rounded-full overflow-hidden border-2 border-white shadow-sm">
                                    <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100"><i class="fa-solid fa-user"></i></div>
                                </div>
                                <div>
                                    <div class="font-bold text-gray-900 text-sm">{{ s.full_name }}</div>
                                    <div class="text-xs text-gray-500">{{ s.occupation || 'No Title' }}</div>
                                    <div class="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium" :class="getThreatColor(s.threat_level, true)">{{ s.threat_level }} Priority</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Subject Detail -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col h-full bg-gray-50">
                <!-- Top Bar -->
                <div class="h-16 border-b border-gray-200 flex items-center px-4 justify-between bg-white shadow-sm shrink-0 z-10">
                    <div class="flex items-center gap-3">
                        <button @click="changeTab('targets')" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"><i class="fa-solid fa-arrow-left"></i></button>
                        <div>
                            <div class="font-bold text-gray-900 text-sm">{{ selected.full_name }}</div>
                            <div class="text-xs text-gray-500" v-if="selected.alias">aka {{ selected.alias }}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="openModal('add-interaction')" class="bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-200 transition-colors"><i class="fa-solid fa-comment-dots mr-1.5"></i>Log</button>
                        <button @click="openModal('share-secure')" class="text-gray-400 hover:text-blue-600 px-3 transition-colors" title="Share"><i class="fa-solid fa-share-nodes"></i></button>
                        <button @click="exportData" class="text-gray-400 hover:text-gray-700 px-3 transition-colors"><i class="fa-solid fa-download"></i></button>
                    </div>
                </div>

                <!-- Sub Tabs -->
                <div class="flex border-b border-gray-200 overflow-x-auto bg-white shrink-0">
                    <button v-for="t in ['profile','routine','meetings','locations','network','files']" 
                        @click="changeSubTab(t)" 
                        :class="subTab === t ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
                        class="px-5 py-3 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors">
                        {{ t }}
                    </button>
                </div>

                <!-- Detail Body -->
                <div class="flex-1 overflow-y-auto p-4 md:p-8">
                    
                    <!-- Profile Tab -->
                    <div v-if="subTab === 'profile'" class="space-y-6 max-w-5xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-square bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden relative group">
                                    <img :src="resolveImg(selected.avatar_path) || 'https://www.transparenttextures.com/patterns/cubes.png'" class="w-full h-full object-cover">
                                    <button @click="triggerUpload('avatar')" class="absolute inset-0 bg-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-sm font-bold text-gray-800 cursor-pointer">Change Photo</button>
                                </div>
                                <div class="glass p-4 space-y-2">
                                    <div class="text-xs text-gray-500 uppercase font-bold">Priority Status</div>
                                    <select v-model="selected.threat_level" @change="updateSubject" class="w-full bg-white border border-gray-300 rounded-lg text-base md:text-sm p-2 text-gray-900 font-medium">
                                        <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                                    </select>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-4">
                                <div class="glass p-6 relative">
                                    <button @click="openModal('edit-profile')" class="absolute top-6 right-6 text-blue-500 hover:text-blue-700"><i class="fa-solid fa-pen-to-square"></i></button>
                                    <h3 class="text-sm text-gray-900 font-bold uppercase mb-6 flex items-center"><i class="fa-solid fa-id-card mr-2 text-blue-500"></i>Core Information</h3>
                                    <div class="grid grid-cols-2 gap-x-8 gap-y-6 text-sm">
                                        <div><span class="text-gray-400 text-xs font-bold block mb-1 uppercase">Full Name</span> <span class="font-medium text-gray-900">{{selected.full_name}}</span></div>
                                        <div><span class="text-gray-400 text-xs font-bold block mb-1 uppercase">Nationality</span> <span class="font-medium text-gray-900">{{selected.nationality || '—'}}</span></div>
                                        <div><span class="text-gray-400 text-xs font-bold block mb-1 uppercase">Job Title</span> <span class="font-medium text-gray-900">{{selected.occupation || '—'}}</span></div>
                                        <div><span class="text-gray-400 text-xs font-bold block mb-1 uppercase">Affiliations</span> <span class="font-medium text-gray-900">{{selected.ideology || '—'}}</span></div>
                                        <div class="col-span-2 border-t border-gray-100 pt-4">
                                            <span class="text-gray-400 text-xs font-bold block mb-2 uppercase">Routine & Habits</span>
                                            <p class="text-gray-600 leading-relaxed">{{selected.modus_operandi || 'No routine information logged.'}}</p>
                                        </div>
                                        <div class="col-span-2">
                                            <span class="text-gray-400 text-xs font-bold block mb-2 uppercase">Pain Points / Challenges</span>
                                            <p class="text-red-500 leading-relaxed">{{selected.weakness || 'None identified.'}}</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="glass p-6">
                                    <h3 class="text-sm text-gray-900 font-bold uppercase mb-4">Physical Attributes</h3>
                                    <div class="grid grid-cols-3 gap-4 text-center text-sm mb-4">
                                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-100"><div class="text-gray-400 text-xs font-bold mb-1 uppercase">Height</div>{{selected.height || '--'}}</div>
                                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-100"><div class="text-gray-400 text-xs font-bold mb-1 uppercase">Weight</div>{{selected.weight || '--'}}</div>
                                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-100"><div class="text-gray-400 text-xs font-bold mb-1 uppercase">Age</div>{{selected.age || '--'}}</div>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                        <div class="text-gray-400 text-xs font-bold mb-1 uppercase">Distinguishing Features</div>
                                        <div class="text-gray-700 text-sm">{{selected.identifying_marks || 'None listed'}}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Meetings Tab -->
                    <div v-if="subTab === 'meetings'" class="space-y-4 max-w-3xl mx-auto">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-sm font-bold text-gray-900 uppercase">Interaction History</h3>
                            <button @click="openModal('add-interaction')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all">Log New Meeting</button>
                        </div>
                        <div v-if="!selected.interactions?.length" class="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">No interaction history found.</div>
                        <div v-for="ix in selected.interactions" :key="ix.id" class="glass border-l-4 border-amber-400 p-5 space-y-3 relative group transition-all hover:shadow-md">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="bg-amber-100 text-amber-700 px-2 py-1 text-[10px] font-bold uppercase rounded-md border border-amber-200">{{ix.type}}</span>
                                    <span class="text-gray-400 text-xs ml-2 font-medium">{{ new Date(ix.date).toLocaleString() }}</span>
                                </div>
                                <button @click="deleteItem('subject_interactions', ix.id)" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button>
                            </div>
                            <div class="text-sm text-gray-800 whitespace-pre-wrap pl-4 border-l-2 border-gray-100">{{ix.transcript}}</div>
                            <div class="bg-gray-50 p-3 rounded-lg text-xs border border-gray-100 text-gray-600">
                                <span class="text-blue-600 font-bold uppercase text-[10px] block mb-1">Summary / Next Steps</span>
                                {{ix.conclusion}}
                            </div>
                            <a v-if="ix.evidence_url" :href="ix.evidence_url" target="_blank" class="inline-flex items-center gap-2 text-xs text-blue-600 hover:underline font-medium"><i class="fa-solid fa-paperclip"></i> View Attachment</a>
                        </div>
                    </div>

                    <!-- Locations Tab (Map) -->
                    <div v-show="subTab === 'locations'" class="h-full flex flex-col">
                        <div class="flex justify-between items-center mb-4 shrink-0">
                            <h3 class="text-sm font-bold text-gray-900 uppercase">Geographic Data</h3>
                            <button @click="openModal('add-location')" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-50 shadow-sm">Pin New Location</button>
                        </div>
                        <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm relative h-64 md:h-full md:min-h-[400px]">
                                <div id="subjectMap" class="w-full h-full z-0"></div>
                            </div>
                            <div class="space-y-3 overflow-y-auto max-h-[600px]">
                                <div v-for="loc in selected.locations" :key="loc.id" class="glass p-4 flex flex-col gap-2 cursor-pointer hover:border-blue-400 transition-all border-l-4 border-transparent hover:border-l-blue-500" @click="flyTo(loc)">
                                    <div class="flex justify-between items-center">
                                        <div class="text-sm font-bold text-gray-900">{{loc.name}}</div>
                                        <span class="text-[10px] uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{{loc.type}}</span>
                                    </div>
                                    <div class="text-xs text-gray-500 flex items-start"><i class="fa-solid fa-location-dot mt-0.5 mr-2 text-gray-400"></i>{{loc.address}}</div>
                                    <div v-if="loc.notes" class="text-xs text-blue-600 bg-blue-50 p-2 rounded mt-1">{{loc.notes}}</div>
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-[10px] text-red-400 text-right hover:text-red-600 font-bold mt-1">REMOVE PIN</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Network/Graph -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div class="flex justify-between items-center mb-4 shrink-0">
                            <h3 class="text-sm font-bold text-gray-900 uppercase">Relationship Matrix</h3>
                            <button @click="openModal('add-rel')" class="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-bold text-gray-600">Add Connection</button>
                        </div>
                        <div class="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm relative overflow-hidden min-h-[400px]">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
                    </div>

                    <!-- Routine / Logs (Old Intel) -->
                    <div v-if="subTab === 'routine'" class="space-y-4 max-w-4xl mx-auto">
                        <div class="flex justify-between items-center">
                            <h3 class="text-sm font-bold text-gray-900 uppercase">Detailed Observations</h3>
                            <button @click="openModal('add-intel')" class="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-bold text-gray-600">New Entry</button>
                        </div>
                        <div class="grid gap-3">
                            <div v-for="log in selected.intel" :key="log.id" class="glass p-4 flex items-start gap-4">
                                <div class="text-[10px] font-medium text-gray-400 w-24 shrink-0 text-right pt-1">{{new Date(log.created_at).toLocaleDateString()}}</div>
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="text-xs font-bold text-gray-900 uppercase">{{log.label}}</span>
                                        <span class="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">{{log.category}}</span>
                                    </div>
                                    <p class="text-sm text-gray-600">{{log.value}}</p>
                                    <div v-if="log.analysis" class="mt-2 text-xs text-blue-600 font-medium bg-blue-50 p-2 rounded">NOTE: {{log.analysis}}</div>
                                </div>
                                <button @click="deleteItem('subject_intel', log.id)" class="text-gray-400 hover:text-red-500"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>
                    </div>

                    <!-- Files -->
                    <div v-if="subTab === 'files'" class="space-y-6">
                        <div class="flex flex-col md:flex-row gap-6">
                            <div @click="triggerUpload('media')" class="h-32 w-full md:w-48 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-all bg-white">
                                <i class="fa-solid fa-cloud-arrow-up text-2xl mb-2"></i>
                                <span class="text-xs uppercase font-bold">Upload Document</span>
                            </div>
                            <!-- Evidence Grid -->
                            <div class="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                <div v-for="m in selected.media" :key="m.id" class="glass group relative aspect-square overflow-hidden hover:shadow-lg transition-all">
                                    <img v-if="m.content_type.startsWith('image')" :src="'/api/media/' + m.object_key" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50"><i class="fa-solid fa-file-lines text-4xl"></i></div>
                                    <div class="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-4 text-center">
                                        <p class="text-[10px] text-white font-medium mb-3 line-clamp-2">{{m.description || 'Attachment'}}</p>
                                        <a :href="'/api/media/' + m.object_key" download class="bg-white text-gray-900 px-3 py-1.5 rounded text-xs font-bold mb-2 hover:bg-blue-50">Download</a>
                                        <button @click="deleteItem('subject_media', m.id)" class="text-red-400 hover:text-red-300 text-xs"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- Global Map Tab -->
            <div v-if="currentTab === 'map'" class="flex-1 relative bg-gray-100">
                <div id="warRoomMap" class="w-full h-full z-0"></div>
                
                <!-- Floating Header -->
                <div class="absolute top-4 left-4 z-[400] glass px-4 py-3 shadow-lg pointer-events-none">
                    <h3 class="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Global Presence</h3>
                    <p class="text-[10px] text-gray-500 font-medium">{{subjects.length}} Contacts Tracked</p>
                </div>
                
                <!-- Map Search -->
                <div class="absolute top-4 right-4 z-[400] w-72 glass shadow-lg p-1">
                    <div class="relative">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 text-xs"></i>
                        <input v-model="warMapSearch" placeholder="Find contact on map..." class="bg-transparent w-full text-base md:text-sm p-2 pl-8 text-gray-800 outline-none font-medium placeholder-gray-400">
                    </div>
                </div>

                <!-- Selected Person Bar -->
                <transition name="slide-up">
                    <div v-if="warMapSelected" class="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-lg z-[400] glass p-4 animate-slide-up flex items-center gap-4 shadow-2xl border-l-4 border-blue-500">
                        <div class="w-14 h-14 bg-gray-200 rounded-full overflow-hidden border-2 border-white shadow-sm shrink-0">
                            <img :src="resolveImg(warMapSelected.avatar_path)" class="w-full h-full object-cover">
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-baseline justify-between mb-1">
                                <h3 class="font-bold text-gray-900 text-base truncate">{{ warMapSelected.full_name }}</h3>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">{{ warMapSelected.threat_level }} Priority</span>
                            </div>
                            <p class="text-xs text-gray-500 truncate"><i class="fa-solid fa-map-pin mr-1 text-blue-500"></i> {{ warMapSelected.name }} ({{ warMapSelected.type }})</p>
                        </div>
                        <button @click="viewSubject(warMapSelected.subject_id)" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-md transition-colors">VIEW</button>
                        <button @click="warMapSelected = null" class="text-gray-400 hover:text-gray-600 px-1"><i class="fa-solid fa-xmark text-lg"></i></button>
                    </div>
                </transition>
            </div>

        </main>

        <!-- Mobile Nav -->
        <nav class="md:hidden h-16 bg-white border-t border-gray-200 flex justify-around items-center shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'text-blue-600 bg-blue-50 rounded-lg' : 'text-gray-400'" class="flex flex-col items-center justify-center p-2 w-16 transition-all">
                <i :class="t.icon" class="text-xl mb-1"></i>
                <span class="text-[10px] font-bold" v-if="currentTab === t.id">{{t.label}}</span>
            </button>
        </nav>

    </div>

    <!-- Modals -->
    <div v-if="modal.active" class="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-lg glass bg-white shadow-2xl border border-white/50 animate-fade-in transform transition-all flex flex-col max-h-[85vh]" :class="{'shake': modal.shake}">
            <div class="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
                <h3 class="text-sm font-extrabold text-gray-900 uppercase tracking-wide">{{ modalTitle }}</h3>
                <button @click="closeModal" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-lg"></i></button>
            </div>
            
            <div class="overflow-y-auto p-6">
                <!-- Add Subject / Edit -->
                <form v-if="modal.active === 'add-subject' || modal.active === 'edit-profile'" @submit.prevent="submitSubject" class="space-y-4">
                    <div class="space-y-1">
                        <input v-model="forms.subject.full_name" placeholder="Full Name *" class="glass-input w-full p-3 text-base md:text-sm font-medium" :class="{'error': errors.full_name}">
                    </div>
                    <input v-model="forms.subject.alias" placeholder="Alias / Nickname" class="glass-input w-full p-3 text-base md:text-sm">
                    
                    <div class="grid grid-cols-2 gap-4">
                        <select v-model="forms.subject.threat_level" class="glass-input p-3 text-base md:text-sm bg-white">
                            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                        </select>
                        <input v-model="forms.subject.occupation" list="list-occupations" placeholder="Job Title" class="glass-input p-3 text-base md:text-sm">
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="text-[10px] text-gray-500 font-bold uppercase ml-1">Date of Birth</label>
                            <input type="date" v-model="forms.subject.dob" class="glass-input p-2.5 text-base md:text-sm bg-white w-full text-gray-900">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[10px] text-gray-500 font-bold uppercase ml-1">Age (Auto)</label>
                            <input v-model="forms.subject.age" type="number" class="glass-input p-2.5 text-base md:text-sm w-full bg-gray-50" readonly>
                        </div>
                    </div>

                    <input v-model="forms.subject.nationality" list="list-nationalities" placeholder="Nationality" class="glass-input w-full p-3 text-base md:text-sm">
                    <input v-model="forms.subject.ideology" list="list-ideologies" placeholder="Affiliations / Groups" class="glass-input w-full p-3 text-base md:text-sm">
                    
                    <textarea v-model="forms.subject.modus_operandi" placeholder="Routine & Habits" rows="3" class="glass-input w-full p-3 text-base md:text-sm"></textarea>
                    <textarea v-model="forms.subject.weakness" placeholder="Challenges / Pain Points" rows="2" class="glass-input w-full p-3 text-base md:text-sm border-red-100"></textarea>
                    
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20">Save Contact</button>
                    <button v-if="modal.active === 'edit-profile'" type="button" @click="archiveSubject" class="w-full text-red-500 text-xs mt-2 hover:text-red-700 font-bold uppercase">Delete Contact</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="glass-input p-3 text-base md:text-sm bg-white text-gray-900" required>
                        <select v-model="forms.interaction.type" class="glass-input p-3 text-base md:text-sm bg-white">
                            <option>Meeting</option>
                            <option>Call</option>
                            <option>Email</option>
                            <option>Observation</option>
                            <option>Other</option>
                        </select>
                    </div>
                    <textarea v-model="forms.interaction.transcript" placeholder="Notes / Discussion *" rows="6" class="glass-input w-full p-3 text-base md:text-sm font-mono" :class="{'error': errors.transcript}"></textarea>
                    <textarea v-model="forms.interaction.conclusion" placeholder="Summary / Next Steps" rows="3" class="glass-input w-full p-3 text-base md:text-sm"></textarea>
                    <input v-model="forms.interaction.evidence_url" placeholder="External Link (Optional)" class="glass-input w-full p-3 text-base md:text-sm">
                    <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20">Save Log</button>
                </form>

                <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                    <!-- Search moved above map -->
                    <div class="relative z-[100]">
                        <input v-model="locationSearchQuery" @keyup.enter="searchLocations" placeholder="Search for a place (Press Enter)" class="glass-input w-full p-3 pl-10 text-base md:text-sm border-blue-200">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-blue-400"></i>
                        <!-- Search Results -->
                        <div v-if="locationSearchResults.length" class="absolute w-full bg-white border border-gray-200 max-h-48 overflow-y-auto mt-1 shadow-xl rounded-lg z-[101]">
                            <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-blue-50 cursor-pointer text-xs border-b border-gray-100 last:border-0 text-gray-700">
                                {{ res.display_name }}
                            </div>
                        </div>
                    </div>

                    <!-- Mini Map for selection -->
                    <div class="h-48 w-full bg-gray-100 rounded-lg border-2 border-white shadow-inner relative overflow-hidden z-0">
                        <div id="locationPickerMap" class="absolute inset-0 z-0"></div>
                        <div class="absolute bottom-2 right-2 bg-white/90 text-[10px] text-gray-600 p-1.5 px-3 rounded-full font-bold pointer-events-none z-[500] shadow-sm border border-gray-200">Double-Click to Pin</div>
                    </div>

                    <input v-model="forms.location.name" placeholder="Location Name (e.g. Office) *" class="glass-input w-full p-3 text-base md:text-sm" :class="{'error': errors.loc_name}">
                    <div class="grid grid-cols-2 gap-4">
                        <input v-model="forms.location.lat" placeholder="Lat" type="number" step="any" class="glass-input p-3 text-base md:text-sm bg-gray-50" readonly>
                        <input v-model="forms.location.lng" placeholder="Lng" type="number" step="any" class="glass-input p-3 text-base md:text-sm bg-gray-50" readonly>
                    </div>
                    
                    <select v-model="forms.location.type" class="glass-input w-full p-3 text-base md:text-sm bg-white">
                        <option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Unknown</option>
                    </select>
                    <input v-model="forms.location.address" placeholder="Full Address" class="glass-input w-full p-3 text-base md:text-sm">
                    <textarea v-model="forms.location.notes" placeholder="Access Notes / Details" rows="2" class="glass-input w-full p-3 text-base md:text-sm"></textarea>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20">Pin Location</button>
                </form>

                <form v-if="modal.active === 'settings'" @submit.prevent class="space-y-6 text-center">
                    <div class="p-6 bg-red-50 border border-red-100 rounded-xl">
                        <h4 class="text-red-600 font-bold uppercase text-xs mb-2">Danger Zone</h4>
                        <p class="text-gray-500 text-xs mb-4">Factory Reset wipes ALL data including Admin credentials. System will reboot to setup mode. This cannot be undone.</p>
                        <button @click="burnProtocol" class="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg text-xs uppercase tracking-widest w-full shadow-lg shadow-red-500/20">Factory Reset System</button>
                    </div>
                    <button @click="logout" class="text-gray-400 text-xs hover:text-gray-800 font-bold uppercase tracking-wider">Log Out</button>
                </form>

                 <!-- Basic Intel/Rel Forms -->
                 <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <input v-model="forms.intel.label" placeholder="Topic *" class="glass-input w-full p-3 text-base md:text-sm" :class="{'error': errors.intel_label}">
                    <textarea v-model="forms.intel.value" placeholder="Observation *" rows="4" class="glass-input w-full p-3 text-base md:text-sm" :class="{'error': errors.intel_val}"></textarea>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest">Save Entry</button>
                 </form>

                 <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                    <select v-model="forms.rel.targetId" class="glass-input w-full p-3 text-base md:text-sm bg-white">
                        <option v-for="s in subjects" :value="s.id">{{s.full_name}} ({{s.alias}})</option>
                    </select>
                    <input v-model="forms.rel.type" placeholder="Relationship Type *" class="glass-input w-full p-3 text-base md:text-sm" :class="{'error': errors.rel_type}">
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest">Link Contacts</button>
                 </form>

                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <div class="text-center">
                        <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 text-xl">
                            <i class="fa-solid fa-link"></i>
                        </div>
                        <h4 class="font-bold text-gray-900">Share Read-Only Access</h4>
                        <p class="text-xs text-gray-500 mt-1">Generate a temporary link. It will expire automatically.</p>
                    </div>
                    
                    <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div class="flex gap-2">
                            <div class="relative w-24">
                                <input v-model.number="forms.share.minutes" type="number" class="glass-input p-2.5 w-full text-center text-sm font-bold pl-2 pr-8" placeholder="15" min="1">
                                <span class="absolute right-3 top-2.5 text-xs text-gray-400 font-bold">MIN</span>
                            </div>
                            <button @click="createShareLink" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs uppercase shadow-md">Create Link</button>
                        </div>
                        <div v-if="forms.share.result" class="mt-3 relative">
                            <input readonly :value="forms.share.result" class="w-full bg-white border border-blue-200 text-blue-600 text-xs p-3 rounded-lg pr-10 font-mono" @click="copyToClipboard(forms.share.result)">
                            <button @click="copyToClipboard(forms.share.result)" class="absolute right-2 top-2 text-blue-400 hover:text-blue-600 p-1"><i class="fa-regular fa-copy"></i></button>
                        </div>
                    </div>

                    <div>
                        <h5 class="text-xs font-bold text-gray-400 uppercase mb-2 ml-1">Active Links</h5>
                        <div class="max-h-40 overflow-y-auto space-y-2">
                            <div v-for="link in activeShareLinks" :key="link.token" class="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                                <div>
                                    <div class="text-gray-900 text-xs font-bold">Created {{ new Date(link.created_at).toLocaleDateString() }}</div>
                                    <div class="text-gray-500 text-[10px] mt-0.5 flex items-center gap-2">
                                        <span class="bg-gray-100 px-1.5 rounded">{{ link.duration_seconds ? (link.duration_seconds/60).toFixed(0) + 'm Limit' : 'No Limit' }}</span>
                                        <span v-if="link.views > 0" class="text-blue-600 font-bold"><i class="fa-regular fa-eye mr-1"></i>{{link.views}}</span>
                                    </div>
                                </div>
                                <button @click="revokeLink(link.token)" class="text-red-500 hover:text-red-700 text-[10px] font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors">KILL</button>
                            </div>
                            <div v-if="activeShareLinks.length === 0" class="text-center text-xs text-gray-400 py-4 italic">No active share links.</div>
                        </div>
                    </div>
                 </div>
            </div>

        </div>
    </div>

    <!-- Datalists for Suggestions -->
    <datalist id="list-occupations"><option v-for="i in suggestions.occupations" :value="i"></option></datalist>
    <datalist id="list-nationalities"><option v-for="i in suggestions.nationalities" :value="i"></option></datalist>
    <datalist id="list-ideologies"><option v-for="i in suggestions.ideologies" :value="i"></option></datalist>

    <input type="file" ref="fileInput" class="hidden" @change="handleFile" accept="image/*,application/pdf">

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        // State
        const view = ref('auth');
        const loading = ref(false);
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', label: 'Home', icon: 'fa-solid fa-house' },
            { id: 'targets', label: 'Contacts', icon: 'fa-solid fa-address-book' },
            { id: 'map', label: 'Global Map', icon: 'fa-solid fa-earth-americas' },
        ];
        
        // URL State Parsing
        const params = new URLSearchParams(window.location.search);
        const currentTab = ref(params.get('tab') || 'dashboard');
        const subTab = ref(params.get('subTab') || 'profile');
        
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const suggestions = reactive({ occupations: [], nationalities: [], ideologies: [] });
        const selected = ref(null);
        const activeShareLinks = ref([]);
        const search = ref('');
        const modal = reactive({ active: null, shake: false });
        const errors = reactive({});
        
        // Map State
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        const warMapSelected = ref(null);
        const warMapSearch = ref('');

        const forms = reactive({
            subject: {},
            interaction: {},
            location: {},
            intel: {},
            rel: {},
            share: { minutes: 30, result: '' }
        });

        // URL Sync
        const updateUrl = () => {
            const url = new URL(window.location);
            url.searchParams.set('tab', currentTab.value);
            if(currentTab.value === 'detail') {
                url.searchParams.set('subTab', subTab.value);
                if(selected.value) url.searchParams.set('id', selected.value.id);
            } else {
                url.searchParams.delete('subTab');
                url.searchParams.delete('id');
            }
            window.history.replaceState({}, '', url);
        };

        // Helpers
        const calculateAge = (dob) => {
            if(!dob) return '';
            const diff = Date.now() - new Date(dob).getTime();
            return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        };

        watch(() => forms.subject.dob, (val) => {
            if(val) forms.subject.age = calculateAge(val);
        });

        // API Wrapper
        const api = async (ep, opts = {}) => {
            try {
                const res = await fetch('/api' + ep, opts);
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                return data;
            } catch(e) { alert(e.message); throw e; }
        };

        // Actions
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
            suggestions.occupations = sugg.occupations;
            suggestions.nationalities = sugg.nationalities;
            suggestions.ideologies = sugg.ideologies;
        };

        const viewSubject = async (id) => {
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            subTab.value = 'profile'; // Reset to profile on open
            updateUrl();
        };

        const changeTab = (t) => { currentTab.value = t; updateUrl(); };
        const changeSubTab = (t) => { subTab.value = t; updateUrl(); };

        // Form Validation & Submit
        const validate = (fields) => {
            let valid = true;
            Object.keys(errors).forEach(k => delete errors[k]); // Clear prev
            fields.forEach(f => {
                if(!f.val || f.val.toString().trim() === '') {
                    errors[f.key] = true;
                    valid = false;
                }
            });
            if(!valid) {
                modal.shake = true;
                setTimeout(() => modal.shake = false, 500);
            }
            return valid;
        };

        const submitSubject = async () => {
            if(!validate([{key:'full_name', val: forms.subject.full_name}])) return;
            
            const isEdit = modal.active === 'edit-profile';
            const ep = isEdit ? '/subjects/' + selected.value.id : '/subjects';
            const method = isEdit ? 'PATCH' : 'POST';
            await api(ep, { method, body: JSON.stringify(forms.subject) });
            
            if(isEdit) selected.value = { ...selected.value, ...forms.subject };
            else fetchData();
            closeModal();
        };

        const submitInteraction = async () => {
            if(!validate([{key:'transcript', val: forms.interaction.transcript}])) return;
            await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) });
            viewSubject(selected.value.id); closeModal();
        };

        const submitLocation = async () => {
            if(!validate([{key:'loc_name', val: forms.location.name}])) return;
            await api('/location', { method: 'POST', body: JSON.stringify(forms.location) });
            viewSubject(selected.value.id); closeModal();
        };
        
        const submitIntel = async () => {
             if(!validate([{key:'intel_label', val: forms.intel.label}, {key:'intel_val', val: forms.intel.value}])) return;
             await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) });
             viewSubject(selected.value.id); closeModal();
        };

        const submitRel = async () => {
             if(!validate([{key:'rel_type', val: forms.rel.type}])) return;
             await api('/relationship', { method: 'POST', body: JSON.stringify({...forms.rel, subjectA: selected.value.id}) });
             viewSubject(selected.value.id); closeModal();
        };

        // Sharing
        const fetchShareLinks = async () => {
            if(!selected.value) return;
            const res = await api('/share-links?subjectId=' + selected.value.id);
            activeShareLinks.value = res;
        };

        const createShareLink = async () => {
            const res = await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes }) });
            forms.share.result = res.url;
            fetchShareLinks();
        };

        const revokeLink = async (token) => {
            await api('/share-links?token=' + token, { method: 'DELETE' });
            fetchShareLinks();
        };

        // Maps
        let mapInstance = null;
        let pickerMapInstance = null;

        const initMap = (elementId, locations, onClick, isGlobal = false, isPicker = false) => {
            const el = document.getElementById(elementId);
            if(!el) return;
            
            // Clean up
            if (isPicker && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; }
            if (!isPicker && mapInstance) { mapInstance.remove(); mapInstance = null; }

            const map = L.map(elementId, { attributionControl: false }).setView([20, 0], 2);
            // Light Map Tiles
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

            if(isPicker) {
                pickerMapInstance = map;
                // Double click to set pin in picker
                map.on('dblclick', e => {
                    forms.location.lat = e.latlng.lat;
                    forms.location.lng = e.latlng.lng;
                    // Clear existing markers
                    map.eachLayer((layer) => { if(layer instanceof L.Marker) map.removeLayer(layer); });
                    L.marker(e.latlng).addTo(map);
                });
                // Invalidate size on picker open
                setTimeout(() => map.invalidateSize(), 100);
            } else {
                mapInstance = map;
                // Pins
                locations.forEach(loc => {
                    if(loc.lat && loc.lng) {
                        let icon;
                        if (isGlobal && loc.avatar_path) {
                            const imgUrl = resolveImg(loc.avatar_path);
                            // Border color based on threat
                            const color = loc.threat_level === 'Critical' ? '#ef4444' : loc.threat_level === 'High' ? '#f97316' : '#2563eb';
                            icon = L.divIcon({
                                className: 'custom-div-icon',
                                html: \`<div class="marker-pin" style="background: \${color};"></div><img src="\${imgUrl}" style="border: 2px solid \${color};">\`,
                                iconSize: [30, 42], iconAnchor: [15, 42]
                            });
                        } else {
                            icon = L.divIcon({
                                className: 'custom-div-icon',
                                html: \`<div class="marker-pin"></div><i class="fa-solid fa-location-dot" style="position:absolute;top:2px;left:8px;font-size:14px;color:white"></i>\`,
                                iconSize: [30, 42], iconAnchor: [15, 42]
                            });
                        }
                        const m = L.marker([loc.lat, loc.lng], { icon }).addTo(map);
                        
                        if(isGlobal) {
                            m.on('click', () => { warMapSelected.value = loc; });
                        } else {
                            m.bindPopup(\`<b>\${loc.name}</b><br>\${loc.type}\`);
                        }
                    }
                });
            }
        };

        // Watchers
        watch(() => subTab.value, (val) => {
            if(val === 'locations' && selected.value) {
                nextTick(() => initMap('subjectMap', selected.value.locations || [], null));
            }
            if(val === 'network' && selected.value) {
                nextTick(initNetwork);
            }
        });

        watch(() => currentTab.value, (val) => {
            if(val === 'map') {
                nextTick(async () => {
                    const allLocs = await api('/map-data?adminId=' + localStorage.getItem('admin_id'));
                    initMap('warRoomMap', allLocs, null, true); 
                });
            }
        });

        watch(warMapSearch, (val) => {
            // Filter logic could be here if we kept references to markers, 
            // for now simpler to re-init map or just rely on manual search in data
        });

        // Location Search
        const searchLocations = async () => {
            if(!locationSearchQuery.value) return;
            try {
                const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(locationSearchQuery.value)}\`);
                locationSearchResults.value = await res.json();
            } catch(e) { console.error(e); }
        };

        const selectLocation = (res) => {
            forms.location.lat = parseFloat(res.lat);
            forms.location.lng = parseFloat(res.lon);
            forms.location.address = res.display_name;
            locationSearchResults.value = [];
            // Center picker map
            if(pickerMapInstance) {
                pickerMapInstance.setView([res.lat, res.lon], 15);
                // Clear and add
                pickerMapInstance.eachLayer((layer) => { if(layer instanceof L.Marker) pickerMapInstance.removeLayer(layer); });
                L.marker([res.lat, res.lon]).addTo(pickerMapInstance);
            }
        };

        // Modals
        const openModal = (type) => {
            modal.active = type;
            const aid = localStorage.getItem('admin_id');
            // Reset errors
            Object.keys(errors).forEach(k => delete errors[k]);

            if(type === 'add-subject') forms.subject = { admin_id: aid, status: 'Active', threat_level: 'Low' };
            if(type === 'edit-profile') forms.subject = { ...selected.value };
            if(type === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) };
            if(type === 'add-location') {
                forms.location = { subject_id: selected.value.id };
                locationSearchQuery.value = '';
                locationSearchResults.value = [];
                nextTick(() => initMap('locationPickerMap', [], null, false, true));
            }
            if(type === 'add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' };
            if(type === 'add-rel') forms.rel = { subjectA: selected.value.id };
            if(type === 'share-secure') {
                forms.share = { minutes: 30, result: '' };
                fetchShareLinks();
            }
        };
        const closeModal = () => modal.active = null;

        // Init
        const initNetwork = () => {
            const container = document.getElementById('relNetwork');
            if(!container || !selected.value) return;
            const nodes = [{id: selected.value.id, label: selected.value.alias || selected.value.full_name, color: '#2563eb', size: 30}];
            const edges = [];
            selected.value.relationships.forEach(r => {
                const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, color: '#9ca3af' });
                edges.push({ from: selected.value.id, to: targetId || 'ext-'+r.id, label: r.relationship_type });
            });
            new vis.Network(container, { nodes, edges }, {
                nodes: { shape: 'dot', font: { color: '#374151' } },
                edges: { color: '#cbd5e1' }
            });
        };

        const copyToClipboard = (text) => {
            if(navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard"));
        };

        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
        
        const getThreatColor = (l, isBg = false) => {
            const colors = {
                'Low': isBg ? 'bg-green-100 text-green-700' : 'text-green-600',
                'Medium': isBg ? 'bg-amber-100 text-amber-700' : 'text-amber-600',
                'High': isBg ? 'bg-orange-100 text-orange-700' : 'text-orange-600',
                'Critical': isBg ? 'bg-red-100 text-red-700' : 'text-red-600'
            };
            return colors[l] || (isBg ? 'bg-gray-100 text-gray-700' : 'text-gray-500');
        };

        const flyTo = (loc) => mapInstance?.flyTo([loc.lat, loc.lng], 15);
        const openSettings = () => openModal('settings');
        const logout = () => { localStorage.clear(); location.reload(); };
        const filteredSubjects = computed(() => subjects.value.filter(s => s.full_name.toLowerCase().includes(search.value.toLowerCase()) || (s.alias && s.alias.toLowerCase().includes(search.value.toLowerCase()))));
        const exportData = () => {
            const blob = new Blob([JSON.stringify(selected.value, null, 2)], {type : 'application/json'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = (selected.value.alias || 'contact') + '.json';
            link.click();
        };
        
        // File Upload
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
                const endpoint = uploadType.value === 'avatar' ? '/upload-avatar' : '/upload-media';
                await api(endpoint, { method: 'POST', body: JSON.stringify({
                    subjectId: selected.value.id, data: b64, filename: f.name, contentType: f.type
                })});
                viewSubject(selected.value.id);
            };
        };
        const deleteItem = async (table, id) => {
            if(confirm('Are you sure you want to delete this item?')) {
                await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) });
                viewSubject(selected.value.id);
            }
        };
        const archiveSubject = async () => {
            if(confirm('Delete this contact? This will archive them.')) {
                await api('/delete', { method: 'POST', body: JSON.stringify({ table: 'subjects', id: selected.value.id }) });
                closeModal(); changeTab('targets'); fetchData();
            }
        };
        const burnProtocol = async () => {
            if(prompt("Type 'BURN' to confirm factory reset. All data will be lost.") === 'BURN') {
                await api('/nuke', { method: 'POST' });
                localStorage.clear();
                location.reload();
            }
        };

        const modalTitle = computed(() => {
            const map = {
                'add-subject': 'Add Contact',
                'edit-profile': 'Edit Contact',
                'add-interaction': 'Log Meeting',
                'add-location': 'Pin Location',
                'add-intel': 'Add Observation',
                'add-rel': 'Add Connection',
                'share-secure': 'Share Access',
                'settings': 'Settings'
            };
            return map[modal.active] || 'System Dialog';
        });

        onMounted(() => {
            if(localStorage.getItem('admin_id')) { 
                view.value = 'app'; 
                fetchData(); 
                // Restore View
                const params = new URLSearchParams(window.location.search);
                const id = params.get('id');
                if(id) viewSubject(id);
            }
        });

        return { 
            view, auth, loading, tabs, currentTab, subTab, stats, feed, subjects, filteredSubjects, selected, search, modal, forms, fileInput,
            activeShareLinks, locationSearchQuery, locationSearchResults, searchLocations, selectLocation, warMapSelected, warMapSearch, modalTitle,
            handleAuth, fetchData, viewSubject, openModal, closeModal, submitSubject, submitInteraction, submitLocation, submitIntel, submitRel, 
            createShareLink, revokeLink, fetchShareLinks, copyToClipboard, changeTab, changeSubTab, errors, suggestions, archiveSubject,
            triggerUpload, handleFile, deleteItem, burnProtocol, resolveImg, getThreatColor, flyTo, openSettings, logout, exportData
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// --- Routes ---

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
        if (!schemaInitialized) await ensureSchema(env.DB);

        // Share Page Route
        const shareMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
        if (req.method === 'GET' && shareMatch) return serveSharedHtml(shareMatch[1]);

        if (req.method === 'GET' && path === '/') return serveHtml();

        // Auth
        if (path === '/api/login') {
            const { email, password } = await req.json();
            const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
            // In a real app, hash check. For the "Spy" demo, we accept any login if db empty or matching
            if (!admin) {
                // Auto-create first admin for demo convenience
                const hash = await hashPassword(password);
                const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)').bind(email, hash, isoTimestamp()).run();
                return response({ id: res.meta.last_row_id });
            }
            const hashed = await hashPassword(password);
            if (hashed !== admin.password_hash) return errorResponse('ACCESS DENIED', 401);
            return response({ id: admin.id });
        }

        // Data Fetching
        if (path === '/api/dashboard') return handleGetDashboard(env.DB, url.searchParams.get('adminId'));
        if (path === '/api/suggestions') return handleGetSuggestions(env.DB, url.searchParams.get('adminId'));
        
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, dob, age, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(safeVal(p.admin_id), safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.dob), safeVal(p.age), isoTimestamp()).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(url.searchParams.get('adminId')).all();
            return response(res.results);
        }

        if (path === '/api/map-data') {
            return handleGetMapData(env.DB, url.searchParams.get('adminId'));
        }

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const id = idMatch[1];
            if(req.method === 'PATCH') {
                const p = await req.json();
                // Simple dynamic update
                const keys = Object.keys(p).filter(k => k !== 'id' && k !== 'created_at');
                const set = keys.map(k => `${k} = ?`).join(', ');
                const vals = keys.map(k => safeVal(p[k]));
                await env.DB.prepare(`UPDATE subjects SET ${set} WHERE id = ?`).bind(...vals, id).run();
                return response({success:true});
            }
            return handleGetSubjectFull(env.DB, id);
        }

        // Sub-Resources Handlers
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

        if (path === '/api/intel') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)')
                .bind(p.subject_id, p.category, p.label, p.value, isoTimestamp()).run();
            return response({success:true});
        }

        if (path === '/api/relationship') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, created_at) VALUES (?,?,?,?)')
                .bind(p.subjectA, p.targetId, p.type, isoTimestamp()).run();
            return response({success:true});
        }

        // Sharing Routes
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

        if (path === '/api/nuke') {
            await nukeDatabase(env.DB, env.BUCKET);
            return response({success:true});
        }
