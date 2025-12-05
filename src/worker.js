const encoder = new TextEncoder();

// --- Configuration & Constants ---
const ALLOWED_ORIGINS = ['*']; // Adjust for production security
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB limit check

// --- Schema Definitions ---
// We define the tables here to ensure they exist.
// New features: 'parent_id' in data_points for nesting, 'avatar_path' in subjects.

const MIGRATIONS = [
  // 1. Ensure basic tables exist (Idempotent checks done in ensureSchema)
  // 2. Add new columns if they are missing (Safe Migration)
  "ALTER TABLE subject_data_points ADD COLUMN parent_id INTEGER REFERENCES subject_data_points(id)",
  "ALTER TABLE subjects ADD COLUMN avatar_path TEXT",
  "ALTER TABLE subjects ADD COLUMN is_archived INTEGER DEFAULT 0"
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
      // Core Tables
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subjects (
          id INTEGER PRIMARY KEY, admin_id INTEGER, full_name TEXT, dob TEXT, age INTEGER, gender TEXT, 
          occupation TEXT, nationality TEXT, education TEXT, religion TEXT, location TEXT, contact TEXT, 
          habits TEXT, notes TEXT, avatar_path TEXT, is_archived INTEGER DEFAULT 0,
          created_at TEXT, updated_at TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS subject_data_points (
          id INTEGER PRIMARY KEY, subject_id INTEGER, parent_id INTEGER, category TEXT, label TEXT, 
          value TEXT, analysis TEXT, created_at TEXT
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

      // Apply Migrations (Safe Alter)
      for (const query of MIGRATIONS) {
        try { await db.prepare(query).run(); } catch(e) { /* Ignore if column exists */ }
      }
  } catch (err) {
      console.error("Schema Init Error:", err);
  }
}

// --- API Handlers ---

async function handleGetGraph(db, adminId) {
    // Fetches all nodes and edges for the graph view
    const subjects = await db.prepare("SELECT id, full_name, avatar_path, occupation FROM subjects WHERE admin_id = ? AND is_archived = 0").bind(adminId).all();
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
        // Get all data points, UI will handle nesting
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

// --- Frontend Application (Served via Template String) ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Deep Observation OS</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <!-- Vue 3 -->
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <!-- Vis.js for Graph -->
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  
  <style>
    body { font-family: 'Inter', sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    
    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
    
    /* Animations */
    .fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
    .fade-enter-from, .fade-leave-to { opacity: 0; }
    
    .slide-up-enter-active { transition: all 0.3s ease-out; }
    .slide-up-enter-from { opacity: 0; transform: translateY(20px); }

    /* Graph Container */
    #network-graph { width: 100%; height: 100%; outline: none; }
    
    /* Image Grid Frames */
    .evidence-frame {
        aspect-ratio: 1 / 1;
        overflow: hidden;
        position: relative;
        cursor: zoom-in;
    }
    .evidence-frame img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s ease;
    }
    .evidence-frame:hover img { transform: scale(1.05); }

    /* Nested Tree Lines */
    .tree-line {
        position: absolute;
        left: -18px;
        top: 0;
        bottom: 0;
        width: 2px;
        background-color: #e2e8f0;
    }
    .tree-branch {
        position: absolute;
        left: -18px;
        top: 18px;
        width: 16px;
        height: 2px;
        background-color: #e2e8f0;
    }
  </style>
</head>
<body class="h-full text-slate-800 antialiased overflow-hidden">
  <div id="app" class="h-full flex flex-col">

    <!-- Lightbox (Global) -->
    <transition name="fade">
        <div v-if="lightbox.active" @click="lightbox.active = null" class="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4">
            <img :src="lightbox.url" class="max-h-full max-w-full rounded-lg shadow-2xl object-contain" />
            <div class="absolute bottom-8 text-white text-center bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">
                {{ lightbox.desc || 'Evidence View' }}
            </div>
            <button class="absolute top-4 right-4 text-white text-3xl hover:text-indigo-400"><i class="fa-solid fa-xmark"></i></button>
        </div>
    </transition>

    <!-- App Content -->
    <div v-if="view === 'auth'" class="flex-1 flex flex-col items-center justify-center bg-slate-900 text-white relative">
        <div class="w-full max-w-md p-8">
            <div class="text-center mb-10">
                <i class="fa-solid fa-eye text-5xl text-indigo-500 mb-4 animate-pulse"></i>
                <h1 class="text-3xl font-bold tracking-tighter">OBSERVER<span class="text-indigo-500">.OS</span></h1>
                <p class="text-slate-400 text-sm mt-2 font-mono">SECURE RESEARCH ENVIRONMENT</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4 bg-slate-800/50 p-8 rounded-2xl border border-slate-700 shadow-2xl backdrop-blur-sm">
                <div v-if="setupMode" class="bg-indigo-500/20 text-indigo-300 p-3 rounded text-xs text-center border border-indigo-500/30">
                    <i class="fa-solid fa-triangle-exclamation mr-1"></i> System Initialization. Create Admin.
                </div>
                <input v-model="auth.email" type="email" placeholder="Access ID" class="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all">
                <input v-model="auth.password" type="password" placeholder="Passcode" class="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all">
                <button type="submit" :disabled="loading" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)]">
                    {{ loading ? 'Authenticating...' : (setupMode ? 'Initialize System' : 'Enter Workspace') }}
                </button>
            </form>
        </div>
    </div>

    <div v-else class="flex-1 flex h-full overflow-hidden">
        <!-- Sidebar -->
        <aside class="w-20 lg:w-64 flex flex-col bg-white border-r border-slate-200 z-20 shadow-xl">
            <div class="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-100">
                <i class="fa-solid fa-dna text-indigo-600 text-xl lg:mr-3"></i>
                <span class="hidden lg:block font-bold text-slate-800 tracking-tight">OBSERVER</span>
            </div>
            
            <nav class="flex-1 p-3 space-y-2 overflow-y-auto">
                <template v-for="item in menuItems">
                    <a @click="currentTab = item.id; if(item.action) item.action()" 
                       :class="currentTab === item.id ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'"
                       class="flex items-center px-3 py-3 rounded-xl cursor-pointer transition-all group select-none">
                        <div class="w-8 flex justify-center"><i :class="item.icon" class="text-lg transition-transform group-hover:scale-110"></i></div>
                        <span class="hidden lg:block ml-2 font-medium text-sm">{{ item.label }}</span>
                    </a>
                </template>
            </nav>
            
            <div class="p-4 border-t border-slate-100">
                <button @click="logout" class="flex items-center w-full px-3 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-all">
                    <i class="fa-solid fa-power-off w-8"></i>
                    <span class="hidden lg:block ml-2 font-medium text-sm">Terminate</span>
                </button>
            </div>
        </aside>

        <!-- Main Viewport -->
        <main class="flex-1 flex flex-col relative bg-slate-100 overflow-hidden">
            
            <!-- Graph View (Canvas) -->
            <div v-show="currentTab === 'graph'" class="absolute inset-0 z-0 bg-slate-100">
                <div id="network-graph" class="w-full h-full"></div>
                <!-- Graph Controls -->
                <div class="absolute top-4 left-4 bg-white/90 backdrop-blur p-4 rounded-xl shadow-lg border border-slate-200 z-10 w-72">
                    <h3 class="font-bold text-slate-700 mb-2 flex items-center"><i class="fa-solid fa-diagram-project mr-2 text-indigo-500"></i> Relation Map</h3>
                    <input v-model="graphSearch" placeholder="Search entity..." class="w-full text-sm p-2 border border-slate-300 rounded-lg bg-slate-50 mb-2">
                    <div class="flex gap-2 text-xs">
                        <button @click="fitGraph" class="flex-1 bg-slate-200 hover:bg-slate-300 py-1 rounded px-2">Fit All</button>
                        <button @click="refreshGraph" class="flex-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 py-1 rounded px-2">Refresh</button>
                    </div>
                </div>
            </div>

            <!-- Dashboard / List View -->
            <div v-if="currentTab === 'subjects'" class="flex-1 overflow-y-auto p-6 md:p-8">
                <div class="max-w-7xl mx-auto">
                    <div class="flex justify-between items-center mb-8">
                        <div>
                            <h1 class="text-3xl font-extrabold text-slate-900">Subject Directory</h1>
                            <p class="text-slate-500 text-sm mt-1">Manage profiles and avatars.</p>
                        </div>
                        <button @click="currentTab = 'add'" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 flex items-center transition-all">
                            <i class="fa-solid fa-plus mr-2"></i> New Profile
                        </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" 
                             class="bg-white group hover:-translate-y-1 hover:shadow-xl transition-all duration-300 cursor-pointer rounded-2xl border border-slate-200 overflow-hidden relative">
                             
                             <!-- Avatar Header -->
                             <div class="h-32 bg-slate-100 relative">
                                <img v-if="s.avatar_path" :src="'/api/media/' + s.avatar_path" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">
                                <div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-200">
                                    <i class="fa-solid fa-user text-4xl text-slate-300"></i>
                                </div>
                                <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/60 to-transparent"></div>
                             </div>

                             <div class="p-5 relative -mt-8">
                                <div class="bg-white w-14 h-14 rounded-xl shadow-lg flex items-center justify-center absolute -top-8 right-5 border-2 border-white">
                                    <span class="text-xl font-bold text-indigo-600">{{ s.full_name.charAt(0) }}</span>
                                </div>
                                
                                <h3 class="text-lg font-bold text-slate-900 leading-tight pr-10 truncate">{{ s.full_name }}</h3>
                                <p class="text-xs text-slate-500 font-mono mt-1 mb-3">ID-{{ String(s.id).padStart(4, '0') }}</p>
                                
                                <div class="space-y-1.5">
                                    <div class="flex items-center text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                                        <i class="fa-solid fa-briefcase w-5 text-indigo-400"></i>
                                        <span class="truncate">{{ s.occupation || 'No Occupation' }}</span>
                                    </div>
                                    <div class="flex items-center text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                                        <i class="fa-solid fa-location-dot w-5 text-rose-400"></i>
                                        <span class="truncate">{{ s.location || 'Unknown Location' }}</span>
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Detail View -->
            <div v-if="currentTab === 'detail' && selectedSubject" class="flex-1 overflow-hidden flex flex-col md:flex-row">
                
                <!-- Left Panel: Identity & Controls (Fixed) -->
                <div class="w-full md:w-96 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0 z-10 shadow-lg">
                    <div class="p-6">
                        <button @click="currentTab = 'subjects'" class="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center mb-6 transition-colors">
                            <i class="fa-solid fa-arrow-left mr-2"></i> DIRECTORY
                        </button>
                        
                        <div class="relative group cursor-pointer" @click="triggerAvatarUpload">
                            <div class="aspect-square rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-100 shadow-inner relative">
                                <img v-if="selectedSubject.avatar_path" :src="'/api/media/' + selectedSubject.avatar_path" class="w-full h-full object-cover">
                                <div v-else class="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300">
                                    <i class="fa-solid fa-camera text-4xl"></i>
                                </div>
                                <div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span class="text-white text-xs font-bold bg-black/50 px-3 py-1 rounded-full backdrop-blur">Change Avatar</span>
                                </div>
                            </div>
                            <input type="file" ref="avatarInput" @change="handleAvatarUpload" class="hidden" accept="image/*">
                        </div>

                        <div class="mt-4">
                            <h2 class="text-2xl font-black text-slate-900">{{ selectedSubject.full_name }}</h2>
                            <div class="flex flex-wrap gap-2 mt-2">
                                <span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">{{ selectedSubject.occupation || 'N/A' }}</span>
                                <span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold border border-slate-200">Age: {{ selectedSubject.age || '?' }}</span>
                            </div>
                        </div>

                        <div class="mt-8 space-y-6">
                            <!-- Core Fields Editing -->
                            <div v-for="field in ['Nationality', 'Religion', 'Location', 'Contact']" :key="field">
                                <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{{ field }}</label>
                                <div class="text-sm font-medium text-slate-800 border-b border-slate-100 pb-1 flex justify-between group">
                                    <span>{{ selectedSubject[field.toLowerCase()] || '—' }}</span>
                                    <i @click="editCore(field.toLowerCase())" class="fa-solid fa-pen text-slate-300 hover:text-indigo-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"></i>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="grid grid-cols-2 gap-3 mt-8">
                            <button @click="openAddModal('media')" class="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 border border-slate-200 transition-colors flex flex-col items-center gap-2">
                                <i class="fa-solid fa-camera text-xl text-emerald-500"></i> Evidence
                            </button>
                            <button @click="openAddModal('data', null)" class="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 border border-slate-200 transition-colors flex flex-col items-center gap-2">
                                <i class="fa-solid fa-file-pen text-xl text-indigo-500"></i> Detail
                            </button>
                            <button @click="openAddModal('event')" class="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 border border-slate-200 transition-colors flex flex-col items-center gap-2">
                                <i class="fa-solid fa-timeline text-xl text-amber-500"></i> Event
                            </button>
                            <button @click="openAddModal('rel')" class="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 border border-slate-200 transition-colors flex flex-col items-center gap-2">
                                <i class="fa-solid fa-link text-xl text-rose-500"></i> Relation
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right Panel: Deep Data & Evidence -->
                <div class="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8">
                    
                    <!-- Evidence Grid (Fixed Frames) -->
                    <section v-if="selectedSubject.media && selectedSubject.media.length" class="mb-10">
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                            <i class="fa-solid fa-images mr-2"></i> Visual Evidence
                        </h3>
                        <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            <div v-for="m in selectedSubject.media" :key="m.id" class="evidence-frame rounded-lg bg-slate-200 shadow-sm border border-slate-300 group" @click="lightbox = { active: true, url: '/api/media/' + m.object_key, desc: m.description }">
                                <img :src="'/api/media/' + m.object_key" loading="lazy">
                                <div class="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                    {{ m.description || 'No desc' }}
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- Nested Data Tree -->
                    <section class="mb-10">
                        <div class="flex justify-between items-end mb-4">
                            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                                <i class="fa-solid fa-fingerprint mr-2"></i> Deep Details
                            </h3>
                            <span class="text-[10px] text-slate-400">Click items to elaborate</span>
                        </div>

                        <div class="space-y-4">
                            <!-- Recursive Tree Component Logic handled in template via v-for -->
                            <div v-for="node in dataTree" :key="node.id" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <!-- Top Level Item -->
                                <div class="p-4 flex justify-between items-start hover:bg-indigo-50/30 transition-colors cursor-pointer" @click="toggleNode(node.id)">
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase border border-slate-200">{{ node.category }}</span>
                                            <h4 class="font-bold text-slate-800 text-sm">{{ node.label }}</h4>
                                        </div>
                                        <div class="mt-1 text-slate-700 text-sm font-mono">{{ node.value }}</div>
                                        <div v-if="node.analysis" class="mt-2 text-xs text-indigo-600 italic border-l-2 border-indigo-200 pl-2">
                                            "{{ node.analysis }}"
                                        </div>
                                    </div>
                                    <button @click.stop="openAddModal('data', node.id)" class="text-slate-300 hover:text-indigo-600 transition-colors" title="Add nested detail">
                                        <i class="fa-solid fa-plus-circle text-lg"></i>
                                    </button>
                                </div>

                                <!-- Children (Recursive Render) -->
                                <div v-if="node.children && node.children.length && node.expanded" class="bg-slate-50 border-t border-slate-100 p-2 pl-6 space-y-2 relative">
                                    <div v-for="child in node.children" :key="child.id" class="relative pl-4 pt-2">
                                        <!-- Visual Tree Lines -->
                                        <div class="absolute left-0 top-0 bottom-0 w-[1px] bg-indigo-200"></div>
                                        <div class="absolute left-0 top-5 w-3 h-[1px] bg-indigo-200"></div>
                                        
                                        <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm relative group">
                                            <div class="flex justify-between">
                                                <span class="text-xs font-bold text-indigo-600">{{ child.label }}</span>
                                                <button @click.stop="openAddModal('data', child.id)" class="text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <i class="fa-solid fa-reply fa-flip-horizontal"></i>
                                                </button>
                                            </div>
                                            <p class="text-sm text-slate-800 mt-1">{{ child.value }}</p>
                                            <!-- Recursion limit: 2 levels deep for UI simplicity, but backend supports infinite -->
                                            <div v-if="child.children && child.children.length" class="mt-2 pl-2 border-l border-slate-200 text-xs text-slate-500">
                                                <div v-for="grand in child.children" class="mt-1">
                                                    <strong class="text-slate-700">{{ grand.label }}:</strong> {{ grand.value }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- Events & Timeline -->
                     <section>
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                            <i class="fa-solid fa-clock-rotate-left mr-2"></i> Timeline
                        </h3>
                        <div class="relative border-l-2 border-slate-200 ml-3 space-y-8 pb-10">
                            <div v-for="e in selectedSubject.events" :key="e.id" class="relative pl-8">
                                <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-amber-400"></div>
                                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                    <span class="text-xs font-mono text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded">{{ e.event_date }}</span>
                                    <h4 class="font-bold text-slate-900 mt-2">{{ e.title }}</h4>
                                    <p class="text-sm text-slate-600 mt-1">{{ e.description }}</p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <!-- Add Subject Form -->
             <div v-if="currentTab === 'add'" class="flex-1 flex flex-col items-center p-8 overflow-y-auto">
                <div class="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                    <div class="bg-slate-50 px-8 py-6 border-b border-slate-200">
                        <h2 class="text-xl font-black text-slate-900">Initialize Subject</h2>
                        <p class="text-slate-500 text-sm">Create a new container for human observation.</p>
                    </div>
                    <form @submit.prevent="createSubject" class="p-8 space-y-6">
                        <div class="grid grid-cols-2 gap-6">
                            <div class="col-span-2">
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Full Name</label>
                                <input v-model="newSubject.fullName" required class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Occupation</label>
                                <input v-model="newSubject.occupation" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:border-indigo-500">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Location</label>
                                <input v-model="newSubject.location" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:border-indigo-500">
                            </div>
                        </div>
                        <div class="flex justify-end gap-4 pt-4 border-t border-slate-100">
                            <button type="button" @click="currentTab = 'subjects'" class="px-6 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">Cancel</button>
                            <button type="submit" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg shadow-indigo-200">Create Profile</button>
                        </div>
                    </form>
                </div>
             </div>

        </main>
    </div>

    <!-- Universal Modal -->
    <transition name="fade">
        <div v-if="modal.type" class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="font-bold text-slate-800">{{ modalTitle }}</h3>
                    <button @click="closeModal" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
                
                <div class="p-6">
                    <!-- Data Point Form -->
                    <form v-if="modal.type === 'data'" @submit.prevent="submitData" class="space-y-4">
                        <div v-if="modal.parentId" class="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-700 flex items-center mb-4">
                            <i class="fa-solid fa-diagram-next mr-2"></i> Adding detail to existing point
                        </div>
                        <div v-else>
                            <label class="text-xs font-bold text-slate-500 uppercase">Category</label>
                            <select v-model="forms.data.category" class="w-full border border-slate-300 rounded-lg p-2.5 bg-white mt-1">
                                <option>Physical</option>
                                <option>Psychological</option>
                                <option>Biographical</option>
                                <option>Habit</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Label</label>
                            <input v-model="forms.data.label" placeholder="e.g. Scar Location" required class="w-full border border-slate-300 rounded-lg p-2.5 mt-1">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Value</label>
                            <textarea v-model="forms.data.value" placeholder="Detail content..." required class="w-full border border-slate-300 rounded-lg p-2.5 mt-1 h-20"></textarea>
                        </div>
                        <button type="submit" :disabled="uploading" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors">
                            {{ uploading ? 'Saving...' : 'Attach Detail' }}
                        </button>
                    </form>

                    <!-- Media Upload Form -->
                    <div v-if="modal.type === 'media'" class="space-y-4">
                         <div class="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors relative">
                            <input type="file" @change="handleFileSelect" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*">
                            <div v-if="forms.media.preview">
                                <img :src="forms.media.preview" class="h-32 mx-auto rounded-lg shadow-sm object-cover">
                                <p class="text-xs text-emerald-600 font-bold mt-2">Ready to upload</p>
                            </div>
                            <div v-else>
                                <i class="fa-solid fa-cloud-arrow-up text-3xl text-slate-300 mb-2"></i>
                                <p class="text-slate-500 text-sm font-medium">Tap to select image</p>
                            </div>
                         </div>
                         <input v-model="forms.media.desc" placeholder="Description of evidence..." class="w-full border border-slate-300 rounded-lg p-3">
                         <button @click="submitMedia" :disabled="!forms.media.data || uploading" class="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50">
                            {{ uploading ? 'Compressing & Uploading...' : 'Upload Evidence' }}
                        </button>
                    </div>

                    <!-- Relationship Form -->
                    <form v-if="modal.type === 'rel'" @submit.prevent="submitRel" class="space-y-4">
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Connect With</label>
                            <select v-model="forms.rel.subjectB" class="w-full border border-slate-300 rounded-lg p-2.5 mt-1">
                                <option v-for="s in subjects" :value="s.id" :disabled="s.id === selectedSubject.id">{{ s.full_name }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Relationship</label>
                            <input v-model="forms.rel.type" placeholder="e.g. Brother, Enemy" class="w-full border border-slate-300 rounded-lg p-2.5 mt-1">
                        </div>
                         <button type="submit" class="w-full bg-rose-500 text-white py-3 rounded-xl font-bold hover:bg-rose-600">Connect</button>
                    </form>
                </div>
            </div>
        </div>
    </transition>

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        const view = ref('auth');
        const setupMode = ref(false);
        const currentTab = ref('subjects');
        const loading = ref(false);
        const uploading = ref(false);
        const subjects = ref([]);
        const selectedSubject = ref(null);
        const lightbox = reactive({ active: false, url: '', desc: '' });
        
        // Graph State
        const graphSearch = ref('');
        let network = null;

        // Auth
        const auth = reactive({ email: '', password: '' });
        
        // Modal State
        const modal = reactive({ type: null, parentId: null });
        const modalTitle = computed(() => {
            if(modal.type === 'data') return modal.parentId ? 'Add Sub-Detail' : 'Add Detail';
            if(modal.type === 'media') return 'Upload Evidence';
            if(modal.type === 'rel') return 'Add Connection';
            return 'Action';
        });

        // Forms
        const newSubject = reactive({ fullName: '', occupation: '', location: '' });
        const forms = reactive({
            data: { category: 'Physical', label: '', value: '', analysis: '' },
            media: { data: null, desc: '', preview: null, filename: '', type: '' },
            rel: { subjectB: '', type: '' },
            event: { title: '', date: '', desc: '' }
        });

        // Helpers
        const menuItems = [
            { id: 'subjects', label: 'Directory', icon: 'fa-solid fa-folder-open' },
            { id: 'graph', label: 'Relations Graph', icon: 'fa-solid fa-diagram-project', action: loadGraph },
        ];

        // API Wrapper
        const api = async (url, opts = {}) => {
            const res = await fetch(url, opts);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        };

        // --- Data Logic ---

        const dataTree = computed(() => {
            if (!selectedSubject.value || !selectedSubject.value.dataPoints) return [];
            const raw = selectedSubject.value.dataPoints;
            const map = {};
            const roots = [];
            
            // First pass: create nodes
            raw.forEach(item => {
                map[item.id] = { ...item, children: [], expanded: true }; // Expanded by default
            });
            
            // Second pass: link parents
            raw.forEach(item => {
                if (item.parent_id && map[item.parent_id]) {
                    map[item.parent_id].children.push(map[item.id]);
                } else {
                    roots.push(map[item.id]);
                }
            });
            return roots;
        });
        
        const filteredSubjects = computed(() => subjects.value); // Add search later if needed

        // --- Methods ---

        const handleAuth = async () => {
            loading.value = true;
            try {
                const ep = setupMode.value ? '/api/setup-admin' : '/api/login';
                const res = await api(ep, { method: 'POST', body: JSON.stringify(auth) });
                localStorage.setItem('admin_id', res.id);
                view.value = 'app';
                fetchSubjects();
            } catch (e) { alert(e.message); } 
            finally { loading.value = false; }
        };

        const fetchSubjects = async () => {
            const id = localStorage.getItem('admin_id');
            if(id) subjects.value = await api('/api/subjects?adminId=' + id);
        };

        const createSubject = async () => {
            await api('/api/subjects', {
                method: 'POST',
                body: JSON.stringify({ ...newSubject, adminId: localStorage.getItem('admin_id') })
            });
            newSubject.fullName = '';
            fetchSubjects();
            currentTab.value = 'subjects';
        };

        const viewSubject = async (id) => {
            selectedSubject.value = await api('/api/subjects/' + id);
            currentTab.value = 'detail';
        };

        const toggleNode = (id) => {
             // Logic to toggle expansion could go here, relying on reactive map in real implementation
             // For now we just default expand all
        };

        // --- Image Compression & Upload ---
        // Solves "Data Upload Errors" by resizing large images client-side
        const compressImage = (file) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (e) => {
                    const img = new Image();
                    img.src = e.target.result;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 1200; // Reasonable limit
                        const scale = MAX_WIDTH / img.width;
                        canvas.width = scale < 1 ? MAX_WIDTH : img.width;
                        canvas.height = scale < 1 ? img.height * scale : img.height;
                        
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]); // Send base64
                    };
                };
            });
        };

        const handleFileSelect = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            forms.media.filename = file.name;
            forms.media.type = 'image/jpeg';
            forms.media.preview = URL.createObjectURL(file);
            uploading.value = true;
            forms.media.data = await compressImage(file);
            uploading.value = false;
        };

        const submitMedia = async () => {
            if(!forms.media.data) return;
            uploading.value = true;
            try {
                await api('/api/upload-photo', {
                    method: 'POST',
                    body: JSON.stringify({
                        subjectId: selectedSubject.value.id,
                        data: forms.media.data,
                        filename: forms.media.filename,
                        contentType: forms.media.type,
                        description: forms.media.desc
                    })
                });
                closeModal();
                viewSubject(selectedSubject.value.id);
            } catch(e) { alert("Upload failed: " + e.message); }
            finally { uploading.value = false; }
        };

        // --- Graph Logic (Vis.js) ---
        async function loadGraph() {
            const id = localStorage.getItem('admin_id');
            const data = await api('/api/graph?adminId=' + id);
            
            const container = document.getElementById('network-graph');
            const nodes = data.nodes.map(n => ({
                id: n.id,
                label: n.full_name,
                shape: 'circularImage',
                image: n.avatar_path ? '/api/media/' + n.avatar_path : 'https://ui-avatars.com/api/?name='+n.full_name,
                size: 30,
                borderWidth: 2,
                color: { border: '#6366f1', background: '#ffffff' }
            }));
            
            const edges = data.edges.map(e => ({
                from: e.from_id,
                to: e.to_id,
                label: e.label,
                arrows: 'to',
                color: { color: '#cbd5e1' },
                font: { size: 10, align: 'middle' },
                smooth: { type: 'curvedCW', roundness: 0.2 }
            }));

            const opts = {
                physics: { stabilization: true, barnesHut: { gravitationalConstant: -3000 } },
                interaction: { hover: true, tooltipDelay: 200 }
            };
            
            network = new vis.Network(container, { nodes, edges }, opts);
            
            network.on('click', (params) => {
                if(params.nodes.length) viewSubject(params.nodes[0]);
            });
        }

        const fitGraph = () => network && network.fit();
        const refreshGraph = () => loadGraph();

        watch(graphSearch, (val) => {
            // Simple visual search in graph
            if(!network) return;
            const nodes = network.body.data.nodes.get();
            const matches = nodes.filter(n => n.label.toLowerCase().includes(val.toLowerCase())).map(n => n.id);
            network.selectNodes(matches);
        });

        // --- Modals & Avatars ---
        const openAddModal = (type, parentId = null) => {
            modal.type = type;
            modal.parentId = parentId;
            // Reset forms
            forms.data = { category: 'Physical', label: '', value: '', analysis: '' };
            forms.media = { data: null, desc: '', preview: null };
            forms.rel = { subjectB: '', type: '' };
        };

        const closeModal = () => { modal.type = null; };

        const submitData = async () => {
            uploading.value = true;
            await api('/api/data-point', {
                method: 'POST',
                body: JSON.stringify({ 
                    ...forms.data, 
                    subjectId: selectedSubject.value.id,
                    parentId: modal.parentId // Support Nesting
                })
            });
            uploading.value = false;
            closeModal();
            viewSubject(selectedSubject.value.id);
        };

        const submitRel = async () => {
             await api('/api/relationship', {
                method: 'POST',
                body: JSON.stringify({ ...forms.rel, subjectA: selectedSubject.value.id })
            });
            closeModal();
            viewSubject(selectedSubject.value.id);
        };
        
        // Avatar Special Handling
        const triggerAvatarUpload = () => { document.querySelector('input[type="file"]').click(); };
        const handleAvatarUpload = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const b64 = await compressImage(file);
            await api('/api/upload-avatar', {
                method: 'POST',
                body: JSON.stringify({ subjectId: selectedSubject.value.id, data: b64, filename: file.name, contentType: 'image/jpeg' })
            });
            viewSubject(selectedSubject.value.id);
        };

        // Init
        onMounted(async () => {
            try {
                const status = await api('/api/status');
                if(!status.adminExists) setupMode.value = true;
                else {
                    const saved = localStorage.getItem('admin_id');
                    if(saved) {
                        view.value = 'app';
                        fetchSubjects();
                    }
                }
            } catch(e) {}
        });

        return {
            view, setupMode, currentTab, loading, uploading, subjects, filteredSubjects, selectedSubject,
            auth, newSubject, modal, modalTitle, forms, lightbox, menuItems, dataTree, graphSearch,
            handleAuth, logout: () => { localStorage.clear(); location.reload(); },
            createSubject, viewSubject, openAddModal, closeModal, submitData, submitRel, 
            submitMedia, handleFileSelect, loadGraph, fitGraph, refreshGraph,
            triggerAvatarUpload, handleAvatarUpload
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
    // 1. Upload to R2
    const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(filename)}`;
    const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    await bucket.put(key, binary, { httpMetadata: { contentType } });
    
    // 2. Record in DB
    if (isAvatar) {
        // Update subject avatar column
        await db.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
    } else {
        // Add to media gallery
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
        // 1. serve frontend
        if (req.method === 'GET' && path === '/') return serveHtml();
        
        // 2. ensure DB
        if (path.startsWith('/api/')) await ensureSchema(env.DB);
        
        // 3. route API
        if (path === '/api/status') {
            const c = await env.DB.prepare('SELECT COUNT(*) as c FROM admins').first();
            return response({ adminExists: c.c > 0 });
        }
        if (path === '/api/setup-admin') return handleSetup(req, env.DB);
        if (path === '/api/login') return handleLogin(req, env.DB);
        
        if (path === '/api/subjects') {
            if (req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare('INSERT INTO subjects (admin_id, full_name, occupation, location, created_at) VALUES (?,?,?,?,?)')
                    .bind(p.adminId, p.fullName, p.occupation, p.location, isoTimestamp()).run();
                return response({ success: true });
            }
            const adminId = url.searchParams.get('adminId');
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? ORDER BY created_at DESC').bind(adminId).all();
            return response(res.results);
        }

        if (path.match(/^\/api\/subjects\/\d+$/)) {
             return handleGetSubjectFull(env.DB, path.split('/').pop());
        }

        if (path === '/api/data-point') {
            const p = await req.json();
            // p.parentId can be null or an integer
            await env.DB.prepare('INSERT INTO subject_data_points (subject_id, parent_id, category, label, value, analysis, created_at) VALUES (?,?,?,?,?,?,?)')
                .bind(p.subjectId, p.parentId || null, p.category, p.label, p.value, p.analysis, isoTimestamp()).run();
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
            // Optional: Create inverse relationship automatically?
            // For now, let's keep it directional as requested.
            return response({ success: true });
        }

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
