// --- Frontend: Main Admin App (Light Theme + Full Features) ---

export function serveAdminHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-50">
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
    :root { --primary: #2563eb; --bg-light: #f8fafc; --text-main: #1e293b; --text-muted: #64748b; }
    body { font-family: 'Inter', sans-serif; background-color: var(--bg-light); color: var(--text-main); }
    
    /* Light Theme Glass/Card */
    .glass { 
        background: white; 
        border: 1px solid #e2e8f0; 
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border-radius: 0.75rem; 
        transition: all 0.2s;
    }
    
    .glass-input { 
        background: #ffffff; 
        border: 1px solid #cbd5e1; 
        color: #0f172a; 
        transition: all 0.2s; 
        border-radius: 0.5rem; 
    }
    .glass-input:focus { border-color: var(--primary); outline: none; ring: 2px solid rgba(37, 99, 235, 0.1); }
    .glass-input::placeholder { color: #94a3b8; }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }

    /* Mobile Safe Area */
    .safe-area-pb { padding-bottom: env(safe-area-inset-bottom); }
    
    .animate-fade-in { animation: fadeIn 0.2s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    
    /* Marker Styles */
    .avatar-marker { position: relative; }
    .avatar-marker img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.2); transition: transform 0.2s; }
    .avatar-marker:hover img { transform: scale(1.1); border-color: var(--primary); z-index: 500; }
    .marker-label { position: absolute; bottom: -22px; left: 50%; transform: translateX(-50%); background: white; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; white-space: nowrap; pointer-events: none; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  </style>
</head>
<body class="h-full overflow-hidden text-slate-800">
  <div id="app" class="h-full flex flex-col">

    <!-- TOAST NOTIFICATION -->
    <div class="fixed top-4 right-4 z-[200] space-y-2 pointer-events-none">
        <div v-for="t in toasts" :key="t.id" class="pointer-events-auto bg-white border border-slate-200 shadow-xl rounded-lg p-4 flex items-center gap-3 animate-fade-in min-w-[300px]">
            <i :class="t.icon" class="text-lg" :style="{color: t.color}"></i>
            <div class="flex-1">
                <div class="text-sm font-bold text-slate-800">{{t.title}}</div>
                <div class="text-xs text-slate-500">{{t.msg}}</div>
            </div>
        </div>
    </div>

    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 bg-slate-50 relative overflow-hidden">
        <div class="absolute inset-0 overflow-hidden">
            <div class="absolute -top-24 -left-24 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-50"></div>
            <div class="absolute top-1/2 right-0 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-50"></div>
        </div>
        <div class="w-full max-w-sm glass p-8 shadow-2xl relative z-10">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-2xl shadow-lg shadow-blue-500/20">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <h1 class="text-2xl font-bold text-slate-900 tracking-tight">People OS</h1>
                <p class="text-slate-500 text-sm mt-1">Intelligence System</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Identity" class="glass-input w-full p-3.5 text-sm" required>
                <input v-model="auth.password" type="password" placeholder="Passcode" class="glass-input w-full p-3.5 text-sm" required>
                <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-sm transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    {{ loading ? 'Verifying...' : 'Access System' }}
                </button>
            </form>
        </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative bg-slate-50">
        
        <!-- SIDEBAR -->
        <nav class="hidden md:flex flex-col w-20 bg-white border-r border-slate-200 items-center py-6 z-20 shadow-sm">
            <div class="mb-8 text-blue-600 text-2xl"><i class="fa-solid fa-layer-group"></i></div>
            <div class="flex-1 space-y-4 w-full px-3">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'bg-blue-50 text-blue-600 border-blue-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-transparent'" class="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all group border" :title="t.label">
                    <i :class="t.icon" class="text-xl group-hover:scale-110 transition-transform"></i>
                    <span class="text-[9px] font-bold uppercase tracking-wider">{{t.label}}</span>
                </button>
            </div>
            <button @click="openModal('cmd')" class="text-slate-400 hover:text-blue-600 p-4 transition-colors"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button @click="openSettings" class="text-slate-400 hover:text-slate-600 p-4 transition-colors"><i class="fa-solid fa-gear"></i></button>
            <button @click="handleLogout" class="text-slate-400 hover:text-red-500 p-4 transition-colors"><i class="fa-solid fa-power-off"></i></button>
        </nav>

        <!-- MOBILE TOP BAR -->
        <header class="md:hidden h-14 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 z-20 shrink-0 sticky top-0">
            <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm shadow-sm">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <span class="font-bold text-base text-slate-900 tracking-tight">People OS</span>
            </div>
            <div class="flex items-center gap-1">
                 <button @click="openModal('cmd')" class="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"><i class="fa-solid fa-magnifying-glass"></i></button>
            </div>
        </header>

        <!-- CONTENT -->
        <main class="flex-1 relative overflow-hidden bg-slate-50 flex flex-col pb-20 md:pb-0 safe-area-pb">

            <!-- DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-6xl mx-auto space-y-6">
                    <!-- Stats Grid -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <div class="glass p-4 md:p-5 border-l-4 border-blue-500 relative overflow-hidden">
                            <div class="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-wider">Subjects</div>
                            <div class="text-2xl md:text-3xl font-bold text-slate-800 mt-1">{{ stats.targets || 0 }}</div>
                            <i class="fa-solid fa-users absolute -bottom-2 -right-2 text-4xl text-slate-200"></i>
                        </div>
                        <div class="glass p-4 md:p-5 border-l-4 border-amber-500 relative overflow-hidden">
                            <div class="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-wider">Events</div>
                            <div class="text-2xl md:text-3xl font-bold text-slate-800 mt-1">{{ stats.encounters || 0 }}</div>
                            <i class="fa-solid fa-comments absolute -bottom-2 -right-2 text-4xl text-slate-200"></i>
                        </div>
                        <div class="glass p-4 md:p-5 border-l-4 border-emerald-500 relative overflow-hidden">
                            <div class="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-wider">Evidence</div>
                            <div class="text-2xl md:text-3xl font-bold text-slate-800 mt-1">{{ stats.evidence || 0 }}</div>
                            <i class="fa-solid fa-file absolute -bottom-2 -right-2 text-4xl text-slate-200"></i>
                        </div>
                        <button @click="openModal('add-subject')" :disabled="processing" class="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all shadow-md shadow-blue-200 md:hover:scale-[1.02]">
                            <i v-if="processing" class="fa-solid fa-circle-notch fa-spin text-xl"></i>
                            <i v-else class="fa-solid fa-plus text-xl"></i>
                            <span class="text-xs font-bold uppercase tracking-wider">New Profile</span>
                        </button>
                    </div>

                    <!-- Activity Feed -->
                    <div class="glass overflow-hidden flex flex-col h-[50vh] md:h-auto">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 class="text-sm font-bold text-slate-700">Recent Activity</h3>
                            <button @click="fetchData" class="text-slate-400 hover:text-blue-600"><i class="fa-solid fa-arrows-rotate"></i></button>
                        </div>
                        <div class="divide-y divide-slate-100 overflow-y-auto flex-1">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-4 hover:bg-slate-50 cursor-pointer flex gap-4 items-start transition-colors">
                                <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-blue-600 shrink-0 border border-slate-200">
                                    <i class="fa-solid" :class="item.type === 'interaction' ? 'fa-comments' : (item.type === 'location' ? 'fa-location-dot' : 'fa-user')"></i>
                                </div>
                                <div class="min-w-0">
                                    <div class="text-sm font-bold text-slate-800 truncate">{{ item.title }}</div>
                                    <div class="text-xs text-slate-500 mt-0.5 truncate">{{ item.desc }} &bull; {{ new Date(item.date).toLocaleDateString() }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TARGETS LIST -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col h-full">
                <div class="p-4 border-b border-slate-200 bg-white/90 backdrop-blur z-10 sticky top-0 shadow-sm">
                    <div class="relative max-w-2xl mx-auto">
                        <i class="fa-solid fa-search absolute left-3 top-3.5 text-slate-400"></i>
                        <input v-model="search" placeholder="Search database..." class="glass-input w-full py-3 pl-10 text-sm focus:ring-blue-500">
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="glass p-4 cursor-pointer hover:border-blue-400 transition-all group relative overflow-hidden flex gap-4 items-center">
                         <div class="w-14 h-14 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200 shadow-sm">
                            <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center text-slate-400 text-lg font-bold">{{ s.full_name.charAt(0) }}</div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-bold text-slate-800 text-sm truncate">{{ s.full_name }}</div>
                            <div class="text-xs text-slate-500 truncate mb-1.5">{{ s.occupation || 'Unknown' }}</div>
                            <span class="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold border" :class="getThreatColor(s.threat_level, true)">{{ s.threat_level }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- GLOBAL MAP TAB -->
            <div v-if="currentTab === 'map'" class="flex-1 flex h-full relative bg-slate-100">
                <div class="absolute inset-0 z-0" id="warRoomMap"></div>
                <div class="absolute top-4 left-1/2 -translate-x-1/2 z-[400] w-64 md:w-80">
                    <div class="relative group">
                        <input v-model="mapSearchQuery" @input="updateMapFilter" placeholder="Filter Map..." class="w-full bg-white/90 backdrop-blur-md border border-slate-200 rounded-full py-2.5 pl-10 pr-4 text-sm shadow-xl text-slate-800">
                        <i class="fa-solid fa-crosshairs absolute left-3.5 top-3 text-slate-400"></i>
                    </div>
                </div>
            </div>

            <!-- GLOBAL NETWORK TAB -->
            <div v-if="currentTab === 'network'" class="flex-1 flex flex-col h-full bg-slate-50 relative">
                <div id="globalNetworkGraph" class="w-full h-full bg-slate-50"></div>
            </div>

            <!-- SUBJECT DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col h-full bg-slate-50">
                
                <!-- HEADER -->
                <div class="h-16 border-b border-slate-200 flex items-center px-4 justify-between bg-white z-10 sticky top-0 shadow-sm">
                    <div class="flex items-center gap-3">
                        <button @click="changeTab('targets')" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="min-w-0">
                            <div class="font-bold text-slate-800 text-sm truncate">{{ selected.full_name }}</div>
                            <div class="text-xs text-slate-500 truncate">{{ selected.alias || 'Profile View' }}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="exportData" class="hidden md:flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition-colors"><i class="fa-solid fa-download"></i> Export</button>
                        <button @click="deleteProfile" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-100"><i class="fa-solid fa-trash md:mr-2"></i><span class="hidden md:inline">Delete</span></button>
                        <button @click="openModal('edit-profile')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200"><i class="fa-solid fa-pen md:mr-2"></i><span class="hidden md:inline">Edit</span></button>
                        <button @click="openModal('share-secure')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md shadow-blue-200"><i class="fa-solid fa-share-nodes md:mr-2"></i><span class="hidden md:inline">Share</span></button>
                    </div>
                </div>

                <!-- SUB TABS -->
                <div class="flex border-b border-slate-200 overflow-x-auto bg-white shrink-0 no-scrollbar">
                    <button v-for="t in ['Overview', 'Attributes', 'Timeline', 'Map', 'Network', 'Files']" 
                        @click="changeSubTab(t.toLowerCase())" 
                        :class="subTab === t.toLowerCase() ? 'text-blue-600 border-blue-600 bg-blue-50' : 'text-slate-500 hover:text-slate-700 border-transparent'"
                        class="px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-1 md:flex-none text-center">
                        {{ t }}
                    </button>
                </div>

                <!-- DETAIL CONTENT -->
                <div class="flex-1 overflow-y-auto p-4 md:p-8">
                    <!-- PROFILE OVERVIEW -->
                    <div v-if="subTab === 'overview'" class="space-y-6 max-w-5xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-[4/5] bg-slate-100 rounded-xl relative overflow-hidden group shadow-md border border-slate-200">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                    <button @click="triggerUpload('avatar')" class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-all backdrop-blur-sm"><i class="fa-solid fa-camera mr-2"></i> Change Photo</button>
                                </div>
                                <div class="glass p-4">
                                    <div class="text-xs text-slate-400 font-bold uppercase mb-2">Threat Assessment</div>
                                    <span class="text-lg font-bold" :class="getThreatColor(selected.threat_level)">{{selected.threat_level}}</span>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-6">
                                <div class="glass p-5 border-l-4 border-blue-500 bg-blue-50/50">
                                    <h3 class="text-sm font-bold text-blue-600 mb-2">Profile Summary</h3>
                                    <p class="text-sm text-slate-600 leading-relaxed">{{ analysisResult?.summary || 'Insufficient data for summary.' }}</p>
                                    <div class="flex gap-2 mt-3 flex-wrap">
                                        <span v-for="tag in analysisResult?.tags" class="text-[10px] px-2 py-1 bg-white text-blue-600 rounded border border-blue-100 font-bold shadow-sm">{{tag}}</span>
                                    </div>
                                </div>
                                <div class="glass p-6 md:p-8">
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                                        <div><label class="text-[10px] text-slate-400 uppercase font-bold block mb-1">Full Name</label><div class="text-slate-800 font-medium border-b border-slate-100 pb-2">{{selected.full_name}}</div></div>
                                        <div><label class="text-[10px] text-slate-400 uppercase font-bold block mb-1">Nationality</label><div class="text-slate-800 font-medium border-b border-slate-100 pb-2">{{selected.nationality || 'Unspecified'}}</div></div>
                                        <div><label class="text-[10px] text-slate-400 uppercase font-bold block mb-1">Occupation</label><div class="text-slate-800 font-medium border-b border-slate-100 pb-2">{{selected.occupation || 'Unspecified'}}</div></div>
                                        <div><label class="text-[10px] text-slate-400 uppercase font-bold block mb-1">Affiliation</label><div class="text-slate-800 font-medium border-b border-slate-100 pb-2">{{selected.ideology || 'Unspecified'}}</div></div>
                                    </div>
                                    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <div class="flex justify-between mb-2"><label class="text-[10px] text-slate-400 uppercase font-bold">Modus Operandi</label><button @click="quickAppend('modus_operandi')" class="text-xs text-blue-600 hover:text-blue-800"><i class="fa-solid fa-plus"></i> Note</button></div>
                                            <div class="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg h-32 overflow-y-auto whitespace-pre-wrap border border-slate-200">{{selected.modus_operandi || 'No notes.'}}</div>
                                        </div>
                                        <div>
                                            <div class="flex justify-between mb-2"><label class="text-[10px] text-slate-400 uppercase font-bold">Vulnerabilities</label><button @click="quickAppend('weakness')" class="text-xs text-blue-600 hover:text-blue-800"><i class="fa-solid fa-plus"></i> Note</button></div>
                                            <div class="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg h-32 overflow-y-auto whitespace-pre-wrap border border-slate-200">{{selected.weakness || 'No private notes.'}}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- ATTRIBUTES -->
                    <div v-if="subTab === 'attributes'" class="max-w-5xl mx-auto space-y-6">
                         <div class="flex justify-between items-center">
                            <h3 class="font-bold text-lg text-slate-800">Intel Ledger</h3>
                            <button @click="openModal('add-intel')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md">Add Attribute</button>
                        </div>
                        <div v-for="(items, category) in groupedIntel" :key="category" class="space-y-3">
                            <h4 class="text-xs font-bold uppercase text-slate-500 border-b border-slate-200 pb-1">{{ category }}</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div v-for="item in items" :key="item.id" class="glass p-4 relative group hover:border-blue-400">
                                    <div class="text-[10px] text-slate-400 uppercase font-bold mb-1">{{item.label}}</div>
                                    <div class="text-slate-800 font-medium break-words text-sm">{{item.value}}</div>
                                    <button @click="deleteItem('subject_intel', item.id)" class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TIMELINE -->
                    <div v-show="subTab === 'timeline'" class="h-full flex flex-col space-y-4">
                        <div class="flex justify-between items-center">
                             <h3 class="font-bold text-lg text-slate-800">History Log</h3>
                             <button @click="openModal('add-interaction')" class="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold">Log Event</button>
                        </div>
                        <div class="flex-1 glass p-6 overflow-y-auto">
                            <div class="relative pl-8 border-l-2 border-slate-200 space-y-8 my-4">
                                <div v-for="ix in selected.interactions" :key="ix.id" class="relative group">
                                    <div class="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-white border-4 border-blue-500 shadow-sm"></div>
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                                        <span class="text-sm font-bold text-slate-800">{{ix.type}}</span>
                                        <span class="text-xs font-mono text-slate-500">{{new Date(ix.date).toLocaleString()}}</span>
                                        <button @click="deleteItem('subject_interactions', ix.id)" class="ml-auto text-slate-400 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                    <div class="bg-slate-50 p-4 rounded-lg text-sm text-slate-600 border border-slate-200 whitespace-pre-wrap">{{ix.transcript || ix.conclusion}}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- MAP (Detail) -->
                    <div v-show="subTab === 'map'" class="h-full flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-lg text-slate-800">Known Locations</h3>
                            <button @click="openModal('add-location')" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold">Add Location</button>
                        </div>
                        <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="md:col-span-2 bg-slate-100 rounded-xl overflow-hidden relative h-64 md:h-full min-h-[300px] border border-slate-200 shadow-inner">
                                <div id="subjectMap" class="w-full h-full z-0"></div>
                            </div>
                            <div class="space-y-3 overflow-y-auto max-h-[600px]">
                                <div v-for="loc in selected.locations" :key="loc.id" class="glass p-4 cursor-pointer hover:border-blue-400 transition-all" @click="flyTo(loc)">
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="font-bold text-slate-800 text-sm">{{loc.name}}</div>
                                        <span class="text-[10px] uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 font-bold">{{loc.type}}</span>
                                    </div>
                                    <div class="text-xs text-slate-500 mb-2">{{loc.address}}</div>
                                    <button @click.stop="deleteItem('subject_locations', loc.id)" class="text-xs text-red-500 hover:text-red-600">Remove</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- NETWORK (Detail) -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-lg text-slate-800">Connections Graph</h3>
                            <button @click="openModal('add-rel')" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold">Add Connection</button>
                        </div>
                        <div v-if="selected.familyReport && selected.familyReport.length > 0" class="glass p-4 mb-6 border-l-4 border-purple-500 bg-purple-50/50">
                             <h4 class="text-sm font-bold text-purple-700 mb-3 flex items-center gap-2"><i class="fa-solid fa-people-roof"></i> Family Unit</h4>
                             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                 <div v-for="fam in selected.familyReport" class="flex items-center gap-3 p-2 rounded bg-white border border-slate-200 hover:border-purple-400 transition-colors cursor-pointer" @click="viewSubject(fam.id)">
                                     <div class="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                         <img :src="resolveImg(fam.avatar)" class="w-full h-full object-cover">
                                     </div>
                                     <div>
                                         <div class="text-xs font-bold text-slate-800">{{fam.name}}</div>
                                         <div class="text-[10px] text-purple-500 uppercase tracking-wide font-bold">{{fam.role}}</div>
                                     </div>
                                 </div>
                             </div>
                        </div>
                        <div class="flex-1 glass border border-slate-200 relative overflow-hidden min-h-[400px]">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
                        <div class="mt-6">
                            <h4 class="text-sm font-bold text-slate-400 uppercase mb-3">Connection List</h4>
                            <div class="space-y-2">
                                <div v-for="rel in selected.relationships" :key="rel.id" class="flex items-center justify-between p-3 glass bg-white">
                                    <div class="flex items-center gap-3">
                                         <div class="w-8 h-8 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                            <img v-if="rel.target_avatar" :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover">
                                            <div v-else class="w-full h-full flex items-center justify-center font-bold text-slate-400">{{rel.target_name.charAt(0)}}</div>
                                        </div>
                                        <div>
                                            <div class="text-sm font-bold text-slate-800">{{rel.target_name}}</div>
                                            <div class="text-xs text-blue-500">{{rel.relationship_type}} &harr; {{rel.role_b || 'Associate'}}</div>
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button @click="openModal('edit-rel', rel)" class="text-slate-400 hover:text-slate-600 p-2"><i class="fa-solid fa-pen"></i></button>
                                        <button @click="deleteItem('subject_relationships', rel.id)" class="text-slate-400 hover:text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="subTab === 'files'" class="space-y-6">
                         <div class="flex gap-4">
                            <div @click="triggerUpload('media')" class="h-24 w-32 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-500 transition-all text-slate-400 group">
                                <i class="fa-solid fa-cloud-arrow-up text-xl mb-1"></i>
                                <span class="text-xs font-bold uppercase">Upload</span>
                            </div>
                            <div @click="openModal('add-media-link')" class="h-24 w-32 rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all text-slate-500 hover:text-slate-800 gap-1">
                                <i class="fa-solid fa-link text-lg"></i>
                                <span class="text-xs font-bold uppercase">Link URL</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div v-for="m in selected.media" :key="m.id" class="glass group relative aspect-square overflow-hidden hover:shadow-lg transition-all rounded-xl border-slate-200">
                                <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transition-transform group-hover:scale-105" onerror="this.src='https://placehold.co/400?text=IMG'">
                                <div v-else class="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50"><i class="fa-solid fa-file text-4xl"></i></div>
                                <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0 z-10"></a>
                                <div class="absolute bottom-0 inset-x-0 bg-white/95 p-2 text-[10px] font-medium truncate border-t border-slate-200 text-slate-600">{{m.description}}</div>
                                <button @click.stop="deleteItem('subject_media', m.id)" class="absolute top-1 right-1 bg-white text-red-500 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"><i class="fa-solid fa-times text-xs"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </main>
        
        <!-- MOBILE NAV -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex justify-around items-center z-50 safe-area-pb shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'text-blue-600' : 'text-slate-400'" class="flex flex-col items-center justify-center w-full h-full active:bg-slate-50">
                <i :class="t.icon" class="text-xl mb-1"></i>
                <span class="text-[10px] font-medium">{{t.label}}</span>
            </button>
        </nav>

    </div>

    <!-- MODALS -->
    <div v-if="modal.active" class="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-2xl glass bg-white shadow-2xl flex flex-col max-h-[90vh] animate-fade-in overflow-hidden">
             
             <div class="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50/50">
                <h3 class="font-bold text-slate-800">{{ modalTitle }}</h3>
                <button @click="closeModal" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-800"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="overflow-y-auto p-4 md:p-6 space-y-6">
                <!-- COMMAND PALETTE -->
                <div v-if="modal.active === 'cmd'">
                    <input ref="cmdInput" v-model="cmdQuery" placeholder="Jump to..." class="glass-input w-full p-4 text-lg mb-4 bg-slate-50 border-slate-200 focus:border-blue-500">
                    <div class="space-y-1">
                        <div v-for="res in cmdResults" @click="res.action" class="p-3 rounded-lg hover:bg-blue-50 cursor-pointer flex justify-between items-center border border-transparent hover:border-blue-100">
                             <div><div class="font-bold text-sm text-slate-800">{{res.title}}</div><div class="text-xs text-slate-500">{{res.desc}}</div></div>
                             <i class="fa-solid fa-arrow-right text-slate-400 text-xs"></i>
                        </div>
                    </div>
                </div>

                <!-- ADD/EDIT REL (Restored Presets) -->
                 <form v-if="['add-rel', 'edit-rel'].includes(modal.active)" @submit.prevent="submitRel" class="space-y-6">
                    <div class="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700 mb-4">
                        {{ modal.active === 'edit-rel' ? 'Editing connection for' : 'Connect' }} <strong>{{selected.full_name}}</strong>
                    </div>
                    <select v-if="modal.active === 'add-rel'" v-model="forms.rel.targetId" class="glass-input w-full p-3 text-sm" required>
                        <option value="" disabled selected>Select a Person</option>
                        <option v-for="s in subjects" :value="s.id" v-show="s.id !== selected.id">{{s.full_name}} ({{s.occupation}})</option>
                    </select>
                    <div class="border-t border-slate-200 pt-4 mt-2">
                         <label class="block text-xs font-bold uppercase text-slate-400 mb-2">Relationship Roles</label>
                         <div class="grid grid-cols-2 gap-4">
                             <div><div class="text-[10px] text-slate-400 mb-1">Role of {{selected.full_name}}</div><input v-model="forms.rel.type" list="preset-roles-a" placeholder="e.g. Father" class="glass-input w-full p-3 text-sm" @input="autoFillReciprocal"></div>
                             <div><div class="text-[10px] text-slate-400 mb-1">Role of Target</div><input v-model="forms.rel.reciprocal" list="preset-roles-b" placeholder="e.g. Son" class="glass-input w-full p-3 text-sm"></div>
                         </div>
                         <div class="flex flex-wrap gap-2 mt-3"><div v-for="p in presets" @click="applyPreset(p)" class="text-[10px] px-2 py-1 bg-slate-100 border border-slate-200 rounded cursor-pointer hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors">{{p.a}} &harr; {{p.b}}</div></div>
                    </div>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-md">{{ processing ? 'Saving...' : 'Save Connection' }}</button>
                 </form>

                <!-- ADD/EDIT SUBJECT -->
                <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        <div class="space-y-4">
                            <label class="block text-xs font-bold uppercase text-slate-400">Identity</label>
                            <input v-model="forms.subject.full_name" placeholder="Full Name *" class="glass-input w-full p-3 text-sm" required>
                            <input v-model="forms.subject.alias" placeholder="Nickname" class="glass-input w-full p-3 text-sm">
                            <input v-model="forms.subject.occupation" list="list-occupations" placeholder="Occupation" class="glass-input w-full p-3 text-sm">
                            <input v-model="forms.subject.nationality" list="list-nationalities" placeholder="Nationality" class="glass-input w-full p-3 text-sm">
                        </div>
                        <div class="space-y-4">
                             <label class="block text-xs font-bold uppercase text-slate-400">Status</label>
                             <select v-model="forms.subject.threat_level" class="glass-input w-full p-3 text-sm">
                                <option value="Low">Low Priority</option>
                                <option value="Medium">Medium Priority</option>
                                <option value="High">High Priority</option>
                                <option value="Critical">Critical</option>
                            </select>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="date" v-model="forms.subject.dob" class="glass-input w-full p-3 text-sm text-slate-600">
                                <input type="number" v-model="forms.subject.age" placeholder="Age" class="glass-input w-full p-3 text-sm">
                            </div>
                             <input v-model="forms.subject.ideology" list="list-ideologies" placeholder="Affiliation" class="glass-input w-full p-3 text-sm">
                        </div>
                    </div>
                    <div class="space-y-4"><label class="block text-xs font-bold uppercase text-slate-400">Notes</label><textarea v-model="forms.subject.modus_operandi" placeholder="Routine & Habits..." rows="3" class="glass-input w-full p-3 text-sm"></textarea><textarea v-model="forms.subject.weakness" placeholder="Sensitivities..." rows="3" class="glass-input w-full p-3 text-sm"></textarea></div>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-sm shadow-md">{{ processing ? 'Saving...' : 'Save Profile' }}</button>
                </form>

                <!-- ADD INTEL -->
                <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <select v-model="forms.intel.category" class="glass-input w-full p-3 text-sm">
                        <option>General</option><option>Contact Info</option><option>Social Media</option><option>Education</option><option>Financial</option><option>Medical</option><option>Family</option>
                    </select>
                    <input v-model="forms.intel.label" placeholder="Label" class="glass-input w-full p-3 text-sm" required>
                    <textarea v-model="forms.intel.value" placeholder="Value" rows="3" class="glass-input w-full p-3 text-sm" required></textarea>
                    <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-md">Add Attribute</button>
                 </form>

                 <!-- ADD MEDIA LINK -->
                 <form v-if="modal.active === 'add-media-link'" @submit.prevent="submitMediaLink" class="space-y-4">
                    <input v-model="forms.mediaLink.url" placeholder="Paste URL *" class="glass-input w-full p-3 text-sm" required>
                    <input v-model="forms.mediaLink.description" placeholder="Description" class="glass-input w-full p-3 text-sm">
                    <select v-model="forms.mediaLink.type" class="glass-input w-full p-3 text-sm"><option value="image/jpeg">Image</option><option value="application/pdf">Document</option><option value="video/mp4">Video</option><option value="text/plain">Other</option></select>
                    <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-md">Save Link</button>
                 </form>

                 <!-- SHARE -->
                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <p class="text-sm text-slate-500">Create a temporary secure link for external access.</p>
                    <div class="flex gap-2">
                        <select v-model="forms.share.minutes" class="glass-input w-32 p-2 text-sm"><option :value="30">30 Mins</option><option :value="60">1 Hour</option><option :value="1440">24 Hours</option><option :value="10080">7 Days</option></select>
                        <button @click="createShareLink" class="flex-1 bg-blue-600 text-white font-bold rounded-lg text-sm shadow-md">Generate Link</button>
                    </div>
                    <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                        <div v-for="link in activeShareLinks" class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div><div class="text-xs font-mono text-slate-500">...{{link.token.slice(-8)}}</div><div class="text-[10px] text-slate-400">{{link.is_active ? 'Active' : 'Expired'}} &bull; {{link.views}} views</div></div>
                            <div class="flex gap-2"><button @click="copyToClipboard(getShareUrl(link.token))" class="text-blue-600 hover:text-blue-800 p-2"><i class="fa-regular fa-copy"></i></button><button v-if="link.is_active" @click="revokeLink(link.token)" class="text-red-500 hover:text-red-700 p-2"><i class="fa-solid fa-ban"></i></button></div>
                        </div>
                    </div>
                 </div>
                 
                 <!-- LOCATION PICKER (Restored) -->
                 <form v-if="modal.active === 'add-location'" @submit.prevent="submitLocation" class="space-y-4">
                    <div class="relative">
                         <input v-model="locationSearchQuery" @input="debounceSearch" placeholder="Search places..." class="glass-input w-full p-3 pl-10 text-sm">
                         <i class="fa-solid fa-search absolute left-3 top-3.5 text-slate-400"></i>
                         <div v-if="locationSearchResults.length" class="absolute w-full bg-white border border-slate-200 max-h-48 overflow-y-auto mt-1 shadow-xl rounded-lg z-50">
                             <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-slate-50 cursor-pointer text-xs border-b border-slate-100 text-slate-700">{{ res.display_name }}</div>
                         </div>
                    </div>
                    <div class="h-48 w-full bg-slate-100 rounded-lg border border-slate-200 relative overflow-hidden"><div id="locationPickerMap" class="absolute inset-0 z-0"></div></div>
                    <input v-model="forms.location.name" placeholder="Name (e.g. Safehouse)" class="glass-input w-full p-3 text-sm">
                    <select v-model="forms.location.type" class="glass-input w-full p-3 text-sm"><option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Other</option></select>
                    <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-md">Add Pin</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="glass-input p-3 text-sm" required>
                        <select v-model="forms.interaction.type" class="glass-input p-3 text-sm"><option>Meeting</option><option>Call</option><option>Email</option><option>Event</option><option>Observation</option></select>
                    </div>
                    <textarea v-model="forms.interaction.transcript" placeholder="Details & Notes" rows="5" class="glass-input w-full p-3 text-sm"></textarea>
                    <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg text-sm shadow-md">Log Event</button>
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
            { id: 'dashboard', icon: 'fa-solid fa-chart-simple', label: 'Briefing' },
            { id: 'targets', icon: 'fa-solid fa-users', label: 'Database' },
            { id: 'map', icon: 'fa-solid fa-earth-americas', label: 'Global Map' },
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
            const icon = type==='error'?'fa-solid fa-circle-exclamation':(type==='success'?'fa-solid fa-circle-check':'fa-solid fa-info-circle');
            const color = type==='error'?'#ef4444':(type==='success'?'#10b981':'#3b82f6');
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
            if(modal.active) closeModal(); 
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
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
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
            const allPoints = [];
            
            data.forEach(loc => {
                if(!loc.lat) return;
                allPoints.push([loc.lat, loc.lng]);
                const avatar = loc.avatar_path || (selected.value?.avatar_path);
                const name = loc.full_name || (selected.value?.full_name);
                const iconHtml = \`<div class="avatar-marker w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden bg-white"><img src="\${resolveImg(avatar) || 'https://ui-avatars.com/api/?name='+name}"></div>\`;
                const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
                L.marker([loc.lat, loc.lng], { icon }).addTo(map).bindPopup(\`<b>\${name}</b><br>\${loc.name}\`);
            });
            if (allPoints.length) map.fitBounds(allPoints, { padding: [50, 50] });
        };

        const updateMapFilter = () => { if(warRoomMapInstance) renderMapData(warRoomMapInstance, filteredMapData.value); };
        const flyTo = (loc) => { if(mapInstance) mapInstance.flyTo([loc.lat, loc.lng], 15); };

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
        };
        const closeModal = () => { modal.active = null; };

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
             };
        };

        const fetchShareLinks = async () => { activeShareLinks.value = await api('/share-links?subjectId=' + selected.value.id); };
        const createShareLink = async () => { await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes }) }); fetchShareLinks(); };
        const revokeLink = async (t) => { await api('/share-links?token='+t, { method: 'DELETE' }); fetchShareLinks(); };
        const copyToClipboard = (t) => { navigator.clipboard.writeText(t); notify('Copied', 'Link copied', 'success'); };
        const getShareUrl = (t) => window.location.origin + '/share/' + t;
        const getThreatColor = (l, bg) => { const c = { 'Critical': 'red', 'High': 'orange', 'Medium': 'amber', 'Low': 'slate' }[l] || 'slate'; return bg ? \`bg-\${c}-100 text-\${c}-700 border-\${c}-200\` : \`text-\${c}-600\`; };
        const openSettings = () => { if(confirm("RESET SYSTEM?")) { api('/nuke', {method:'POST'}).then(() => { localStorage.clear(); window.location.href = '/'; }); } };
        const handleLogout = () => { localStorage.removeItem('token'); location.reload(); };

        watch(subTab, (val) => {
            if(val === 'map') nextTick(() => initMap('subjectMap', selected.value.locations || []));
            if(val === 'network') nextTick(() => {
                 const container = document.getElementById('relNetwork');
                 if(!container || !selected.value) return;
                 const mainAvatar = resolveImg(selected.value.avatar_path) || 'https://ui-avatars.com/api/?name='+selected.value.full_name;
                 const nodes = [{ id: selected.value.id, label: selected.value.full_name, size: 30, shape: 'circularImage', image: mainAvatar, color: {border: '#2563eb'} }];
                 const edges = [];
                 selected.value.relationships.forEach(r => {
                    const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                    const targetAvatar = resolveImg(r.target_avatar) || 'https://ui-avatars.com/api/?name='+r.target_name;
                    nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, shape: 'circularImage', image: targetAvatar, color: {border: '#cbd5e1'} });
                    edges.push({ from: selected.value.id, to: targetId || 'ext-'+r.id, label: r.subject_a_id === selected.value.id ? r.relationship_type : (r.role_b || r.relationship_type), font: { align: 'middle' } });
                 });
                 new vis.Network(container, { nodes, edges }, { nodes: { borderWidth: 3 }, edges: { color: '#94a3b8' } });
            });
        });

        watch(currentTab, (val) => {
             if(val === 'map') nextTick(async () => { mapData.value = await api('/map-data'); initMap('warRoomMap', mapData.value); });
             if(val === 'network') nextTick(async () => {
                const data = await api('/global-network');
                const container = document.getElementById('globalNetworkGraph');
                data.nodes.forEach(n => { 
                    n.image = resolveImg(n.image) || 'https://ui-avatars.com/api/?name='+n.label;
                    n.color = { border: n.group === 'Critical' ? '#ef4444' : '#e2e8f0', background: '#fff' };
                });
                new vis.Network(container, data, { nodes: { shape: 'circularImage', borderWidth: 2 }, edges: { color: '#94a3b8' } });
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
            mapData, mapSearchQuery, updateMapFilter, filteredMapData, presets, applyPreset, autoFillReciprocal, toasts, quickAppend, exportData, submitMediaLink
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
