export function serveSharedHtml(token) {
    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>CONFIDENTIAL // Profile Dossier</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <style>
        :root { --bg-dark: #020617; }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg-dark); color: #cbd5e1; }
        .glass {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 0.75rem;
        }
        .tab-btn { padding: 0.75rem 1rem; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; font-size: 0.875rem; color: #64748b; }
        .tab-btn.active { color: #3b82f6; border-color: #3b82f6; }
        /* Mobile fixes */
        .safe-pb { padding-bottom: env(safe-area-inset-bottom); }
        .avatar-marker { position: relative; }
        .avatar-marker img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    </style>
</head>
<body class="min-h-screen safe-pb">
    <div id="app" class="max-w-4xl mx-auto p-4 md:p-8 space-y-6">

        <div v-if="loading" class="flex flex-col items-center justify-center min-h-[50vh]">
            <i class="fa-solid fa-circle-notch fa-spin text-3xl text-blue-500"></i>
            <p class="mt-4 text-xs font-bold uppercase tracking-widest text-slate-500">Decrypting...</p>
        </div>

        <div v-else-if="error" class="flex items-center justify-center min-h-[50vh]">
            <div class="glass p-6 text-center border-l-4 border-red-500">
                <h1 class="text-xl font-bold text-red-500 mb-2">Access Denied</h1>
                <p class="text-sm text-slate-400">{{error}}</p>
            </div>
        </div>

        <div v-else class="space-y-6 animate-fade-in">
            <!-- Header -->
            <div class="glass p-6 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left">
                 <div class="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-800 bg-slate-900 shrink-0">
                    <img :src="resolveImg(data.avatar_path)" class="w-full h-full object-cover">
                 </div>
                 <div class="flex-1 space-y-2">
                     <h1 class="text-3xl font-bold text-white">{{data.full_name}}</h1>
                     <div class="text-blue-400 font-medium">{{data.occupation || 'Unknown Occupation'}}</div>
                     <div class="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                         <span v-if="data.alias" class="bg-slate-800 px-2 py-1 rounded text-xs text-slate-300 border border-slate-700">AKA: {{data.alias}}</span>
                         <span v-if="data.threat_level" class="bg-red-500/20 text-red-300 border border-red-700 px-2 py-1 rounded text-xs font-semibold">Threat: {{data.threat_level}}</span>
                         <span class="bg-emerald-500/10 text-emerald-300 border border-emerald-700 px-2 py-1 rounded text-xs font-semibold">Status: {{data.status || 'Unknown'}}</span>
                     </div>
                 </div>
                 <div class="text-center">
                     <div class="text-sm text-slate-400 uppercase tracking-widest">Access Expires In</div>
                     <div class="text-3xl font-bold text-white">{{formatTime(timer)}}</div>
                 </div>
            </div>

            <!-- Tabs -->
            <div class="glass p-2 flex flex-wrap gap-2 border border-slate-800">
                <button @click="activeTab = 'overview'" :class="['tab-btn', activeTab === 'overview' ? 'active' : '']">Profile</button>
                <button @click="activeTab = 'interactions'" :class="['tab-btn', activeTab === 'interactions' ? 'active' : '']">Events</button>
                <button @click="activeTab = 'intel'" :class="['tab-btn', activeTab === 'intel' ? 'active' : '']">Attributes</button>
                <button @click="activeTab = 'files'" :class="['tab-btn', activeTab === 'files' ? 'active' : '']">Files</button>
                <button v-if="data.locations?.length" @click="activeTab = 'map'" :class="['tab-btn', activeTab === 'map' ? 'active' : '']">Map</button>
                <button v-if="data.relationships?.length" @click="activeTab = 'network'" :class="['tab-btn', activeTab === 'network' ? 'active' : '']">Network</button>
            </div>

            <!-- Overview -->
            <div v-if="activeTab === 'overview'" class="glass p-6 border border-slate-800">
                <h2 class="text-lg font-bold text-white mb-4">Dossier Summary</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <div class="text-xs text-slate-400 uppercase">Identity</div>
                        <div class="text-xl font-bold text-white">{{data.full_name}}</div>
                        <div class="text-sm text-slate-400">{{data.occupation}}</div>
                        <div class="text-xs text-slate-500">DOB: {{data.dob || 'Unknown'}} · Age: {{data.age || 'N/A'}} · Nationality: {{data.nationality || 'Unknown'}}</div>
                    </div>
                    <div class="space-y-2">
                        <div class="text-xs text-slate-400 uppercase">Status</div>
                        <div class="font-semibold text-blue-400">Threat Level: {{data.threat_level || 'Low'}} · Status: {{data.status || 'Active'}}</div>
                        <p class="text-slate-300 text-sm leading-relaxed">{{data.notes || 'No additional notes provided.'}}</p>
                    </div>
                </div>
            </div>

            <!-- Interactions -->
            <div v-if="activeTab === 'interactions'" class="glass p-6 border border-slate-800 space-y-3">
                <div v-for="i in data.interactions" class="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div class="flex justify-between items-center text-sm text-slate-400">
                        <span>{{new Date(i.date).toLocaleString()}}</span>
                        <span class="uppercase text-xs font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">{{i.type}}</span>
                    </div>
                    <div class="mt-2 text-slate-200 font-medium">{{i.conclusion || 'No summary provided.'}}</div>
                    <p class="text-slate-400 text-sm mt-1 whitespace-pre-wrap">{{i.transcript || 'No transcript available.'}}</p>
                </div>
                <div v-if="!data.interactions?.length" class="text-slate-500 text-sm text-center">No interactions logged.</div>
            </div>

            <!-- Intel -->
            <div v-if="activeTab === 'intel'" class="glass p-6 border border-slate-800 space-y-3">
                <div v-for="intel in data.intel" class="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div class="flex justify-between items-center text-sm text-slate-400">
                        <span class="uppercase text-xs font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">{{intel.category}}</span>
                        <span class="text-xs text-slate-500">{{intel.label}}</span>
                    </div>
                    <div class="mt-2 text-slate-200 font-medium">{{intel.value}}</div>
                    <p class="text-slate-400 text-sm mt-1 whitespace-pre-wrap">{{intel.analysis || 'No analysis provided.'}}</p>
                </div>
                <div v-if="!data.intel?.length" class="text-slate-500 text-sm text-center">No intel collected.</div>
            </div>

            <!-- Files -->
            <div v-if="activeTab === 'files'" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div v-for="m in data.media" class="glass border border-slate-800 overflow-hidden group relative">
                    <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-48 object-cover" onerror="this.src='https://placehold.co/400?text=IMG'">
                    <div v-else class="w-full h-48 flex items-center justify-center text-slate-500 bg-slate-900"><i class="fa-solid fa-file text-3xl"></i></div>
                    <div class="p-3 text-sm text-slate-300">{{m.description}}</div>
                    <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0"></a>
                </div>
                <div v-if="!data.media?.length" class="col-span-full text-center text-slate-500 text-sm">No files available.</div>
            </div>

            <!-- Map -->
            <div v-if="activeTab === 'map'" class="glass p-4 border border-slate-800">
                <div id="sharedMap" class="w-full h-96 rounded-lg overflow-hidden"></div>
            </div>

            <!-- Network -->
            <div v-if="activeTab === 'network'" class="glass p-4 border border-slate-800 space-y-4">
                <h3 class="text-lg font-bold text-white">Family Connections</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div v-for="r in data.relationships" v-if="isFamily(r)" class="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border border-slate-700">
                                <img :src="resolveImg(r.target_avatar)" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <div class="text-white font-semibold">{{r.target_name}}</div>
                                <div class="text-xs text-blue-400">{{r.relationship_type}} &rarr; {{r.role_b || 'Associate'}}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const { createApp, ref, watch, onMounted, nextTick } = Vue;

        const token = '${token}';

        createApp({
            setup() {
                const loading = ref(true);
                const error = ref(null);
                const data = ref({});
                const timer = ref(0);
                const activeTab = ref('overview');
                let mapInstance = null;

                const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;

                const formatTime = (s) => {
                    const m = Math.floor(s / 60);
                    const sec = s % 60;
                    return m + 'm ' + sec + 's';
                };

                const isFamily = (rel) => {
                    const role = rel.role_b || rel.relationship_type || '';
                    return /father|mother|son|daughter|child|sibling|brother|sister|husband|wife|spouse|uncle|aunt|niece|nephew|grand/i.test(role);
                };

                const initMap = () => {
                    if(!document.getElementById('sharedMap')) return;
                    if(mapInstance) { mapInstance.remove(); mapInstance = null; }

                    const map = L.map('sharedMap', { attributionControl: false, zoomControl: false }).setView([20, 0], 2);
                    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
                    L.control.zoom({ position: 'bottomright' }).addTo(map);

                    const bounds = [];
                    data.value.locations.forEach(loc => {
                        if(loc.lat) {
                            const latlng = [loc.lat, loc.lng];
                            bounds.push(latlng);

                            const avatarUrl = resolveImg(data.value.avatar_path) || 'https://ui-avatars.com/api/?background=random&name=' + data.value.full_name;
                             const iconHtml = `<div class="avatar-marker w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden bg-slate-800">
                                <img src="${avatarUrl}">
                            </div>`;
                            const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });

                            L.marker(latlng, { icon }).addTo(map)
                                .bindPopup(`<b>${loc.name}</b><br>${loc.type}`);
                        }
                    });

                    setTimeout(() => map.invalidateSize(), 200); // Fix rendering issues
                    if(bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
                    mapInstance = map;
                };

                const flyTo = (loc) => {
                    if(mapInstance && loc.lat) mapInstance.flyTo([loc.lat, loc.lng], 16);
                };

                watch(activeTab, (val) => {
                    if(val === 'map') nextTick(initMap);
                });

                onMounted(async () => {
                    try {
                        const res = await fetch('/api/share/' + token);
                        const json = await res.json();
                        if(json.error) throw new Error(json.error);
                        data.value = json;
                        timer.value = json.meta?.remaining_seconds || 0;
                        loading.value = false;
                        setInterval(() => { if(timer.value > 0) timer.value--; }, 1000);
                    } catch(e) {
                        error.value = e.message;
                        loading.value = false;
                    }
                });
                return { loading, error, data, timer, activeTab, resolveImg, formatTime, flyTo, isFamily };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
