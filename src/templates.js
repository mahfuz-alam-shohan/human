import { APP_TITLE } from './constants.js';

export function serveSharedHtml(token) {
  return new Response(`<!DOCTYPE html>
<html lang="en" class="h-full bg-zinc-900">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Restricted Access File</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    [v-cloak] { display: none; }
    .scan-line { width: 100%; height: 2px; background: rgba(16, 185, 129, 0.5); position: absolute; top: 0; left: 0; animation: scan 3s linear infinite; z-index: 50; pointer-events: none; }
    @keyframes scan { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
    .flicker { animation: flicker 4s infinite; }
    @keyframes flicker { 0%, 95% { opacity: 1; } 96% { opacity: 0.8; } 97% { opacity: 1; } 98% { opacity: 0.5; } 100% { opacity: 1; } }
  </style>
</head>
<body class="h-full overflow-hidden text-zinc-300">
  <div id="app" v-cloak class="h-full flex flex-col max-w-4xl mx-auto bg-zinc-900 shadow-2xl relative overflow-hidden border-x border-zinc-800">
    <div v-if="loading" class="flex-1 flex flex-col items-center justify-center gap-6 bg-zinc-950">
        <div class="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
        <div class="text-xs font-bold uppercase tracking-[0.2em] text-emerald-500 animate-pulse">Establishing Secure Handshake...</div>
    </div>
    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-950 relative overflow-hidden">
        <div class="scan-line"></div>
        <div class="max-w-md relative z-10">
            <div class="text-red-600 text-7xl mb-6"><i class="fa-solid fa-file-shield"></i></div>
            <h1 class="text-3xl font-black text-white mb-2 uppercase tracking-tight">Access Terminated</h1>
            <p class="text-red-400 font-mono text-sm mb-8 border border-red-900/50 bg-red-950/20 p-4 rounded">{{ error }}</p>
            <div class="text-zinc-600 text-xs uppercase tracking-widest">Connection Logged: {{ new Date().toISOString() }}</div>
        </div>
    </div>
    <div v-else class="flex-1 flex flex-col h-full overflow-hidden relative bg-zinc-900">
        <div class="h-16 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-6 shrink-0 z-20">
            <div class="flex items-center gap-3">
                <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                <div class="text-xs font-bold text-emerald-500 uppercase tracking-widest">Live View</div>
            </div>
            <div class="flex items-center gap-4">
                 <div class="text-right">
                    <div class="text-[10px] text-zinc-500 uppercase font-bold">Time Remaining</div>
                    <div class="text-xl font-black mono" :class="timer < 60 ? 'text-red-500' : 'text-white'">{{ formatTime(timer) }}</div>
                 </div>
            </div>
        </div>
        <div class="flex-1 overflow-y-auto relative scrollbar-hide">
            <div class="bg-zinc-900 p-8 pb-12 relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-b from-emerald-900/10 to-transparent pointer-events-none"></div>
                <div class="flex flex-col md:flex-row gap-8 items-center md:items-start relative z-10">
                    <div class="w-40 h-40 bg-zinc-800 rounded-none border-2 border-zinc-700 p-1 shrink-0 relative">
                        <img :src="resolveImg(data.avatar_path)" class="w-full h-full object-cover grayscale contrast-125 hover:grayscale-0 transition-all duration-500">
                        <div class="absolute -bottom-3 -right-3 bg-zinc-950 border border-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                            {{ data.status }}
                        </div>
                    </div>
                    <div class="text-center md:text-left flex-1">
                        <h1 class="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-2 flicker">{{ data.full_name }}</h1>
                        <div class="text-emerald-500 font-mono text-sm uppercase mb-6">{{ data.occupation || 'Unknown Designation' }}</div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-zinc-800 pt-6">
                            <div><div class="text-[10px] text-zinc-600 uppercase font-bold mb-1">Affiliation</div><div class="text-zinc-300 font-medium text-sm">{{ data.ideology || 'N/A' }}</div></div>
                            <div><div class="text-[10px] text-zinc-600 uppercase font-bold mb-1">Nationality</div><div class="text-zinc-300 font-medium text-sm">{{ data.nationality || 'N/A' }}</div></div>
                            <div><div class="text-[10px] text-zinc-600 uppercase font-bold mb-1">Age / Sex</div><div class="text-zinc-300 font-medium text-sm">{{ data.age || '?' }} / {{ data.sex || data.gender || '?' }}</div></div>
                            <div><div class="text-[10px] text-zinc-600 uppercase font-bold mb-1">Clearance</div><div class="text-xs font-bold px-2 py-0.5 inline-block rounded" :class="getThreatClass(data.threat_level)">{{ data.threat_level }}</div></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 border-t border-zinc-800">
                <div class="border-b md:border-b-0 md:border-r border-zinc-800">
                    <div class="bg-zinc-950/50 p-4 border-b border-zinc-800 sticky top-0 backdrop-blur-sm z-10">
                        <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-widest"><i class="fa-solid fa-list-ul mr-2"></i>Recent Intel</h3>
                    </div>
                    <div v-if="data.interactions.length === 0" class="p-8 text-center text-xs text-zinc-600 font-mono">NO RECORDS FOUND</div>
                    <div v-for="ix in data.interactions" class="p-5 border-b border-zinc-800/50 hover:bg-white/5 transition-colors">
                        <div class="flex justify-between items-baseline mb-2">
                            <span class="text-emerald-500 font-mono text-xs font-bold uppercase">{{ ix.type }}</span>
                            <span class="text-[10px] text-zinc-600">{{ new Date(ix.date).toLocaleDateString() }}</span>
                        </div>
                        <p class="text-sm text-zinc-400 leading-relaxed">{{ ix.conclusion || 'Log entry redacted.' }}</p>
                    </div>
                </div>
                <div>
                    <div class="border-b border-zinc-800">
                        <div class="bg-zinc-950/50 p-4 border-b border-zinc-800 sticky top-0 backdrop-blur-sm z-10">
                            <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-widest"><i class="fa-solid fa-map-pin mr-2"></i>Known Locations</h3>
                        </div>
                        <div class="max-h-64 overflow-y-auto">
                            <div v-if="data.locations.length === 0" class="p-8 text-center text-xs text-zinc-600 font-mono">NO LOCATION DATA</div>
                            <div v-for="loc in data.locations" class="p-4 border-b border-zinc-800/50 flex items-start gap-3 hover:bg-white/5">
                                <i class="fa-solid fa-location-crosshairs mt-1 text-zinc-600"></i>
                                <div>
                                    <div class="text-sm font-bold text-zinc-300">{{ loc.name }}</div>
                                    <div class="text-xs text-zinc-500">{{ loc.address }}</div>
                                </div>
                                <a :href="'https://www.google.com/maps/search/?api=1&query='+loc.lat+','+loc.lng" target="_blank" class="ml-auto text-zinc-600 hover:text-emerald-500"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="bg-zinc-950/50 p-4 border-b border-zinc-800 sticky top-0 backdrop-blur-sm z-10">
                            <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-widest"><i class="fa-solid fa-paperclip mr-2"></i>Attachments</h3>
                        </div>
                        <div class="p-4 grid grid-cols-2 gap-3">
                             <div v-if="data.media.length === 0" class="col-span-2 py-8 text-center text-xs text-zinc-600 font-mono">NO FILES ATTACHED</div>
                             <a v-for="m in data.media" :href="resolveImg(m.object_key)" target="_blank" class="block bg-zinc-800/50 border border-zinc-700/50 p-3 hover:bg-zinc-800 hover:border-emerald-500/50 transition-all group">
                                <div class="flex items-center gap-3">
                                    <i class="fa-regular fa-file text-zinc-500 group-hover:text-emerald-500"></i>
                                    <div class="min-w-0">
                                        <div class="text-xs font-bold text-zinc-400 truncate group-hover:text-white">{{ m.description }}</div>
                                        <div class="text-[9px] text-zinc-600 uppercase">{{ m.content_type.split('/')[1] }}</div>
                                    </div>
                                </div>
                             </a>
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
            const token = "${token}";
            const formatTime = (s) => { if(s < 0) return "00:00"; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return \`\${m.toString().padStart(2, '0')}:\${sec.toString().padStart(2, '0')}\`; };
            const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : 'https://www.transparenttextures.com/patterns/carbon-fibre.png';
            const getThreatClass = (l) => { const map = { 'Low': 'bg-emerald-900 text-emerald-300', 'Medium': 'bg-amber-900 text-amber-300', 'High': 'bg-orange-900 text-orange-300', 'Critical': 'bg-red-900 text-red-300 animate-pulse' }; return map[l] || 'bg-zinc-800 text-zinc-400'; };
            onMounted(async () => {
                try {
                    const res = await fetch('/api/share/' + token);
                    if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Connection Refused"); }
                    data.value = await res.json();
                    timer.value = data.value.meta.remaining_seconds;
                    setInterval(() => { if(timer.value > 0) timer.value--; else if(!error.value) error.value = "Link Expired"; }, 1000);
                } catch(e) { error.value = e.message || "Access Denied"; } finally { loading.value = false; }
            });
            return { loading, error, data, timer, formatTime, getThreatClass, resolveImg };
        }
    }).mount('#app');
  </script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html' } });
}

export function serveHtml() {
  return new Response(`<!DOCTYPE html>
<html lang="en" class="h-full bg-gray-50">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${APP_TITLE}</title>
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
    .marker-pin { width: 30px; height: 30px; border-radius: 50% 50% 50% 0; background: #2563eb; position: absolute; transform: rotate(-45deg); left: 50%; top: 50%; margin: -15px 0 0 -15px; box-shadow: 0px 2px 5px rgba(0,0,0,0.3); }
    .marker-pin::after { content: ''; width: 24px; height: 24px; margin: 3px 0 0 3px; background: #fff; position: absolute; border-radius: 50%; }
    .custom-div-icon { background: transparent; border: none; }
    .custom-div-icon img { width: 24px; height: 24px; border-radius: 50%; position: absolute; top: 3px; left: 3px; transform: rotate(45deg); z-index: 2; object-fit: cover; }
    .leaflet-popup-content-wrapper { background: white; color: #111827; border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: 12px; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }
    .shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
    @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
  </style>
</head>
<body class="h-full overflow-hidden selection:bg-blue-100 selection:text-blue-900">
  <div id="app" class="h-full flex flex-col">

    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div class="w-full max-w-sm glass p-8 shadow-xl">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-3xl shadow-lg shadow-blue-500/30">
                    <i class="fa-solid fa-users-viewfinder"></i>
                </div>
                <h1 class="text-2xl font-extrabold text-gray-900 tracking-tight">People<span class="text-blue-600">OS</span></h1>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="user@domain.com" class="glass-input w-full p-3 text-sm" required>
                <input v-model="auth.password" type="password" placeholder="••••••••" class="glass-input w-full p-3 text-sm" required>
                <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm shadow-lg shadow-blue-500/20">
                    {{ loading ? 'Accessing...' : 'Secure Login' }}
                </button>
            </form>
        </div>
    </div>

    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
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

        <header class="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20 shrink-0 shadow-sm">
            <span class="font-extrabold text-gray-900 tracking-tight text-lg">People<span class="text-blue-600">OS</span></span>
            <button @click="openSettings"><i class="fa-solid fa-gear text-gray-500"></i></button>
        </header>

        <main class="flex-1 relative overflow-hidden bg-gray-50 flex flex-col">
            <div v-if="actionLoading" class="absolute inset-0 bg-white/70 backdrop-blur-sm z-30 flex items-center justify-center text-sm font-bold text-gray-700">
                <i class="fa-solid fa-spinner animate-spin mr-2"></i> Working...
            </div>
            
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
                                    <div class="text-sm font-semibold text-gray-900">{{ item.title }} <span class="text-gray-400 font-normal mx-1">•</span> <span class="text-gray-500">{{ item.desc }}</span></div>
                                    <div class="text-xs text-gray-400 mt-1">{{ new Date(item.date).toLocaleString() }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col">
                <div class="p-4 border-b border-gray-200 bg-white flex gap-3 shadow-sm z-10">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-search absolute left-3 top-3.5 text-gray-400"></i>
                        <input v-model="search" placeholder="Search contacts..." class="w-full bg-gray-100 border-none rounded-lg py-3 pl-10 text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                    <button @click="openModal('add-subject')" class="bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 transition-all"><i class="fa-solid fa-user-plus mr-2"></i>New</button>
                </div>
                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="glass p-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all group relative overflow-hidden" :class="'threat-' + s.threat_level.toLowerCase()">
                        <div class="flex items-start justify-between">
                            <div class="flex gap-3">
                                <div class="w-12 h-12 bg-gray-200 rounded-full overflow-hidden border-2 border-white shadow-sm">
                                    <img :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover">
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

            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col h-full bg-gray-50">
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

                <div class="flex border-b border-gray-200 overflow-x-auto bg-white shrink-0">
                    <button v-for="t in ['profile','routine','meetings','locations','network','files']" 
                        @click="changeSubTab(t)" 
                        :class="subTab === t ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
                        class="px-5 py-3 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors">
                        {{ t }}
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto p-4 md:p-8">
                    <div v-if="subTab === 'profile'" class="space-y-6 max-w-5xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-square bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden relative group">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                    <button @click="openModal('edit-profile')" class="absolute inset-0 bg-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-sm font-bold text-gray-800 cursor-pointer">Edit Profile</button>
                                </div>
                                <div class="glass p-4 space-y-2">
                                    <div class="text-xs text-gray-500 uppercase font-bold">Priority Status</div>
                                    <select v-model="selected.threat_level" @change="updateSubject" class="w-full bg-white border border-gray-300 rounded-lg text-sm p-2 text-gray-900 font-medium">
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
                                        <div><span class="text-gray-400 text-xs font-bold block mb-1 uppercase">Religion</span> <span class="font-medium text-gray-900">{{selected.religion || '—'}}</span></div>
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
                                      <div class="grid grid-cols-4 gap-4 text-center text-sm mb-4">
                                          <div class="bg-gray-50 p-3 rounded-lg border border-gray-100"><div class="text-gray-400 text-xs font-bold mb-1 uppercase">Height</div>{{selected.height || '--'}}</div>
                                          <div class="bg-gray-50 p-3 rounded-lg border border-gray-100"><div class="text-gray-400 text-xs font-bold mb-1 uppercase">Weight</div>{{selected.weight || '--'}}</div>
                                          <div class="bg-gray-50 p-3 rounded-lg border border-gray-100"><div class="text-gray-400 text-xs font-bold mb-1 uppercase">Sex</div>{{selected.sex || selected.gender || '--'}}</div>
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
                        </div>
                    </div>

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
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-[10px] text-red-400 text-right hover:text-red-600 font-bold mt-1">REMOVE PIN</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div class="flex justify-between items-center mb-4 shrink-0">
                            <h3 class="text-sm font-bold text-gray-900 uppercase">Relationship Matrix</h3>
                            <button @click="openModal('add-rel')" class="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-bold text-gray-600">Add Connection</button>
                        </div>
                        <div class="flex-1 flex gap-4 overflow-hidden">
                            <div class="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm relative overflow-hidden min-h-[400px]">
                                <div id="relNetwork" class="absolute inset-0"></div>
                            </div>
                        </div>
                    </div>

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
                                </div>
                                <button @click="deleteItem('subject_intel', log.id)" class="text-gray-400 hover:text-red-500"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>
                    </div>

                    <div v-if="subTab === 'files'" class="space-y-6">
                        <div class="flex flex-col md:flex-row gap-6">
                            <div @click="triggerUpload('media')" class="h-32 w-full md:w-48 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-all bg-white">
                                <i class="fa-solid fa-cloud-arrow-up text-2xl mb-2"></i>
                                <span class="text-xs uppercase font-bold">Upload Document</span>
                            </div>
                            <div class="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                <div v-for="m in selected.media" :key="m.id" class="glass group relative aspect-square overflow-hidden hover:shadow-lg transition-all">
                                    <img v-if="m.content_type.startsWith('image')" :src="resolveImg(m.object_key)" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50"><i class="fa-solid fa-file-lines text-4xl"></i></div>
                                    <div class="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-4 text-center">
                                        <p class="text-[10px] text-white font-medium mb-3 line-clamp-2">{{m.description || 'Attachment'}}</p>
                                        <a :href="resolveImg(m.object_key)" download class="bg-white text-gray-900 px-3 py-1.5 rounded text-xs font-bold mb-2 hover:bg-blue-50">Download</a>
                                        <button @click="deleteItem('subject_media', m.id)" class="text-red-400 hover:text-red-300 text-xs"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="currentTab === 'map'" class="flex-1 relative bg-gray-100">
                <div id="warRoomMap" class="w-full h-full z-0"></div>
                <div class="absolute top-4 right-4 z-[400] w-72 glass shadow-lg p-1">
                    <div class="relative">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 text-xs"></i>
                        <input v-model="warMapSearch" placeholder="Find contact on map..." class="bg-transparent w-full text-base md:text-sm p-2 pl-8 text-gray-800 outline-none font-medium placeholder-gray-400">
                    </div>
                </div>
            </div>
        </main>

        <nav class="md:hidden h-16 bg-white border-t border-gray-200 flex justify-around items-center shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'text-blue-600 bg-blue-50 rounded-lg' : 'text-gray-400'" class="flex flex-col items-center justify-center p-2 w-16 transition-all">
                <i :class="t.icon" class="text-xl mb-1"></i>
                <span class="text-[10px] font-bold" v-if="currentTab === t.id">{{t.label}}</span>
            </button>
        </nav>
    </div>

    <div v-if="modal.active" class="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-lg glass bg-white shadow-2xl border border-white/50 animate-fade-in transform transition-all flex flex-col max-h-[85vh]" :class="{'shake': modal.shake}">
            <div class="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
                <h3 class="text-sm font-extrabold text-gray-900 uppercase tracking-wide">{{ modalTitle }}</h3>
                <button @click="closeModal" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-lg"></i></button>
            </div>
            
            <div class="overflow-y-auto p-6">
                <form v-if="modal.active === 'add-subject' || modal.active === 'edit-profile'" @submit.prevent="submitSubject" class="space-y-4">
                    <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <label class="text-[10px] text-gray-500 font-bold uppercase block mb-1">Avatar / Image</label>
                        <div class="flex gap-2">
                             <input v-model="forms.subject.avatar_path" placeholder="Paste Image URL..." class="glass-input flex-1 p-2 text-xs">
                             <button type="button" @click="triggerUpload('avatar')" class="bg-white border border-gray-300 px-3 rounded text-xs font-bold hover:bg-gray-100">Upload</button>
                        </div>
                    </div>
                    <input v-model="forms.subject.full_name" placeholder="Full Name *" class="glass-input w-full p-3 text-sm font-medium" :class="{'error': errors.full_name}">
                    <input v-model="forms.subject.alias" placeholder="Alias / Nickname" class="glass-input w-full p-3 text-sm">
                    <div class="grid grid-cols-3 gap-4">
                        <select v-model="forms.subject.sex" class="glass-input p-3 text-sm bg-white">
                            <option disabled value="">Sex</option>
                            <option>Female</option><option>Male</option><option>Intersex</option><option>Other</option><option>Unknown</option>
                        </select>
                        <select v-model="forms.subject.threat_level" class="glass-input p-3 text-sm bg-white">
                            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                        </select>
                        <input v-model="forms.subject.occupation" placeholder="Job Title" class="glass-input p-3 text-sm">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <input type="date" v-model="forms.subject.dob" class="glass-input p-2.5 text-sm bg-white w-full text-gray-900">
                        <input v-model="forms.subject.age" type="number" placeholder="Age" class="glass-input p-2.5 text-sm w-full bg-gray-50" readonly>
                    </div>
                    <input v-model="forms.subject.nationality" placeholder="Nationality" class="glass-input w-full p-3 text-sm" list="nationalityOptions">
                    <input v-model="forms.subject.ideology" placeholder="Affiliations / Organizations" class="glass-input w-full p-3 text-sm" list="ideologyOptions">
                    <input v-model="forms.subject.religion" placeholder="Religion" class="glass-input w-full p-3 text-sm" list="religionOptions">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input v-model="forms.subject.height" placeholder="Height (e.g., 180cm)" class="glass-input p-3 text-sm">
                        <input v-model="forms.subject.weight" placeholder="Weight (e.g., 75kg)" class="glass-input p-3 text-sm">
                        <input v-model="forms.subject.last_sighted" placeholder="Last sighted (notes or timestamp)" class="glass-input p-3 text-sm">
                    </div>
                    <textarea v-model="forms.subject.identifying_marks" placeholder="Distinguishing Features (scars, tattoos, etc.)" rows="2" class="glass-input w-full p-3 text-sm"></textarea>
                    <textarea v-model="forms.subject.modus_operandi" placeholder="Routine & Habits" rows="3" class="glass-input w-full p-3 text-sm"></textarea>
                    <textarea v-model="forms.subject.weakness" placeholder="Challenges / Pain Points" rows="2" class="glass-input w-full p-3 text-sm border-red-100"></textarea>

                    <datalist id="nationalityOptions"><option v-for="nat in fieldSuggestions.nationality" :value="nat"></option></datalist>
                    <datalist id="ideologyOptions"><option v-for="ideo in fieldSuggestions.ideology" :value="ideo"></option></datalist>
                    <datalist id="religionOptions"><option v-for="rel in fieldSuggestions.religion" :value="rel"></option></datalist>

                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20">Save Contact</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="glass-input p-3 text-sm bg-white text-gray-900" required>
                        <select v-model="forms.interaction.type" class="glass-input p-3 text-sm bg-white">
                            <option>Meeting</option><option>Call</option><option>Email</option><option>Observation</option><option>Other</option>
                        </select>
                    </div>
                    <textarea v-model="forms.interaction.transcript" placeholder="Notes / Discussion *" rows="6" class="glass-input w-full p-3 text-sm font-mono" :class="{'error': errors.transcript}"></textarea>
                    <textarea v-model="forms.interaction.conclusion" placeholder="Summary / Next Steps" rows="3" class="glass-input w-full p-3 text-sm"></textarea>
                    <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20">Save Log</button>
                </form>

                <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                    <div class="relative z-[100]">
                        <input v-model="locationSearchQuery" @keyup.enter="searchLocations" placeholder="Search for a place (Press Enter)" class="glass-input w-full p-3 pl-10 text-sm border-blue-200" :disabled="locationSearchLoading">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-blue-400"></i>
                        <div v-if="locationSearchLoading" class="absolute right-3 top-3 text-blue-500 text-xs font-bold flex items-center gap-1"><i class="fa-solid fa-spinner animate-spin"></i> Searching...</div>
                        <div v-if="locationSearchResults.length" class="absolute w-full bg-white border border-gray-200 max-h-48 overflow-y-auto mt-1 shadow-xl rounded-lg z-[101]">
                            <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-blue-50 cursor-pointer text-xs border-b border-gray-100 last:border-0 text-gray-700">{{ res.display_name }}</div>
                        </div>
                    </div>
                    <div class="h-48 w-full bg-gray-100 rounded-lg border-2 border-white shadow-inner relative overflow-hidden z-0">
                        <div id="locationPickerMap" class="absolute inset-0 z-0"></div>
                        <div class="absolute bottom-2 right-2 bg-white/90 text-[10px] text-gray-600 p-1.5 px-3 rounded-full font-bold pointer-events-none z-[500] shadow-sm border border-gray-200">Tap or Click to Pin</div>
                    </div>
                    <div class="text-[11px] text-gray-500 bg-blue-50 border border-blue-100 p-2 rounded-lg" :class="{'border-red-200 bg-red-50 text-red-600': errors.loc_coords}">
                        <i class="fa-solid" :class="forms.location.lat ? 'fa-location-crosshairs text-blue-500' : 'fa-hand-pointer text-gray-400'"></i>
                        <span class="ml-2 font-medium">{{ forms.location.lat ? ('Pinned at ' + forms.location.lat.toFixed(4) + ', ' + forms.location.lng.toFixed(4)) : 'Select a point on the map to place the pin.' }}</span>
                    </div>
                    <input v-model="forms.location.name" placeholder="Location Name *" class="glass-input w-full p-3 text-sm" :class="{'error': errors.loc_name}">
                    <input v-model="forms.location.address" placeholder="Full Address" class="glass-input w-full p-3 text-sm">
                    <button type="submit" :disabled="actionLoading" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 disabled:opacity-60">{{ actionLoading ? 'Saving...' : 'Pin Location' }}</button>
                </form>

                 <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <input v-model="forms.intel.label" placeholder="Topic *" class="glass-input w-full p-3 text-sm" :class="{'error': errors.intel_label}">
                    <textarea v-model="forms.intel.value" placeholder="Observation *" rows="4" class="glass-input w-full p-3 text-sm" :class="{'error': errors.intel_val}"></textarea>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest">Save Entry</button>
                 </form>

                 <form v-if="modal.active === 'add-rel'" @submit.prevent="submitRel" class="space-y-4">
                    <div class="flex items-center gap-2 mb-2">
                        <input type="checkbox" v-model="forms.rel.isExternal" id="extCheck" class="w-4 h-4 text-blue-600 rounded">
                        <label for="extCheck" class="text-xs font-bold text-gray-600 uppercase cursor-pointer">External Contact</label>
                    </div>
                    <div v-if="!forms.rel.isExternal">
                        <select v-model="forms.rel.targetId" class="glass-input w-full p-3 text-sm bg-white">
                            <option v-for="s in subjects" :value="s.id">{{s.full_name}} ({{s.alias}})</option>
                        </select>
                    </div>
                    <div v-else class="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <input v-model="forms.rel.customName" placeholder="External Name *" class="glass-input w-full p-2 text-sm">
                    </div>
                    <input v-model="forms.rel.type" placeholder="Relationship Type *" class="glass-input w-full p-3 text-sm" :class="{'error': errors.rel_type}">
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs uppercase tracking-widest">Link Contacts</button>
                 </form>

                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <div class="text-center">
                        <div class="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 text-white text-xl shadow-lg shadow-blue-500/30"><i class="fa-solid fa-paper-plane"></i></div>
                        <h4 class="font-bold text-gray-900">Secure Profile Transmission</h4>
                        <p class="text-xs text-gray-500 mt-1 px-8">Generate a one-time link. Timer starts when the recipient opens it.</p>
                    </div>
                    <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                        <div class="flex gap-2">
                            <div class="relative w-32 shrink-0">
                                <input v-model.number="forms.share.minutes" type="number" class="glass-input p-2.5 w-full text-center text-sm font-bold pl-2 pr-10 text-blue-700 bg-white" placeholder="30" min="1" max="10080">
                                <span class="absolute right-3 top-2.5 text-xs text-blue-300 font-bold pointer-events-none">MIN</span>
                            </div>
                            <button @click="createShareLink" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs uppercase shadow-md transition-all flex items-center justify-center gap-2">
                                <i class="fa-solid fa-bolt"></i> Generate Link
                            </button>
                        </div>
                        <div v-if="forms.share.result" class="relative group">
                            <div class="absolute inset-0 bg-blue-200 blur opacity-20 rounded-lg"></div>
                            <input readonly :value="forms.share.result" class="relative w-full bg-white border border-blue-300 text-blue-600 text-xs p-3 rounded-lg pr-12 font-mono font-medium shadow-sm">
                            <button @click="copyToClipboard(forms.share.result)" class="absolute right-1 top-1 bottom-1 px-3 text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><i class="fa-regular fa-copy"></i></button>
                        </div>
                        <div v-if="forms.share.error" class="text-xs text-red-600 font-semibold bg-red-50 border border-red-100 rounded-lg p-3">{{ forms.share.error }}</div>
                    </div>
                    <div class="border-t border-gray-100 pt-4">
                        <div class="flex justify-between items-center mb-3">
                            <h5 class="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Transmissions</h5>
                            <button @click="fetchShareLinks" class="text-blue-500 hover:text-blue-700 text-xs"><i class="fa-solid fa-rotate-right"></i></button>
                        </div>
                        <div class="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            <div v-for="link in activeShareLinks" :key="link.token" class="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-300 transition-colors">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 mb-1">
                                        <div class="w-2 h-2 rounded-full shrink-0" :class="link.views > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'"></div>
                                        <span class="text-xs font-bold text-gray-700 truncate font-mono">...{{ link.token.slice(-6) }}</span>
                                    </div>
                                    <div class="text-[10px] text-gray-400 font-medium">{{ (link.duration_seconds/60).toFixed(0) }}m Limit • {{ link.views }} Views</div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button @click="copyShare(link.url)" class="text-[10px] font-bold text-blue-500 hover:bg-blue-50 px-3 py-1.5 rounded border border-transparent hover:border-blue-100 transition-all flex items-center gap-1"><i class="fa-regular fa-copy"></i> COPY</button>
                                    <button @click="revokeLink(link.token)" class="text-[10px] font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded border border-transparent hover:border-red-100 transition-all">REVOKE</button>
                                </div>
                            </div>
                            <div v-if="activeShareLinks.length === 0" class="text-center py-6"><i class="fa-solid fa-inbox text-gray-200 text-2xl mb-2"></i><div class="text-xs text-gray-400">No active links</div></div>
                        </div>
                    </div>
                 </div>

                <form v-if="modal.active === 'settings'" @submit.prevent class="space-y-6 text-center">
                    <div class="p-6 bg-red-50 border border-red-100 rounded-xl">
                        <h4 class="text-red-600 font-bold uppercase text-xs mb-2">Danger Zone</h4>
                        <p class="text-gray-500 text-xs mb-4">Factory Reset wipes ALL data. System will reboot. Cannot be undone.</p>
                        <button @click="burnProtocol" class="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg text-xs uppercase tracking-widest w-full shadow-lg shadow-red-500/20">Factory Reset System</button>
                    </div>
                    <button @click="logout" class="text-gray-400 text-xs hover:text-gray-800 font-bold uppercase tracking-wider">Log Out</button>
                </form>
            </div>
        </div>
    </div>
    <input type="file" ref="fileInput" class="hidden" @change="handleFile" accept="image/*,application/pdf">
  </div>
  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;
    function calculateAge(dob) {
      if (!dob) return null;
      const birthDate = new Date(dob);
      if (isNaN(birthDate.getTime())) return null;
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      return age >= 0 ? age : null;
    }
    createApp({
      setup() {
        const view = ref('auth');
        const loading = ref(false);
        const actionLoading = ref(false);
        const locationSearchLoading = ref(false);
        const auth = reactive({ email: '', password: '' });
        const tabs = [{ id: 'dashboard', label: 'Home', icon: 'fa-solid fa-house' }, { id: 'targets', label: 'Contacts', icon: 'fa-solid fa-address-book' }, { id: 'map', label: 'Global Map', icon: 'fa-solid fa-earth-americas' }];
        const currentTab = ref('dashboard');
        const subTab = ref('profile');
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const selected = ref(null);
        const activeShareLinks = ref([]);
        const search = ref('');
        const modal = reactive({ active: null, shake: false });
        const errors = reactive({});
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        const warMapSearch = ref('');
        const SUBJECT_FORM_FIELDS = ['admin_id','full_name','alias','status','threat_level','sex','gender','occupation','nationality','ideology','religion','dob','age','modus_operandi','weakness','avatar_path','last_sighted','height','weight','identifying_marks','location','contact','hometown','previous_locations','notes','social_links','digital_identifiers','eye_color','hair_color','blood_type'];
        const defaultSubjectValues = { admin_id: '', full_name: '', alias: '', status: 'Active', threat_level: 'Low', sex: '', gender: '', occupation: '', nationality: '', ideology: '', religion: '', dob: '', age: null, modus_operandi: '', weakness: '', avatar_path: '', last_sighted: '', height: '', weight: '', identifying_marks: '', location: '', contact: '', hometown: '', previous_locations: '', notes: '', social_links: '', digital_identifiers: '', eye_color: '', hair_color: '', blood_type: '' };
        const buildSubjectForm = (source = {}, adminId = '') => { const form = {}; SUBJECT_FORM_FIELDS.forEach((key) => { form[key] = source[key] ?? (key === 'admin_id' ? adminId : defaultSubjectValues[key]); }); return form; };
        const buildSubjectPayload = (form) => { const payload = {}; SUBJECT_FORM_FIELDS.forEach((key) => { if (form[key] !== undefined) payload[key] = form[key]; }); return payload; };
        const forms = reactive({ subject: buildSubjectForm({}, ''), interaction: {}, location: {}, intel: {}, rel: {}, share: { minutes: 30, result: '', error: '' } });
        const fieldSuggestions = reactive({ nationality: [], ideology: [], religion: [] });

        const api = async (ep, opts = {}) => {
            const finalOpts = { ...opts, headers: { ...(opts.headers || {}) } };
            // Auto-inject Token
            const token = localStorage.getItem('auth_token');
            if(token) finalOpts.headers['Authorization'] = 'Bearer ' + token;
            
            if (finalOpts.body && !(finalOpts.body instanceof FormData) && !finalOpts.headers['Content-Type']) {
                finalOpts.headers['Content-Type'] = 'application/json';
            }
            const res = await fetch('/api' + ep, finalOpts);
            if (!res.ok) {
                 if(res.status === 401) { localStorage.removeItem('auth_token'); view.value = 'auth'; }
                 const text = await res.text();
                 try { const json = JSON.parse(text); throw new Error(json.error || "Server Error"); }
                 catch(e) { throw new Error(text || res.statusText); }
            }
            return res.json();
        };

        let actionDepth = 0;
        const withAction = async (fn) => { actionDepth++; actionLoading.value = true; try { await fn(); } finally { actionDepth = Math.max(0, actionDepth - 1); if (actionDepth === 0) actionLoading.value = false; } };
        const handleAuth = async () => {
            loading.value = true;
            try {
                const res = await api('/login', { method: 'POST', body: JSON.stringify(auth) });
                localStorage.setItem('auth_token', res.token);
                localStorage.setItem('admin_id', res.id); // For legacy refs
                view.value = 'app';
                fetchData();
            } catch(e) { alert(e.message); } finally { loading.value = false; }
        };
        const fetchData = async () => withAction(async () => {
            const [d, s, sugg] = await Promise.all([ api('/dashboard'), api('/subjects'), api('/subject-suggestions') ]);
            stats.value = d.stats; feed.value = d.feed; subjects.value = s;
            fieldSuggestions.nationality = sugg.nationality || []; fieldSuggestions.ideology = sugg.ideology || []; fieldSuggestions.religion = sugg.religion || [];
            if(!selected.value && subjects.value.length) await viewSubject(subjects.value[0].id);
        });
        const viewSubject = async (id) => withAction(async () => { selected.value = await api('/subjects/'+id); if (!selected.value.age && selected.value.dob) selected.value.age = calculateAge(selected.value.dob); currentTab.value = 'detail'; subTab.value = 'profile'; });
        const changeTab = (t) => { currentTab.value = t; };
        const changeSubTab = (t) => { subTab.value = t; };
        const updateSubject = async () => { if(!selected.value) return; await api('/subjects/' + selected.value.id, { method: 'PATCH', body: JSON.stringify({ threat_level: selected.value.threat_level }) }); };
        const submitSubject = async () => withAction(async () => { try { const isEdit = modal.active === 'edit-profile'; const ep = isEdit ? '/subjects/' + selected.value.id : '/subjects'; const method = isEdit ? 'PATCH' : 'POST'; const payload = buildSubjectPayload(forms.subject); payload.age = payload.dob ? calculateAge(payload.dob) : null; await api(ep, { method, body: JSON.stringify(payload) }); if(isEdit) selected.value = { ...selected.value, ...payload }; else fetchData(); closeModal(); } catch(e) { errors.form = e.message; alert(e.message); } });
        const submitInteraction = async () => withAction(async () => { await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) }); viewSubject(selected.value.id); closeModal(); });
        const submitLocation = async () => withAction(async () => { Object.keys(errors).forEach(k => delete errors[k]); if(!forms.location.name) errors.loc_name = 'Required'; if(!forms.location.lat || !forms.location.lng) errors.loc_coords = 'Select coordinates on the map'; if(errors.loc_name || errors.loc_coords) return; await api('/location', { method: 'POST', body: JSON.stringify(forms.location) }); viewSubject(selected.value.id); closeModal(); });
        const submitIntel = async () => withAction(async () => { await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) }); viewSubject(selected.value.id); closeModal(); });
        const submitRel = async () => withAction(async () => { await api('/relationship', { method: 'POST', body: JSON.stringify({...forms.rel, subjectA: selected.value.id}) }); viewSubject(selected.value.id); closeModal(); });
        const fetchShareLinks = async () => { if(!selected.value) return; const links = await api('/share-links?subjectId=' + selected.value.id); activeShareLinks.value = Array.isArray(links) ? links.filter(l => l.is_active) : []; };
        const revokeLink = async (token) => { if (!token) return; if (!confirm('Revoke this share link? Recipients will immediately lose access.')) return; await withAction(async () => { await api('/share-links?token=' + token, { method: 'DELETE' }); fetchShareLinks(); }); };
        const copyShare = (url) => { if (!url) return; copyToClipboard(url); };
        const createShareLink = async () => { try { if (!selected.value) return; forms.share.error = ''; forms.share.result = ''; await withAction(async () => { const res = await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes }) }); forms.share.result = res.url; }); fetchShareLinks(); } catch(e) { forms.share.error = e.message; } };
        const copyToClipboard = (text) => { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => alert("Copied!")).catch(() => fallbackCopy(text)); } else { fallbackCopy(text); } };
        const fallbackCopy = (text) => { const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; document.body.appendChild(textArea); textArea.focus(); textArea.select(); try { document.execCommand('copy'); alert("Copied to clipboard!"); } catch (err) { alert("Could not copy text."); } document.body.removeChild(textArea); };
        watch(() => forms.subject.dob, (val) => { forms.subject.age = calculateAge(val); });
        let mapInstance = null, pickerMapInstance = null, pickerMarker = null;
        const initMap = (elementId, locations, isGlobal = false, isPicker = false) => { const el = document.getElementById(elementId); if(!el) return; if (isPicker && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; } if (!isPicker && mapInstance) { mapInstance.remove(); mapInstance = null; } const map = L.map(elementId, { attributionControl: false }).setView([20, 0], 2); L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map); if(isPicker) { pickerMapInstance = map; map.on('click', e => placePickerMarker(map, e.latlng.lat, e.latlng.lng)); setTimeout(() => map.invalidateSize(), 100); } else { mapInstance = map; const markers = []; locations.forEach(loc => { if(loc.lat && loc.lng) { const m = L.marker([loc.lat, loc.lng]).addTo(map); if(!isGlobal) m.bindPopup(\`<b>\${loc.name}</b>\`); markers.push(m); } }); if(markers.length > 0) { const group = L.featureGroup(markers); map.fitBounds(group.getBounds().pad(0.1)); } } };
        watch(() => subTab.value, (val) => { if(val === 'locations' && selected.value) nextTick(() => initMap('subjectMap', selected.value.locations || [])); if(val === 'network' && selected.value) nextTick(initNetwork); });
        watch(() => currentTab.value, (val) => { if(val === 'map') nextTick(async () => { const allLocs = await api('/map-data'); initMap('warRoomMap', allLocs, true); }); });
        const placePickerMarker = (map, lat, lng) => { forms.location.lat = lat; forms.location.lng = lng; if (pickerMarker) map.removeLayer(pickerMarker); pickerMarker = L.marker([lat, lng]).addTo(map); };
        const searchLocations = async () => { if(!locationSearchQuery.value) return; locationSearchLoading.value = true; locationSearchResults.value = []; try { const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(locationSearchQuery.value), { headers: { 'User-Agent': 'PeopleOS/1.0' } }); locationSearchResults.value = await res.json(); } catch(e) { locationSearchResults.value = []; errors.loc_coords = 'Unable to search locations right now'; } finally { locationSearchLoading.value = false; } };
        const selectLocation = (res) => { forms.location.lat = parseFloat(res.lat); forms.location.lng = parseFloat(res.lon); forms.location.address = res.display_name; locationSearchResults.value = []; if(pickerMapInstance) { pickerMapInstance.setView([res.lat, res.lon], 15); placePickerMarker(pickerMapInstance, forms.location.lat, forms.location.lng); } };
        const openModal = (type) => { modal.active = type; const aid = localStorage.getItem('admin_id'); Object.keys(errors).forEach(k => delete errors[k]); if(type === 'add-subject') forms.subject = buildSubjectForm({}, aid); if(type === 'edit-profile') forms.subject = buildSubjectForm(selected.value || {}, aid); if(type === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) }; if(type === 'add-location') { forms.location = { subject_id: selected.value.id }; locationSearchQuery.value = ''; locationSearchResults.value = []; nextTick(() => initMap('locationPickerMap', [], false, true)); } if(type === 'add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' }; if(type === 'add-rel') forms.rel = { subjectA: selected.value.id, isExternal: false }; if(type === 'share-secure') { forms.share = { minutes: 30, result: '', error: '' }; fetchShareLinks(); } };
        const closeModal = () => modal.active = null;
        const initNetwork = () => { const container = document.getElementById('relNetwork'); if(!container || !selected.value) return; const nodes = [{ id: selected.value.id, label: selected.value.full_name, shape: 'circularImage', image: resolveImg(selected.value.avatar_path), size: 30 }]; const edges = []; selected.value.relationships.forEach((r, i) => { const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id; nodes.push({ id: targetId || 'ext-'+i, label: r.target_name, shape: 'circularImage', image: resolveImg(r.target_avatar) }); edges.push({ from: selected.value.id, to: targetId || 'ext-'+i }); }); new vis.Network(container, { nodes, edges }, { nodes: { font: { color: '#374151' }, borderWidth: 2 }, edges: { color: '#cbd5e1' } }); };
        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : 'https://www.transparenttextures.com/patterns/carbon-fibre.png';
        const getThreatColor = (l, isBg = false) => { const c = { 'Low': isBg ? 'bg-green-100 text-green-700' : 'text-green-600', 'Medium': isBg ? 'bg-amber-100 text-amber-700' : 'text-amber-600', 'High': isBg ? 'bg-orange-100 text-orange-700' : 'text-orange-600', 'Critical': isBg ? 'bg-red-100 text-red-700' : 'text-red-600' }; return c[l] || (isBg ? 'bg-gray-100 text-gray-700' : 'text-gray-500'); };
        const flyTo = (loc) => mapInstance?.flyTo([loc.lat, loc.lng], 15);
        const openSettings = () => openModal('settings');
        const logout = () => { if (!confirm('Log out of PEOPLE OS? Any unsaved changes will be lost.')) return; localStorage.clear(); location.reload(); };
        const filteredSubjects = computed(() => subjects.value.filter(s => s.full_name.toLowerCase().includes(search.value.toLowerCase())));
        const exportData = () => { const blob = new Blob([JSON.stringify(selected.value, null, 2)], {type : 'application/json'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = (selected.value.alias || 'contact') + '.json'; link.click(); };
        const fileInput = ref(null); const uploadType = ref(null);
        const triggerUpload = (type) => { uploadType.value = type; fileInput.value.click(); };
        const handleFile = async (e) => {
            const f = e.target.files[0]; if(!f) return;
            const fd = new FormData();
            fd.append('file', f);
            fd.append('subjectId', selected.value.id);
            const endpoint = uploadType.value === 'avatar' ? '/upload-avatar' : '/upload-media';
            // FormData is handled automatically by browser fetch
            await api(endpoint, { method: 'POST', body: fd });
            viewSubject(selected.value.id);
        };
        const deleteItem = async (table, id) => { if(confirm('Delete this item?')) { await withAction(async () => { await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) }); await viewSubject(selected.value.id); }); } };
        const burnProtocol = async () => { if(prompt("Type 'BURN' to confirm factory reset.") === 'BURN') { await api('/nuke', { method: 'POST' }); localStorage.clear(); location.reload(); } };
        const modalTitle = computed(() => { const m = { 'add-subject': 'Add Contact', 'edit-profile': 'Edit Contact', 'add-interaction': 'Log Meeting', 'add-location': 'Pin Location', 'add-intel': 'Add Observation', 'add-rel': 'Add Connection', 'share-secure': 'Share Access', 'settings': 'Settings' }; return m[modal.active] || 'System Dialog'; });
        onMounted(() => { if(localStorage.getItem('auth_token')) { view.value = 'app'; fetchData(); } else { view.value = 'auth'; } });
        return { 
            view, auth, loading, actionLoading, tabs, currentTab, subTab, stats, feed, subjects, filteredSubjects, selected, search, modal, forms, fileInput,
            activeShareLinks, locationSearchQuery, locationSearchResults, locationSearchLoading, searchLocations, selectLocation, warMapSearch, modalTitle,
            handleAuth, fetchData, viewSubject, openModal, closeModal, submitSubject, submitInteraction, submitLocation, submitIntel, submitRel, 
            createShareLink, fetchShareLinks, revokeLink, copyShare, copyToClipboard, changeTab, changeSubTab, errors, updateSubject,
            triggerUpload, handleFile, deleteItem, burnProtocol, resolveImg, getThreatColor, flyTo, openSettings, logout, exportData
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html' } });
}
