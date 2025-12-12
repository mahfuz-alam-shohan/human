// --- Frontend: Shared Link View ---
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
                         <span v-if="data.nationality" class="bg-slate-800 px-2 py-1 rounded text-xs text-slate-300 border border-slate-700">{{data.nationality}}</span>
                         <span v-if="data.threat_level" class="bg-slate-800 px-2 py-1 rounded text-xs text-slate-300 border border-slate-700">{{data.threat_level}}</span>
                     </div>
                 </div>
                 <div class="text-right hidden md:block">
                     <div class="text-[10px] uppercase text-slate-500 font-bold">Session Exp</div>
                     <div class="font-mono text-xl text-slate-300">{{ formatTime(timer) }}</div>
                 </div>
            </div>

            <!-- Tabs -->
            <div class="flex overflow-x-auto border-b border-slate-800 pb-1 no-scrollbar">
                <button v-for="t in ['Profile', 'Intel', 'History', 'Network', 'Files', 'Map']" 
                    @click="activeTab = t.toLowerCase()" 
                    :class="['tab-btn', activeTab === t.toLowerCase() ? 'active' : '']">
                    {{ t }}
                </button>
            </div>

            <!-- Content -->
            <div class="min-h-[300px]">
                
                <!-- Profile -->
                <div v-if="activeTab === 'profile'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="glass p-5 space-y-4">
                        <h3 class="text-xs font-bold uppercase text-slate-500 border-b border-slate-700 pb-2">Vitals</h3>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div v-if="data.dob">
                                <div class="text-[10px] text-slate-500 uppercase">DOB</div>
                                <div class="text-slate-200">{{data.dob}}</div>
                            </div>
                            <div v-if="data.age">
                                <div class="text-[10px] text-slate-500 uppercase">Age</div>
                                <div class="text-slate-200">{{data.age}}</div>
                            </div>
                            <div v-if="data.height">
                                <div class="text-[10px] text-slate-500 uppercase">Height</div>
                                <div class="text-slate-200">{{data.height}}</div>
                            </div>
                            <div v-if="data.weight">
                                <div class="text-[10px] text-slate-500 uppercase">Weight</div>
                                <div class="text-slate-200">{{data.weight}}</div>
                            </div>
                             <div v-if="data.blood_type">
                                <div class="text-[10px] text-slate-500 uppercase">Blood</div>
                                <div class="text-slate-200">{{data.blood_type}}</div>
                            </div>
                        </div>
                    </div>
                    <div class="glass p-5 space-y-4">
                        <h3 class="text-xs font-bold uppercase text-slate-500 border-b border-slate-700 pb-2">Contact</h3>
                        <div class="space-y-3 text-sm">
                             <div v-if="data.location">
                                <div class="text-[10px] text-slate-500 uppercase">Location</div>
                                <div class="text-slate-200">{{data.location}}</div>
                            </div>
                            <div v-if="data.contact">
                                <div class="text-[10px] text-slate-500 uppercase">Contact</div>
                                <div class="text-slate-200 break-all">{{data.contact}}</div>
                            </div>
                             <div v-if="data.social_links">
                                <div class="text-[10px] text-slate-500 uppercase">Social</div>
                                <div class="text-blue-400 break-all">{{data.social_links}}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Intel -->
                <div v-if="activeTab === 'intel'" class="space-y-4">
                    <div v-if="data.modus_operandi" class="glass p-5">
                         <h3 class="text-xs font-bold uppercase text-slate-500 mb-2">Routine & Habits</h3>
                         <p class="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{{data.modus_operandi}}</p>
                    </div>
                    <div v-if="data.weakness" class="glass p-5 border-l-4 border-red-500/50">
                         <h3 class="text-xs font-bold uppercase text-red-400 mb-2">Sensitivities</h3>
                         <p class="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{{data.weakness}}</p>
                    </div>
                     <div v-if="data.intel && data.intel.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         <div v-for="item in data.intel" class="glass p-3">
                             <div class="text-[10px] uppercase text-blue-400 font-bold mb-1">{{item.category}}</div>
                             <div class="text-xs text-slate-500 uppercase mb-1">{{item.label}}</div>
                             <div class="text-sm text-white">{{item.value}}</div>
                         </div>
                    </div>
                </div>

                <!-- History -->
                <div v-if="activeTab === 'history'" class="space-y-4">
                    <div v-if="!data.interactions.length" class="text-center text-slate-500 py-10">No history available.</div>
                    <div v-for="ix in data.interactions" class="glass p-4 border-l-2 border-blue-500">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-sm font-bold text-white">{{ix.type}}</span>
                            <span class="text-xs text-slate-500 font-mono">{{new Date(ix.date).toLocaleDateString()}}</span>
                        </div>
                        <p class="text-sm text-slate-300 whitespace-pre-wrap">{{ix.transcript || ix.conclusion}}</p>
                    </div>
                </div>

                <!-- Network -->
                <div v-if="activeTab === 'network'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div v-if="!data.relationships.length" class="col-span-full text-center text-slate-500 py-10">No connections linked.</div>
                    <div v-for="rel in data.relationships" class="glass p-3 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                            <img v-if="rel.target_avatar" :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center text-slate-500 text-xs">{{rel.target_name.charAt(0)}}</div>
                        </div>
                        <div>
                            <div class="text-sm font-bold text-white">{{rel.target_name}}</div>
                            <div class="text-xs text-blue-400">{{rel.relationship_type}}</div>
                        </div>
                    </div>
                </div>

                <!-- Files -->
                <div v-if="activeTab === 'files'" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                     <div v-if="!data.media.length" class="col-span-full text-center text-slate-500 py-10">No files attached.</div>
                     <div v-for="m in data.media" class="glass aspect-square relative group overflow-hidden rounded-lg">
                        <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/400?text=IMG'">
                        <div v-else class="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-500">
                            <i class="fa-solid fa-file text-2xl mb-1"></i>
                            <span class="text-[10px] uppercase font-bold">{{m.content_type ? m.content_type.split('/')[1] : 'FILE'}}</span>
                        </div>
                        <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0"></a>
                        <div class="absolute bottom-0 inset-x-0 bg-black/80 p-2 text-[10px] truncate text-slate-300">{{m.description}}</div>
                    </div>
                </div>

                <!-- Map -->
                <div v-show="activeTab === 'map'" class="h-[600px] flex flex-col md:flex-row gap-4">
                    <div class="flex-1 bg-slate-900 rounded-xl overflow-hidden relative min-h-[300px] border border-slate-800">
                        <div id="sharedMap" class="w-full h-full z-0"></div>
                    </div>
                    <div class="w-full md:w-64 space-y-2 overflow-y-auto max-h-[300px] md:max-h-full">
                        <div v-for="loc in data.locations" :key="loc.id" @click="flyTo(loc)" class="glass p-3 cursor-pointer hover:border-blue-500/50 transition-all border-slate-700/50">
                            <div class="font-bold text-white text-sm">{{loc.name}}</div>
                            <span class="text-[10px] uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{{loc.type}}</span>
                            <div class="text-xs text-slate-500 mt-1 truncate">{{loc.address}}</div>
                        </div>
                        <div v-if="!data.locations.length" class="text-center text-slate-500 text-sm py-4">No locations available.</div>
                    </div>
                </div>

            </div>
        </div>
    </div>
    <script>
        const { createApp, ref, onMounted, watch, nextTick } = Vue;
        createApp({
            setup() {
                const loading = ref(true);
                const error = ref(null);
                const data = ref(null);
                const timer = ref(0);
                const activeTab = ref('profile');
                const token = window.location.pathname.split('/').pop();
                let mapInstance = null;

                const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
                const formatTime = (s) => {
                    const h = Math.floor(s / 3600);
                    const m = Math.floor((s % 3600) / 60);
                    return \`\${h}h \${m}m\`;
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
                             const iconHtml = \`<div class="avatar-marker w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden bg-slate-800">
                                <img src="\${avatarUrl}">
                            </div>\`;
                            const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
                            
                            L.marker(latlng, { icon }).addTo(map)
                                .bindPopup(\`<b>\${loc.name}</b><br>\${loc.type}\`);
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
                return { loading, error, data, timer, activeTab, resolveImg, formatTime, flyTo };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
