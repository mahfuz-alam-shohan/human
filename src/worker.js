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
  // Added religion, occupation, age, gender, location
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
    // Return summary list
    const stmt = db.prepare(`
        SELECT id, full_name, occupation, age, location, created_at 
        FROM subjects 
        WHERE admin_id = ? 
        ORDER BY updated_at DESC
    `);
    const { results } = await stmt.bind(adminId).all();
    return results;
}

async function getSubjectDetail(db, subjectId, bucket) {
    const stmtSubject = db.prepare('SELECT * FROM subjects WHERE id = ?');
    const subject = await stmtSubject.bind(subjectId).first();

    if (!subject) return null;

    const stmtMedia = db.prepare('SELECT object_key, content_type, created_at FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC');
    const { results: media } = await stmtMedia.bind(subjectId).all();

    return { ...subject, media };
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

async function recordMedia(db, subjectId, objectKey, contentType) {
  const createdAt = isoTimestamp();
  const stmt = db.prepare(
    'INSERT INTO subject_media (subject_id, object_key, content_type, created_at) VALUES (?1, ?2, ?3, ?4)'
  );
  await stmt.bind(subjectId, objectKey, contentType, createdAt).run();
}

// --- Frontend Application (Served as HTML) ---

async function serveHome(request, env, ctx) {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
  <title>Human Observation Platform</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }
    .fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
    .fade-enter-from, .fade-leave-to { opacity: 0; }
    /* Hide scrollbar for Chrome, Safari and Opera */
    .no-scrollbar::-webkit-scrollbar { display: none; }
    /* Hide scrollbar for IE, Edge and Firefox */
    .no-scrollbar { -ms-overflow-style: none;  scrollbar-width: none; }
  </style>
</head>
<body class="h-full text-slate-800 antialiased">
  <div id="app" class="h-full flex flex-col">
    
    <!-- Setup / Login View -->
    <div v-if="view === 'auth'" class="flex-1 flex flex-col justify-center items-center p-6 bg-slate-900 text-white">
        <div class="w-full max-w-md space-y-8">
            <div class="text-center">
                <div class="mx-auto h-16 w-16 bg-indigo-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
                    <i class="fa-solid fa-fingerprint text-3xl"></i>
                </div>
                <h2 class="text-3xl font-bold tracking-tight text-white">{{ setupMode ? 'Initialize System' : 'Researcher Access' }}</h2>
                <p class="mt-2 text-slate-400">Human Behavior & Psychology Database</p>
            </div>

            <form @submit.prevent="handleAuth" class="mt-8 space-y-6 bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl">
                <div class="space-y-4">
                    <div>
                        <label for="email" class="block text-sm font-medium text-slate-300">Email Address</label>
                        <input id="email" v-model="authForm.email" type="email" required class="mt-1 block w-full rounded-lg bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3">
                    </div>
                    <div>
                        <label for="password" class="block text-sm font-medium text-slate-300">Password</label>
                        <input id="password" v-model="authForm.password" type="password" required class="mt-1 block w-full rounded-lg bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3">
                    </div>
                </div>

                <div v-if="authError" class="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded">{{ authError }}</div>

                <button type="submit" :disabled="loading" class="group relative flex w-full justify-center rounded-lg bg-indigo-600 px-3 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-all">
                    <span v-if="loading"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Processing...</span>
                    <span v-else>{{ setupMode ? 'Create Admin & Initialize' : 'Enter Dashboard' }}</span>
                </button>
            </form>
        </div>
    </div>

    <!-- Main App Interface -->
    <div v-else class="flex h-full overflow-hidden bg-slate-50">
        
        <!-- Sidebar (Desktop) -->
        <aside class="hidden md:flex md:w-64 md:flex-col bg-white border-r border-slate-200 shadow-sm z-10">
            <div class="flex items-center justify-center h-16 border-b border-slate-100 px-4">
                <i class="fa-solid fa-dna text-indigo-600 text-xl mr-2"></i>
                <span class="font-bold text-lg text-slate-800">HumanResearch</span>
            </div>
            <nav class="flex-1 overflow-y-auto p-4 space-y-1">
                <a @click="currentTab = 'dashboard'" :class="{'bg-indigo-50 text-indigo-700': currentTab === 'dashboard', 'text-slate-600 hover:bg-slate-50': currentTab !== 'dashboard'}" class="group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                    <i :class="{'text-indigo-600': currentTab === 'dashboard', 'text-slate-400': currentTab !== 'dashboard'}" class="fa-solid fa-chart-pie mr-3 w-5 text-center"></i>
                    Dashboard
                </a>
                <a @click="currentTab = 'subjects'; fetchSubjects()" :class="{'bg-indigo-50 text-indigo-700': currentTab === 'subjects', 'text-slate-600 hover:bg-slate-50': currentTab !== 'subjects'}" class="group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                    <i :class="{'text-indigo-600': currentTab === 'subjects', 'text-slate-400': currentTab !== 'subjects'}" class="fa-solid fa-users mr-3 w-5 text-center"></i>
                    Subjects
                </a>
                <a @click="currentTab = 'add'" :class="{'bg-indigo-50 text-indigo-700': currentTab === 'add', 'text-slate-600 hover:bg-slate-50': currentTab !== 'add'}" class="group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                    <i :class="{'text-indigo-600': currentTab === 'add', 'text-slate-400': currentTab !== 'add'}" class="fa-solid fa-user-plus mr-3 w-5 text-center"></i>
                    Add Person
                </a>
            </nav>
            <div class="p-4 border-t border-slate-100">
                <button @click="logout" class="flex items-center w-full px-3 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-50 hover:text-red-600 transition-colors">
                    <i class="fa-solid fa-right-from-bracket mr-3 w-5 text-center text-slate-400 group-hover:text-red-500"></i>
                    Sign Out
                </button>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
            <!-- Mobile Header -->
            <div class="md:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 h-16 shrink-0">
                <div class="flex items-center font-bold text-slate-800">
                    <i class="fa-solid fa-dna text-indigo-600 text-lg mr-2"></i> HumanResearch
                </div>
                <button @click="logout" class="text-slate-500"><i class="fa-solid fa-right-from-bracket"></i></button>
            </div>

            <div class="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                
                <!-- Dashboard Tab -->
                <div v-if="currentTab === 'dashboard'" class="max-w-5xl mx-auto space-y-6">
                    <h1 class="text-2xl font-bold text-slate-900">Research Overview</h1>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center">
                            <div class="p-3 rounded-full bg-blue-50 text-blue-600 mr-4"><i class="fa-solid fa-users text-2xl"></i></div>
                            <div>
                                <p class="text-sm font-medium text-slate-500">Total Subjects</p>
                                <p class="text-2xl font-bold text-slate-900">{{ subjects.length }}</p>
                            </div>
                        </div>
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center">
                            <div class="p-3 rounded-full bg-emerald-50 text-emerald-600 mr-4"><i class="fa-solid fa-calendar-check text-2xl"></i></div>
                            <div>
                                <p class="text-sm font-medium text-slate-500">Last Active</p>
                                <p class="text-2xl font-bold text-slate-900">Today</p>
                            </div>
                        </div>
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center">
                            <div class="p-3 rounded-full bg-purple-50 text-purple-600 mr-4"><i class="fa-solid fa-database text-2xl"></i></div>
                            <div>
                                <p class="text-sm font-medium text-slate-500">Data Points</p>
                                <p class="text-2xl font-bold text-slate-900">Active</p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-indigo-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
                        <div class="relative z-10">
                            <h3 class="text-lg font-bold mb-2">Welcome Back, Researcher.</h3>
                            <p class="text-indigo-100 max-w-xl">"Understanding human behavior is the key to unlocking the potential of our society." Continue your observations today.</p>
                            <button @click="currentTab = 'add'" class="mt-6 bg-white text-indigo-600 px-6 py-2 rounded-lg font-semibold hover:bg-indigo-50 transition-colors shadow-md">Record New Observation</button>
                        </div>
                        <i class="fa-solid fa-brain absolute -bottom-6 -right-6 text-9xl text-indigo-500 opacity-20 transform rotate-12"></i>
                    </div>
                </div>

                <!-- Subjects List Tab -->
                <div v-if="currentTab === 'subjects'" class="max-w-6xl mx-auto">
                    <div class="flex justify-between items-center mb-6">
                        <h1 class="text-2xl font-bold text-slate-900">Subject Directory</h1>
                        <button @click="fetchSubjects" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium"><i class="fa-solid fa-rotate mr-1"></i> Refresh</button>
                    </div>

                    <div v-if="loading" class="flex justify-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-600"></i></div>
                    
                    <div v-else-if="subjects.length === 0" class="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                        <i class="fa-solid fa-user-ghost text-4xl text-slate-300 mb-3"></i>
                        <p class="text-slate-500 mb-4">No subjects recorded yet.</p>
                        <button @click="currentTab = 'add'" class="text-indigo-600 font-medium hover:underline">Add your first subject</button>
                    </div>

                    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div v-for="person in subjects" :key="person.id" @click="viewSubject(person.id)" class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group">
                            <div class="flex items-start justify-between">
                                <div class="flex items-center space-x-3">
                                    <div class="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                        {{ person.full_name.charAt(0) }}
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{{ person.full_name }}</h3>
                                        <p class="text-xs text-slate-500 uppercase tracking-wide">{{ person.occupation || 'Unknown' }}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-4 flex items-center space-x-4 text-sm text-slate-500">
                                <span v-if="person.age"><i class="fa-solid fa-cake-candles mr-1.5 text-slate-400"></i> {{ person.age }}y</span>
                                <span v-if="person.location"><i class="fa-solid fa-location-dot mr-1.5 text-slate-400"></i> {{ person.location }}</span>
                            </div>
                            <div class="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
                                <span>ID: #{{ String(person.id).padStart(4, '0') }}</span>
                                <span>Added: {{ new Date(person.created_at).toLocaleDateString() }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Add Subject Tab -->
                <div v-if="currentTab === 'add'" class="max-w-2xl mx-auto">
                    <h1 class="text-2xl font-bold text-slate-900 mb-6">New Subject Entry</h1>
                    <form @submit.prevent="createSubject" class="bg-white shadow-sm border border-slate-200 rounded-xl p-6 md:p-8 space-y-6">
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="col-span-1 md:col-span-2">
                                <label class="block text-sm font-medium text-slate-700">Full Name</label>
                                <input v-model="newSubject.fullName" type="text" required class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-700">Age</label>
                                <input v-model="newSubject.age" type="number" class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-700">Gender</label>
                                <select v-model="newSubject.gender" class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500">
                                    <option value="">Select...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Non-binary">Non-binary</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-700">Occupation (What they do)</label>
                                <input v-model="newSubject.occupation" type="text" class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-700">Religion/Beliefs</label>
                                <input v-model="newSubject.religion" type="text" class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500">
                            </div>

                             <div class="col-span-1 md:col-span-2">
                                <label class="block text-sm font-medium text-slate-700">Location/Address</label>
                                <input v-model="newSubject.location" type="text" class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500">
                            </div>

                            <div class="col-span-1 md:col-span-2">
                                <label class="block text-sm font-medium text-slate-700">Contact Info</label>
                                <input v-model="newSubject.contact" type="text" placeholder="Phone, Email, Socials..." class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500">
                            </div>

                            <div class="col-span-1 md:col-span-2">
                                <label class="block text-sm font-medium text-slate-700">Observed Habits</label>
                                <textarea v-model="newSubject.habits" rows="3" class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500"></textarea>
                            </div>

                            <div class="col-span-1 md:col-span-2">
                                <label class="block text-sm font-medium text-slate-700">Detailed Notes</label>
                                <textarea v-model="newSubject.notes" rows="5" class="mt-1 block w-full rounded-lg border-slate-300 bg-slate-50 border p-2.5 focus:ring-indigo-500 focus:border-indigo-500"></textarea>
                            </div>
                        </div>

                        <div class="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                            <button type="button" @click="currentTab = 'dashboard'" class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
                            <button type="submit" :disabled="loading" class="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                                {{ loading ? 'Saving...' : 'Save Record' }}
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Subject Detail View -->
                <div v-if="currentTab === 'detail' && selectedSubject" class="max-w-4xl mx-auto pb-20">
                    <button @click="currentTab = 'subjects'" class="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center"><i class="fa-solid fa-arrow-left mr-2"></i> Back to Directory</button>
                    
                    <div class="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden mb-6">
                        <div class="bg-slate-50 p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h1 class="text-3xl font-bold text-slate-900">{{ selectedSubject.full_name }}</h1>
                                <p class="text-slate-500 mt-1 flex items-center gap-3">
                                    <span v-if="selectedSubject.occupation"><i class="fa-solid fa-briefcase text-slate-400"></i> {{ selectedSubject.occupation }}</span>
                                    <span v-if="selectedSubject.location"><i class="fa-solid fa-map-pin text-slate-400"></i> {{ selectedSubject.location }}</span>
                                </p>
                            </div>
                            <div class="flex gap-2">
                                <span class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wide">Subject #{{ selectedSubject.id }}</span>
                                <span v-if="selectedSubject.gender" class="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold uppercase tracking-wide">{{ selectedSubject.gender }}</span>
                            </div>
                        </div>

                        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Personal Details</h3>
                                <dl class="space-y-3">
                                    <div v-if="selectedSubject.age" class="flex justify-between border-b border-slate-50 pb-2"><dt class="text-slate-500">Age</dt><dd class="font-medium text-slate-900">{{ selectedSubject.age }}</dd></div>
                                    <div v-if="selectedSubject.religion" class="flex justify-between border-b border-slate-50 pb-2"><dt class="text-slate-500">Religion</dt><dd class="font-medium text-slate-900">{{ selectedSubject.religion }}</dd></div>
                                    <div v-if="selectedSubject.contact" class="flex justify-between border-b border-slate-50 pb-2"><dt class="text-slate-500">Contact</dt><dd class="font-medium text-slate-900">{{ selectedSubject.contact }}</dd></div>
                                </dl>
                            </div>

                            <div>
                                <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Habits & Patterns</h3>
                                <div class="bg-slate-50 p-4 rounded-lg text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                                    {{ selectedSubject.habits || 'No habits recorded.' }}
                                </div>
                            </div>

                            <div class="md:col-span-2">
                                <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Research Notes</h3>
                                <div class="bg-amber-50 p-5 rounded-lg border border-amber-100 text-slate-800 leading-relaxed whitespace-pre-line font-serif text-lg">
                                    {{ selectedSubject.notes || 'No detailed notes recorded.' }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Media Gallery -->
                    <div class="bg-white shadow-sm border border-slate-200 rounded-2xl p-6">
                        <div class="flex justify-between items-center mb-6">
                            <h3 class="text-lg font-bold text-slate-900">Visual Evidence</h3>
                            <label class="cursor-pointer bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors">
                                <i class="fa-solid fa-camera mr-2"></i> Upload Photo
                                <input type="file" @change="uploadPhoto" class="hidden" accept="image/*">
                            </label>
                        </div>
                        
                        <div v-if="uploading" class="mb-4 bg-blue-50 text-blue-700 p-3 rounded-lg text-sm flex items-center">
                            <i class="fa-solid fa-circle-notch fa-spin mr-3"></i> Uploading media to secure storage...
                        </div>

                        <div v-if="selectedSubject.media && selectedSubject.media.length > 0" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div v-for="img in selectedSubject.media" :key="img.object_key" class="aspect-square bg-slate-100 rounded-lg overflow-hidden relative group">
                                <img :src="'/api/media/' + img.object_key" class="w-full h-full object-cover">
                                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <a :href="'/api/media/' + img.object_key" target="_blank" class="text-white bg-white/20 p-2 rounded-full hover:bg-white/40"><i class="fa-solid fa-expand"></i></a>
                                </div>
                            </div>
                        </div>
                        <div v-else class="text-center py-8 text-slate-400 italic">
                            No visual records available.
                        </div>
                    </div>

                </div>

            </div>
            
            <!-- Mobile Navigation Bottom Bar -->
            <div class="md:hidden bg-white border-t border-slate-200 flex justify-around py-3 pb-safe shrink-0 text-xs font-medium text-slate-500">
                <button @click="currentTab = 'dashboard'" :class="{'text-indigo-600': currentTab === 'dashboard'}" class="flex flex-col items-center">
                    <i class="fa-solid fa-chart-pie text-xl mb-1"></i> Dashboard
                </button>
                <button @click="currentTab = 'subjects'; fetchSubjects()" :class="{'text-indigo-600': currentTab === 'subjects'}" class="flex flex-col items-center">
                    <i class="fa-solid fa-users text-xl mb-1"></i> Subjects
                </button>
                <button @click="currentTab = 'add'" :class="{'text-indigo-600': currentTab === 'add'}" class="flex flex-col items-center">
                    <i class="fa-solid fa-circle-plus text-xl mb-1"></i> Add
                </button>
            </div>
        </main>
    </div>
  </div>

  <script>
    const { createApp, ref, reactive, onMounted } = Vue;

    createApp({
      setup() {
        // State
        const view = ref('auth'); // auth, app
        const currentTab = ref('dashboard'); // dashboard, subjects, add, detail
        const setupMode = ref(false);
        const loading = ref(false);
        const uploading = ref(false);
        const authError = ref('');
        const subjects = ref([]);
        const selectedSubject = ref(null);
        
        const authForm = reactive({ email: '', password: '' });
        const newSubject = reactive({
            fullName: '', age: '', gender: '', occupation: '', religion: '', 
            location: '', contact: '', habits: '', notes: ''
        });

        // Computed / Methods
        const checkStatus = async () => {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                if (!data.adminExists) {
                    setupMode.value = true;
                } else {
                    setupMode.value = false;
                    // Check if already logged in locally
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
                    if (data.id) localStorage.setItem('human_admin_id', data.id);
                    view.value = 'app';
                    if (setupMode.value) {
                         // Reset setup mode after successful creation
                         setupMode.value = false;
                    }
                    fetchSubjects();
                } else {
                    authError.value = data.error || 'Authentication failed';
                }
            } catch (e) {
                authError.value = 'Network error occurred';
            } finally {
                loading.value = false;
            }
        };

        const logout = () => {
            localStorage.removeItem('human_admin_id');
            authForm.email = '';
            authForm.password = '';
            view.value = 'auth';
        };

        const fetchSubjects = async () => {
            const adminId = localStorage.getItem('human_admin_id');
            if (!adminId) return;
            
            loading.value = true;
            try {
                const res = await fetch('/api/subjects?adminId=' + adminId);
                if (res.ok) {
                    subjects.value = await res.json();
                }
            } catch(e) { console.error(e); }
            finally { loading.value = false; }
        };

        const viewSubject = async (id) => {
            loading.value = true;
            try {
                const res = await fetch('/api/subjects/' + id);
                if (res.ok) {
                    selectedSubject.value = await res.json();
                    currentTab.value = 'detail';
                }
            } catch(e) { console.error(e); }
            finally { loading.value = false; }
        };

        const createSubject = async () => {
            const adminId = localStorage.getItem('human_admin_id');
            if (!adminId) return;

            loading.value = true;
            try {
                const payload = { ...newSubject, adminId: parseInt(adminId) };
                const res = await fetch('/api/subjects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    // Reset form
                    Object.keys(newSubject).forEach(k => newSubject[k] = '');
                    await fetchSubjects();
                    currentTab.value = 'subjects';
                } else {
                    alert('Error saving subject');
                }
            } catch (e) { console.error(e); }
            finally { loading.value = false; }
        };

        const uploadPhoto = async (e) => {
            const file = e.target.files[0];
            if (!file || !selectedSubject.value) return;

            uploading.value = true;
            
            // Convert to base64
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
                            data: base64
                        })
                    });

                    if (res.ok) {
                        // Refresh details to show new image
                        await viewSubject(selectedSubject.value.id);
                    } else {
                        alert('Upload failed');
                    }
                } catch(e) { console.error(e); }
                finally { uploading.value = false; }
            };
        };

        onMounted(() => {
            checkStatus();
        });

        return {
            view, currentTab, setupMode, loading, uploading, authForm, authError,
            subjects, selectedSubject, newSubject,
            handleAuth, logout, fetchSubjects, viewSubject, createSubject, uploadPhoto
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

async function handleGetSubjectDetail(request, db, bucket, id) {
    const result = await getSubjectDetail(db, id, bucket);
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
    religion: payload.religion,
    location: payload.location,
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

    // CORS Headers for API (optional if serving from same origin, but good practice)
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
                // Check if it's a list or detail
                // List: /api/subjects
                return handleGetSubjects(request, env.DB);
            }
            if (request.method === 'GET' && pathname.match(/^\/api\/subjects\/\d+$/)) {
                 const id = pathname.split('/').pop();
                 return handleGetSubjectDetail(request, env.DB, env.BUCKET, id);
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
        }

        return new Response('Not found', { status: 404 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: {'Content-Type': 'application/json'} });
    }
  },
};
