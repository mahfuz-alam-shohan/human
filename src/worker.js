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
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'upload';
}

// --- Database Operations ---

async function safeMigrate(db) {
    // This function attempts to add columns to existing tables if they are missing
    // This prevents "no such column" errors if you are updating an existing app
    const migrations = [
        "ALTER TABLE subjects ADD COLUMN dob TEXT",
        "ALTER TABLE subjects ADD COLUMN nationality TEXT",
        "ALTER TABLE subjects ADD COLUMN education TEXT"
    ];

    for (const query of migrations) {
        try {
            await db.prepare(query).run();
        } catch (e) {
            // Ignore error if column already exists
        }
    }
}

async function ensureSchema(db) {
  // 1. Admins
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  // 2. Subjects (Added dob, nationality, education)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES admins(id),
      full_name TEXT NOT NULL,
      dob TEXT, 
      age INTEGER,
      gender TEXT,
      occupation TEXT,
      nationality TEXT,
      education TEXT,
      religion TEXT,
      location TEXT,
      contact TEXT,
      habits TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  // 3. Data Points (The "Objects" the kid plays with - flexible data)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subject_data_points (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT,
      analysis TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  // 4. Life Events
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subject_events (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  // 5. Relationships
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subject_relationships (
      id INTEGER PRIMARY KEY,
      subject_a_id INTEGER NOT NULL REFERENCES subjects(id),
      subject_b_id INTEGER NOT NULL REFERENCES subjects(id),
      relationship_type TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  // 6. Media
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subject_media (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      object_key TEXT NOT NULL UNIQUE,
      content_type TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  // Run migrations for existing tables
  await safeMigrate(db);
}

async function adminExists(db) {
  const stmt = db.prepare('SELECT COUNT(id) AS count FROM admins');
  const result = await stmt.first();
  return (result?.count ?? 0) > 0;
}

async function verifyAdmin(db, email, password) {
    const stmt = db.prepare('SELECT id, password_hash FROM admins WHERE email = ?');
    const user = await stmt.bind(email).first();
    if (!user) return null;
    const hashedInput = await hashPassword(password);
    return hashedInput === user.password_hash ? { id: user.id, email: email } : null;
}

async function createAdmin(db, email, password) {
  const hashed = await hashPassword(password);
  await db.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?1, ?2, ?3)')
    .bind(email, hashed, isoTimestamp()).run();
}

async function getSubjects(db, adminId) {
    const { results } = await db.prepare(`
        SELECT id, full_name, occupation, age, dob, location, created_at 
        FROM subjects WHERE admin_id = ? ORDER BY updated_at DESC
    `).bind(adminId).all();
    return results;
}

async function getSubjectDetail(db, subjectId) {
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(subjectId).first();
    if (!subject) return null;

    const { results: media } = await db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
    const { results: dataPoints } = await db.prepare('SELECT * FROM subject_data_points WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
    const { results: events } = await db.prepare('SELECT * FROM subject_events WHERE subject_id = ? ORDER BY event_date DESC').bind(subjectId).all();
    const { results: relationships } = await db.prepare(`
        SELECT r.*, s.full_name as target_name 
        FROM subject_relationships r JOIN subjects s ON r.subject_b_id = s.id 
        WHERE r.subject_a_id = ?
    `).bind(subjectId).all();

    return { ...subject, media, dataPoints, events, relationships };
}

async function addSubject(db, p) {
  const now = isoTimestamp();
  const res = await db.prepare(`
    INSERT INTO subjects (admin_id, full_name, dob, age, gender, occupation, nationality, education, religion, location, contact, habits, notes, created_at, updated_at) 
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
  `).bind(
      p.adminId, p.fullName, p.dob || null, p.age || null, p.gender || null, p.occupation || null, 
      p.nationality || null, p.education || null, p.religion || null, p.location || null, 
      p.contact || null, p.habits || null, p.notes || null, now, now
  ).run();
  return { id: res.meta.last_row_id };
}

// --- Frontend Application ---

async function serveHome(request, env) {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
  <title>Human Observation Workspace</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }
    /* Custom Scrollbar for "Feed" feel */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .glass-panel { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(8px); }
  </style>
</head>
<body class="h-full text-slate-800 antialiased selection:bg-indigo-100 selection:text-indigo-700">
  <div id="app" class="h-full flex flex-col">
    
    <!-- Loading / Wakeup Overlay -->
    <div v-if="loading && !initialLoadComplete" class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <div class="flex items-center space-x-3 text-indigo-600 mb-4">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl"></i>
        </div>
        <h2 class="text-xl font-bold text-slate-800">Establishing Secure Connection...</h2>
        <p class="text-slate-500 mt-2 text-sm">Waking up research database</p>
    </div>

    <!-- Auth View -->
    <div v-if="view === 'auth'" class="flex-1 flex flex-col justify-center items-center p-6 bg-slate-900 text-white relative overflow-hidden">
        <!-- Decoration -->
        <div class="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
            <i class="fa-solid fa-dna absolute top-10 left-10 text-9xl text-indigo-500 animate-pulse"></i>
            <i class="fa-solid fa-fingerprint absolute bottom-10 right-10 text-9xl text-indigo-500"></i>
        </div>

        <div class="w-full max-w-md space-y-8 z-10">
            <div class="text-center">
                <div class="mx-auto h-20 w-20 bg-indigo-500/20 border-2 border-indigo-500 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                    <i class="fa-solid fa-eye text-4xl text-indigo-400"></i>
                </div>
                <h2 class="text-3xl font-bold tracking-tight">{{ setupMode ? 'Initialize Protocol' : 'Researcher Identity' }}</h2>
                <p class="mt-2 text-slate-400">Advanced Human Behavior Database</p>
            </div>
            <form @submit.prevent="handleAuth" class="mt-8 space-y-6 bg-slate-800/50 backdrop-blur-xl p-8 rounded-xl border border-slate-700/50 shadow-2xl">
                <div class="space-y-4">
                    <div>
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Access ID</label>
                        <input v-model="authForm.email" type="email" placeholder="researcher@lab.com" required class="block w-full rounded-lg bg-slate-900/80 border-slate-600 text-white p-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Passcode</label>
                        <input v-model="authForm.password" type="password" placeholder="••••••••" required class="block w-full rounded-lg bg-slate-900/80 border-slate-600 text-white p-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
                    </div>
                </div>
                <div v-if="authError" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center font-medium">{{ authError }}</div>
                <button type="submit" :disabled="loading" class="w-full rounded-lg bg-indigo-600 py-3.5 font-bold text-white hover:bg-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-lg shadow-indigo-600/20">
                    {{ loading ? 'Verifying Credentials...' : (setupMode ? 'Initialize System' : 'Authenticate') }}
                </button>
            </form>
        </div>
    </div>

    <!-- Main Workspace -->
    <div v-else class="flex h-full overflow-hidden bg-slate-100">
        <!-- Sidebar Navigation -->
        <aside class="hidden md:flex md:w-20 lg:w-64 md:flex-col bg-white border-r border-slate-200 z-20">
            <div class="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-100">
                <i class="fa-solid fa-layer-group text-indigo-600 text-2xl lg:mr-3"></i>
                <span class="hidden lg:block font-extrabold text-slate-800 tracking-tight text-lg">OBSERVE<span class="text-indigo-600">.OS</span></span>
            </div>
            <nav class="flex-1 p-4 space-y-2">
                <a @click="currentTab = 'dashboard'" :class="currentTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'" class="group flex items-center px-3 py-3 rounded-xl cursor-pointer transition-all">
                    <i class="fa-solid fa-chart-pie w-6 text-center text-lg"></i>
                    <span class="hidden lg:block ml-3 font-medium">Overview</span>
                </a>
                <a @click="currentTab = 'subjects'; fetchSubjects()" :class="currentTab === 'subjects' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'" class="group flex items-center px-3 py-3 rounded-xl cursor-pointer transition-all">
                    <i class="fa-solid fa-users w-6 text-center text-lg"></i>
                    <span class="hidden lg:block ml-3 font-medium">Subjects</span>
                </a>
                <a @click="currentTab = 'add'" :class="currentTab === 'add' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'" class="group flex items-center px-3 py-3 rounded-xl cursor-pointer transition-all">
                    <i class="fa-solid fa-user-plus w-6 text-center text-lg"></i>
                    <span class="hidden lg:block ml-3 font-medium">Add New</span>
                </a>
            </nav>
            <div class="p-4 border-t border-slate-100">
                <button @click="logout" class="flex items-center justify-center lg:justify-start w-full px-3 py-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                    <i class="fa-solid fa-arrow-right-from-bracket w-6 text-center"></i>
                    <span class="hidden lg:block ml-3 font-medium">Logout</span>
                </button>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <!-- Mobile Header -->
            <div class="md:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 h-16 shrink-0 z-30">
                <span class="font-bold text-slate-800"><i class="fa-solid fa-layer-group text-indigo-600 mr-2"></i> OBSERVE.OS</span>
                <button @click="logout" class="text-slate-400"><i class="fa-solid fa-power-off"></i></button>
            </div>

            <div class="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth pb-24 md:pb-8">
                
                <!-- Dashboard -->
                <div v-if="currentTab === 'dashboard'" class="max-w-5xl mx-auto">
                    <h1 class="text-3xl font-extrabold text-slate-900 mb-2">Research Overview</h1>
                    <p class="text-slate-500 mb-8">System status and recent activity metrics.</p>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-500/20">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="text-indigo-100 font-medium text-sm">Total Subjects</p>
                                    <h3 class="text-4xl font-bold mt-1">{{ subjects.length }}</h3>
                                </div>
                                <div class="bg-white/20 p-2 rounded-lg"><i class="fa-solid fa-users text-xl"></i></div>
                            </div>
                            <div class="mt-4 text-xs bg-white/10 inline-block px-2 py-1 rounded">Active Database</div>
                        </div>
                        
                        <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="text-slate-500 font-medium text-sm">System Status</p>
                                    <h3 class="text-2xl font-bold mt-1 text-emerald-600">Operational</h3>
                                </div>
                                <div class="bg-emerald-50 text-emerald-600 p-2 rounded-lg"><i class="fa-solid fa-server text-xl"></i></div>
                            </div>
                            <p class="text-xs text-slate-400 mt-4">Database Connection: Stable</p>
                        </div>
                    </div>
                </div>

                <!-- Subjects List -->
                <div v-if="currentTab === 'subjects'" class="max-w-7xl mx-auto">
                    <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                        <div>
                            <h1 class="text-3xl font-extrabold text-slate-900">Directory</h1>
                            <p class="text-slate-500">Access and manage subject profiles.</p>
                        </div>
                        <button @click="fetchSubjects" class="bg-white border border-slate-300 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 px-4 py-2 rounded-lg font-medium transition-all shadow-sm">
                            <i class="fa-solid fa-rotate-right mr-2"></i> Refresh List
                        </button>
                    </div>

                    <div v-if="subjects.length === 0 && !loading" class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                        <div class="bg-slate-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <i class="fa-solid fa-user-plus text-3xl"></i>
                        </div>
                        <h3 class="text-lg font-bold text-slate-900">No subjects found</h3>
                        <p class="text-slate-500 mb-6">Start your research by adding a person.</p>
                        <button @click="currentTab = 'add'" class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700">Add First Subject</button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div v-for="s in subjects" :key="s.id" @click="viewSubject(s.id)" class="bg-white group hover:-translate-y-1 hover:shadow-xl transition-all duration-300 cursor-pointer rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <div class="p-6">
                                <div class="flex items-start justify-between mb-4">
                                    <div class="flex items-center space-x-3">
                                        <div class="h-12 w-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-lg font-bold text-slate-600 group-hover:from-indigo-100 group-hover:to-purple-100 group-hover:text-indigo-600 transition-colors shadow-inner">
                                            {{ s.full_name.charAt(0) }}
                                        </div>
                                        <div>
                                            <h3 class="text-lg font-bold text-slate-900 leading-tight">{{ s.full_name }}</h3>
                                            <p class="text-xs text-slate-500 font-mono mt-0.5">ID: #{{ String(s.id).padStart(4, '0') }}</p>
                                        </div>
                                    </div>
                                    <span class="px-2 py-1 bg-slate-50 rounded-md text-xs font-medium text-slate-500 border border-slate-100">{{ s.occupation || 'N/A' }}</span>
                                </div>
                                <div class="space-y-2 mt-4">
                                    <div class="flex items-center text-sm text-slate-600">
                                        <i class="fa-solid fa-cake-candles w-5 text-slate-400"></i>
                                        <span>{{ calculateAge(s.dob, s.age) }}</span>
                                    </div>
                                    <div class="flex items-center text-sm text-slate-600">
                                        <i class="fa-solid fa-location-dot w-5 text-slate-400"></i>
                                        <span>{{ s.location || 'Unknown Location' }}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-slate-50 px-6 py-3 border-t border-slate-100 text-xs font-medium text-slate-500 flex justify-between items-center group-hover:bg-indigo-50/50 transition-colors">
                                <span>Updated {{ new Date(s.created_at).toLocaleDateString() }}</span>
                                <i class="fa-solid fa-arrow-right text-slate-300 group-hover:text-indigo-500"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Add Subject (Advanced Form) -->
                <div v-if="currentTab === 'add'" class="max-w-3xl mx-auto">
                    <h1 class="text-2xl font-extrabold text-slate-900 mb-6">Initialize New Subject</h1>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="bg-slate-50 px-8 py-4 border-b border-slate-200 flex items-center">
                            <i class="fa-solid fa-id-card text-indigo-500 mr-3"></i>
                            <h3 class="font-bold text-slate-700">Basic Identity Profile</h3>
                        </div>
                        <form @submit.prevent="createSubject" class="p-8 space-y-6">
                            <!-- Name -->
                            <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
                                <input v-model="newSubject.fullName" type="text" required class="w-full rounded-xl border-slate-300 bg-white border p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow" placeholder="e.g. John Doe">
                            </div>

                            <!-- Age / DOB Section -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                                <div>
                                    <label class="block text-sm font-bold text-slate-700 mb-2">Date of Birth (Recommended)</label>
                                    <input v-model="newSubject.dob" type="date" class="w-full rounded-xl border-slate-300 bg-white border p-3 focus:ring-indigo-500">
                                    <p class="text-xs text-slate-500 mt-1">Allows auto-calculation of age over time.</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-bold text-slate-700 mb-2">Or Manual Age</label>
                                    <input v-model="newSubject.age" type="number" :disabled="!!newSubject.dob" class="w-full rounded-xl border-slate-300 bg-white border p-3 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400">
                                    <p class="text-xs text-slate-500 mt-1">If DOB is unknown.</p>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label class="block text-sm font-bold text-slate-700 mb-2">Gender</label>
                                    <select v-model="newSubject.gender" class="w-full rounded-xl border-slate-300 bg-white border p-3 focus:ring-indigo-500">
                                        <option value="">Select...</option>
                                        <option>Male</option>
                                        <option>Female</option>
                                        <option>Non-binary</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-bold text-slate-700 mb-2">Nationality</label>
                                    <input v-model="newSubject.nationality" type="text" class="w-full rounded-xl border-slate-300 bg-white border p-3 focus:ring-indigo-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-bold text-slate-700 mb-2">Occupation</label>
                                    <input v-model="newSubject.occupation" type="text" class="w-full rounded-xl border-slate-300 bg-white border p-3 focus:ring-indigo-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-bold text-slate-700 mb-2">Religion</label>
                                    <input v-model="newSubject.religion" type="text" class="w-full rounded-xl border-slate-300 bg-white border p-3 focus:ring-indigo-500">
                                </div>
                            </div>
                            
                            <div class="pt-6 border-t border-slate-100 flex justify-end">
                                <button type="submit" :disabled="loading" class="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                                    {{ loading ? 'Processing...' : 'Create Profile' }}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- DETAIL WORKSPACE (The "Kid Playing" Zone) -->
                <div v-if="currentTab === 'detail' && selectedSubject" class="max-w-7xl mx-auto pb-20">
                    <!-- Header Profile -->
                    <div class="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 mb-8 relative overflow-hidden">
                        <div class="absolute top-0 right-0 p-4 opacity-10"><i class="fa-solid fa-fingerprint text-9xl text-indigo-900"></i></div>
                        
                        <div class="relative z-10">
                            <button @click="currentTab = 'subjects'" class="text-sm font-bold text-slate-400 hover:text-indigo-600 mb-4 flex items-center transition-colors"><i class="fa-solid fa-arrow-left mr-2"></i> RETURN TO DIRECTORY</button>
                            
                            <div class="flex flex-col md:flex-row gap-6 md:items-start">
                                <div class="h-24 w-24 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-3xl font-bold shadow-inner">
                                    {{ selectedSubject.full_name.charAt(0) }}
                                </div>
                                <div class="flex-1">
                                    <h1 class="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{{ selectedSubject.full_name }}</h1>
                                    <div class="flex flex-wrap gap-3 mt-3">
                                        <span class="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold border border-slate-200"><i class="fa-solid fa-hourglass-half mr-2 text-indigo-500"></i>{{ calculateAge(selectedSubject.dob, selectedSubject.age) }}</span>
                                        <span v-if="selectedSubject.occupation" class="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200">{{ selectedSubject.occupation }}</span>
                                        <span v-if="selectedSubject.location" class="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200"><i class="fa-solid fa-location-dot mr-1 text-red-400"></i> {{ selectedSubject.location }}</span>
                                    </div>
                                    <!-- Core Info Grid -->
                                    <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div v-if="selectedSubject.dob"><span class="text-slate-400 block text-xs uppercase font-bold">Born</span> {{ new Date(selectedSubject.dob).toLocaleDateString() }}</div>
                                        <div v-if="selectedSubject.nationality"><span class="text-slate-400 block text-xs uppercase font-bold">Nationality</span> {{ selectedSubject.nationality }}</div>
                                        <div v-if="selectedSubject.religion"><span class="text-slate-400 block text-xs uppercase font-bold">Religion</span> {{ selectedSubject.religion }}</div>
                                        <div v-if="selectedSubject.contact"><span class="text-slate-400 block text-xs uppercase font-bold">Contact</span> {{ selectedSubject.contact }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- THE WORKSPACE (Feed) -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        
                        <!-- Left: Interaction Tools -->
                        <div class="lg:col-span-1 space-y-6">
                            <!-- Quick Add Menu -->
                            <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 sticky top-4">
                                <h3 class="text-sm font-extrabold text-slate-400 uppercase tracking-widest mb-4">Add Observation</h3>
                                <div class="grid grid-cols-2 gap-3">
                                    <button @click="openModal('data')" class="p-4 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:shadow-md transition-all text-left flex flex-col justify-between h-24 border border-indigo-100">
                                        <i class="fa-solid fa-lightbulb text-2xl mb-2"></i>
                                        <span class="font-bold text-sm">Deep Detail</span>
                                    </button>
                                    <button @click="openModal('media')" class="p-4 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:shadow-md transition-all text-left flex flex-col justify-between h-24 border border-emerald-100">
                                        <i class="fa-solid fa-camera text-2xl mb-2"></i>
                                        <span class="font-bold text-sm">Media</span>
                                    </button>
                                    <button @click="openModal('event')" class="p-4 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 hover:shadow-md transition-all text-left flex flex-col justify-between h-24 border border-amber-100">
                                        <i class="fa-solid fa-calendar-check text-2xl mb-2"></i>
                                        <span class="font-bold text-sm">Life Event</span>
                                    </button>
                                    <button @click="openModal('rel')" class="p-4 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 hover:shadow-md transition-all text-left flex flex-col justify-between h-24 border border-rose-100">
                                        <i class="fa-solid fa-link text-2xl mb-2"></i>
                                        <span class="font-bold text-sm">Relation</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Right: The Stream/Feed -->
                        <div class="lg:col-span-2 space-y-6">
                            <h3 class="text-sm font-extrabold text-slate-400 uppercase tracking-widest pl-2">Observation Stream</h3>

                            <!-- Empty State -->
                            <div v-if="feedItems.length === 0" class="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                                <p class="text-slate-400 italic">No details added yet. Use the tools on the left.</p>
                            </div>

                            <!-- Feed Items -->
                            <div v-for="item in feedItems" :key="item.uniqueId" class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 relative group transition-all hover:shadow-md">
                                
                                <!-- Decorative Line -->
                                <div :class="{
                                    'bg-indigo-500': item.type === 'data',
                                    'bg-emerald-500': item.type === 'media',
                                    'bg-amber-500': item.type === 'event',
                                    'bg-rose-500': item.type === 'relationship'
                                }" class="absolute left-0 top-6 bottom-6 w-1 rounded-r-full"></div>

                                <div class="pl-4">
                                    <!-- Header -->
                                    <div class="flex justify-between items-start mb-2">
                                        <div class="flex items-center gap-2">
                                            <span v-if="item.type === 'data'" class="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700 uppercase">{{ item.category }}</span>
                                            <span v-if="item.type === 'event'" class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 uppercase">Event • {{ item.event_date }}</span>
                                            <span v-if="item.type === 'media'" class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700 uppercase">Evidence</span>
                                            <span v-if="item.type === 'relationship'" class="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 uppercase">Connection</span>
                                            
                                            <span class="text-xs text-slate-400">{{ new Date(item.created_at).toLocaleString() }}</span>
                                        </div>
                                    </div>

                                    <!-- Content Body -->
                                    <div class="text-slate-800">
                                        <!-- Data Point -->
                                        <div v-if="item.type === 'data'">
                                            <h4 class="font-bold text-lg">{{ item.label }}</h4>
                                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono text-sm my-2 text-indigo-900">{{ item.value }}</div>
                                            <p v-if="item.analysis" class="text-slate-600 italic text-sm border-l-2 border-indigo-200 pl-3 mt-2">"{{ item.analysis }}"</p>
                                        </div>

                                        <!-- Event -->
                                        <div v-if="item.type === 'event'">
                                            <h4 class="font-bold text-lg">{{ item.title }}</h4>
                                            <p class="text-slate-600 mt-1">{{ item.description }}</p>
                                        </div>

                                        <!-- Media -->
                                        <div v-if="item.type === 'media'">
                                            <div class="rounded-xl overflow-hidden bg-black max-w-sm mt-2 shadow-lg">
                                                <img :src="'/api/media/' + item.object_key" class="w-full h-auto">
                                            </div>
                                            <p class="text-sm text-slate-500 mt-2">{{ item.description }}</p>
                                        </div>

                                        <!-- Relationship -->
                                        <div v-if="item.type === 'relationship'">
                                            <p class="text-lg">
                                                Connected with <strong class="text-slate-900">{{ item.target_name }}</strong> as <span class="text-rose-600 font-bold underline decoration-rose-200 decoration-2 underline-offset-2">{{ item.relationship_type }}</span>
                                            </p>
                                            <p v-if="item.notes" class="text-sm text-slate-500 mt-1">{{ item.notes }}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
            
            <!-- Mobile Bottom Nav -->
            <div class="md:hidden bg-white border-t border-slate-200 flex justify-around py-3 pb-safe shrink-0 text-xs font-bold text-slate-400 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                <button @click="currentTab = 'dashboard'" :class="{'text-indigo-600': currentTab === 'dashboard'}" class="flex flex-col items-center">
                    <i class="fa-solid fa-chart-pie text-xl mb-1"></i> Dashboard
                </button>
                <button @click="currentTab = 'subjects'; fetchSubjects()" :class="{'text-indigo-600': currentTab === 'subjects'}" class="flex flex-col items-center">
                    <i class="fa-solid fa-users text-xl mb-1"></i> Directory
                </button>
                <button @click="currentTab = 'add'" :class="{'text-indigo-600': currentTab === 'add'}" class="flex flex-col items-center">
                    <i class="fa-solid fa-circle-plus text-xl mb-1"></i> New
                </button>
            </div>
        </main>
    </div>

    <!-- Modals Wrapper -->
    <div v-if="activeModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in-up">
            
            <!-- DATA MODAL -->
            <div v-if="activeModal === 'data'" class="p-6">
                <h3 class="text-lg font-extrabold text-slate-900 mb-4">Add Deep Detail</h3>
                <form @submit.prevent="submitData">
                    <div class="space-y-4">
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Category</label>
                            <select v-model="forms.data.category" class="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50">
                                <option>Identity</option>
                                <option>Psychology</option>
                                <option>Physical</option>
                                <option>Social</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Attribute Name</label>
                            <input v-model="forms.data.label" placeholder="e.g. Eye Color, Origin of Name" required class="w-full border-slate-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Value / Fact</label>
                            <input v-model="forms.data.value" placeholder="The factual detail" required class="w-full border-slate-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Analysis (Optional)</label>
                            <textarea v-model="forms.data.analysis" placeholder="Your psychological interpretation..." class="w-full border-slate-300 rounded-lg p-2.5 h-20"></textarea>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end gap-3">
                        <button type="button" @click="activeModal = null" class="px-4 py-2 text-slate-500 font-bold">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Save</button>
                    </div>
                </form>
            </div>

            <!-- MEDIA MODAL -->
            <div v-if="activeModal === 'media'" class="p-6">
                <h3 class="text-lg font-extrabold text-slate-900 mb-4">Upload Evidence</h3>
                <label class="block w-full border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <i class="fa-solid fa-cloud-arrow-up text-3xl text-slate-400 mb-2"></i>
                    <p class="text-slate-500 font-medium">Click to select photo</p>
                    <input type="file" @change="handleFileUpload" accept="image/*" class="hidden">
                </label>
                <div v-if="forms.media.file" class="mt-4 p-3 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold flex items-center">
                    <i class="fa-solid fa-check-circle mr-2"></i> {{ forms.media.file.name }}
                </div>
                <div class="mt-4">
                    <label class="text-xs font-bold text-slate-500 uppercase">Description</label>
                    <input v-model="forms.media.description" class="w-full border-slate-300 rounded-lg p-2.5 mt-1">
                </div>
                 <div class="mt-6 flex justify-end gap-3">
                    <button type="button" @click="activeModal = null" class="px-4 py-2 text-slate-500 font-bold">Cancel</button>
                    <button type="button" @click="submitMedia" :disabled="!forms.media.file || uploading" class="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50">
                        {{ uploading ? 'Uploading...' : 'Upload' }}
                    </button>
                </div>
            </div>

            <!-- EVENT MODAL -->
            <div v-if="activeModal === 'event'" class="p-6">
                <h3 class="text-lg font-extrabold text-slate-900 mb-4">Log Life Event</h3>
                <form @submit.prevent="submitEvent">
                    <div class="space-y-4">
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Date</label>
                            <input type="date" v-model="forms.event.eventDate" required class="w-full border-slate-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Event Title</label>
                            <input v-model="forms.event.title" placeholder="e.g. Started School" required class="w-full border-slate-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Description</label>
                            <textarea v-model="forms.event.description" class="w-full border-slate-300 rounded-lg p-2.5 h-24"></textarea>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end gap-3">
                        <button type="button" @click="activeModal = null" class="px-4 py-2 text-slate-500 font-bold">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700">Log Event</button>
                    </div>
                </form>
            </div>

            <!-- REL MODAL -->
             <div v-if="activeModal === 'rel'" class="p-6">
                <h3 class="text-lg font-extrabold text-slate-900 mb-4">Add Connection</h3>
                <form @submit.prevent="submitRel">
                    <div class="space-y-4">
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Connect With</label>
                            <select v-model="forms.rel.subjectB" required class="w-full border-slate-300 rounded-lg p-2.5">
                                <option v-for="s in subjects" :value="s.id" :disabled="s.id === selectedSubject.id">{{ s.full_name }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Is a ... of {{ selectedSubject.full_name }}</label>
                            <input v-model="forms.rel.type" placeholder="e.g. Mother, Friend" required class="w-full border-slate-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase">Notes</label>
                            <input v-model="forms.rel.notes" class="w-full border-slate-300 rounded-lg p-2.5">
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end gap-3">
                        <button type="button" @click="activeModal = null" class="px-4 py-2 text-slate-500 font-bold">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700">Connect</button>
                    </div>
                </form>
            </div>

        </div>
    </div>

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted } = Vue;

    createApp({
      setup() {
        const view = ref('auth');
        const currentTab = ref('dashboard');
        const setupMode = ref(false);
        const loading = ref(true);
        const initialLoadComplete = ref(false);
        const uploading = ref(false);
        const authError = ref('');
        const subjects = ref([]);
        const selectedSubject = ref(null);
        const activeModal = ref(null);

        // Forms
        const authForm = reactive({ email: '', password: '' });
        const newSubject = reactive({ fullName: '', dob: '', age: '', gender: '', occupation: '', nationality: '', education: '', religion: '', location: '', contact: '' });
        
        const forms = reactive({
            data: { category: 'Identity', label: '', value: '', analysis: '' },
            event: { title: '', description: '', eventDate: '' },
            rel: { subjectB: '', type: '', notes: '' },
            media: { file: null, description: '' }
        });

        // Feed Logic
        const feedItems = computed(() => {
            if (!selectedSubject.value) return [];
            const items = [];
            if(selectedSubject.value.dataPoints) items.push(...selectedSubject.value.dataPoints.map(i => ({...i, type: 'data', uniqueId: 'd'+i.id})));
            if(selectedSubject.value.events) items.push(...selectedSubject.value.events.map(i => ({...i, type: 'event', uniqueId: 'e'+i.id})));
            if(selectedSubject.value.media) items.push(...selectedSubject.value.media.map(i => ({...i, type: 'media', uniqueId: 'm'+i.id})));
            if(selectedSubject.value.relationships) items.push(...selectedSubject.value.relationships.map(i => ({...i, type: 'relationship', uniqueId: 'r'+i.id})));
            return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        });

        // API Wrapper
        const api = async (url, options = {}) => {
            try {
                const res = await fetch(url, options);
                
                // Safe JSON parsing: Check if response is actually JSON
                const contentType = res.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const text = await res.text();
                    // If it's HTML (likely an error page), throw a clear error
                    if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
                        throw new Error("Backend connection failed (Database inactive or crashing). Please check worker logs.");
                    }
                    // Fallback for other non-JSON text
                    throw new Error(text || "Unknown server error");
                }

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Server error');
                return data;
            } catch (e) {
                console.error(e);
                alert(e.message); // Show error explicitly
                throw e;
            }
        };

        const checkStatus = async () => {
            loading.value = true;
            try {
                // "Wake up" call
                const data = await api('/api/status');
                if (!data.adminExists) setupMode.value = true;
                else {
                    const storedUser = localStorage.getItem('human_admin_id');
                    if (storedUser) {
                        await fetchSubjects(storedUser); // Verify login by fetching data
                        view.value = 'app';
                    }
                }
            } catch (e) {
                // Keep loading off if error, user sees alert from api()
            } finally {
                loading.value = false;
                initialLoadComplete.value = true;
            }
        };

        const handleAuth = async () => {
            loading.value = true;
            authError.value = '';
            const endpoint = setupMode.value ? '/api/setup-admin' : '/api/login';
            try {
                const data = await api(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(authForm)
                });
                localStorage.setItem('human_admin_id', data.id);
                view.value = 'app';
                setupMode.value = false;
                await fetchSubjects();
            } catch (e) {
                authError.value = e.message;
            } finally {
                loading.value = false;
            }
        };

        const logout = () => {
            localStorage.removeItem('human_admin_id');
            view.value = 'auth';
            subjects.value = [];
        };

        const fetchSubjects = async (idOverride) => {
            const adminId = idOverride || localStorage.getItem('human_admin_id');
            if (!adminId) return;
            try {
                const data = await api('/api/subjects?adminId=' + adminId);
                subjects.value = data;
            } catch(e) {}
        };

        const calculateAge = (dob, manualAge) => {
            if (!dob) return manualAge ? manualAge + ' years' : 'Age Unknown';
            const birthDate = new Date(dob);
            const today = new Date();
            let years = today.getFullYear() - birthDate.getFullYear();
            let months = today.getMonth() - birthDate.getMonth();
            if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
                years--;
                months += 12;
            }
            return \`\${years}y \${months}m\`;
        };

        const createSubject = async () => {
            const adminId = localStorage.getItem('human_admin_id');
            loading.value = true;
            try {
                await api('/api/subjects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...newSubject, adminId: parseInt(adminId) })
                });
                Object.keys(newSubject).forEach(k => newSubject[k] = '');
                await fetchSubjects();
                currentTab.value = 'subjects';
            } catch(e) {} finally { loading.value = false; }
        };

        const viewSubject = async (id) => {
            loading.value = true;
            try {
                const data = await api('/api/subjects/' + id);
                selectedSubject.value = data;
                currentTab.value = 'detail';
            } catch(e) {} finally { loading.value = false; }
        };

        const openModal = (type) => { activeModal.value = type; };

        const submitData = async () => {
            await api('/api/data-point', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...forms.data, subjectId: selectedSubject.value.id })
            });
            activeModal.value = null; forms.data.label = ''; forms.data.value = ''; forms.data.analysis = '';
            await viewSubject(selectedSubject.value.id);
        };

        const submitEvent = async () => {
            await api('/api/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...forms.event, subjectId: selectedSubject.value.id })
            });
            activeModal.value = null; forms.event.title = ''; forms.event.description = '';
            await viewSubject(selectedSubject.value.id);
        };

        const submitRel = async () => {
            await api('/api/relationship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...forms.rel, subjectA: selectedSubject.value.id })
            });
            activeModal.value = null; forms.rel.subjectB = ''; forms.rel.type = ''; forms.rel.notes = '';
            await viewSubject(selectedSubject.value.id);
        };

        const handleFileUpload = (e) => { forms.media.file = e.target.files[0]; };
        
        const submitMedia = async () => {
            if (!forms.media.file) return;
            uploading.value = true;
            const reader = new FileReader();
            reader.readAsDataURL(forms.media.file);
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                try {
                    await api('/api/upload-photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            subjectId: selectedSubject.value.id,
                            filename: forms.media.file.name,
                            contentType: forms.media.file.type,
                            data: base64,
                            description: forms.media.description
                        })
                    });
                    activeModal.value = null; forms.media.file = null; forms.media.description = '';
                    await viewSubject(selectedSubject.value.id);
                } catch(e) {} finally { uploading.value = false; }
            };
        };

        onMounted(() => checkStatus());

        return {
            view, currentTab, setupMode, loading, initialLoadComplete, uploading, authForm, authError,
            subjects, selectedSubject, newSubject, forms, activeModal, feedItems,
            handleAuth, logout, fetchSubjects, createSubject, viewSubject, calculateAge,
            openModal, submitData, submitEvent, submitRel, handleFileUpload, submitMedia
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
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
    return admin ? Response.json(admin) : Response.json({ error: 'Invalid credentials' }, { status: 401 });
}

async function handleSetupAdmin(request, db) {
  const payload = await request.json();
  if (await adminExists(db)) return Response.json({ error: 'Admin already exists' }, { status: 409 });
  await createAdmin(db, payload.email, payload.password);
  const admin = await verifyAdmin(db, payload.email, payload.password);
  return Response.json(admin);
}

async function handleGetSubjects(request, db) {
    const url = new URL(request.url);
    const adminId = url.searchParams.get('adminId');
    if (!adminId) return Response.json({ error: 'Auth required' }, { status: 401 });
    const results = await getSubjects(db, adminId);
    return Response.json(results);
}

async function handleCreateSubject(request, db) {
  const payload = await request.json();
  if (!payload.adminId || !payload.fullName) return Response.json({ error: 'Missing Name/ID' }, { status: 400 });
  const result = await addSubject(db, payload);
  return Response.json(result);
}

async function handleUploadPhoto(request, db, bucket) {
  const payload = await request.json();
  const sanitized = sanitizeFileName(payload.filename);
  const key = `${payload.subjectId}-${Date.now()}-${sanitized}`;
  const binary = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
  await bucket.put(key, binary, { httpMetadata: { contentType: payload.contentType } });
  await db.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?,?,?,?,?)')
      .bind(payload.subjectId, key, payload.contentType, payload.description || '', isoTimestamp()).run();
  return Response.json({ key });
}

// Generic Data Handlers
async function handleGenericInsert(request, db, table, cols) {
    const p = await request.json();
    const placeholders = cols.map((_, i) => `?${i+1}`).join(',');
    const stmt = `INSERT INTO ${table} (${cols.join(',')}, created_at) VALUES (${placeholders}, ?)`;
    const values = cols.map(c => p[c] || null);
    await db.prepare(stmt).bind(...values, isoTimestamp()).run();
    return Response.json({ success: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    
    // Router
    try {
        // Only run DB checks if NOT requesting the home page asset
        if (pathname !== '/') {
            await env.DB.exec('PRAGMA foreign_keys = ON;');
            await ensureSchema(env.DB); 
        }

        if (request.method === 'GET' && pathname === '/') return serveHome(request, env);
        if (pathname === '/api/status') return handleStatus(env.DB);
        if (pathname === '/api/login') return handleLogin(request, env.DB);
        if (pathname === '/api/setup-admin') return handleSetupAdmin(request, env.DB);
        if (pathname === '/api/subjects') return request.method === 'POST' ? handleCreateSubject(request, env.DB) : handleGetSubjects(request, env.DB);
        if (pathname.match(/^\/api\/subjects\/\d+$/)) return Response.json(await getSubjectDetail(env.DB, pathname.split('/').pop()));
        if (pathname === '/api/upload-photo') return handleUploadPhoto(request, env.DB, env.BUCKET);
        if (pathname.startsWith('/api/media/')) {
            const obj = await env.BUCKET.get(pathname.replace('/api/media/', ''));
            return obj ? new Response(obj.body) : new Response('Not found', { status: 404 });
        }
        
        // Dynamic Inserts
        if (pathname === '/api/data-point') return handleGenericInsert(request, env.DB, 'subject_data_points', ['subject_id', 'category', 'label', 'value', 'analysis']);
        if (pathname === '/api/event') return handleGenericInsert(request, env.DB, 'subject_events', ['subject_id', 'title', 'description', 'event_date']);
        if (pathname === '/api/relationship') return handleGenericInsert(request, env.DB, 'subject_relationships', ['subject_a_id', 'subject_b_id', 'relationship_type', 'notes']);

        return new Response('Not found', { status: 404 });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
  },
};
