// --- Frontend: Shared Link View (Light Theme) ---
export function serveSharedHtml(token) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SECURE DOSSIER</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #f8fafc; color: #1e293b; }
        .glass { background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .avatar-marker img { border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    </style>
</head>
<body class="min-h-screen p-4 md:p-8">
    <div id="app" class="max-w-4xl mx-auto space-y-6">
        
        <div v-if="loading" class="flex flex-col items-center justify-center min-h-[50vh]">
            <i class="fa-solid fa-circle-notch fa-spin text-3xl text-blue-600"></i>
            <p class="mt-4 text-xs font-bold uppercase tracking-widest text-slate-500">Authenticating Access...</p>
        </div>

        <div v-else-if="error" class="flex items-center justify-center min-h-[50vh]">
            <div class="glass p-6 text-center border-l-4 border-red-500 bg-red-50">
                <h1 class="text-xl font-bold text-red-600 mb-2">Access Denied</h1>
                <p class="text-sm text-red-800">{{error}}</p>
            </div>
        </div>

        <div v-else class="space-y-6 animate-fade-in">
            <!-- Header -->
            <div class="glass p-6 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left">
                 <div class="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-lg bg-slate-200 shrink-0">
                    <img :src="resolveImg(data.avatar_path)" class="w-full h-full object-cover">
                 </div>
                 <div class="flex-1 space-y-2">
                     <h1 class="text-3xl font-bold text-slate-900">{{data.full_name}}</h1>
                     <div class="text-blue-600 font-medium">{{data.occupation || 'Unknown Occupation'}}</div>
                     <div class="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                         <span v-if="data.alias" class="bg-slate-100 px-2 py-1 rounded text-xs text-slate-600 border border-slate-200 font-bold">AKA: {{data.alias}}</span>
                         <span v-if="data.nationality" class="bg-slate-100 px-2 py-1 rounded text-xs text-slate-600 border border-slate-200 font-bold">{{data.nationality}}</span>
                         <span v-if="data.threat_level" class="bg-slate-100 px-2 py-1 rounded text-xs text-slate-600 border border-slate-200 font-bold">{{data.threat_level}}</span>
                     </div>
                 </div>
                 <div class="text-right hidden md:block bg-white border border-slate-200 p-3 rounded-lg">
                     <div class="text-[10px] uppercase text-slate-400 font-bold">Session Expires</div>
                     <div class="font-mono text-xl text-slate-800">{{ formatTime(timer) }}</div>
                 </div>
            </div>

            <!-- Tabs -->
            <div class="flex overflow-x-auto border-b border-slate-200 pb-1">
                <button v-for="t in ['Profile', 'Intel', 'History', 'Network', 'Files', 'Map']" 
                    @click="activeTab = t" 
                    :class="activeTab === t ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent'"
                    class="px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap">
                    {{ t }}
                </button>
            </div>

            <!-- Content -->
            <div class="min-h-[300px]">
                
                <!-- Profile -->
                <div v-if="activeTab === 'Profile'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="glass p-5 space-y-4">
                        <h3 class="text-xs font-bold uppercase text-slate-400 border-b border-slate-100 pb-2">Vitals</h3>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div v-for="k in ['dob','age','height','weight','blood_type']" :key="k">
                                <div class="text-[10px] text-slate-400 uppercase">{{k.replace('_',' ')}}</div>
                                <div class="text-slate-800 font-medium">{{data[k] || '-'}}</div>
                            </div>
                        </div>
                    </div>
                    <div class="glass p-5 space-y-4">
                        <h3 class="text-xs font-bold uppercase text-slate-400 border-b border-slate-100 pb-2">Notes</h3>
                        <div class="space-y-3 text-sm">
                             <div class="text-slate-600 whitespace-pre-wrap">{{data.modus_operandi || 'No visible notes.'}}</div>
                        </div>
                    </div>
                </div>

                <!-- Intel -->
                <div v-if="activeTab === 'Intel'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     <div v-for="item in data.intel" class="glass p-3 border-l-2 border-blue-400">
                         <div class="text-[10px] uppercase text-slate-400 font-bold mb-1">{{item.category}}</div>
                         <div class="text-xs text-blue-600 uppercase mb-1 font-bold">{{item.label}}</div>
                         <div class="text-sm text-slate-800">{{item.value}}</div>
                     </div>
                </div>

                <!-- History -->
                <div v-if="activeTab === 'History'" class="space-y-4">
                    <div v-for="ix in data.interactions" class="glass p-4">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-sm font-bold text-slate-800">{{ix.type}}</span>
                            <span class="text-xs text-slate-400 font-mono">{{new Date(ix.date).toLocaleDateString()}}</span>
                        </div>
                        <p class="text-sm text-slate-600 whitespace-pre-wrap">{{ix.transcript || ix.conclusion}}</p>
                    </div>
                </div>

                <!-- Network -->
                <div v-if="activeTab === 'Network'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div v-for="rel in data.relationships" class="glass p-3 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                            <img v-if="rel.target_avatar" :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center text-slate-400 text-xs font-bold">{{rel.target_name.charAt(0)}}</div>
                        </div>
                        <div>
                            <div class="text-sm font-bold text-slate-800">{{rel.target_name}}</div>
                            <div class="text-xs text-blue-600">{{rel.relationship_type}}</div>
                        </div>
                    </div>
                </div>

                <!-- Files -->
                <div v-if="activeTab === 'Files'" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                     <div v-for="m in data.media" class="glass aspect-square relative group overflow-hidden rounded-lg hover:shadow-lg transition-all">
                        <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/400?text=IMG'">
                        <div v-else class="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300">
                            <i class="fa-solid fa-file text-2xl mb-1"></i>
                        </div>
                        <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0"></a>
                        <div class="absolute bottom-0 inset-x-0 bg-white/90 p-2 text-[10px] truncate text-slate-600 border-t border-slate-100">{{m.description}}</div>
                    </div>
                </div>

                <!-- Map -->
                <div v-show="activeTab === 'Map'" class="h-[500px] flex flex-col md:flex-row gap-4">
                    <div class="flex-1 bg-slate-100 rounded-xl overflow-hidden relative min-h-[300px] border border-slate-200 shadow-inner">
                        <div id="sharedMap" class="w-full h-full z-0"></div>
                    </div>
                    <div class="w-full md:w-64 space-y-2 overflow-y-auto max-h-[300px] md:max-h-full">
                        <div v-for="loc in data.locations" :key="loc.id" @click="flyTo(loc)" class="glass p-3 cursor-pointer hover:border-blue-400 transition-all border-slate-200">
                            <div class="font-bold text-slate-800 text-sm">{{loc.name}}</div>
                            <span class="text-[10px] uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 font-bold">{{loc.type}}</span>
                            <div class="text-xs text-slate-500 mt-1 truncate">{{loc.address}}</div>
                        </div>
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
                const activeTab = ref('Profile');
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
                    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
                    L.control.zoom({ position: 'bottomright' }).addTo(map);

                    const bounds = [];
                    data.value.locations.forEach(loc => {
                        if(loc.lat) {
                            const latlng = [loc.lat, loc.lng];
                            bounds.push(latlng);
                            const avatarUrl = resolveImg(data.value.avatar_path) || 'https://ui-avatars.com/api/?background=random&name=' + data.value.full_name;
                             const iconHtml = \`<div class="avatar-marker w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden bg-white"><img src="\${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>\`;
                            const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
                            L.marker(latlng, { icon }).addTo(map).bindPopup(\`<b>\${loc.name}</b><br>\${loc.type}\`);
                        }
                    });
                    
                    setTimeout(() => map.invalidateSize(), 200);
                    if(bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
                    mapInstance = map;
                };

                const flyTo = (loc) => { if(mapInstance && loc.lat) mapInstance.flyTo([loc.lat, loc.lng], 16); };

                watch(activeTab, (val) => { if(val === 'Map') nextTick(initMap); });

                onMounted(async () => {
                    try {
                        const res = await fetch('/api/share/' + token);
                        const json = await res.json();
                        if(json.error) throw new Error(json.error);
                        data.value = json;
                        timer.value = json.meta?.remaining_seconds || 0;
                        loading.value = false;
                        setInterval(() => { if(timer.value > 0) timer.value--; }, 1000);
                    } catch(e) { error.value = e.message; loading.value = false; }
                });
                return { loading, error, data, timer, activeTab, resolveImg, formatTime, flyTo };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
