const encoder = new TextEncoder();

// --- Configuration & Constants ---
const APP_TITLE = "PEOPLE OS // INTELLIGENCE";

// Whitelist for Subject Columns to prevent "no such column" errors during updates
const SUBJECT_COLUMNS = [
    'full_name', 'alias', 'dob', 'age', 'gender', 'occupation', 'nationality', 
    'ideology', 'location', 'contact', 'hometown', 'previous_locations', 
    'modus_operandi', 'notes', 'weakness', 'avatar_path', 'is_archived', 
    'status', 'threat_level', 'last_sighted', 'height', 'weight', 'eye_color', 
    'hair_color', 'blood_type', 'identifying_marks', 'social_links', 
    'digital_identifiers'
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
    
    // Disable FKs to allow dropping tables in any order
    await db.prepare("PRAGMA foreign_keys = OFF;").run();
    
    for(const t of tables) {
        try { 
            await db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); 
        } catch(e) { 
            console.error(`Failed to drop ${t}`, e); 
        }
    }
    
    // Re-enable FKs
    await db.prepare("PRAGMA foreign_keys = ON;").run();
    
    // Force schema re-init on next request so tables are recreated
    schemaInitialized = false; 
    return true;
}

// --- Analysis Engine ---

function analyzeProfile(subject, interactions, intel) {
    const dataPoints = intel.length + interactions.length + (subject.modus_operandi ? 1 : 0);
    const completeness = Math.min(100, Math.floor((dataPoints / 20) * 100));
    
    const tags = [];
    const textBank = [
        subject.modus_operandi, 
        subject.occupation,
        ...interactions.map(i => i.type),
        ...intel.map(i => i.category)
    ].join(' ').toLowerCase();

    if (textBank.includes('business') || textBank.includes('meeting') || textBank.includes('work')) tags.push('Professional');
    if (textBank.includes('family') || textBank.includes('home')) tags.push('Family');
    if (textBank.includes('finance') || textBank.includes('money')) tags.push('Financial');
    if (textBank.includes('medical') || textBank.includes('health')) tags.push('Medical');
    
    return {
        score: completeness,
        tags: tags,
        summary: `Profile is ${completeness}% complete. Contains ${interactions.length} interactions and ${intel.length} attribute points.`,
        generated_at: isoTimestamp()
    };
}

// --- API Handlers ---

async function handleGetDashboard(db, adminId) {
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Profile Updated' as desc, COALESCE(updated_at, created_at) as date FROM subjects WHERE admin_id = ?
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
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.occupation as target_role
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

async function handleGetGlobalNetwork(db, adminId) {
    const subjects = await db.prepare('SELECT id, full_name, occupation, avatar_path, threat_level FROM subjects WHERE admin_id = ? AND is_archived = 0').bind(adminId).all();
    
    if (subjects.results.length === 0) return response({ nodes: [], edges: [] });

    const subjectIds = subjects.results.map(s => s.id).join(',');
    
    const relationships = await db.prepare(`
        SELECT subject_a_id, subject_b_id, relationship_type 
        FROM subject_relationships 
        WHERE subject_a_id IN (${subjectIds}) AND subject_b_id IN (${subjectIds})
    `).all();

    return response({
        nodes: subjects.results.map(s => ({
            id: s.id,
            label: s.full_name,
            group: s.threat_level,
            image: s.avatar_path,
            shape: 'circularImage'
        })),
        edges: relationships.results.map(r => ({
            from: r.subject_a_id,
            to: r.subject_b_id,
            label: r.relationship_type,
            arrows: 'to',
            font: { align: 'middle' }
        }))
    });
}

async function handleGetMapData(db, adminId) {
    const query = `
        SELECT l.id, l.name, l.lat, l.lng, l.type, l.address, s.id as subject_id, s.full_name, s.alias, s.avatar_path, s.threat_level 
        FROM subject_locations l
        JOIN subjects s ON l.subject_id = s.id
        WHERE s.admin_id = ? AND s.is_archived = 0 AND l.lat IS NOT NULL
        ORDER BY l.created_at ASC
    `;
    const res = await db.prepare(query).bind(adminId).all();
    return response(res.results);
}

// --- Share Logic ---

async function handleCreateShareLink(req, db, origin) {
    const { subjectId, durationMinutes } = await req.json();
    if (!subjectId) return errorResponse('subjectId required', 400);
    
    const minutes = durationMinutes || 60;
    const durationSeconds = Math.max(60, Math.floor(minutes * 60)); 

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
    if (!link) return errorResponse('LINK INVALID', 404);
    if (!link.is_active) return errorResponse('LINK REVOKED', 410);

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
        
        await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();

        // FETCH ALL INFOS
        const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(link.subject_id).first();
        const interactions = await db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(link.subject_id).all();
        const locations = await db.prepare('SELECT * FROM subject_locations WHERE subject_id = ?').bind(link.subject_id).all();
        const media = await db.prepare('SELECT * FROM subject_media WHERE subject_id = ?').bind(link.subject_id).all();
        const intel = await db.prepare('SELECT * FROM subject_intel WHERE subject_id = ?').bind(link.subject_id).all();
        const relationships = await db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.occupation as target_role
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(link.subject_id, link.subject_id, link.subject_id).all();


        return response({
            ...subject,
            interactions: interactions.results,
            locations: locations.results,
            media: media.results,
            intel: intel.results,
            relationships: relationships.results,
            meta: { remaining_seconds: Math.floor(remaining) }
        });
    }
    return errorResponse('INVALID CONFIG', 500);
}

// --- Frontend: Shared Link View ---
function serveSharedHtml(token) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CONFIDENTIAL // Profile Dossier</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <style>
        :root { --primary: #3b82f6; --bg-dark: #0f172a; }
        body { font-family: 'Inter', sans-serif; background: #f1f5f9; color: #334155; }
        .glass { background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .dark-mode body { background: #0f172a; color: #e2e8f0; }
        .dark-mode .glass { background: #1e293b; border-color: #334155; box-shadow: none; }
        
        .tab-btn { padding: 0.75rem 1.25rem; font-weight: 500; font-size: 0.875rem; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }
        .tab-btn.active { color: var(--primary); border-color: var(--primary); }
        .tab-btn:hover:not(.active) { color: #64748b; }
        .dark-mode .tab-btn:hover:not(.active) { color: #94a3b8; }
    </style>
</head>
<body class="min-h-screen transition-colors duration-300">
    <div id="app" class="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        
        <!-- LOADING STATE -->
        <div v-if="loading" class="flex flex-col items-center justify-center min-h-[50vh]">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500"></i>
            <p class="mt-4 text-sm font-bold text-slate-400 uppercase tracking-widest">Decrypting Dossier...</p>
        </div>

        <!-- ERROR STATE -->
        <div v-else-if="error" class="flex items-center justify-center min-h-[50vh]">
            <div class="glass p-8 max-w-md w-full text-center border-l-4 border-red-500">
                <i class="fa-solid fa-shield-halved text-5xl text-red-500 mb-4"></i>
                <h1 class="text-2xl font-bold text-red-600 mb-2">Access Restricted</h1>
                <p class="text-slate-600 dark:text-slate-400 text-sm">{{error}}</p>
            </div>
        </div>

        <!-- CONTENT -->
        <div v-else class="space-y-6 animate-fade-in">
            
            <!-- HEADER / IDENTITY -->
            <div class="glass p-6 md:p-8 relative overflow-hidden">
                <div class="absolute top-0 right-0 p-4 opacity-10">
                    <i class="fa-solid fa-fingerprint text-9xl"></i>
                </div>
                
                <div class="flex flex-col md:flex-row gap-6 relative z-10">
                    <div class="shrink-0 mx-auto md:mx-0">
                        <div class="w-32 h-32 md:w-40 md:h-40 rounded-xl overflow-hidden ring-4 ring-white dark:ring-slate-700 shadow-xl bg-slate-200">
                            <img :src="resolveImg(data.avatar_path)" class="w-full h-full object-cover">
                        </div>
                    </div>
                    <div class="flex-1 text-center md:text-left space-y-2">
                        <div class="flex flex-col md:flex-row justify-between items-start">
                            <div>
                                <h1 class="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{{data.full_name}}</h1>
                                <div class="text-lg text-slate-500 font-medium">{{data.occupation}}</div>
                            </div>
                            <div class="mt-4 md:mt-0 flex flex-col items-end gap-1">
                                <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {{data.status || 'Active'}}
                                </span>
                                <div class="text-xs font-mono text-slate-400">EXP: {{ formatTime(timer) }}</div>
                            </div>
                        </div>
                        
                        <div class="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
                            <div v-if="data.alias" class="px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wide">
                                <i class="fa-solid fa-mask mr-2"></i>{{data.alias}}
                            </div>
                            <div v-if="data.nationality" class="px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wide">
                                <i class="fa-solid fa-flag mr-2"></i>{{data.nationality}}
                            </div>
                            <div v-if="data.threat_level" :class="getThreatColor(data.threat_level, true)" class="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide">
                                <i class="fa-solid fa-triangle-exclamation mr-2"></i>{{data.threat_level}} Priority
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- NAVIGATION TABS -->
            <div class="glass flex overflow-x-auto no-scrollbar border-b-0 sticky top-2 z-20 shadow-md">
                <button v-for="t in tabs" @click="activeTab = t.id" :class="['tab-btn', activeTab === t.id ? 'active' : '']">
                    <i :class="t.icon" class="mr-2"></i>{{t.label}}
                </button>
            </div>

            <!-- TAB CONTENT -->
            
            <!-- 1. PROFILE TAB -->
            <div v-if="activeTab === 'profile'" class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Physical Stats -->
                <div class="glass p-6 md:col-span-1">
                    <h3 class="text-xs font-bold uppercase text-slate-400 mb-4 border-b border-slate-100 dark:border-slate-700 pb-2">Physical Profile</h3>
                    <div class="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                        <div><div class="text-slate-500 text-xs">Height</div><div class="font-bold">{{data.height || '--'}}</div></div>
                        <div><div class="text-slate-500 text-xs">Weight</div><div class="font-bold">{{data.weight || '--'}}</div></div>
                        <div><div class="text-slate-500 text-xs">Age</div><div class="font-bold">{{data.age || '--'}}</div></div>
                        <div><div class="text-slate-500 text-xs">Blood Type</div><div class="font-bold">{{data.blood_type || '--'}}</div></div>
                        <div><div class="text-slate-500 text-xs">Eye Color</div><div class="font-bold">{{data.eye_color || '--'}}</div></div>
                        <div><div class="text-slate-500 text-xs">Hair Color</div><div class="font-bold">{{data.hair_color || '--'}}</div></div>
                    </div>
                    <div v-if="data.identifying_marks" class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <div class="text-slate-500 text-xs mb-1">Identifying Marks</div>
                        <div class="text-sm font-medium">{{data.identifying_marks}}</div>
                    </div>
                </div>

                <!-- Personal Info -->
                <div class="glass p-6 md:col-span-2">
                    <h3 class="text-xs font-bold uppercase text-slate-400 mb-4 border-b border-slate-100 dark:border-slate-700 pb-2">Background Info</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <div><div class="text-xs text-slate-500 uppercase font-bold">Date of Birth</div><div class="font-medium">{{data.dob || 'Unknown'}}</div></div>
                            <div><div class="text-xs text-slate-500 uppercase font-bold">Hometown</div><div class="font-medium">{{data.hometown || 'Unknown'}}</div></div>
                            <div><div class="text-xs text-slate-500 uppercase font-bold">Current Location</div><div class="font-medium">{{data.location || 'Unknown'}}</div></div>
                        </div>
                        <div class="space-y-4">
                            <div><div class="text-xs text-slate-500 uppercase font-bold">Contact Info</div><div class="font-medium break-all">{{data.contact || 'None'}}</div></div>
                            <div><div class="text-xs text-slate-500 uppercase font-bold">Social Links</div><div class="font-medium break-all text-blue-500">{{data.social_links || 'None'}}</div></div>
                            <div><div class="text-xs text-slate-500 uppercase font-bold">Digital ID</div><div class="font-medium break-all font-mono text-xs">{{data.digital_identifiers || 'None'}}</div></div>
                        </div>
                    </div>
                    <div v-if="data.previous_locations" class="mt-6">
                        <div class="text-xs text-slate-500 uppercase font-bold mb-1">Previous Locations</div>
                        <p class="text-sm text-slate-700 dark:text-slate-300">{{data.previous_locations}}</p>
                    </div>
                </div>
            </div>

            <!-- 2. INTEL TAB -->
            <div v-if="activeTab === 'intel'" class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Core Intel -->
                <div class="glass p-6 md:col-span-2 space-y-6">
                    <div>
                        <h3 class="flex items-center gap-2 text-sm font-bold uppercase text-slate-900 dark:text-white mb-2">
                            <i class="fa-solid fa-clipboard-list text-blue-500"></i> Routine & Modus Operandi
                        </h3>
                        <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">{{data.modus_operandi || 'No routine data recorded.'}}</div>
                    </div>
                    <div>
                        <h3 class="flex items-center gap-2 text-sm font-bold uppercase text-slate-900 dark:text-white mb-2">
                            <i class="fa-solid fa-lock-open text-red-500"></i> Vulnerabilities & Notes
                        </h3>
                        <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">{{data.weakness || 'No vulnerabilities recorded.'}}</div>
                    </div>
                </div>

                <!-- Attributes List -->
                <div class="glass p-6 md:col-span-1 space-y-4">
                    <h3 class="text-xs font-bold uppercase text-slate-400">Collected Attributes</h3>
                    <div v-if="!data.intel.length" class="text-sm text-slate-400 italic">No additional attributes.</div>
                    <div v-for="item in data.intel" class="p-3 border border-slate-100 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-bold uppercase text-blue-500 tracking-wider">{{item.category}}</span>
                            <span class="text-[10px] text-slate-400">{{new Date(item.created_at).toLocaleDateString()}}</span>
                        </div>
                        <div class="text-xs text-slate-500 font-bold uppercase mb-0.5">{{item.label}}</div>
                        <div class="text-sm font-medium text-slate-900 dark:text-white break-words">{{item.value}}</div>
                    </div>
                </div>
            </div>

            <!-- 3. TIMELINE TAB (UPDATED) -->
            <div v-if="activeTab === 'timeline'" class="max-w-3xl mx-auto">
                <div class="glass p-6 md:p-8">
                    <h3 class="text-lg font-bold mb-6 flex items-center gap-2"><i class="fa-solid fa-clock-rotate-left text-slate-400"></i> Interaction History</h3>
                    <div class="relative pl-8 border-l-2 border-slate-200 dark:border-slate-700 space-y-8 my-4">
                        <div v-for="ix in data.interactions" class="relative group">
                            <div class="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-4 border-blue-500"></div>
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                                <span class="text-sm font-bold text-slate-900 dark:text-white">{{ix.type}}</span>
                                <span class="text-xs font-mono text-slate-400">{{new Date(ix.date).toLocaleString()}}</span>
                            </div>
                            <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg text-sm text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700 whitespace-pre-wrap">{{ix.transcript || ix.conclusion || 'No details.'}}</div>
                        </div>
                        <div v-if="!data.interactions.length" class="text-center text-slate-400 italic py-8">No interactions recorded.</div>
                    </div>
                </div>
            </div>

            <!-- 4. NETWORK TAB -->
            <div v-if="activeTab === 'network'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div v-for="rel in data.relationships" class="glass p-4 flex items-center gap-4 hover:border-blue-500 transition-colors">
                    <div class="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                        <img v-if="rel.target_avatar" :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover">
                        <div v-else class="w-full h-full flex items-center justify-center font-bold text-slate-400">{{rel.target_name.charAt(0)}}</div>
                    </div>
                    <div class="min-w-0">
                        <div class="font-bold text-sm truncate">{{rel.target_name}}</div>
                        <div class="text-xs text-blue-500 font-bold uppercase tracking-wide">{{rel.relationship_type}}</div>
                        <div class="text-xs text-slate-500 truncate">{{rel.target_role}}</div>
                    </div>
                </div>
                <div v-if="!data.relationships.length" class="col-span-full text-center py-12 text-slate-400 glass">No known associates.</div>
            </div>

            <!-- 5. FILES TAB -->
            <div v-if="activeTab === 'files'" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div v-for="m in data.media" class="glass aspect-square relative group overflow-hidden rounded-xl">
                    <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transition-transform group-hover:scale-105" onerror="this.src='https://placehold.co/400?text=IMG'">
                    <div v-else class="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400">
                        <i class="fa-solid fa-file text-4xl mb-2"></i>
                        <span class="text-xs uppercase font-bold">{{m.content_type ? m.content_type.split('/')[1] : 'LINK'}}</span>
                    </div>
                    <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0 z-10"></a>
                    <div class="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-sm p-2 text-white text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {{m.description || 'File'}}
                    </div>
                </div>
                <div v-if="!data.media.length" class="col-span-full text-center py-12 text-slate-400 glass">No files attached.</div>
            </div>

             <!-- 6. LOCATIONS TAB -->
             <div v-if="activeTab === 'locations'" class="space-y-4">
                <div v-for="loc in data.locations" class="glass p-4 flex justify-between items-center">
                    <div>
                        <div class="font-bold text-sm">{{loc.name}} <span class="ml-2 text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 uppercase">{{loc.type}}</span></div>
                        <div class="text-xs text-slate-500 mt-1">{{loc.address}}</div>
                        <div v-if="loc.notes" class="text-xs text-slate-400 mt-2 italic">"{{loc.notes}}"</div>
                    </div>
                    <a v-if="loc.lat" :href="'https://www.google.com/maps/search/?api=1&query='+loc.lat+','+loc.lng" target="_blank" class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-500 hover:bg-blue-100 transition-colors">
                        <i class="fa-solid fa-location-arrow"></i>
                    </a>
                </div>
                <div v-if="!data.locations.length" class="text-center py-12 text-slate-400 glass">No locations recorded.</div>
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
                const activeTab = ref('profile');
                const token = window.location.pathname.split('/').pop();
                
                const tabs = [
                    {id: 'profile', label: 'Profile', icon: 'fa-solid fa-id-card'},
                    {id: 'intel', label: 'Intel', icon: 'fa-solid fa-brain'},
                    {id: 'timeline', label: 'History', icon: 'fa-solid fa-clock-rotate-left'},
                    {id: 'network', label: 'Network', icon: 'fa-solid fa-diagram-project'},
                    {id: 'locations', label: 'Locations', icon: 'fa-solid fa-map-location-dot'},
                    {id: 'files', label: 'Files', icon: 'fa-solid fa-folder-open'}
                ];

                const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : 'https://ui-avatars.com/api/?background=random&name=' + (data.value?.full_name || 'User');
                
                const formatTime = (s) => {
                    if(s <= 0) return "EXPIRED";
                    const h = Math.floor(s / 3600);
                    const m = Math.floor((s % 3600) / 60);
                    const sec = Math.floor(s % 60);
                    return \`\${h}h \${m}m \${sec}s\`;
                };

                const getThreatColor = (l, isBg = false) => {
                     const c = { 'Critical': 'red', 'High': 'orange', 'Medium': 'amber', 'Low': 'emerald' }[l] || 'slate';
                     return isBg ? \`bg-\${c}-100 dark:bg-\${c}-900/30 text-\${c}-700 dark:text-\${c}-300\` : \`text-\${c}-600\`;
                };

                // Check Dark Mode
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.body.classList.add('dark-mode');
                }

                onMounted(async () => {
                    try {
                        const res = await fetch('/api/share/' + token);
                        const json = await res.json();
                        if(json.error) throw new Error(json.error);
                        data.value = json;
                        timer.value = json.meta?.remaining_seconds || 0;
                        loading.value = false;
                        
                        const interval = setInterval(() => {
                            if(timer.value > 0) timer.value--;
                            else {
                                if(!error.value && timer.value <= 0) {
                                    clearInterval(interval);
                                    window.location.reload();
                                }
                            }
                        }, 1000);
                    } catch(e) {
                        error.value = e.message;
                        loading.value = false;
                    }
                });
                return { loading, error, data, timer, activeTab, tabs, resolveImg, formatTime, getThreatColor };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
}


// --- Frontend: Main Admin App ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-950">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>PEOPLE OS // INTELLIGENCE</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  
  <style>
    :root { --primary: #3b82f6; --bg-dark: #020617; }
    body { font-family: 'Inter', sans-serif; background-color: var(--bg-dark); color: #cbd5e1; }
    
    /* Improved Glassmorphism for Dark Mode */
    .glass { 
        background: rgba(30, 41, 59, 0.7); 
        backdrop-filter: blur(12px); 
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08); 
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); 
        border-radius: 0.75rem; 
    }
    
    .glass-input { 
        background: #0f172a; 
        border: 1px solid #334155; 
        color: white; 
        transition: all 0.2s; 
        border-radius: 0.5rem; 
    }
    .glass-input:focus { border-color: var(--primary); outline: none; ring: 2px solid rgba(59, 130, 246, 0.2); }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 2px; }
    ::-webkit-scrollbar-track { background: transparent; }

    /* Mobile Safe Area Padding */
    .safe-area-pb { padding-bottom: env(safe-area-inset-bottom); }
    
    /* Animation */
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.99); } to { opacity: 1; transform: scale(1); } }
    .animate-fade-in { animation: fadeIn 0.2s ease-out; }
    
    /* Marker Styles */
    .avatar-marker { position: relative; }
    .avatar-marker img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: transform 0.2s; }
    .avatar-marker:hover img { transform: scale(1.1); border-color: #3b82f6; z-index: 500; }
    .marker-label { position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; white-space: nowrap; pointer-events: none; }
  </style>
</head>
<body class="h-full overflow-hidden text-slate-200">
  <div id="app" class="h-full flex flex-col">

    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-slate-950">
        <div class="absolute inset-0 overflow-hidden">
            <div class="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
            <div class="absolute top-1/2 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
        </div>
        <div class="w-full max-w-sm glass p-8 shadow-2xl relative z-10 border border-slate-800">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-2xl shadow-lg shadow-blue-500/20">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <h1 class="text-2xl font-bold text-white tracking-tight">People OS</h1>
                <p class="text-slate-400 text-sm mt-1">Intelligence System</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Email / ID" class="glass-input w-full p-3.5 text-sm placeholder-slate-500" required>
                <input v-model="auth.password" type="password" placeholder="Password" class="glass-input w-full p-3.5 text-sm placeholder-slate-500" required>
                <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-lg text-sm transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    {{ loading ? 'Verifying...' : 'Access System' }}
                </button>
            </form>
        </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative bg-slate-950">
        
        <!-- DESKTOP SIDEBAR -->
        <nav class="hidden md:flex flex-col w-20 bg-slate-900 border-r border-slate-800 items-center py-6 z-20 shadow-xl">
            <div class="mb-8 text-blue-500 text-2xl"><i class="fa-solid fa-layer-group"></i></div>
            <div class="flex-1 space-y-4 w-full px-3">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'" class="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all group" :title="t.label">
                    <i :class="t.icon" class="text-xl group-hover:scale-110 transition-transform"></i>
                    <span class="text-[9px] font-bold uppercase tracking-wider">{{t.label}}</span>
                </button>
            </div>
            <button @click="openModal('cmd')" class="text-slate-400 hover:text-white p-4 transition-colors" title="Search (Cmd+K)"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button @click="openSettings" class="text-slate-400 hover:text-white p-4 transition-colors"><i class="fa-solid fa-gear"></i></button>
            <button @click="handleLogout" class="text-slate-400 hover:text-red-500 p-4 transition-colors" title="Logout"><i class="fa-solid fa-power-off"></i></button>
        </nav>

        <!-- MOBILE TOP BAR (Brand + Actions) -->
        <header class="md:hidden h-14 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 z-20 shrink-0 sticky top-0">
            <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm shadow-md">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <span class="font-bold text-base text-white tracking-tight">People OS</span>
            </div>
            <div class="flex items-center gap-1">
                 <button @click="openModal('cmd')" class="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white active:bg-slate-800 transition-colors"><i class="fa-solid fa-magnifying-glass"></i></button>
                 <button @click="openSettings" class="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white active:bg-slate-800 transition-colors"><i class="fa-solid fa-gear"></i></button>
                 <button @click="handleLogout" class="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 active:bg-slate-800 transition-colors"><i class="fa-solid fa-power-off"></i></button>
            </div>
        </header>

        <!-- CONTENT -->
        <main class="flex-1 relative overflow-hidden bg-slate-950 flex flex-col pb-20 md:pb-0 safe-area-pb">

            <!-- DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-6xl mx-auto space-y-6">
                    <!-- Stats Grid -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <div class="glass p-4 md:p-5 border-l-4 border-blue-500 relative overflow-hidden">
                            <div class="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">Profiles</div>
                            <div class="text-2xl md:text-3xl font-bold text-white mt-1">{{ stats.targets || 0 }}</div>
                            <i class="fa-solid fa-users absolute -bottom-2 -right-2 text-4xl text-white/5"></i>
                        </div>
                        <div class="glass p-4 md:p-5 border-l-4 border-amber-500 relative overflow-hidden">
                            <div class="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">Events</div>
                            <div class="text-2xl md:text-3xl font-bold text-white mt-1">{{ stats.encounters || 0 }}</div>
                            <i class="fa-solid fa-comments absolute -bottom-2 -right-2 text-4xl text-white/5"></i>
                        </div>
                        <div class="glass p-4 md:p-5 border-l-4 border-emerald-500 relative overflow-hidden">
                            <div class="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">Files</div>
                            <div class="text-2xl md:text-3xl font-bold text-white mt-1">{{ stats.evidence || 0 }}</div>
                            <i class="fa-solid fa-file absolute -bottom-2 -right-2 text-4xl text-white/5"></i>
                        </div>
                        <button @click="openModal('add-subject')" :disabled="processing" class="bg-blue-600 active:bg-blue-700 text-white p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 md:hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed">
                            <i v-if="processing" class="fa-solid fa-circle-notch fa-spin text-xl"></i>
                            <i v-else class="fa-solid fa-plus text-xl"></i>
                            <span class="text-xs font-bold uppercase tracking-wider">Add Profile</span>
                        </button>
                    </div>

                    <!-- Activity Feed -->
                    <div class="glass overflow-hidden flex flex-col h-[50vh] md:h-auto">
                        <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <h3 class="text-sm font-bold text-slate-300">Recent Updates</h3>
                            <button @click="fetchData" class="text-slate-500 hover:text-blue-400"><i class="fa-solid fa-arrows-rotate"></i></button>
                        </div>
                        <div class="divide-y divide-slate-800 overflow-y-auto flex-1">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 hover:bg-slate-800/50 active:bg-slate-800 cursor-pointer flex gap-4 items-start transition-colors">
                                <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-blue-500 shrink-0 border border-slate-700">
                                    <i class="fa-solid" :class="item.type === 'interaction' ? 'fa-comments' : (item.type === 'location' ? 'fa-location-dot' : 'fa-user')"></i>
                                </div>
                                <div class="min-w-0">
                                    <div class="text-sm font-bold text-slate-200 truncate">
                                        {{ item.title }}
                                    </div>
                                    <div class="text-xs text-slate-500 mt-0.5 truncate">{{ item.desc }} &bull; {{ new Date(item.date).toLocaleDateString() }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TARGETS LIST -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col h-full">
                <div class="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur z-10 sticky top-0">
                    <div class="relative">
                        <i class="fa-solid fa-search absolute left-3 top-3.5 text-slate-500"></i>
                        <input v-model="search" placeholder="Search profiles..." class="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-slate-600 transition-colors">
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="glass p-4 cursor-pointer hover:border-blue-500/50 transition-all group relative overflow-hidden flex gap-4 items-center">
                         <div class="w-14 h-14 bg-slate-800 rounded-lg overflow-hidden shrink-0 border border-slate-700">
                            <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center text-slate-600 text-lg font-bold">{{ s.full_name.charAt(0) }}</div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-bold text-white text-sm truncate">{{ s.full_name }}</div>
                            <div class="text-xs text-slate-500 truncate mb-1.5">{{ s.occupation || 'No Occupation' }}</div>
                            <span class="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold bg-slate-800 border border-slate-700" :class="getThreatColor(s.threat_level)">{{ s.threat_level }}</span>
                        </div>
                        <i class="fa-solid fa-chevron-right text-slate-700 absolute right-4"></i>
                    </div>
                </div>
            </div>

            <!-- GLOBAL MAP TAB (Updated) -->
            <div v-if="currentTab === 'map'" class="flex-1 flex h-full relative bg-slate-900">
                <div class="absolute inset-0 z-0" id="warRoomMap"></div>
                
                <!-- Live Map Search -->
                <div class="absolute top-4 left-1/2 -translate-x-1/2 z-[400] w-64 md:w-80">
                    <div class="relative group">
                        <input v-model="mapSearchQuery" @input="updateMapFilter" placeholder="Live Filter Map..." class="w-full bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-full py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white shadow-xl transition-all">
                        <i class="fa-solid fa-crosshairs absolute left-3.5 top-3 text-slate-400 group-focus-within:text-blue-500"></i>
                    </div>
                </div>

                <!-- Map Sidebar Overlay (Collapsible on Mobile) -->
                <div class="absolute top-16 left-4 bottom-4 w-72 glass z-[400] flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 border-slate-700/50" :class="{'translate-x-0': showMapSidebar, '-translate-x-[120%]': !showMapSidebar}">
                    <div class="p-3 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/80 backdrop-blur">
                        <h3 class="font-bold text-white text-sm">Active Points</h3>
                        <div class="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-blue-400">{{filteredMapData.length}}</div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900/50">
                        <div v-for="loc in filteredMapData" @click="flyToGlobal(loc)" class="p-2 rounded-lg hover:bg-white/5 cursor-pointer border border-transparent hover:border-slate-700 transition-all flex items-center gap-3">
                             <div class="w-8 h-8 rounded-full overflow-hidden border border-slate-600 bg-slate-800 shrink-0">
                                <img :src="resolveImg(loc.avatar_path)" class="w-full h-full object-cover">
                             </div>
                             <div class="min-w-0">
                                <div class="font-bold text-xs text-slate-200 truncate">{{loc.full_name}}</div>
                                <div class="text-[10px] text-slate-500 truncate">{{loc.name}}</div>
                             </div>
                        </div>
                    </div>
                </div>
                
                <!-- Toggle Button (Visible when sidebar hidden) -->
                <button @click="showMapSidebar = !showMapSidebar" class="absolute top-16 left-4 z-[401] bg-slate-900 p-2.5 rounded-full shadow-lg text-white border border-slate-700 active:scale-95 transition-transform" v-if="!showMapSidebar">
                    <i class="fa-solid fa-list-ul"></i>
                </button>
            </div>

            <!-- GLOBAL NETWORK TAB (Updated) -->
            <div v-if="currentTab === 'network'" class="flex-1 flex flex-col h-full bg-slate-950 relative">
                <div class="absolute top-4 left-4 z-10 glass px-4 py-2 border-slate-700/50">
                    <h3 class="font-bold text-white text-sm">Global Relations</h3>
                    <p class="text-xs text-slate-500">Entity Graph</p>
                </div>
                <div id="globalNetworkGraph" class="w-full h-full bg-slate-950"></div>
            </div>

            <!-- SUBJECT DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col h-full bg-slate-950">
                
                <!-- DETAIL HEADER -->
                <div class="h-16 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900/80 backdrop-blur z-10 sticky top-0">
                    <div class="flex items-center gap-3">
                        <button @click="changeTab('targets')" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="min-w-0">
                            <div class="font-bold text-white text-sm truncate max-w-[150px] md:max-w-none">{{ selected.full_name }}</div>
                            <div class="text-xs text-slate-500 truncate">{{ selected.alias || 'Profile View' }}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="openModal('edit-profile')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700"><i class="fa-solid fa-pen md:mr-2"></i><span class="hidden md:inline">Edit</span></button>
                        <button @click="openModal('share-secure')" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg shadow-blue-500/20"><i class="fa-solid fa-share-nodes md:mr-2"></i><span class="hidden md:inline">Share</span></button>
                    </div>
                </div>

                <!-- SUB TABS -->
                <div class="flex border-b border-slate-800 overflow-x-auto bg-slate-900/50 shrink-0 no-scrollbar">
                    <button v-for="t in ['Overview', 'Attributes', 'Timeline', 'Map', 'Network', 'Files']" 
                        @click="changeSubTab(t.toLowerCase())" 
                        :class="subTab === t.toLowerCase() ? 'text-blue-400 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border-transparent'"
                        class="px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-1 md:flex-none text-center">
                        {{ t }}
                    </button>
                </div>

                <!-- DETAIL CONTENT (Same as before, skipped for brevity in diff but included in logic) -->
                <!-- ... existing detail content ... -->
                <div class="flex-1 overflow-y-auto p-4 md:p-8">
                    <!-- PROFILE -->
                    <div v-if="subTab === 'overview'" class="space-y-6 max-w-5xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-[4/5] bg-slate-800 rounded-xl relative overflow-hidden group shadow-2xl border border-slate-700/50">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                    <button @click="triggerUpload('avatar')" class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-all backdrop-blur-sm"><i class="fa-solid fa-camera mr-2"></i> Change Photo</button>
                                </div>
                                <div class="glass p-4 border-slate-700/50">
                                    <div class="text-xs text-slate-500 font-bold uppercase mb-2">Priority Level</div>
                                    <div class="flex justify-between items-center">
                                        <span class="text-lg font-bold" :class="getThreatColor(selected.threat_level)">{{selected.threat_level}}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-6">
                                <div class="glass p-5 border-l-4 border-blue-500 bg-blue-900/10">
                                    <h3 class="text-sm font-bold text-blue-400 mb-2">Profile Summary</h3>
                                    <p class="text-sm text-slate-300 leading-relaxed">{{ analysisResult?.summary || 'Insufficient data for summary.' }}</p>
                                    <div class="flex gap-2 mt-3 flex-wrap">
                                        <span v-for="tag in analysisResult?.tags" class="text-[10px] px-2 py-1 bg-blue-900/40 text-blue-300 rounded border border-blue-800 font-bold">{{tag}}</span>
                                    </div>
                                </div>
                                <div class="glass p-6 md:p-8 border-slate-700/50">
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                                        <div><label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Full Name</label><div class="text-white border-b border-slate-700 pb-2">{{selected.full_name}}</div></div>
                                        <div><label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Nationality</label><div class="text-white border-b border-slate-700 pb-2">{{selected.nationality || 'Unspecified'}}</div></div>
                                        <div><label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Occupation</label><div class="text-white border-b border-slate-700 pb-2">{{selected.occupation || 'Unspecified'}}</div></div>
                                        <div><label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Affiliation</label><div class="text-white border-b border-slate-700 pb-2">{{selected.ideology || 'Unspecified'}}</div></div>
                                    </div>
                                    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label class="text-[10px] text-slate-500 uppercase font-bold block mb-2">Routine & Habits</label>
                                            <div class="text-sm text-slate-400 bg-slate-900/50 p-3 rounded-lg h-32 overflow-y-auto whitespace-pre-wrap border border-slate-800">{{selected.modus_operandi || 'No routine notes.'}}</div>
                                        </div>
                                        <div>
                                            <label class="text-[10px] text-slate-500 uppercase font-bold block mb-2">Sensitivities / Notes</label>
                                            <div class="text-sm text-slate-400 bg-slate-900/50 p-3 rounded-lg h-32 overflow-y-auto whitespace-pre-wrap border border-slate-800">{{selected.weakness || 'No private notes.'}}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- ATTRIBUTES -->
                    <div v-if="subTab === 'attributes'" class="max-w-5xl mx-auto space-y-6">
                         <div class="flex justify-between items-center">
                            <h3 class="font-bold text-lg text-white">Detailed Attributes</h3>
                            <button @click="openModal('add-intel')" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
                                <i class="fa-solid fa-plus mr-2"></i>Add Attribute
                            </button>
                        </div>
                        <div v-for="(items, category) in groupedIntel" :key="category" class="space-y-3">
                            <h4 class="text-xs font-bold uppercase text-slate-500 border-b border-slate-800 pb-1">{{ category }}</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                <div v-for="item in items" :key="item.id" class="glass p-4 relative group hover:border-blue-500/50 transition-colors border-slate-700/50">
                                    <div class="text-[10px] text-slate-500 uppercase font-bold mb-1">{{item.label}}</div>
                                    <div class="text-slate-200 font-medium break-words text-sm">{{item.value}}</div>
                                    <button @click="deleteItem('subject_intel', item.id)" class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                        <div v-if="!selected.intel.length" class="text-center py-12 text-slate-600 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                            No detailed attributes logged yet.
                        </div>
                    </div>

                    <!-- TIMELINE -->
                    <div v-show="subTab === 'timeline'" class="h-full flex flex-col space-y-4">
                        <div class="flex justify-between items-center">
                             <h3 class="font-bold text-lg text-white">History</h3>
                             <button @click="openModal('add-interaction')" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold border border-slate-700">Log Event</button>
                        </div>
                        <div class="flex-1 glass p-6 overflow-y-auto border-slate-700/50">
                            <div class="relative pl-8 border-l-2 border-slate-800 space-y-8 my-4">
                                <div v-for="ix in selected.interactions" :key="ix.id" class="relative group">
                                    <div class="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-slate-900 border-4 border-blue-600"></div>
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                                        <span class="text-sm font-bold text-white">{{ix.type}}</span>
                                        <span class="text-xs font-mono text-slate-500">{{new Date(ix.date).toLocaleString()}}</span>
                                    </div>
                                    <div class="bg-slate-900/50 p-4 rounded-lg text-sm text-slate-300 border border-slate-800 whitespace-pre-wrap">{{ix.transcript || ix.conclusion || 'No details recorded.'}}</div>
                                </div>
                                <div v-if="!selected.interactions.length" class="text-slate-500 italic">No history found.</div>
                            </div>
                        </div>
                    </div>

                    <!-- MAP (Detail) -->
                    <div v-show="subTab === 'map'" class="h-full flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-lg text-white">Known Locations</h3>
                            <button @click="openModal('add-location')" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold border border-slate-700">Add Location</button>
                        </div>
                        <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="md:col-span-2 bg-slate-900 rounded-xl overflow-hidden relative h-64 md:h-full min-h-[300px] border border-slate-800">
                                <div id="subjectMap" class="w-full h-full z-0"></div>
                            </div>
                            <div class="space-y-3 overflow-y-auto max-h-[600px]">
                                <div v-for="loc in selected.locations" :key="loc.id" class="glass p-4 cursor-pointer hover:border-blue-500/50 transition-all border-slate-700/50" @click="flyTo(loc)">
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="font-bold text-white text-sm">{{loc.name}}</div>
                                        <span class="text-[10px] uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{{loc.type}}</span>
                                    </div>
                                    <div class="text-xs text-slate-500 mb-2">{{loc.address}}</div>
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-xs text-red-500 hover:text-red-400">Remove</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- NETWORK (Detail) -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-lg text-white">Connections Graph</h3>
                            <button @click="openModal('add-rel')" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold border border-slate-700">Add Connection</button>
                        </div>
                        <div class="flex-1 glass border border-slate-700/50 relative overflow-hidden min-h-[400px]">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
                    </div>
                    
                    <!-- FILES (Detail) -->
                    <div v-if="subTab === 'files'" class="space-y-6">
                        <div class="flex flex-col md:flex-row gap-6">
                            <div class="space-y-3 w-full md:w-56 shrink-0">
                                <div @click="triggerUpload('media')" class="h-28 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/30 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-all text-slate-500 hover:text-blue-400 group">
                                    <i class="fa-solid fa-cloud-arrow-up text-2xl mb-1 group-hover:scale-110 transition-transform"></i>
                                    <span class="text-xs font-bold uppercase">Upload</span>
                                </div>
                                <div @click="openModal('add-media-link')" class="h-10 rounded-xl border border-slate-700 bg-slate-800 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition-all text-slate-400 hover:text-white gap-2">
                                    <i class="fa-solid fa-link text-sm"></i>
                                    <span class="text-xs font-bold uppercase">Link URL</span>
                                </div>
                            </div>
                            <div class="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                <div v-for="m in selected.media" :key="m.id" class="glass group relative aspect-square overflow-hidden hover:shadow-xl transition-all rounded-xl border-slate-700/50">
                                    <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transition-transform group-hover:scale-105" onerror="this.src='https://placehold.co/400?text=IMG'">
                                    <div v-else class="w-full h-full flex items-center justify-center text-slate-500 bg-slate-900"><i class="fa-solid fa-file text-4xl"></i></div>
                                    <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0 z-10"></a>
                                    <div class="absolute bottom-0 inset-x-0 bg-black/80 p-2 text-[10px] font-medium truncate backdrop-blur-sm text-slate-300">{{m.description}}</div>
                                    <button @click.stop="deleteItem('subject_media', m.id)" class="absolute top-1 right-1 bg-red-500/90 text-white w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110"><i class="fa-solid fa-times text-xs"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </main>

        <!-- MOBILE BOTTOM NAV -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 flex justify-around items-center z-50 safe-area-pb">
            <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'text-blue-500' : 'text-slate-500'" class="flex flex-col items-center justify-center w-full h-full active:scale-95 transition-transform">
                <i :class="t.icon" class="text-xl mb-1"></i>
                <span class="text-[10px] font-medium">{{t.label}}</span>
            </button>
        </nav>

    </div>

    <!-- MODAL -->
    <div v-if="modal.active" class="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-2xl glass bg-slate-900 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in border border-slate-700">
            <div class="flex justify-between items-center p-4 border-b border-slate-800 shrink-0 bg-slate-900/50">
                <h3 class="font-bold text-white">{{ modalTitle }}</h3>
                <button @click="closeModal" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="overflow-y-auto p-4 md:p-6 space-y-6">
                <!-- COMMAND PALETTE -->
                <div v-if="modal.active === 'cmd'">
                    <input ref="cmdInput" v-model="cmdQuery" placeholder="Type to search..." class="glass-input w-full p-4 text-lg mb-4 bg-slate-950 border-slate-700 focus:border-blue-500">
                    <div class="space-y-2">
                        <div v-for="res in cmdResults" @click="res.action" class="p-3 rounded-lg hover:bg-blue-500/10 cursor-pointer flex justify-between items-center border border-transparent hover:border-blue-500/30 transition-colors">
                             <div>
                                <div class="font-bold text-sm text-white">{{res.title}}</div>
                                <div class="text-xs text-slate-400">{{res.desc}}</div>
                             </div>
                             <i class="fa-solid fa-arrow-right text-slate-600 text-xs"></i>
                        </div>
                    </div>
                </div>
                
                <!-- (OTHER FORMS FROM PREVIOUS VERSIONS GO HERE - REUSED FOR BREVITY) -->
                <!-- Use the logic from previous response for forms (subject, interaction, etc.) -->
                <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        <div class="space-y-4">
                            <label class="block text-xs font-bold uppercase text-slate-500">Identity</label>
                            <input v-model="forms.subject.full_name" placeholder="Full Name *" class="glass-input w-full p-3 text-sm" required>
                            <input v-model="forms.subject.alias" placeholder="Nickname / Alias" class="glass-input w-full p-3 text-sm">
                            <input v-model="forms.subject.occupation" list="list-occupations" placeholder="Occupation" class="glass-input w-full p-3 text-sm">
                            <input v-model="forms.subject.nationality" list="list-nationalities" placeholder="Nationality" class="glass-input w-full p-3 text-sm">
                            <input v-model="forms.subject.avatar_path" placeholder="Avatar URL (Optional)" class="glass-input w-full p-3 text-sm text-blue-400">
                        </div>
                        <div class="space-y-4">
                             <label class="block text-xs font-bold uppercase text-slate-500">Status</label>
                             <select v-model="forms.subject.threat_level" class="glass-input w-full p-3 text-sm">
                                <option value="Low">Low Priority</option>
                                <option value="Medium">Medium Priority</option>
                                <option value="High">High Priority</option>
                                <option value="Critical">Critical</option>
                            </select>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="date" v-model="forms.subject.dob" class="glass-input w-full p-3 text-sm text-slate-400" title="Date of Birth">
                                <input type="number" v-model="forms.subject.age" placeholder="Age" class="glass-input w-full p-3 text-sm" title="Age (Auto-calc)">
                            </div>
                             <input v-model="forms.subject.ideology" list="list-ideologies" placeholder="Affiliation / Group" class="glass-input w-full p-3 text-sm">
                        </div>
                    </div>
                    
                    <div class="space-y-4">
                        <label class="block text-xs font-bold uppercase text-slate-500">Details</label>
                        <textarea v-model="forms.subject.modus_operandi" placeholder="Routine & Habits..." rows="3" class="glass-input w-full p-3 text-sm"></textarea>
                        <textarea v-model="forms.subject.weakness" placeholder="Sensitivities & Notes..." rows="3" class="glass-input w-full p-3 text-sm"></textarea>
                    </div>

                    <div class="pt-4 border-t border-slate-800">
                        <h4 class="text-xs font-bold uppercase text-slate-500 mb-4">Physical Stats</h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <input v-model="forms.subject.height" placeholder="Height" class="glass-input p-2 text-xs">
                            <input v-model="forms.subject.weight" placeholder="Weight" class="glass-input p-2 text-xs">
                            <input v-model="forms.subject.blood_type" placeholder="Blood Type" class="glass-input p-2 text-xs">
                        </div>
                    </div>

                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-lg text-sm mt-4 shadow-lg shadow-blue-500/20 active:scale-[0.99] transition-transform flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                        <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                        {{ processing ? 'Saving...' : 'Save Profile' }}
                    </button>
                </form>

                <!-- ADD ATTRIBUTE -->
                <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <select v-model="forms.intel.category" class="glass-input w-full p-3 text-sm">
                        <option>General</option>
                        <option>Contact Info</option>
                        <option>Social Media</option>
                        <option>Education</option>
                        <option>Financial</option>
                        <option>Medical</option>
                        <option>Family</option>
                    </select>
                    <input v-model="forms.intel.label" placeholder="Label (e.g., 'Instagram', 'University')" class="glass-input w-full p-3 text-sm" required>
                    <textarea v-model="forms.intel.value" placeholder="Value / Detail" rows="3" class="glass-input w-full p-3 text-sm" required></textarea>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                        {{ processing ? 'Adding...' : 'Add Attribute' }}
                    </button>
                 </form>

                 <!-- ADD MEDIA LINK -->
                 <form v-if="modal.active === 'add-media-link'" @submit.prevent="submitMediaLink" class="space-y-4">
                    <input v-model="forms.mediaLink.url" placeholder="Paste Image/File URL *" class="glass-input w-full p-3 text-sm" required>
                    <input v-model="forms.mediaLink.description" placeholder="Description / Label" class="glass-input w-full p-3 text-sm">
                    <select v-model="forms.mediaLink.type" class="glass-input w-full p-3 text-sm">
                        <option value="image/jpeg">Image</option>
                        <option value="application/pdf">Document</option>
                        <option value="video/mp4">Video</option>
                        <option value="text/plain">Other</option>
                    </select>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                        {{ processing ? 'Saving...' : 'Save Link' }}
                    </button>
                 </form>

                 <!-- SECURE SHARE -->
                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <p class="text-sm text-slate-400">Create a temporary, secure link to share this profile dossier.</p>
                    <div class="flex gap-2">
                        <select v-model="forms.share.minutes" class="glass-input w-32 p-2 text-sm">
                            <option :value="30">30 Mins</option>
                            <option :value="60">1 Hour</option>
                            <option :value="1440">24 Hours</option>
                            <option :value="10080">7 Days</option>
                        </select>
                        <button @click="createShareLink" :disabled="processing" class="flex-1 bg-blue-600 text-white font-bold rounded-lg text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50">
                            <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                            Generate Link
                        </button>
                    </div>
                    <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                        <div v-for="link in activeShareLinks" class="flex justify-between items-center p-3 bg-slate-800 rounded-lg border border-slate-700">
                            <div>
                                <div class="text-xs font-mono text-slate-400">...{{link.token.slice(-8)}}</div>
                                <div class="text-[10px] text-slate-500">{{link.is_active ? 'Active' : 'Expired'}} &bull; {{link.views}} views</div>
                            </div>
                            <div class="flex gap-2">
                                <button @click="copyToClipboard(getShareUrl(link.token))" class="text-blue-500 hover:text-blue-400 p-2"><i class="fa-regular fa-copy"></i></button>
                                <button v-if="link.is_active" @click="revokeLink(link.token)" class="text-red-500 hover:text-red-400 p-2"><i class="fa-solid fa-ban"></i></button>
                            </div>
                        </div>
                    </div>
                 </div>
                 
                 <!-- LOCATION PICKER -->
                 <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                    <div class="relative">
                         <input v-model="locationSearchQuery" @input="debounceSearch" placeholder="Search places..." class="glass-input w-full p-3 pl-10 text-sm">
                         <i class="fa-solid fa-search absolute left-3 top-3.5 text-slate-400"></i>
                         <div v-if="isSearching" class="absolute right-3 top-3.5 text-slate-400"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
                         <div v-if="locationSearchResults.length" class="absolute w-full bg-slate-800 border border-slate-700 max-h-48 overflow-y-auto mt-1 shadow-xl rounded-lg z-50">
                             <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-slate-700 cursor-pointer text-xs border-b border-slate-700 text-slate-300">
                                 {{ res.display_name }}
                             </div>
                         </div>
                    </div>
                    <div class="h-48 w-full bg-slate-800 rounded-lg border border-slate-700 relative overflow-hidden">
                        <div id="locationPickerMap" class="absolute inset-0 z-0"></div>
                    </div>
                    <input v-model="forms.location.name" placeholder="Name (e.g. Home)" class="glass-input w-full p-3 text-sm">
                    <select v-model="forms.location.type" class="glass-input w-full p-3 text-sm">
                        <option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Other</option>
                    </select>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                        {{ processing ? 'Saving...' : 'Add Pin' }}
                    </button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="glass-input p-3 text-sm" required>
                        <select v-model="forms.interaction.type" class="glass-input p-3 text-sm">
                            <option>Meeting</option><option>Call</option><option>Email</option><option>Event</option><option>Observation</option>
                        </select>
                    </div>
                    <textarea v-model="forms.interaction.transcript" placeholder="Details & Notes" rows="5" class="glass-input w-full p-3 text-sm"></textarea>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                        {{ processing ? 'Logging...' : 'Log Event' }}
                    </button>
                </form>

                 <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                    <select v-model="forms.rel.targetId" class="glass-input w-full p-3 text-sm">
                        <option v-for="s in subjects" :value="s.id">{{s.full_name}} ({{s.occupation}})</option>
                    </select>
                    <input v-model="forms.rel.type" placeholder="Relationship (e.g., Colleague, Spouse)" class="glass-input w-full p-3 text-sm">
                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                        {{ processing ? 'Linking...' : 'Link Profiles' }}
                    </button>
                 </form>
            </div>
        </div>
    </div>

    <!-- Hidden Input -->
    <input type="file" ref="fileInput" class="absolute opacity-0 -z-10 w-0 h-0 overflow-hidden" @change="handleFile">
    <datalist id="list-occupations"><option v-for="i in suggestions.occupations" :value="i"></option></datalist>
    <datalist id="list-nationalities"><option v-for="i in suggestions.nationalities" :value="i"></option></datalist>
    <datalist id="list-ideologies"><option v-for="i in suggestions.ideologies" :value="i"></option></datalist>

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        const view = ref('auth');
        const loading = ref(false);
        const processing = ref(false); // Global processing state
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', icon: 'fa-solid fa-chart-pie', label: 'Dashboard' },
            { id: 'targets', icon: 'fa-solid fa-users', label: 'Targets' },
            { id: 'map', icon: 'fa-solid fa-earth-americas', label: 'Map' },
            { id: 'network', icon: 'fa-solid fa-circle-nodes', label: 'Network' },
        ];
        
        const params = new URLSearchParams(window.location.search);
        const initialTab = params.get('tab') || localStorage.getItem('active_tab') || 'dashboard';
        const currentTab = ref(initialTab);
        const subTab = ref(params.get('subTab') || 'overview');
        
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const suggestions = reactive({ occupations: [], nationalities: [], ideologies: [] });
        const selected = ref(null);
        const activeShareLinks = ref([]);
        const search = ref('');
        const modal = reactive({ active: null });
        const analysisResult = ref(null);
        const mapData = ref([]);
        const showMapSidebar = ref(window.innerWidth >= 768); 
        const mapSearchQuery = ref('');
        
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        const isSearching = ref(false);
        let pickerMapInstance = null;
        let mapInstance = null;
        let warRoomMapInstance = null;
        let searchTimeout = null;
        let polylineLayer = null;
        let markerLayer = null;
        
        const cmdQuery = ref('');
        const cmdInput = ref(null);

        const forms = reactive({
            subject: {}, interaction: {}, location: {}, intel: {}, rel: {}, share: { minutes: 60 }, mediaLink: {}
        });

        // ... (computed properties same as before) ...
        const filteredSubjects = computed(() => subjects.value.filter(s => 
            s.full_name.toLowerCase().includes(search.value.toLowerCase()) || 
            (s.alias && s.alias.toLowerCase().includes(search.value.toLowerCase()))
        ));

        const filteredMapData = computed(() => {
            if (!mapSearchQuery.value) return mapData.value;
            const q = mapSearchQuery.value.toLowerCase();
            return mapData.value.filter(d => 
                d.full_name.toLowerCase().includes(q) || 
                d.name.toLowerCase().includes(q)
            );
        });

        const groupedIntel = computed(() => {
            if(!selected.value?.intel) return {};
            return selected.value.intel.reduce((acc, item) => {
                (acc[item.category] = acc[item.category] || []).push(item);
                return acc;
            }, {});
        });

        const cmdResults = computed(() => {
            const q = cmdQuery.value.toLowerCase();
            if(!q) return [];
            const results = [];
            subjects.value.forEach(s => {
                if(s.full_name.toLowerCase().includes(q)) {
                    results.push({ title: s.full_name, desc: s.occupation, action: () => { viewSubject(s.id); closeModal(); } });
                }
            });
            return results.slice(0, 5);
        });

        const updateUrl = () => {
            const url = new URL(window.location);
            url.searchParams.set('tab', currentTab.value);
            if(currentTab.value === 'detail' && selected.value) {
                url.searchParams.set('subTab', subTab.value);
                url.searchParams.set('id', selected.value.id);
            }
            window.history.replaceState({}, '', url);
            localStorage.setItem('active_tab', currentTab.value);
        };

        const modalTitle = computed(() => {
             const m = { 'add-subject':'Add New Profile', 'edit-profile':'Edit Profile', 'add-interaction':'Log Event', 'add-location':'Add Location', 'add-intel':'Add Attribute', 'add-rel':'Add Connection', 'share-secure':'Share Profile', 'add-media-link': 'Add External Media' };
             return m[modal.active] || 'Search';
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

        const viewSubject = async (id, isRestoring = false) => {
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            if(!isRestoring) subTab.value = 'overview'; 
            analysisResult.value = analyzeLocal(selected.value);
            updateUrl();
        };

        const analyzeLocal = (s) => {
             const points = (s.intel?.length || 0) + (s.interactions?.length || 0);
             const completeness = Math.min(100, Math.floor(points * 5));
             const tags = [];
             if(s.intel?.some(i => i.category === 'Social Media')) tags.push('Digital');
             if(s.interactions?.length > 5) tags.push('Frequent Contact');
             return { summary: \`Profile is \${completeness}% complete based on collected data points.\`, tags };
        };

        // Initialize Map Logic (FIXED RESIZING ISSUE)
        const initMap = (id, data, isPicker = false) => {
            const el = document.getElementById(id);
            if(!el) return;
            
            if(isPicker && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; }
            if(!isPicker && id === 'subjectMap' && mapInstance) { mapInstance.remove(); mapInstance = null; }
            if(!isPicker && id === 'warRoomMap' && warRoomMapInstance) { warRoomMapInstance.remove(); warRoomMapInstance = null; polylineLayer = null; markerLayer = null; }

            const map = L.map(id, { attributionControl: false, zoomControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
            L.control.zoom({ position: 'bottomright' }).addTo(map);

            // FIX: Invalidate size for ALL maps after a short delay to ensure correct rendering
            setTimeout(() => map.invalidateSize(), 200);

            if(isPicker) {
                 pickerMapInstance = map;
                 map.on('click', e => {
                    forms.location.lat = e.latlng.lat;
                    forms.location.lng = e.latlng.lng;
                    map.eachLayer(l => { if(l instanceof L.Marker) map.removeLayer(l); });
                    L.marker(e.latlng).addTo(map);
                 });
            } else {
                if(id === 'subjectMap') mapInstance = map;
                else warRoomMapInstance = map;

                renderMapData(map, data);
            }
        };

        const renderMapData = (map, data) => {
            if(!map) return;
            map.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    map.removeLayer(layer);
                }
            });

            const grouped = data.reduce((acc, loc) => {
                if(!acc[loc.subject_id]) acc[loc.subject_id] = { locations: [], avatar: loc.avatar_path, name: loc.full_name };
                if(loc.lat) acc[loc.subject_id].locations.push(loc);
                return acc;
            }, {});

            Object.values(grouped).forEach(group => {
                if(group.locations.length > 1) {
                    const latlngs = group.locations.map(l => [l.lat, l.lng]);
                    L.polyline(latlngs, { color: '#3b82f6', weight: 2, opacity: 0.6, dashArray: '5, 10' }).addTo(map);
                }
                group.locations.forEach(loc => {
                    if(!loc.lat) return;
                    const avatarUrl = resolveImg(loc.avatar_path);
                    const iconHtml = \`<div class="avatar-marker w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden bg-slate-800">
                        <img src="\${avatarUrl}">
                        <div class="marker-label">\${loc.name}</div>
                    </div>\`;
                    const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -20] });
                    const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(map);
                    marker.bindPopup(\`
                        <div class="text-slate-800">
                            <strong>\${loc.full_name}</strong><br>
                            \${loc.name} (\${loc.type})
                        </div>
                    \`);
                });
            });
        };

        const updateMapFilter = () => { if(warRoomMapInstance) renderMapData(warRoomMapInstance, filteredMapData.value); };

        const flyToGlobal = (loc) => {
            if(warRoomMapInstance) {
                warRoomMapInstance.flyTo([loc.lat, loc.lng], 15);
                if(window.innerWidth < 768) showMapSidebar.value = false;
            }
        };
        
        // Use this specific flyTo for subject detail map
        const flyTo = (loc) => {
             if(mapInstance) mapInstance.flyTo([loc.lat, loc.lng], 15);
        };

        // ... (Debounce, SelectLocation, etc. same as before) ...
        const debounceSearch = () => {
            clearTimeout(searchTimeout);
            isSearching.value = true;
            searchTimeout = setTimeout(async () => {
                if(!locationSearchQuery.value) { locationSearchResults.value = []; isSearching.value = false; return; }
                const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(locationSearchQuery.value)}\`);
                locationSearchResults.value = await res.json();
                isSearching.value = false;
            }, 500);
        };

        const selectLocation = (res) => {
            forms.location.lat = parseFloat(res.lat);
            forms.location.lng = parseFloat(res.lon);
            forms.location.address = res.display_name;
            locationSearchResults.value = [];
            if(pickerMapInstance) {
                pickerMapInstance.setView([res.lat, res.lon], 15);
                L.marker([res.lat, res.lon]).addTo(pickerMapInstance);
            }
        };

        const changeTab = (t) => { currentTab.value = t; updateUrl(); };
        const changeSubTab = (t) => { subTab.value = t; updateUrl(); };
        const openModal = (t) => {
             modal.active = t;
             if(t === 'add-subject') forms.subject = { admin_id: localStorage.getItem('admin_id'), threat_level: 'Low', status: 'Active' };
             if(t === 'edit-profile') forms.subject = { ...selected.value };
             if(t === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) };
             if(t === 'add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' };
             if(t === 'add-rel') forms.rel = { subjectA: selected.value.id };
             if(t === 'add-media-link') forms.mediaLink = { subjectId: selected.value.id, type: 'image/jpeg' };
             if(t === 'add-location') {
                 forms.location = { subject_id: selected.value.id };
                 locationSearchQuery.value = '';
                 nextTick(() => initMap('locationPickerMap', [], true));
             }
             if(t === 'share-secure') fetchShareLinks();
             if(t === 'cmd') nextTick(() => cmdInput.value?.focus());
        };
        const closeModal = () => modal.active = null;

        watch(() => subTab.value, (val) => {
            if(val === 'map') nextTick(() => initMap('subjectMap', selected.value.locations || []));
            if(val === 'network') nextTick(() => {
                 const container = document.getElementById('relNetwork');
                 if(!container || !selected.value) return;
                 const nodes = [{id: selected.value.id, label: selected.value.full_name, color: '#2563eb', size: 30}];
                 const edges = [];
                 selected.value.relationships.forEach(r => {
                    const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                    nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, color: '#94a3b8' });
                    edges.push({ from: selected.value.id, to: targetId || 'ext-'+r.id, label: r.relationship_type, font: { align: 'middle' } });
                 });
                 new vis.Network(container, { nodes, edges }, { nodes: { shape: 'dot' } });
            });
        });

        watch(() => currentTab.value, (val) => {
             updateUrl();
             if(val === 'map') nextTick(async () => {
                 const d = await api('/map-data?adminId=' + localStorage.getItem('admin_id'));
                 mapData.value = d;
                 initMap('warRoomMap', d);
             });
             if(val === 'network') nextTick(async () => {
                const data = await api('/global-network?adminId=' + localStorage.getItem('admin_id'));
                const container = document.getElementById('globalNetworkGraph');
                const options = {
                    nodes: { 
                        shape: 'circularImage', borderWidth: 2, size: 25, 
                        color: { border: '#e2e8f0', background: '#fff' },
                        font: { color: '#94a3b8', size: 12 } 
                    },
                    edges: { color: { color: '#475569' }, width: 1, font: { color: '#cbd5e1', strokeWidth: 0, align: 'middle' } },
                    physics: { stabilization: true }
                };
                
                data.nodes.forEach(n => { 
                    n.image = n.image ? (n.image.startsWith('http') ? n.image : '/api/media/'+n.image) : 'https://ui-avatars.com/api/?background=random&name='+n.label;
                    if(n.group === 'Critical') n.color = { border: '#ef4444' };
                    if(n.group === 'High') n.color = { border: '#f97316' };
                });

                new vis.Network(container, data, options);
             });
        });

        watch(() => forms.subject.dob, (val) => {
            if(!val) return;
            const dob = new Date(val);
            const diff = Date.now() - dob.getTime();
            const age = new Date(diff).getUTCFullYear() - 1970;
            if (forms.subject.age !== age) forms.subject.age = age;
        });

        watch(() => forms.subject.age, (val) => {
            if (val && !forms.subject.dob) {
                const year = new Date().getFullYear() - val;
                forms.subject.dob = \`\${year}-01-01\`;
            }
        });

        // CRUD with Processing State
        const submitSubject = async () => {
            if (processing.value) return;
            processing.value = true;
            try {
                const isEdit = modal.active === 'edit-profile';
                const ep = isEdit ? '/subjects/' + selected.value.id : '/subjects';
                await api(ep, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(forms.subject) });
                if(isEdit) selected.value = { ...selected.value, ...forms.subject };
                else fetchData();
                closeModal();
            } finally { processing.value = false; }
        };
        const submitInteraction = async () => { 
            if (processing.value) return; processing.value = true;
            try { await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; }
        };
        const submitLocation = async () => { 
            if (processing.value) return; processing.value = true;
            try { await api('/location', { method: 'POST', body: JSON.stringify(forms.location) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; }
        };
        const submitIntel = async () => { 
            if (processing.value) return; processing.value = true;
            try { await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; }
        };
        const submitRel = async () => { 
            if (processing.value) return; processing.value = true;
            try { await api('/relationship', { method: 'POST', body: JSON.stringify({...forms.rel, subjectA: selected.value.id}) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; }
        };
        const submitMediaLink = async () => { 
            if (processing.value) return; processing.value = true;
            try { await api('/media-link', { method: 'POST', body: JSON.stringify(forms.mediaLink) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; }
        };
        const deleteItem = async (table, id) => { if(confirm('Delete item?')) { await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) }); viewSubject(selected.value.id); } };
        
        const fileInput = ref(null);
        const uploadType = ref(null);
        const triggerUpload = (type) => { uploadType.value = type; fileInput.value.click(); };
        const handleFile = async (e) => {
             const f = e.target.files[0];
             if(!f) return;
             e.target.value = '';
             const reader = new FileReader();
             reader.readAsDataURL(f);
             reader.onload = async (ev) => {
                 const b64 = ev.target.result.split(',')[1];
                 const ep = uploadType.value === 'avatar' ? '/upload-avatar' : '/upload-media';
                 await api(ep, { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, data: b64, filename: f.name, contentType: f.type }) });
                 viewSubject(selected.value.id);
             };
        };

        const fetchShareLinks = async () => { activeShareLinks.value = await api('/share-links?subjectId=' + selected.value.id); };
        const createShareLink = async () => { await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes }) }); fetchShareLinks(); };
        const revokeLink = async (t) => { await api('/share-links?token='+t, { method: 'DELETE' }); fetchShareLinks(); };
        const copyToClipboard = (t) => navigator.clipboard.writeText(t);
        const getShareUrl = (t) => window.location.origin + '/share/' + t;
        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
        const getThreatColor = (l, isBg = false) => {
             const c = { 'Critical': 'red', 'High': 'orange', 'Medium': 'amber', 'Low': 'emerald' }[l] || 'slate';
             return isBg ? \`bg-\${c}-100 text-\${c}-700\` : \`text-\${c}-600\`;
        };
        const openSettings = () => { 
            if(confirm("FULL SYSTEM RESET: This will wipe all subjects, data, and admin accounts. You will be logged out.")) {
                api('/nuke', {method:'POST'}).then(() => {
                    localStorage.clear();
                    window.location.href = '/';
                });
            }
        };

        // NEW LOGOUT FUNCTION
        const handleLogout = () => {
             if(confirm("Are you sure you want to log out?")) {
                 localStorage.removeItem('admin_id');
                 localStorage.removeItem('active_tab');
                 location.reload();
             }
        };

        onMounted(() => {
            if(localStorage.getItem('admin_id')) {
                view.value = 'app';
                fetchData();
                const id = params.get('id');
                if(id) viewSubject(id, true);
            }
        });

        return {
            view, loading, processing, auth, tabs, currentTab, subTab, stats, feed, subjects, filteredSubjects, selected, search, modal, forms,
            analysisResult, cmdQuery, cmdResults, cmdInput, locationSearchQuery, locationSearchResults, modalTitle, groupedIntel,
            handleAuth, fetchData, viewSubject, changeTab, changeSubTab, openModal, closeModal, 
            submitSubject, submitInteraction, submitLocation, submitIntel, submitRel, triggerUpload, handleFile, deleteItem,
            fetchShareLinks, createShareLink, revokeLink, copyToClipboard, getShareUrl, resolveImg, getThreatColor,
            activeShareLinks, suggestions, debounceSearch, selectLocation, openSettings, handleLogout,
            isSearching, mapData, showMapSidebar, flyToGlobal, flyTo, fileInput, submitMediaLink, mapSearchQuery, updateMapFilter, filteredMapData
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

        // Share Page
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
            if (hashed !== admin.password_hash) return errorResponse('ACCESS DENIED', 401);
            return response({ id: admin.id });
        }

        // Dashboard & Stats
        if (path === '/api/dashboard') return handleGetDashboard(env.DB, url.searchParams.get('adminId'));
        if (path === '/api/suggestions') return handleGetSuggestions(env.DB, url.searchParams.get('adminId'));
        if (path === '/api/global-network') return handleGetGlobalNetwork(env.DB, url.searchParams.get('adminId'));
        
        // Subject CRUD
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                const p = await req.json();
                const now = isoTimestamp();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, dob, age, height, weight, blood_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(safeVal(p.admin_id), safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.dob), safeVal(p.age), safeVal(p.height), safeVal(p.weight), safeVal(p.blood_type), now, now).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(url.searchParams.get('adminId')).all();
            return response(res.results);
        }

        if (path === '/api/map-data') return handleGetMapData(env.DB, url.searchParams.get('adminId'));

        const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
        if (idMatch) {
            const id = idMatch[1];
            if(req.method === 'PATCH') {
                const p = await req.json();
                
                // FIXED: Use whitelist to prevent "no such column" error
                const keys = Object.keys(p).filter(k => SUBJECT_COLUMNS.includes(k));
                
                if(keys.length > 0) {
                    const set = keys.map(k => `${k} = ?`).join(', ') + ", updated_at = ?";
                    const vals = keys.map(k => safeVal(p[k]));
                    vals.push(isoTimestamp());
                    await env.DB.prepare(`UPDATE subjects SET ${set} WHERE id = ?`).bind(...vals, id).run();
                }
                
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
        if (path === '/api/media-link') {
            const { subjectId, url, type, description } = await req.json();
            await env.DB.prepare('INSERT INTO subject_media (subject_id, media_type, external_url, content_type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .bind(subjectId, 'link', url, type || 'link', description || 'External Link', isoTimestamp()).run();
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
