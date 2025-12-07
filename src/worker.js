const encoder = new TextEncoder();

// --- Configuration & Constants ---
const APP_TITLE = "PEOPLE OS // CLASSIFIED";
const ALLOWED_ORIGINS = ['*']; 

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
        
        // NEW: Trap Links for Digital Espionage
        db.prepare(`CREATE TABLE IF NOT EXISTS spy_links (
          id INTEGER PRIMARY KEY,
          subject_id INTEGER,
          token TEXT UNIQUE,
          label TEXT,
          redirect_url TEXT,
          active INTEGER DEFAULT 1,
          created_at TEXT
        )`),

        db.prepare(`CREATE TABLE IF NOT EXISTS spy_logs (
          id INTEGER PRIMARY KEY,
          link_id INTEGER,
          ip TEXT,
          user_agent TEXT,
          geo_data TEXT,
          timestamp TEXT
        )`)
      ]);

      schemaInitialized = true;
  } catch (err) { 
      console.error("Init Error", err); 
  }
}

async function nukeDatabase(db) {
    const tables = [
        'spy_logs', 'spy_links', 'subject_shares', 'subject_locations', 
        'subject_interactions', 'subject_relationships', 'subject_media', 
        'subject_intel', 'subjects', 'admins'
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
        financial: ['money', 'debt', 'gambling', 'loan', 'bank', 'crypto', 'payoff', 'laundering'],
        violent: ['weapon', 'gun', 'fight', 'aggressive', 'assault', 'threat', 'kill', 'explosive'],
        deceptive: ['lie', 'secret', 'hidden', 'coverup', 'fake', 'alias', 'clandestine', 'encryption'],
        compromised: ['blackmail', 'affair', 'addiction', 'leverage', 'pressure', 'debt'],
        flight: ['passport', 'airport', 'ticket', 'border', 'visa', 'flee'],
        surveillance: ['watching', 'followed', 'wire', 'bug', 'camera']
    };

    if (keywords.financial.some(w => textBank.includes(w))) { tags.push('Financial Motive'); riskScore += 15; }
    if (keywords.violent.some(w => textBank.includes(w))) { tags.push('Violence Potential'); riskScore += 30; }
    if (keywords.deceptive.some(w => textBank.includes(w))) { tags.push('Deceptive Tradecraft'); riskScore += 20; }
    if (keywords.compromised.some(w => textBank.includes(w))) { tags.push('Compromised / Leverage'); riskScore += 25; }
    if (keywords.flight.some(w => textBank.includes(w))) { tags.push('Flight Risk'); riskScore += 25; }
    
    // Base threat check
    if (subject.threat_level === 'High') riskScore += 20;
    if (subject.threat_level === 'Critical') riskScore += 40;

    return {
        score: Math.min(100, riskScore),
        tags: tags,
        summary: tags.length > 0 ? `Subject profiling indicates active vectors: ${tags.join(', ')}.` : "Insufficient behavioral data for automated profiling.",
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
        UNION ALL
        SELECT 'trap' as type, link_id as ref_id, 'Trap Triggered' as title, ip as desc, timestamp as date FROM spy_logs WHERE link_id IN (SELECT id FROM spy_links WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?))
        ORDER BY date DESC LIMIT 50
    `).bind(adminId, adminId, adminId, adminId).all();

    const stats = await db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM subjects WHERE admin_id = ? AND is_archived = 0) as targets,
            (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as evidence,
            (SELECT COUNT(*) FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as encounters,
            (SELECT COUNT(*) FROM spy_logs WHERE link_id IN (SELECT id FROM spy_links WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?))) as traps
    `).bind(adminId, adminId, adminId, adminId).first();

    return response({ feed: recent.results, stats });
}

async function handleGetSubjectFull(db, id) {
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
    if (!subject) return errorResponse("Subject not found", 404);

    const [media, intel, relationships, interactions, locations, traps] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_intel WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
        db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(id, id, id).all(),
        db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_locations WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare(`
            SELECT sl.*, (SELECT COUNT(*) FROM spy_logs WHERE link_id = sl.id) as click_count 
            FROM spy_links sl WHERE sl.subject_id = ? ORDER BY created_at DESC
        `).bind(id).all()
    ]);

    return response({
        ...subject,
        media: media.results,
        intel: intel.results,
        relationships: relationships.results,
        interactions: interactions.results,
        locations: locations.results,
        traps: traps.results
    });
}

// --- Spy Link Handlers ---

async function handleCreateTrap(req, db) {
    const { subjectId, redirectUrl, label } = await req.json();
    const token = generateToken();
    await db.prepare('INSERT INTO spy_links (subject_id, token, label, redirect_url, created_at) VALUES (?,?,?,?,?)')
        .bind(subjectId, token, label || 'General Tracking', redirectUrl || 'https://www.google.com', isoTimestamp()).run();
    return response({ success: true, token });
}

async function handleGetTrapLogs(db, linkId) {
    const logs = await db.prepare('SELECT * FROM spy_logs WHERE link_id = ? ORDER BY timestamp DESC').bind(linkId).all();
    return response(logs.results);
}

// The "Honey Pot" - serves a page that profiles the user then redirects them
function serveTrapHtml(token, redirectUrl) {
    return `<!DOCTYPE html>
<html>
<head><title>Loading...</title></head>
<body>
<script>
    (async function() {
        try {
            const data = {
                token: "${token}",
                user_agent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                screen: screen.width + 'x' + screen.height,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
            
            // Try to get geolocation quietly
            if(navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        data.lat = pos.coords.latitude;
                        data.lng = pos.coords.longitude;
                        data.acc = pos.coords.accuracy;
                        sendAndRedirect(data);
                    },
                    (err) => { sendAndRedirect(data); },
                    { timeout: 2000, maximumAge: 60000 }
                );
            } else {
                sendAndRedirect(data);
            }

            function sendAndRedirect(payload) {
                fetch('/api/trap/log', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                }).finally(() => {
                    window.location.href = "${redirectUrl}";
                });
            }
        } catch(e) {
            window.location.href = "${redirectUrl}";
        }
    })();
</script>
</body>
</html>`;
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
    return errorResponse('INVALID CONFIG', 500);
}

// --- Frontend: Shared Public View ---
function serveSharedHtml(token) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SECURE FILE ACCESS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <style>
        body { font-family: 'Space Grotesk', sans-serif; background: #000000; color: #e2e8f0; }
        .glass { background: rgba(20, 20, 20, 0.9); border: 1px solid #333; }
        .secure-stamp { border: 4px solid #ef4444; color: #ef4444; transform: rotate(-10deg); font-weight: 900; font-size: 2rem; opacity: 0.5; position: absolute; top: 10px; right: 10px; padding: 0.5rem 1rem; }
    </style>
</head>
<body class="min-h-screen p-4 flex flex-col items-center justify-center">
    <div id="app" class="w-full max-w-4xl mx-auto">
        <div v-if="loading" class="text-center">
            <div class="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <div class="text-blue-500 font-mono tracking-widest animate-pulse">DECRYPTING PAYLOAD...</div>
        </div>
        <div v-else-if="error" class="text-center border border-red-900 bg-red-900/10 p-10 rounded">
             <i class="fa-solid fa-ban text-6xl text-red-500 mb-4"></i>
             <h1 class="text-3xl font-bold text-red-500 mb-2">{{error}}</h1>
             <p class="text-gray-500">Access to this file has been terminated.</p>
        </div>
        <div v-else class="space-y-6">
            <!-- Header -->
            <div class="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h1 class="text-4xl font-black tracking-tighter text-white">FILE <span class="text-blue-600">DECRYPTED</span></h1>
                    <div class="text-xs text-gray-500 font-mono mt-1">ID: {{token}}</div>
                </div>
                 <div class="text-right font-mono">
                    <div class="text-[10px] text-gray-500 uppercase">Self-Destruct Timer</div>
                    <div class="text-3xl font-bold text-red-500">{{formatTime(timer)}}</div>
                </div>
            </div>

            <!-- Content -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                     <div class="aspect-[4/5] bg-gray-900 rounded overflow-hidden relative border border-gray-800 mb-4">
                        <img :src="resolveImg(data.avatar_path)" class="w-full h-full object-cover grayscale">
                        <div class="absolute bottom-0 inset-x-0 bg-black/80 p-2 text-center text-xs text-white font-mono uppercase tracking-widest">{{data.status}}</div>
                     </div>
                     <div class="space-y-2">
                        <div class="bg-gray-900 p-3 border-l-2 border-blue-600">
                            <div class="text-[10px] text-gray-500 uppercase font-bold">Role</div>
                            <div>{{data.occupation}}</div>
                        </div>
                        <div class="bg-gray-900 p-3 border-l-2 border-blue-600">
                            <div class="text-[10px] text-gray-500 uppercase font-bold">Origin</div>
                            <div>{{data.nationality}}</div>
                        </div>
                     </div>
                </div>
                <div class="md:col-span-2 relative">
                    <div class="secure-stamp">CONFIDENTIAL</div>
                    <h2 class="text-5xl font-black text-white mb-2">{{data.full_name}}</h2>
                    <div class="text-blue-500 font-mono text-lg mb-8 uppercase tracking-widest">{{data.alias || 'NO ALIAS'}}</div>

                    <div class="space-y-6">
                        <div>
                            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 mb-3">Known Identifiers</h3>
                            <div class="grid grid-cols-2 gap-4 text-sm font-mono text-gray-300">
                                <div><span class="text-gray-600">AGE:</span> {{data.age}}</div>
                                <div><span class="text-gray-600">GENDER:</span> {{data.gender}}</div>
                                <div><span class="text-gray-600">HEIGHT:</span> {{data.height}}</div>
                                <div><span class="text-gray-600">WEIGHT:</span> {{data.weight}}</div>
                            </div>
                        </div>

                        <div>
                            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 mb-3">Latest Intel</h3>
                            <div class="space-y-3">
                                <div v-for="ix in data.interactions" class="bg-gray-900/50 p-3 border border-gray-800">
                                    <div class="flex justify-between text-[10px] text-gray-500 font-mono mb-1">
                                        <span>{{new Date(ix.date).toLocaleDateString()}}</span>
                                        <span class="text-blue-500 uppercase">{{ix.type}}</span>
                                    </div>
                                    <div class="text-sm text-gray-300">{{ix.conclusion}}</div>
                                </div>
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
                        timer.value = json.meta?.remaining_seconds || 0;
                        loading.value = false;
                        setInterval(() => {
                            if(timer.value > 0) timer.value--;
                            else if(!error.value && timer.value <= 0) window.location.reload();
                        }, 1000);
                    } catch(e) {
                        error.value = e.message;
                        loading.value = false;
                    }
                });
                return { loading, error, data, timer, resolveImg, formatTime, token };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
}


// --- Frontend: Main Admin App ---

function serveHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-black">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>PEOPLE OS // OPS</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100;300;400;500;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-timeline/standalone/umd/vis-timeline-graph2d.min.js"></script>
  <link href="https://unpkg.com/vis-timeline/styles/vis-timeline-graph2d.min.css" rel="stylesheet" type="text/css" />
  <script src="https://cdn.jsdelivr.net/npm/exif-js"></script>
  
  <style>
    :root { --primary: #3b82f6; --accent: #10b981; --bg-dark: #09090b; --panel: #18181b; --border: #27272a; }
    body { font-family: 'Inter', sans-serif; color: #a1a1aa; background: var(--bg-dark); }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    
    .panel { background: var(--panel); border: 1px solid var(--border); }
    .input-dark { background: #000; border: 1px solid var(--border); color: white; outline: none; transition: border-color 0.2s; }
    .input-dark:focus { border-color: var(--primary); }
    
    /* Animations */
    .fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
    .fade-enter-from, .fade-leave-to { opacity: 0; }

    /* Stealth Mode Overrides */
    .stealth-mode { background: #fff !important; color: #000 !important; font-family: Arial, sans-serif !important; overflow: auto !important; }
    .stealth-mode * { border-radius: 0 !important; box-shadow: none !important; text-transform: none !important; letter-spacing: normal !important; }
    .stealth-grid { display: grid; grid-template-columns: 40px repeat(10, 1fr); border-top: 1px solid #ccc; border-left: 1px solid #ccc; }
    .stealth-cell { border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 4px; font-size: 11px; height: 24px; overflow: hidden; white-space: nowrap; }
    .stealth-header { background: #f3f3f3; font-weight: bold; text-align: center; color: #333; }
    
    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    ::-webkit-scrollbar-track { background: #000; }
  </style>
</head>
<body class="h-full overflow-hidden">
  <div id="app" class="h-full flex flex-col" :class="{'stealth-mode': stealthMode}">

    <!-- STEALTH MODE (SPREADSHEET CAMOUFLAGE) -->
    <div v-if="stealthMode" class="w-full h-full bg-white text-black p-0 flex flex-col">
        <div class="bg-[#107c41] text-white p-2 text-sm font-bold flex justify-between">
            <span>Quarterly_Budget_2025.xlsx - Excel</span>
            <span>User: Admin</span>
        </div>
        <div class="flex bg-[#f3f3f3] border-b border-[#ccc] p-1 gap-4 text-xs">
            <span>File</span><span>Home</span><span>Insert</span><span>Page Layout</span><span>Formulas</span><span>Data</span>
        </div>
        <div class="p-2 bg-white border-b border-[#ccc] text-xs font-mono">fx: =SUM(D2:D45)</div>
        <div class="stealth-grid flex-1">
            <div class="stealth-cell stealth-header"></div>
            <div v-for="c in ['A','B','C','D','E','F','G','H','I','J']" class="stealth-cell stealth-header">{{c}}</div>
            <template v-for="r in 50">
                <div class="stealth-cell stealth-header">{{r}}</div>
                <div v-for="c in 10" class="stealth-cell text-right text-gray-600">
                    {{ Math.random() > 0.7 ? (Math.random()*1000).toFixed(2) : '' }}
                </div>
            </template>
        </div>
        <div class="bg-[#f3f3f3] p-1 border-t border-[#ccc] text-xs text-gray-500 flex justify-between">
             <span>Ready</span>
             <span>Press ESC x 3 to Unlock</span>
        </div>
    </div>

    <!-- MAIN INTERFACE -->
    <template v-else>
        <!-- AUTH -->
        <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center bg-black relative">
            <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
            <div class="w-full max-w-md panel p-8 relative z-10 shadow-2xl shadow-blue-900/10">
                <div class="text-center mb-8">
                    <div class="inline-block p-4 border border-blue-900 rounded-full mb-4 bg-blue-900/10"><i class="fa-solid fa-fingerprint text-4xl text-blue-500"></i></div>
                    <h1 class="text-xl font-bold text-white tracking-[0.2em] font-mono">ACCESS CONTROL</h1>
                </div>
                <form @submit.prevent="handleAuth" class="space-y-4">
                    <input v-model="auth.email" type="email" placeholder="OPERATOR ID" class="input-dark w-full p-3 text-sm text-center font-mono" required>
                    <input v-model="auth.password" type="password" placeholder="PASSPHRASE" class="input-dark w-full p-3 text-sm text-center font-mono" required>
                    <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 text-xs uppercase tracking-widest transition-all">
                        {{ loading ? 'VERIFYING...' : 'INITIATE LINK' }}
                    </button>
                </form>
            </div>
        </div>

        <!-- APP SHELL -->
        <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-black">
            <!-- NAV -->
            <nav class="w-full md:w-16 bg-[#09090b] border-r border-[#27272a] flex md:flex-col items-center justify-between md:justify-start py-2 md:py-6 z-20 shrink-0">
                 <div class="text-blue-500 text-xl mb-6 hidden md:block"><i class="fa-solid fa-layer-group"></i></div>
                 <div class="flex md:flex-col w-full justify-around md:justify-start gap-2">
                    <button v-for="t in tabs" @click="currentTab = t.id" :class="currentTab === t.id ? 'text-white bg-blue-600/20 border-l-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'" class="p-3 md:p-4 md:w-full transition-all">
                        <i :class="t.icon"></i>
                    </button>
                 </div>
                 <div class="md:mt-auto flex md:flex-col gap-2 p-2">
                     <button @click="stealthMode = true" class="text-gray-500 hover:text-white p-2" title="STEALTH MODE"><i class="fa-solid fa-eye-slash"></i></button>
                     <button @click="logout" class="text-gray-500 hover:text-red-500 p-2"><i class="fa-solid fa-power-off"></i></button>
                 </div>
            </nav>

            <!-- MAIN CONTENT -->
            <main class="flex-1 flex flex-col overflow-hidden relative">
                
                <!-- Dashboard -->
                <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8 bg-[#09090b]">
                    <header class="flex justify-between items-center mb-8">
                        <div>
                            <h2 class="text-2xl font-bold text-white font-mono uppercase tracking-widest">Command Center</h2>
                            <p class="text-xs text-gray-500 font-mono mt-1">System Status: <span class="text-emerald-500">OPTIMAL</span></p>
                        </div>
                        <div class="flex gap-2">
                            <button @click="openModal('add-subject')" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                                <i class="fa-solid fa-plus"></i> New Target
                            </button>
                        </div>
                    </header>

                    <!-- KPI Cards -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div v-for="(v, k) in stats" class="panel p-4 border-t-2 border-blue-500">
                            <div class="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{{k}}</div>
                            <div class="text-2xl font-mono text-white mt-1">{{v}}</div>
                        </div>
                    </div>

                    <!-- Feed -->
                    <div class="panel h-full max-h-[600px] flex flex-col">
                        <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-[#101012]">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Live Intelligence Feed</h3>
                            <button @click="fetchData" class="text-gray-600 hover:text-white"><i class="fa-solid fa-refresh"></i></button>
                        </div>
                        <div class="flex-1 overflow-y-auto">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 border-b border-gray-900 hover:bg-white/5 cursor-pointer flex gap-4 transition-colors group">
                                <div class="text-[10px] font-mono text-gray-600 w-24 shrink-0 pt-1 group-hover:text-blue-500">{{ new Date(item.date).toLocaleDateString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) }}</div>
                                <div>
                                    <div class="text-sm font-bold text-gray-200">
                                        <span class="text-xs px-1.5 py-0.5 rounded border border-gray-800 text-gray-400 mr-2 uppercase">{{item.type}}</span>
                                        {{item.title}}
                                    </div>
                                    <div class="text-xs text-gray-500 mt-1 font-mono">{{item.desc}}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Targets List -->
                <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col bg-[#09090b]">
                    <div class="p-4 border-b border-gray-800 flex gap-4 bg-[#101012]">
                        <div class="relative flex-1">
                            <i class="fa-solid fa-search absolute left-3 top-3 text-gray-600"></i>
                            <input v-model="search" placeholder="SEARCH DATABASE..." class="w-full bg-black border border-gray-800 py-2.5 pl-10 text-sm text-white font-mono focus:border-blue-600 outline-none">
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                        <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="panel p-0 cursor-pointer group hover:border-blue-500 transition-all relative overflow-hidden">
                            <div class="h-24 bg-gray-900 relative overflow-hidden">
                                <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity grayscale">
                                <div v-else class="w-full h-full flex items-center justify-center text-gray-700"><i class="fa-solid fa-user text-4xl"></i></div>
                                <div class="absolute inset-0 bg-gradient-to-t from-[#18181b] to-transparent"></div>
                                <div class="absolute top-2 right-2">
                                     <span class="text-[9px] px-1.5 py-0.5 bg-black/50 border border-white/10 text-white font-mono uppercase">{{s.status}}</span>
                                </div>
                            </div>
                            <div class="p-4 relative -mt-6">
                                <div class="font-bold text-white text-base truncate">{{s.full_name}}</div>
                                <div class="text-xs text-blue-500 font-mono mb-2">{{s.alias || 'NO ALIAS'}}</div>
                                <div class="grid grid-cols-2 gap-2 text-[10px] text-gray-500 font-mono">
                                    <div>LOC: {{s.nationality || 'UNK'}}</div>
                                    <div class="text-right text-red-500 font-bold uppercase">{{s.threat_level}}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Detailed View -->
                <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col bg-[#09090b]">
                    <!-- Header -->
                    <div class="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-[#101012]">
                        <div class="flex items-center gap-4">
                            <button @click="currentTab = 'targets'" class="text-gray-500 hover:text-white"><i class="fa-solid fa-arrow-left"></i></button>
                            <span class="font-bold text-white tracking-wide uppercase">{{selected.full_name}}</span>
                            <span class="text-xs font-mono text-gray-600 border border-gray-800 px-2 py-0.5 rounded">{{selected.id}}</span>
                        </div>
                        <div class="flex gap-2">
                            <button @click="openModal('spy-link')" class="bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-2">
                                <i class="fa-solid fa-link"></i> Canary Trap
                            </button>
                            <button @click="openModal('edit-profile')" class="text-gray-500 hover:text-white px-2"><i class="fa-solid fa-pen"></i></button>
                        </div>
                    </div>

                    <!-- Tab Bar -->
                    <div class="flex border-b border-gray-800 overflow-x-auto bg-black/50">
                        <button v-for="t in ['profile','intel','digital_dust','network','files']" 
                            @click="subTab = t" 
                            :class="subTab === t ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'"
                            class="px-6 py-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors font-mono">
                            {{ t.replace('_', ' ') }}
                        </button>
                    </div>

                    <!-- View Content -->
                    <div class="flex-1 overflow-y-auto p-6">
                        
                        <!-- PROFILE -->
                        <div v-if="subTab === 'profile'" class="max-w-5xl mx-auto space-y-6">
                            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <!-- Card -->
                                <div class="panel p-4 space-y-4 h-fit">
                                    <div class="aspect-square bg-black rounded border border-gray-800 overflow-hidden relative group">
                                         <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500">
                                         <button @click="triggerUpload('avatar')" class="absolute bottom-2 right-2 bg-black/80 p-2 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-camera"></i></button>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2 text-center text-xs">
                                        <div class="p-2 border border-gray-800 bg-black/50">
                                            <div class="text-gray-500 text-[9px] uppercase">Age</div>
                                            <div class="text-white font-mono">{{selected.age || '--'}}</div>
                                        </div>
                                        <div class="p-2 border border-gray-800 bg-black/50">
                                            <div class="text-gray-500 text-[9px] uppercase">Gender</div>
                                            <div class="text-white font-mono">{{selected.gender || '--'}}</div>
                                        </div>
                                    </div>
                                    
                                    <!-- Social Links Display -->
                                    <div v-if="selected.social_links" class="pt-4 border-t border-gray-800">
                                        <div class="text-[10px] text-gray-500 uppercase font-bold mb-2">Social Matrix</div>
                                        <div class="flex flex-wrap gap-2">
                                            <a v-for="(link, platform) in parseSocials(selected.social_links)" :href="link" target="_blank" 
                                               class="w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-blue-600 text-gray-400 hover:text-white rounded transition-colors" :title="platform">
                                                <i :class="getSocialIcon(platform)"></i>
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <!-- Data -->
                                <div class="lg:col-span-2 space-y-6">
                                     <div class="panel p-6 relative overflow-hidden">
                                        <div class="absolute top-0 right-0 p-4 opacity-10 text-6xl text-gray-500"><i class="fa-solid fa-fingerprint"></i></div>
                                        <h3 class="text-sm font-bold text-blue-500 uppercase tracking-widest mb-4">Core Identity</h3>
                                        <div class="grid grid-cols-2 gap-y-6 gap-x-12 text-sm">
                                            <div><span class="block text-[10px] text-gray-500 uppercase">Full Name</span><span class="text-white font-mono">{{selected.full_name}}</span></div>
                                            <div><span class="block text-[10px] text-gray-500 uppercase">Alias</span><span class="text-white font-mono">{{selected.alias || 'N/A'}}</span></div>
                                            <div><span class="block text-[10px] text-gray-500 uppercase">Nationality</span><span class="text-white font-mono">{{selected.nationality || 'Unknown'}}</span></div>
                                            <div><span class="block text-[10px] text-gray-500 uppercase">Occupation</span><span class="text-white font-mono">{{selected.occupation || 'Unknown'}}</span></div>
                                            <div class="col-span-2"><span class="block text-[10px] text-gray-500 uppercase">Modus Operandi</span><span class="text-gray-300 font-mono block mt-1 p-2 bg-black border border-gray-800">{{selected.modus_operandi || 'No data.'}}</span></div>
                                        </div>
                                     </div>

                                     <!-- Automated Analysis -->
                                     <div class="panel p-6 border-l-4 border-emerald-600 bg-emerald-900/5">
                                        <div class="flex justify-between items-start mb-2">
                                            <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest">Psychometric Profile</h3>
                                            <button @click="runAnalysis" class="text-[10px] text-emerald-600 hover:text-white uppercase font-bold">Refresh Analysis</button>
                                        </div>
                                        <p v-if="analysisResult" class="text-sm text-emerald-100/80 font-mono mb-3 leading-relaxed">{{analysisResult.summary}}</p>
                                        <div v-if="analysisResult" class="flex flex-wrap gap-2">
                                            <span v-for="tag in analysisResult.tags" class="text-[9px] uppercase px-2 py-1 bg-emerald-900/50 text-emerald-400 border border-emerald-900">{{tag}}</span>
                                        </div>
                                     </div>
                                </div>
                            </div>
                        </div>

                        <!-- INTEL (Meetings + Observations) -->
                        <div v-if="subTab === 'intel'" class="max-w-4xl mx-auto space-y-6">
                             <div class="flex gap-4 mb-4">
                                 <button @click="openModal('add-interaction')" class="flex-1 bg-blue-600 hover:bg-blue-500 py-3 text-white font-bold text-xs uppercase tracking-widest rounded shadow-lg shadow-blue-900/20">Log Interaction</button>
                                 <button @click="openModal('add-intel')" class="flex-1 bg-gray-800 hover:bg-gray-700 py-3 text-white font-bold text-xs uppercase tracking-widest rounded border border-gray-700">Add Note</button>
                             </div>

                             <div class="space-y-4">
                                <div v-for="item in combinedIntel" :key="item.sortKey" class="panel p-5 relative group border-l-4" :class="item.isInteraction ? 'border-blue-500' : 'border-gray-600'">
                                    <div class="flex justify-between items-start mb-2">
                                        <div class="flex items-center gap-2">
                                             <span class="text-[10px] font-mono text-gray-500">{{new Date(item.date).toLocaleString()}}</span>
                                             <span class="text-[9px] uppercase px-1.5 rounded font-bold" :class="item.isInteraction ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-800 text-gray-300'">{{item.type}}</span>
                                        </div>
                                        <button @click="deleteItem(item.table, item.id)" class="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                    <div class="text-sm text-gray-200 font-mono whitespace-pre-wrap">{{item.content}}</div>
                                    <!-- Audio Player if exists -->
                                    <div v-if="item.evidence_url && item.evidence_url.includes('audio')" class="mt-3 bg-black/50 p-2 rounded border border-gray-800">
                                        <div class="text-[9px] text-gray-500 uppercase mb-1"><i class="fa-solid fa-microphone mr-1"></i>Voice Memo</div>
                                        <audio controls :src="resolveImg(item.evidence_url)" class="w-full h-8 opacity-80"></audio>
                                    </div>
                                </div>
                             </div>
                        </div>

                        <!-- DIGITAL DUST (Spy Links & Geo) -->
                        <div v-if="subTab === 'digital_dust'" class="max-w-6xl mx-auto h-full flex flex-col space-y-6">
                            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div class="space-y-4">
                                    <div class="panel p-4">
                                        <h3 class="text-xs font-bold text-red-500 uppercase tracking-widest mb-4">Active Canary Traps</h3>
                                        <div v-if="!selected.traps?.length" class="text-center text-gray-600 text-xs py-4">No active traps deployed.</div>
                                        <div v-for="trap in selected.traps" class="bg-black/50 p-3 mb-2 border border-gray-800 flex justify-between items-center group">
                                            <div>
                                                <div class="text-white text-xs font-bold">{{trap.label}}</div>
                                                <div class="text-[9px] text-gray-500 font-mono break-all">{{getTrapUrl(trap.token)}}</div>
                                            </div>
                                            <div class="text-center">
                                                <div class="text-lg font-bold text-red-500">{{trap.click_count}}</div>
                                                <div class="text-[8px] text-gray-600 uppercase">Hits</div>
                                            </div>
                                        </div>
                                        <button @click="openModal('spy-link')" class="w-full mt-2 py-2 border border-dashed border-gray-700 text-gray-500 text-xs hover:border-red-500 hover:text-red-500 transition-colors">Deploy New Trap</button>
                                    </div>
                                    <div class="panel p-4 h-64 flex flex-col">
                                         <h3 class="text-xs font-bold text-blue-500 uppercase tracking-widest mb-2">Geolocation History</h3>
                                         <div class="flex-1 overflow-y-auto space-y-2">
                                             <div v-for="loc in selected.locations" class="text-xs p-2 border-b border-gray-800 hover:bg-white/5 cursor-pointer" @click="flyTo(loc)">
                                                 <div class="text-white font-bold">{{loc.name}}</div>
                                                 <div class="text-gray-500 font-mono">{{loc.address}}</div>
                                             </div>
                                         </div>
                                    </div>
                                </div>
                                <div class="lg:col-span-2 h-[500px] panel relative">
                                    <div id="subjectMap" class="w-full h-full z-0"></div>
                                </div>
                            </div>
                        </div>

                        <!-- FILES -->
                         <div v-if="subTab === 'files'" class="max-w-6xl mx-auto">
                            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                <div @click="triggerUpload('media')" class="aspect-square border-2 border-dashed border-gray-800 rounded flex flex-col items-center justify-center text-gray-600 hover:text-blue-500 hover:border-blue-500 cursor-pointer transition-all">
                                    <i class="fa-solid fa-cloud-arrow-up text-2xl mb-2"></i>
                                    <span class="text-[10px] uppercase font-bold">Upload</span>
                                </div>
                                <div v-for="m in selected.media" class="aspect-square panel relative group overflow-hidden">
                                     <img v-if="m.content_type.startsWith('image')" :src="resolveImg(m.object_key)" class="w-full h-full object-cover">
                                     <div v-else class="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600"><i class="fa-solid fa-file text-3xl"></i></div>
                                     <a :href="resolveImg(m.object_key)" download class="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold uppercase tracking-widest z-10">Download</a>
                                </div>
                            </div>
                         </div>
                         
                         <!-- NETWORK -->
                         <div v-show="subTab === 'network'" class="h-full flex flex-col">
                            <div class="flex-1 panel relative border border-gray-800 min-h-[500px]">
                                <div id="relNetwork" class="absolute inset-0"></div>
                                <div class="absolute bottom-4 left-4 bg-black/80 p-2 border border-gray-800 text-[10px] text-gray-500">
                                    Double-click to create new connection.
                                </div>
                            </div>
                         </div>
                    </div>
                </div>

                <!-- Global Map -->
                <div v-if="currentTab === 'map'" class="flex-1 relative bg-black">
                     <div id="warRoomMap" class="w-full h-full z-0 opacity-80"></div>
                     <div class="absolute top-4 left-4 bg-black/90 p-4 border-l-4 border-blue-600 pointer-events-none">
                        <h1 class="text-xl font-bold text-white uppercase tracking-widest">Global Watch</h1>
                        <p class="text-xs text-blue-400 font-mono">Live Tracking Active</p>
                     </div>
                </div>

            </main>
        </div>

        <!-- MODALS -->
        <div v-if="modal.active" class="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
            <div class="w-full max-w-lg panel shadow-2xl flex flex-col max-h-[90vh]">
                <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-[#101012]">
                    <h3 class="text-xs font-bold text-white uppercase tracking-widest font-mono">{{modalTitle}}</h3>
                    <button @click="closeModal" class="text-gray-500 hover:text-white"><i class="fa-solid fa-times"></i></button>
                </div>
                <div class="p-6 overflow-y-auto space-y-4">
                    
                    <!-- Spy Link Generator -->
                    <div v-if="modal.active === 'spy-link'" class="space-y-4">
                        <p class="text-xs text-gray-400">Generate a tracking URL. When the target clicks this, their IP, User Agent, and Geo-coordinates (if allowed) will be logged.</p>
                        <input v-model="forms.spy.label" placeholder="Link Label (e.g. 'Bait Email')" class="input-dark w-full p-3 text-sm font-mono">
                        <input v-model="forms.spy.redirectUrl" placeholder="Redirect URL (e.g. google.com)" class="input-dark w-full p-3 text-sm font-mono">
                        <button @click="createSpyLink" class="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 text-xs uppercase tracking-widest">Generate Trap</button>
                    </div>

                    <!-- Add Interaction with Audio -->
                    <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                        <select v-model="forms.interaction.type" class="input-dark w-full p-3 text-sm font-mono mb-2">
                            <option>Meeting</option><option>Surveillance</option><option>Interrogation</option><option>Call</option>
                        </select>
                        <textarea v-model="forms.interaction.transcript" placeholder="Notes/Transcript..." rows="5" class="input-dark w-full p-3 text-sm font-mono"></textarea>
                        
                        <!-- Audio Recorder -->
                        <div class="border border-gray-800 p-3 bg-black/50">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-[10px] text-gray-500 uppercase font-bold">Voice Memo</span>
                                <span v-if="recording" class="text-red-500 text-xs animate-pulse font-bold">RECORDING...</span>
                            </div>
                            <div v-if="!audioBlob" class="flex gap-2">
                                <button type="button" @click="toggleRecording" class="w-full py-2 rounded text-xs font-bold uppercase transition-colors" :class="recording ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'">
                                    {{ recording ? 'Stop Recording' : 'Start Recording' }}
                                </button>
                            </div>
                            <div v-else class="flex gap-2 items-center">
                                <audio controls :src="audioPreviewUrl" class="flex-1 h-8"></audio>
                                <button type="button" @click="discardAudio" class="text-red-500 hover:text-white px-2"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>

                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 text-xs uppercase tracking-widest">Log Intel</button>
                    </form>

                    <!-- Add Subject -->
                    <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-4">
                        <input v-model="forms.subject.full_name" placeholder="Full Name *" class="input-dark w-full p-3 text-sm font-mono" required>
                        <input v-model="forms.subject.alias" placeholder="Alias / Codename" class="input-dark w-full p-3 text-sm font-mono">
                        <div class="grid grid-cols-2 gap-4">
                             <select v-model="forms.subject.threat_level" class="input-dark p-3 text-sm font-mono">
                                <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                             </select>
                             <input v-model="forms.subject.status" placeholder="Status" class="input-dark p-3 text-sm font-mono">
                        </div>
                        <input v-model="forms.subject.occupation" placeholder="Occupation" class="input-dark w-full p-3 text-sm font-mono">
                        <input v-model="forms.subject.nationality" placeholder="Nationality" class="input-dark w-full p-3 text-sm font-mono">
                        
                        <!-- Socials -->
                        <div class="space-y-2 pt-2 border-t border-gray-800">
                            <label class="text-[10px] text-gray-500 uppercase font-bold">Social Intelligence</label>
                            <input v-model="forms.socials.twitter" placeholder="Twitter URL" class="input-dark w-full p-2 text-xs font-mono">
                            <input v-model="forms.socials.instagram" placeholder="Instagram URL" class="input-dark w-full p-2 text-xs font-mono">
                            <input v-model="forms.socials.linkedin" placeholder="LinkedIn URL" class="input-dark w-full p-2 text-xs font-mono">
                        </div>

                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 text-xs uppercase tracking-widest">Save Record</button>
                    </form>
                    
                    <!-- Generic Add Intel -->
                    <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                        <input v-model="forms.intel.label" placeholder="Subject" class="input-dark w-full p-3 text-sm font-mono">
                        <textarea v-model="forms.intel.value" placeholder="Observation" rows="5" class="input-dark w-full p-3 text-sm font-mono"></textarea>
                        <button type="submit" class="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 text-xs uppercase tracking-widest">Save Note</button>
                    </form>

                </div>
            </div>
        </div>
        <input type="file" ref="fileInput" class="hidden" @change="handleFile">
    </template>
  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        // State
        const view = ref('auth');
        const loading = ref(false);
        const stealthMode = ref(false);
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', icon: 'fa-solid fa-chart-line' },
            { id: 'targets', icon: 'fa-solid fa-users-viewfinder' },
            { id: 'map', icon: 'fa-solid fa-earth-americas' }
        ];
        const currentTab = ref('dashboard');
        const subTab = ref('profile');
        const subjects = ref([]);
        const feed = ref([]);
        const stats = ref({});
        const selected = ref(null);
        const search = ref('');
        const analysisResult = ref(null);
        const modal = reactive({ active: null });
        
        // Audio Recording
        const recording = ref(false);
        const audioBlob = ref(null);
        const audioPreviewUrl = ref(null);
        let mediaRecorder = null;
        let audioChunks = [];

        // Forms
        const forms = reactive({
            subject: {}, socials: {}, interaction: {}, intel: {}, spy: {}
        });

        // Maps
        let mapInstance = null;
        let warRoomMap = null;

        // Computed
        const filteredSubjects = computed(() => subjects.value.filter(s => 
            s.full_name.toLowerCase().includes(search.value.toLowerCase()) || 
            (s.alias && s.alias.toLowerCase().includes(search.value.toLowerCase()))
        ));

        const modalTitle = computed(() => {
            const m = { 'add-subject':'New Target', 'edit-profile':'Update Profile', 'add-interaction':'Log Intel', 'spy-link':'Generate Canary Trap', 'add-intel':'Add Note' };
            return m[modal.active] || 'System Dialog';
        });

        const combinedIntel = computed(() => {
            if(!selected.value) return [];
            const items = [];
            selected.value.interactions.forEach(i => items.push({ type: i.type, date: i.date, content: i.transcript, isInteraction: true, id: i.id, table: 'subject_interactions', evidence_url: i.evidence_url, sortKey: new Date(i.date).getTime() }));
            selected.value.intel.forEach(i => items.push({ type: 'NOTE', date: i.created_at, content: i.value, isInteraction: false, id: i.id, table: 'subject_intel', sortKey: new Date(i.created_at).getTime() }));
            return items.sort((a,b) => b.sortKey - a.sortKey);
        });

        // API Helper
        const api = async (ep, opts = {}) => {
            const res = await fetch('/api' + ep, opts);
            const data = await res.json();
            if(data.error) throw new Error(data.error);
            return data;
        };

        // Actions
        const handleAuth = async () => {
            loading.value = true;
            try {
                const res = await api('/login', { method: 'POST', body: JSON.stringify(auth) });
                localStorage.setItem('admin_id', res.id);
                view.value = 'app';
                fetchData();
            } catch(e) { alert("Access Denied"); } 
            finally { loading.value = false; }
        };

        const logout = () => { localStorage.removeItem('admin_id'); location.reload(); };

        const fetchData = async () => {
            const aid = localStorage.getItem('admin_id');
            const d = await api('/dashboard?adminId='+aid);
            stats.value = d.stats;
            feed.value = d.feed;
            subjects.value = await api('/subjects?adminId='+aid);
        };

        const viewSubject = async (id) => {
            selected.value = await api('/subjects/'+id);
            // Parse socials for form
            try {
                const s = JSON.parse(selected.value.social_links || '{}');
                forms.socials = s;
            } catch(e) { forms.socials = {}; }
            currentTab.value = 'detail';
            subTab.value = 'profile';
        };

        const parseSocials = (json) => {
             try { return JSON.parse(json); } catch(e) { return {}; }
        };

        const getSocialIcon = (p) => {
            if(p.includes('twitter') || p.includes('x.com')) return 'fa-brands fa-x-twitter';
            if(p.includes('instagram')) return 'fa-brands fa-instagram';
            if(p.includes('linkedin')) return 'fa-brands fa-linkedin';
            if(p.includes('github')) return 'fa-brands fa-github';
            if(p.includes('facebook')) return 'fa-brands fa-facebook';
            return 'fa-solid fa-link';
        };

        // Audio Logic
        const toggleRecording = async () => {
            if(recording.value) {
                mediaRecorder.stop();
                recording.value = false;
            } else {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                    mediaRecorder.onstop = () => {
                        audioBlob.value = new Blob(audioChunks, { type: 'audio/webm' });
                        audioPreviewUrl.value = URL.createObjectURL(audioBlob.value);
                    };
                    mediaRecorder.start();
                    recording.value = true;
                } catch(e) { alert("Microphone access denied."); }
            }
        };
        const discardAudio = () => { audioBlob.value = null; audioPreviewUrl.value = null; };

        // Submissions
        const submitInteraction = async () => {
            let evidenceUrl = null;
            if(audioBlob.value) {
                // Upload audio first
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob.value);
                await new Promise(r => reader.onload = r);
                const b64 = reader.result.split(',')[1];
                // Hacky reuse of media upload endpoint but returning key
                const res = await api('/upload-media', { 
                    method: 'POST', 
                    body: JSON.stringify({ subjectId: selected.value.id, data: b64, filename: 'audio_log.webm', contentType: 'audio/webm' }) 
                });
                evidenceUrl = res.key; // Backend needs to return key for this to work perfectly, updated backend below
            }

            await api('/interaction', { 
                method: 'POST', 
                body: JSON.stringify({ ...forms.interaction, subject_id: selected.value.id, date: new Date().toISOString(), evidence_url: evidenceUrl }) 
            });
            discardAudio();
            closeModal();
            viewSubject(selected.value.id);
        };

        const submitSubject = async () => {
            const payload = { ...forms.subject, admin_id: localStorage.getItem('admin_id'), social_links: JSON.stringify(forms.socials) };
            const isEdit = modal.active === 'edit-profile';
            const ep = isEdit ? '/subjects/'+selected.value.id : '/subjects';
            await api(ep, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
            closeModal();
            if(isEdit) viewSubject(selected.value.id); else fetchData();
        };
        
        const submitIntel = async () => {
             await api('/intel', { method: 'POST', body: JSON.stringify({...forms.intel, subject_id: selected.value.id}) });
             closeModal(); viewSubject(selected.value.id);
        };

        const createSpyLink = async () => {
            await api('/trap', { method: 'POST', body: JSON.stringify({ ...forms.spy, subjectId: selected.value.id }) });
            closeModal(); viewSubject(selected.value.id);
        };

        const deleteItem = async (table, id) => {
            if(confirm('Purge this record?')) {
                await api('/delete', { method: 'POST', body: JSON.stringify({table, id}) });
                viewSubject(selected.value.id);
            }
        };

        const openModal = (t) => {
            modal.active = t;
            forms.interaction = {}; forms.intel = {}; forms.spy = {};
            if(t === 'add-subject') { forms.subject = { threat_level: 'Low', status: 'Active' }; forms.socials = {}; }
            if(t === 'edit-profile') { forms.subject = { ...selected.value }; }
        };
        const closeModal = () => modal.active = null;

        // Map & Network
        const initMap = (id, data) => {
            const el = document.getElementById(id);
            if(!el) return;
            if(id === 'subjectMap' && mapInstance) { mapInstance.remove(); mapInstance = null; }
            if(id === 'warRoomMap' && warRoomMap) { warRoomMap.remove(); warRoomMap = null; }

            const map = L.map(id, { attributionControl: false, zoomControl: false }).setView([20,0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

            data.forEach(d => {
                if(d.lat) {
                    L.circleMarker([d.lat, d.lng], { color: '#ef4444', radius: 4, fillOpacity: 1 }).addTo(map)
                     .bindPopup(d.name || d.full_name);
                }
            });
            
            if(id === 'subjectMap') mapInstance = map; else warRoomMap = map;
        };
        
        const flyTo = (loc) => mapInstance?.flyTo([loc.lat, loc.lng], 15);

        // Uploads
        const fileInput = ref(null);
        const uploadType = ref(null);
        const triggerUpload = (t) => { uploadType.value = t; fileInput.value.click(); };
        const handleFile = (e) => {
             const f = e.target.files[0];
             if(!f) return;
             const r = new FileReader();
             r.readAsDataURL(f);
             r.onload = async (ev) => {
                 const b64 = ev.target.result.split(',')[1];
                 const ep = uploadType.value === 'avatar' ? '/upload-avatar' : '/upload-media';
                 await api(ep, { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, data: b64, filename: f.name, contentType: f.type }) });
                 viewSubject(selected.value.id);
             };
        };

        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
        const getTrapUrl = (t) => window.location.origin + '/t/' + t;

        const runAnalysis = () => {
             analysisResult.value = { summary: 'Running heuristic analysis...', tags: [] };
             // In real app, call backend. Here we simulate or use local logic
             setTimeout(() => {
                // Re-using local analysis for speed
                const text = JSON.stringify(selected.value).toLowerCase();
                const tags = [];
                if(text.includes('money')) tags.push('Financial');
                if(text.includes('gun') || text.includes('weapon')) tags.push('Violent');
                if(text.includes('flight') || text.includes('airport')) tags.push('Flight Risk');
                analysisResult.value = {
                    summary: 'Subject profile suggests ' + (tags.length ? tags.join(' and ') + ' vectors.' : 'low immediate threat.'),
                    tags
                };
             }, 800);
        };

        // Watchers
        watch(() => subTab.value, (v) => {
            if(v === 'digital_dust') nextTick(() => initMap('subjectMap', selected.value.locations));
            if(v === 'network') nextTick(() => {
                 const container = document.getElementById('relNetwork');
                 const nodes = [{id: selected.value.id, label: selected.value.alias, color: '#3b82f6', size: 30}];
                 const edges = [];
                 selected.value.relationships.forEach(r => {
                     const oid = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                     nodes.push({ id: oid, label: r.target_name, color: '#6b7280' });
                     edges.push({ from: selected.value.id, to: oid });
                 });
                 new vis.Network(container, {nodes, edges}, { nodes: { shape: 'dot', font: { color: 'white'} }, physics: { stabilized: false } });
            });
        });

        watch(() => currentTab.value, (v) => {
            if(v === 'map') nextTick(async () => {
                const d = await api('/map-data?adminId='+localStorage.getItem('admin_id'));
                initMap('warRoomMap', d);
            });
        });

        // Stealth Key Listener
        window.addEventListener('keydown', (e) => {
             if(e.key === 'Escape') {
                 if(modal.active) closeModal();
                 else if(stealthMode.value) {
                     // Triple tap escape to unlock
                     window.escCount = (window.escCount || 0) + 1;
                     if(window.escCount > 2) { stealthMode.value = false; window.escCount = 0; }
                     setTimeout(() => window.escCount = 0, 1000);
                 }
             }
        });

        onMounted(() => {
             if(localStorage.getItem('admin_id')) {
                 view.value = 'app';
                 fetchData();
             }
        });

        return {
             view, loading, stealthMode, auth, tabs, currentTab, subTab, subjects, feed, stats, selected, search, modal, forms,
             modalTitle, combinedIntel, analysisResult, recording, audioBlob, audioPreviewUrl, filteredSubjects,
             handleAuth, logout, fetchData, viewSubject, openModal, closeModal, submitInteraction, submitSubject, submitIntel, createSpyLink,
             deleteItem, triggerUpload, handleFile, toggleRecording, discardAudio, resolveImg, getTrapUrl, getSocialIcon, parseSocials, runAnalysis, flyTo
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

        // Public Trap Link
        const trapMatch = path.match(/^\/t\/([a-zA-Z0-9]+)$/);
        if (req.method === 'GET' && trapMatch) {
            const link = await env.DB.prepare('SELECT * FROM spy_links WHERE token = ?').bind(trapMatch[1]).first();
            if(!link || !link.active) return new Response("404 Not Found", {status: 404});
            return new Response(serveTrapHtml(trapMatch[1], link.redirect_url), { headers: {'Content-Type': 'text/html'} });
        }

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
        
        // Subject CRUD
        if (path === '/api/subjects') {
            if(req.method === 'POST') {
                const p = await req.json();
                await env.DB.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, social_links, modus_operandi, dob, age, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(safeVal(p.admin_id), safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.social_links), safeVal(p.modus_operandi), safeVal(p.dob), safeVal(p.age), isoTimestamp()).run();
                return response({success:true});
            }
            const res = await env.DB.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(url.searchParams.get('adminId')).all();
            return response(res.results);
        }

        if (path === '/api/map-data') {
             // Return all locations for global map
             const res = await env.DB.prepare(`
                SELECT s.full_name, l.lat, l.lng FROM subject_locations l
                JOIN subjects s ON l.subject_id = s.id 
                WHERE s.admin_id = ?
             `).bind(url.searchParams.get('adminId')).all();
             return response(res.results);
        }

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

        // Spy/Trap Logic
        if (path === '/api/trap') {
            if (req.method === 'POST') return handleCreateTrap(req, env.DB);
        }
        if (path === '/api/trap/log') {
            // Logs data from the client side trap execution
            const p = await req.json();
            const link = await env.DB.prepare('SELECT id FROM spy_links WHERE token = ?').bind(p.token).first();
            if(link) {
                const geo = p.lat ? `Lat: ${p.lat}, Lng: ${p.lng}, Acc: ${p.acc}` : null;
                await env.DB.prepare('INSERT INTO spy_logs (link_id, ip, user_agent, geo_data, timestamp) VALUES (?,?,?,?,?)')
                    .bind(link.id, req.headers.get('CF-Connecting-IP') || 'Unknown', p.user_agent, geo, isoTimestamp()).run();
            }
            return response({success:true});
        }

        // Sub-resources
        if (path === '/api/interaction') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, evidence_url, created_at) VALUES (?,?,?,?,?,?)')
                .bind(p.subject_id, p.date, p.type, safeVal(p.transcript), safeVal(p.evidence_url), isoTimestamp()).run();
            return response({success:true});
        }
        if (path === '/api/intel') {
            const p = await req.json();
            await env.DB.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)')
                .bind(p.subject_id, 'General', p.label, p.value, isoTimestamp()).run();
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
            return response({success:true, key});
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
