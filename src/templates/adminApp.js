// --- Frontend: Main Admin App (Kiddy/Playful Theme + Full Features) ---

export function serveAdminHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-[100dvh]">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>PEOPLE OS // PLAYGROUND</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <!-- Fun Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  
  <style>
    /* Kiddy Theme Config */
    :root { 
        --bg-color: #FEF9C3; /* Yellow-100 */
        --card-bg: #FFFFFF;
        --border-color: #000000;
        --shadow-color: #000000;
        --primary: #8B5CF6; /* Violet */
    }
    
    body { 
        font-family: 'Comic Neue', cursive; 
        background-color: var(--bg-color); 
        color: #1f2937;
        /* Dot pattern background */
        background-image: radial-gradient(#F59E0B 2px, transparent 2px);
        background-size: 30px 30px;
        font-weight: 700;
    }

    h1, h2, h3, h4, .font-heading { font-family: 'Fredoka', sans-serif; }
    
    /* "Sticker" Card Style replacing Glass */
    .fun-card { 
        background: white; 
        border: 3px solid black; 
        box-shadow: 5px 5px 0px 0px rgba(0,0,0,1);
        border-radius: 1rem; 
        transition: all 0.1s ease-in-out;
    }
    
    /* Input Fields - Chunky */
    .fun-input { 
        background: #fff; 
        border: 3px solid black; 
        color: #000; 
        border-radius: 0.75rem; 
        font-family: 'Comic Neue', cursive;
        font-weight: 700;
        box-shadow: 3px 3px 0px 0px rgba(0,0,0,0.1);
    }
    .fun-input:focus { 
        outline: none; 
        box-shadow: 3px 3px 0px 0px #8B5CF6; 
        border-color: #8B5CF6;
    }
    .fun-input::placeholder { color: #9CA3AF; font-weight: 400; }

    /* Buttons - Clicky */
    .fun-btn {
        border: 3px solid black;
        box-shadow: 3px 3px 0px 0px black;
        transition: all 0.1s;
        font-family: 'Fredoka', sans-serif;
    }
    .fun-btn:active {
        transform: translate(2px, 2px);
        box-shadow: 1px 1px 0px 0px black;
    }
    .fun-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 12px; }
    ::-webkit-scrollbar-thumb { background: #FCD34D; border: 3px solid black; border-radius: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }

    .safe-area-pb { padding-bottom: env(safe-area-inset-bottom); }
    .animate-bounce-in { animation: bounceIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    @keyframes bounceIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    
    /* Marker - FIXED */
    .avatar-marker-fun { 
        width: 100%; height: 100%; 
        border-radius: 50%; 
        background: white;
        border: 3px solid white; 
        box-shadow: 0 0 0 3px black; /* Faux border that follows radius */
        overflow: hidden; /* Clips image */
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .avatar-marker-fun img {
        width: 100%; 
        height: 100%;
        object-fit: cover;
        display: block;
    }
  </style>
</head>
<body class="h-[100dvh] overflow-hidden text-slate-900">
  <div id="app" class="h-full flex flex-col">

    <!-- TOAST NOTIFICATIONS -->
    <div class="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
        <div v-for="t in toasts" :key="t.id" class="pointer-events-auto bg-white border-4 border-black shadow-[4px_4px_0px_0px_#000] rounded-xl p-4 flex items-center gap-3 animate-bounce-in min-w-[300px]">
            <i :class="t.icon" class="text-2xl" :style="{color: t.color}"></i>
            <div class="flex-1">
                <div class="text-lg font-heading font-bold text-black">{{t.title}}</div>
                <div class="text-sm font-bold text-gray-500">{{t.msg}}</div>
            </div>
        </div>
    </div>

    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 relative bg-yellow-100">
        <!-- Decoration blobbies -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div class="absolute top-10 left-10 text-9xl text-pink-300 opacity-50 rotate-12"><i class="fa-solid fa-cloud"></i></div>
            <div class="absolute bottom-10 right-10 text-9xl text-blue-300 opacity-50 -rotate-12"><i class="fa-solid fa-star"></i></div>
        </div>

        <div class="w-full max-w-sm fun-card p-8 relative z-10 bg-white">
            <div class="text-center mb-8">
                <div class="w-20 h-20 bg-yellow-300 border-4 border-black rounded-full flex items-center justify-center mx-auto mb-4 text-black text-3xl shadow-[4px_4px_0px_#000]">
                    <i class="fa-solid fa-face-smile-wink"></i>
                </div>
                <h1 class="text-4xl font-heading font-black text-black tracking-tight mb-1">People OS</h1>
                <p class="text-slate-500 text-lg font-bold">Top Secret Stuff! 🤫</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Who are you?" class="fun-input w-full p-4 text-lg" required>
                <input v-model="auth.password" type="password" placeholder="Secret Password" class="fun-input w-full p-4 text-lg" required>
                <button type="submit" :disabled="loading" class="w-full bg-violet-500 hover:bg-violet-400 text-white font-heading font-bold py-4 rounded-xl text-lg fun-btn flex items-center justify-center">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    {{ loading ? 'Checking...' : 'Let Me In!' }}
                </button>
            </form>
        </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
        
        <!-- SIDEBAR -->
        <nav class="hidden md:flex flex-col w-24 bg-white border-r-4 border-black items-center py-6 z-20 shrink-0">
            <div class="mb-8 text-yellow-500 text-4xl drop-shadow-[2px_2px_0px_#000]"><i class="fa-solid fa-cube"></i></div>
            <div class="flex-1 space-y-4 w-full px-3">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'bg-pink-300 text-black shadow-[3px_3px_0px_#000]' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'" class="w-full aspect-square rounded-2xl border-4 border-black flex flex-col items-center justify-center gap-1 transition-all group active:translate-y-1 active:shadow-none" :title="t.label">
                    <i :class="t.icon" class="text-2xl group-hover:scale-110 transition-transform"></i>
                    <span class="text-[10px] font-heading font-bold uppercase tracking-wider">{{t.label}}</span>
                </button>
            </div>
            <button @click="openModal('cmd')" class="text-gray-400 hover:text-blue-500 p-4 transition-colors text-xl"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button @click="openSettings" class="text-gray-400 hover:text-black p-4 transition-colors text-xl"><i class="fa-solid fa-gear"></i></button>
            <button @click="handleLogout" class="text-gray-400 hover:text-red-500 p-4 transition-colors text-xl"><i class="fa-solid fa-power-off"></i></button>
        </nav>

        <!-- MOBILE TOP BAR -->
        <header class="md:hidden h-16 bg-white border-b-4 border-black flex items-center justify-between px-4 z-20 shrink-0 sticky top-0 shadow-lg">
            <div class="flex items-center gap-2">
                <div class="w-10 h-10 bg-violet-500 rounded-lg border-2 border-black flex items-center justify-center text-white text-lg shadow-[2px_2px_0px_#000]">
                    <i class="fa-solid fa-cube"></i>
                </div>
                <span class="font-heading font-black text-xl text-black tracking-tight">People OS</span>
            </div>
            <div class="flex items-center gap-1">
                 <button @click="openModal('cmd')" class="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-black hover:bg-yellow-100 bg-white shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none"><i class="fa-solid fa-magnifying-glass"></i></button>
            </div>
        </header>

        <!-- CONTENT -->
        <main class="flex-1 relative overflow-hidden flex flex-col pb-20 md:pb-0 safe-area-pb">

            <!-- DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8 min-h-0">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="fun-card p-4 bg-pink-100 relative overflow-hidden group hover:-rotate-1">
                            <div class="text-xs text-pink-600 font-black font-heading uppercase tracking-wider">Subjects</div>
                            <div class="text-4xl font-black text-black mt-1">{{ stats.targets || 0 }}</div>
                            <i class="fa-solid fa-users absolute -bottom-4 -right-4 text-6xl text-pink-300 opacity-50 group-hover:rotate-12 transition-transform"></i>
                        </div>
                        <div class="fun-card p-4 bg-blue-100 relative overflow-hidden group hover:rotate-1">
                            <div class="text-xs text-blue-600 font-black font-heading uppercase tracking-wider">Events</div>
                            <div class="text-4xl font-black text-black mt-1">{{ stats.encounters || 0 }}</div>
                            <i class="fa-solid fa-comments absolute -bottom-4 -right-4 text-6xl text-blue-300 opacity-50 group-hover:-rotate-12 transition-transform"></i>
                        </div>
                        <div class="fun-card p-4 bg-green-100 relative overflow-hidden group hover:-rotate-1">
                            <div class="text-xs text-green-600 font-black font-heading uppercase tracking-wider">Evidence</div>
                            <div class="text-4xl font-black text-black mt-1">{{ stats.evidence || 0 }}</div>
                            <i class="fa-solid fa-file absolute -bottom-4 -right-4 text-6xl text-green-300 opacity-50 group-hover:rotate-12 transition-transform"></i>
                        </div>
                        <button @click="openModal('add-subject')" class="bg-yellow-300 text-black p-4 rounded-xl fun-btn flex flex-col items-center justify-center gap-1 hover:bg-yellow-400">
                            <i class="fa-solid fa-plus text-3xl"></i><span class="text-xs font-black uppercase font-heading">Add New</span>
                        </button>
                    </div>

                    <div class="fun-card overflow-hidden flex flex-col h-[50vh] md:h-auto border-4">
                        <div class="p-4 border-b-4 border-black flex justify-between items-center bg-white">
                            <h3 class="text-lg font-heading font-black text-black"><i class="fa-solid fa-bolt text-yellow-500 mr-2"></i>Recent Buzz</h3>
                            <button @click="fetchData" class="text-gray-400 hover:text-black hover:rotate-180 transition-transform duration-500"><i class="fa-solid fa-arrows-rotate text-xl"></i></button>
                        </div>
                        <div class="divide-y-2 divide-black overflow-y-auto flex-1 min-h-0 bg-white">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 hover:bg-gray-50 cursor-pointer flex gap-4 items-start transition-colors">
                                <div class="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 shrink-0 border-2 border-black shadow-[2px_2px_0px_#000]">
                                    <i class="fa-solid" :class="item.type === 'interaction' ? 'fa-comments' : (item.type === 'location' ? 'fa-location-dot' : 'fa-user')"></i>
                                </div>
                                <div class="min-w-0 pt-1">
                                    <div class="text-base font-black font-heading text-black truncate">{{ item.title }}</div>
                                    <div class="text-xs font-bold text-gray-500 mt-0.5 truncate">{{ item.desc }} &bull; {{ new Date(item.date).toLocaleDateString() }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TARGETS LIST -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col min-h-0 h-full">
                <div class="p-4 border-b-4 border-black bg-white z-10 sticky top-0 shrink-0">
                    <div class="relative max-w-2xl mx-auto">
                        <i class="fa-solid fa-search absolute left-4 top-4 text-gray-400 text-lg"></i>
                        <input v-model="search" placeholder="Find someone..." class="fun-input w-full py-3 pl-12 pr-4 text-lg">
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="fun-card p-4 cursor-pointer hover:bg-blue-50 group relative overflow-hidden flex gap-4 items-center shrink-0 min-h-[90px] border-black border-3">
                         <div class="w-16 h-16 bg-gray-200 rounded-full overflow-hidden shrink-0 border-2 border-black shadow-[2px_2px_0px_#000]">
                            <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center text-gray-400 text-xl font-black">{{ s.full_name.charAt(0) }}</div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-black font-heading text-lg text-black truncate">{{ s.full_name }}</div>
                            <div class="text-xs font-bold text-gray-500 truncate mb-2">{{ s.occupation || 'Unknown' }}</div>
                            <span class="text-[10px] px-2 py-1 rounded-lg uppercase font-black border-2 border-black inline-block" :class="getThreatColor(s.threat_level)">{{ s.threat_level }}</span>
                        </div>
                        <i class="fa-solid fa-chevron-right text-gray-300 absolute right-4 group-hover:text-black group-hover:translate-x-1 transition-all"></i>
                    </div>
                </div>
            </div>

            <!-- GLOBAL MAP TAB -->
            <div v-if="currentTab === 'map'" class="flex-1 flex h-full relative bg-blue-100 min-h-0 border-4 border-black m-2 md:m-4 rounded-xl overflow-hidden shadow-[4px_4px_0px_#000]">
                <div class="absolute inset-0 z-0" id="warRoomMap"></div>
                <div class="absolute top-4 left-1/2 -translate-x-1/2 z-[400] w-64 md:w-80">
                    <div class="relative group">
                        <input v-model="mapSearchQuery" @input="updateMapFilter" placeholder="Scout Map..." class="w-full bg-white border-4 border-black rounded-full py-2 pl-10 pr-4 font-bold text-sm shadow-[4px_4px_0px_#000] focus:outline-none focus:translate-y-1 focus:shadow-none transition-all">
                        <i class="fa-solid fa-crosshairs absolute left-3.5 top-3 text-black"></i>
                    </div>
                </div>
                <div class="absolute top-16 left-4 bottom-4 w-72 fun-card z-[400] flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 p-0" :class="{'translate-x-0': showMapSidebar, '-translate-x-[120%]': !showMapSidebar}">
                    <div class="p-3 border-b-4 border-black flex justify-between items-center bg-yellow-200">
                        <h3 class="font-black font-heading text-black">Active Points</h3>
                        <div class="text-xs font-bold bg-white border-2 border-black text-black px-2 py-0.5 rounded-md">{{filteredMapData.length}}</div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 space-y-2 bg-white min-h-0">
                        <div v-for="loc in filteredMapData" @click="flyToGlobal(loc)" class="p-2 rounded-xl hover:bg-gray-100 cursor-pointer border-2 border-transparent hover:border-black transition-all flex items-center gap-3">
                             <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-black bg-gray-100 shrink-0"><img :src="resolveImg(loc.avatar_path) || 'https://ui-avatars.com/api/?name='+loc.full_name" class="w-full h-full object-cover"></div>
                             <div class="min-w-0"><div class="font-bold text-sm text-black truncate font-heading">{{loc.full_name}}</div><div class="text-[10px] font-bold text-gray-500 truncate">{{loc.name}}</div></div>
                        </div>
                    </div>
                </div>
                <button @click="showMapSidebar = !showMapSidebar" class="absolute top-16 left-4 z-[401] bg-white p-3 rounded-xl shadow-[4px_4px_0px_#000] text-black border-4 border-black fun-btn" v-if="!showMapSidebar"><i class="fa-solid fa-list-ul"></i></button>
            </div>

            <!-- GLOBAL NETWORK TAB -->
            <div v-if="currentTab === 'network'" class="flex-1 flex flex-col h-full bg-white relative min-h-0 m-4 border-4 border-black rounded-xl shadow-[4px_4px_0px_#000] overflow-hidden">
                <div id="globalNetworkGraph" class="w-full h-full bg-white"></div>
            </div>

            <!-- SUBJECT DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col min-h-0 h-full bg-white">
                
                <!-- HEADER -->
                <div class="h-20 border-b-4 border-black flex items-center px-4 justify-between bg-yellow-50 z-10 sticky top-0 shrink-0">
                    <div class="flex items-center gap-3">
                        <button @click="changeTab('targets')" class="w-10 h-10 rounded-full flex items-center justify-center text-black border-2 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="min-w-0">
                            <div class="font-black font-heading text-xl text-black truncate">{{ selected.full_name }}</div>
                            <div class="text-xs font-bold text-gray-500 truncate uppercase tracking-widest">{{ selected.alias || 'The Profile' }}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="exportData" class="hidden md:flex items-center gap-2 bg-white hover:bg-gray-50 text-black px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-download"></i> JSON</button>
                        <button @click="deleteProfile" class="bg-red-400 hover:bg-red-300 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-trash"></i></button>
                        <button @click="openModal('edit-profile')" class="bg-blue-400 hover:bg-blue-300 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-pen"></i></button>
                        <button @click="openModal('share-secure')" class="bg-yellow-400 hover:bg-yellow-300 text-black px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-share-nodes"></i></button>
                    </div>
                </div>

                <!-- SUB TABS -->
                <div class="flex border-b-4 border-black overflow-x-auto bg-white shrink-0 no-scrollbar p-2 gap-2">
                    <button v-for="t in ['Overview', 'Attributes', 'Timeline', 'Map', 'Network', 'Files']" 
                        @click="changeSubTab(t.toLowerCase())" 
                        :class="subTab === t.toLowerCase() ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'"
                        class="px-4 py-2 text-sm font-black font-heading rounded-lg border-2 border-black transition-all whitespace-nowrap">
                        {{ t }}
                    </button>
                </div>

                <!-- DETAIL CONTENT -->
                <div class="flex-1 overflow-y-auto p-4 md:p-8 min-h-0 bg-yellow-50">
                    <!-- OVERVIEW -->
                    <div v-if="subTab === 'overview'" class="space-y-6 max-w-5xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-[4/5] bg-white rounded-2xl relative overflow-hidden group shadow-[6px_6px_0px_#000] border-4 border-black max-w-[220px] mx-auto md:max-w-none md:mx-0">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                    
                                    <!-- Desktop Hover Button -->
                                    <button @click="triggerUpload('avatar')" class="hidden md:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 items-center justify-center text-white font-bold transition-all backdrop-blur-sm">
                                        <i class="fa-solid fa-camera mr-2"></i> New Pic
                                    </button>

                                    <!-- Mobile Floating Button (Always Visible) -->
                                    <button @click="triggerUpload('avatar')" class="md:hidden absolute bottom-3 right-3 bg-blue-500 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg border-2 border-white z-10 active:scale-90 transition-transform">
                                        <i class="fa-solid fa-camera"></i>
                                    </button>
                                </div>
                                
                                <div class="fun-card p-4 text-center">
                                    <div class="text-xs text-gray-400 font-black uppercase mb-1">Threat Level</div>
                                    <span class="text-xl font-black px-3 py-1 rounded-lg border-2 border-black inline-block" :class="getThreatColor(selected.threat_level, true)">{{selected.threat_level}}</span>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-6">
                                <div class="fun-card p-6 border-l-[10px] border-l-blue-500">
                                    <h3 class="text-lg font-heading font-black text-blue-600 mb-2">The Gist</h3>
                                    <p class="text-base font-bold text-gray-700 leading-relaxed">{{ analysisResult?.summary || 'Not enough info yet!' }}</p>
                                    <div class="flex gap-2 mt-4 flex-wrap">
                                        <span v-for="tag in analysisResult?.tags" class="text-[10px] px-3 py-1 bg-violet-200 text-violet-800 rounded-full border-2 border-black font-black">{{tag}}</span>
                                    </div>
                                </div>
                                <div class="fun-card p-6 md:p-8">
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Name</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.full_name}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Origin</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.nationality || '???'}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Job</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.occupation || '???'}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Group</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.ideology || '???'}}</div></div>
                                    </div>
                                    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <div class="flex justify-between mb-2"><label class="text-[10px] text-gray-400 font-black uppercase">Habits</label><button @click="quickAppend('modus_operandi')" class="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-300 hover:bg-blue-200"><i class="fa-solid fa-plus"></i> Add</button></div>
                                            <div class="text-sm font-bold text-gray-600 bg-gray-50 p-4 rounded-xl h-32 overflow-y-auto whitespace-pre-wrap border-2 border-gray-200">{{selected.modus_operandi || 'Empty...'}}</div>
                                        </div>
                                        <div>
                                            <div class="flex justify-between mb-2"><label class="text-[10px] text-gray-400 font-black uppercase">Weakness</label><button @click="quickAppend('weakness')" class="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded border border-red-300 hover:bg-red-200"><i class="fa-solid fa-plus"></i> Add</button></div>
                                            <div class="text-sm font-bold text-gray-600 bg-gray-50 p-4 rounded-xl h-32 overflow-y-auto whitespace-pre-wrap border-2 border-gray-200">{{selected.weakness || 'Empty...'}}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- ATTRIBUTES -->
                    <div v-if="subTab === 'attributes'" class="max-w-5xl mx-auto space-y-6">
                         <div class="flex justify-between items-center">
                            <h3 class="font-black font-heading text-2xl text-black">Intel Ledger</h3>
                            <button @click="openModal('add-intel')" class="bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold fun-btn hover:bg-violet-400">Add Stuff</button>
                        </div>
                        <div v-for="(items, category) in groupedIntel" :key="category" class="space-y-3">
                            <h4 class="text-sm font-black uppercase text-gray-400 border-b-2 border-gray-300 pb-1 ml-2">{{ category }}</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div v-for="item in items" :key="item.id" class="fun-card p-4 relative group hover:bg-yellow-50">
                                    <div class="text-[10px] text-violet-500 font-black uppercase mb-1">{{item.label}}</div>
                                    <div class="text-black font-bold break-words text-sm">{{item.value}}</div>
                                    <button @click="deleteItem('subject_intel', item.id)" class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold hover:scale-110"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TIMELINE -->
                    <div v-show="subTab === 'timeline'" class="h-full flex flex-col space-y-4">
                        <div class="flex justify-between items-center">
                             <h3 class="font-black font-heading text-2xl text-black">History Log</h3>
                             <button @click="openModal('add-interaction')" class="bg-green-400 text-white hover:bg-green-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Log Event</button>
                        </div>
                        <div class="flex-1 fun-card p-6 overflow-y-auto min-h-0 bg-white">
                            <div class="relative pl-8 border-l-4 border-gray-200 space-y-8 my-4">
                                <div v-for="ix in selected.interactions" :key="ix.id" class="relative group">
                                    <div class="absolute -left-[43px] top-1 w-6 h-6 rounded-full bg-white border-4 border-black shadow-sm"></div>
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                                        <span class="text-lg font-black font-heading text-black">{{ix.type}}</span>
                                        <span class="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded border border-gray-200">{{new Date(ix.date).toLocaleString()}}</span>
                                        <button @click="deleteItem('subject_interactions', ix.id)" class="ml-auto text-gray-300 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-xl text-sm font-bold text-gray-700 border-2 border-gray-200 whitespace-pre-wrap">{{ix.transcript || ix.conclusion}}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- MAP (Detail) -->
                    <div v-show="subTab === 'map'" class="h-full flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-black font-heading text-2xl text-black">Locations</h3>
                            <button @click="openModal('add-location')" class="bg-blue-400 text-white hover:bg-blue-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Add Pin</button>
                        </div>
                        <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0">
                            <div class="md:col-span-2 bg-white rounded-2xl overflow-hidden relative h-64 md:h-full min-h-[300px] border-4 border-black shadow-[4px_4px_0px_#000]">
                                <div id="subjectMap" class="w-full h-full z-0"></div>
                            </div>
                            <div class="space-y-3 overflow-y-auto max-h-[600px] min-h-0">
                                <div v-for="loc in selected.locations" :key="loc.id" class="fun-card p-4 cursor-pointer hover:bg-blue-50" @click="flyTo(loc)">
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="font-black text-black text-sm font-heading">{{loc.name}}</div>
                                        <span class="text-[10px] uppercase bg-white text-black px-2 py-0.5 rounded border-2 border-black font-bold shadow-[2px_2px_0px_#000]">{{loc.type}}</span>
                                    </div>
                                    <div class="text-xs font-bold text-gray-500 mb-2">{{loc.address}}</div>
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- NETWORK (Detail) -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div class="flex justify-between items-center mb-4">
                            <h3 class="font-black font-heading text-2xl text-black">Connections</h3>
                            <button @click="openModal('add-rel')" class="bg-pink-400 text-white hover:bg-pink-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Link Person</button>
                        </div>
                        <!-- FAMILY UNIT -->
                        <div v-if="selected.familyReport && selected.familyReport.length > 0" class="fun-card p-4 mb-6 border-l-[10px] border-l-purple-400 bg-purple-50">
                             <h4 class="text-lg font-black text-purple-700 mb-3 flex items-center gap-2 font-heading"><i class="fa-solid fa-people-roof"></i> Family</h4>
                             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                 <div v-for="fam in selected.familyReport" class="flex items-center gap-3 p-2 rounded-xl bg-white border-2 border-black shadow-[3px_3px_0px_#000] hover:translate-y-1 hover:shadow-none transition-all cursor-pointer" @click="viewSubject(fam.id)">
                                     <div class="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 border-2 border-black"><img :src="resolveImg(fam.avatar)" class="w-full h-full object-cover"></div>
                                     <div><div class="text-sm font-bold text-black">{{fam.name}}</div><div class="text-[10px] text-purple-600 uppercase tracking-wide font-black">{{fam.role}}</div></div>
                                 </div>
                             </div>
                        </div>
                        <div class="flex-1 fun-card border-4 border-black relative overflow-hidden min-h-[400px]">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
                        <div class="mt-6">
                            <div class="space-y-2">
                                <div v-for="rel in selected.relationships" :key="rel.id" class="flex items-center justify-between p-3 fun-card hover:bg-gray-50">
                                    <div class="flex items-center gap-3">
                                         <div class="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0 border-2 border-black">
                                            <img v-if="rel.target_avatar" :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover">
                                            <div v-else class="w-full h-full flex items-center justify-center font-black text-gray-400">{{rel.target_name.charAt(0)}}</div>
                                        </div>
                                        <div><div class="text-sm font-black text-black">{{rel.target_name}}</div><div class="text-xs font-bold text-blue-500">{{rel.relationship_type}} &harr; {{rel.role_b || 'Associate'}}</div></div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button @click="openModal('edit-rel', rel)" class="text-gray-400 hover:text-blue-500 p-2"><i class="fa-solid fa-pen"></i></button>
                                        <button @click="deleteItem('subject_relationships', rel.id)" class="text-gray-400 hover:text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="subTab === 'files'" class="space-y-6">
                         <div class="flex gap-4">
                            <div @click="triggerUpload('media')" class="h-28 w-32 rounded-2xl border-4 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-500 transition-all text-gray-400 group">
                                <i class="fa-solid fa-cloud-arrow-up text-3xl mb-1 group-hover:scale-110 transition-transform"></i>
                                <span class="text-xs font-black uppercase">Upload</span>
                            </div>
                            <div @click="openModal('add-media-link')" class="h-28 w-32 rounded-2xl border-4 border-gray-200 bg-white flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all text-gray-400 hover:text-black gap-1 group">
                                <i class="fa-solid fa-link text-2xl group-hover:scale-110 transition-transform"></i>
                                <span class="text-xs font-black uppercase">Link</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div v-for="m in selected.media" :key="m.id" class="fun-card group relative aspect-square overflow-hidden bg-white p-2">
                                <div class="w-full h-full rounded-lg overflow-hidden border-2 border-gray-200 relative">
                                    <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transition-transform group-hover:scale-110" onerror="this.src='https://placehold.co/400?text=IMG'">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50"><i class="fa-solid fa-file text-5xl"></i></div>
                                </div>
                                <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0 z-10"></a>
                                <div class="absolute bottom-2 left-2 right-2 bg-black/80 p-1 rounded-lg text-[10px] font-bold text-white truncate text-center pointer-events-none z-10">{{m.description}}</div>
                                <button @click.stop="deleteItem('subject_media', m.id)" class="absolute top-0 right-0 bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-bl-xl font-bold shadow-sm z-20 hover:bg-red-600 border-l-2 border-b-2 border-white"><i class="fa-solid fa-times"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        
        <!-- MOBILE NAV -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 h-auto min-h-[4rem] bg-white border-t-4 border-black flex justify-around items-center z-50 safe-area-pb py-1 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
            <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'text-black translate-y-[-4px]' : 'text-gray-400'" class="flex flex-col items-center justify-center w-full h-full p-2 active:bg-gray-100 transition-all">
                <i :class="t.icon" class="text-2xl mb-1 drop-shadow-md"></i>
                <span class="text-[10px] font-black uppercase tracking-wide">{{t.label}}</span>
            </button>
        </nav>
    </div>

    <!-- MODALS -->
    <div v-if="modal.active" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-2xl fun-card flex flex-col max-h-[90vh] animate-bounce-in overflow-hidden border-4">
             
             <div class="flex justify-between items-center p-4 border-b-4 border-black bg-yellow-300">
                <h3 class="font-black text-xl text-black font-heading">{{ modalTitle }}</h3>
                <button @click="closeModal" class="w-8 h-8 rounded-full flex items-center justify-center bg-white border-2 border-black shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all"><i class="fa-solid fa-xmark font-bold"></i></button>
            </div>
            
            <div class="overflow-y-auto p-4 md:p-6 space-y-6 bg-white">
                <!-- COMMAND PALETTE -->
                <div v-if="modal.active === 'cmd'">
                    <input ref="cmdInput" v-model="cmdQuery" placeholder="Start typing..." class="fun-input w-full p-4 text-xl mb-4">
                    <div class="space-y-2">
                        <div v-for="res in cmdResults" @click="res.action" class="p-3 rounded-xl hover:bg-blue-100 cursor-pointer flex justify-between items-center border-2 border-gray-100 hover:border-black transition-all group">
                             <div><div class="font-black text-lg text-black font-heading">{{res.title}}</div><div class="text-xs font-bold text-gray-500">{{res.desc}}</div></div>
                             <i class="fa-solid fa-arrow-right text-gray-300 group-hover:text-black font-bold"></i>
                        </div>
                    </div>
                </div>

                <!-- ADD/EDIT REL -->
                 <form v-if="['add-rel', 'edit-rel'].includes(modal.active)" @submit.prevent="submitRel" class="space-y-6">
                    <div class="p-4 bg-blue-100 border-2 border-blue-400 rounded-xl text-sm font-bold text-blue-900 mb-4">{{ modal.active === 'edit-rel' ? 'Editing link for' : 'Linking' }} <strong>{{selected.full_name}}</strong></div>
                    <select v-if="modal.active === 'add-rel'" v-model="forms.rel.targetId" class="fun-input w-full p-3 text-sm" required>
                        <option value="" disabled selected>Pick a Person</option>
                        <option v-for="s in subjects" :value="s.id" v-show="s.id !== selected.id">{{s.full_name}} ({{s.occupation}})</option>
                    </select>
                    <div class="border-t-2 border-dashed border-gray-300 pt-4 mt-2">
                         <label class="block text-xs font-black uppercase text-gray-400 mb-2">The Connection</label>
                         <div class="grid grid-cols-2 gap-4">
                             <div><div class="text-[10px] text-gray-500 font-bold mb-1">Role of {{selected.full_name}}</div><input v-model="forms.rel.type" list="preset-roles-a" placeholder="e.g. Father" class="fun-input w-full p-3 text-sm" @input="autoFillReciprocal"></div>
                             <div><div class="text-[10px] text-gray-500 font-bold mb-1">Role of Target</div><input v-model="forms.rel.reciprocal" list="preset-roles-b" placeholder="e.g. Son" class="fun-input w-full p-3 text-sm"></div>
                         </div>
                         <div class="flex flex-wrap gap-2 mt-4"><div v-for="p in presets" @click="applyPreset(p)" class="text-[10px] px-3 py-1 bg-gray-100 border-2 border-black rounded-lg cursor-pointer hover:bg-black hover:text-white font-bold shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all">{{p.a}} &harr; {{p.b}}</div></div>
                    </div>
                    <button type="submit" :disabled="processing" class="w-full bg-green-400 text-white font-black font-heading py-4 rounded-xl text-lg fun-btn hover:bg-green-500">{{ processing ? 'Sticking...' : 'Stick It!' }}</button>
                 </form>

                <!-- ADD/EDIT SUBJECT -->
                <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-6">
                    <div v-if="modal.active === 'edit-profile'" class="bg-gray-100 p-4 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-between">
                         <div class="text-sm font-bold text-gray-600">Profile Picture</div>
                         <button type="button" @click="triggerUpload('avatar')" class="bg-white px-4 py-2 rounded-lg border-2 border-black font-bold text-xs hover:bg-gray-50 flex items-center gap-2">
                            <i class="fa-solid fa-camera"></i> Change Photo
                         </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        <div class="space-y-4">
                            <label class="block text-xs font-black uppercase text-gray-400">Who is it?</label>
                            <input v-model="forms.subject.full_name" placeholder="Full Name *" class="fun-input w-full p-3 text-sm" required>
                            <input v-model="forms.subject.alias" placeholder="Nickname" class="fun-input w-full p-3 text-sm">
                            <input v-model="forms.subject.occupation" list="list-occupations" placeholder="Job" class="fun-input w-full p-3 text-sm">
                            <input v-model="forms.subject.nationality" list="list-nationalities" placeholder="Origin" class="fun-input w-full p-3 text-sm">
                        </div>
                        <div class="space-y-4">
                             <label class="block text-xs font-black uppercase text-gray-400">Details</label>
                             <select v-model="forms.subject.threat_level" class="fun-input w-full p-3 text-sm">
                                <option value="Low">🟢 Low Priority</option><option value="Medium">🟡 Medium Priority</option><option value="High">🟠 High Priority</option><option value="Critical">🔴 Critical</option>
                            </select>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="date" v-model="forms.subject.dob" class="fun-input w-full p-3 text-sm text-gray-500">
                                <input type="number" v-model="forms.subject.age" placeholder="Age" class="fun-input w-full p-3 text-sm">
                            </div>
                             <input v-model="forms.subject.ideology" list="list-ideologies" placeholder="Team/Group" class="fun-input w-full p-3 text-sm">
                        </div>
                    </div>
                    <div class="pt-4 border-t-2 border-gray-200"><h4 class="text-xs font-black uppercase text-gray-400 mb-4">Stats</h4><div class="grid grid-cols-2 md:grid-cols-4 gap-4"><input v-model="forms.subject.height" placeholder="Height" class="fun-input p-2 text-xs"><input v-model="forms.subject.weight" placeholder="Weight" class="fun-input p-2 text-xs"><input v-model="forms.subject.blood_type" placeholder="Blood" class="fun-input p-2 text-xs"></div></div>
                    <div class="space-y-4"><label class="block text-xs font-black uppercase text-gray-400">Secret Notes</label><textarea v-model="forms.subject.modus_operandi" placeholder="Habits..." rows="3" class="fun-input w-full p-3 text-sm"></textarea><textarea v-model="forms.subject.weakness" placeholder="Weakness..." rows="3" class="fun-input w-full p-3 text-sm"></textarea></div>
                    <button type="submit" :disabled="processing" class="w-full bg-violet-500 hover:bg-violet-400 text-white font-black font-heading py-4 rounded-xl text-lg fun-btn">{{ processing ? 'Saving...' : 'Save This Person' }}</button>
                </form>

                <!-- ADD INTEL -->
                <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <select v-model="forms.intel.category" class="fun-input w-full p-3 text-sm">
                        <option>General</option><option>Contact Info</option><option>Social Media</option><option>Education</option><option>Financial</option><option>Medical</option><option>Family</option>
                    </select>
                    <input v-model="forms.intel.label" placeholder="Label (e.g. Phone)" class="fun-input w-full p-3 text-sm" required>
                    <textarea v-model="forms.intel.value" placeholder="Value" rows="3" class="fun-input w-full p-3 text-sm" required></textarea>
                    <button type="submit" class="w-full bg-blue-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-blue-500">Add Info</button>
                 </form>

                 <!-- ADD MEDIA LINK -->
                 <form v-if="modal.active === 'add-media-link'" @submit.prevent="submitMediaLink" class="space-y-4">
                    <input v-model="forms.mediaLink.url" placeholder="Paste URL Here" class="fun-input w-full p-3 text-sm" required>
                    <input v-model="forms.mediaLink.description" placeholder="What is it?" class="fun-input w-full p-3 text-sm">
                    <select v-model="forms.mediaLink.type" class="fun-input w-full p-3 text-sm"><option value="image/jpeg">Image</option><option value="application/pdf">Document</option><option value="video/mp4">Video</option><option value="text/plain">Other</option></select>
                    <button type="submit" class="w-full bg-pink-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-pink-500">Save Link</button>
                 </form>

                 <!-- SHARE -->
                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <p class="text-sm font-bold text-gray-500">Make a secret link for others.</p>
                    <div class="flex gap-2">
                        <select v-model="forms.share.minutes" class="fun-input w-32 p-2 text-sm"><option :value="30">30 Mins</option><option :value="60">1 Hour</option><option :value="1440">24 Hours</option><option :value="10080">7 Days</option></select>
                        <button @click="createShareLink" class="flex-1 bg-yellow-400 text-black font-black rounded-xl text-sm fun-btn hover:bg-yellow-500">Create Magic Link</button>
                    </div>
                    <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                        <div v-for="link in activeShareLinks" class="flex justify-between items-center p-3 bg-gray-100 rounded-xl border-2 border-gray-300">
                            <div><div class="text-xs font-mono font-bold text-gray-600">...{{link.token.slice(-8)}}</div><div class="text-[10px] font-bold text-gray-400 uppercase">{{link.is_active ? 'Active' : 'Dead'}} &bull; {{link.views}} peeks</div></div>
                            <div class="flex gap-2"><button @click="copyToClipboard(getShareUrl(link.token))" class="text-blue-500 hover:text-blue-700 font-bold p-2"><i class="fa-regular fa-copy"></i></button><button v-if="link.is_active" @click="revokeLink(link.token)" class="text-red-400 hover:text-red-600 p-2"><i class="fa-solid fa-ban"></i></button></div>
                        </div>
                    </div>
                 </div>
                 
                 <!-- LOCATION PICKER -->
                 <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                    <div class="relative">
                         <input v-model="locationSearchQuery" @input="debounceSearch" placeholder="Find place..." class="fun-input w-full p-3 pl-10 text-sm">
                         <i class="fa-solid fa-search absolute left-3 top-3.5 text-gray-400"></i>
                         <div v-if="locationSearchResults.length" class="absolute w-full bg-white border-2 border-black max-h-48 overflow-y-auto mt-1 shadow-xl rounded-xl z-50">
                             <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-yellow-100 cursor-pointer text-xs border-b border-gray-100 font-bold text-gray-700">{{ res.display_name }}</div>
                         </div>
                    </div>
                    <div class="h-48 w-full bg-gray-100 rounded-xl border-2 border-black relative overflow-hidden"><div id="locationPickerMap" class="absolute inset-0 z-0"></div></div>
                    <input v-model="forms.location.name" placeholder="Name (e.g. Secret Base)" class="fun-input w-full p-3 text-sm">
                    <select v-model="forms.location.type" class="fun-input w-full p-3 text-sm"><option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Other</option></select>
                    <button type="submit" class="w-full bg-blue-500 text-white font-black py-4 rounded-xl fun-btn hover:bg-blue-600">Drop Pin</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="fun-input p-3 text-sm" required>
                        <select v-model="forms.interaction.type" class="fun-input p-3 text-sm"><option>Meeting</option><option>Call</option><option>Email</option><option>Event</option><option>Observation</option></select>
                    </div>
                    <textarea v-model="forms.interaction.transcript" placeholder="What happened?" rows="5" class="fun-input w-full p-3 text-sm"></textarea>
                    <button type="submit" class="w-full bg-orange-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-orange-500">Log It</button>
                </form>
            </div>
        </div>
    </div>

    <!-- Hidden Input -->
    <input type="file" ref="fileInput" class="absolute opacity-0 -z-10 w-0 h-0 overflow-hidden" @change="handleFile">
    <datalist id="list-occupations"><option v-for="i in suggestions.occupations" :value="i"></option></datalist>
    <datalist id="list-nationalities"><option v-for="i in suggestions.nationalities" :value="i"></option></datalist>
    <datalist id="list-ideologies"><option v-for="i in suggestions.ideologies" :value="i"></option></datalist>
    <datalist id="preset-roles-a"><option v-for="p in presets" :value="p.a"></option></datalist>
    <datalist id="preset-roles-b"><option v-for="p in presets" :value="p.b"></option></datalist>
    
    <!-- Mini Profile Modal -->
    <div v-if="modal.active === 'mini-profile'" class="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none">
        <div class="w-full max-w-sm fun-card bg-white shadow-2xl flex flex-col animate-bounce-in border-4 border-black p-6 text-center pointer-events-auto relative">
            <button @click="closeModal" class="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-100 text-red-500 border-2 border-black flex items-center justify-center font-bold hover:bg-red-200"><i class="fa-solid fa-times"></i></button>
            <div class="w-24 h-24 rounded-full overflow-hidden border-4 border-black bg-gray-100 mx-auto mb-4 shadow-[4px_4px_0px_#000]">
                <img :src="resolveImg(modal.data.avatar_path)" class="w-full h-full object-cover">
            </div>
            <h3 class="text-2xl font-black text-black mb-1 font-heading">{{modal.data.full_name}}</h3>
            <p class="text-sm font-bold text-gray-500 mb-6 bg-gray-100 inline-block px-3 py-1 rounded-full mx-auto border-2 border-gray-200">{{modal.data.occupation || 'No Job'}}</p>
            <button @click="viewSubject(modal.data.id)" class="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-3 rounded-xl text-lg fun-btn shadow-[3px_3px_0px_#000] active:shadow-none active:translate-y-1">Open Folder</button>
        </div>
    </div>

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    const PRESETS = [
        { a: 'Father', b: 'Child' }, { a: 'Mother', b: 'Child' }, { a: 'Parent', b: 'Child' },
        { a: 'Son', b: 'Parent' }, { a: 'Daughter', b: 'Parent' }, { a: 'Child', b: 'Parent' },
        { a: 'Brother', b: 'Sibling' }, { a: 'Sister', b: 'Sibling' },
        { a: 'Husband', b: 'Wife' }, { a: 'Wife', b: 'Husband' }, { a: 'Spouse', b: 'Spouse' },
        { a: 'Uncle', b: 'Niece/Nephew' }, { a: 'Aunt', b: 'Niece/Nephew' },
        { a: 'Grandfather', b: 'Grandchild' }, { a: 'Grandmother', b: 'Grandchild' },
        { a: 'Teacher', b: 'Student' }, { a: 'Employer', b: 'Employee' },
        { a: 'Friend', b: 'Friend' }, { a: 'Associate', b: 'Associate' }
    ];

    createApp({
      setup() {
        const view = ref('auth');
        const loading = ref(false);
        const processing = ref(false); 
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', icon: 'fa-solid fa-chart-pie', label: 'Briefing' },
            { id: 'targets', icon: 'fa-solid fa-address-book', label: 'Database' },
            { id: 'map', icon: 'fa-solid fa-map-location-dot', label: 'Global Map' },
            { id: 'network', icon: 'fa-solid fa-circle-nodes', label: 'Network' },
        ];
        
        const currentTab = ref('dashboard');
        const subTab = ref('overview');
        
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const suggestions = reactive({ occupations: [], nationalities: [], ideologies: [] });
        const selected = ref(null);
        const activeShareLinks = ref([]);
        const search = ref('');
        const modal = reactive({ active: null, data: null });
        const analysisResult = ref(null);
        const mapData = ref([]);
        const mapSearchQuery = ref('');
        const presets = ref(PRESETS);
        const toasts = ref([]);
        const showMapSidebar = ref(window.innerWidth >= 768);
        
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        let pickerMapInstance = null;
        let mapInstance = null;
        let warRoomMapInstance = null;
        let searchTimeout = null;
        
        const cmdQuery = ref('');
        const cmdInput = ref(null);

        const forms = reactive({
            subject: {}, interaction: {}, location: {}, intel: {}, rel: { type: '', reciprocal: '' }, share: { minutes: 60 }, mediaLink: {}
        });

        // Computed
        const filteredSubjects = computed(() => subjects.value.filter(s => s.full_name.toLowerCase().includes(search.value.toLowerCase())));
        const filteredMapData = computed(() => !mapSearchQuery.value ? mapData.value : mapData.value.filter(d => d.full_name.toLowerCase().includes(mapSearchQuery.value.toLowerCase()) || d.name.toLowerCase().includes(mapSearchQuery.value.toLowerCase())));
        const groupedIntel = computed(() => selected.value?.intel ? selected.value.intel.reduce((a, i) => (a[i.category] = a[i.category] || []).push(i) && a, {}) : {});
        const cmdResults = computed(() => cmdQuery.value ? subjects.value.filter(s => s.full_name.toLowerCase().includes(cmdQuery.value.toLowerCase())).slice(0, 5).map(s => ({ title: s.full_name, desc: s.occupation, action: () => { viewSubject(s.id); closeModal(); } })) : []);
        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
        const modalTitle = computed(() => ({ 'add-subject':'New Profile', 'edit-profile':'Edit Profile', 'add-interaction':'Log Event', 'add-location':'Add Location', 'add-intel':'Add Attribute', 'add-rel':'Connect Profile', 'edit-rel': 'Edit Connection', 'share-secure':'Share Profile', 'add-media-link': 'Add External Media' }[modal.active] || 'Menu'));

        // Notification System
        const notify = (title, msg, type='info') => {
            const id = Date.now();
            const icon = type==='error'?'fa-solid fa-circle-exclamation':(type==='success'?'fa-solid fa-check-circle':'fa-solid fa-info-circle');
            const color = type==='error'?'#EF4444':(type==='success'?'#10B981':'#3B82F6');
            toasts.value.push({ id, title, msg, icon, color });
            setTimeout(() => toasts.value = toasts.value.filter(t => t.id !== id), 3000);
        };

        // API
        const api = async (ep, opts = {}) => {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) };
            try {
                const res = await fetch('/api' + ep, { ...opts, headers });
                if(res.status === 401) { view.value = 'auth'; throw new Error("Session Expired"); }
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                return data;
            } catch(e) { notify('System Error', e.message, 'error'); throw e; }
        };

        const handleAuth = async () => {
            loading.value = true;
            try {
                const res = await api('/login', { method: 'POST', body: JSON.stringify(auth) });
                localStorage.setItem('token', res.token);
                view.value = 'app';
                fetchData();
            } catch(e) {} finally { loading.value = false; }
        };

        const fetchData = async () => {
            const [d, s, sugg] = await Promise.all([api('/dashboard'), api('/subjects'), api('/suggestions')]);
            stats.value = d.stats; feed.value = d.feed; subjects.value = s; Object.assign(suggestions, sugg);
        };

        const viewSubject = async (id) => {
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            subTab.value = 'overview';
            analysisResult.value = analyzeLocal(selected.value);
            if(modal.active === 'cmd' || modal.active === 'mini-profile') closeModal(); 
        };

        const analyzeLocal = (s) => {
             const points = (s.intel?.length || 0) + (s.interactions?.length || 0);
             const completeness = Math.min(100, Math.floor(points * 5));
             const tags = [];
             if(s.intel?.some(i => i.category === 'Social Media')) tags.push('Digital');
             if(s.interactions?.length > 5) tags.push('Frequent Contact');
             return { summary: \`Profile is \${completeness}% complete based on data density.\`, tags };
        };

        // Relation Presets
        const applyPreset = (p) => { forms.rel.type = p.a; forms.rel.reciprocal = p.b; };
        const autoFillReciprocal = () => { const p = PRESETS.find(pr => pr.a.toLowerCase() === forms.rel.type.toLowerCase()); if (p) forms.rel.reciprocal = p.b; };

        // Quick Note
        const quickAppend = async (field) => {
            const note = prompt("Add note:");
            if(!note) return;
            const newVal = (selected.value[field] ? selected.value[field] + "\\n\\n" : "") + \`[\${new Date().toLocaleDateString()}] \${note}\`;
            await api('/subjects/'+selected.value.id, { method: 'PATCH', body: JSON.stringify({ [field]: newVal }) });
            selected.value[field] = newVal;
            notify('Success', 'Note appended', 'success');
        };

        // Export
        const exportData = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selected.value, null, 2));
            const el = document.createElement('a');
            el.setAttribute("href", dataStr);
            el.setAttribute("download", \`\${selected.value.full_name.replace(/ /g,'_')}_Dossier.json\`);
            document.body.appendChild(el); el.click(); el.remove();
        };

        // Map Logic
        const initMap = (id, data, isPicker = false) => {
            const el = document.getElementById(id);
            if(!el) return;
            if(isPicker && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; }
            if(!isPicker && id === 'subjectMap' && mapInstance) { mapInstance.remove(); mapInstance = null; }
            if(!isPicker && id === 'warRoomMap' && warRoomMapInstance) { warRoomMapInstance.remove(); warRoomMapInstance = null; }

            const map = L.map(id, { attributionControl: false, zoomControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
            L.control.zoom({ position: 'bottomright' }).addTo(map);

            setTimeout(() => map.invalidateSize(), 200);

            if(isPicker) {
                 pickerMapInstance = map;
                 map.on('click', e => {
                    forms.location.lat = e.latlng.lat; forms.location.lng = e.latlng.lng;
                    map.eachLayer(l => { if(l instanceof L.Marker) map.removeLayer(l); });
                    L.marker(e.latlng).addTo(map);
                 });
            } else {
                if(id === 'subjectMap') mapInstance = map; else warRoomMapInstance = map;
                renderMapData(map, data);
            }
        };

        const renderMapData = (map, data) => {
            if(!map) return;
            map.eachLayer(layer => { if (layer instanceof L.Marker || layer instanceof L.Polyline) map.removeLayer(layer); });
            const grouped = data.reduce((acc, loc) => {
                if(!acc[loc.subject_id]) acc[loc.subject_id] = { locations: [], avatar: loc.avatar_path, name: loc.full_name };
                if(loc.lat) acc[loc.subject_id].locations.push(loc);
                return acc;
            }, {});

            Object.values(grouped).forEach(group => {
                if(group.locations.length > 1) {
                    const latlngs = group.locations.map(l => [l.lat, l.lng]);
                    L.polyline(latlngs, { color: '#8B5CF6', weight: 4, opacity: 0.8, dashArray: '5, 10' }).addTo(map);
                }
                group.locations.forEach(loc => {
                    if(!loc.lat) return;
                    const avatar = loc.avatar_path || (selected.value?.avatar_path);
                    const name = loc.full_name || (selected.value?.full_name);
                    const iconHtml = \`<div class="avatar-marker-fun"><img src="\${resolveImg(avatar) || 'https://ui-avatars.com/api/?name='+name}"></div>\`;
                    const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
                    L.marker([loc.lat, loc.lng], { icon }).addTo(map).bindPopup(\`<b>\${name}</b><br>\${loc.name}\`);
                });
            });
        };

        const updateMapFilter = () => { if(warRoomMapInstance) renderMapData(warRoomMapInstance, filteredMapData.value); };
        const flyTo = (loc) => { if(mapInstance) mapInstance.flyTo([loc.lat, loc.lng], 15); };
        const flyToGlobal = (loc) => { if(warRoomMapInstance) { warRoomMapInstance.flyTo([loc.lat, loc.lng], 15); if(window.innerWidth < 768) showMapSidebar.value = false; } };

        const debounceSearch = () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                if(!locationSearchQuery.value) return;
                const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(locationSearchQuery.value)}\`);
                locationSearchResults.value = await res.json();
            }, 500);
        };
        const selectLocation = (res) => {
            forms.location.lat = parseFloat(res.lat); forms.location.lng = parseFloat(res.lon); forms.location.address = res.display_name;
            locationSearchResults.value = [];
            if(pickerMapInstance) { pickerMapInstance.setView([res.lat, res.lon], 15); L.marker([res.lat, res.lon]).addTo(pickerMapInstance); }
        };

        const changeTab = (t) => { currentTab.value = t; };
        const changeSubTab = (t) => { subTab.value = t; };
        const openModal = (t, item = null) => {
             modal.active = t;
             if(t === 'add-subject') forms.subject = { threat_level: 'Low', status: 'Active' };
             if(t === 'edit-profile') forms.subject = { ...selected.value };
             if(t === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) };
             if(t === 'add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' };
             if(t === 'add-media-link') forms.mediaLink = { subjectId: selected.value.id, type: 'image/jpeg' };
             if(t === 'add-location') { forms.location = { subject_id: selected.value.id }; locationSearchQuery.value = ''; nextTick(() => initMap('locationPickerMap', [], true)); }
             if(t === 'add-rel') forms.rel = { subjectA: selected.value.id, type: '', reciprocal: '' }; 
             if(t === 'edit-rel' && item) {
                forms.rel = { id: item.id, subjectA: selected.value.id, targetId: item.subject_a_id === selected.value.id ? item.subject_b_id : item.subject_a_id, type: item.subject_a_id === selected.value.id ? item.relationship_type : item.role_b, reciprocal: item.subject_a_id === selected.value.id ? item.role_b : item.relationship_type };
             }
             if(t === 'share-secure') fetchShareLinks();
             if(t === 'cmd') nextTick(() => cmdInput.value?.focus());
             // MINI PROFILE LOGIC
             if(t === 'mini-profile' && item) modal.data = item;
        };
        const closeModal = () => { modal.active = null; };

        // Watchers
        watch(() => forms.subject.dob, (val) => { if(val) forms.subject.age = new Date().getFullYear() - new Date(val).getFullYear(); });
        watch(() => forms.subject.age, (val) => { if(val && !forms.subject.dob) forms.subject.dob = \`\${new Date().getFullYear()-val}-01-01\`; });

        // Submissions
        const submitSubject = async () => { processing.value = true; try { const isEdit = modal.active === 'edit-profile'; await api(isEdit ? '/subjects/' + selected.value.id : '/subjects', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(forms.subject) }); if(isEdit) selected.value = { ...selected.value, ...forms.subject }; else fetchData(); closeModal(); notify('Success', 'Profile saved', 'success'); } finally { processing.value = false; } };
        const submitInteraction = async () => { processing.value = true; try { await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } };
        const submitLocation = async () => { processing.value = true; try { await api('/location', { method: 'POST', body: JSON.stringify(forms.location) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } };
        const submitIntel = async () => { processing.value = true; try { await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } };
        const submitRel = async () => { processing.value = true; try { const method = forms.rel.id ? 'PATCH' : 'POST'; const payload = method === 'POST' ? { subjectA: selected.value.id, targetId: forms.rel.targetId, type: forms.rel.type, reciprocal: forms.rel.reciprocal } : { id: forms.rel.id, type: forms.rel.type, reciprocal: forms.rel.reciprocal }; await api('/relationship', { method: method, body: JSON.stringify(payload) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } };
        const submitMediaLink = async () => { processing.value = true; try { await api('/media-link', { method: 'POST', body: JSON.stringify(forms.mediaLink) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } };
        const deleteItem = async (table, id) => { if(confirm('Delete item?')) { await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) }); viewSubject(selected.value.id); } };
        const deleteProfile = async () => { if(confirm('WARNING: DELETE THIS PROFILE?')) { await api('/delete', { method: 'POST', body: JSON.stringify({ table: 'subjects', id: selected.value.id }) }); fetchData(); changeTab('targets'); } };

        // Files
        const fileInput = ref(null);
        const uploadType = ref(null);
        const triggerUpload = (type) => { uploadType.value = type; fileInput.value.click(); };
        const handleFile = async (e) => {
             const f = e.target.files[0]; if(!f) return;
             const reader = new FileReader(); reader.readAsDataURL(f);
             reader.onload = async (ev) => {
                 await api(uploadType.value === 'avatar' ? '/upload-avatar' : '/upload-media', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, data: ev.target.result.split(',')[1], filename: f.name, contentType: f.type }) });
                 viewSubject(selected.value.id);
                 e.target.value = ''; // Reset input to allow re-uploading same file
             };
        };

        const fetchShareLinks = async () => { activeShareLinks.value = await api('/share-links?subjectId=' + selected.value.id); };
        const createShareLink = async () => { await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes }) }); fetchShareLinks(); };
        const revokeLink = async (t) => { await api('/share-links?token='+t, { method: 'DELETE' }); fetchShareLinks(); };
        const copyToClipboard = (t) => { navigator.clipboard.writeText(t); notify('Copied', 'Link copied', 'success'); };
        const getShareUrl = (t) => window.location.origin + '/share/' + t;
        const getThreatColor = (l, bg) => { const c = { 'Critical': 'red', 'High': 'orange', 'Medium': 'yellow', 'Low': 'green' }[l] || 'gray'; return bg ? \`bg-\${c}-100 text-\${c}-800 border-2 border-\${c}-500\` : \`text-\${c}-600\`; };
        const openSettings = () => { if(confirm("RESET SYSTEM?")) { api('/nuke', {method:'POST'}).then(() => { localStorage.clear(); window.location.href = '/'; }); } };
        const handleLogout = () => { localStorage.removeItem('token'); location.reload(); };

        watch(subTab, (val) => {
            if(val === 'map') nextTick(() => initMap('subjectMap', selected.value.locations || []));
            if(val === 'network') nextTick(() => {
                 const container = document.getElementById('relNetwork');
                 if(!container || !selected.value) return;
                 const mainAvatar = resolveImg(selected.value.avatar_path) || 'https://ui-avatars.com/api/?name='+selected.value.full_name;
                 const nodes = [{ id: selected.value.id, label: selected.value.full_name, size: 30, shape: 'circularImage', image: mainAvatar, borderWidth: 4, color: {border: '#000000', background: '#ffffff'} }];
                 const edges = [];
                 selected.value.relationships.forEach(r => {
                    const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                    const targetAvatar = resolveImg(r.target_avatar) || 'https://ui-avatars.com/api/?name='+r.target_name;
                    nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, shape: 'circularImage', image: targetAvatar, borderWidth: 3, color: {border: '#000000', background: '#ffffff'} });
                    edges.push({ from: selected.value.id, to: targetId || 'ext-'+r.id, label: r.subject_a_id === selected.value.id ? r.relationship_type : (r.role_b || r.relationship_type), font: { align: 'middle', face: 'Comic Neue', size: 14, strokeWidth: 3, strokeColor: '#ffffff' }, color: {color:'#000000', width: 2} });
                 });
                 const network = new vis.Network(container, { nodes, edges }, { nodes: { borderWidth: 3, font: { face: 'Fredoka', size: 14, color: '#000000' } }, edges: { color: '#000000', width: 2 } });
                 // CLICK HANDLER FOR MINI PROFILE
                 network.on("click", (params) => {
                     if(params.nodes.length > 0) {
                         const nodeId = params.nodes[0];
                         if(nodeId === selected.value.id) return;
                         const rel = selected.value.relationships.find(r => (r.subject_a_id === selected.value.id && r.subject_b_id === nodeId) || (r.subject_b_id === selected.value.id && r.subject_a_id === nodeId));
                         if(rel) openModal('mini-profile', { id: nodeId, full_name: rel.target_name, occupation: rel.target_role, avatar_path: rel.target_avatar });
                     }
                 });
            });
        });

        watch(currentTab, (val) => {
             if(val === 'map') nextTick(async () => { mapData.value = await api('/map-data'); initMap('warRoomMap', mapData.value); });
             if(val === 'network') nextTick(async () => {
                const data = await api('/global-network');
                const container = document.getElementById('globalNetworkGraph');
                data.nodes.forEach(n => { 
                    n.image = resolveImg(n.image) || 'https://ui-avatars.com/api/?name='+n.label;
                    n.borderWidth = 3;
                    n.color = { border: '#000000', background: '#ffffff' };
                    n.font = { face: 'Fredoka', size: 14, color: '#000000' };
                });
                const network = new vis.Network(container, data, { nodes: { shape: 'circularImage', borderWidth: 3 }, edges: { color: '#000000', width: 2 } });
                network.on("click", (params) => {
                    if(params.nodes.length > 0) {
                        const nodeId = params.nodes[0];
                        const nodeData = data.nodes.find(n => n.id === nodeId);
                        if(nodeData) openModal('mini-profile', { id: nodeId, full_name: nodeData.label, occupation: nodeData.occupation, avatar_path: nodeData.image });
                    }
                });
            });
        });

        onMounted(() => { if(localStorage.getItem('token')) { view.value = 'app'; fetchData(); } });

        return {
            view, loading, processing, auth, tabs, currentTab, subTab, stats, feed, subjects, filteredSubjects, selected, search, modal, forms,
            analysisResult, cmdQuery, cmdResults, cmdInput, locationSearchQuery, locationSearchResults, modalTitle, groupedIntel,
            handleAuth, fetchData, viewSubject, changeTab, changeSubTab, openModal, closeModal, 
            submitSubject, submitInteraction, submitLocation, submitIntel, submitRel, triggerUpload, handleFile, deleteItem, deleteProfile,
            fetchShareLinks, createShareLink, revokeLink, copyToClipboard, getShareUrl, resolveImg, getThreatColor,
            activeShareLinks, suggestions, debounceSearch, selectLocation, openSettings, handleLogout,
            mapData, mapSearchQuery, updateMapFilter, filteredMapData, presets, applyPreset, autoFillReciprocal, toasts, quickAppend, exportData, submitMediaLink,
            showMapSidebar, flyToGlobal, flyTo
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
