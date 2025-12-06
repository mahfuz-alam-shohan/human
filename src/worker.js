const encoder = new TextEncoder();

// --- Configuration & Constants ---
const ALLOWED_ORIGINS = ['*']; 
const APP_TITLE = "SHADOW OPERATIVE";

// --- Database Schema & Migrations ---
const MIGRATIONS = [
  // Core Identity & Spy Metrics
  "ALTER TABLE subjects ADD COLUMN alias TEXT",
  "ALTER TABLE subjects ADD COLUMN threat_level TEXT DEFAULT 'Low'", // Low, Medium, High, Critical
  "ALTER TABLE subjects ADD COLUMN ideology TEXT", // Replaces religion
  "ALTER TABLE subjects ADD COLUMN modus_operandi TEXT", // Replaces habits
  "ALTER TABLE subjects ADD COLUMN weakness TEXT",
  
  // Clean up old psych columns (SQLite doesn't support DROP COLUMN easily, so we just ignore them in code)
  
  // New Tables for Spycraft
  `CREATE TABLE IF NOT EXISTS subject_interactions (
    id INTEGER PRIMARY KEY, 
    subject_id INTEGER, 
    date TEXT, 
    type TEXT, -- Direct Contact, Surveillance, Intercept, Informant
    transcript TEXT, 
    conclusion TEXT, 
    evidence_url TEXT,
    created_at TEXT
  )`,
  
  `CREATE TABLE IF NOT EXISTS subject_locations (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER,
    name TEXT,
    address TEXT,
    lat REAL,
    lng REAL,
    type TEXT, -- Residence, Workplace, Frequented, Safehouse, Dead Drop
    notes TEXT,
    created_at TEXT
  )`
];

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

// --- Database Layer ---

let schemaInitialized = false;

async function ensureSchema(db) {
  if (schemaInitialized) return;
  try {
      await db.prepare("PRAGMA foreign_keys = ON;").run();
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`),
        // Modified Subjects Table
        db.prepare(`CREATE TABLE IF NOT EXISTS subjects (
          id INTEGER PRIMARY KEY, admin_id INTEGER, full_name TEXT, alias TEXT, dob TEXT, age INTEGER, gender TEXT,
          occupation TEXT, nationality TEXT, ideology TEXT, location TEXT, contact TEXT,
          hometown TEXT, previous_locations TEXT,
          modus_operandi TEXT, notes TEXT, weakness TEXT, avatar_path TEXT, is_archived INTEGER DEFAULT 0,
          status TEXT DEFAULT 'Active', threat_level TEXT DEFAULT 'Low', last_sighted TEXT,
          height TEXT, weight TEXT, eye_color TEXT, hair_color TEXT, blood_type TEXT, identifying_marks TEXT,
          social_links TEXT, digital_identifiers TEXT,
          created_at TEXT, updated_at TEXT
        )`),
        // Surveillance Logs (formerly data points)
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_intel (
          id INTEGER PRIMARY KEY, subject_id INTEGER, category TEXT, label TEXT, 
          value TEXT, analysis TEXT, confidence INTEGER DEFAULT 100, source TEXT, created_at TEXT
        )`),
        // Media (Evidence)
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_media (
          id INTEGER PRIMARY KEY, subject_id INTEGER, object_key TEXT, content_type TEXT, description TEXT, created_at TEXT,
          media_type TEXT DEFAULT 'file', external_url TEXT
        )`),
        // Relationships
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_relationships (
          id INTEGER PRIMARY KEY, subject_a_id INTEGER, subject_b_id INTEGER, relationship_type TEXT, notes TEXT, created_at TEXT,
          custom_name TEXT, custom_avatar TEXT, custom_notes TEXT
        )`),
        // Interactions (Interrogations/Dialogues)
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_interactions (
            id INTEGER PRIMARY KEY, subject_id INTEGER, date TEXT, type TEXT, transcript TEXT, conclusion TEXT, evidence_url TEXT, created_at TEXT
        )`),
        // Locations (Geo-Intel)
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_locations (
            id INTEGER PRIMARY KEY, subject_id INTEGER, name TEXT, address TEXT, lat REAL, lng REAL, type TEXT, notes TEXT, created_at TEXT
        )`),
        // Shares
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_shares (
          id INTEGER PRIMARY KEY, subject_id INTEGER REFERENCES subjects(id), token TEXT UNIQUE, is_active INTEGER DEFAULT 1,
          duration_seconds INTEGER, started_at TEXT, created_at TEXT
        )`)
      ]);

      // Apply migrations safely
      for (const query of MIGRATIONS) {
        try { await db.prepare(query).run(); } catch(e) {}
      }
      schemaInitialized = true;
  } catch (err) { console.error("Init Error", err); }
}

async function nukeDatabase(db) {
    // The "Burn Protocol" - Drops all tables
    const tables = ['admins','subjects','subject_intel','subject_media','subject_relationships','subject_interactions','subject_locations','subject_shares'];
    for(const t of tables) {
        try { await db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); } catch(e) {}
    }
    schemaInitialized = false;
    return true;
}

// --- API Handlers ---

async function handleGetDashboard(db, adminId) {
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Target Identified' as desc, created_at as date FROM subjects WHERE admin_id = ?
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

// --- Frontend HTML ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-black">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Shadow Operative OS</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  
  <style>
    :root { --neon-red: #ef4444; --neon-amber: #f59e0b; --dark-bg: #0a0a0a; --panel: #171717; }
    body { font-family: 'Inter', sans-serif; background-color: var(--dark-bg); color: #e5e5e5; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    
    .glass { background: rgba(23, 23, 23, 0.8); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.05); }
    .glass-input { background: rgba(0,0,0,0.3); border: 1px solid #333; color: white; transition: all 0.2s; }
    .glass-input:focus { border-color: var(--neon-red); outline: none; background: rgba(0,0,0,0.5); }
    
    .threat-low { border-left: 3px solid #10b981; }
    .threat-medium { border-left: 3px solid #f59e0b; }
    .threat-high { border-left: 3px solid #ef4444; }
    .threat-critical { border-left: 3px solid #7f1d1d; animation: pulse-red 2s infinite; }
    
    @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
    
    .map-container { height: 100%; width: 100%; z-index: 1; }
    .leaflet-tile { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
    
    .touch-target { min-height: 48px; }
    
    /* Scrollbar */
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
    ::-webkit-scrollbar-track { background: transparent; }
  </style>
</head>
<body class="h-full overflow-hidden selection:bg-red-900 selection:text-white">
  <div id="app" class="h-full flex flex-col">

    <!-- Auth Screen -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')]">
        <div class="w-full max-w-sm glass p-8 rounded-none border-l-4 border-red-600 shadow-2xl">
            <div class="text-center mb-8">
                <i class="fa-solid fa-user-secret text-4xl text-red-500 mb-4"></i>
                <h1 class="text-2xl font-black tracking-widest text-white uppercase">Shadow<span class="text-red-600">Operative</span></h1>
                <p class="text-gray-500 text-xs font-mono mt-2">CLASSIFIED ACCESS ONLY</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="AGENT ID" class="glass-input w-full p-4 text-xs font-mono tracking-wider" required>
                <input v-model="auth.password" type="password" placeholder="ACCESS CODE" class="glass-input w-full p-4 text-xs font-mono tracking-wider" required>
                <button type="submit" :disabled="loading" class="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-4 text-xs tracking-[0.2em] uppercase transition-colors">
                    {{ loading ? 'AUTHENTICATING...' : 'ESTABLISH LINK' }}
                </button>
            </form>
        </div>
    </div>

    <!-- Main App -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
        
        <!-- Sidebar -->
        <nav class="hidden md:flex flex-col w-20 bg-neutral-900 border-r border-neutral-800 items-center py-6 z-20">
            <div class="mb-8 text-red-600 text-2xl"><i class="fa-solid fa-eye"></i></div>
            <div class="flex-1 space-y-6 w-full px-2">
                <button v-for="t in tabs" @click="currentTab = t.id" :class="currentTab === t.id ? 'text-red-500 bg-white/5' : 'text-gray-500 hover:text-gray-300'" class="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all">
                    <i :class="t.icon" class="text-lg"></i>
                    <span class="text-[9px] font-mono uppercase">{{t.label}}</span>
                </button>
            </div>
            <button @click="openSettings" class="text-gray-600 hover:text-red-500 p-4"><i class="fa-solid fa-gear"></i></button>
        </nav>

        <!-- Mobile Header -->
        <header class="md:hidden h-14 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 z-20 shrink-0">
            <span class="font-black text-white tracking-widest text-sm">SHADOW<span class="text-red-600">OP</span></span>
            <button @click="openSettings"><i class="fa-solid fa-gear text-gray-400"></i></button>
        </header>

        <!-- Content Area -->
        <main class="flex-1 relative overflow-hidden bg-black flex flex-col">
            
            <!-- Dashboard -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="glass p-4 border-t-2 border-red-600">
                            <div class="text-[10px] text-gray-500 font-mono uppercase">Targets</div>
                            <div class="text-2xl font-bold text-white">{{ stats.targets || 0 }}</div>
                        </div>
                        <div class="glass p-4 border-t-2 border-amber-500">
                            <div class="text-[10px] text-gray-500 font-mono uppercase">Encounters</div>
                            <div class="text-2xl font-bold text-white">{{ stats.encounters || 0 }}</div>
                        </div>
                        <div class="glass p-4 border-t-2 border-blue-500">
                            <div class="text-[10px] text-gray-500 font-mono uppercase">Evidence</div>
                            <div class="text-2xl font-bold text-white">{{ stats.evidence || 0 }}</div>
                        </div>
                        <button @click="openModal('add-subject')" class="bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 p-4 flex flex-col items-center justify-center group transition-all cursor-pointer">
                            <i class="fa-solid fa-plus text-red-500 mb-1 group-hover:scale-110 transition-transform"></i>
                            <span class="text-[10px] font-bold text-red-400 uppercase">New Target</span>
                        </button>
                    </div>

                    <div class="glass p-0 overflow-hidden">
                        <div class="bg-neutral-900/50 p-3 border-b border-white/5 flex justify-between items-center">
                            <h3 class="text-xs font-bold text-gray-300 uppercase tracking-wider"><i class="fa-solid fa-satellite-dish mr-2 text-red-500"></i>Surveillance Feed</h3>
                            <button @click="fetchData" class="text-gray-500 hover:text-white"><i class="fa-solid fa-rotate-right text-xs"></i></button>
                        </div>
                        <div class="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 hover:bg-white/5 cursor-pointer flex gap-4 items-start">
                                <div class="mt-1 w-2 h-2 rounded-full" :class="item.type === 'interaction' ? 'bg-amber-500' : 'bg-red-500'"></div>
                                <div>
                                    <div class="text-sm font-bold text-gray-200">{{ item.title }} <span class="text-gray-600 mx-2">//</span> <span class="text-xs text-gray-400 font-mono">{{ item.desc }}</span></div>
                                    <div class="text-[10px] text-gray-600 font-mono mt-1">{{ new Date(item.date).toLocaleString() }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Targets List -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col">
                <div class="p-4 border-b border-white/10 flex gap-2">
                    <input v-model="search" placeholder="SEARCH DATABASE..." class="glass-input flex-1 p-3 text-xs font-mono uppercase rounded">
                    <button @click="openModal('add-subject')" class="bg-red-700 text-white px-4 rounded font-bold"><i class="fa-solid fa-plus"></i></button>
                </div>
                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="glass p-4 cursor-pointer hover:bg-white/5 group relative overflow-hidden" :class="'threat-' + s.threat_level.toLowerCase()">
                        <div class="flex items-start justify-between">
                            <div class="flex gap-3">
                                <div class="w-12 h-12 bg-neutral-800 rounded overflow-hidden">
                                    <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-600"><i class="fa-solid fa-user"></i></div>
                                </div>
                                <div>
                                    <div class="font-bold text-white text-sm uppercase">{{ s.alias || s.full_name }}</div>
                                    <div class="text-[10px] text-gray-500 font-mono">{{ s.occupation || 'UNKNOWN' }}</div>
                                    <div class="text-[10px] mt-1" :class="getThreatColor(s.threat_level)">THREAT: {{ s.threat_level }}</div>
                                </div>
                            </div>
                            <div class="text-[10px] font-mono text-gray-600">{{ s.status }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Subject Detail -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col h-full">
                <!-- Top Bar -->
                <div class="h-16 border-b border-white/10 flex items-center px-4 justify-between bg-neutral-900/80 backdrop-blur shrink-0">
                    <div class="flex items-center gap-3">
                        <button @click="currentTab='targets'" class="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-gray-400"><i class="fa-solid fa-arrow-left"></i></button>
                        <div>
                            <div class="font-black text-white text-sm uppercase tracking-wider">{{ selected.alias || selected.full_name }}</div>
                            <div class="text-[10px] text-gray-500 font-mono">ID: {{ String(selected.id).padStart(6, '0') }}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="openModal('add-interaction')" class="bg-amber-700/20 text-amber-500 hover:bg-amber-700/40 px-3 py-1.5 rounded text-[10px] font-bold border border-amber-700/50 uppercase"><i class="fa-solid fa-microphone mr-1"></i> Log Contact</button>
                        <button @click="exportData" class="text-gray-400 hover:text-white px-3"><i class="fa-solid fa-download"></i></button>
                    </div>
                </div>

                <!-- Sub Tabs -->
                <div class="flex border-b border-white/10 overflow-x-auto bg-black/50 shrink-0">
                    <button v-for="t in ['profile','surveillance','interrogations','geoint','network','evidence']" 
                        @click="subTab = t" 
                        :class="subTab === t ? 'text-red-500 border-b-2 border-red-500 bg-white/5' : 'text-gray-500'"
                        class="px-4 py-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors">
                        {{ t }}
                    </button>
                </div>

                <!-- Detail Body -->
                <div class="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-950/50">
                    
                    <!-- Profile Tab -->
                    <div v-if="subTab === 'profile'" class="space-y-6 max-w-4xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-[3/4] bg-neutral-900 rounded border border-neutral-800 overflow-hidden relative group">
                                    <img :src="resolveImg(selected.avatar_path) || 'https://www.transparenttextures.com/patterns/black-linen.png'" class="w-full h-full object-cover">
                                    <button @click="triggerUpload('avatar')" class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold uppercase tracking-wider text-white border-2 border-white w-32 h-10 m-auto hover:bg-white hover:text-black">Update Photo</button>
                                </div>
                                <div class="glass p-4 space-y-2">
                                    <div class="text-[10px] text-gray-500 uppercase font-bold">Threat Level</div>
                                    <select v-model="selected.threat_level" @change="updateSubject" class="w-full bg-black border border-gray-700 text-xs p-2 text-white uppercase font-bold">
                                        <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                                    </select>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-4">
                                <div class="glass p-5 relative">
                                    <button @click="openModal('edit-profile')" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i class="fa-solid fa-pen-to-square"></i></button>
                                    <h3 class="text-xs text-red-500 font-bold uppercase mb-4 tracking-widest"> Dossier Overview</h3>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
                                        <div><span class="text-gray-500 block mb-1">REAL NAME</span> <span class="font-mono text-white">{{selected.full_name}}</span></div>
                                        <div><span class="text-gray-500 block mb-1">NATIONALITY</span> <span class="font-mono text-white">{{selected.nationality || 'UNKNOWN'}}</span></div>
                                        <div><span class="text-gray-500 block mb-1">OCCUPATION</span> <span class="font-mono text-white">{{selected.occupation || 'COVER UNKNOWN'}}</span></div>
                                        <div><span class="text-gray-500 block mb-1">IDEOLOGY</span> <span class="font-mono text-white">{{selected.ideology || 'NONE'}}</span></div>
                                        <div class="col-span-2 border-t border-white/10 pt-2 mt-2">
                                            <span class="text-gray-500 block mb-1">MODUS OPERANDI</span>
                                            <p class="text-gray-300 leading-relaxed font-mono">{{selected.modus_operandi || 'No patterns established.'}}</p>
                                        </div>
                                        <div class="col-span-2">
                                            <span class="text-gray-500 block mb-1">KNOWN WEAKNESSES</span>
                                            <p class="text-red-400 leading-relaxed font-mono">{{selected.weakness || 'None identified.'}}</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="glass p-5">
                                    <h3 class="text-xs text-red-500 font-bold uppercase mb-4 tracking-widest">Physical Profile</h3>
                                    <div class="grid grid-cols-3 gap-2 text-center text-xs">
                                        <div class="bg-white/5 p-2 rounded"><div class="text-gray-500 text-[9px]">HEIGHT</div>{{selected.height || '--'}}</div>
                                        <div class="bg-white/5 p-2 rounded"><div class="text-gray-500 text-[9px]">WEIGHT</div>{{selected.weight || '--'}}</div>
                                        <div class="bg-white/5 p-2 rounded"><div class="text-gray-500 text-[9px]">AGE</div>{{selected.age || '--'}}</div>
                                    </div>
                                    <div class="mt-4">
                                        <div class="text-[9px] text-gray-500 uppercase">Identifying Marks</div>
                                        <div class="text-xs text-white font-mono mt-1">{{selected.identifying_marks || 'None listed'}}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Interrogations Tab -->
                    <div v-if="subTab === 'interrogations'" class="space-y-4 max-w-3xl mx-auto">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest">Interaction Logs</h3>
                            <button @click="openModal('add-interaction')" class="bg-red-700 text-white px-4 py-2 text-xs font-bold uppercase">Log Contact</button>
                        </div>
                        <div v-if="!selected.interactions?.length" class="text-center py-10 text-gray-600 font-mono text-xs">NO CONTACT RECORDED</div>
                        <div v-for="ix in selected.interactions" :key="ix.id" class="glass border-l-2 border-amber-500 p-4 space-y-3 relative group">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="bg-amber-900/30 text-amber-500 px-2 py-0.5 text-[9px] font-bold uppercase rounded border border-amber-900/50">{{ix.type}}</span>
                                    <span class="text-gray-500 text-[10px] ml-2 font-mono">{{ new Date(ix.date).toLocaleString() }}</span>
                                </div>
                                <button @click="deleteItem('subject_interactions', ix.id)" class="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button>
                            </div>
                            <div class="font-mono text-xs text-gray-300 whitespace-pre-wrap pl-3 border-l border-white/10">{{ix.transcript}}</div>
                            <div class="bg-black/40 p-3 text-xs border border-white/5">
                                <span class="text-red-400 font-bold uppercase text-[9px] block mb-1">Analyst Conclusion</span>
                                {{ix.conclusion}}
                            </div>
                            <a v-if="ix.evidence_url" :href="ix.evidence_url" target="_blank" class="inline-flex items-center gap-2 text-[10px] text-blue-400 hover:text-blue-300 uppercase font-bold"><i class="fa-solid fa-paperclip"></i> Attached Evidence</a>
                        </div>
                    </div>

                    <!-- GeoIntel Tab (Map) -->
                    <div v-show="subTab === 'geoint'" class="h-full flex flex-col">
                        <div class="flex justify-between items-center mb-4 shrink-0">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest">Known Locations</h3>
                            <button @click="openModal('add-location')" class="bg-blue-900/50 text-blue-400 border border-blue-800 px-4 py-2 text-xs font-bold uppercase hover:bg-blue-900">Pin Location</button>
                        </div>
                        <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[400px]">
                            <div class="md:col-span-2 glass p-1 rounded overflow-hidden h-full min-h-[300px]">
                                <div id="subjectMap" class="w-full h-full bg-neutral-900"></div>
                            </div>
                            <div class="space-y-2 overflow-y-auto max-h-[500px]">
                                <div v-for="loc in selected.locations" :key="loc.id" class="glass p-3 flex flex-col gap-1 cursor-pointer hover:border-blue-500 transition-colors" @click="flyTo(loc)">
                                    <div class="flex justify-between">
                                        <div class="text-xs font-bold text-white uppercase">{{loc.name}}</div>
                                        <div class="text-[9px] text-gray-500 font-mono">{{loc.type}}</div>
                                    </div>
                                    <div class="text-[10px] text-gray-400 font-mono truncate">{{loc.address}}</div>
                                    <div v-if="loc.notes" class="text-[10px] text-blue-400 mt-1">"{{loc.notes}}"</div>
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-[9px] text-red-500 text-right mt-1 hover:underline">REMOVE</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Network/Graph -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div class="flex justify-between items-center mb-2 shrink-0">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest">Relationship Matrix</h3>
                            <button @click="openModal('add-rel')" class="text-xs bg-white/10 px-3 py-1 hover:bg-white/20">Add Connection</button>
                        </div>
                        <div class="flex-1 glass relative">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
                    </div>

                    <!-- Surveillance Logs (Old Data Points) -->
                    <div v-if="subTab === 'surveillance'" class="space-y-4 max-w-4xl mx-auto">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest">Surveillance Logs</h3>
                            <button @click="openModal('add-intel')" class="text-xs bg-white/10 px-3 py-1 hover:bg-white/20">New Log Entry</button>
                        </div>
                        <div class="grid gap-2">
                            <div v-for="log in selected.intel" :key="log.id" class="glass p-3 flex items-start gap-4">
                                <div class="text-[9px] font-mono text-gray-500 w-20 shrink-0 text-right">{{new Date(log.created_at).toLocaleDateString()}}</div>
                                <div class="flex-1">
                                    <div class="text-xs font-bold text-red-400 uppercase mb-1">{{log.label}} <span class="text-gray-600 text-[9px] ml-2 border border-gray-800 px-1">{{log.category}}</span></div>
                                    <p class="text-sm text-gray-300">{{log.value}}</p>
                                    <div v-if="log.analysis" class="mt-2 text-xs text-amber-500 font-mono border-l-2 border-amber-900 pl-2">ANALYSIS: {{log.analysis}}</div>
                                </div>
                                <button @click="deleteItem('subject_intel', log.id)" class="text-gray-600 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                        </div>
                    </div>

                    <!-- Evidence -->
                    <div v-if="subTab === 'evidence'" class="space-y-4">
                        <div class="flex gap-4">
                            <div @click="triggerUpload('media')" class="h-32 w-32 border-2 border-dashed border-gray-700 flex flex-col items-center justify-center cursor-pointer hover:border-red-500 hover:text-red-500 text-gray-600 transition-colors">
                                <i class="fa-solid fa-cloud-arrow-up text-2xl mb-2"></i>
                                <span class="text-[9px] uppercase font-bold">Upload File</span>
                            </div>
                            <!-- Evidence Grid -->
                            <div class="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                <div v-for="m in selected.media" :key="m.id" class="glass group relative aspect-square">
                                    <img v-if="m.content_type.startsWith('image')" :src="'/api/media/' + m.object_key" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-500"><i class="fa-solid fa-file-lines text-3xl"></i></div>
                                    <div class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2 text-center">
                                        <p class="text-[9px] text-white mb-2">{{m.description || 'No Desc'}}</p>
                                        <a :href="'/api/media/' + m.object_key" download class="text-xs text-blue-400 font-bold uppercase mb-2">Download</a>
                                        <button @click="deleteItem('subject_media', m.id)" class="text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- War Room Map Tab (Global) -->
            <div v-if="currentTab === 'map'" class="flex-1 relative">
                <div id="warRoomMap" class="w-full h-full bg-neutral-900"></div>
                <div class="absolute top-4 left-4 z-[400] glass p-4 max-w-xs">
                    <h3 class="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Global Tracking</h3>
                    <p class="text-[10px] text-gray-400">Monitoring {{subjects.length}} active targets.</p>
                </div>
            </div>

        </main>

        <!-- Mobile Nav -->
        <nav class="md:hidden h-16 bg-neutral-900 border-t border-neutral-800 flex justify-around items-center shrink-0 z-20">
            <button v-for="t in tabs" @click="currentTab = t.id" :class="currentTab === t.id ? 'text-red-500' : 'text-gray-600'" class="flex flex-col items-center gap-1">
                <i :class="t.icon"></i>
            </button>
        </nav>

    </div>

    <!-- Modals -->
    <div v-if="modal.active" class="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-lg glass bg-neutral-900 p-6 shadow-2xl border border-white/10">
            <h3 class="text-sm font-bold text-white uppercase tracking-widest mb-6 border-b border-white/10 pb-2">{{ modalTitle }}</h3>
            
            <!-- Forms -->
            <form v-if="modal.active === 'add-subject' || modal.active === 'edit-profile'" @submit.prevent="submitSubject" class="space-y-4">
                <input v-model="forms.subject.full_name" placeholder="REAL NAME" class="glass-input w-full p-3 text-xs" required>
                <input v-model="forms.subject.alias" placeholder="CODENAME / ALIAS" class="glass-input w-full p-3 text-xs">
                <div class="grid grid-cols-2 gap-4">
                    <select v-model="forms.subject.threat_level" class="glass-input p-3 text-xs bg-black">
                        <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                    </select>
                    <input v-model="forms.subject.occupation" placeholder="COVER/OCCUPATION" class="glass-input p-3 text-xs">
                </div>
                <input v-model="forms.subject.nationality" placeholder="NATIONALITY" class="glass-input w-full p-3 text-xs">
                <input v-model="forms.subject.ideology" placeholder="IDEOLOGY / AFFILIATION" class="glass-input w-full p-3 text-xs">
                <textarea v-model="forms.subject.modus_operandi" placeholder="MODUS OPERANDI / HABITS" rows="3" class="glass-input w-full p-3 text-xs"></textarea>
                <textarea v-model="forms.subject.weakness" placeholder="KNOWN WEAKNESSES" rows="2" class="glass-input w-full p-3 text-xs border-red-900/50"></textarea>
                <button type="submit" class="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 text-xs uppercase tracking-widest">SAVE DOSSIER</button>
                <button v-if="modal.active === 'edit-profile'" type="button" @click="archiveSubject" class="w-full text-red-500 text-[10px] mt-2 hover:underline uppercase">ARCHIVE SUBJECT (DELETE)</button>
            </form>

            <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <input type="datetime-local" v-model="forms.interaction.date" class="glass-input p-3 text-xs bg-black text-white" required>
                    <select v-model="forms.interaction.type" class="glass-input p-3 text-xs bg-black">
                        <option>Direct Contact</option>
                        <option>Surveillance</option>
                        <option>Intercept</option>
                        <option>Interrogation</option>
                        <option>Informant Report</option>
                    </select>
                </div>
                <textarea v-model="forms.interaction.transcript" placeholder="TRANSCRIPT / DIALOGUE LOG" rows="6" class="glass-input w-full p-3 text-xs font-mono" required></textarea>
                <textarea v-model="forms.interaction.conclusion" placeholder="ANALYST CONCLUSION / DEBRIEF" rows="3" class="glass-input w-full p-3 text-xs"></textarea>
                <input v-model="forms.interaction.evidence_url" placeholder="EXTERNAL EVIDENCE LINK (OPTIONAL)" class="glass-input w-full p-3 text-xs">
                <button type="submit" class="w-full bg-amber-700 hover:bg-amber-600 text-white font-bold py-3 text-xs uppercase tracking-widest">LOG INTERACTION</button>
            </form>

            <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                <input v-model="forms.location.name" placeholder="LOCATION NAME (e.g. Safehouse Alpha)" class="glass-input w-full p-3 text-xs" required>
                <div class="grid grid-cols-2 gap-4">
                    <input v-model="forms.location.lat" placeholder="LATITUDE" type="number" step="any" class="glass-input p-3 text-xs">
                    <input v-model="forms.location.lng" placeholder="LONGITUDE" type="number" step="any" class="glass-input p-3 text-xs">
                </div>
                <p class="text-[9px] text-gray-500">Tip: Click on the map to auto-fill coords.</p>
                <select v-model="forms.location.type" class="glass-input w-full p-3 text-xs bg-black">
                    <option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Safehouse</option><option>Dead Drop</option><option>Unknown</option>
                </select>
                <input v-model="forms.location.address" placeholder="ADDRESS (OPTIONAL)" class="glass-input w-full p-3 text-xs">
                <textarea v-model="forms.location.notes" placeholder="NOTES / ACCESS INFO" rows="2" class="glass-input w-full p-3 text-xs"></textarea>
                <button type="submit" class="w-full bg-blue-800 hover:bg-blue-700 text-white font-bold py-3 text-xs uppercase tracking-widest">PIN LOCATION</button>
            </form>

            <form v-if="modal.active === 'settings'" @submit.prevent class="space-y-6 text-center">
                <div class="p-4 bg-red-900/20 border border-red-900/50">
                    <h4 class="text-red-500 font-bold uppercase text-xs mb-2">Danger Zone</h4>
                    <p class="text-gray-400 text-[10px] mb-4">The Burn Protocol will permanently destroy all records, logs, and evidence links. This action is irreversible.</p>
                    <button @click="burnProtocol" class="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 text-xs uppercase tracking-widest w-full">INITIATE BURN PROTOCOL</button>
                </div>
                <button @click="logout" class="text-gray-500 text-xs hover:text-white uppercase">Disconnect Session</button>
            </form>

             <!-- Basic Intel/Rel Forms omitted for brevity but present in logic -->
             <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                <input v-model="forms.intel.label" placeholder="TOPIC" class="glass-input w-full p-3 text-xs" required>
                <textarea v-model="forms.intel.value" placeholder="OBSERVATION" rows="3" class="glass-input w-full p-3 text-xs" required></textarea>
                <button type="submit" class="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 text-xs uppercase">ADD LOG</button>
             </form>

             <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                <select v-model="forms.rel.targetId" class="glass-input w-full p-3 text-xs bg-black">
                    <option v-for="s in subjects" :value="s.id">{{s.full_name}} ({{s.alias}})</option>
                </select>
                <input v-model="forms.rel.type" placeholder="RELATIONSHIP TYPE" class="glass-input w-full p-3 text-xs" required>
                <button type="submit" class="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 text-xs uppercase">LINK SUBJECTS</button>
             </form>

        </div>
    </div>

    <input type="file" ref="fileInput" class="hidden" @change="handleFile" accept="image/*,application/pdf">

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        const view = ref('auth');
        const loading = ref(false);
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', label: 'Command', icon: 'fa-solid fa-terminal' },
            { id: 'targets', label: 'Targets', icon: 'fa-solid fa-crosshairs' },
            { id: 'map', label: 'War Room', icon: 'fa-solid fa-map' },
        ];
        const currentTab = ref('dashboard');
        const subTab = ref('profile');
        
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const selected = ref(null);
        const search = ref('');
        const modal = reactive({ active: null });
        
        const forms = reactive({
            subject: {},
            interaction: {},
            location: {},
            intel: {},
            rel: {}
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
            const d = await api('/dashboard?adminId='+adminId);
            stats.value = d.stats;
            feed.value = d.feed;
            subjects.value = await api('/subjects?adminId='+adminId);
        };

        const viewSubject = async (id) => {
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            subTab.value = 'profile';
        };

        // --- Maps ---
        let mapInstance = null;
        let mapMarkers = [];

        const initMap = (elementId, locations, onClick) => {
            if(mapInstance) { mapInstance.remove(); mapInstance = null; }
            const container = document.getElementById(elementId);
            if(!container) return;

            mapInstance = L.map(elementId, { attributionControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(mapInstance);

            locations.forEach(loc => {
                if(loc.lat && loc.lng) {
                    const m = L.marker([loc.lat, loc.lng]).addTo(mapInstance)
                        .bindPopup(\`<b>\${loc.name}</b><br>\${loc.type}\`);
                    mapMarkers.push(m);
                }
            });

            if(onClick) {
                mapInstance.on('click', e => onClick(e.latlng));
            }
        };

        // Watchers for Map Init
        watch(() => subTab.value, (val) => {
            if(val === 'geoint' && selected.value) {
                nextTick(() => initMap('subjectMap', selected.value.locations || [], (coords) => {
                    openModal('add-location');
                    forms.location.lat = coords.lat;
                    forms.location.lng = coords.lng;
                }));
            }
            if(val === 'network' && selected.value) {
                nextTick(initNetwork);
            }
        });

        watch(() => currentTab.value, (val) => {
            if(val === 'map') {
                // Collect all locations
                nextTick(async () => {
                    // Fetch all locations via a special call or iterate subjects if loaded
                    // For simplicity, we assume subjects are loaded or we fetch specific map data
                    const allLocs = []; // Populate this in real app
                    initMap('warRoomMap', allLocs, null); 
                });
            }
        });

        // --- Network Graph ---
        const initNetwork = () => {
            const container = document.getElementById('relNetwork');
            if(!container || !selected.value) return;
            
            const nodes = [{id: selected.value.id, label: selected.value.alias, color: '#ef4444', size: 30}];
            const edges = [];
            
            selected.value.relationships.forEach(r => {
                const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, color: '#444' });
                edges.push({ from: selected.value.id, to: targetId || 'ext-'+r.id, label: r.relationship_type });
            });

            new vis.Network(container, { nodes, edges }, {
                nodes: { shape: 'dot', font: { color: '#fff' } },
                edges: { color: '#666' },
                physics: { stabilization: false }
            });
        };

        // Modals & Forms
        const openModal = (type) => {
            modal.active = type;
            const aid = localStorage.getItem('admin_id');
            if(type === 'add-subject') forms.subject = { admin_id: aid, status: 'Active', threat_level: 'Low' };
            if(type === 'edit-profile') forms.subject = { ...selected.value };
            if(type === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) };
            if(type === 'add-location') forms.location = { subject_id: selected.value.id };
            if(type === 'add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' };
            if(type === 'add-rel') forms.rel = { subjectA: selected.value.id };
        };
        const closeModal = () => modal.active = null;

        const submitSubject = async () => {
            const isEdit = modal.active === 'edit-profile';
            const ep = isEdit ? '/subjects/' + selected.value.id : '/subjects';
            const method = isEdit ? 'PATCH' : 'POST';
            await api(ep, { method, body: JSON.stringify(forms.subject) });
            if(isEdit) selected.value = { ...selected.value, ...forms.subject };
            else fetchData();
            closeModal();
        };

        const submitInteraction = async () => {
            await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) });
            viewSubject(selected.value.id); closeModal();
        };

        const submitLocation = async () => {
            await api('/location', { method: 'POST', body: JSON.stringify(forms.location) });
            viewSubject(selected.value.id); closeModal();
        };
        
        const submitIntel = async () => {
             await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) });
             viewSubject(selected.value.id); closeModal();
        };

        const submitRel = async () => {
             await api('/relationship', { method: 'POST', body: JSON.stringify({...forms.rel, subjectA: selected.value.id}) });
             viewSubject(selected.value.id); closeModal();
        };

        const deleteItem = async (table, id) => {
            if(confirm('Confirm deletion?')) {
                await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) });
                viewSubject(selected.value.id);
            }
        };

        const archiveSubject = async () => {
            if(confirm('ARCHIVE TARGET? This hides them from active lists.')) {
                await api('/delete', { method: 'POST', body: JSON.stringify({ table: 'subjects', id: selected.value.id }) });
                closeModal(); currentTab.value = 'targets'; fetchData();
            }
        };

        const burnProtocol = async () => {
            if(prompt("TYPE 'BURN' TO CONFIRM DESTRUCTION") === 'BURN') {
                await api('/nuke', { method: 'POST' });
                location.reload();
            }
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

        // Helpers
        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
        const getThreatColor = (l) => ({'Low':'text-green-500','Medium':'text-amber-500','High':'text-red-500','Critical':'text-red-700 animate-pulse'}[l] || 'text-gray-500');
        const flyTo = (loc) => mapInstance?.flyTo([loc.lat, loc.lng], 15);
        const openSettings = () => openModal('settings');
        const logout = () => { localStorage.clear(); location.reload(); };
        const filteredSubjects = computed(() => subjects.value.filter(s => s.full_name.toLowerCase().includes(search.value.toLowerCase()) || (s.alias && s.alias.toLowerCase().includes(search.value.toLowerCase()))));
        const exportData = () => {
            const blob = new Blob([JSON.stringify(selected.value, null, 2)], {type : 'application/json'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = (selected.value.alias || 'subject') + '.json';
            link.click();
        };

        onMounted(() => {
            if(localStorage.getItem('admin_id')) { view.value = 'app'; fetchData(); }
        });

        return { 
            view, auth, loading, tabs, currentTab, subTab, stats, feed, subjects, filteredSubjects, selected, search, modal, forms, fileInput,
            handleAuth, fetchData, viewSubject, openModal, closeModal, submitSubject, submitInteraction, submitLocation, submitIntel, submitRel,
            triggerUpload, handleFile, deleteItem, archiveSubject, burnProtocol, resolveImg, getThreatColor, flyTo, openSettings, logout, exportData
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
        
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(p.admin_id, p.full_name, p.alias, p.threat_level, p.status, p.occupation, p.nationality, p.ideology, p.modus_operandi, p.weakness, isoTimestamp()).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(url.searchParams.get('adminId')).all();
            return response(res.results);
        }

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const id = idMatch[1];
            if(req.method === 'PATCH') {
                const p = await req.json();
                // Simple dynamic update
                const keys = Object.keys(p).filter(k => k !== 'id' && k !== 'created_at');
                const set = keys.map(k => `${k} = ?`).join(', ');
                const vals = keys.map(k => p[k]);
                await env.DB.prepare(`UPDATE subjects SET ${set} WHERE id = ?`).bind(...vals, id).run();
                return response({success:true});
            }
            return handleGetSubjectFull(env.DB, id);
        }

        // Sub-Resources Handlers
        if (path === '/api/interaction') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, evidence_url, created_at) VALUES (?,?,?,?,?,?,?)')
                .bind(p.subject_id, p.date, p.type, p.transcript, p.conclusion, p.evidence_url, isoTimestamp()).run();
            return response({success:true});
        }

        if (path === '/api/location') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_locations (subject_id, name, address, lat, lng, type, notes, created_at) VALUES (?,?,?,?,?,?,?,?)')
                .bind(p.subject_id, p.name, p.address, p.lat, p.lng, p.type, p.notes, isoTimestamp()).run();
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
            await nukeDatabase(env.DB);
            return response({success:true});
        }

        // Media Handlers
        if (path === '/api/upload-avatar' || path === '/api/upload-media') {
            const { subjectId, data, filename, contentType } = await req.json();
            const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(filename)}`;
            const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            await env.BUCKET.put(key, binary, { httpMetadata: { contentType } });
            
            if (path.includes('avatar')) await env.DB.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
            else await env.DB.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, created_at) VALUES (?,?,?,?)').bind(subjectId, key, contentType, isoTimestamp()).run();
            
            return response({success:true});
        }

        if (path.startsWith('/api/media/')) {
            const key = path.replace('/api/media/', '');
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response('Not found', { status: 404 });
            return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' }});
        }

        return new Response('Not Found', { status: 404 });
    } catch(e) {
        return errorResponse(e.message);
    }
  }
};
