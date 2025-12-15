// --- Frontend: Shared Link View (Kiddy/Playful Theme) ---
export function serveSharedHtml(token) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TOP SECRET // DO NOT OPEN</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <!-- Fun Fonts: Fredoka for headings, Comic Neue for reading -->
    <link href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Fredoka:wght@400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        /* Kiddy Theme Variables */
        :root {
            --bg-color: #FEF3C7; /* Yellow-100 */
            --card-bg: #FFFFFF;
            --border-color: #1e293b; /* Slate-800 */
            --shadow-color: #1e293b;
        }
        
        body { 
            font-family: 'Comic Neue', cursive; 
            background-color: var(--bg-color); 
            color: #374151; 
            /* Polka dot pattern */
            background-image: radial-gradient(#F59E0B 2px, transparent 2px);
            background-size: 24px 24px;
        }

        /* Fun "Sticker" Card Style */
        .fun-card { 
            background: var(--card-bg); 
            border: 3px solid var(--border-color); 
            border-radius: 1.5rem; 
            box-shadow: 6px 6px 0px 0px var(--shadow-color);
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        
        .fun-card:hover {
            transform: translate(-2px, -2px);
            box-shadow: 8px 8px 0px 0px var(--shadow-color);
        }

        /* Headings */
        h1, h2, h3, .font-fun { font-family: 'Fredoka', sans-serif; }

        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 12px; }
        ::-webkit-scrollbar-track { background: #FFF7ED; }
        ::-webkit-scrollbar-thumb { background: #FDBA74; border-radius: 6px; border: 3px solid #FFF7ED; }

        /* Map Marker override */
        .avatar-marker-fun {
            width: 40px; height: 40px;
            background: white;
            border-radius: 50%;
            overflow: hidden;
            border: 3px solid #1e293b;
            box-shadow: 2px 2px 0px #1e293b;
        }
        .avatar-marker-fun img { width: 100%; height: 100%; object-fit: cover; }
        
        /* Tab Button Active State */
        .tab-btn-active {
            background-color: #FCD34D; /* Yellow-300 */
            transform: translateY(2px);
            box-shadow: 2px 2px 0px #1e293b !important;
        }

        /* Unlock Button Style */
        .unlock-btn {
            border: 4px solid black;
            box-shadow: 4px 4px 0px 0px black;
            transition: all 0.1s;
        }
        .unlock-btn:active {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0px 0px black;
        }
    </style>
</head>
<body class="min-h-screen p-4 md:p-8">
    <div id="app" class="max-w-4xl mx-auto space-y-6">
        
        <!-- LOADING STATE -->
        <div v-if="loading" class="flex flex-col items-center justify-center min-h-[50vh] animate-bounce">
            <i class="fa-solid fa-magnifying-glass text-5xl text-blue-500 mb-4"></i>
            <p class="text-xl font-bold font-fun text-slate-700">Hunting for clues...</p>
        </div>

        <!-- NEW: LOCATION LOCKED STATE -->
        <div v-else-if="isLocationLocked" class="fun-card p-8 md:p-12 text-center bg-yellow-50 flex flex-col items-center justify-center min-h-[60vh] border-yellow-600">
            <div class="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center border-4 border-black mb-6 animate-pulse">
                <i class="fa-solid fa-lock text-5xl text-red-500"></i>
            </div>
            <h1 class="text-3xl font-fun font-black text-slate-900 mb-2">Restricted Access</h1>
            <p class="text-lg font-bold text-slate-600 max-w-md mx-auto mb-8">
                This profile requires location verification. Access is blocked until we can confirm your location.
            </p>
            
            <button @click="attemptUnlock" :disabled="locationLoading" class="bg-green-400 hover:bg-green-300 text-black font-black text-xl px-8 py-4 rounded-2xl unlock-btn flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                <i v-if="locationLoading" class="fa-solid fa-circle-notch fa-spin"></i>
                <i v-else class="fa-solid fa-location-crosshairs"></i>
                {{ locationLoading ? 'Verifying...' : 'Share Location & View' }}
            </button>
            
            <div v-if="locationError" class="mt-6 text-red-600 font-bold bg-red-100 px-4 py-2 rounded-lg border-2 border-red-200 inline-block">
                <i class="fa-solid fa-triangle-exclamation mr-1"></i> {{ locationError }}
            </div>
        </div>

        <!-- ERROR STATE -->
        <div v-else-if="error" class="fun-card p-8 text-center bg-red-50 border-red-900">
            <h1 class="text-3xl font-fun text-red-600 mb-2">Uh Oh! 🚫</h1>
            <p class="text-lg font-bold">{{error}}</p>
        </div>

        <!-- MAIN CONTENT (Only shown if unlocked) -->
        <div v-else class="space-y-6">
            <!-- Header Card -->
            <div class="fun-card p-6 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left relative overflow-hidden">
                 <!-- "Top Secret" Stamp decoration -->
                 <div class="absolute -right-4 -top-4 opacity-10 rotate-12 pointer-events-none">
                    <i class="fa-solid fa-stamp text-9xl"></i>
                 </div>

                 <div class="w-36 h-36 rounded-full overflow-hidden border-4 border-slate-800 bg-white shrink-0 shadow-[4px_4px_0px_#000]">
                    <img :src="resolveImg(data.avatar_path)" class="w-full h-full object-cover">
                 </div>
                 
                 <div class="flex-1 space-y-2 relative z-10">
                     <div class="inline-block bg-rose-400 text-white text-xs font-bold px-2 py-1 rounded-lg border-2 border-black mb-1 font-fun transform -rotate-2">CONFIDENTIAL</div>
                     <h1 class="text-4xl font-black text-slate-800 font-fun tracking-tight">{{data.full_name}}</h1>
                     <div class="text-xl text-blue-600 font-bold font-fun">{{data.occupation || 'Mystery Person'}}</div>
                     
                     <div class="flex flex-wrap justify-center md:justify-start gap-2 mt-3">
                         <span v-if="data.alias" class="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-xl border-2 border-black text-sm font-bold shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">AKA: {{data.alias}}</span>
                         <span v-if="data.nationality" class="bg-green-200 text-green-800 px-3 py-1 rounded-xl border-2 border-black text-sm font-bold shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">{{data.nationality}}</span>
                         <span v-if="data.threat_level" class="bg-orange-200 text-orange-800 px-3 py-1 rounded-xl border-2 border-black text-sm font-bold shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">Level: {{data.threat_level}}</span>
                     </div>
                 </div>
                 
                 <div class="hidden md:block bg-slate-100 border-2 border-slate-800 p-3 rounded-2xl rotate-3">
                     <div class="text-[10px] uppercase text-slate-500 font-black font-fun">Poof In</div>
                     <div class="font-mono text-2xl text-slate-900 font-bold">{{ formatTime(timer) }}</div>
                 </div>
            </div>

            <!-- Fun Tabs -->
            <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                <button v-for="t in ['Profile', 'Intel', 'Capabilities', 'History', 'Network', 'Files', 'Map']" 
                    @click="activeTab = t" 
                    :class="['px-5 py-2.5 rounded-xl border-2 border-black font-bold font-fun text-sm transition-all shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[1px_1px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none whitespace-nowrap', activeTab === t ? 'bg-blue-400 text-white' : 'bg-white text-slate-700 hover:bg-slate-50']">
                    <i class="fa-solid mr-1" :class="getIcon(t)"></i> {{ t }}
                </button>
            </div>

            <!-- Content Area -->
            <div class="min-h-[300px]">
                
                <!-- Profile -->
                <div v-if="activeTab === 'Profile'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="fun-card p-5 space-y-4 bg-sky-50">
                        <h3 class="text-xl font-bold font-fun text-sky-600 border-b-2 border-sky-200 pb-2"><i class="fa-solid fa-heart-pulse mr-2"></i>Vitals</h3>
                        <div class="grid grid-cols-2 gap-4 text-base">
                            <div v-for="k in ['dob','age','height','weight','blood_type']" :key="k">
                                <div class="text-xs font-bold text-sky-400 uppercase font-fun">{{k.replace('_',' ')}}</div>
                                <div class="text-slate-800 font-bold">{{data[k] || '???'}}</div>
                            </div>
                        </div>
                    </div>
                    <div class="fun-card p-5 space-y-4 bg-purple-50">
                        <h3 class="text-xl font-bold font-fun text-purple-600 border-b-2 border-purple-200 pb-2"><i class="fa-solid fa-sticky-note mr-2"></i>Secret Notes</h3>
                        <div class="space-y-3 text-base">
                             <div class="text-slate-700 whitespace-pre-wrap font-medium">{{data.modus_operandi || 'No secret notes found!'}}</div>
                        </div>
                    </div>
                </div>

                <!-- Intel -->
                <div v-if="activeTab === 'Intel'" class="space-y-6">
                     <div v-for="(items, category) in groupedIntel" :key="category" class="space-y-2">
                         <h4 class="text-sm font-black uppercase text-slate-400 border-b-2 border-slate-200 pb-1 ml-1">{{category}}</h4>
                         
                         <!-- SOCIAL GRID -->
                         <div v-if="category === 'Social Media'" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                             <a v-for="item in items" :key="item.id" :href="item.value" target="_blank" class="fun-card p-3 flex flex-col items-center justify-center gap-2 group hover:scale-105 transition-transform" :style="{borderColor: getSocialInfo(item.value).color}">
                                <i :class="getSocialInfo(item.value).icon" class="text-3xl" :style="{color: getSocialInfo(item.value).color}"></i>
                                <div class="font-bold text-xs text-slate-800">{{item.label}}</div>
                            </a>
                         </div>

                         <!-- STANDARD GRID -->
                         <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                             <div v-for="item in items" :key="item.id" class="fun-card p-4 bg-white relative overflow-hidden">
                                 <div class="absolute top-0 right-0 w-16 h-16 bg-yellow-100 rounded-bl-full -mr-8 -mt-8 z-0"></div>
                                 <div class="relative z-10">
                                     <div class="text-xs font-black uppercase text-slate-400 mb-1 font-fun tracking-wider">{{item.label}}</div>
                                     <div class="text-base text-slate-800 font-medium">{{item.value}}</div>
                                 </div>
                             </div>
                         </div>
                     </div>
                </div>

                <!-- Capabilities -->
                <div v-show="activeTab === 'Capabilities'" class="fun-card p-4 flex items-center justify-center bg-white relative min-h-[400px]">
                    <div class="w-full max-w-md aspect-square relative">
                        <canvas id="skillsChart"></canvas>
                    </div>
                </div>

                <!-- History -->
                <div v-if="activeTab === 'History'" class="space-y-4">
                    <div v-for="ix in data.interactions" class="fun-card p-4 bg-white border-l-[10px] border-l-green-400">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-lg font-bold font-fun text-slate-800">{{ix.type}}</span>
                            <span class="text-xs font-bold bg-slate-100 px-2 py-1 rounded border border-slate-300">{{new Date(ix.date).toLocaleDateString()}}</span>
                        </div>
                        <p class="text-slate-600">{{ix.transcript || ix.conclusion}}</p>
                    </div>
                </div>

                <!-- Network -->
                <div v-if="activeTab === 'Network'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div v-for="rel in data.relationships" class="fun-card p-3 flex items-center gap-3 hover:bg-slate-50">
                        <div class="w-12 h-12 rounded-full bg-white overflow-hidden shrink-0 border-2 border-black shadow-sm">
                            <img v-if="rel.target_avatar" :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center text-slate-300 font-black text-lg bg-slate-100">{{rel.target_name.charAt(0)}}</div>
                        </div>
                        <div>
                            <div class="text-base font-bold text-slate-800 font-fun">{{rel.target_name}}</div>
                            <div class="text-xs font-bold text-white bg-blue-400 px-2 py-0.5 rounded-full inline-block border border-black shadow-[1px_1px_0px_#000]">{{rel.relationship_type}}</div>
                        </div>
                    </div>
                </div>

                <!-- Files -->
                <div v-if="activeTab === 'Files'" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                     <div v-for="m in data.media" class="fun-card aspect-square relative group overflow-hidden bg-white p-2">
                        <div class="w-full h-full rounded-xl overflow-hidden border border-slate-200 relative">
                            <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transform transition-transform group-hover:scale-110" onerror="this.src='https://placehold.co/400?text=IMG'">
                            <div v-else class="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400">
                                <i class="fa-solid fa-file text-4xl mb-2"></i>
                                <span class="font-bold font-fun text-xs">FILE</span>
                            </div>
                        </div>
                        <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0 z-20"></a>
                        <div class="absolute bottom-2 left-2 right-2 bg-black/80 text-white text-[10px] font-bold p-1 rounded text-center backdrop-blur-md truncate pointer-events-none z-10">{{m.description}}</div>
                    </div>
                </div>

                <!-- Map -->
                <div v-show="activeTab === 'Map'" class="h-[300px] md:h-[500px] flex flex-col md:flex-row gap-4">
                    <div class="flex-1 bg-white rounded-3xl overflow-hidden relative min-h-[300px] border-4 border-slate-800 shadow-[6px_6px_0px_#000]">
                        <div id="sharedMap" class="w-full h-full z-0"></div>
                    </div>
                    <div class="w-full md:w-64 space-y-2 overflow-y-auto max-h-[300px] md:max-h-full">
                        <div v-for="loc in data.locations" :key="loc.id" @click="flyTo(loc)" class="fun-card p-3 cursor-pointer bg-white hover:bg-yellow-50">
                            <div class="font-black text-slate-800 text-sm font-fun">{{loc.name}}</div>
                            <span class="text-[10px] uppercase bg-green-200 text-green-800 border border-green-400 px-2 py-0.5 rounded-full font-bold">{{loc.type}}</span>
                            <div class="text-xs text-slate-500 mt-1 truncate">{{loc.address}}</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
    <script>
        const { createApp, ref, onMounted, watch, nextTick, computed } = Vue;
        createApp({
            setup() {
                const loading = ref(true);
                const error = ref(null);
                const data = ref(null);
                const timer = ref(0);
                const activeTab = ref('Profile');
                const token = window.location.pathname.split('/').pop();
                
                // NEW STATES FOR LOCATION
                const isLocationLocked = ref(false);
                const locationLoading = ref(false);
                const locationError = ref(null);

                let mapInstance = null;
                let chartInstance = null;

                // FIXED RESOLVE IMG
                const resolveImg = (p) => {
                    if (!p) return null;
                    if (p.startsWith('http') || p.startsWith('data:') || p.startsWith('/api/media/')) return p;
                    return '/api/media/' + p;
                };

                const formatTime = (s) => {
                    const h = Math.floor(s / 3600);
                    const m = Math.floor((s % 3600) / 60);
                    return \`\${h}h \${m}m\`;
                };
                
                const getIcon = (t) => {
                    return { 'Profile':'fa-id-card', 'Intel':'fa-lightbulb', 'Capabilities': 'fa-chart-radar', 'History':'fa-clock', 'Network':'fa-users', 'Files':'fa-folder-open', 'Map':'fa-map' }[t];
                };

                const groupedIntel = computed(() => data.value?.intel ? data.value.intel.reduce((a, i) => (a[i.category] = a[i.category] || []).push(i) && a, {}) : {});

                // Social Media Detection
                const socialMap = [
                    { regex: /facebook\.com/, name: 'Facebook', icon: 'fa-brands fa-facebook', color: '#1877F2' },
                    { regex: /twitter\.com|x\.com/, name: 'X / Twitter', icon: 'fa-brands fa-x-twitter', color: '#000000' },
                    { regex: /instagram\.com/, name: 'Instagram', icon: 'fa-brands fa-instagram', color: '#E1306C' },
                    { regex: /linkedin\.com/, name: 'LinkedIn', icon: 'fa-brands fa-linkedin', color: '#0077B5' },
                    { regex: /github\.com/, name: 'GitHub', icon: 'fa-brands fa-github', color: '#333' },
                    { regex: /youtube\.com/, name: 'YouTube', icon: 'fa-brands fa-youtube', color: '#FF0000' },
                    { regex: /t\.me/, name: 'Telegram', icon: 'fa-brands fa-telegram', color: '#0088cc' },
                    { regex: /wa\.me/, name: 'WhatsApp', icon: 'fa-brands fa-whatsapp', color: '#25D366' },
                    { regex: /tiktok\.com/, name: 'TikTok', icon: 'fa-brands fa-tiktok', color: '#000000' },
                    { regex: /reddit\.com/, name: 'Reddit', icon: 'fa-brands fa-reddit', color: '#FF4500' },
                ];

                const getSocialInfo = (url) => {
                    return socialMap.find(s => s.regex.test(url)) || { name: 'Website', icon: 'fa-solid fa-globe', color: '#6B7280' };
                };

                const initMap = () => {
                    if(!document.getElementById('sharedMap')) return;
                    if(mapInstance) { mapInstance.remove(); mapInstance = null; }
                    
                    const map = L.map('sharedMap', { attributionControl: false, zoomControl: false }).setView([20, 0], 2);
                    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
                    L.control.zoom({ position: 'bottomright' }).addTo(map);

                    const bounds = [];
                    data.value.locations.forEach(loc => {
                        if(loc.lat) {
                            const latlng = [loc.lat, loc.lng];
                            bounds.push(latlng);
                            const avatarUrl = resolveImg(data.value.avatar_path) || 'https://ui-avatars.com/api/?background=random&name=' + data.value.full_name;
                             const iconHtml = \`<div class="avatar-marker-fun"><img src="\${avatarUrl}"></div>\`;
                            const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
                            L.marker(latlng, { icon }).addTo(map).bindPopup(\`<b style="font-family:'Fredoka'">\${loc.name}</b><br>\${loc.type}\`);
                        }
                    });
                    
                    setTimeout(() => map.invalidateSize(), 200);
                    if(bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
                    mapInstance = map;
                };

                const initChart = () => {
                    const ctx = document.getElementById('skillsChart');
                    if(!ctx || !data.value.skills) return;
                    if(chartInstance) chartInstance.destroy();

                    const labels = ['Leadership', 'Technical', 'Combat', 'Social Eng', 'Observation', 'Stealth'];
                    const scores = labels.map(l => data.value.skills.find(s => s.skill_name === l)?.score || 50);

                    chartInstance = new Chart(ctx, {
                        type: 'radar',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Capabilities',
                                data: scores,
                                fill: true,
                                backgroundColor: 'rgba(59, 130, 246, 0.2)', // Blue-500
                                borderColor: 'rgb(59, 130, 246)',
                                pointBackgroundColor: 'rgb(59, 130, 246)',
                                pointBorderColor: '#fff'
                            }]
                        },
                        options: {
                            elements: { line: { borderWidth: 3 } },
                            scales: { r: { angleLines: { display: true }, suggestedMin: 0, suggestedMax: 100, pointLabels: { font: { family: 'Fredoka', size: 12 } } } },
                            plugins: { legend: { display: false } }
                        }
                    });
                }

                const flyTo = (loc) => { if(mapInstance && loc.lat) mapInstance.flyTo([loc.lat, loc.lng], 16); };

                watch(activeTab, (val) => { 
                    if(val === 'Map') nextTick(initMap); 
                    if(val === 'Capabilities') nextTick(initChart);
                });

                // --- MODIFIED LOAD FUNCTION ---
                const loadData = async (params = '') => {
                    loading.value = true;
                    error.value = null;
                    try {
                        const res = await fetch('/api/share/' + token + params);
                        
                        // NEW: CHECK FOR 428 PRECONDITION REQUIRED
                        if (res.status === 428) {
                            isLocationLocked.value = true;
                            loading.value = false;
                            return; // STOP HERE, wait for user unlock
                        }

                        const json = await res.json();
                        if(json.error) throw new Error(json.error);
                        
                        // IF SUCCESSFUL, UNLOCK
                        isLocationLocked.value = false;
                        data.value = json;
                        timer.value = json.meta?.remaining_seconds || 0;
                        loading.value = false;
                        
                        setInterval(() => { if(timer.value > 0) timer.value--; }, 1000);

                        if(activeTab.value === 'Map') nextTick(initMap);
                        if(activeTab.value === 'Capabilities') nextTick(initChart);

                    } catch(e) { 
                        error.value = e.message; 
                        loading.value = false; 
                    }
                };

                // --- NEW UNLOCK FUNCTION ---
                const attemptUnlock = () => {
                    locationError.value = null;
                    locationLoading.value = true;

                    if (!navigator.geolocation) {
                        locationError.value = "Geolocation is not supported by your browser.";
                        locationLoading.value = false;
                        return;
                    }

                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const { latitude, longitude } = position.coords;
                            // Re-fetch with location data
                            loadData(\`?lat=\${latitude}&lng=\${longitude}\`);
                            locationLoading.value = false;
                        },
                        (err) => {
                            console.error(err);
                            if(err.code === 1) locationError.value = "Access denied. You must allow location to view this file.";
                            else if(err.code === 2) locationError.value = "Location unavailable. Check your device settings.";
                            else locationError.value = "Timeout. Please try again.";
                            locationLoading.value = false;
                        },
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    );
                };

                onMounted(() => {
                    loadData();
                });
                
                return { 
                    loading, error, data, timer, activeTab, 
                    isLocationLocked, locationLoading, locationError, attemptUnlock, // Expose new state/fn
                    resolveImg, formatTime, flyTo, getIcon, groupedIntel, getSocialInfo 
                };
            }
        }).mount('#app');
    </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
