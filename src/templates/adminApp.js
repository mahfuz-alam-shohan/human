// --- Frontend: Main Admin App ---

export function serveAdminHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-full">
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
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
            primary: { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' }
          },
          fontFamily: { sans: ['Inter', 'sans-serif'] }
        }
      }
    }
  </script>
  <style>
    /* Base & Reset */
    body { font-family: 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; }
    
    /* Modern Card Styles */
    .card { 
        @apply bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm transition-all;
    }
    .card-hover { @apply hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700; }
    
    /* Inputs */
    .input-field { 
        @apply w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder:text-slate-400;
    }

    /* Scrollbars */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { @apply bg-slate-300 dark:bg-slate-700 rounded-full; }
    ::-webkit-scrollbar-track { background: transparent; }

    /* Utilities */
    .safe-pb { padding-bottom: env(safe-area-inset-bottom); }
    .animate-fade-in { animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* Maps & Vis */
    .avatar-marker img { @apply w-full h-full rounded-full object-cover border-2 border-white dark:border-slate-800 shadow-md transition-transform duration-300 hover:scale-110 hover:z-50; }
    .vis-network { outline: none; }
  </style>
</head>
<body class="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 h-full overflow-hidden selection:bg-primary-500/20">
  <div id="app" class="h-full flex flex-col">

    <!-- TOAST NOTIFICATIONS -->
    <div class="fixed top-4 right-4 z-[200] space-y-2 pointer-events-none">
        <transition-group enter-active-class="transition ease-out duration-300" enter-from-class="transform translate-x-full opacity-0" enter-to-class="transform translate-x-0 opacity-100" leave-active-class="transition ease-in duration-200" leave-from-class="transform translate-x-0 opacity-100" leave-to-class="transform translate-x-full opacity-0">
            <div v-for="t in toasts" :key="t.id" :class="['pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium min-w-[300px]', t.type === 'error' ? 'bg-white dark:bg-slate-900 border-red-200 text-red-600' : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-700 dark:text-slate-200']">
                <i :class="['fa-solid text-lg', t.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check text-green-500']"></i>
                <div class="flex-1">{{ t.msg }}</div>
                <button @click="removeToast(t.id)" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </transition-group>
    </div>

    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 relative">
        <div class="w-full max-w-sm card p-8 relative z-10 animate-slide-up">
            <div class="text-center mb-8">
                <div class="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4 text-white text-2xl shadow-lg shadow-primary-500/30">
                    <i class="fa-solid fa-fingerprint"></i>
                </div>
                <h1 class="text-2xl font-bold tracking-tight">Access Control</h1>
                <p class="text-slate-500 text-sm mt-1">People OS Intelligence</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Identity" class="input-field" required>
                <input v-model="auth.password" type="password" placeholder="Passcode" class="input-field" required>
                <button type="submit" :disabled="loading" class="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-lg text-sm transition-all shadow-md flex items-center justify-center">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    {{ loading ? 'Authenticating...' : 'Enter System' }}
                </button>
            </form>
        </div>
    </div>

    <!-- MAIN APP LAYOUT -->
    <div v-else class="flex-1 flex h-full overflow-hidden relative">
        
        <!-- SIDEBAR (Desktop) -->
        <aside class="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-20">
            <div class="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800">
                <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white text-sm shadow-sm mr-3">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <span class="font-bold text-lg tracking-tight">People OS</span>
            </div>
            
            <div class="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
                <div class="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">Menu</div>
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="['w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors', currentTab === t.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800']">
                    <i :class="[t.icon, 'w-5 text-center']"></i>
                    {{t.label}}
                </button>
            </div>

            <div class="p-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
                 <button @click="toggleTheme" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <i :class="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" class="w-5 text-center"></i>
                    {{ isDark ? 'Light Mode' : 'Dark Mode' }}
                </button>
                <button @click="handleLogout" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <i class="fa-solid fa-power-off w-5 text-center"></i>
                    Sign Out
                </button>
            </div>
        </aside>

        <!-- MOBILE HEADER -->
        <header class="md:hidden absolute top-0 inset-x-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-30">
             <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white text-sm">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <span class="font-bold text-lg">People OS</span>
            </div>
             <button @click="openModal('cmd')" class="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-magnifying-glass"></i></button>
        </header>

        <!-- CONTENT AREA -->
        <main class="flex-1 flex flex-col relative overflow-hidden pt-16 md:pt-0 pb-[70px] md:pb-0">
            
            <!-- HEADER (Desktop Only) -->
            <header class="hidden md:flex h-16 items-center justify-between px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <h2 class="font-bold text-lg capitalize">{{ currentTab === 'detail' ? (selected?.full_name || 'Profile') : currentTab }}</h2>
                <div class="flex items-center gap-3">
                    <div class="relative group">
                        <i class="fa-solid fa-search absolute left-3 top-2.5 text-slate-400 text-sm"></i>
                        <input @click="openModal('cmd')" readonly placeholder="Search (Cmd+K)" class="pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm w-64 cursor-pointer hover:bg-slate-200 transition-colors focus:ring-0">
                    </div>
                    <button @click="openModal('add-subject')" class="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-transform active:scale-95 flex items-center gap-2">
                        <i class="fa-solid fa-plus"></i> New Profile
                    </button>
                </div>
            </header>

            <!-- VIEW: DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8">
                <div class="max-w-6xl mx-auto space-y-6 animate-fade-in">
                    <!-- Stats -->
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div class="card p-5 flex items-center gap-4 border-l-4 border-blue-500">
                            <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl"><i class="fa-solid fa-users"></i></div>
                            <div>
                                <div class="text-2xl font-bold">{{ stats.targets || 0 }}</div>
                                <div class="text-xs text-slate-500 font-bold uppercase tracking-wide">Profiles</div>
                            </div>
                        </div>
                        <div class="card p-5 flex items-center gap-4 border-l-4 border-amber-500">
                             <div class="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xl"><i class="fa-solid fa-comments"></i></div>
                            <div>
                                <div class="text-2xl font-bold">{{ stats.encounters || 0 }}</div>
                                <div class="text-xs text-slate-500 font-bold uppercase tracking-wide">Events</div>
                            </div>
                        </div>
                        <div class="card p-5 flex items-center gap-4 border-l-4 border-emerald-500">
                             <div class="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xl"><i class="fa-solid fa-file-contract"></i></div>
                            <div>
                                <div class="text-2xl font-bold">{{ stats.evidence || 0 }}</div>
                                <div class="text-xs text-slate-500 font-bold uppercase tracking-wide">Files</div>
                            </div>
                        </div>
                         <button @click="openModal('add-subject')" class="card p-5 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 border-dashed border-2 border-slate-300 dark:border-slate-700 cursor-pointer group">
                             <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-primary-600 group-hover:text-white transition-colors"><i class="fa-solid fa-plus"></i></div>
                             <span class="text-xs font-bold uppercase text-slate-500">Quick Add</span>
                        </button>
                    </div>

                    <!-- Recent Activity -->
                    <div class="card overflow-hidden">
                        <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                            <h3 class="font-bold text-slate-700 dark:text-slate-200">Recent Intelligence</h3>
                            <button @click="fetchData" class="text-slate-400 hover:text-primary-600"><i class="fa-solid fa-rotate-right"></i></button>
                        </div>
                        <div class="divide-y divide-slate-100 dark:divide-slate-800">
                             <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer flex gap-4 transition-colors">
                                <div class="mt-1">
                                    <div class="w-2 h-2 rounded-full bg-primary-500"></div>
                                </div>
                                <div>
                                    <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ item.title }}</div>
                                    <p class="text-sm text-slate-500 line-clamp-1">{{ item.desc }}</p>
                                    <div class="text-xs text-slate-400 mt-1 font-mono">{{ new Date(item.date).toLocaleDateString() }}</div>
                                </div>
                            </div>
                             <div v-if="!feed.length" class="p-8 text-center text-slate-400">No recent activity found.</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- VIEW: TARGETS -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col h-full">
                <!-- Toolbar -->
                <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-3 sticky top-0 z-10 shadow-sm">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-search absolute left-3 top-2.5 text-slate-400 text-sm"></i>
                        <input v-model="search" placeholder="Filter profiles..." class="input-field pl-9 py-2">
                    </div>
                    <div class="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                        <button @click="listView = false" :class="['px-3 py-1.5 rounded-md text-sm transition-all', !listView ? 'bg-white dark:bg-slate-700 shadow text-primary-600' : 'text-slate-500']"><i class="fa-solid fa-grid-2"></i></button>
                        <button @click="listView = true" :class="['px-3 py-1.5 rounded-md text-sm transition-all', listView ? 'bg-white dark:bg-slate-700 shadow text-primary-600' : 'text-slate-500']"><i class="fa-solid fa-list"></i></button>
                    </div>
                </div>

                <!-- Grid View -->
                <div v-if="!listView" class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="card p-4 cursor-pointer card-hover group flex items-center gap-4">
                         <div class="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                            <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center text-slate-500 font-bold text-lg">{{ s.full_name.charAt(0) }}</div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-bold text-slate-900 dark:text-white truncate">{{ s.full_name }}</div>
                            <div class="text-xs text-slate-500 truncate">{{ s.occupation || 'Unknown' }}</div>
                            <div class="mt-2 flex items-center gap-2">
                                <span :class="['w-2 h-2 rounded-full', getThreatColor(s.threat_level, true)]"></span>
                                <span class="text-[10px] uppercase font-bold text-slate-400">{{ s.threat_level }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- List View -->
                <div v-else class="flex-1 overflow-y-auto p-4">
                    <div class="card overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 dark:bg-slate-800 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th class="px-6 py-3">Name</th>
                                    <th class="px-6 py-3 hidden md:table-cell">Occupation</th>
                                    <th class="px-6 py-3 hidden sm:table-cell">Status</th>
                                    <th class="px-6 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                <tr v-for="s in filteredSubjects" :key="s.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" @click="viewSubject(s.id)">
                                    <td class="px-6 py-3">
                                        <div class="flex items-center gap-3">
                                             <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                                                <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover">
                                                <div v-else class="w-full h-full flex items-center justify-center text-slate-500 text-xs font-bold">{{ s.full_name.charAt(0) }}</div>
                                            </div>
                                            <span class="font-semibold text-slate-900 dark:text-slate-100">{{ s.full_name }}</span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-3 text-slate-500 hidden md:table-cell">{{ s.occupation || '-' }}</td>
                                    <td class="px-6 py-3 hidden sm:table-cell"><span :class="['px-2 py-0.5 rounded text-xs font-bold border', getThreatBadge(s.threat_level)]">{{ s.threat_level }}</span></td>
                                    <td class="px-6 py-3 text-slate-400"><i class="fa-solid fa-chevron-right"></i></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- VIEW: MAP (Active) -->
            <div v-if="currentTab === 'map'" class="flex-1 relative bg-slate-100 dark:bg-slate-900">
                 <div class="absolute inset-0 z-0" id="warRoomMap"></div>
                  <!-- Map Overlay -->
                 <div class="absolute top-4 left-4 z-[400] card p-2 flex items-center gap-2">
                    <i class="fa-solid fa-location-dot text-primary-500 ml-2"></i>
                    <input v-model="mapSearchQuery" @input="updateMapFilter" placeholder="Filter locations..." class="bg-transparent border-none text-sm focus:ring-0 w-48">
                 </div>
                 
                 <!-- Active Locations Sidebar (Restored) -->
                 <div class="absolute top-16 left-4 bottom-4 w-72 card z-[400] flex flex-col overflow-hidden shadow-2xl transition-transform duration-300" :class="{'translate-x-0': showMapSidebar, '-translate-x-[120%]': !showMapSidebar}">
                    <div class="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur">
                        <h3 class="font-bold text-xs text-slate-500 uppercase">Active Points</h3>
                        <div class="text-[10px] font-mono bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">{{filteredMapData.length}}</div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 space-y-1">
                        <div v-for="loc in filteredMapData" @click="flyToGlobal(loc)" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors flex items-center gap-3">
                             <div class="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 shrink-0">
                                <img :src="resolveImg(loc.avatar_path)" class="w-full h-full object-cover">
                             </div>
                             <div class="min-w-0">
                                <div class="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{{loc.full_name}}</div>
                                <div class="text-[10px] text-slate-500 truncate">{{loc.name}}</div>
                             </div>
                        </div>
                    </div>
                </div>
                <button @click="showMapSidebar = !showMapSidebar" class="absolute top-16 left-4 z-[401] bg-white dark:bg-slate-800 p-2 rounded-full shadow text-slate-500 border border-slate-200 dark:border-slate-700" v-if="!showMapSidebar"><i class="fa-solid fa-list-ul"></i></button>
            </div>

            <!-- VIEW: NETWORK (Active) -->
            <div v-if="currentTab === 'network'" class="flex-1 relative bg-slate-50 dark:bg-slate-950">
                <div class="absolute top-4 left-4 z-10 card px-4 py-2 shadow-sm">
                    <h3 class="font-bold text-sm text-slate-700 dark:text-slate-200">Global Relations</h3>
                </div>
                <div id="globalNetworkGraph" class="w-full h-full"></div>
            </div>

            <!-- VIEW: DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950">
                 <div class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10">
                    <div class="px-4 py-3 flex items-center justify-between">
                         <div class="flex items-center gap-3">
                            <button @click="changeTab('targets')" class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"><i class="fa-solid fa-arrow-left"></i></button>
                            <div>
                                <h1 class="font-bold text-lg leading-tight">{{ selected.full_name }}</h1>
                                <div class="text-xs text-slate-500">{{ selected.occupation || 'No Occupation' }}</div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                             <button @click="openModal('edit-profile')" class="p-2 text-slate-500 hover:text-primary-600 transition-colors" title="Edit"><i class="fa-solid fa-pen"></i></button>
                             <button @click="openModal('share-secure')" class="p-2 text-slate-500 hover:text-primary-600 transition-colors" title="Share"><i class="fa-solid fa-share-nodes"></i></button>
                             <button @click="deleteProfile" class="p-2 text-slate-500 hover:text-red-600 transition-colors" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <!-- Sub Tabs -->
                    <div class="flex overflow-x-auto px-4 gap-6 no-scrollbar">
                        <button v-for="t in ['Overview', 'Attributes', 'Timeline', 'Map', 'Network', 'Files']" 
                        @click="changeSubTab(t.toLowerCase())" 
                        :class="['pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', subTab === t.toLowerCase() ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700']">
                        {{ t }}
                        </button>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-4 md:p-8">
                     <!-- Overview -->
                    <div v-if="subTab === 'overview'" class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                        <div class="space-y-6">
                            <div class="card p-1 relative group overflow-hidden">
                                <div class="aspect-[4/5] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                </div>
                                <button @click="triggerUpload('avatar')" class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-medium transition-all backdrop-blur-sm"><i class="fa-solid fa-camera mr-2"></i> Update Photo</button>
                            </div>
                            <div class="card p-4">
                                <div class="text-xs font-bold text-slate-400 uppercase mb-2">Threat Assessment</div>
                                <select v-model="selected.threat_level" @change="saveThreat" class="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
                                    <option value="Low">Low Priority</option>
                                    <option value="Medium">Medium Priority</option>
                                    <option value="High">High Priority</option>
                                    <option value="Critical">Critical</option>
                                </select>
                            </div>
                        </div>
                        <div class="md:col-span-2 space-y-6">
                            <div class="card p-6 border-l-4 border-primary-500">
                                <h3 class="font-bold text-primary-700 dark:text-primary-400 mb-2">Analysis Summary</h3>
                                <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{{ analysisResult?.summary }}</p>
                                <div class="flex gap-2 mt-4">
                                    <span v-for="tag in analysisResult?.tags" class="px-2 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs rounded font-bold border border-primary-100 dark:border-primary-800">{{tag}}</span>
                                </div>
                            </div>
                            <div class="card p-6">
                                <h3 class="font-bold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">Vitals & Identity</h3>
                                <div class="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                    <div><label class="block text-xs text-slate-400 uppercase font-bold">Full Name</label><div class="font-medium mt-1">{{selected.full_name}}</div></div>
                                    <div><label class="block text-xs text-slate-400 uppercase font-bold">Alias</label><div class="font-medium mt-1">{{selected.alias || '-'}}</div></div>
                                    <div><label class="block text-xs text-slate-400 uppercase font-bold">Nationality</label><div class="font-medium mt-1">{{selected.nationality || '-'}}</div></div>
                                    <div><label class="block text-xs text-slate-400 uppercase font-bold">Occupation</label><div class="font-medium mt-1">{{selected.occupation || '-'}}</div></div>
                                    <div><label class="block text-xs text-slate-400 uppercase font-bold">Age/DOB</label><div class="font-medium mt-1">{{selected.age ? selected.age + ' years' : ''}} {{selected.dob ? '('+selected.dob+')' : ''}}</div></div>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div class="card p-5">
                                    <h4 class="text-xs font-bold text-slate-400 uppercase mb-3">Modus Operandi</h4>
                                    <p class="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{{selected.modus_operandi || 'No data recorded.'}}</p>
                                </div>
                                <div class="card p-5 border-l-4 border-red-400/50">
                                    <h4 class="text-xs font-bold text-slate-400 uppercase mb-3">Vulnerabilities</h4>
                                    <p class="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{{selected.weakness || 'No data recorded.'}}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Other Detail Tabs -->
                    <div v-if="subTab === 'timeline'" class="max-w-4xl mx-auto space-y-4">
                        <div class="flex justify-between items-center">
                            <h3 class="font-bold text-lg">Interaction Log</h3>
                            <button @click="openModal('add-interaction')" class="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-sm font-bold">Log Event</button>
                        </div>
                        <div class="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 space-y-8 my-6">
                            <div v-for="ix in selected.interactions" :key="ix.id" class="relative">
                                <div class="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 border-primary-500"></div>
                                <div class="card p-4 group">
                                    <div class="flex justify-between items-start mb-2">
                                        <div class="font-bold text-primary-600 text-sm">{{ix.type}}</div>
                                        <div class="flex items-center gap-3">
                                            <span class="text-xs text-slate-400">{{new Date(ix.date).toLocaleString()}}</span>
                                            <button @click="deleteItem('subject_interactions', ix.id)" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                    <p class="text-sm text-slate-700 dark:text-slate-300">{{ix.transcript || ix.conclusion}}</p>
                                </div>
                            </div>
                            <div v-if="!selected.interactions.length" class="text-slate-400 italic text-sm">No history recorded.</div>
                        </div>
                    </div>

                     <div v-if="subTab === 'attributes'" class="max-w-5xl mx-auto space-y-6">
                        <div class="flex justify-between items-center">
                            <h3 class="font-bold text-lg">Data Points</h3>
                            <button @click="openModal('add-intel')" class="bg-primary-600 text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm">Add Data</button>
                        </div>
                        <div v-for="(items, category) in groupedIntel" :key="category">
                            <h4 class="text-xs font-bold uppercase text-slate-400 mb-3 ml-1">{{ category }}</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                <div v-for="item in items" :key="item.id" class="card p-3 relative group">
                                    <div class="text-[10px] text-primary-600 font-bold uppercase mb-1">{{item.label}}</div>
                                    <div class="text-sm font-medium break-words">{{item.value}}</div>
                                    <button @click="deleteItem('subject_intel', item.id)" class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 p-1"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Files -->
                    <div v-if="subTab === 'files'" class="space-y-6">
                        <div class="flex gap-4">
                             <div @click="triggerUpload('media')" class="w-32 h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:border-primary-500 hover:text-primary-500 cursor-pointer transition-colors bg-white dark:bg-slate-900">
                                <i class="fa-solid fa-cloud-arrow-up text-2xl mb-1"></i>
                                <span class="text-xs font-bold uppercase">Upload</span>
                            </div>
                             <div @click="openModal('add-media-link')" class="w-32 h-32 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors bg-white dark:bg-slate-900">
                                <i class="fa-solid fa-link text-xl mb-1"></i>
                                <span class="text-xs font-bold uppercase">Link URL</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                             <div v-for="m in selected.media" :key="m.id" class="card group relative aspect-square overflow-hidden">
                                <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transition-transform group-hover:scale-105" onerror="this.src='https://placehold.co/400?text=IMG'">
                                <div v-else class="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-800"><i class="fa-solid fa-file text-3xl mb-2"></i><span class="text-xs font-bold uppercase">{{m.content_type.split('/')[1]}}</span></div>
                                <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0"></a>
                                <div class="absolute bottom-0 inset-x-0 bg-white/90 dark:bg-slate-900/90 p-2 text-xs font-medium truncate backdrop-blur-sm border-t border-slate-200 dark:border-slate-800">{{m.description}}</div>
                                <button @click.stop="deleteItem('subject_media', m.id)" class="absolute top-1 right-1 bg-white text-red-500 w-6 h-6 rounded-full shadow flex items-center justify-center opacity-0 group-hover:opacity-100 z-20"><i class="fa-solid fa-times text-xs"></i></button>
                            </div>
                        </div>
                    </div>

                    <!-- Map/Network Placeholders for Detail View -->
                    <div v-show="subTab === 'map'" class="h-[600px] flex flex-col md:flex-row gap-4">
                         <div class="flex-1 card overflow-hidden relative">
                             <div id="subjectMap" class="w-full h-full z-0"></div>
                             <button @click="openModal('add-location')" class="absolute top-4 right-4 z-[400] bg-white text-slate-800 px-3 py-1.5 rounded shadow text-sm font-bold border border-slate-200">Add Location</button>
                         </div>
                         <div class="w-64 space-y-2 overflow-y-auto">
                             <div v-for="loc in selected.locations" :key="loc.id" class="card p-3 group relative cursor-pointer hover:border-primary-400" @click="flyTo(loc)">
                                 <div class="font-bold text-sm">{{loc.name}}</div>
                                 <div class="text-xs text-slate-500 truncate">{{loc.address}}</div>
                                 <span class="text-[10px] uppercase font-bold text-slate-400">{{loc.type}}</span>
                                 <button @click.stop="deleteItem('subject_locations', loc.id)" class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100"><i class="fa-solid fa-trash"></i></button>
                             </div>
                         </div>
                    </div>
                    
                     <div v-show="subTab === 'network'" class="h-full flex flex-col">
                         <div v-if="selected.familyReport && selected.familyReport.length" class="mb-6 card p-4 border-l-4 border-purple-500 bg-purple-50/50 dark:bg-purple-900/10">
                             <h4 class="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-3 flex items-center gap-2"><i class="fa-solid fa-people-roof"></i> Family Unit</h4>
                             <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                 <div v-for="fam in selected.familyReport" class="flex items-center gap-2 p-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-purple-300" @click="viewSubject(fam.id)">
                                     <div class="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-slate-200"><img :src="resolveImg(fam.avatar)" class="w-full h-full object-cover"></div>
                                     <div><div class="text-xs font-bold">{{fam.name}}</div><div class="text-[10px] text-slate-500">{{fam.role}}</div></div>
                                 </div>
                             </div>
                         </div>
                         
                         <div class="flex-1 card overflow-hidden relative min-h-[400px]">
                             <div id="relNetwork" class="w-full h-full z-0"></div>
                             <button @click="openModal('add-rel')" class="absolute top-4 right-4 z-[400] bg-white text-slate-800 px-3 py-1.5 rounded shadow text-sm font-bold border border-slate-200">Add Connection</button>
                         </div>
                         
                         <div class="mt-6 space-y-2">
                             <h4 class="text-xs font-bold uppercase text-slate-400">Connection List</h4>
                             <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                 <div v-for="rel in selected.relationships" :key="rel.id" class="card p-3 flex justify-between items-center group">
                                     <div class="flex items-center gap-3">
                                         <div class="w-8 h-8 rounded-full bg-slate-100 overflow-hidden"><img v-if="rel.target_avatar" :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover"><div v-else class="w-full h-full flex items-center justify-center font-bold text-slate-400">{{rel.target_name[0]}}</div></div>
                                         <div><div class="text-sm font-bold">{{rel.target_name}}</div><div class="text-xs text-primary-500">{{rel.relationship_type}} &harr; {{rel.role_b}}</div></div>
                                     </div>
                                     <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <button @click="openModal('edit-rel', rel)" class="text-slate-400 hover:text-primary-500"><i class="fa-solid fa-pen"></i></button>
                                         <button @click="deleteItem('subject_relationships', rel.id)" class="text-slate-400 hover:text-red-500"><i class="fa-solid fa-trash"></i></button>
                                     </div>
                                 </div>
                             </div>
                         </div>
                    </div>

                </div>
            </div>

        </main>

        <!-- MOBILE NAVIGATION -->
        <nav class="md:hidden fixed bottom-0 inset-x-0 h-[70px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-around items-center z-50 safe-pb">
            <button v-for="t in tabs" @click="changeTab(t.id)" :class="['flex flex-col items-center justify-center w-full h-full active:scale-95 transition-transform', currentTab === t.id ? 'text-primary-600' : 'text-slate-400']">
                <i :class="[t.icon, 'text-xl mb-1']"></i>
                <span class="text-[10px] font-medium">{{t.label}}</span>
            </button>
        </nav>

    </div>

    <!-- UNIVERSAL MODAL -->
    <div v-if="modal.active" class="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <!-- Mini Profile (Graph Click) -->
        <div v-if="modal.active === 'mini-profile'" class="w-full max-w-sm card p-6 text-center animate-slide-up relative">
            <button @click="closeModal" class="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-2"><i class="fa-solid fa-xmark"></i></button>
            <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200 mx-auto mb-3"><img :src="resolveImg(modal.data.avatar_path)" class="w-full h-full object-cover"></div>
            <h3 class="font-bold text-lg">{{modal.data.full_name}}</h3>
            <p class="text-sm text-slate-500 mb-4">{{modal.data.occupation}}</p>
            <button @click="viewSubject(modal.data.id)" class="w-full bg-primary-600 text-white font-bold py-2 rounded-lg">View Full Profile</button>
        </div>

        <div v-else class="w-full max-w-lg card bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[90vh] animate-slide-up">
            <div class="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
                <h3 class="font-bold text-lg">{{ modalTitle }}</h3>
                <button @click="closeModal" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="overflow-y-auto p-6 space-y-6">
                 <!-- CMD PALETTE -->
                <div v-if="modal.active === 'cmd'">
                    <input ref="cmdInput" v-model="cmdQuery" placeholder="Search targets..." class="input-field text-lg p-4">
                    <div class="space-y-1 mt-4">
                        <div v-for="res in cmdResults" @click="res.action" class="p-3 rounded-lg hover:bg-primary-50 dark:hover:bg-slate-800 cursor-pointer flex justify-between items-center group">
                             <div><div class="font-bold text-sm">{{res.title}}</div><div class="text-xs text-slate-400">{{res.desc}}</div></div>
                             <i class="fa-solid fa-arrow-right text-slate-300 group-hover:text-primary-500 text-xs"></i>
                        </div>
                    </div>
                </div>

                <!-- DYNAMIC FORMS -->
                <form v-else @submit.prevent="handleFormSubmit" class="space-y-4">
                    
                    <!-- Subject Form -->
                    <div v-if="['add-subject', 'edit-profile'].includes(modal.active)" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <input v-model="forms.subject.full_name" placeholder="Full Name *" class="input-field col-span-2" required>
                            <input v-model="forms.subject.occupation" placeholder="Occupation" list="list-occupations" class="input-field">
                            <input v-model="forms.subject.nationality" placeholder="Nationality" list="list-nationalities" class="input-field">
                            <input v-model="forms.subject.age" type="number" placeholder="Age" class="input-field">
                            <input v-model="forms.subject.dob" type="date" class="input-field">
                        </div>
                        <textarea v-model="forms.subject.modus_operandi" placeholder="Routine & Habits" class="input-field h-24"></textarea>
                        <textarea v-model="forms.subject.weakness" placeholder="Notes & Vulnerabilities" class="input-field h-24"></textarea>
                    </div>

                    <!-- Relationship Form -->
                    <div v-if="['add-rel', 'edit-rel'].includes(modal.active)" class="space-y-4">
                        <select v-if="modal.active === 'add-rel'" v-model="forms.rel.targetId" class="input-field" required>
                            <option value="" disabled selected>Select Person</option>
                            <option v-for="s in subjects" :value="s.id" v-show="s.id !== selected.id">{{s.full_name}}</option>
                        </select>
                        <div class="grid grid-cols-2 gap-4">
                            <div><label class="text-xs font-bold text-slate-400 block mb-1">Role of {{selected.full_name}}</label><input v-model="forms.rel.type" class="input-field" placeholder="e.g. Father" @input="autoFillReciprocal"></div>
                            <div><label class="text-xs font-bold text-slate-400 block mb-1">Role of Target</label><input v-model="forms.rel.reciprocal" class="input-field" placeholder="e.g. Son"></div>
                        </div>
                        <div class="flex flex-wrap gap-2"><span v-for="p in presets" @click="applyPreset(p)" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs cursor-pointer hover:bg-primary-100 hover:text-primary-600 border border-slate-200">{{p.a}} &harr; {{p.b}}</span></div>
                    </div>

                    <!-- Interaction Form -->
                    <div v-if="modal.active === 'add-interaction'" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                             <input type="datetime-local" v-model="forms.interaction.date" class="input-field" required>
                             <select v-model="forms.interaction.type" class="input-field"><option>Meeting</option><option>Call</option><option>Observation</option><option>Email</option></select>
                        </div>
                        <textarea v-model="forms.interaction.transcript" placeholder="Notes..." class="input-field h-32"></textarea>
                    </div>

                    <!-- Location Form (With Map Picker) -->
                    <div v-if="modal.active === 'add-location'" class="space-y-4">
                        <div class="relative">
                            <input v-model="locationSearchQuery" @input="debounceSearch" placeholder="Search address..." class="input-field pl-9">
                            <i class="fa-solid fa-search absolute left-3 top-3 text-slate-400"></i>
                            <div v-if="locationSearchResults.length" class="absolute w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg max-h-40 overflow-y-auto divide-y z-50 shadow-xl mt-1"><div v-for="r in locationSearchResults" @click="selectLocation(r)" class="p-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">{{r.display_name}}</div></div>
                        </div>
                        <div id="locationPickerMap" class="h-40 w-full rounded-lg bg-slate-100 border border-slate-200"></div>
                        <input v-model="forms.location.name" placeholder="Location Name (e.g. Safehouse)" class="input-field">
                        <select v-model="forms.location.type" class="input-field"><option>Residence</option><option>Workplace</option><option>Frequent</option></select>
                    </div>

                    <!-- Intel Form -->
                    <div v-if="modal.active === 'add-intel'" class="space-y-4">
                        <select v-model="forms.intel.category" class="input-field"><option>General</option><option>Contact Info</option><option>Digital</option><option>Financial</option><option>Medical</option></select>
                        <input v-model="forms.intel.label" placeholder="Label (e.g. Phone)" class="input-field">
                        <input v-model="forms.intel.value" placeholder="Value" class="input-field">
                    </div>

                    <!-- Share Form -->
                    <div v-if="modal.active === 'share-secure'" class="space-y-4">
                        <div class="flex gap-2">
                            <select v-model="forms.share.minutes" class="input-field w-32"><option :value="30">30 Mins</option><option :value="60">1 Hour</option><option :value="1440">24 Hours</option><option :value="10080">7 Days</option></select>
                            <button type="button" @click="createShareLink" class="flex-1 bg-primary-600 text-white font-bold rounded-lg shadow">Generate Link</button>
                        </div>
                        <div class="space-y-2 max-h-40 overflow-y-auto">
                            <div v-for="link in activeShareLinks" class="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
                                <div><div class="font-mono text-xs">{{link.token.slice(0,8)}}...</div><div class="text-[10px] text-slate-400">{{link.is_active ? 'Active' : 'Expired'}}</div></div>
                                <div class="flex gap-2"><button type="button" @click="copyToClipboard(getShareUrl(link.token))" class="text-primary-600"><i class="fa-regular fa-copy"></i></button><button type="button" @click="revokeLink(link.token)" class="text-red-500"><i class="fa-solid fa-ban"></i></button></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Media Link Form -->
                    <div v-if="modal.active === 'add-media-link'" class="space-y-4">
                        <input v-model="forms.mediaLink.url" placeholder="URL *" class="input-field" required>
                        <input v-model="forms.mediaLink.description" placeholder="Description" class="input-field">
                        <select v-model="forms.mediaLink.type" class="input-field"><option value="image/jpeg">Image</option><option value="application/pdf">Document</option><option value="video/mp4">Video</option></select>
                    </div>

                    <!-- Submit Button -->
                    <button v-if="modal.active !== 'share-secure'" type="submit" :disabled="processing" class="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg shadow-sm flex items-center justify-center">
                        <i v-if="processing" class="fa-solid fa-circle-notch fa-spin mr-2"></i> {{ processing ? 'Processing...' : 'Save Changes' }}
                    </button>
                </form>
            </div>
        </div>
    </div>

    <!-- Hidden Utils -->
    <input type="file" ref="fileInput" class="hidden" @change="handleFile">
    <datalist id="list-occupations"><option v-for="i in suggestions.occupations" :value="i"></option></datalist>
    <datalist id="list-nationalities"><option v-for="i in suggestions.nationalities" :value="i"></option></datalist>

  </div>

  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    const PRESETS = [
        { a: 'Father', b: 'Child' }, { a: 'Mother', b: 'Child' }, { a: 'Parent', b: 'Child' },
        { a: 'Son', b: 'Parent' }, { a: 'Daughter', b: 'Parent' }, { a: 'Brother', b: 'Sibling' },
        { a: 'Husband', b: 'Wife' }, { a: 'Spouse', b: 'Spouse' }, { a: 'Associate', b: 'Associate' }
    ];

    createApp({
      setup() {
        const view = ref('auth');
        const isDark = ref(false);
        const loading = ref(false);
        const processing = ref(false); 
        const auth = reactive({ email: '', password: '' });
        const tabs = [
            { id: 'dashboard', icon: 'fa-solid fa-chart-pie', label: 'Dashboard' },
            { id: 'targets', icon: 'fa-solid fa-users', label: 'Targets' },
            { id: 'map', icon: 'fa-solid fa-map-location-dot', label: 'Map' },
            { id: 'network', icon: 'fa-solid fa-circle-nodes', label: 'Network' },
        ];
        
        const currentTab = ref('dashboard');
        const subTab = ref('overview');
        const listView = ref(false);
        const toasts = ref([]);
        const showMapSidebar = ref(true);
        const activeShareLinks = ref([]);
        
        // Data Refs
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const suggestions = reactive({ occupations: [], nationalities: [] });
        const selected = ref(null);
        const search = ref('');
        const modal = reactive({ active: null, data: null });
        const analysisResult = ref(null);
        const mapData = ref([]);
        
        // Search & Maps
        const cmdQuery = ref('');
        const cmdInput = ref(null);
        const mapSearchQuery = ref('');
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        let searchTimeout = null;
        let mapInstances = {};
        let pickerMapInstance = null;

        // Forms
        const forms = reactive({
            subject: {}, interaction: {}, location: {}, intel: {}, rel: { type: '', reciprocal: '' }, share: { minutes: 60 }, mediaLink: {}
        });

        // --- THEME LOGIC ---
        const toggleTheme = () => {
            isDark.value = !isDark.value;
            if (isDark.value) document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
        };

        // --- TOAST LOGIC ---
        const notify = (msg, type = 'success') => {
            const id = Date.now();
            toasts.value.push({ id, msg, type });
            setTimeout(() => removeToast(id), 3000);
        };
        const removeToast = (id) => { toasts.value = toasts.value.filter(t => t.id !== id); };

        // --- AUTH & INIT ---
        const api = async (ep, opts = {}) => {
            try {
                const res = await fetch('/api' + ep, opts);
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                return data;
            } catch(e) { notify(e.message, 'error'); throw e; }
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

        // --- VIEW LOGIC ---
        const changeTab = (t) => { currentTab.value = t; if(t==='map') loadMapData(); if(t==='network') loadNetworkData(); };
        const changeSubTab = (t) => { subTab.value = t; if(t==='map') nextTick(() => initLeaflet('subjectMap', selected.value.locations)); if(t==='network') nextTick(() => initVis('relNetwork', selected.value)); };
        
        const viewSubject = async (id) => {
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            subTab.value = 'overview';
            analysisResult.value = analyzeLocal(selected.value);
            closeModal();
        };

        const analyzeLocal = (s) => {
             const points = (s.intel?.length || 0) + (s.interactions?.length || 0);
             const completeness = Math.min(100, Math.floor(points * 5));
             return { summary: \`Profile completeness: \${completeness}%. \${s.interactions?.length} recorded events.\`, tags: s.threat_level === 'Critical' ? ['High Priority'] : [] };
        };

        // --- MAPS ---
        const loadMapData = async () => {
            mapData.value = await api('/map-data?adminId=' + localStorage.getItem('admin_id'));
            nextTick(() => initLeaflet('warRoomMap', mapData.value, true));
        };

        const filteredMapData = computed(() => {
            if (!mapSearchQuery.value) return mapData.value;
            const q = mapSearchQuery.value.toLowerCase();
            return mapData.value.filter(d => d.full_name.toLowerCase().includes(q) || d.name.toLowerCase().includes(q));
        });

        const flyToGlobal = (loc) => { if(mapInstances['warRoomMap']) mapInstances['warRoomMap'].flyTo([loc.lat, loc.lng], 16); };
        const flyTo = (loc) => { if(mapInstances['subjectMap']) mapInstances['subjectMap'].flyTo([loc.lat, loc.lng], 16); };

        const initLeaflet = (id, data, isGlobal = false, isPicker = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            // Clean up existing map
            if (id === 'locationPickerMap' && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; }
            else if (mapInstances[id]) { mapInstances[id].remove(); delete mapInstances[id]; }
            
            const map = L.map(id, { attributionControl: false, zoomControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
            L.control.zoom({ position: 'bottomright' }).addTo(map);
            
            if(isPicker) {
                pickerMapInstance = map;
                map.on('click', e => {
                    forms.location.lat = e.latlng.lat;
                    forms.location.lng = e.latlng.lng;
                    map.eachLayer(l => { if(l instanceof L.Marker) map.removeLayer(l); });
                    L.marker(e.latlng).addTo(map);
                });
            } else {
                const bounds = [];
                data.forEach(loc => {
                    if (loc.lat) {
                        const latlng = [loc.lat, loc.lng];
                        bounds.push(latlng);
                        const avatar = isGlobal ? loc.avatar_path : (selected.value?.avatar_path);
                        const name = isGlobal ? loc.full_name : selected.value?.full_name;
                        const html = \`<div class="avatar-marker w-10 h-10"><img src="\${resolveImg(avatar) || 'https://ui-avatars.com/api/?name='+name}"></div>\`;
                        L.marker(latlng, { icon: L.divIcon({ html, className: '', iconSize: [40,40] }) }).addTo(map).bindPopup(\`<b>\${loc.name}</b><br>\${name}\`);
                    }
                });
                if (bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
                mapInstances[id] = map;
            }
        };

        // --- NETWORK ---
        const loadNetworkData = async () => {
            const data = await api('/global-network?adminId=' + localStorage.getItem('admin_id'));
            nextTick(() => {
                const container = document.getElementById('globalNetworkGraph');
                const options = {
                    nodes: { shape: 'circularImage', size: 25, borderWidth: 2, color: { border: '#e2e8f0', background: '#fff' } },
                    edges: { color: { color: '#cbd5e1' }, width: 1 },
                    interaction: { hover: true }
                };
                data.nodes.forEach(n => n.image = resolveImg(n.image) || 'https://ui-avatars.com/api/?name='+n.label);
                const network = new vis.Network(container, data, options);
                network.on("click", (p) => {
                    if(p.nodes.length) {
                        const n = data.nodes.find(x => x.id === p.nodes[0]);
                        if(n) { modal.data = { id: n.id, full_name: n.label, occupation: n.occupation, avatar_path: n.image }; modal.active = 'mini-profile'; }
                    }
                });
            });
        };
        
        const initVis = (id, subject) => {
             const container = document.getElementById(id);
             if(!container || !subject) return;
             const mainAvatar = resolveImg(subject.avatar_path) || 'https://ui-avatars.com/api/?name='+subject.full_name;
             const nodes = [{ id: subject.id, label: subject.full_name, shape: 'circularImage', image: mainAvatar, size: 30 }];
             const edges = [];
             subject.relationships.forEach(r => {
                 const tid = r.subject_a_id === subject.id ? r.subject_b_id : r.subject_a_id;
                 const tAvatar = resolveImg(r.target_avatar) || 'https://ui-avatars.com/api/?name='+r.target_name;
                 nodes.push({ id: tid, label: r.target_name, shape: 'circularImage', image: tAvatar });
                 edges.push({ from: subject.id, to: tid });
             });
             new vis.Network(container, { nodes, edges }, { nodes: { borderWidth: 2 }, interaction: { hover: true } });
        };

        // --- MODALS & FORMS ---
        const openModal = (t, d=null) => { 
            modal.active = t; 
            if(t==='add-subject') forms.subject = { admin_id: localStorage.getItem('admin_id'), threat_level: 'Low', status: 'Active' };
            if(t==='edit-profile') forms.subject = { ...selected.value };
            if(t==='add-interaction') forms.interaction = { subject_id: selected.value.id, date: new Date().toISOString().slice(0,16) };
            if(t==='add-location') { forms.location = { subject_id: selected.value.id }; locationSearchQuery.value = ''; locationSearchResults.value = []; nextTick(() => initLeaflet('locationPickerMap', [], false, true)); }
            if(t==='add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' };
            if(t==='add-rel') forms.rel = { subjectA: selected.value.id, type: '', reciprocal: '' };
            if(t==='edit-rel' && d) { 
                forms.rel = { id: d.id, subjectA: selected.value.id, targetId: d.subject_a_id === selected.value.id ? d.subject_b_id : d.subject_a_id, type: d.subject_a_id === selected.value.id ? d.relationship_type : d.role_b, reciprocal: d.subject_a_id === selected.value.id ? d.role_b : d.relationship_type };
            }
            if(t==='share-secure') fetchShareLinks();
            if(t==='add-media-link') forms.mediaLink = { subjectId: selected.value.id, type: 'image/jpeg' };
            if(t==='cmd') nextTick(() => cmdInput.value?.focus());
        };
        const closeModal = () => { modal.active = null; };

        const handleFormSubmit = async () => {
            if (processing.value) return; 
            processing.value = true;
            try {
                if(modal.active === 'add-subject' || modal.active === 'edit-profile') {
                    const isEdit = modal.active === 'edit-profile';
                    const ep = isEdit ? '/subjects/' + selected.value.id : '/subjects';
                    await api(ep, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(forms.subject) });
                    if(isEdit) selected.value = { ...selected.value, ...forms.subject }; else fetchData();
                } else if(modal.active === 'add-interaction') {
                    await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) });
                    viewSubject(selected.value.id);
                } else if(modal.active === 'add-location') {
                    await api('/location', { method: 'POST', body: JSON.stringify(forms.location) });
                    viewSubject(selected.value.id);
                } else if(modal.active === 'add-intel') {
                    await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) });
                    viewSubject(selected.value.id);
                } else if (modal.active === 'add-rel' || modal.active === 'edit-rel') {
                    const method = forms.rel.id ? 'PATCH' : 'POST';
                    const payload = method === 'POST' ? { subjectA: selected.value.id, targetId: forms.rel.targetId, type: forms.rel.type, reciprocal: forms.rel.reciprocal } : { id: forms.rel.id, type: forms.rel.type, reciprocal: forms.rel.reciprocal };
                    await api('/relationship', { method, body: JSON.stringify(payload) });
                    viewSubject(selected.value.id);
                } else if(modal.active === 'add-media-link') {
                    await api('/media-link', { method: 'POST', body: JSON.stringify(forms.mediaLink) });
                    viewSubject(selected.value.id);
                }
                notify('Saved successfully');
                if(modal.active !== 'share-secure') closeModal();
            } catch(e) { /* Error handled by api wrapper */ } 
            finally { processing.value = false; }
        };

        // Sharing Logic
        const fetchShareLinks = async () => { activeShareLinks.value = await api('/share-links?subjectId=' + selected.value.id); };
        const createShareLink = async () => { await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes }) }); fetchShareLinks(); };
        const revokeLink = async (t) => { await api('/share-links?token='+t, { method: 'DELETE' }); fetchShareLinks(); };
        const copyToClipboard = (t) => navigator.clipboard.writeText(t);
        const getShareUrl = (t) => window.location.origin + '/share/' + t;

        const deleteItem = async (table, id) => {
             if(confirm('Are you sure?')) { await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) }); viewSubject(selected.value.id); notify('Item deleted'); }
        };
        
        const deleteProfile = async () => {
             if(confirm('Delete entire profile?')) { await api('/delete', { method: 'POST', body: JSON.stringify({ table: 'subjects', id: selected.value.id }) }); fetchData(); changeTab('targets'); notify('Profile deleted'); }
        };
        
        const saveThreat = async () => {
            await api('/subjects/' + selected.value.id, { method: 'PATCH', body: JSON.stringify({ threat_level: selected.value.threat_level }) });
            notify('Threat level updated');
        };

        // Utils for Relationships
        const presets = PRESETS;
        const applyPreset = (p) => { forms.rel.type = p.a; forms.rel.reciprocal = p.b; };
        const autoFillReciprocal = () => { const f = PRESETS.find(p => p.a.toLowerCase() === forms.rel.type.toLowerCase()); if(f) forms.rel.reciprocal = f.b; };

        // --- UTILS ---
        const filteredSubjects = computed(() => subjects.value.filter(s => s.full_name.toLowerCase().includes(search.value.toLowerCase())));
        const cmdResults = computed(() => {
            const q = cmdQuery.value.toLowerCase();
            if(!q) return [];
            return subjects.value.filter(s => s.full_name.toLowerCase().includes(q)).slice(0,5).map(s => ({ title: s.full_name, desc: s.occupation, action: () => { viewSubject(s.id); closeModal(); } }));
        });
        const groupedIntel = computed(() => {
             if(!selected.value?.intel) return {};
             return selected.value.intel.reduce((acc, i) => { (acc[i.category] = acc[i.category] || []).push(i); return acc; }, {});
        });

        const resolveImg = (p) => p ? (p.startsWith('http') ? p : '/api/media/'+p) : null;
        const getThreatColor = (l, bg) => ({ 'Critical': bg?'bg-red-500':'text-red-500', 'High': bg?'bg-orange-500':'text-orange-500', 'Medium': bg?'bg-amber-500':'text-amber-500', 'Low': bg?'bg-emerald-500':'text-emerald-500' }[l] || (bg?'bg-slate-500':'text-slate-500'));
        const getThreatBadge = (l) => ({ 'Critical': 'bg-red-50 text-red-700 border-red-200', 'High': 'bg-orange-50 text-orange-700 border-orange-200', 'Medium': 'bg-amber-50 text-amber-700 border-amber-200', 'Low': 'bg-emerald-50 text-emerald-700 border-emerald-200' }[l]);
        
        const debounceSearch = () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                if(!locationSearchQuery.value) return;
                const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(locationSearchQuery.value)}\`);
                locationSearchResults.value = await res.json();
            }, 500);
        };
        const selectLocation = (r) => { forms.location.lat = parseFloat(r.lat); forms.location.lng = parseFloat(r.lon); forms.location.address = r.display_name; locationSearchResults.value = []; if(pickerMapInstance) { pickerMapInstance.setView([r.lat, r.lon], 15); L.marker([r.lat, r.lon]).addTo(pickerMapInstance); } };
        const modalTitle = computed(() => ({ 'add-subject':'New Profile', 'add-interaction':'Log Event', 'cmd':'Quick Search', 'add-rel': 'New Connection', 'share-secure': 'Share Profile', 'add-location': 'Pin Location' }[modal.active] || 'Edit Data'));

        // File Upload
        const fileInput = ref(null);
        const triggerUpload = (type) => { fileInput.value.click(); };
        const handleFile = async (e) => {
             const f = e.target.files[0];
             if(!f) return;
             const reader = new FileReader();
             reader.readAsDataURL(f);
             reader.onload = async (ev) => {
                 const b64 = ev.target.result.split(',')[1];
                 const ep = modal.active ? '/upload-media' : '/upload-avatar'; 
                 await api(ep, { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, data: b64, filename: f.name, contentType: f.type }) });
                 viewSubject(selected.value.id);
                 notify('Upload complete');
             };
        };

        onMounted(() => {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') { isDark.value = true; document.documentElement.classList.add('dark'); }
            
            if(localStorage.getItem('admin_id')) {
                view.value = 'app';
                fetchData();
            }
        });

        return {
            view, isDark, loading, processing, auth, tabs, currentTab, subTab, listView, stats, feed, subjects, filteredSubjects, selected, search, modal, forms,
            toasts, notify, removeToast, toggleTheme, handleAuth, fetchData, changeTab, changeSubTab, viewSubject, openModal, closeModal, handleFormSubmit,
            deleteItem, deleteProfile, saveThreat, resolveImg, getThreatColor, getThreatBadge, groupedIntel, cmdQuery, cmdResults, cmdInput,
            locationSearchQuery, locationSearchResults, debounceSearch, selectLocation, modalTitle, triggerUpload, handleFile, handleLogout: () => { localStorage.removeItem('admin_id'); location.reload(); },
            mapSearchQuery, updateMapFilter: () => {}, flyToGlobal, flyTo, analysisResult, activeShareLinks, suggestions, presets, applyPreset, autoFillReciprocal,
            showMapSidebar, filteredMapData, fetchShareLinks, createShareLink, revokeLink, copyToClipboard, getShareUrl
        };
      }
    }).mount('#app');
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
