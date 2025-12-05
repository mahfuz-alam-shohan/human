const encoder = new TextEncoder();

const ADMIN_EMAIL_MAX = 320;
const PASSWORD_MIN = 8;

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
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'upload';
}

// --- Database Operations ---

async function ensureSchema(db) {
  const statements = [
    // 1. Admins
    db.prepare(
      'CREATE TABLE IF NOT EXISTS admins (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'email TEXT NOT NULL UNIQUE,\n' +
        'password_hash TEXT NOT NULL,\n' +
        'created_at TEXT NOT NULL\n' +
        ')'
    ),
    // 2. Subjects (Core Identity)
    db.prepare(
      'CREATE TABLE IF NOT EXISTS subjects (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'admin_id INTEGER NOT NULL REFERENCES admins(id),\n' +
        'full_name TEXT NOT NULL,\n' +
        'age INTEGER,\n' +
        'gender TEXT,\n' +
        'occupation TEXT,\n' +
        'religion TEXT,\n' +
        'location TEXT,\n' +
        'contact TEXT,\n' +
        'habits TEXT,\n' +
        'notes TEXT,\n' +
        'created_at TEXT NOT NULL,\n' +
        'updated_at TEXT NOT NULL\n' +
        ')'
    ),
    // 3. Data Points (Deep Analysis for any attribute)
    db.prepare(
      'CREATE TABLE IF NOT EXISTS subject_data_points (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'subject_id INTEGER NOT NULL REFERENCES subjects(id),\n' +
        'category TEXT NOT NULL,\n' + // e.g., 'Identity', 'Social', 'Psychology'
        'label TEXT NOT NULL,\n' + // e.g., 'Name Origin', 'Facebook Profile'
        'value TEXT,\n' + // The raw data
        'analysis TEXT,\n' + // Researcher's thoughts/analysis on this specific point
        'created_at TEXT NOT NULL\n' +
        ')'
    ),
    // 4. Life Events (Timeline)
    db.prepare(
      'CREATE TABLE IF NOT EXISTS subject_events (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'subject_id INTEGER NOT NULL REFERENCES subjects(id),\n' +
        'title TEXT NOT NULL,\n' +
        'description TEXT,\n' +
        'event_date TEXT,\n' + // YYYY-MM-DD
        'created_at TEXT NOT NULL\n' +
        ')'
    ),
    // 5. Relationships (Network)
    db.prepare(
      'CREATE TABLE IF NOT EXISTS subject_relationships (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'subject_a_id INTEGER NOT NULL REFERENCES subjects(id),\n' +
        'subject_b_id INTEGER NOT NULL REFERENCES subjects(id),\n' +
        'relationship_type TEXT NOT NULL,\n' + // e.g., 'Mother', 'Friend', 'Rival'
        'notes TEXT,\n' +
        'created_at TEXT NOT NULL\n' +
        ')'
    ),
    // 6. Media
    db.prepare(
      'CREATE TABLE IF NOT EXISTS subject_media (\n' +
        'id INTEGER PRIMARY KEY,\n' +
        'subject_id INTEGER NOT NULL REFERENCES subjects(id),\n' +
        'object_key TEXT NOT NULL UNIQUE,\n' +
        'content_type TEXT NOT NULL,\n' +
        'description TEXT,\n' +
        'created_at TEXT NOT NULL\n' +
        ')'
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_subjects_admin ON subjects(admin_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_data_subject ON subject_data_points(subject_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_events_subject ON subject_events(subject_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_rel_subject_a ON subject_relationships(subject_a_id)'),
  ];

  await db.batch(statements);
}

async function adminExists(db) {
  const stmt = db.prepare('SELECT COUNT(id) AS count FROM admins');
  const result = await stmt.first();
  const count = result?.count ?? 0;
  return count > 0;
}

async function verifyAdmin(db, email, password) {
    const stmt = db.prepare('SELECT id, password_hash FROM admins WHERE email = ?');
    const user = await stmt.bind(email).first();
    
    if (!user) return null;
    
    const hashedInput = await hashPassword(password);
    if (hashedInput === user.password_hash) {
        return { id: user.id, email: email };
    }
    return null;
}

async function createAdmin(db, email, password) {
  const hashed = await hashPassword(password);
  const createdAt = isoTimestamp();
  const stmt = db.prepare(
    'INSERT INTO admins (email, password_hash, created_at) VALUES (?1, ?2, ?3)'
  );
  await stmt.bind(email, hashed, createdAt).run();
}

async function getSubjects(db, adminId) {
    const stmt = db.prepare(`
        SELECT id, full_name, occupation, age, location, created_at 
        FROM subjects 
        WHERE admin_id = ? 
        ORDER BY updated_at DESC
    `);
    const { results } = await stmt.bind(adminId).all();
    return results;
}

async function getSubjectDetail(db, subjectId) {
    // Core Info
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(subjectId).first();
    if (!subject) return null;

    // Media
    const { results: media } = await db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
    
    // Data Points
    const { results: dataPoints } = await db.prepare('SELECT * FROM subject_data_points WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();

    // Events
    const { results: events } = await db.prepare('SELECT * FROM subject_events WHERE subject_id = ? ORDER BY event_date DESC').bind(subjectId).all();

    // Relationships (Outgoing)
    // In a real app you might want bidirectional, but let's stick to simple linking for now
    const { results: relationships } = await db.prepare(`
        SELECT r.*, s.full_name as target_name 
        FROM subject_relationships r 
        JOIN subjects s ON r.subject_b_id = s.id 
        WHERE r.subject_a_id = ?
    `).bind(subjectId).all();

    return { ...subject, media, dataPoints, events, relationships };
}

async function addSubject(db, payload) {
  const createdAt = isoTimestamp();
  const stmt = db.prepare(
    'INSERT INTO subjects (admin_id, full_name, age, gender, occupation, religion, location, contact, habits, notes, created_at, updated_at) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)'
  );

  const result = await stmt
    .bind(
      payload.adminId,
      payload.fullName,
      payload.age || null,
      payload.gender || null,
      payload.occupation || null,
      payload.religion || null,
      payload.location || null,
      payload.contact || null,
      payload.habits || null,
      payload.notes || null,
      createdAt,
      createdAt
    )
    .run();

  return { id: result.meta.last_row_id, createdAt };
}

// --- Specific Insert Functions ---

async function addDataPoint(db, { subjectId, category, label, value, analysis }) {
    return await db.prepare('INSERT INTO subject_data_points (subject_id, category, label, value, analysis, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(subjectId, category, label, value, analysis, isoTimestamp())
        .run();
}

async function addEvent(db, { subjectId, title, description, eventDate }) {
    return await db.prepare('INSERT INTO subject_events (subject_id, title, description, event_date, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(subjectId, title, description, eventDate, isoTimestamp())
        .run();
}

async function addRelationship(db, { subjectA, subjectB, type, notes }) {
    return await db.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, notes, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(subjectA, subjectB, type, notes, isoTimestamp())
        .run();
}

async function recordMedia(db, subjectId, objectKey, contentType, description) {
  return await db.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(subjectId, objectKey, contentType, description || null, isoTimestamp())
      .run();
}

// --- Frontend Application (Served as HTML) ---

async function serveHome(request, env, ctx) {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-100">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
  <title>Deep Human Research</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
    .fade-enter-from, .fade-leave-to { opacity: 0; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none;  scrollbar-width: none; }
  </style>
</head>
<body class="h-full text-slate-800 antialiased">
  <div id="app" class="h-full flex flex-col">
    
    <!-- Auth View -->
    <div v-if="view === 'auth'" class="flex-1 flex flex-col justify-center items-center p-6 bg-slate-900 text-white">
        <div class="w-full max-w-md space-y-8">
            <div class="text-center">
                <div class="mx-auto h-20 w-20 bg-indigo-500 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20">
                    <i class="fa-solid fa-brain text-4xl text-white"></i>
                </div>
                <h2 class="text-3xl font-bold tracking-tight">{{ setupMode ? 'Initialize Protocol' : 'Research Access' }}</h2>
                <p class="mt-2 text-slate-400">Deep Psychological Observation Database</p>
            </div>
            <form @submit.prevent="handleAuth" class="mt-8 space-y-6 bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl">
                <div class="space-y-4">
                    <input v-model="authForm.email" type="email" placeholder="Researcher ID (Email)" required class="block w-full rounded-lg bg-slate-900 border-slate-700 text-white p-3 focus:ring-indigo-500 focus:border-indigo-500">
                    <input v-model="authForm.password" type="password" placeholder="Passcode" required class="block w-full rounded-lg bg-slate-900 border-slate-700 text-white p-3 focus:ring-indigo-500 focus:border-indigo-500">
                </div>
                <div v-if="authError" class="text-red-400 text-sm text-center">{{ authError }}</div>
                <button type="submit" :disabled="loading" class="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-500 transition-all">
                    {{ loading ? 'Authenticating...' : (setupMode ? 'Initialize System' : 'Enter Secure Environment') }}
                </button>
            </form>
        </div>
    </div>

    <!-- App Interface -->
    <div v-else class="flex h-full overflow-hidden bg-slate-50">
        <!-- Sidebar -->
        <aside class="hidden md:flex md:w-72 md:flex-col bg-slate-900 border-r border-slate-800 shadow-xl z-20 text-slate-300">
            <div class="h-16 flex items-center px-6 border-b border-slate-800 font-bold text-white tracking-wider">
                <i class="fa-solid fa-eye text-indigo-500 mr-3"></i> PSYCH_LAB
            </div>
            <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
                <p class="px-3 text-xs font-bold text-slate-500 uppercase tracking-widest mt-4 mb-2">Modules</p>
                <a @click="currentTab = 'dashboard'" :class="currentTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'" class="flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors">
                    <i class="fa-solid fa-chart-network w-6"></i> Dashboard
                </a>
                <a @click="currentTab = 'subjects'; fetchSubjects()" :class="currentTab === 'subjects' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'" class="flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors">
                    <i class="fa-solid fa-users-viewfinder w-6"></i> Subjects Directory
                </a>
                <a @click="currentTab = 'add'" :class="currentTab === 'add' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'" class="flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors">
                    <i class="fa-solid fa-user-plus w-6"></i> New Subject
                </a>
            </nav>
            <div class="p-4 border-t border-slate-800">
                <button @click="logout" class="flex items-center w-full px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                    <i class="fa-solid fa-power-off w-6"></i> Terminate Session
                </button>
            </div>
        </aside>

        <!-- Main Area -->
        <main class="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 relative">
            <!-- Mobile Header -->
            <div class="md:hidden flex items-center justify-between bg-slate-900 text-white px-4 h-16 shrink-0 z-30">
                <span class="font-bold"><i class="fa-solid fa-eye text-indigo-500 mr-2"></i> PSYCH_LAB</span>
                <button @click="logout"><i class="fa-solid fa-power-off"></i></button>
            </div>

            <!-- Content Container -->
            <div class="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                
                <!-- Dashboard -->
                <div v-if="currentTab === 'dashboard'" class="max-w-6xl mx-auto space-y-8">
                    <header>
                        <h1 class="text-3xl font-bold text-slate-900">Research Console</h1>
                        <p class="text-slate-500">System Status: Active Monitoring</p>
                    </header>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div class="text-slate-500 text-sm font-medium uppercase">Total Subjects</div>
                            <div class="text-4xl font-bold text-slate-900 mt-2">{{ subjects.length }}</div>
                        </div>
                        <div class="bg-indigo-600 p-6 rounded-xl shadow-lg text-white">
                            <div class="text-indigo-200 text-sm font-medium uppercase">Active Analysis</div>
                            <div class="text-2xl font-bold mt-2">Data Collection Mode</div>
                            <p class="text-indigo-200 text-sm mt-2">Ready for granular input.</p>
                        </div>
                    </div>
                </div>

                <!-- Subjects List -->
                <div v-if="currentTab === 'subjects'" class="max-w-7xl mx-auto">
                    <div class="flex justify-between items-center mb-8">
                        <h1 class="text-3xl font-bold text-slate-900">Directory</h1>
                        <button @click="fetchSubjects" class="text-indigo-600 hover:text-indigo-800"><i class="fa-solid fa-rotate-right"></i> Refresh</button>
                    </div>
                    <div v-if="loading" class="py-12 text-center text-slate-400"><i class="fa-solid fa-circle-notch fa-spin text-2xl"></i></div>
                    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div v-for="s in subjects" :key="s.id" @click="viewSubject(s.id)" class="bg-white group hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <div class="p-6">
                                <div class="flex items-center justify-between mb-4">
                                    <div class="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                        {{ s.full_name.charAt(0) }}
                                    </div>
                                    <span class="text-xs font-mono text-slate-400">#{{ String(s.id).padStart(4, '0') }}</span>
                                </div>
                                <h3 class="text-lg font-bold text-slate-900 truncate">{{ s.full_name }}</h3>
                                <p class="text-sm text-slate-500 truncate">{{ s.occupation || 'No occupation' }}</p>
                                <div class="mt-4 flex gap-2 text-xs text-slate-400">
                                    <span v-if="s.gender" class="px-2 py-1 bg-slate-50 rounded">{{ s.gender }}</span>
                                    <span v-if="s.age" class="px-2 py-1 bg-slate-50 rounded">{{ s.age }}y</span>
                                </div>
                            </div>
                            <div class="bg-slate-50 px-6 py-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
                                <span>Updated {{ new Date(s.created_at).toLocaleDateString() }}</span>
                                <span class="group-hover:text-indigo-600 font-medium">View Analysis &rarr;</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Add Subject (Simple Entry) -->
                <div v-if="currentTab === 'add'" class="max-w-2xl mx-auto">
                    <h1 class="text-2xl font-bold text-slate-900 mb-6">Initialize New Subject</h1>
                    <div class="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                        <form @submit.prevent="createSubject" class="space-y-6">
                            <div class="grid grid-cols-2 gap-6">
                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-slate-700">Full Name</label>
                                    <input v-model="newSubject.fullName" type="text" required class="mt-1 block w-full rounded-md border-slate-300 bg-slate-50 border p-3 focus:ring-indigo-500 focus:border-indigo-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-slate-700">Age</label>
                                    <input v-model="newSubject.age" type="number" class="mt-1 block w-full rounded-md border-slate-300 bg-slate-50 border p-3">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-slate-700">Gender</label>
                                    <input v-model="newSubject.gender" type="text" class="mt-1 block w-full rounded-md border-slate-300 bg-slate-50 border p-3">
                                </div>
                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-slate-700">Initial Occupation</label>
                                    <input v-model="newSubject.occupation" type="text" class="mt-1 block w-full rounded-md border-slate-300 bg-slate-50 border p-3">
                                </div>
                            </div>
                            <div class="pt-4 flex justify-end">
                                <button type="submit" :disabled="loading" class="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                                    {{ loading ? 'Creating...' : 'Create & Start Observing' }}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- DEEP DETAIL VIEW -->
                <div v-if="currentTab === 'detail' && selectedSubject" class="max-w-6xl mx-auto pb-20">
                    <!-- Header -->
                    <div class="flex items-start justify-between mb-6">
                        <div>
                            <button @click="currentTab = 'subjects'" class="text-sm text-slate-500 hover:text-indigo-600 mb-2"><i class="fa-solid fa-arrow-left"></i> Back to Directory</button>
                            <h1 class="text-4xl font-bold text-slate-900">{{ selectedSubject.full_name }}</h1>
                            <div class="flex items-center gap-4 mt-2 text-slate-500">
                                <span><i class="fa-solid fa-briefcase mr-1"></i> {{ selectedSubject.occupation || 'N/A' }}</span>
                                <span><i class="fa-solid fa-location-dot mr-1"></i> {{ selectedSubject.location || 'Unknown Loc' }}</span>
                                <span class="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded text-slate-600">ID: {{ selectedSubject.id }}</span>
                            </div>
                        </div>
                        <div class="flex gap-2">
                             <!-- Action Buttons could go here -->
                        </div>
                    </div>

                    <!-- Tabs -->
                    <div class="flex border-b border-slate-200 mb-6 space-x-6 overflow-x-auto">
                        <button @click="detailTab = 'overview'" :class="detailTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'" class="pb-3 border-b-2 font-medium whitespace-nowrap">Overview</button>
                        <button @click="detailTab = 'analysis'" :class="detailTab === 'analysis' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'" class="pb-3 border-b-2 font-medium whitespace-nowrap"> <i class="fa-solid fa-microscope mr-1"></i> Deep Analysis</button>
                        <button @click="detailTab = 'timeline'" :class="detailTab === 'timeline' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'" class="pb-3 border-b-2 font-medium whitespace-nowrap"> <i class="fa-solid fa-timeline mr-1"></i> Life Timeline</button>
                        <button @click="detailTab = 'network'" :class="detailTab === 'network' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'" class="pb-3 border-b-2 font-medium whitespace-nowrap"> <i class="fa-solid fa-circle-nodes mr-1"></i> Relationships</button>
                        <button @click="detailTab = 'media'" :class="detailTab === 'media' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'" class="pb-3 border-b-2 font-medium whitespace-nowrap"> <i class="fa-solid fa-images mr-1"></i> Media</button>
                    </div>

                    <!-- OVERVIEW TAB -->
                    <div v-if="detailTab === 'overview'" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div class="lg:col-span-2 space-y-8">
                            <!-- Basic Data Card -->
                            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Core Identity</h3>
                                <div class="grid grid-cols-2 gap-y-4">
                                    <div class="group cursor-pointer">
                                        <div class="text-xs text-slate-400">Age</div>
                                        <div class="font-medium">{{ selectedSubject.age || '--' }}</div>
                                    </div>
                                    <div class="group cursor-pointer">
                                        <div class="text-xs text-slate-400">Gender</div>
                                        <div class="font-medium">{{ selectedSubject.gender || '--' }}</div>
                                    </div>
                                    <div class="group cursor-pointer">
                                        <div class="text-xs text-slate-400">Religion</div>
                                        <div class="font-medium">{{ selectedSubject.religion || '--' }}</div>
                                    </div>
                                    <div class="group cursor-pointer">
                                        <div class="text-xs text-slate-400">Contact</div>
                                        <div class="font-medium truncate">{{ selectedSubject.contact || '--' }}</div>
                                    </div>
                                </div>
                                <div class="mt-6 bg-amber-50 border border-amber-100 rounded-lg p-4">
                                    <div class="text-xs text-amber-600 font-bold mb-1">GENERAL NOTES</div>
                                    <p class="text-slate-700 whitespace-pre-line">{{ selectedSubject.notes || 'No general notes.' }}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="space-y-6">
                            <!-- Quick Stats -->
                            <div class="bg-slate-900 text-white rounded-xl p-6 shadow-lg">
                                <h3 class="font-bold mb-4">Observation Stats</h3>
                                <div class="space-y-3 text-sm">
                                    <div class="flex justify-between"><span>Data Points</span> <span class="font-mono text-indigo-400">{{ selectedSubject.dataPoints?.length || 0 }}</span></div>
                                    <div class="flex justify-between"><span>Events Logged</span> <span class="font-mono text-indigo-400">{{ selectedSubject.events?.length || 0 }}</span></div>
                                    <div class="flex justify-between"><span>Connections</span> <span class="font-mono text-indigo-400">{{ selectedSubject.relationships?.length || 0 }}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ANALYSIS TAB (Data Points) -->
                    <div v-if="detailTab === 'analysis'" class="space-y-6">
                        <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex justify-between items-center">
                            <div>
                                <h3 class="font-bold text-indigo-900">Granular Analysis</h3>
                                <p class="text-indigo-700 text-sm">Add specific details with psychological context (e.g., "Why this name?", "Facebook Link").</p>
                            </div>
                            <button @click="showAddDataModal = true" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fa-solid fa-plus mr-1"></i> Add Data Point</button>
                        </div>

                        <div v-if="!selectedSubject.dataPoints || selectedSubject.dataPoints.length === 0" class="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                            <p class="text-slate-400">No deep data points recorded yet.</p>
                        </div>

                        <div class="grid grid-cols-1 gap-4">
                            <div v-for="dp in selectedSubject.dataPoints" :key="dp.id" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <div class="flex items-start justify-between">
                                    <div>
                                        <span class="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold uppercase rounded mb-2">{{ dp.category }}</span>
                                        <h4 class="text-lg font-bold text-slate-800">{{ dp.label }}</h4>
                                        <div class="font-mono text-slate-900 bg-slate-50 inline-block px-2 py-1 rounded mt-1 border border-slate-200">{{ dp.value }}</div>
                                    </div>
                                    <span class="text-xs text-slate-400">{{ new Date(dp.created_at).toLocaleDateString() }}</span>
                                </div>
                                <div v-if="dp.analysis" class="mt-4 pt-4 border-t border-slate-100">
                                    <p class="text-sm font-bold text-slate-400 mb-1"><i class="fa-solid fa-comment-dots mr-1"></i> RESEARCHER THOUGHTS</p>
                                    <p class="text-slate-700 italic">"{{ dp.analysis }}"</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TIMELINE TAB -->
                    <div v-if="detailTab === 'timeline'" class="max-w-3xl">
                        <div class="flex justify-end mb-4">
                            <button @click="showAddEventModal = true" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fa-solid fa-calendar-plus mr-1"></i> Log Event</button>
                        </div>
                        <div class="relative border-l-2 border-slate-200 ml-4 space-y-8">
                            <div v-for="evt in selectedSubject.events" :key="evt.id" class="relative pl-8">
                                <div class="absolute -left-2 top-0 h-4 w-4 rounded-full bg-indigo-600 border-2 border-white shadow"></div>
                                <div class="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                                    <span class="text-xs font-bold text-indigo-600 uppercase">{{ evt.event_date || 'Unknown Date' }}</span>
                                    <h4 class="text-lg font-bold text-slate-900 mt-1">{{ evt.title }}</h4>
                                    <p class="text-slate-600 mt-2">{{ evt.description }}</p>
                                </div>
                            </div>
                            <div v-if="!selectedSubject.events?.length" class="pl-8 text-slate-400 italic">No events logged.</div>
                        </div>
                    </div>

                    <!-- NETWORK TAB -->
                    <div v-if="detailTab === 'network'">
                        <div class="flex justify-end mb-4">
                            <button @click="showAddRelModal = true" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fa-solid fa-link mr-1"></i> Add Connection</button>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div v-for="rel in selectedSubject.relationships" :key="rel.id" class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div class="flex items-center">
                                    <div class="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold mr-3">
                                        {{ rel.target_name.charAt(0) }}
                                    </div>
                                    <div>
                                        <p class="font-bold text-slate-900">{{ rel.target_name }}</p>
                                        <p class="text-xs text-slate-500">is {{ selectedSubject.full_name }}'s <span class="font-bold text-indigo-600">{{ rel.relationship_type }}</span></p>
                                    </div>
                                </div>
                                <button @click="viewSubject(rel.subject_b_id)" class="text-sm text-indigo-600 hover:underline">View</button>
                            </div>
                            <div v-if="!selectedSubject.relationships?.length" class="col-span-2 text-center py-8 text-slate-400">No relationships mapped.</div>
                        </div>
                    </div>

                    <!-- MEDIA TAB -->
                    <div v-if="detailTab === 'media'">
                        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
                             <label class="cursor-pointer bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors">
                                <i class="fa-solid fa-cloud-arrow-up text-3xl text-slate-400 mb-2"></i>
                                <span class="font-medium text-slate-600">Upload Evidence Photo</span>
                                <input type="file" @change="uploadPhoto" class="hidden" accept="image/*">
                            </label>
                            <div v-if="uploading" class="mt-4 text-center text-indigo-600"><i class="fa-solid fa-circle-notch fa-spin"></i> Processing encrypted upload...</div>
                        </div>
                         <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div v-for="img in selectedSubject.media" :key="img.object_key" class="group relative aspect-square bg-black rounded-lg overflow-hidden">
                                <img :src="'/api/media/' + img.object_key" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">
                                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 translate-y-full group-hover:translate-y-0 transition-transform">
                                    <p class="text-white text-xs truncate">{{ img.description || 'No caption' }}</p>
                                    <a :href="'/api/media/' + img.object_key" target="_blank" class="text-indigo-300 text-xs hover:text-white mt-1 inline-block">Full Size &rarr;</a>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
            
            <!-- Mobile Nav -->
            <div class="md:hidden bg-slate-900 text-slate-400 flex justify-around py-3 pb-safe shrink-0 border-t border-slate-800">
                <button @click="currentTab = 'dashboard'" :class="{'text-white': currentTab === 'dashboard'}"><i class="fa-solid fa-chart-pie text-xl"></i></button>
                <button @click="currentTab = 'subjects'; fetchSubjects()" :class="{'text-white': currentTab === 'subjects'}"><i class="fa-solid fa-users text-xl"></i></button>
                <button @click="currentTab = 'add'" :class="{'text-white': currentTab === 'add'}"><i class="fa-solid fa-plus-circle text-xl"></i></button>
            </div>
        </main>
    </div>

    <!-- Modals -->
    <!-- Add Data Point Modal -->
    <div v-if="showAddDataModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 class="text-lg font-bold mb-4">Add Detailed Observation</h3>
            <form @submit.prevent="saveDataPoint">
                <div class="space-y-4">
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Category</label>
                        <select v-model="newDataPoint.category" class="w-full border rounded p-2 mt-1">
                            <option>Identity</option>
                            <option>Psychology</option>
                            <option>Social</option>
                            <option>Background</option>
                            <option>Physical</option>
                            <option>Other</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Label (e.g. "Name Origin")</label>
                        <input v-model="newDataPoint.label" required class="w-full border rounded p-2 mt-1">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Value (The Fact)</label>
                        <input v-model="newDataPoint.value" required class="w-full border rounded p-2 mt-1">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Analysis (Your Thoughts)</label>
                        <textarea v-model="newDataPoint.analysis" rows="3" class="w-full border rounded p-2 mt-1" placeholder="Why is this significant?"></textarea>
                    </div>
                </div>
                <div class="mt-6 flex justify-end gap-3">
                    <button type="button" @click="showAddDataModal = false" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save Observation</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Event Modal -->
    <div v-if="showAddEventModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 class="text-lg font-bold mb-4">Log Life Event</h3>
            <form @submit.prevent="saveEvent">
                <div class="space-y-4">
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Event Date</label>
                        <input type="date" v-model="newEvent.eventDate" required class="w-full border rounded p-2 mt-1">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Title</label>
                        <input v-model="newEvent.title" required class="w-full border rounded p-2 mt-1">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Description</label>
                        <textarea v-model="newEvent.description" rows="3" class="w-full border rounded p-2 mt-1"></textarea>
                    </div>
                </div>
                <div class="mt-6 flex justify-end gap-3">
                    <button type="button" @click="showAddEventModal = false" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Log Event</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Relationship Modal -->
    <div v-if="showAddRelModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 class="text-lg font-bold mb-4">Add Connection</h3>
            <form @submit.prevent="saveRelationship">
                <div class="space-y-4">
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Connect With</label>
                        <select v-model="newRel.subjectB" required class="w-full border rounded p-2 mt-1">
                            <option v-for="s in subjects" :value="s.id" :disabled="s.id === selectedSubject.id">{{ s.full_name }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Relationship Type (is a ... of)</label>
                        <input v-model="newRel.type" placeholder="e.g. Mother, Friend, Enemy" required class="w-full border rounded p-2 mt-1">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-500 uppercase">Notes</label>
                        <input v-model="newRel.notes" class="w-full border rounded p-2 mt-1">
                    </div>
                </div>
                <div class="mt-6 flex justify-end gap-3">
                    <button type="button" @click="showAddRelModal = false" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Link Subjects</button>
                </div>
            </form>
        </div>
    </div>

  </div>

  <script>
    const { createApp, ref, reactive, onMounted } = Vue;

    createApp({
      setup() {
        // Core State
        const view = ref('auth');
        const currentTab = ref('dashboard');
        const detailTab = ref('overview');
        const setupMode = ref(false);
        const loading = ref(false);
        const uploading = ref(false);
        const authError = ref('');
        const subjects = ref([]);
        const selectedSubject = ref(null);

        // Modals
        const showAddDataModal = ref(false);
        const showAddEventModal = ref(false);
        const showAddRelModal = ref(false);

        // Forms
        const authForm = reactive({ email: '', password: '' });
        const newSubject = reactive({ fullName: '', age: '', gender: '', occupation: '' }); // Simplified initial creation
        const newDataPoint = reactive({ category: 'Identity', label: '', value: '', analysis: '' });
        const newEvent = reactive({ title: '', description: '', eventDate: '' });
        const newRel = reactive({ subjectB: '', type: '', notes: '' });

        const checkStatus = async () => {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                if (!data.adminExists) setupMode.value = true;
                else {
                    const storedUser = localStorage.getItem('human_admin_id');
                    if (storedUser) {
                        view.value = 'app';
                        fetchSubjects();
                    }
                }
            } catch (e) { console.error(e); }
        };

        const handleAuth = async () => {
            loading.value = true;
            authError.value = '';
            const endpoint = setupMode.value ? '/api/setup-admin' : '/api/login';
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(authForm)
                });
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('human_admin_id', data.id);
                    view.value = 'app';
                    setupMode.value = false;
                    fetchSubjects();
                } else {
                    authError.value = data.error || 'Authentication failed';
                }
            } catch (e) { authError.value = 'Network error occurred'; }
            finally { loading.value = false; }
        };

        const logout = () => {
            localStorage.removeItem('human_admin_id');
            view.value = 'auth';
        };

        const fetchSubjects = async () => {
            const adminId = localStorage.getItem('human_admin_id');
            if (!adminId) return;
            try {
                const res = await fetch('/api/subjects?adminId=' + adminId);
                if (res.ok) subjects.value = await res.json();
            } catch(e) { console.error(e); }
        };

        const viewSubject = async (id) => {
            loading.value = true;
            try {
                const res = await fetch('/api/subjects/' + id);
                if (res.ok) {
                    selectedSubject.value = await res.json();
                    currentTab.value = 'detail';
                    detailTab.value = 'overview';
                }
            } catch(e) { console.error(e); }
            finally { loading.value = false; }
        };

        const createSubject = async () => {
            const adminId = localStorage.getItem('human_admin_id');
            loading.value = true;
            try {
                const payload = { ...newSubject, adminId: parseInt(adminId) };
                const res = await fetch('/api/subjects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    Object.keys(newSubject).forEach(k => newSubject[k] = '');
                    await fetchSubjects();
                    currentTab.value = 'subjects';
                }
            } catch (e) { console.error(e); }
            finally { loading.value = false; }
        };

        // --- Deep Data Functions ---

        const saveDataPoint = async () => {
            if(!selectedSubject.value) return;
            try {
                const res = await fetch('/api/data-point', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...newDataPoint, subjectId: selectedSubject.value.id })
                });
                if(res.ok) {
                    showAddDataModal.value = false;
                    // Reset
                    newDataPoint.label = ''; newDataPoint.value = ''; newDataPoint.analysis = '';
                    await viewSubject(selectedSubject.value.id);
                }
            } catch(e) { console.error(e); }
        };

        const saveEvent = async () => {
             if(!selectedSubject.value) return;
            try {
                const res = await fetch('/api/event', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...newEvent, subjectId: selectedSubject.value.id })
                });
                if(res.ok) {
                    showAddEventModal.value = false;
                    newEvent.title = ''; newEvent.description = '';
                    await viewSubject(selectedSubject.value.id);
                }
            } catch(e) { console.error(e); }
        };

        const saveRelationship = async () => {
             if(!selectedSubject.value) return;
            try {
                const res = await fetch('/api/relationship', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...newRel, subjectA: selectedSubject.value.id })
                });
                if(res.ok) {
                    showAddRelModal.value = false;
                    newRel.subjectB = ''; newRel.type = ''; newRel.notes = '';
                    await viewSubject(selectedSubject.value.id);
                }
            } catch(e) { console.error(e); }
        };

        const uploadPhoto = async (e) => {
            const file = e.target.files[0];
            if (!file || !selectedSubject.value) return;
            uploading.value = true;
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                try {
                    const res = await fetch('/api/upload-photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            subjectId: selectedSubject.value.id,
                            filename: file.name,
                            contentType: file.type,
                            data: base64,
                            description: 'Research Evidence' 
                        })
                    });
                    if (res.ok) await viewSubject(selectedSubject.value.id);
                } catch(e) { console.error(e); }
                finally { uploading.value = false; }
            };
        };

        onMounted(() => {
            checkStatus();
        });

        return {
            view, currentTab, detailTab, setupMode, loading, uploading, authForm, authError,
            subjects, selectedSubject, newSubject, newDataPoint, newEvent, newRel,
            showAddDataModal, showAddEventModal, showAddRelModal,
            handleAuth, logout, fetchSubjects, viewSubject, createSubject, uploadPhoto,
            saveDataPoint, saveEvent, saveRelationship
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// --- Route Handlers ---

async function handleStatus(db) {
  const exists = await adminExists(db);
  return Response.json({ adminExists: exists });
}

async function handleLogin(request, db) {
    const { email, password } = await request.json();
    if (!email || !password) return Response.json({ error: 'Missing credentials' }, { status: 400 });

    const admin = await verifyAdmin(db, email, password);
    if (admin) {
        return Response.json({ id: admin.id, email: admin.email });
    } else {
        return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }
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
  // Auto-login logic for frontend convenience: return the ID of the new admin
  const admin = await verifyAdmin(db, email, password); 
  return Response.json({ success: true, id: admin.id });
}

async function handleGetSubjects(request, db) {
    const url = new URL(request.url);
    const adminId = url.searchParams.get('adminId');
    if (!adminId) return Response.json({ error: 'Admin ID required' }, { status: 401 });
    
    const results = await getSubjects(db, adminId);
    return Response.json(results);
}

async function handleGetSubjectDetail(request, db, id) {
    const result = await getSubjectDetail(db, id);
    if (!result) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(result);
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
    age: payload.age,
    gender: payload.gender,
    occupation: payload.occupation,
    // Other fields can be updated later via data points, 
    // but we support basic init here
    religion: payload.religion || null,
    location: payload.location || null,
  });

  return Response.json({ id: result.id, createdAt: result.createdAt });
}

// --- New Deep Data Handlers ---

async function handleAddDataPoint(request, db) {
    const payload = await request.json();
    if (!payload.subjectId || !payload.label) return Response.json({ error: 'Missing data' }, { status: 400 });
    await addDataPoint(db, payload);
    return Response.json({ success: true });
}

async function handleAddEvent(request, db) {
    const payload = await request.json();
    if (!payload.subjectId || !payload.title) return Response.json({ error: 'Missing data' }, { status: 400 });
    await addEvent(db, payload);
    return Response.json({ success: true });
}

async function handleAddRelationship(request, db) {
    const payload = await request.json();
    if (!payload.subjectA || !payload.subjectB || !payload.type) return Response.json({ error: 'Missing data' }, { status: 400 });
    await addRelationship(db, payload);
    return Response.json({ success: true });
}

async function handleUploadPhoto(request, db, bucket) {
  const payload = await request.json();
  const subjectId = Number(payload.subjectId);
  const rawName = (payload.filename || '').trim();
  const contentType = (payload.contentType || '').trim();
  const base64 = payload.data;
  const description = payload.description || '';

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
  await recordMedia(db, subjectId, key, contentType, description);

  return Response.json({ key });
}

async function handleServeMedia(request, bucket, key) {
    const object = await bucket.get(key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
}

// --- Main Worker Entry ---

export default {
  async fetch(request, env, ctx) {
    await env.DB.exec('PRAGMA foreign_keys = ON;');
    await ensureSchema(env.DB);

    const url = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
        if (request.method === 'GET' && pathname === '/') {
            return serveHome(request, env, ctx);
        }

        if (pathname.startsWith('/api/')) {
            // API Router
            if (request.method === 'GET' && pathname === '/api/status') {
                return handleStatus(env.DB);
            }
            if (request.method === 'POST' && pathname === '/api/login') {
                return handleLogin(request, env.DB);
            }
            if (request.method === 'POST' && pathname === '/api/setup-admin') {
                return handleSetupAdmin(request, env.DB);
            }
            if (request.method === 'GET' && pathname === '/api/subjects') {
                if (pathname.match(/^\/api\/subjects\/\d+$/)) {
                     const id = pathname.split('/').pop();
                     return handleGetSubjectDetail(request, env.DB, id);
                }
                return handleGetSubjects(request, env.DB);
            }
            if (request.method === 'POST' && pathname === '/api/subjects') {
                return handleCreateSubject(request, env.DB);
            }
            if (request.method === 'POST' && pathname === '/api/upload-photo') {
                return handleUploadPhoto(request, env.DB, env.BUCKET);
            }
            if (request.method === 'GET' && pathname.startsWith('/api/media/')) {
                const key = pathname.replace('/api/media/', '');
                return handleServeMedia(request, env.BUCKET, key);
            }
            
            // New Endpoints
            if (request.method === 'POST' && pathname === '/api/data-point') {
                return handleAddDataPoint(request, env.DB);
            }
            if (request.method === 'POST' && pathname === '/api/event') {
                return handleAddEvent(request, env.DB);
            }
            if (request.method === 'POST' && pathname === '/api/relationship') {
                return handleAddRelationship(request, env.DB);
            }
        }

        return new Response('Not found', { status: 404 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: {'Content-Type': 'application/json'} });
    }
  },
};
