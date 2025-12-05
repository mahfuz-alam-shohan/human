const encoder = new TextEncoder();

// --- Configuration & Constants ---
const ALLOWED_ORIGINS = ['*']; 
const MAX_UPLOAD_SIZE = 15 * 1024 * 1024; // Increased to 15MB

// --- Schema Definitions ---
const MIGRATIONS = [
  "ALTER TABLE subject_data_points ADD COLUMN parent_id INTEGER REFERENCES subject_data_points(id)",
  "ALTER TABLE subjects ADD COLUMN avatar_path TEXT",
  "ALTER TABLE subjects ADD COLUMN is_archived INTEGER DEFAULT 0",
  // New Deep Research Fields
  "ALTER TABLE subject_data_points ADD COLUMN confidence INTEGER DEFAULT 100",
  "ALTER TABLE subject_data_points ADD COLUMN source TEXT",
  "ALTER TABLE subjects ADD COLUMN status TEXT DEFAULT 'Active'", 
  "ALTER TABLE subjects ADD COLUMN last_sighted TEXT"
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
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'upload';
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

function errorResponse(msg, status = 500) {
    return response({ error: msg }, status);
}

// --- Database Layer ---

async function ensureSchema(db) {
  try {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subjects (
          id INTEGER PRIMARY KEY, admin_id INTEGER, full_name TEXT, dob TEXT, age INTEGER, gender TEXT, 
          occupation TEXT, nationality TEXT, education TEXT, religion TEXT, location TEXT, contact TEXT, 
          habits TEXT, notes TEXT, avatar_path TEXT, is_archived INTEGER DEFAULT 0,
          status TEXT DEFAULT 'Active', last_sighted TEXT,
          created_at TEXT, updated_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_data_points (
          id INTEGER PRIMARY KEY, subject_id INTEGER, parent_id INTEGER, category TEXT, label TEXT, 
          value TEXT, analysis TEXT, confidence INTEGER DEFAULT 100, source TEXT, created_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_events (
          id INTEGER PRIMARY KEY, subject_id INTEGER, title TEXT, description TEXT, event_date TEXT, created_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_relationships (
          id INTEGER PRIMARY KEY, subject_a_id INTEGER, subject_b_id INTEGER, relationship_type TEXT, notes TEXT, created_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_media (
          id INTEGER PRIMARY KEY, subject_id INTEGER, object_key TEXT, content_type TEXT, description TEXT, created_at TEXT
        )`)
      ]);

      // Safe Migrations
      for (const query of MIGRATIONS) {
        try { await db.prepare(query).run(); } catch(e) { /* Ignore if column exists */ }
      }
  } catch (err) {
      console.error("Schema Init Error:", err);
  }
}

// --- API Handlers ---

async function handleGetDashboard(db, adminId) {
    // Get recent activity feed
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'New Subject Created' as desc, created_at as date FROM subjects WHERE admin_id = ?
        UNION ALL
        SELECT 'event' as type, subject_id as ref_id, title, description as desc, created_at as date FROM subject_events WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        UNION ALL
        SELECT 'media' as type, subject_id as ref_id, 'New Evidence' as title, description as desc, created_at as date FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        ORDER BY date DESC LIMIT 20
    `).bind(adminId, adminId, adminId).all();

    const stats = await db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM subjects WHERE admin_id = ? AND is_archived = 0) as active_subjects,
            (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as total_media,
            (SELECT COUNT(*) FROM subject_data_points WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as total_intel
    `).bind(adminId, adminId, adminId).first();

    return response({ feed: recent.results, stats });
}

async function handleGetGraph(db, adminId) {
    const subjects = await db.prepare("SELECT id, full_name, avatar_path, occupation, status FROM subjects WHERE admin_id = ? AND is_archived = 0").bind(adminId).all();
    const rels = await db.prepare(`
        SELECT r.subject_a_id as from_id, r.subject_b_id as to_id, r.relationship_type as label 
        FROM subject_relationships r 
        JOIN subjects s ON r.subject_a_id = s.id 
        WHERE s.admin_id = ?
    `).bind(adminId).all();
    
    return response({ nodes: subjects.results, edges: rels.results });
}

async function handleGetSubjectFull(db, id) {
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
    if (!subject) return errorResponse("Subject not found", 404);

    const [media, dataPoints, events, relationships] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_data_points WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(), 
        db.prepare('SELECT * FROM subject_events WHERE subject_id = ? ORDER BY event_date DESC').bind(id).all(),
        db.prepare(`
            SELECT r.*, s.full_name as target_name, s.avatar_path as target_avatar
            FROM subject_relationships r JOIN subjects s ON r.subject_b_id = s.id 
            WHERE r.subject_a_id = ?
        `).bind(id).all()
    ]);

    return response({ 
        ...subject, 
        media: media.results, 
        dataPoints: dataPoints.results, 
        events: events.results, 
        relationships: relationships.results 
    });
}

async function handleUpdateSubject(req, db, id) {
    const p = await req.json();
    const allowed = ['full_name', 'dob', 'age', 'gender', 'occupation', 'nationality', 'education', 'religion', 'location', 'contact', 'habits', 'notes', 'status', 'last_sighted'];
    const updates = Object.keys(p).filter(k => allowed.includes(k));
    
    if (updates.length === 0) return response({ success: true });

    const setClause = updates.map((k, i) => `${k} = ?${i+1}`).join(', ');
    const values = updates.map(k => p[k]);
    values.push(isoTimestamp(), id);

    const query = `UPDATE subjects SET ${setClause}, updated_at = ?${values.length-1} WHERE id = ?${values.length}`;
    await db.prepare(query).bind(...values).run();
    return response({ success: true });
}

async function handleDeleteItem(req, db, table, id) {
    if(table === 'subjects') {
        // Soft delete/archive
        await db.prepare("UPDATE subjects SET is_archived = 1 WHERE id = ?").bind(id).run();
    } else {
        await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    }
    return response({ success: true });
}

// --- Frontend Application ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-950">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Deep Research OS</title>
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
             obsidian: '#020617',
             charcoal: '#0f172a',
             primary: '#6366f1', // Indigo
             accent: '#06b6d4', // Cyan
             alert: '#ef4444', // Red
          }
        }
      }
    }
  </script>

  <style>
    body { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
    
    .glass-panel { background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(148, 163, 184, 0.1); }
    .glass-input { background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(148, 163, 184, 0.1); color: white; }
    .glass-input:focus { border-color: #6366f1; outline: none; background: rgba(30, 41, 59, 0.8); }
    
    .fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
    .fade-enter-from, .fade-leave-to { opacity: 0; }
    .slide-up-enter-active { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    .slide-up-enter-from { transform: translateY(100%); }
    
    #network-graph { width: 100%; height: 100%; }
    .confidence-meter { height: 4px; background: #334155; border-radius: 2px; overflow: hidden; }
    .confidence-fill { height: 100%; transition: width 0.5s ease; }
    
    /* Mobile tweaks */
    @media (max-width: 768px) {
        .mobile-nav-pb { padding-bottom: 80px; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
    }
  </style>
</head>
<body class="h-full text-slate-200 antialiased overflow-hidden bg-obsidian selection:bg-indigo-500/30">
  <div id="app" class="h-full flex flex-col">

    <!-- Global Lightbox -->
    <transition name="fade">
        <div v-if="lightbox.active" class="fixed inset-0 z-[100] bg-black/98 flex flex-col items-center justify-center p-2" @click.self="lightbox.active = null">
            <div class="relative max-w-full max-h-[85vh]">
                <img :src="lightbox.url" class="max-h-[80vh] max-w-full rounded shadow-2xl object-contain mx-auto" />
            </div>
            <div class="mt-4 text-center max-w-md w-full px-4">
                <p class="text-white/90 font-mono text-sm">{{ lightbox.desc || 'No description' }}</p>
                <div class="flex gap-4 justify-center mt-4">
                     <a :href="lightbox.url" download class="text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase"><i class="fa-solid fa-download mr-1"></i> Save</a>
                     <button @click="lightbox.active = null" class="text-xs text-slate-400 hover:text-white font-bold uppercase"><i class="fa-solid fa-xmark mr-1"></i> Close</button>
                </div>
            </div>
        </div>
    </transition>

    <!-- Authentication View -->
    <div v-if="view === 'auth'" class="flex-1 flex flex-col items-center justify-center p-6 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-cover">
        <div class="w-full max-w-sm glass-panel p-8 rounded-3xl shadow-2xl relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                    <i class="fa-solid fa-layer-group text-3xl text-indigo-400"></i>
                </div>
                <h1 class="text-2xl font-black tracking-tight text-white">DEEP<span class="text-indigo-400">RESEARCH</span></h1>
                <p class="text-slate-400 text-xs font-mono mt-1">SECURE INTELLIGENCE SYSTEM</p>
            </div>
            
            <form @submit.prevent="handleAuth" class="space-y-4">
                <div v-if="setupMode" class="bg-indigo-500/20 text-indigo-200 p-3 rounded-xl text-xs flex items-start gap-2 border border-indigo-500/30">
                    <i class="fa-solid fa-circle-info mt-0.5"></i> <span>System Reset. Create new admin credentials.</span>
                </div>
                <div class="space-y-2">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Identity</label>
                    <input v-model="auth.email" type="email" placeholder="researcher@agency.com" class="glass-input w-full p-3 rounded-xl transition-all">
                </div>
                <div class="space-y-2">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Passcode</label>
                    <input v-model="auth.password" type="password" placeholder="••••••••" class="glass-input w-full p-3 rounded-xl transition-all">
                </div>
                <button type="submit" :disabled="loading" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100">
                    <span v-if="loading"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Decrypting...</span>
                    <span v-else>{{ setupMode ? 'Initialize System' : 'Access Terminal' }}</span>
                </button>
            </form>
        </div>
    </div>

    <!-- Main Application -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-obsidian">
        
        <!-- Desktop Sidebar -->
        <aside class="hidden md:flex flex-col w-64 border-r border-slate-800 bg-charcoal z-20">
            <div class="h-16 flex items-center px-6 border-b border-slate-800/50">
                <i class="fa-solid fa-fingerprint text-indigo-500 text-xl mr-3"></i>
                <span class="font-bold text-white tracking-tight">RESEARCH<span class="text-slate-500">.OS</span></span>
            </div>
            <nav class="flex-1 p-4 space-y-1">
                <template v-for="item in navItems">
                    <a @click="currentTab = item.id" 
                       :class="currentTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'"
                       class="flex items-center px-4 py-3 rounded-xl cursor-pointer transition-all group font-medium text-sm">
                        <i :class="item.icon" class="w-6 text-center mr-2 text-base transition-transform group-hover:scale-110"></i>
                        {{ item.label }}
                    </a>
                </template>
            </nav>
            <div class="p-4 border-t border-slate-800/50">
                <button @click="logout" class="flex items-center w-full px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-medium">
                    <i class="fa-solid fa-power-off w-6 mr-2"></i> Disconnect
                </button>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 relative flex flex-col h-full overflow-hidden mobile-nav-pb">
            
            <!-- Dashboard View -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                <div class="max-w-5xl mx-auto space-y-8">
                    <header>
                        <h2 class="text-2xl md:text-3xl font-black text-white">Command Center</h2>
                        <p class="text-slate-500 mt-1">System status and recent intelligence.</p>
                    </header>

                    <!-- Stats Grid -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="glass-panel p-4 rounded-2xl border-l-4 border-indigo-500">
                            <div class="text-slate-400 text-xs font-bold uppercase mb-1">Active Subjects</div>
                            <div class="text-2xl font-mono text-white">{{ dashboard.stats.active_subjects || 0 }}</div>
                        </div>
                        <div class="glass-panel p-4 rounded-2xl border-l-4 border-emerald-500">
                            <div class="text-slate-400 text-xs font-bold uppercase mb-1">Intel Points</div>
                            <div class="text-2xl font-mono text-white">{{ dashboard.stats.total_intel || 0 }}</div>
                        </div>
                        <div class="glass-panel p-4 rounded-2xl border-l-4 border-cyan-500">
                            <div class="text-slate-400 text-xs font-bold uppercase mb-1">Media Files</div>
                            <div class="text-2xl font-mono text-white">{{ dashboard.stats.total_media || 0 }}</div>
                        </div>
                         <div class="glass-panel p-4 rounded-2xl border-l-4 border-amber-500 cursor-pointer hover:bg-slate-800/50 transition-colors" @click="currentTab = 'subjects'">
                            <div class="text-slate-400 text-xs font-bold uppercase mb-1">Quick Action</div>
                            <div class="text-sm font-bold text-amber-400 flex items-center mt-1"><i class="fa-solid fa-plus mr-2"></i> Add Subject</div>
                        </div>
                    </div>

                    <!-- Recent Feed -->
                    <div class="glass-panel rounded-2xl overflow-hidden">
                        <div class="p-4 border-b border-slate-800/50 flex justify-between items-center">
                            <h3 class="font-bold text-white"><i class="fa-solid fa-satellite-dish mr-2 text-indigo-500"></i>Intel Feed</h3>
                            <button @click="fetchDashboard" class="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full transition-colors"><i class="fa-solid fa-rotate-right"></i></button>
                        </div>
                        <div class="divide-y divide-slate-800/50">
                            <div v-if="dashboard.feed.length === 0" class="p-8 text-center text-slate-500 text-sm">No recent activity recorded.</div>
                            <div v-for="(item, idx) in dashboard.feed" :key="idx" class="p-4 hover:bg-white/5 transition-colors flex gap-4 items-start">
                                <div class="mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0" 
                                    :class="{'bg-indigo-500/20 text-indigo-400': item.type === 'subject', 'bg-emerald-500/20 text-emerald-400': item.type === 'media', 'bg-amber-500/20 text-amber-400': item.type === 'event'}">
                                    <i class="fa-solid text-xs" :class="{'fa-user': item.type === 'subject', 'fa-image': item.type === 'media', 'fa-calendar': item.type === 'event'}"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between items-baseline">
                                        <p class="text-sm font-bold text-white truncate">{{ item.title || 'Unknown' }}</p>
                                        <span class="text-[10px] font-mono text-slate-500 ml-2">{{ new Date(item.date).toLocaleDateString() }}</span>
                                    </div>
                                    <p class="text-xs text-slate-400 mt-0.5 line-clamp-2">{{ item.desc }}</p>
                                    <button v-if="item.type !== 'event'" @click="viewSubject(item.ref_id)" class="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold mt-2">VIEW DOSSIER <i class="fa-solid fa-arrow-right ml-1"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Subject Directory -->
            <div v-if="currentTab === 'subjects'" class="flex-1 flex flex-col overflow-hidden">
                <div class="p-4 md:p-6 border-b border-slate-800 bg-charcoal/50 backdrop-blur-md sticky top-0 z-10">
                    <div class="flex flex-col md:flex-row gap-4 justify-between md:items-center max-w-6xl mx-auto w-full">
                        <h2 class="text-xl font-bold text-white">Subject Database</h2>
                        <div class="flex gap-2 w-full md:w-auto">
                            <div class="relative flex-1 md:w-64">
                                <i class="fa-solid fa-search absolute left-3 top-3 text-slate-500 text-sm"></i>
                                <input v-model="searchQuery" placeholder="Search code, name or tag..." class="glass-input w-full pl-9 pr-4 py-2.5 rounded-xl text-sm">
                            </div>
                            <button @click="openModal('add-subject')" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 whitespace-nowrap">
                                <i class="fa-solid fa-plus mr-1"></i> New
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto p-4 md:p-6">
                    <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" 
                             class="glass-panel rounded-2xl overflow-hidden hover:bg-slate-800/50 transition-all cursor-pointer group relative">
                             <div class="absolute top-3 right-3 z-10">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border" 
                                      :class="s.status === 'Active' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 border-slate-600 text-slate-400'">
                                      {{ s.status }}
                                </span>
                             </div>
                             <div class="flex items-center p-4 gap-4">
                                <div class="w-16 h-16 rounded-xl bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-700 relative">
                                    <img v-if="s.avatar_path" :src="'/api/media/' + s.avatar_path" class="w-full h-full object-cover">
                                    <div v-else class="w-full h-full flex items-center justify-center text-slate-600 text-2xl font-bold">{{ s.full_name.charAt(0) }}</div>
                                </div>
                                <div class="min-w-0">
                                    <h3 class="font-bold text-white truncate text-lg">{{ s.full_name }}</h3>
                                    <p class="text-xs text-slate-400 truncate font-mono">{{ s.occupation || 'Unidentified' }}</p>
                                    <p class="text-[10px] text-slate-500 mt-1"><i class="fa-solid fa-map-pin mr-1"></i>{{ s.location || 'Unknown' }}</p>
                                </div>
                             </div>
                             <div class="px-4 pb-4 mt-2 grid grid-cols-3 gap-2 text-center">
                                <div class="bg-slate-800/50 rounded-lg py-1.5">
                                    <div class="text-[10px] text-slate-500 font-bold uppercase">Age</div>
                                    <div class="text-xs font-mono text-indigo-300">{{ s.age || '?' }}</div>
                                </div>
                                <div class="bg-slate-800/50 rounded-lg py-1.5">
                                    <div class="text-[10px] text-slate-500 font-bold uppercase">Sex</div>
                                    <div class="text-xs font-mono text-indigo-300">{{ s.gender || '?' }}</div>
                                </div>
                                <div class="bg-slate-800/50 rounded-lg py-1.5">
                                    <div class="text-[10px] text-slate-500 font-bold uppercase">Rel</div>
                                    <div class="text-xs font-mono text-indigo-300">{{ s.religion || '?' }}</div>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Detail View -->
            <div v-if="currentTab === 'detail' && selectedSubject" class="flex-1 flex flex-col h-full bg-obsidian">
                <!-- Detail Header -->
                <header class="bg-charcoal/80 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
                    <div class="flex items-center gap-3">
                        <button @click="currentTab = 'subjects'" class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors">
                            <i class="fa-solid fa-arrow-left text-slate-400"></i>
                        </button>
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-600 relative group cursor-pointer" @click="triggerAvatar">
                                <img v-if="selectedSubject.avatar_path" :src="'/api/media/' + selectedSubject.avatar_path" class="w-full h-full object-cover">
                                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <i class="fa-solid fa-camera text-xs"></i>
                                </div>
                            </div>
                            <div>
                                <h2 class="font-bold text-white text-sm leading-tight">{{ selectedSubject.full_name }}</h2>
                                <p class="text-[10px] font-mono text-slate-400">ID-{{ String(selectedSubject.id).padStart(4,'0') }} • <span class="text-emerald-400">{{ selectedSubject.status }}</span></p>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="openModal('quick-note')" class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:scale-105 transition-transform"><i class="fa-solid fa-pen-nib text-xs"></i></button>
                        <button @click="exportData" class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors"><i class="fa-solid fa-download text-xs"></i></button>
                    </div>
                </header>

                <!-- Detail Tabs -->
                <div class="flex bg-charcoal border-b border-slate-800 overflow-x-auto hide-scrollbar">
                    <button v-for="t in ['overview', 'intel', 'timeline', 'media', 'relations']" 
                            @click="subTab = t"
                            :class="subTab === t ? 'text-indigo-400 border-indigo-500 bg-slate-800/30' : 'text-slate-500 border-transparent hover:text-slate-300'"
                            class="px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap flex-shrink-0">
                        {{ t }}
                    </button>
                </div>

                <!-- Detail Content -->
                <div class="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                    <div class="max-w-4xl mx-auto space-y-6">
                        
                        <!-- Overview Tab -->
                        <div v-if="subTab === 'overview'" class="space-y-6">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <!-- Core Card -->
                                <div class="glass-panel p-5 rounded-2xl relative">
                                    <button @click="openModal('edit-profile')" class="absolute top-4 right-4 text-slate-500 hover:text-indigo-400"><i class="fa-solid fa-pen-to-square"></i></button>
                                    <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Core Identity</h3>
                                    <div class="space-y-3">
                                        <div class="flex justify-between border-b border-slate-800 pb-2">
                                            <span class="text-slate-400 text-sm">Full Name</span>
                                            <span class="text-white font-medium text-sm">{{ selectedSubject.full_name }}</span>
                                        </div>
                                        <div class="flex justify-between border-b border-slate-800 pb-2">
                                            <span class="text-slate-400 text-sm">Occupation</span>
                                            <span class="text-white font-medium text-sm">{{ selectedSubject.occupation || '—' }}</span>
                                        </div>
                                        <div class="flex justify-between border-b border-slate-800 pb-2">
                                            <span class="text-slate-400 text-sm">Location</span>
                                            <span class="text-white font-medium text-sm">{{ selectedSubject.location || '—' }}</span>
                                        </div>
                                        <div class="flex justify-between border-b border-slate-800 pb-2">
                                            <span class="text-slate-400 text-sm">DOB / Age</span>
                                            <span class="text-white font-medium text-sm">{{ selectedSubject.dob || '—' }} <span v-if="selectedSubject.age">({{selectedSubject.age}})</span></span>
                                        </div>
                                         <div class="flex justify-between border-b border-slate-800 pb-2">
                                            <span class="text-slate-400 text-sm">Last Sighted</span>
                                            <span class="text-amber-400 font-medium text-sm font-mono">{{ selectedSubject.last_sighted || 'Unknown' }}</span>
                                        </div>
                                    </div>
                                </div>
                                <!-- Bio Card -->
                                <div class="glass-panel p-5 rounded-2xl">
                                    <div class="flex justify-between items-center mb-4">
                                        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Background</h3>
                                        <button @click="openModal('edit-bio')" class="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                                    </div>
                                    <div class="space-y-4">
                                        <div>
                                            <div class="text-[10px] text-slate-600 uppercase font-bold mb-1">Education</div>
                                            <p class="text-sm text-slate-300">{{ selectedSubject.education || 'No record' }}</p>
                                        </div>
                                        <div>
                                            <div class="text-[10px] text-slate-600 uppercase font-bold mb-1">Habits & Routine</div>
                                            <p class="text-sm text-slate-300 whitespace-pre-wrap">{{ selectedSubject.habits || 'No observations recorded.' }}</p>
                                        </div>
                                        <div>
                                            <div class="text-[10px] text-slate-600 uppercase font-bold mb-1">General Notes</div>
                                            <p class="text-sm text-slate-300 whitespace-pre-wrap">{{ selectedSubject.notes || '—' }}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="flex justify-center">
                                <button @click="deleteItem('subjects', selectedSubject.id)" class="text-red-500 text-xs font-bold hover:text-red-400 border border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-500/10 transition-colors">
                                    <i class="fa-solid fa-triangle-exclamation mr-2"></i> ARCHIVE SUBJECT
                                </button>
                            </div>
                        </div>

                        <!-- Intel Tab (Deep Research Tree) -->
                        <div v-if="subTab === 'intel'" class="space-y-4">
                            <div class="flex justify-between items-center">
                                <h3 class="font-bold text-white">Deep Research Dossier</h3>
                                <button @click="openModal('add-intel', null)" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow shadow-indigo-500/20">
                                    <i class="fa-solid fa-plus mr-1"></i> Add Point
                                </button>
                            </div>

                            <div v-if="dataTree.length === 0" class="glass-panel p-8 text-center rounded-2xl">
                                <i class="fa-solid fa-folder-open text-4xl text-slate-700 mb-2"></i>
                                <p class="text-slate-500 text-sm">No intelligence data collected yet.</p>
                            </div>

                            <div v-for="node in dataTree" :key="node.id" class="glass-panel rounded-xl overflow-hidden border border-slate-700/50">
                                <div class="p-3 flex gap-3 cursor-pointer hover:bg-white/5 transition-colors select-none" @click="toggleNode(node.id)">
                                    <div class="mt-1">
                                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-500 transition-transform duration-200" :class="{'rotate-90': expandedState[node.id] !== false}"></i>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 mb-1">
                                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 uppercase border border-slate-700">{{ node.category }}</span>
                                            <h4 class="font-bold text-slate-200 text-sm truncate">{{ node.label }}</h4>
                                            <div class="flex-1"></div>
                                            <div class="w-16 confidence-meter bg-slate-800" title="Confidence Score">
                                                <div class="confidence-fill" :class="getConfidenceColor(node.confidence)" :style="{width: (node.confidence || 100) + '%'}"></div>
                                            </div>
                                        </div>
                                        <p class="text-sm text-slate-300 whitespace-pre-wrap">{{ node.value }}</p>
                                        <div v-if="node.analysis" class="mt-2 p-2 bg-indigo-900/10 border-l-2 border-indigo-500 text-xs text-indigo-300">
                                            <i class="fa-solid fa-magnifying-glass mr-1"></i> {{ node.analysis }}
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-2 opacity-60 hover:opacity-100">
                                        <button @click.stop="openModal('add-intel', node.id)" class="w-6 h-6 rounded bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white flex items-center justify-center transition-colors"><i class="fa-solid fa-plus text-xs"></i></button>
                                        <button @click.stop="deleteItem('subject_data_points', node.id)" class="w-6 h-6 rounded bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white flex items-center justify-center transition-colors"><i class="fa-solid fa-trash text-[10px]"></i></button>
                                    </div>
                                </div>
                                <!-- Nested Children -->
                                <div v-if="node.children && node.children.length && expandedState[node.id] !== false" class="bg-black/20 border-t border-slate-800 p-2 pl-4 space-y-2">
                                    <div v-for="child in node.children" :key="child.id" class="relative pl-4">
                                         <div class="absolute left-0 top-0 bottom-0 w-px bg-slate-700"></div>
                                         <div class="absolute left-0 top-3 w-3 h-px bg-slate-700"></div>
                                         <div class="glass-panel p-2 rounded-lg bg-slate-900/50 flex justify-between group">
                                            <div class="flex-1">
                                                <div class="flex items-center gap-2">
                                                    <span class="text-xs font-bold text-indigo-400">{{ child.label }}</span>
                                                    <span class="text-[10px] text-slate-600 border border-slate-700 px-1 rounded">{{child.confidence}}% Conf.</span>
                                                </div>
                                                <p class="text-xs text-slate-300 mt-1">{{ child.value }}</p>
                                                <p v-if="child.source" class="text-[10px] text-slate-500 mt-1 italic">Source: {{ child.source }}</p>
                                            </div>
                                            <button @click.stop="deleteItem('subject_data_points', child.id)" class="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity px-2"><i class="fa-solid fa-trash text-xs"></i></button>
                                         </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Media Gallery -->
                        <div v-if="subTab === 'media'" class="space-y-4">
                            <div class="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:bg-slate-800/30 transition-colors cursor-pointer group" @click="triggerMediaUpload">
                                <i class="fa-solid fa-cloud-arrow-up text-2xl text-slate-500 group-hover:text-indigo-400 mb-2"></i>
                                <p class="text-sm text-slate-400">Tap to upload evidence</p>
                            </div>
                             <div class="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
                                <div v-for="m in selectedSubject.media" :key="m.id" class="break-inside-avoid relative group rounded-lg overflow-hidden cursor-zoom-in" @click="lightbox = {active: true, url: '/api/media/'+m.object_key, desc: m.description}">
                                    <img :src="'/api/media/' + m.object_key" class="w-full bg-slate-800" loading="lazy">
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                        <p class="text-[10px] text-white truncate">{{ m.description || 'No Description' }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                         <!-- Timeline -->
                        <div v-if="subTab === 'timeline'" class="space-y-4">
                            <button @click="openModal('add-event')" class="w-full py-2 border border-slate-700 border-dashed rounded-lg text-xs text-slate-400 hover:text-amber-400 hover:border-amber-400/50 transition-colors">
                                + Log New Event
                            </button>
                            <div class="relative border-l border-slate-800 ml-3 space-y-6 py-2">
                                <div v-for="e in selectedSubject.events" :key="e.id" class="relative pl-6">
                                    <div class="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-obsidian border-2 border-amber-500"></div>
                                    <div class="group">
                                        <div class="flex items-baseline gap-2 mb-1">
                                            <span class="text-xs font-mono font-bold text-amber-500">{{ e.event_date }}</span>
                                            <h4 class="font-bold text-sm text-slate-200">{{ e.title }}</h4>
                                            <button @click="deleteItem('subject_events', e.id)" class="ml-auto text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash text-xs"></i></button>
                                        </div>
                                        <p class="text-xs text-slate-400">{{ e.description }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Relations -->
                        <div v-if="subTab === 'relations'" class="space-y-4">
                            <button @click="openModal('add-rel')" class="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 rounded-lg text-xs font-bold transition-colors">
                                <i class="fa-solid fa-link mr-1"></i> Connect Subject
                            </button>
                            <div class="grid grid-cols-1 gap-3">
                                <div v-for="r in selectedSubject.relationships" :key="r.id" class="glass-panel p-3 rounded-xl flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-slate-700 overflow-hidden">
                                            <img v-if="r.target_avatar" :src="'/api/media/'+r.target_avatar" class="w-full h-full object-cover">
                                        </div>
                                        <div>
                                            <div class="text-sm font-bold text-white">{{ r.target_name }}</div>
                                            <div class="text-xs text-indigo-400">{{ r.relationship_type }}</div>
                                        </div>
                                    </div>
                                    <button @click="deleteItem('subject_relationships', r.id)" class="text-slate-600 hover:text-red-500"><i class="fa-solid fa-link-slash"></i></button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <!-- Graph View -->
             <div v-show="currentTab === 'graph'" class="flex-1 relative bg-obsidian overflow-hidden">
                <div id="network-graph" class="opacity-80"></div>
                <div class="absolute top-4 left-4 right-4 md:w-64 glass-panel p-3 rounded-xl flex flex-col gap-2">
                    <input v-model="graphSearch" placeholder="Locate node..." class="bg-black/20 text-white text-xs p-2 rounded border border-slate-700 focus:border-indigo-500 outline-none">
                    <div class="flex gap-2">
                        <button @click="fitGraph" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-[10px] py-1.5 rounded">Reset View</button>
                        <button @click="refreshGraph" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] py-1.5 rounded">Refresh Data</button>
                    </div>
                </div>
             </div>

        </main>

        <!-- Mobile Navigation Bar -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-charcoal/90 backdrop-blur-xl border-t border-slate-800 z-40 pb-safe">
            <div class="flex justify-around items-center h-16">
                <a v-for="item in navItems" :key="item.id" @click="currentTab = item.id"
                   :class="currentTab === item.id ? 'text-indigo-400' : 'text-slate-500'" 
                   class="flex flex-col items-center justify-center w-full h-full space-y-1 active:scale-95 transition-transform">
                    <i :class="item.icon" class="text-lg"></i>
                    <span class="text-[10px] font-medium">{{ item.label }}</span>
                </a>
            </div>
        </nav>
    </div>

    <!-- Universal Modal System -->
    <transition name="fade">
        <div v-if="modal.active" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" @click.self="closeModal">
            <div class="bg-slate-900 w-full max-w-lg md:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-800 flex flex-col max-h-[90vh] animate-slide-up">
                <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 sticky top-0 z-10">
                    <h3 class="font-bold text-white">{{ modalTitle }}</h3>
                    <button @click="closeModal" class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div class="p-6 overflow-y-auto custom-scrollbar space-y-5">
                    
                    <!-- Form: New Subject -->
                    <form v-if="modal.active === 'add-subject'" @submit.prevent="createSubject" class="space-y-4">
                        <div class="space-y-1">
                            <label class="text-[10px] font-bold text-slate-500 uppercase">Target Name</label>
                            <input v-model="forms.subject.fullName" required class="glass-input w-full p-3 rounded-lg" placeholder="Enter full name">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-[10px] font-bold text-slate-500 uppercase">Occupation</label>
                                <input v-model="forms.subject.occupation" class="glass-input w-full p-3 rounded-lg" placeholder="Role/Job">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[10px] font-bold text-slate-500 uppercase">Location</label>
                                <input v-model="forms.subject.location" class="glass-input w-full p-3 rounded-lg" placeholder="City/Area">
                            </div>
                        </div>
                        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-500/20">Initialize Dossier</button>
                    </form>

                    <!-- Form: Edit Core Profile -->
                    <form v-if="modal.active === 'edit-profile'" @submit.prevent="updateSubjectCore" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <input v-model="selectedSubject.full_name" class="glass-input p-3 rounded-lg col-span-2" placeholder="Full Name">
                            <input v-model="selectedSubject.occupation" class="glass-input p-3 rounded-lg" placeholder="Occupation">
                            <input v-model="selectedSubject.location" class="glass-input p-3 rounded-lg" placeholder="Location">
                            <input v-model="selectedSubject.dob" class="glass-input p-3 rounded-lg" placeholder="Date of Birth">
                            <input v-model="selectedSubject.age" type="number" class="glass-input p-3 rounded-lg" placeholder="Age">
                            <select v-model="selectedSubject.status" class="glass-input p-3 rounded-lg bg-slate-800">
                                <option>Active</option>
                                <option>Dormant</option>
                                <option>Missing</option>
                                <option>Deceased</option>
                            </select>
                             <input v-model="selectedSubject.last_sighted" class="glass-input p-3 rounded-lg" placeholder="Last Sighted (Date/Loc)">
                        </div>
                        <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Save Changes</button>
                    </form>

                     <!-- Form: Add Intel -->
                     <form v-if="modal.active === 'add-intel' || modal.active === 'quick-note'" @submit.prevent="submitIntel" class="space-y-4">
                        <div v-if="modal.parentId" class="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs text-indigo-300">
                            <i class="fa-solid fa-level-up-alt rotate-90 mr-2"></i> Appending to thread
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-[10px] font-bold text-slate-500 uppercase">Category</label>
                                <select v-model="forms.intel.category" class="glass-input w-full p-2.5 rounded-lg bg-slate-800 mt-1">
                                    <option>General</option>
                                    <option>Biometrics</option>
                                    <option>Psychology</option>
                                    <option>Social</option>
                                    <option>Digital</option>
                                    <option>Financial</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-slate-500 uppercase">Topic</label>
                                <input v-model="forms.intel.label" placeholder="e.g. Scar, Phobia" class="glass-input w-full p-2.5 rounded-lg mt-1" required>
                            </div>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-500 uppercase">Observation / Fact</label>
                            <textarea v-model="forms.intel.value" rows="3" class="glass-input w-full p-3 rounded-lg mt-1" placeholder="Detailed observation..." required></textarea>
                        </div>
                        <div v-if="modal.active !== 'quick-note'">
                            <label class="text-[10px] font-bold text-slate-500 uppercase">Analysis (Optional)</label>
                            <input v-model="forms.intel.analysis" placeholder="Researcher interpretation..." class="glass-input w-full p-2.5 rounded-lg mt-1">
                        </div>
                        <div v-if="modal.active !== 'quick-note'" class="grid grid-cols-2 gap-4">
                             <div>
                                <label class="text-[10px] font-bold text-slate-500 uppercase">Source</label>
                                <input v-model="forms.intel.source" placeholder="e.g. Surveillance, Interview" class="glass-input w-full p-2.5 rounded-lg mt-1">
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-slate-500 uppercase flex justify-between">
                                    <span>Confidence</span>
                                    <span class="text-indigo-400">{{ forms.intel.confidence }}%</span>
                                </label>
                                <input type="range" v-model="forms.intel.confidence" min="0" max="100" class="w-full mt-2 accent-indigo-500">
                            </div>
                        </div>
                        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20">Commit Intelligence</button>
                     </form>

                     <!-- Other forms (Event, Rel) similar structure... -->
                     <form v-if="modal.active === 'add-event'" @submit.prevent="submitEvent" class="space-y-4">
                         <input type="date" v-model="forms.event.date" class="glass-input w-full p-3 rounded-lg" required>
                         <input v-model="forms.event.title" placeholder="Event Title" class="glass-input w-full p-3 rounded-lg" required>
                         <textarea v-model="forms.event.desc" placeholder="Details..." class="glass-input w-full p-3 rounded-lg h-24"></textarea>
                         <button type="submit" class="w-full bg-amber-600 text-white py-3 rounded-xl font-bold">Log Timeline Event</button>
                     </form>

                     <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                        <select v-model="forms.rel.subjectB" class="glass-input w-full p-3 rounded-lg bg-slate-800">
                            <option v-for="s in subjects" :value="s.id" :disabled="s.id === selectedSubject.id">{{ s.full_name }}</option>
                        </select>
                        <input v-model="forms.rel.type" placeholder="Relationship Type (e.g. Spouse, Rival)" class="glass-input w-full p-3 rounded-lg">
                        <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Link Subjects</button>
                     </form>
                </div>
            </div>
        </div>
    </transition>

    <!-- Hidden File Inputs -->
    <input type="file" ref="mediaInput" @change="handleMediaUpload" class="hidden" accept="image/*">
    <input type="file" ref="avatarInput" @change="handleAvatarUpload" class="hidden" accept="image/*">

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch } = Vue;

    createApp({
      setup() {
        // State
        const view = ref('auth');
        const setupMode = ref(false);
        const currentTab = ref('dashboard');
        const subTab = ref('overview');
        const loading = ref(false);
        const searchQuery = ref('');
        const graphSearch = ref('');
        
        const auth = reactive({ email: '', password: '' });
        const dashboard = reactive({ stats: {}, feed: [] });
        const subjects = ref([]);
        const selectedSubject = ref(null);
        
        const lightbox = reactive({ active: null, url: '', desc: '' });
        const modal = reactive({ active: null, parentId: null });
        const expandedState = reactive({});
        
        // Forms
        const forms = reactive({
            subject: { fullName: '', occupation: '', location: '' },
            intel: { category: 'General', label: '', value: '', analysis: '', confidence: 100, source: '' },
            event: { date: new Date().toISOString().split('T')[0], title: '', desc: '' },
            rel: { subjectB: '', type: '' }
        });

        // Navigation
        const navItems = [
            { id: 'dashboard', label: 'Home', icon: 'fa-solid fa-chart-pie' },
            { id: 'subjects', label: 'Subjects', icon: 'fa-solid fa-users' },
            { id: 'graph', label: 'Graph', icon: 'fa-solid fa-share-nodes', action: 'loadGraph' }
        ];

        // API Helper
        const api = async (ep, opts = {}) => {
            try {
                const res = await fetch('/api' + ep, opts);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Operation failed');
                return data;
            } catch (e) {
                alert(e.message); // Simple error feedback
                throw e;
            }
        };

        // Computeds
        const filteredSubjects = computed(() => {
            if(!searchQuery.value) return subjects.value;
            const q = searchQuery.value.toLowerCase();
            return subjects.value.filter(s => 
                s.full_name.toLowerCase().includes(q) || 
                (s.occupation && s.occupation.toLowerCase().includes(q)) ||
                (s.status && s.status.toLowerCase().includes(q))
            );
        });

        const dataTree = computed(() => {
            if (!selectedSubject.value?.dataPoints) return [];
            const raw = selectedSubject.value.dataPoints;
            const map = {};
            const roots = [];
            raw.forEach(item => map[item.id] = { ...item, children: [] });
            raw.forEach(item => {
                if (item.parent_id && map[item.parent_id]) map[item.parent_id].children.push(map[item.id]);
                else roots.push(map[item.id]);
            });
            return roots;
        });

        const modalTitle = computed(() => {
            const map = { 
                'add-subject': 'New Subject Profile', 
                'edit-profile': 'Edit Core Data',
                'add-intel': 'Add Intelligence',
                'quick-note': 'Quick Field Note',
                'add-event': 'Log Timeline Event',
                'add-rel': 'Connect Subjects'
            };
            return map[modal.active] || 'System Dialog';
        });

        // Methods
        const handleAuth = async () => {
            loading.value = true;
            try {
                const ep = setupMode.value ? '/setup-admin' : '/login';
                const res = await api(ep, { method: 'POST', body: JSON.stringify(auth) });
                localStorage.setItem('admin_id', res.id);
                view.value = 'app';
                initApp();
            } catch(e) {} finally { loading.value = false; }
        };

        const initApp = async () => {
            await Promise.all([fetchDashboard(), fetchSubjects()]);
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
            subTab.value = 'overview';
        };

        const createSubject = async () => {
            await api('/subjects', { method: 'POST', body: JSON.stringify({ ...forms.subject, adminId: localStorage.getItem('admin_id') }) });
            closeModal();
            fetchSubjects();
            fetchDashboard();
        };

        const updateSubjectCore = async () => {
             await api('/subjects/' + selectedSubject.value.id, { method: 'PATCH', body: JSON.stringify(selectedSubject.value) });
             closeModal();
        };

        // Intel Ops
        const submitIntel = async () => {
            const payload = { ...forms.intel, subjectId: selectedSubject.value.id, parentId: modal.parentId };
            await api('/data-point', { method: 'POST', body: JSON.stringify(payload) });
            closeModal();
            viewSubject(selectedSubject.value.id);
            fetchDashboard(); // Update feed
        };

        const toggleNode = (id) => {
            if (expandedState[id] === undefined) expandedState[id] = false;
            else expandedState[id] = !expandedState[id];
        };

        const getConfidenceColor = (val) => {
            if(val >= 80) return 'bg-emerald-500';
            if(val >= 50) return 'bg-amber-500';
            return 'bg-red-500';
        };

        // Media Ops
        const triggerMediaUpload = () => document.querySelector('input[type="file"]').click();
        const triggerAvatar = () => document.querySelectorAll('input[type="file"]')[1].click();

        const compressAndUpload = async (file, endpoint) => {
            // Simple compression logic
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = async () => {
                    const canvas = document.createElement('canvas');
                    const MAX = 1200;
                    let w = img.width, h = img.height;
                    if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
                    else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    
                    await api(endpoint, {
                        method: 'POST',
                        body: JSON.stringify({
                            subjectId: selectedSubject.value.id,
                            data: b64,
                            filename: file.name,
                            contentType: 'image/jpeg',
                            description: prompt("Evidence description (optional):") || ''
                        })
                    });
                    viewSubject(selectedSubject.value.id);
                    fetchDashboard();
                };
            };
        };

        const handleMediaUpload = (e) => {
             if(e.target.files[0]) compressAndUpload(e.target.files[0], '/upload-photo');
        };
        const handleAvatarUpload = (e) => {
             if(e.target.files[0]) compressAndUpload(e.target.files[0], '/upload-avatar');
        };

        // Events & Rels
        const submitEvent = async () => {
            await api('/event', { method: 'POST', body: JSON.stringify({ ...forms.event, subjectId: selectedSubject.value.id }) });
            closeModal(); viewSubject(selectedSubject.value.id);
        };
        const submitRel = async () => {
            await api('/relationship', { method: 'POST', body: JSON.stringify({ ...forms.rel, subjectA: selectedSubject.value.id }) });
            closeModal(); viewSubject(selectedSubject.value.id);
        };

        // Graph
        let network = null;
        const loadGraph = async () => {
            const data = await api('/graph?adminId=' + localStorage.getItem('admin_id'));
            const container = document.getElementById('network-graph');
            if(!container) return;
            
            const nodes = data.nodes.map(n => ({
                id: n.id,
                label: n.full_name,
                shape: 'circularImage',
                image: n.avatar_path ? '/api/media/' + n.avatar_path : 'https://ui-avatars.com/api/?name='+n.full_name+'&background=random',
                size: 30, borderWidth: 3, 
                color: { border: n.status === 'Active' ? '#10b981' : '#64748b', background: '#1e293b' }
            }));
            
            const edges = data.edges.map(e => ({
                from: e.from_id, to: e.to_id, label: e.label, arrows: 'to',
                color: { color: '#475569' }, font: { size: 10, color: '#94a3b8', strokeWidth: 0 }
            }));
            
            network = new vis.Network(container, { nodes, edges }, {
                nodes: { font: { color: '#e2e8f0' } },
                physics: { stabilization: true, barnesHut: { gravitationalConstant: -4000 } },
                interaction: { hover: true }
            });
            network.on('click', (p) => { if(p.nodes.length) viewSubject(p.nodes[0]); });
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

        // Utils
        const openModal = (type, parentId = null) => {
            modal.active = type;
            modal.parentId = parentId;
            // Reset form based on type...
            if(type === 'quick-note') {
                forms.intel.category = 'General';
                forms.intel.label = 'Field Note ' + new Date().toLocaleTimeString();
                forms.intel.confidence = 100;
            } else if (type === 'add-intel') {
                forms.intel = { category: 'General', label: '', value: '', analysis: '', confidence: 100, source: '' };
            }
        };
        const closeModal = () => modal.active = null;
        
        const deleteItem = async (table, id) => {
            if(confirm("Permanently delete this intelligence?")) {
                await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) });
                if(table === 'subjects') { currentTab.value = 'subjects'; fetchSubjects(); }
                else viewSubject(selectedSubject.value.id);
            }
        };

        const exportData = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedSubject.value, null, 2));
            const node = document.createElement('a');
            node.setAttribute("href", dataStr);
            node.setAttribute("download", `dossier_${selectedSubject.value.full_name.replace(/\s/g,'_')}.json`);
            node.click();
        };

        onMounted(async () => {
             const status = await api('/status');
             if(!status.adminExists) setupMode.value = true;
             else if(localStorage.getItem('admin_id')) {
                 view.value = 'app';
                 initApp();
             }
        });

        return {
            view, setupMode, auth, loading, dashboard, subjects, currentTab, subTab, navItems,
            searchQuery, filteredSubjects, selectedSubject, dataTree, lightbox, modal, modalTitle, forms,
            expandedState, graphSearch,
            handleAuth, logout: () => { localStorage.clear(); location.reload(); },
            viewSubject, createSubject, updateSubjectCore, submitIntel, submitEvent, submitRel,
            handleMediaUpload, handleAvatarUpload, triggerMediaUpload, triggerAvatar,
            openModal, closeModal, toggleNode, getConfidenceColor, deleteItem, exportData,
            fitGraph, refreshGraph
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// --- Routes & Handlers ---

async function handleLogin(req, db) {
    const { email, password } = await req.json();
    const admin = await db.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
    if (!admin) return errorResponse('Invalid credentials', 401);
    
    const hashed = await hashPassword(password);
    if (hashed !== admin.password_hash) return errorResponse('Invalid credentials', 401);
    
    return response({ id: admin.id, email: admin.email });
}

async function handleSetup(req, db) {
    const { email, password } = await req.json();
    const count = await db.prepare('SELECT COUNT(*) as c FROM admins').first();
    if (count.c > 0) return errorResponse('Admin already exists', 403);
    
    const hash = await hashPassword(password);
    const res = await db.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)').bind(email, hash, isoTimestamp()).run();
    return response({ id: res.meta.last_row_id });
}

async function handleUploadPhoto(req, db, bucket, isAvatar = false) {
    const { subjectId, data, filename, contentType, description } = await req.json();
    const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(filename)}`;
    const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    await bucket.put(key, binary, { httpMetadata: { contentType } });
    
    if (isAvatar) {
        await db.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
    } else {
        await db.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(subjectId, key, contentType, description, isoTimestamp()).run();
    }
    return response({ success: true, key });
}

// --- Main Worker Entrypoint ---

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
        if (req.method === 'GET' && path === '/') return serveHtml();
        if (path.startsWith('/api/')) await ensureSchema(env.DB);
        
        // Auth & Setup
        if (path === '/api/status') {
            const c = await env.DB.prepare('SELECT COUNT(*) as c FROM admins').first();
            return response({ adminExists: c.c > 0 });
        }
        if (path === '/api/setup-admin') return handleSetup(req, env.DB);
        if (path === '/api/login') return handleLogin(req, env.DB);
        if (path === '/api/dashboard') return handleGetDashboard(env.DB, url.searchParams.get('adminId'));
        
        // Subject Operations
        if (path === '/api/subjects') {
            if (req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare('INSERT INTO subjects (admin_id, full_name, occupation, location, created_at) VALUES (?,?,?,?,?)')
                    .bind(p.adminId, p.fullName, p.occupation, p.location, isoTimestamp()).run();
                return response({ success: true });
            }
            const adminId = url.searchParams.get('adminId');
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(adminId).all();
            return response(res.results);
        }

        // Single Subject Get/Update
        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
             const id = idMatch[1];
             if (req.method === 'PATCH') return handleUpdateSubject(req, env.DB, id);
             return handleGetSubjectFull(env.DB, id);
        }

        // Sub-Resources
        if (path === '/api/data-point') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_data_points (subject_id, parent_id, category, label, value, analysis, confidence, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
                .bind(p.subjectId, p.parentId || null, p.category, p.label, p.value, p.analysis || '', p.confidence || 100, p.source || '', isoTimestamp()).run();
            return response({ success: true });
        }

        if (path === '/api/event') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_events (subject_id, title, description, event_date, created_at) VALUES (?,?,?,?,?)')
                .bind(p.subjectId, p.title, p.description || '', p.date || isoTimestamp(), isoTimestamp()).run();
            return response({ success: true });
        }

        if (path === '/api/relationship') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, created_at) VALUES (?,?,?,?)')
                .bind(p.subjectA, p.subjectB, p.type, isoTimestamp()).run();
            return response({ success: true });
        }

        // Delete Handler
        if (path === '/api/delete') {
            const { table, id } = await req.json();
            if (!['subjects', 'subject_data_points', 'subject_events', 'subject_relationships'].includes(table)) return errorResponse('Invalid table', 400);
            return handleDeleteItem(req, env.DB, table, id);
        }

        // Media
        if (path === '/api/upload-photo') return handleUploadPhoto(req, env.DB, env.BUCKET, false);
        if (path === '/api/upload-avatar') return handleUploadPhoto(req, env.DB, env.BUCKET, true);

        if (path.startsWith('/api/media/')) {
            const key = path.replace('/api/media/', '');
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response('Not found', { status: 404 });
            return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' }});
        }
        
        if (path === '/api/graph') return handleGetGraph(env.DB, url.searchParams.get('adminId'));

        return new Response('Not found', { status: 404 });
    } catch(e) {
        return errorResponse(e.message);
    }
  }
};
