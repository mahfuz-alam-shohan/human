const encoder = new TextEncoder();

// --- Configuration & Constants ---
const APP_TITLE = "PEOPLE OS // CLASSIFIED";

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
        )`),

        // NEW: Dead Drop Table
        db.prepare(`CREATE TABLE IF NOT EXISTS dead_drops (
            id INTEGER PRIMARY KEY,
            token TEXT UNIQUE,
            message TEXT,
            created_at TEXT,
            expires_at TEXT
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
        'subjects', 'admins', 'dead_drops'
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
    const textBank = [
        subject.modus_operandi, 
        subject.weakness, 
        subject.ideology,
        ...interactions.map(i => i.transcript + ' ' + i.conclusion),
        ...intel.map(i => i.value)
    ].join(' ').toLowerCase();

    const tags = [];
    let riskScore = 0; // 0 - 100

    const keywords = {
        financial: ['money', 'debt', 'gambling', 'loan', 'bank', 'crypto', 'payoff'],
        violent: ['weapon', 'gun', 'fight', 'aggressive', 'assault', 'threat', 'kill'],
        deceptive: ['lie', 'secret', 'hidden', 'coverup', 'fake', 'alias', 'clandestine'],
        compromised: ['blackmail', 'affair', 'addiction', 'leverage', 'pressure'],
        tech: ['hack', 'cyber', 'code', 'server', 'encryption', 'network', 'exploit']
    };

    if (keywords.financial.some(w => textBank.includes(w))) { tags.push('Financial Motive'); riskScore += 15; }
    if (keywords.violent.some(w => textBank.includes(w))) { tags.push('Violence Potential'); riskScore += 30; }
    if (keywords.deceptive.some(w => textBank.includes(w))) { tags.push('Tradecraft'); riskScore += 20; }
    if (keywords.compromised.some(w => textBank.includes(w))) { tags.push('Compromised'); riskScore += 25; }
    if (keywords.tech.some(w => textBank.includes(w))) { tags.push('Technical Capability'); riskScore += 10; }
    
    if (subject.threat_level === 'High') riskScore += 20;
    if (subject.threat_level === 'Critical') riskScore += 40;

    return {
        score: Math.min(100, riskScore),
        tags: tags,
        summary: tags.length > 0 ? `Subject exhibits indicators of: ${tags.join(', ')}.` : "Insufficient data for behavior profiling.",
        generated_at: isoTimestamp()
    };
}

// --- API Handlers ---

async function handleGetDashboard(db, adminId) {
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Contact Added' as desc, created_at as date FROM subjects WHERE admin_id = ?
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

        const subject = await db.prepare('SELECT full_name, alias, occupation, nationality, ideology, threat_level, avatar_path, status, created_at, identifying_marks, height, weight, age FROM subjects WHERE id = ?').bind(link.subject_id).first();
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
    return errorResponse('INVALID CONFIG', 500);
}

// --- Dead Drop Logic ---

async function handleCreateDeadDrop(req, db, origin) {
    const { message, ttlMinutes } = await req.json();
    const token = generateToken();
    const expiresAt = new Date(Date.now() + (ttlMinutes || 1440) * 60000).toISOString();
    
    await db.prepare('INSERT INTO dead_drops (token, message, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(token, message, isoTimestamp(), expiresAt).run();
        
    return response({ url: `${origin}/drop/${token}`, expiresAt });
}

async function handleGetDeadDrop(db, token) {
    // Transactional: read then delete immediately
    const drop = await db.prepare('SELECT * FROM dead_drops WHERE token = ?').bind(token).first();
    
    if (!drop) return errorResponse('Drop not found or already destroyed', 404);
    
    // Delete immediately
    await db.prepare('DELETE FROM dead_drops WHERE id = ?').bind(drop.id).run();
    
    if (new Date(drop.expires_at) < new Date()) {
        return errorResponse('Drop expired', 410);
    }

    return response({ message: drop.message, created_at: drop.created_at });
}


// --- Frontend: Shared Link View ---
function serveSharedHtml(token, isDeadDrop = false) {
    const title = isDeadDrop ? "Secure Drop" : "Secure Dossier";
    const apiEndpoint = isDeadDrop ? `/api/drop/${token}` : `/api/share/${token}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <style>
        body { font-family: 'Space Grotesk', sans-serif; background: #0f172a; color: #e2e8f0; }
        .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .secure-stamp { border: 2px solid #ef4444; color: #ef4444; transform: rotate(-15deg); display: inline-block; padding: 0.5rem 1rem; font-weight: 800; letter-spacing: 0.1em; opacity: 0.8; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-4">
    <div id="app" class="w-full max-w-4xl mx-auto my-8">
        <div v-if="loading" class="text-center py-20">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500"></i>
            <p class="mt-4 text-sm uppercase tracking-widest text-slate-400">Authenticating Secure Token...</p>
        </div>
        <div v-else-if="error" class="text-center py-20 glass rounded-xl p-8 border-red-900/50 bg-red-900/10">
            <i class="fa-solid fa-fire text-5xl text-red-500 mb-4"></i>
            <h1 class="text-2xl font-bold text-red-400 mb-2">DATA INCINERATED</h1>
            <p class="text-slate-400">{{error}}</p>
            <p class="text-xs text-slate-600 mt-4">The requested data has been deleted or expired.</p>
        </div>
        <div v-else class="space-y-6">
            
            <!-- DEAD DROP VIEW -->
            <div v-if="${isDeadDrop}" class="glass rounded-xl p-8 border-l-4 border-amber-500">
                <div class="flex items-center gap-3 mb-6 border-b border-slate-700 pb-4">
                     <i class="fa-solid fa-eye-slash text-amber-500 text-xl"></i>
                     <div>
                        <h1 class="text-xl font-bold text-white">BURN ON READ</h1>
                        <p class="text-xs text-amber-500 font-mono">MESSAGE DESTROYED ON SERVER. DO NOT REFRESH.</p>
                     </div>
                </div>
                <div class="bg-black/50 p-6 rounded font-mono text-sm whitespace-pre-wrap text-emerald-400 border border-slate-700 shadow-inner select-all">{{data.message}}</div>
                <div class="mt-4 text-center">
                    <button @click="copyDrop" class="text-slate-400 hover:text-white text-xs uppercase font-bold tracking-widest"><i class="fa-regular fa-copy mr-2"></i>Copy to Clipboard</button>
                </div>
            </div>

            <!-- DOSSIER VIEW -->
            <div v-else class="space-y-6">
                <div class="glass rounded-xl p-6 flex items-center justify-between">
                    <div>
                        <h1 class="text-xl font-bold tracking-tight text-white">PEOPLE OS <span class="text-blue-500 text-xs align-top">INTEL</span></h1>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span class="text-xs font-mono text-green-400">SECURE CONNECTION ESTABLISHED</span>
                        </div>
                    </div>
                    <div v-if="meta" class="text-right">
                        <div class="text-[10px] text-slate-400 uppercase font-bold">Auto-Destruct In</div>
                        <div class="font-mono text-xl text-red-400 font-bold">{{ formatTime(timer) }}</div>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="space-y-6">
                        <div class="glass rounded-xl p-2 relative overflow-hidden group">
                            <img :src="resolveImg(data.avatar_path)" class="w-full aspect-square object-cover rounded-lg bg-slate-800">
                            <div class="absolute top-4 left-4 z-10">
                                <span :class="'bg-'+threatColor+'-500/20 text-'+threatColor+'-400 border-'+threatColor+'-500/50'" class="backdrop-blur-md border px-3 py-1 rounded text-xs font-bold uppercase">
                                    {{data.threat_level}} Priority
                                </span>
                            </div>
                        </div>
                        <div class="glass rounded-xl p-6 space-y-4">
                            <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-2">Physical Stats</h3>
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div><div class="text-slate-500 text-[10px] uppercase">Height</div>{{data.height || 'N/A'}}</div>
                                <div><div class="text-slate-500 text-[10px] uppercase">Weight</div>{{data.weight || 'N/A'}}</div>
                                <div><div class="text-slate-500 text-[10px] uppercase">Age</div>{{data.age || 'N/A'}}</div>
                                <div><div class="text-slate-500 text-[10px] uppercase">Gender</div>{{data.gender || 'N/A'}}</div>
                            </div>
                            <div v-if="data.identifying_marks" class="pt-2">
                                <div class="text-slate-500 text-[10px] uppercase">Marks</div>
                                <div class="text-sm text-slate-300">{{data.identifying_marks}}</div>
                            </div>
                        </div>
                    </div>
                    <div class="md:col-span-2 space-y-6">
                        <div class="glass rounded-xl p-8 relative overflow-hidden">
                            <div class="absolute top-4 right-8 secure-stamp border-slate-500 text-slate-500 opacity-20 transform rotate-12">CONFIDENTIAL</div>
                            <h2 class="text-3xl font-bold text-white mb-1">{{data.full_name}}</h2>
                            <div class="text-blue-400 text-sm font-mono mb-6" v-if="data.alias">AKA: {{data.alias}}</div>
                            <div class="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                <div><span class="text-slate-500 block text-xs uppercase mb-1">Occupation</span>{{data.occupation || 'Unknown'}}</div>
                                <div><span class="text-slate-500 block text-xs uppercase mb-1">Nationality</span>{{data.nationality || 'Unknown'}}</div>
                                <div><span class="text-slate-500 block text-xs uppercase mb-1">Affiliation</span>{{data.ideology || 'Unknown'}}</div>
                                <div><span class="text-slate-500 block text-xs uppercase mb-1">Status</span>{{data.status || 'Active'}}</div>
                            </div>
                        </div>
                        <div class="glass rounded-xl p-6">
                            <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-2 mb-4">Recent Activity</h3>
                            <div class="space-y-4">
                                <div v-for="ix in data.interactions" class="flex gap-4 items-start">
                                    <div class="w-16 text-[10px] font-mono text-slate-500 pt-1">{{new Date(ix.date).toLocaleDateString()}}</div>
                                    <div class="flex-1">
                                        <span class="text-xs font-bold text-blue-400 uppercase">{{ix.type}}</span>
                                        <p class="text-sm text-slate-300 mt-1">{{ix.conclusion || 'No details logged.'}}</p>
                                    </div>
                                </div>
                                <div v-if="!data.interactions?.length" class="text-center text-slate-600 italic text-sm py-4">No recent interactions available.</div>
                            </div>
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
                const threatColor = (level) => {
                    if(level === 'Critical') return 'red';
                    if(level === 'High') return 'orange';
                    return 'blue';
                }
                const copyDrop = () => {
                    navigator.clipboard.writeText(data.value.message);
                    alert("Copied to clipboard");
                }
                
                onMounted(async () => {
                    try {
                        const res = await fetch('${apiEndpoint}');
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
                return { loading, error, data, meta, timer, resolveImg, formatTime, threatColor, copyDrop };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
}


// --- Frontend: Main Admin App (v2.0) ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-900">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, interactive-widget=resizes-content" />
  <title>PEOPLE OS // CLASSIFIED</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100;300;400;500;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-timeline/standalone/umd/vis-timeline-graph2d.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link href="https://unpkg.com/vis-timeline/styles/vis-timeline-graph2d.min.css" rel="stylesheet" type="text/css" />
  
  <style>
    :root { --primary: #3b82f6; --accent: #0ea5e9; --danger: #ef4444; --bg-dark: #0f172a; --bg-card: #1e293b; }
    body { font-family: 'Inter', sans-serif; color: #cbd5e1; background: var(--bg-dark); }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    
    .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3); border-radius: 0.75rem; }
    .glass-input { background: #0f172a; border: 1px solid #334155; color: white; transition: all 0.2s; border-radius: 0.5rem; }
    .glass-input:focus { border-color: var(--primary); outline: none; ring: 1px solid var(--primary); }
    
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
    ::-webkit-scrollbar-track { background: #1e293b; }

    .scan-line { width: 100%; height: 2px; background: linear-gradient(to right, transparent, var(--primary), transparent); animation: scan 3s linear infinite; position: absolute; opacity: 0.5; pointer-events: none; z-index: 50; }
    @keyframes scan { 0% { top: 0%; } 100% { top: 100%; } }

    /* Terminal Styling */
    .terminal-window { background: #0c0c0c; border: 1px solid #333; font-family: 'JetBrains Mono', monospace; overflow: hidden; display: flex; flex-direction: column; }
    .terminal-body { flex: 1; padding: 1rem; overflow-y: auto; color: #ccc; font-size: 14px; }
    .cmd-line { display: flex; gap: 0.5rem; }
    .prompt { color: #10b981; font-weight: bold; }
    .cmd-input { background: transparent; border: none; color: white; outline: none; flex: 1; caret-color: #10b981; }

    @media print {
        body { background: white; color: black; }
        .no-print { display: none !important; }
        .glass { background: none; border: 1px solid #000; box-shadow: none; color: black; }
        .print-only { display: block !important; }
    }
    .print-only { display: none; }
  </style>
</head>
<body class="h-full overflow-hidden selection:bg-blue-900 selection:text-white">
  <div id="app" class="h-full flex flex-col">

    <!-- COMMAND PALETTE MODAL -->
    <div v-if="showCmd" class="fixed inset-0 z-[6000] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-24" @click.self="showCmd = false">
        <div class="w-full max-w-xl glass p-0 overflow-hidden shadow-2xl border-t-4 border-blue-500 transform transition-all scale-100">
            <div class="p-4 border-b border-gray-700 flex items-center gap-3">
                <i class="fa-solid fa-terminal text-blue-500"></i>
                <input ref="cmdInput" v-model="cmdQuery" @keyup.enter="executeCmd" placeholder="Type command or search target..." class="bg-transparent border-none outline-none text-white w-full font-mono text-sm placeholder-gray-600">
                <span class="text-xs text-gray-500 font-mono px-2 py-1 border border-gray-700 rounded">ESC</span>
            </div>
            <div class="max-h-64 overflow-y-auto">
                 <div v-for="(res, idx) in cmdResults" :key="idx" @click="selectCmd(res)" 
                    class="px-4 py-3 hover:bg-blue-900/30 cursor-pointer flex justify-between items-center group border-l-2 border-transparent hover:border-blue-500 transition-all">
                    <div>
                        <div class="text-sm font-bold text-gray-200 group-hover:text-white">{{res.title}}</div>
                        <div class="text-[10px] text-gray-500 font-mono">{{res.desc}}</div>
                    </div>
                    <span class="text-xs text-gray-600 group-hover:text-blue-400 font-mono">{{res.type}}</span>
                 </div>
            </div>
        </div>
    </div>

    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 bg-slate-950 relative overflow-hidden">
        <div class="absolute inset-0 opacity-20 pointer-events-none" style="background-image: radial-gradient(#3b82f6 1px, transparent 1px); background-size: 30px 30px;"></div>
        <div class="w-full max-w-sm glass p-8 shadow-2xl relative z-10 border border-blue-900/30">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-500 text-3xl shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-500/50">
                    <i class="fa-solid fa-fingerprint"></i>
                </div>
                <h1 class="text-2xl font-black text-white tracking-tighter">PEOPLE<span class="text-blue-500">OS</span></h1>
                <p class="text-blue-400/60 text-xs mt-1 font-mono uppercase tracking-widest">System v2.0</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="AGENT ID" class="glass-input w-full p-3 text-sm text-center font-mono tracking-wider" required>
                <input v-model="auth.password" type="password" placeholder="ACCESS CODE" class="glass-input w-full p-3 text-sm text-center font-mono tracking-wider" required>
                <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20">
                    {{ loading ? 'DECRYPTING...' : 'INITIALIZE SESSION' }}
                </button>
            </form>
        </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
        
        <!-- SIDEBAR -->
        <nav class="hidden md:flex flex-col w-20 bg-slate-900 border-r border-slate-800 items-center py-6 z-20 shadow-xl no-print">
            <div class="mb-8 text-blue-500 text-2xl drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"><i class="fa-solid fa-shield-halved"></i></div>
            <div class="flex-1 space-y-4 w-full px-3">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'" class="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all" :title="t.label">
                    <i :class="t.icon" class="text-xl"></i>
                </button>
            </div>
            <button @click="openSettings" class="text-slate-500 hover:text-white p-4"><i class="fa-solid fa-gear"></i></button>
        </nav>

        <!-- CONTENT -->
        <main class="flex-1 relative overflow-hidden bg-slate-950 flex flex-col">
            <div class="scan-line no-print"></div>

            <!-- DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="glass p-5 border-l-2 border-blue-500">
                            <div class="text-[10px] text-blue-400 font-bold uppercase tracking-widest font-mono">Targets</div>
                            <div class="text-3xl font-mono font-bold text-white mt-1">{{ stats.targets || 0 }}</div>
                        </div>
                        <div class="glass p-5 border-l-2 border-amber-500">
                            <div class="text-[10px] text-amber-400 font-bold uppercase tracking-widest font-mono">Intel Logs</div>
                            <div class="text-3xl font-mono font-bold text-white mt-1">{{ stats.encounters || 0 }}</div>
                        </div>
                        <div class="glass p-5 border-l-2 border-emerald-500">
                            <div class="text-[10px] text-emerald-400 font-bold uppercase tracking-widest font-mono">Assets</div>
                            <div class="text-3xl font-mono font-bold text-white mt-1">{{ stats.evidence || 0 }}</div>
                        </div>
                        <button @click="openModal('add-subject')" class="bg-blue-600/10 border border-blue-500/30 hover:bg-blue-600/20 text-blue-400 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group">
                            <i class="fa-solid fa-crosshairs text-2xl group-hover:scale-110 transition-transform"></i>
                            <span class="text-[10px] font-bold uppercase tracking-widest">New Target</span>
                        </button>
                    </div>
                    <div class="glass overflow-hidden border-t-2 border-slate-700">
                        <div class="bg-slate-900/50 p-3 border-b border-slate-800 flex justify-between items-center">
                            <h3 class="text-xs font-bold text-slate-400 uppercase font-mono tracking-widest">Intercept Feed</h3>
                            <button @click="fetchData" class="text-slate-500 hover:text-blue-400"><i class="fa-solid fa-arrows-rotate text-xs"></i></button>
                        </div>
                        <div class="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto font-mono">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 hover:bg-slate-800/50 cursor-pointer flex gap-4 items-start transition-colors">
                                <span class="text-[10px] text-slate-500 w-24 shrink-0">{{ new Date(item.date).toLocaleString([],{month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) }}</span>
                                <div>
                                    <div class="text-xs font-bold text-slate-200">
                                        <span :class="item.type === 'interaction' ? 'text-amber-400' : 'text-blue-400'">[{{ item.type.toUpperCase() }}]</span> {{ item.title }}
                                    </div>
                                    <div class="text-xs text-slate-500 mt-1">{{ item.desc }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TERMINAL TAB (NEW) -->
            <div v-show="currentTab === 'terminal'" class="flex-1 flex flex-col bg-black p-4">
                <div class="terminal-window h-full rounded shadow-2xl glass">
                    <div class="bg-slate-800 px-4 py-2 text-xs font-mono flex gap-2 border-b border-slate-700">
                        <span class="text-red-500">●</span><span class="text-yellow-500">●</span><span class="text-green-500">●</span>
                        <span class="ml-4 text-slate-400">root@people-os:~</span>
                    </div>
                    <div class="terminal-body" ref="termBody" @click="focusTerm">
                         <div v-for="(l, i) in termHistory" :key="i" class="mb-1 whitespace-pre-wrap">{{l}}</div>
                         <div class="cmd-line">
                            <span class="prompt">root@os:~$</span>
                            <input ref="termInput" v-model="termCmd" @keyup.enter="runTermCmd" class="cmd-input" type="text" autocomplete="off" spellcheck="false">
                         </div>
                    </div>
                </div>
            </div>

            <!-- TOOLS TAB (NEW: Steganography + Dead Drop) -->
            <div v-if="currentTab === 'tools'" class="flex-1 overflow-y-auto p-8">
                <div class="max-w-4xl mx-auto space-y-8">
                    
                    <!-- Dead Drop -->
                    <div class="glass p-6 border-l-4 border-amber-500">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="bg-amber-500/20 p-3 rounded-lg text-amber-500"><i class="fa-solid fa-fire"></i></div>
                            <div>
                                <h2 class="text-lg font-bold text-white">Dead Drop Generator</h2>
                                <p class="text-xs text-slate-400 font-mono">Burn-on-read secure messaging. Data is permanently erased after one view.</p>
                            </div>
                        </div>
                        <div class="space-y-4">
                            <textarea v-model="tools.dropMessage" class="glass-input w-full p-4 font-mono text-sm h-32" placeholder="Enter sensitive intelligence..."></textarea>
                            <div class="flex gap-4">
                                <select v-model="tools.dropTTL" class="glass-input p-2 text-xs font-mono w-40">
                                    <option value="60">1 Hour TTL</option>
                                    <option value="1440">24 Hours TTL</option>
                                </select>
                                <button @click="createDeadDrop" class="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-6 rounded text-xs uppercase tracking-widest font-mono">Create Drop</button>
                            </div>
                            <div v-if="tools.dropUrl" class="mt-4 p-4 bg-black/50 border border-amber-500/30 rounded flex justify-between items-center">
                                <code class="text-amber-400 text-sm select-all">{{tools.dropUrl}}</code>
                                <button @click="copyToClipboard(tools.dropUrl)" class="text-slate-400 hover:text-white"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                    </div>

                    <!-- Steganography -->
                    <div class="glass p-6 border-l-4 border-purple-500">
                         <div class="flex items-center gap-4 mb-4">
                            <div class="bg-purple-500/20 p-3 rounded-lg text-purple-500"><i class="fa-solid fa-layer-group"></i></div>
                            <div>
                                <h2 class="text-lg font-bold text-white">Steganography Tool</h2>
                                <p class="text-xs text-slate-400 font-mono">Hide/Reveal text within image pixels (Client-side only).</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="space-y-4">
                                <h3 class="text-xs font-bold text-white uppercase">Encode</h3>
                                <input type="file" @change="handleStegoFile($event, 'encode')" class="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"/>
                                <input v-model="tools.stegoSecret" placeholder="Secret Message" class="glass-input w-full p-2 text-xs font-mono">
                                <button @click="stegoEncode" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-xs uppercase font-bold">Download Encoded Image</button>
                            </div>
                            <div class="space-y-4">
                                <h3 class="text-xs font-bold text-white uppercase">Decode</h3>
                                <input type="file" @change="handleStegoFile($event, 'decode')" class="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"/>
                                <div v-if="tools.stegoResult" class="p-3 bg-black/50 border border-purple-500/30 rounded text-purple-300 font-mono text-xs break-all">
                                    {{tools.stegoResult}}
                                </div>
                                <button @click="stegoDecode" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-xs uppercase font-bold">Reveal Hidden Data</button>
                            </div>
                        </div>
                        <canvas id="stegoCanvas" class="hidden"></canvas>
                    </div>

                </div>
            </div>

            <!-- TARGETS LIST -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col">
                <div class="p-4 border-b border-slate-800 bg-slate-900/50 flex gap-3 shadow-sm z-10 no-print">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-slate-500"></i>
                        <input v-model="search" placeholder="FILTER TARGETS..." class="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 pl-10 text-sm text-white focus:border-blue-500 font-mono focus:outline-none">
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="glass p-4 cursor-pointer hover:border-blue-500/50 transition-all group relative overflow-hidden">
                        <div class="flex gap-4">
                             <div class="w-16 h-16 bg-slate-800 rounded border border-slate-700 overflow-hidden shrink-0">
                                <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all">
                                <div v-else class="w-full h-full flex items-center justify-center text-slate-600"><i class="fa-solid fa-user-secret text-2xl"></i></div>
                            </div>
                            <div class="min-w-0">
                                <div class="font-bold text-white text-sm truncate">{{ s.full_name }}</div>
                                <div class="text-xs text-blue-400 font-mono truncate mb-1">{{ s.alias || 'NO ALIAS' }}</div>
                                <span class="text-[10px] px-1.5 py-0.5 rounded border uppercase font-bold tracking-wider" :class="getThreatColor(s.threat_level, true)">{{ s.threat_level }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SUBJECT DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col h-full bg-slate-950">
                <div class="h-16 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900/50 shrink-0 z-10 no-print">
                    <div class="flex items-center gap-4">
                        <button @click="changeTab('targets')" class="text-slate-400 hover:text-white transition-colors"><i class="fa-solid fa-arrow-left"></i></button>
                        <div>
                            <div class="font-bold text-white text-sm tracking-wide">{{ selected.full_name }}</div>
                            <div class="text-[10px] text-blue-500 font-mono uppercase tracking-widest" v-if="selected.alias">CODENAME: {{ selected.alias }}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="downloadJson" class="text-slate-500 hover:text-white px-2 text-xs font-mono" title="Export JSON">JSON</button>
                        <button @click="downloadMd" class="text-slate-500 hover:text-white px-2 text-xs font-mono" title="Export MD">MD</button>
                        <div class="w-px bg-slate-700 mx-2"></div>
                        <button @click="openModal('share-secure')" class="text-slate-400 hover:text-emerald-400 px-3 transition-colors" title="Share"><i class="fa-solid fa-share-nodes"></i></button>
                        <button @click="printDossier" class="text-slate-400 hover:text-white px-3 transition-colors" title="Print Dossier"><i class="fa-solid fa-print"></i></button>
                    </div>
                </div>

                <div class="flex border-b border-slate-800 overflow-x-auto bg-slate-900/30 shrink-0 no-print">
                    <button v-for="t in ['profile', 'intel', 'meetings', 'locations', 'timeline', 'network', 'files']" 
                        @click="changeSubTab(t)" 
                        :class="subTab === t ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'"
                        class="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] whitespace-nowrap transition-colors font-mono">
                        {{ t }}
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto p-4 md:p-8">
                    <!-- PROFILE TAB -->
                    <div v-if="subTab === 'profile'" class="space-y-6 max-w-6xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-[4/5] bg-slate-800 rounded border border-slate-700 relative overflow-hidden group">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500">
                                    <button @click="triggerUpload('avatar')" class="absolute top-2 right-2 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity no-print"><i class="fa-solid fa-camera"></i></button>
                                </div>
                                <div class="glass p-4 border-l-4" :class="getThreatColor(selected.threat_level, false, true)">
                                    <div class="text-[10px] text-slate-400 uppercase font-bold font-mono">Threat Assessment</div>
                                    <div class="flex justify-between items-center mt-1">
                                        <span class="text-lg font-bold text-white">{{selected.threat_level}}</span>
                                        <button @click="openModal('edit-profile')" class="text-xs text-blue-500 hover:underline no-print">EDIT</button>
                                    </div>
                                </div>
                                <button @click="runAnalysis" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase tracking-widest rounded shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 no-print">
                                    <i class="fa-solid fa-brain"></i> Run Psych Profile
                                </button>
                            </div>

                            <div class="md:col-span-2 space-y-6">
                                <div v-if="analysisResult" class="glass p-6 border border-emerald-500/30 bg-emerald-900/10">
                                    <p class="text-sm text-emerald-100 leading-relaxed font-mono">{{ analysisResult.summary }}</p>
                                    <div class="flex gap-2 mt-3">
                                        <span v-for="tag in analysisResult.tags" class="text-[10px] px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase font-bold">{{tag}}</span>
                                    </div>
                                </div>

                                <div class="glass p-8 relative">
                                    <div class="grid grid-cols-2 gap-y-6 gap-x-12">
                                        <div><label class="text-[10px] text-blue-500 font-bold uppercase tracking-widest block mb-1">Full Name</label><div class="text-white font-mono border-b border-slate-700 pb-1">{{selected.full_name}}</div></div>
                                        <div><label class="text-[10px] text-blue-500 font-bold uppercase tracking-widest block mb-1">Nationality</label><div class="text-white font-mono border-b border-slate-700 pb-1">{{selected.nationality || 'UNK'}}</div></div>
                                        <div><label class="text-[10px] text-blue-500 font-bold uppercase tracking-widest block mb-1">Occupation</label><div class="text-white font-mono border-b border-slate-700 pb-1">{{selected.occupation || 'UNK'}}</div></div>
                                        <div><label class="text-[10px] text-blue-500 font-bold uppercase tracking-widest block mb-1">Affiliation</label><div class="text-white font-mono border-b border-slate-700 pb-1">{{selected.ideology || 'UNK'}}</div></div>
                                    </div>
                                    <div class="mt-8">
                                        <label class="text-[10px] text-blue-500 font-bold uppercase tracking-widest block mb-2">Modus Operandi</label>
                                        <div class="text-sm text-slate-300 font-mono p-4 bg-slate-900/50 border border-slate-700 rounded">{{selected.modus_operandi || 'No data available.'}}</div>
                                    </div>
                                     <div class="mt-4">
                                        <label class="text-[10px] text-red-500 font-bold uppercase tracking-widest block mb-2">Vulnerabilities</label>
                                        <div class="text-sm text-red-200 font-mono p-4 bg-red-900/10 border border-red-900/30 rounded">{{selected.weakness || 'None identified.'}}</div>
                                    </div>
                                </div>
                                
                                <!-- Digital Footprint Section -->
                                <div class="glass p-6 border-t border-slate-700">
                                    <h3 class="text-xs font-bold text-slate-400 uppercase font-mono tracking-widest mb-4"><i class="fa-solid fa-fingerprint mr-2 text-blue-500"></i>Digital Footprint</h3>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4" v-if="selected.digital_identifiers">
                                        <div v-for="(val, key) in parseDigital(selected.digital_identifiers)" class="bg-slate-900/50 p-3 rounded border border-slate-800">
                                            <div class="text-[10px] text-slate-500 uppercase font-bold mb-1">{{key}}</div>
                                            <div class="font-mono text-xs text-emerald-400 break-all">{{val}}</div>
                                        </div>
                                    </div>
                                    <div v-else class="text-sm text-slate-500 italic">No digital identifiers recorded. Edit profile to add.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- MEETINGS TAB -->
                    <div v-if="subTab === 'meetings'" class="space-y-4 max-w-4xl mx-auto">
                        <div class="flex justify-between items-center mb-4 no-print">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest font-mono">Engagement Logs</h3>
                            <button @click="openModal('add-interaction')" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase font-mono">+ Log Meeting</button>
                        </div>
                        <div v-for="ix in selected.interactions" :key="ix.id" class="glass border-l-4 border-amber-500 p-5 space-y-3 relative group">
                             <div class="flex justify-between items-start">
                                <div>
                                    <span class="bg-amber-500/20 text-amber-400 px-2 py-1 text-[10px] font-bold uppercase rounded font-mono border border-amber-500/30">{{ix.type}}</span>
                                    <span class="text-slate-500 text-xs ml-2 font-mono">{{ new Date(ix.date).toLocaleString() }}</span>
                                </div>
                                <button @click="deleteItem('subject_interactions', ix.id)" class="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button>
                            </div>
                            <div class="text-sm text-slate-300 font-mono whitespace-pre-wrap pl-4 border-l border-slate-700">{{ix.transcript}}</div>
                        </div>
                    </div>

                    <!-- LOCATIONS TAB -->
                    <div v-show="subTab === 'locations'" class="h-full flex flex-col">
                        <div class="flex justify-between items-center mb-4 shrink-0 no-print">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest font-mono">Geospatial Intelligence</h3>
                            <button @click="openModal('add-location')" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase font-mono">Pin Location</button>
                        </div>
                        <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="md:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden relative h-64 md:h-full md:min-h-[400px]">
                                <div id="subjectMap" class="w-full h-full z-0"></div>
                            </div>
                            <div class="space-y-3 overflow-y-auto max-h-[600px]">
                                <div v-for="loc in selected.locations" :key="loc.id" class="glass p-4 flex flex-col gap-2 cursor-pointer border-l-4 border-transparent hover:border-blue-500" @click="flyTo(loc)">
                                    <div class="flex justify-between items-center">
                                        <div class="text-sm font-bold text-white">{{loc.name}}</div>
                                        <span class="text-[9px] uppercase bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{{loc.type}}</span>
                                    </div>
                                    <div class="text-xs text-slate-500 font-mono">{{loc.address}}</div>
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-[10px] text-red-500 text-right hover:text-red-400 font-bold mt-1">REMOVE PIN</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- TIMELINE, INTEL, FILES, NETWORK... (Existing tabs kept) -->
                    <div v-show="subTab === 'timeline'" class="h-full flex flex-col space-y-4">
                        <div class="glass p-4 border-l-4 border-blue-500 flex justify-between items-center no-print">
                            <h3 class="text-xs font-bold text-white uppercase font-mono tracking-widest">Temporal Analysis</h3>
                        </div>
                        <div class="flex-1 glass p-2 relative timeline-container">
                            <div id="visTimeline" class="w-full h-full"></div>
                        </div>
                    </div>

                     <div v-if="subTab === 'intel'" class="space-y-4 max-w-4xl mx-auto">
                        <div class="flex justify-between items-center mb-4 no-print">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest font-mono">Raw Observations</h3>
                            <button @click="openModal('add-intel')" class="text-xs border border-slate-600 hover:border-white text-slate-400 hover:text-white px-3 py-1.5 rounded transition-all font-mono">+ ADD ENTRY</button>
                        </div>
                        <div class="space-y-3">
                            <div v-for="log in selected.intel" :key="log.id" class="glass p-4 border-l-2 border-slate-600 relative group">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-[10px] font-mono text-slate-500">{{new Date(log.created_at).toLocaleDateString()}}</span>
                                    <span class="text-[10px] bg-slate-800 text-blue-400 px-1.5 py-0.5 rounded uppercase font-bold border border-slate-700">{{log.category}}</span>
                                    <span class="text-xs font-bold text-white">{{log.label}}</span>
                                </div>
                                <p class="text-sm text-slate-300 font-mono">{{log.value}}</p>
                                <button @click="deleteItem('subject_intel', log.id)" class="absolute top-4 right-4 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    </div>

                     <div v-if="subTab === 'files'" class="space-y-6">
                        <div class="flex flex-col md:flex-row gap-6">
                            <div @click="triggerUpload('media')" class="h-32 w-full md:w-48 rounded border border-dashed border-slate-600 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-slate-800 text-slate-500 hover:text-blue-400 transition-all no-print">
                                <i class="fa-solid fa-file-arrow-up text-2xl mb-2"></i>
                                <span class="text-[10px] uppercase font-bold font-mono">Upload Asset</span>
                            </div>
                            <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                                <div v-for="m in selected.media" :key="m.id" class="glass group relative aspect-square overflow-hidden hover:ring-2 ring-blue-500 transition-all bg-slate-800">
                                    <img v-if="m.content_type.startsWith('image')" :src="'/api/media/' + m.object_key" class="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity">
                                    <div v-else class="w-full h-full flex items-center justify-center text-slate-500"><i class="fa-solid fa-file-lines text-4xl"></i></div>
                                    <a :href="'/api/media/' + m.object_key" download class="absolute inset-0 z-10"></a>
                                    <div class="absolute bottom-0 inset-x-0 bg-black/80 p-2 text-[10px] text-white font-mono truncate">{{m.description}}</div>
                                    <button @click.stop="deleteItem('subject_media', m.id)" class="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-times"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div class="flex justify-between items-center mb-4 shrink-0 no-print">
                            <h3 class="text-xs font-bold text-white uppercase tracking-widest font-mono">Link Analysis</h3>
                            <button @click="openModal('add-rel')" class="text-xs border border-slate-600 text-slate-400 px-3 py-1.5 rounded hover:bg-slate-800">+ Connection</button>
                        </div>
                        <div class="flex-1 glass border border-slate-700 relative overflow-hidden min-h-[400px]">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- GLOBAL MAP -->
            <div v-if="currentTab === 'map'" class="flex-1 relative bg-slate-900 map-container">
                <div id="warRoomMap" class="w-full h-full z-0 opacity-80"></div>
                <div class="absolute top-4 left-4 z-[400] glass px-4 py-3 pointer-events-none border-l-4 border-blue-500">
                    <h3 class="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono mb-1">Global Surveillance</h3>
                    <p class="text-[10px] text-slate-400 font-mono">Live Tracking Active</p>
                </div>
            </div>

        </main>
    </div>

    <!-- MODALS -->
    <div v-if="modal.active" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-lg glass bg-slate-900 border border-slate-700 shadow-2xl flex flex-col max-h-[85vh]" :class="{'shake': modal.shake}">
            <div class="flex justify-between items-center p-4 border-b border-slate-700 shrink-0 bg-slate-800/50">
                <h3 class="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono">{{ modalTitle }}</h3>
                <button @click="closeModal" class="text-slate-500 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="overflow-y-auto p-6 space-y-4">
                <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-4">
                    <input v-model="forms.subject.full_name" placeholder="FULL NAME" class="glass-input w-full p-3 text-sm font-mono" required>
                    <input v-model="forms.subject.alias" placeholder="ALIAS / CODENAME" class="glass-input w-full p-3 text-sm font-mono">
                    <div class="grid grid-cols-2 gap-4">
                        <select v-model="forms.subject.threat_level" class="glass-input p-3 text-sm font-mono">
                            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                        </select>
                        <input v-model="forms.subject.occupation" list="list-occupations" placeholder="ROLE" class="glass-input p-3 text-sm font-mono">
                    </div>
                    <textarea v-model="forms.subject.digital_identifiers" placeholder="DIGITAL FOOTPRINT (JSON format e.g. {&quot;ip&quot;:&quot;127.0.0.1&quot;})" rows="2" class="glass-input w-full p-3 text-sm font-mono text-emerald-500"></textarea>
                    <input v-model="forms.subject.nationality" list="list-nationalities" placeholder="NATIONALITY" class="glass-input w-full p-3 text-sm font-mono">
                    <input v-model="forms.subject.ideology" list="list-ideologies" placeholder="AFFILIATION" class="glass-input w-full p-3 text-sm font-mono">
                    <textarea v-model="forms.subject.modus_operandi" placeholder="ROUTINE & PATTERNS" rows="3" class="glass-input w-full p-3 text-sm font-mono"></textarea>
                    <textarea v-model="forms.subject.weakness" placeholder="VULNERABILITIES" rows="2" class="glass-input w-full p-3 text-sm font-mono border-red-900/50"></textarea>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded text-xs uppercase tracking-widest font-mono">Save Record</button>
                    <button v-if="modal.active === 'edit-profile'" type="button" @click="archiveSubject" class="w-full text-red-500 text-xs mt-2 hover:text-red-400 font-mono uppercase">Archive Target</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="glass-input p-3 text-sm font-mono text-white" required>
                        <select v-model="forms.interaction.type" class="glass-input p-3 text-sm font-mono">
                            <option>Meeting</option><option>Call</option><option>Surveillance</option><option>Email</option>
                        </select>
                    </div>
                    <textarea v-model="forms.interaction.transcript" placeholder="TRANSCRIPT / NOTES" rows="6" class="glass-input w-full p-3 text-sm font-mono"></textarea>
                    <button type="submit" class="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded text-xs uppercase tracking-widest font-mono">Log Intel</button>
                </form>
                
                 <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                    <div class="relative z-[100]">
                         <input v-model="locationSearchQuery" @keyup.enter="searchLocations" placeholder="SEARCH LOCATION..." class="glass-input w-full p-3 pl-10 text-sm font-mono border-blue-500/30">
                         <i class="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-blue-500"></i>
                         <div v-if="locationSearchResults.length" class="absolute w-full bg-slate-800 border border-slate-600 max-h-48 overflow-y-auto mt-1 shadow-xl rounded z-[101]">
                             <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-slate-700 cursor-pointer text-xs border-b border-slate-700 text-slate-300 font-mono">
                                 {{ res.display_name }}
                             </div>
                         </div>
                    </div>
                    <div class="h-48 w-full bg-slate-800 rounded border border-slate-600 relative overflow-hidden">
                        <div id="locationPickerMap" class="absolute inset-0 z-0"></div>
                    </div>
                    <input v-model="forms.location.name" placeholder="LOCATION NAME *" class="glass-input w-full p-3 text-sm font-mono">
                    <select v-model="forms.location.type" class="glass-input w-full p-3 text-sm font-mono">
                        <option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Safehouse</option>
                    </select>
                    <input v-model="forms.location.address" placeholder="ADDRESS" class="glass-input w-full p-3 text-sm font-mono">
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded text-xs uppercase tracking-widest font-mono">Confirm Pin</button>
                </form>

                <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <input v-model="forms.intel.label" placeholder="SUBJECT/TOPIC" class="glass-input w-full p-3 text-sm font-mono">
                    <textarea v-model="forms.intel.value" placeholder="OBSERVATION" rows="4" class="glass-input w-full p-3 text-sm font-mono"></textarea>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded text-xs uppercase tracking-widest font-mono">Add Entry</button>
                 </form>

                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <div class="bg-blue-900/20 p-4 rounded border border-blue-500/30 flex gap-2">
                        <input v-model.number="forms.share.minutes" type="number" class="glass-input w-24 text-center font-mono" placeholder="MIN">
                        <button @click="createShareLink" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded text-xs uppercase font-mono">Generate Secure Link</button>
                    </div>
                    <div class="space-y-2 max-h-60 overflow-y-auto">
                        <div v-for="link in activeShareLinks" class="flex justify-between items-center p-3 bg-slate-800 rounded border border-slate-700">
                            <span class="text-xs font-mono text-slate-300">...{{link.token.slice(-6)}} <span v-if="!link.is_active" class="text-red-500">[REVOKED]</span></span>
                            <div class="flex gap-2">
                                <button @click="copyToClipboard(getShareUrl(link.token))" class="text-slate-400 hover:text-white"><i class="fa-regular fa-copy"></i></button>
                                <button v-if="link.is_active" @click="revokeLink(link.token)" class="text-red-500 hover:text-red-400"><i class="fa-solid fa-ban"></i></button>
                            </div>
                        </div>
                    </div>
                 </div>

                 <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                    <select v-model="forms.rel.targetId" class="glass-input w-full p-3 text-sm font-mono">
                        <option v-for="s in subjects" :value="s.id">{{s.full_name}} ({{s.alias}})</option>
                    </select>
                    <input v-model="forms.rel.type" placeholder="CONNECTION TYPE" class="glass-input w-full p-3 text-sm font-mono">
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded text-xs uppercase tracking-widest font-mono">Establish Link</button>
                 </form>
            </div>
        </div>
    </div>

    <!-- Hidden File Input -->
    <input type="file" ref="fileInput" class="hidden" @change="handleFile">
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
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', icon: 'fa-solid fa-chart-line', label: 'Dashboard' },
            { id: 'targets', icon: 'fa-solid fa-address-book', label: 'Targets' },
            { id: 'map', icon: 'fa-solid fa-globe', label: 'Map' },
            { id: 'terminal', icon: 'fa-solid fa-terminal', label: 'System CLI' },
            { id: 'tools', icon: 'fa-solid fa-toolbox', label: 'Tradecraft Tools' }
        ];
        
        // Router Logic
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
        const analysisResult = ref(null);
        
        // Map & Location
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        let pickerMapInstance = null;
        let mapInstance = null;
        
        // Tools Logic
        const tools = reactive({
            dropMessage: '', dropTTL: 1440, dropUrl: '',
            stegoSecret: '', stegoResult: '', stegoImgData: null
        });

        // Terminal Logic
        const termCmd = ref('');
        const termHistory = ref(['System initialized...', 'Welcome to PeopleOS v2.0 (Classified Build)']);
        const termInput = ref(null);

        // CMD & Panic
        const showCmd = ref(false);
        const cmdQuery = ref('');
        const cmdInput = ref(null);

        const forms = reactive({
            subject: {}, interaction: {}, location: {}, intel: {}, rel: {}, share: { minutes: 30 }
        });

        const filteredSubjects = computed(() => subjects.value.filter(s => 
            s.full_name.toLowerCase().includes(search.value.toLowerCase()) || 
            (s.alias && s.alias.toLowerCase().includes(search.value.toLowerCase()))
        ));

        const cmdResults = computed(() => {
            const q = cmdQuery.value.toLowerCase();
            if(!q) return [];
            const results = [];
            subjects.value.forEach(s => {
                if(s.full_name.toLowerCase().includes(q) || (s.alias && s.alias.toLowerCase().includes(q))) {
                    results.push({ title: s.full_name, desc: s.alias || 'Target', type: 'TARGET', action: () => viewSubject(s.id) });
                }
            });
            if('terminal'.includes(q)) results.push({ title: 'System Terminal', desc: 'CLI Access', type: 'SYS', action: () => changeTab('terminal') });
            if('dead drop'.includes(q)) results.push({ title: 'Dead Drop', desc: 'Secure Messaging', type: 'TOOL', action: () => changeTab('tools') });
            return results.slice(0, 5);
        });

        const modalTitle = computed(() => {
             const m = { 'add-subject':'New Target', 'edit-profile':'Update Profile', 'add-interaction':'Log Intel', 'add-location':'Pin Location', 'add-intel':'Add Observation', 'add-rel':'New Connection', 'share-secure':'Secure Share' };
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
            subTab.value = 'profile'; 
            analysisResult.value = null; // reset
            showCmd.value = false;
        };

        // --- Terminal Functions ---
        const focusTerm = () => termInput.value?.focus();
        const runTermCmd = () => {
            const raw = termCmd.value.trim();
            termHistory.value.push('root@os:~$ ' + raw);
            termCmd.value = '';
            
            const [cmd, ...args] = raw.split(' ');
            
            if(cmd === 'clear') { termHistory.value = []; return; }
            if(cmd === 'help') {
                termHistory.value.push('Available commands: ls, cat [id], rm [id], whoami, date, clear, goto [tab]');
                return;
            }
            if(cmd === 'ls') {
                subjects.value.forEach(s => termHistory.value.push(\`[ID: \${s.id}] \${s.full_name} (\${s.alias || 'N/A'})\`));
                return;
            }
            if(cmd === 'cat') {
                const s = subjects.value.find(x => x.id == args[0]);
                if(s) {
                   termHistory.value.push(\`NAME: \${s.full_name}\\nALIAS: \${s.alias}\\nROLE: \${s.occupation}\\nSTATUS: \${s.status}\`);
                } else termHistory.value.push('Error: Subject ID not found.');
                return;
            }
            if(cmd === 'goto') {
                if(tabs.some(t => t.id === args[0])) changeTab(args[0]);
                else termHistory.value.push('Invalid tab.');
                return;
            }
            if(cmd === 'whoami') { termHistory.value.push('root (Administrator)'); return; }
            if(cmd === 'date') { termHistory.value.push(new Date().toString()); return; }
            
            if(raw) termHistory.value.push(\`bash: \${cmd}: command not found\`);
            
            nextTick(() => {
                const b = document.querySelector('.terminal-body');
                if(b) b.scrollTop = b.scrollHeight;
            });
        };

        // --- Dead Drop ---
        const createDeadDrop = async () => {
             const res = await api('/dead-drop', { method: 'POST', body: JSON.stringify({ message: tools.dropMessage, ttlMinutes: tools.dropTTL }) });
             tools.dropUrl = res.url;
             tools.dropMessage = '';
        };

        // --- Steganography (Client Side) ---
        const handleStegoFile = (e, mode) => {
            const f = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.getElementById('stegoCanvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    tools.stegoImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    if(mode === 'decode') stegoDecode();
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(f);
        };

        const stegoEncode = () => {
             if(!tools.stegoSecret || !tools.stegoImgData) return alert("Image and text required");
             const imgData = tools.stegoImgData;
             const data = imgData.data;
             const msg = tools.stegoSecret + String.fromCharCode(0);
             let msgIdx = 0;
             let bitIdx = 0;
             
             for(let i=0; i < data.length; i += 4) {
                 for(let j=0; j<3; j++) { // R, G, B
                     if(msgIdx < msg.length) {
                         const bit = (msg.charCodeAt(msgIdx) >> bitIdx) & 1;
                         data[i+j] = (data[i+j] & ~1) | bit;
                         bitIdx++;
                         if(bitIdx === 8) { bitIdx = 0; msgIdx++; }
                     }
                 }
             }
             const canvas = document.getElementById('stegoCanvas');
             canvas.getContext('2d').putImageData(imgData, 0, 0);
             const link = document.createElement('a');
             link.download = 'encoded_intel.png';
             link.href = canvas.toDataURL();
             link.click();
        };

        const stegoDecode = () => {
             if(!tools.stegoImgData) return;
             const data = tools.stegoImgData.data;
             let msg = "";
             let charCode = 0;
             let bitIdx = 0;
             
             for(let i=0; i < data.length; i += 4) {
                 for(let j=0; j<3; j++) {
                     const bit = data[i+j] & 1;
                     charCode |= (bit << bitIdx);
                     bitIdx++;
                     if(bitIdx === 8) {
                         if(charCode === 0) { tools.stegoResult = msg; return; }
                         msg += String.fromCharCode(charCode);
                         charCode = 0;
                         bitIdx = 0;
                     }
                 }
             }
        };

        const downloadJson = () => {
            const blob = new Blob([JSON.stringify(selected.value, null, 2)], {type : 'application/json'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = \`subject_\${selected.value.id}.json\`;
            a.click();
        };

        const downloadMd = () => {
            const s = selected.value;
            let md = \`# CONFIDENTIAL DOSSIER: \${s.full_name}\\n**Code:** \${s.alias}\\n**Role:** \${s.occupation}\\n\\n## Profile\\n\${s.notes || s.modus_operandi}\\n\\n## Intel Log\\n\`;
            s.intel.forEach(i => md += \`- [\${new Date(i.created_at).toLocaleDateString()}] **\${i.category}**: \${i.value}\\n\`);
            const blob = new Blob([md], {type : 'text/markdown'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = \`subject_\${s.id}.md\`;
            a.click();
        };

        const parseDigital = (jsonStr) => {
            try { return JSON.parse(jsonStr); } catch(e) { return {}; }
        };

        // Utility
        const changeTab = (t) => { currentTab.value = t; };
        const changeSubTab = (t) => { subTab.value = t; };
        const openModal = (t) => {
             modal.active = t;
             if(t === 'add-subject') forms.subject = { admin_id: localStorage.getItem('admin_id'), threat_level: 'Low', status: 'Active' };
             if(t === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) };
             if(t === 'add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' };
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
        const executeCmd = () => { if(cmdResults.value[0]) selectCmd(cmdResults.value[0]); };
        const selectCmd = (res) => { res.action(); showCmd.value = false; cmdQuery.value = ''; };

        window.addEventListener('keydown', (e) => {
            if(e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); showCmd.value = true; nextTick(() => cmdInput.value?.focus()); }
            if(e.key === 'Escape') { showCmd.value = false; closeModal(); }
        });

        watch(() => subTab.value, (val) => {
            if(val === 'timeline') nextTick(initTimeline);
            if(val === 'locations') nextTick(() => initMap('subjectMap', selected.value.locations || []));
            if(val === 'network') nextTick(() => {
                 const container = document.getElementById('relNetwork');
                 if(!container || !selected.value) return;
                 const nodes = [{id: selected.value.id, label: selected.value.alias || selected.value.full_name, color: '#2563eb', size: 30}];
                 const edges = [];
                 selected.value.relationships.forEach(r => {
                    const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                    nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, color: '#9ca3af' });
                    edges.push({ from: selected.value.id, to: targetId || 'ext-'+r.id, label: r.relationship_type });
                 });
                 new vis.Network(container, { nodes, edges }, { nodes: { shape: 'dot', font: { color: '#cbd5e1' } }, edges: { color: '#475569' } });
            });
        });
        watch(() => currentTab.value, (val) => {
             if(val === 'map') nextTick(async () => {
                 const d = await api('/map-data?adminId=' + localStorage.getItem('admin_id'));
                 initMap('warRoomMap', d);
             });
             if(val === 'terminal') nextTick(focusTerm);
        });

        const initTimeline = () => {
            const container = document.getElementById('visTimeline');
            if(!container || !selected.value) return;
            const items = new vis.DataSet();
            selected.value.interactions.forEach(i => items.add({ content: i.type, start: i.date, className: 'vis-interaction' }));
            selected.value.locations.forEach(l => items.add({ content: '📍 ' + l.name, start: l.created_at, className: 'vis-location' }));
            new vis.Timeline(container, items, { height: '100%', start: new Date(Date.now() - 2592000000), end: new Date(Date.now() + 432000000) });
        };

        const initMap = (id, data, isPicker = false) => {
            const el = document.getElementById(id);
            if(!el) return;
            if(isPicker && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; }
            if(!isPicker && mapInstance) { mapInstance.remove(); mapInstance = null; }
            const map = L.map(id, { attributionControl: false, zoomControl: !isPicker }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

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
                data.forEach(d => {
                    if(d.lat) {
                        const color = d.threat_level === 'Critical' ? '#ef4444' : '#3b82f6';
                        L.circleMarker([d.lat, d.lng], { radius: 6, color, fillColor: color, fillOpacity: 0.8 }).addTo(map).bindPopup(d.full_name || d.name);
                    }
                });
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
        const submitIntel = async () => { await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) }); viewSubject(selected.value.id); closeModal(); };
        const submitRel = async () => { await api('/relationship', { method: 'POST', body: JSON.stringify({...forms.rel, subjectA: selected.value.id}) }); viewSubject(selected.value.id); closeModal(); };
        const deleteItem = async (table, id) => { if(confirm('Delete?')) { await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) }); viewSubject(selected.value.id); } };
        
        const runAnalysis = () => {
             const originalText = "Analyzing...";
             setTimeout(() => {
                 const textBank = [selected.value.modus_operandi, selected.value.weakness, selected.value.ideology, ...selected.value.interactions.map(i => i.transcript), ...selected.value.intel.map(i => i.value)].join(' ').toLowerCase();
                 const tags = [];
                 if (textBank.includes('money') || textBank.includes('debt')) tags.push('Financial Risk');
                 if (textBank.includes('weapon') || textBank.includes('kill')) tags.push('Violence');
                 if (textBank.includes('secret') || textBank.includes('hide')) tags.push('Deceptive');
                 analysisResult.value = { summary: tags.length ? \`Indicators: \${tags.join(', ')}\` : "No threats detected.", tags };
             }, 800);
        };

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
        const getThreatColor = (l, isBg = false, isBorder = false) => {
             const map = { 'Critical': 'red', 'High': 'orange', 'Medium': 'amber', 'Low': 'emerald' };
             const c = map[l] || 'slate';
             if(isBorder) return 'border-' + c + '-500';
             return isBg ? \`bg-\${c}-900/50 text-\${c}-400 border-\${c}-500/50\` : \`text-\${c}-500\`;
        };
        const flyTo = (loc) => mapInstance?.flyTo([loc.lat, loc.lng], 15);
        const printDossier = () => window.print();
        const openSettings = () => { if(confirm("System Reset?")) api('/nuke', {method:'POST'}).then(()=>location.reload()) };
        const archiveSubject = async () => { if(confirm("Archive Subject?")) { await api('/delete', {method:'POST', body: JSON.stringify({table:'subjects', id:selected.value.id})}); closeModal(); changeTab('targets'); fetchData(); } };
        
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
            analysisResult, showCmd, cmdQuery, cmdResults, cmdInput, locationSearchQuery, locationSearchResults, modalTitle,
            tools, termCmd, termHistory, termInput,
            handleAuth, fetchData, viewSubject, changeTab, changeSubTab, openModal, closeModal, executeCmd, selectCmd,
            submitSubject, submitInteraction, submitLocation, submitIntel, submitRel, triggerUpload, handleFile, deleteItem,
            fetchShareLinks, createShareLink, revokeLink, copyToClipboard, getShareUrl, resolveImg, getThreatColor, runAnalysis,
            activeShareLinks, suggestions, printDossier, openSettings, flyTo, searchLocations, selectLocation, archiveSubject,
            createDeadDrop, handleStegoFile, stegoEncode, stegoDecode, downloadJson, downloadMd, parseDigital, focusTerm, runTermCmd
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
        if (req.method === 'GET' && shareMatch) return new Response(serveSharedHtml(shareMatch[1], false), { headers: {'Content-Type': 'text/html'} });

        const dropMatch = path.match(/^\/drop\/([a-zA-Z0-9]+)$/);
        if (req.method === 'GET' && dropMatch) return new Response(serveSharedHtml(dropMatch[1], true), { headers: {'Content-Type': 'text/html'} });

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
        
        // Subject CRUD
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, digital_identifiers, dob, age, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(safeVal(p.admin_id), safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.digital_identifiers), safeVal(p.dob), safeVal(p.age), isoTimestamp()).run();
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

        // Sharing
        if (path === '/api/share-links') {
            if(req.method === 'DELETE') return handleRevokeShareLink(env.DB, url.searchParams.get('token'));
            if(req.method === 'POST') return handleCreateShareLink(req, env.DB, url.origin);
            return handleListShareLinks(env.DB, url.searchParams.get('subjectId'));
        }
        const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
        if (shareApiMatch) return handleGetSharedSubject(env.DB, shareApiMatch[1]);

        // Dead Drop API
        if (path === '/api/dead-drop') return handleCreateDeadDrop(req, env.DB, url.origin);
        const dropApiMatch = path.match(/^\/api\/drop\/([a-zA-Z0-9]+)$/);
        if (dropApiMatch) return handleGetDeadDrop(env.DB, dropApiMatch[1]);

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
