export const ADMIN_APP_BODY = `
<body class="h-[100dvh] overflow-hidden text-slate-900 bg-slate-50 font-sans">
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
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 relative bg-yellow-50 pattern-grid">
        <div class="w-full max-w-sm fun-card p-8 relative z-10 bg-white">
            <div class="text-center mb-8">
                <div class="w-20 h-20 bg-yellow-300 border-4 border-black rounded-full flex items-center justify-center mx-auto mb-4 text-black text-3xl shadow-[4px_4px_0px_#000]">
                    <i class="fa-solid fa-user-secret"></i>
                </div>
                <h1 class="text-4xl font-heading font-black text-black tracking-tight mb-1">PEOPLE OS</h1>
                <div class="text-xs font-bold text-gray-400 tracking-widest uppercase">Intelligence Database</div>
            </div>
            
            <div v-if="auth.reqLocation" class="bg-blue-50 border-2 border-blue-500 rounded-xl p-4 mb-4 text-center animate-pulse">
                <i class="fa-solid fa-location-dot text-3xl text-blue-500 mb-2"></i>
                <div class="text-sm font-bold text-blue-900">Security Check</div>
                <div class="text-xs text-blue-700">Master Admin requires your location to grant access.</div>
            </div>

            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Identifier" class="fun-input w-full p-4 text-lg" required :disabled="auth.reqLocation">
                <input v-model="auth.password" type="password" placeholder="Passcode" class="fun-input w-full p-4 text-lg" required :disabled="auth.reqLocation">
                
                <button v-if="!auth.reqLocation" type="submit" :disabled="loading" class="w-full bg-violet-600 hover:bg-violet-500 text-white font-heading font-bold py-4 rounded-xl text-lg fun-btn flex items-center justify-center">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    {{ loading ? 'Verifying...' : 'Access System' }}
                </button>
                
                <button v-else type="button" @click="retryAuthWithLocation" :disabled="loading" class="w-full bg-blue-500 hover:bg-blue-400 text-white font-heading font-bold py-4 rounded-xl text-lg fun-btn flex items-center justify-center">
                     <i v-if="loading" class="fa-solid fa-satellite-dish fa-spin mr-2"></i>
                     {{ loading ? 'Acquiring GPS...' : 'Share Location & Login' }}
                </button>
            </form>
            <div v-if="auth.error" class="mt-4 text-center text-red-500 font-bold text-sm bg-red-100 p-2 rounded border border-red-200">{{ auth.error }}</div>
        </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
        
        <!-- SIDEBAR -->
        <nav class="hidden md:flex flex-col w-24 bg-white border-r-4 border-black items-center py-6 z-20 shrink-0">
            <div class="mb-8 text-yellow-500 text-4xl drop-shadow-[2px_2px_0px_#000] cursor-pointer hover:scale-110 transition-transform" @click="changeTab('dashboard')"><i class="fa-solid fa-cube"></i></div>
            
            <div class="flex-1 space-y-4 w-full px-3 overflow-y-auto no-scrollbar">
                <button v-for="t in visibleTabs" :key="t.id" @click="changeTab(t.id)" 
                    :class="currentTab === t.id ? 'bg-black text-white shadow-[3px_3px_0px_rgba(0,0,0,0.3)]' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'" 
                    class="w-full aspect-square rounded-2xl border-2 border-black flex flex-col items-center justify-center gap-1 transition-all group active:translate-y-1 active:shadow-none relative">
                    <i :class="t.icon" class="text-xl group-hover:scale-110 transition-transform"></i>
                    <span class="text-[9px] font-heading font-bold uppercase tracking-wider">{{t.label}}</span>
                    <!-- Team Badge -->
                    <div v-if="t.id === 'team'" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></div>
                </button>
            </div>

            <div class="flex flex-col items-center gap-4 w-full px-2 mt-4">
                <div v-if="user.is_master" class="text-[8px] font-black uppercase text-center bg-yellow-300 px-1 py-0.5 rounded border border-black w-full text-black">MASTER</div>
                <div v-else class="text-[8px] font-black uppercase text-center bg-gray-200 px-1 py-0.5 rounded border border-gray-400 w-full text-gray-500">AGENT</div>
                <button @click="handleLogout" class="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-xl transition-colors"><i class="fa-solid fa-power-off text-xl"></i></button>
            </div>
        </nav>

        <!-- CONTENT AREA -->
        <main class="flex-1 relative overflow-hidden flex flex-col pb-20 md:pb-0 safe-area-pb bg-slate-50">

            <!-- TAB: DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8 min-h-0 custom-scrollbar">
                 <div class="max-w-7xl mx-auto space-y-6">
                    <!-- Header -->
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 class="text-4xl font-heading font-black text-black">Command Center</h2>
                            <p class="text-gray-500 font-bold">Welcome back, {{ user.email }}</p>
                        </div>
                        <div class="flex gap-2">
                             <button v-if="canCreate" @click="openModal('add-subject')" class="bg-black text-white px-6 py-3 rounded-xl fun-btn font-bold flex items-center gap-2">
                                <i class="fa-solid fa-plus"></i> New Target
                            </button>
                        </div>
                    </div>

                    <!-- Stats Row -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="fun-card p-4 bg-white flex items-center gap-4">
                            <div class="w-12 h-12 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xl border-2 border-pink-200"><i class="fa-solid fa-users"></i></div>
                            <div><div class="text-3xl font-black">{{ stats.targets || 0 }}</div><div class="text-xs text-gray-500 font-bold uppercase">Subjects</div></div>
                        </div>
                        <div class="fun-card p-4 bg-white flex items-center gap-4">
                            <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl border-2 border-blue-200"><i class="fa-solid fa-eye"></i></div>
                            <div><div class="text-3xl font-black">{{ stats.encounters || 0 }}</div><div class="text-xs text-gray-500 font-bold uppercase">Sightings</div></div>
                        </div>
                        <div class="fun-card p-4 bg-white flex items-center gap-4">
                            <div class="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xl border-2 border-purple-200"><i class="fa-solid fa-file-contract"></i></div>
                            <div><div class="text-3xl font-black">{{ stats.evidence || 0 }}</div><div class="text-xs text-gray-500 font-bold uppercase">Files</div></div>
                        </div>
                         <div class="fun-card p-4 bg-green-100 flex items-center gap-4 border-green-300">
                            <div class="w-12 h-12 rounded-full bg-green-200 text-green-700 flex items-center justify-center text-xl border-2 border-green-400"><i class="fa-solid fa-satellite"></i></div>
                            <div><div class="text-xs font-black text-green-800 uppercase">System Status</div><div class="text-sm font-bold text-green-700">ONLINE</div></div>
                        </div>
                    </div>

                    <!-- Feed -->
                    <div class="fun-card overflow-hidden flex flex-col h-[50vh] border-4 bg-white">
                        <div class="p-4 border-b-4 border-black bg-gray-50 flex justify-between items-center">
                            <h3 class="text-lg font-heading font-black"><i class="fa-solid fa-bell mr-2 text-yellow-500"></i>Intel Feed</h3>
                            <button @click="fetchData" class="text-sm font-bold text-blue-500 hover:underline">Refresh</button>
                        </div>
                        <div class="overflow-y-auto flex-1 bg-white p-2 space-y-2 custom-scrollbar">
                            <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-3 hover:bg-blue-50 cursor-pointer border border-gray-100 rounded-xl flex items-start gap-3 transition-colors group">
                                <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-200 group-hover:text-blue-700 border border-gray-200 shrink-0">
                                    <i v-if="item.type === 'subject'" class="fa-solid fa-user"></i>
                                    <i v-else-if="item.type === 'interaction'" class="fa-solid fa-comments"></i>
                                    <i v-else class="fa-solid fa-map-pin"></i>
                                </div>
                                <div class="flex-1">
                                    <div class="flex justify-between">
                                        <div class="font-black text-black text-sm">{{ item.title }}</div>
                                        <div class="text-[10px] text-gray-400 font-mono">{{ new Date(item.date).toLocaleDateString() }}</div>
                                    </div>
                                    <div class="text-xs text-gray-500 line-clamp-1">{{ item.desc }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB: TEAM (NEW) -->
            <div v-if="currentTab === 'team'" class="flex-1 overflow-y-auto p-4 md:p-8 min-h-0 custom-scrollbar">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="flex justify-between items-center">
                        <div>
                             <h2 class="text-3xl font-heading font-black">Team Command</h2>
                             <p class="text-gray-500">Manage access and surveillance of sub-admins.</p>
                        </div>
                        <button @click="openModal('add-admin')" class="bg-violet-600 text-white px-6 py-3 rounded-xl fun-btn font-bold shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none"><i class="fa-solid fa-user-plus mr-2"></i>Add Admin</button>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div v-for="adm in team" :key="adm.id" class="fun-card p-5 relative bg-white flex flex-col gap-4" :class="{'opacity-60 grayscale': !adm.is_active}">
                            <div class="flex justify-between items-start">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center border-2 border-black text-lg font-black" :class="adm.is_master ? 'bg-yellow-300' : 'bg-gray-200'">{{ adm.email.substring(0,2).toUpperCase() }}</div>
                                    <div class="overflow-hidden">
                                        <div class="font-black text-sm truncate w-32" :title="adm.email">{{adm.email}}</div>
                                        <div class="text-[10px] font-bold text-gray-400">Since {{new Date(adm.created_at).toLocaleDateString()}}</div>
                                    </div>
                                </div>
                                <div v-if="adm.is_master" class="bg-black text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">MASTER</div>
                                <div v-else class="flex gap-2">
                                    <button @click="openModal('edit-admin', adm)" class="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded"><i class="fa-solid fa-pen-to-square"></i></button>
                                    <button @click="deleteAdmin(adm.id)" class="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded"><i class="fa-solid fa-trash-can"></i></button>
                                </div>
                            </div>
                            
                            <div v-if="!adm.is_master" class="bg-gray-50 p-3 rounded-xl border-2 border-gray-100 space-y-2">
                                <div class="flex items-center justify-between border-b border-gray-200 pb-2">
                                    <span class="text-[10px] font-bold uppercase text-gray-400">Status</span>
                                    <div class="flex items-center gap-1">
                                         <div class="w-2 h-2 rounded-full" :class="adm.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'"></div>
                                         <span :class="adm.is_active ? 'text-green-700' : 'text-red-700'" class="font-black text-xs">{{adm.is_active ? 'ACTIVE' : 'DISABLED'}}</span>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-[10px] font-bold uppercase text-gray-400">Location Lock</span>
                                    <span :class="adm.require_location ? 'text-blue-600 bg-blue-100 px-1 rounded' : 'text-gray-400'" class="font-black text-xs">{{adm.require_location ? 'REQUIRED' : 'OFF'}}</span>
                                </div>
                                <div v-if="adm.last_location" class="pt-2 text-[10px] text-gray-500 font-mono text-center bg-white p-1 rounded border border-gray-100 mt-2">
                                    <i class="fa-solid fa-map-pin text-red-500 mr-1"></i>
                                    {{ JSON.parse(adm.last_location).lat.toFixed(4) }}, {{ JSON.parse(adm.last_location).lng.toFixed(4) }}
                                </div>
                            </div>
                            <div v-else class="bg-yellow-50 p-3 rounded-xl border-2 border-yellow-100 text-center text-xs font-bold text-yellow-700">
                                Full System Access
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB: TARGETS -->
            <div v-if="currentTab === 'targets'" class="flex-1 overflow-y-auto p-4 md:p-8 min-h-0 custom-scrollbar">
                 <div class="max-w-7xl mx-auto">
                    <div class="mb-6 flex gap-4">
                        <input v-model="search" placeholder="Search targets by name, alias, or ID..." class="fun-input flex-1 p-3 text-lg bg-white shadow-sm">
                        <select v-model="filterStatus" class="fun-input p-3 bg-white shadow-sm font-bold">
                            <option value="All">All Status</option>
                            <option value="Active">Active</option>
                            <option value="Monitoring">Monitoring</option>
                            <option value="Deceased">Deceased</option>
                            <option value="Incarcerated">Incarcerated</option>
                        </select>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        <!-- Add New Card -->
                        <div v-if="canCreate" @click="openModal('add-subject')" class="fun-card border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center p-6 cursor-pointer hover:bg-gray-100 hover:border-gray-400 transition-all gap-2 group min-h-[250px]">
                            <div class="w-16 h-16 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-300 group-hover:scale-110 transition-transform"><i class="fa-solid fa-plus text-2xl"></i></div>
                            <span class="font-black text-gray-400 uppercase tracking-widest text-xs">New Profile</span>
                        </div>

                        <!-- Subject Cards -->
                        <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="fun-card bg-white p-3 cursor-pointer hover:-translate-y-1 hover:shadow-[6px_6px_0px_#000] transition-all flex flex-col h-full group">
                            <div class="relative aspect-square rounded-lg overflow-hidden border-2 border-black mb-3 bg-gray-100">
                                <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500">
                                <div v-else class="w-full h-full flex items-center justify-center text-gray-300 text-4xl"><i class="fa-solid fa-user"></i></div>
                                <div class="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-black shadow-sm"
                                    :class="{
                                        'bg-red-500 text-white': s.threat_level === 'High',
                                        'bg-orange-400 text-black': s.threat_level === 'Medium',
                                        'bg-green-400 text-black': s.threat_level === 'Low'
                                    }">
                                    {{ s.threat_level }}
                                </div>
                            </div>
                            <div class="flex-1">
                                <div class="font-black text-lg leading-tight mb-1">{{ s.full_name }}</div>
                                <div v-if="s.alias" class="text-xs text-purple-600 font-bold mb-2">"{{ s.alias }}"</div>
                                <div class="flex flex-wrap gap-1 mt-auto">
                                    <span class="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-mono border border-gray-200">{{ s.occupation || 'Unknown' }}</span>
                                    <span class="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-mono border border-gray-200">{{ s.nationality || 'Unknown' }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                 </div>
            </div>

            <!-- TAB: MAP -->
            <div v-if="currentTab === 'map'" class="flex-1 relative bg-slate-200 w-full h-full">
                <div id="warRoomMap" class="absolute inset-0 z-0"></div>
                <div class="absolute top-4 left-4 z-10 bg-white p-4 rounded-xl shadow-lg border-2 border-black">
                    <h3 class="font-black text-lg">Global Intel</h3>
                    <div class="text-xs text-gray-500">{{ subjects.length }} targets tracking</div>
                </div>
            </div>

            <!-- TAB: NETWORK -->
            <div v-if="currentTab === 'network'" class="flex-1 relative bg-slate-900 w-full h-full overflow-hidden">
                <div id="globalNetworkGraph" class="w-full h-full"></div>
                <div class="absolute top-4 left-4 bg-black/50 text-white p-4 rounded-xl border border-white/20 backdrop-blur">
                    <h3 class="font-black">Network Graph</h3>
                    <p class="text-xs opacity-70">Double click node to open profile</p>
                </div>
            </div>

            <!-- VIEW: DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="absolute inset-0 z-30 bg-white flex flex-col overflow-hidden">
                
                <!-- Detail Header -->
                <div class="bg-white border-b-4 border-black p-4 shrink-0 flex items-center justify-between shadow-sm">
                    <div class="flex items-center gap-4">
                        <button @click="changeTab('targets')" class="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center hover:bg-gray-100 transition-colors"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="flex items-center gap-3">
                             <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-black">
                                 <img v-if="selected.avatar_path" :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                 <div v-else class="w-full h-full bg-gray-200 flex items-center justify-center"><i class="fa-solid fa-user"></i></div>
                             </div>
                             <div>
                                 <h2 class="text-2xl font-black leading-none">{{ selected.full_name }}</h2>
                                 <div class="text-sm font-mono text-gray-500">{{ selected.occupation }} • {{ selected.nationality }}</div>
                             </div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="openShareModal(selected)" class="fun-btn bg-cyan-400 px-4 py-2 rounded-lg font-bold text-sm border-2 border-black flex items-center gap-2 hover:bg-cyan-300">
                            <i class="fa-solid fa-share-nodes"></i> Share Access
                        </button>
                        <button @click="archiveSubject(selected.id)" class="fun-btn bg-red-100 text-red-600 px-4 py-2 rounded-lg font-bold text-sm border-2 border-red-200 hover:bg-red-200">
                            <i class="fa-solid fa-box-archive"></i> Archive
                        </button>
                    </div>
                </div>

                <!-- Detail Content -->
                <div class="flex-1 overflow-hidden flex flex-col md:flex-row">
                    
                    <!-- Sidebar (Profile) -->
                    <div class="w-full md:w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4 shrink-0 space-y-6">
                        
                        <!-- Threat Card -->
                        <div class="fun-card p-4 bg-white text-center">
                            <div class="text-[10px] font-black uppercase text-gray-400 mb-1">Threat Level</div>
                            <div class="inline-block px-3 py-1 rounded-full border-2 font-black text-sm uppercase"
                            :class="{
                                'border-red-500 text-red-600 bg-red-50': selected.threat_level === 'High',
                                'border-orange-500 text-orange-600 bg-orange-50': selected.threat_level === 'Medium',
                                'border-green-500 text-green-600 bg-green-50': selected.threat_level === 'Low'
                            }">{{ selected.threat_level }}</div>
                        </div>

                        <!-- Basic Info -->
                        <div class="space-y-4">
                            <div v-for="(v, k) in {DOB: selected.dob, Age: selected.age, Gender: selected.gender, Blood: selected.blood_type, Height: selected.height, Weight: selected.weight}" :key="k" class="flex justify-between border-b border-gray-200 pb-1" v-if="v">
                                <span class="text-xs font-bold text-gray-400 uppercase">{{k}}</span>
                                <span class="text-sm font-mono font-bold">{{v}}</span>
                            </div>
                        </div>

                        <!-- Tags/Ideology -->
                        <div v-if="selected.ideology" class="p-3 bg-purple-50 rounded-xl border border-purple-100">
                             <div class="text-[10px] font-black uppercase text-purple-400 mb-1">Ideology</div>
                             <div class="text-sm font-bold text-purple-900">{{ selected.ideology }}</div>
                        </div>
                        
                        <!-- Modus Operandi -->
                        <div v-if="selected.modus_operandi" class="p-3 bg-slate-100 rounded-xl border border-slate-200">
                             <div class="text-[10px] font-black uppercase text-slate-400 mb-1">Modus Operandi</div>
                             <div class="text-xs text-slate-700 leading-relaxed">{{ selected.modus_operandi }}</div>
                        </div>
                        
                        <!-- Edit Button -->
                        <button @click="openModal('edit-subject', selected)" class="w-full py-2 border-2 border-gray-300 rounded-lg text-gray-500 font-bold hover:bg-gray-100 text-sm">Edit Profile Data</button>
                    </div>

                    <!-- Main Content (Tabs) -->
                    <div class="flex-1 flex flex-col min-w-0 bg-white">
                        <!-- Inner Tabs -->
                        <div class="flex border-b border-gray-200 overflow-x-auto hide-scrollbar">
                            <button v-for="t in ['Intel', 'Media', 'Network', 'Timeline', 'Map']" @click="detailTab = t" 
                                :class="detailTab === t ? 'border-b-4 border-black text-black bg-gray-50' : 'text-gray-400 hover:text-black'"
                                class="px-6 py-3 font-heading font-bold text-sm uppercase tracking-wide whitespace-nowrap transition-colors">
                                {{ t }}
                            </button>
                        </div>
                        
                        <div class="flex-1 overflow-y-auto p-6 bg-slate-50 relative">
                            
                            <!-- SUB-TAB: INTEL -->
                            <div v-if="detailTab === 'Intel'" class="space-y-6">
                                <div class="flex justify-between items-center">
                                    <h3 class="font-black text-xl">Intel Points</h3>
                                    <button @click="openModal('add-intel')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-800"><i class="fa-solid fa-plus mr-1"></i> Add Data</button>
                                </div>
                                <div v-if="!selected.intel || selected.intel.length === 0" class="text-center py-10 text-gray-400 italic">No intelligence data collected.</div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div v-for="item in selected.intel" :key="item.id" class="fun-card p-4 bg-white border-l-4 border-l-blue-500">
                                        <div class="flex justify-between items-start mb-2">
                                            <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">{{ item.category }}</span>
                                            <span class="text-[10px] text-gray-400">{{ new Date(item.created_at).toLocaleDateString() }}</span>
                                        </div>
                                        <div class="font-black text-sm mb-1">{{ item.label }}</div>
                                        <div class="text-gray-600 text-sm">{{ item.value }}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- SUB-TAB: TIMELINE -->
                            <div v-if="detailTab === 'Timeline'" class="space-y-6">
                                <div class="flex justify-between items-center">
                                    <h3 class="font-black text-xl">Interaction Log</h3>
                                    <button @click="openModal('add-interaction')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-800"><i class="fa-solid fa-plus mr-1"></i> Log Event</button>
                                </div>
                                <div class="relative pl-6 border-l-2 border-gray-200 space-y-8">
                                    <div v-for="log in selected.interactions" :key="log.id" class="relative">
                                        <div class="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-white shadow-sm" :class="log.type === 'Sighting' ? 'bg-blue-500' : 'bg-purple-500'"></div>
                                        <div class="fun-card p-4 bg-white">
                                            <div class="flex justify-between mb-2">
                                                <div class="font-black text-sm uppercase text-gray-400">{{ log.type }}</div>
                                                <div class="text-xs font-mono text-gray-400">{{ new Date(log.date).toLocaleString() }}</div>
                                            </div>
                                            <div class="text-sm font-medium mb-2">{{ log.transcript }}</div>
                                            <div v-if="log.conclusion" class="bg-yellow-50 p-2 rounded text-xs text-yellow-800 border border-yellow-100">
                                                <strong>Conclusion:</strong> {{ log.conclusion }}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- SUB-TAB: MEDIA -->
                            <div v-if="detailTab === 'Media'" class="space-y-6">
                                <div class="flex justify-between items-center">
                                    <h3 class="font-black text-xl">Evidence Locker</h3>
                                    <div class="flex gap-2">
                                        <input type="file" ref="fileInput" @change="handleFileUpload" class="hidden">
                                        <button @click="$refs.fileInput.click()" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-800"><i class="fa-solid fa-upload mr-1"></i> Upload</button>
                                        <button @click="openModal('add-media-link')" class="bg-gray-200 text-black px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-300"><i class="fa-solid fa-link mr-1"></i> Link</button>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div v-for="m in selected.media" :key="m.id" class="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200 cursor-pointer" @click="window.open(resolveImg(m.object_key || m.external_url), '_blank')">
                                        <img v-if="m.content_type.startsWith('image')" :src="resolveImg(m.object_key || m.external_url)" class="w-full h-full object-cover">
                                        <div v-else class="w-full h-full flex items-center justify-center text-4xl text-gray-300"><i class="fa-solid fa-file"></i></div>
                                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                            <div class="text-white text-xs truncate w-full">{{ m.description }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- SUB-TAB: NETWORK -->
                            <div v-if="detailTab === 'Network'" class="h-full flex flex-col">
                                <div class="flex justify-between items-center mb-4 shrink-0">
                                    <h3 class="font-black text-xl">Known Associates</h3>
                                    <button @click="openModal('add-relationship')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-800"><i class="fa-solid fa-link mr-1"></i> Connect</button>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div v-for="rel in selected.relationships" :key="rel.id" class="fun-card p-3 bg-white flex items-center gap-3">
                                         <div class="w-10 h-10 rounded-full overflow-hidden border border-black shrink-0">
                                             <img :src="resolveImg(rel.target_avatar)" class="w-full h-full object-cover">
                                         </div>
                                         <div class="flex-1 min-w-0">
                                             <div class="font-black text-sm truncate">{{ rel.target_name }}</div>
                                             <div class="text-xs text-gray-500">{{ rel.relationship_type }} <i class="fa-solid fa-arrow-right mx-1 text-[8px]"></i> {{ rel.role_b }}</div>
                                         </div>
                                         <button @click="viewSubject(rel.subject_a_id == selected.id ? rel.subject_b_id : rel.subject_a_id)" class="text-xs font-bold text-blue-500 hover:underline">View</button>
                                     </div>
                                </div>
                            </div>
                            
                            <!-- SUB-TAB: MAP -->
                            <div v-if="detailTab === 'Map'" class="h-full flex flex-col">
                                <div class="flex justify-between items-center mb-4 shrink-0">
                                    <h3 class="font-black text-xl">Location History</h3>
                                    <button @click="openModal('add-location')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-800"><i class="fa-solid fa-map-pin mr-1"></i> Pin</button>
                                </div>
                                <div class="flex-1 bg-gray-200 rounded-xl relative overflow-hidden border-2 border-black min-h-[300px]">
                                    <div id="subjectMap" class="absolute inset-0"></div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

        </main>
    </div>

    <!-- MODALS -->
    
    <!-- ADMIN MODAL -->
    <div v-if="modal.active === 'add-admin' || modal.active === 'edit-admin'" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="w-full max-w-lg fun-card bg-white border-4 border-black p-6 animate-bounce-in">
             <div class="flex justify-between items-center mb-6">
                 <h3 class="font-heading font-black text-2xl">{{ modal.active === 'add-admin' ? 'Recruit Admin' : 'Update Access' }}</h3>
                 <button @click="closeModal" class="text-gray-400 hover:text-black"><i class="fa-solid fa-times text-xl"></i></button>
             </div>
             
             <form @submit.prevent="submitAdmin" class="space-y-4">
                 <div class="space-y-1">
                     <label class="text-xs font-bold uppercase text-gray-500">Credentials</label>
                     <input v-if="modal.active === 'add-admin'" v-model="forms.admin.email" type="email" placeholder="Email Address" class="fun-input w-full p-3" required>
                     <input v-model="forms.admin.password" type="password" :placeholder="modal.active === 'add-admin' ? 'Set Password' : 'New Password (Optional)'" class="fun-input w-full p-3" :required="modal.active === 'add-admin'">
                 </div>
                 
                 <div class="grid grid-cols-2 gap-4">
                     <div class="bg-gray-50 p-3 rounded-xl border-2 border-gray-200 hover:border-green-300 transition-colors">
                         <label class="flex items-center gap-3 cursor-pointer">
                             <input type="checkbox" v-model="forms.admin.is_active" class="w-5 h-5 accent-green-500">
                             <div class="leading-tight">
                                 <div class="font-black text-sm">Active Status</div>
                                 <div class="text-[10px] text-gray-400">Can login to system</div>
                             </div>
                         </label>
                     </div>
                     <div class="bg-gray-50 p-3 rounded-xl border-2 border-gray-200 hover:border-blue-300 transition-colors">
                         <label class="flex items-center gap-3 cursor-pointer">
                             <input type="checkbox" v-model="forms.admin.require_location" class="w-5 h-5 accent-blue-500">
                             <div class="leading-tight">
                                 <div class="font-black text-sm">GPS Lock</div>
                                 <div class="text-[10px] text-gray-400">Require location</div>
                             </div>
                         </label>
                     </div>
                 </div>

                 <div class="bg-yellow-50 p-4 rounded-xl border-2 border-yellow-200 space-y-3">
                     <div class="text-xs font-black uppercase text-yellow-700 border-b border-yellow-200 pb-1">Permission Matrix</div>
                     <div class="grid grid-cols-2 gap-2">
                         <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" value="dashboard" v-model="forms.admin.permissions.tabs" class="accent-black"> Dashboard</label>
                         <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" value="targets" v-model="forms.admin.permissions.tabs" class="accent-black"> Database</label>
                         <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" value="map" v-model="forms.admin.permissions.tabs" class="accent-black"> Global Map</label>
                         <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" value="network" v-model="forms.admin.permissions.tabs" class="accent-black"> Network</label>
                     </div>
                     <div class="pt-2 border-t border-yellow-200">
                         <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" v-model="forms.admin.permissions.can_create" class="accent-black"> Can Add New Subjects</label>
                     </div>
                 </div>

                 <div class="flex gap-2 pt-2">
                     <button type="button" @click="closeModal" class="flex-1 bg-gray-100 font-bold py-3 rounded-xl hover:bg-gray-200">Cancel</button>
                     <button type="submit" class="flex-1 bg-black text-white font-bold py-3 rounded-xl hover:bg-gray-800 shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none">Save Access</button>
                 </div>
             </form>
        </div>
    </div>
    
    <!-- ADD/EDIT SUBJECT MODAL -->
    <div v-if="modal.active === 'add-subject' || modal.active === 'edit-subject'" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="w-full max-w-2xl fun-card bg-white p-6 max-h-[90vh] overflow-y-auto">
            <h3 class="font-black text-xl mb-6">{{ modal.active.includes('add') ? 'Create Profile' : 'Edit Profile' }}</h3>
            <form @submit.prevent="submitSubject" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div><label>Full Name</label><input v-model="forms.subject.full_name" class="fun-input w-full p-2" required></div>
                     <div><label>Alias</label><input v-model="forms.subject.alias" class="fun-input w-full p-2"></div>
                     <div><label>Occupation</label><input v-model="forms.subject.occupation" class="fun-input w-full p-2" list="occupations"></div>
                     <div><label>Nationality</label><input v-model="forms.subject.nationality" class="fun-input w-full p-2" list="nationalities"></div>
                     <div><label>Threat Level</label>
                        <select v-model="forms.subject.threat_level" class="fun-input w-full p-2">
                            <option>Low</option><option>Medium</option><option>High</option>
                        </select>
                     </div>
                     <div><label>Status</label>
                        <select v-model="forms.subject.status" class="fun-input w-full p-2">
                            <option>Active</option><option>Monitoring</option><option>Deceased</option><option>Incarcerated</option>
                        </select>
                     </div>
                </div>
                <div class="grid grid-cols-3 gap-4">
                    <div><label>Age</label><input v-model="forms.subject.age" type="number" class="fun-input w-full p-2"></div>
                    <div><label>Height</label><input v-model="forms.subject.height" class="fun-input w-full p-2"></div>
                    <div><label>Weight</label><input v-model="forms.subject.weight" class="fun-input w-full p-2"></div>
                </div>
                <div><label>Ideology</label><input v-model="forms.subject.ideology" class="fun-input w-full p-2" list="ideologies"></div>
                <div><label>Modus Operandi</label><textarea v-model="forms.subject.modus_operandi" class="fun-input w-full p-2 h-24"></textarea></div>
                
                <div class="flex gap-2 justify-end pt-4">
                     <button type="button" @click="closeModal" class="px-6 py-2 rounded-xl font-bold bg-gray-100 hover:bg-gray-200">Cancel</button>
                     <button class="px-6 py-2 rounded-xl font-bold bg-black text-white hover:bg-gray-800">Save Profile</button>
                </div>
            </form>
        </div>
    </div>

    <!-- GENERIC MODALS (Intel, Interaction, etc) - Structure kept simple for length but fully functional -->
    <div v-if="['add-intel', 'add-interaction', 'add-location', 'add-relationship', 'add-media-link'].includes(modal.active)" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="w-full max-w-md fun-card bg-white p-6">
            <h3 class="font-black text-lg mb-4">Add Data</h3>
            <form @submit.prevent="submitGeneric" class="space-y-4">
                
                <!-- INTEL FORM -->
                <div v-if="modal.active === 'add-intel'" class="space-y-3">
                    <input v-model="forms.intel.category" placeholder="Category (e.g. Finance)" class="fun-input w-full p-2" required>
                    <input v-model="forms.intel.label" placeholder="Label (e.g. Bank Account)" class="fun-input w-full p-2" required>
                    <textarea v-model="forms.intel.value" placeholder="Value/Description" class="fun-input w-full p-2 h-20" required></textarea>
                </div>

                <!-- INTERACTION FORM -->
                <div v-if="modal.active === 'add-interaction'" class="space-y-3">
                    <select v-model="forms.interaction.type" class="fun-input w-full p-2">
                        <option>Sighting</option><option>Meeting</option><option>Interrogation</option><option>Digital Intercept</option>
                    </select>
                    <input v-model="forms.interaction.date" type="datetime-local" class="fun-input w-full p-2" required>
                    <textarea v-model="forms.interaction.transcript" placeholder="Notes/Transcript..." class="fun-input w-full p-2 h-24" required></textarea>
                    <input v-model="forms.interaction.conclusion" placeholder="Conclusion" class="fun-input w-full p-2">
                </div>
                
                <!-- LOCATION FORM -->
                <div v-if="modal.active === 'add-location'" class="space-y-3">
                    <input v-model="forms.location.name" placeholder="Location Name" class="fun-input w-full p-2" required>
                    <div class="flex gap-2">
                        <input v-model="forms.location.lat" placeholder="Latitude" class="fun-input w-full p-2" required>
                        <input v-model="forms.location.lng" placeholder="Longitude" class="fun-input w-full p-2" required>
                    </div>
                    <select v-model="forms.location.type" class="fun-input w-full p-2">
                        <option>Residence</option><option>Workplace</option><option>Last Seen</option><option>Hideout</option>
                    </select>
                </div>

                <!-- RELATIONSHIP FORM -->
                <div v-if="modal.active === 'add-relationship'" class="space-y-3">
                     <select v-model="forms.relationship.targetId" class="fun-input w-full p-2" required>
                         <option v-for="s in subjects" :value="s.id" v-show="s.id !== selected.id">{{s.full_name}}</option>
                     </select>
                     <input v-model="forms.relationship.type" placeholder="Relationship (e.g. Brother)" class="fun-input w-full p-2" required>
                     <input v-model="forms.relationship.reciprocal" placeholder="Reciprocal Role (e.g. Sister)" class="fun-input w-full p-2" required>
                </div>
                
                <!-- MEDIA LINK -->
                <div v-if="modal.active === 'add-media-link'" class="space-y-3">
                    <input v-model="forms.media.url" placeholder="https://" class="fun-input w-full p-2" required>
                    <input v-model="forms.media.description" placeholder="Description" class="fun-input w-full p-2" required>
                </div>

                <div class="flex gap-2 pt-2">
                     <button type="button" @click="closeModal" class="flex-1 bg-gray-100 font-bold py-2 rounded-xl">Cancel</button>
                     <button type="submit" class="flex-1 bg-black text-white font-bold py-2 rounded-xl">Save</button>
                </div>
            </form>
        </div>
    </div>

    <!-- SHARE MODAL -->
    <div v-if="modal.active === 'share'" class="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
        <div class="w-full max-w-md fun-card bg-white p-6">
             <h3 class="font-black text-xl mb-4">Generate Secure Link</h3>
             <div class="space-y-4">
                 <div>
                     <label class="text-xs font-bold uppercase">Duration</label>
                     <select v-model="forms.share.durationMinutes" class="fun-input w-full p-2">
                         <option :value="30">30 Minutes</option>
                         <option :value="60">1 Hour</option>
                         <option :value="1440">24 Hours</option>
                         <option :value="10080">7 Days</option>
                     </select>
                 </div>
                 
                 <div class="bg-blue-50 p-3 rounded-xl border border-blue-200">
                     <label class="flex items-center gap-2 cursor-pointer">
                         <input type="checkbox" v-model="forms.share.requireLocation" class="accent-blue-500 w-4 h-4">
                         <span class="font-bold text-sm text-blue-900">Require Location to View</span>
                     </label>
                 </div>

                 <div class="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                     <div class="text-[10px] font-black uppercase text-yellow-700 mb-2">Allowed Tabs</div>
                     <div class="grid grid-cols-3 gap-2 text-xs font-bold">
                         <label><input type="checkbox" value="Profile" v-model="forms.share.allowedTabs"> Profile</label>
                         <label><input type="checkbox" value="Intel" v-model="forms.share.allowedTabs"> Intel</label>
                         <label><input type="checkbox" value="Files" v-model="forms.share.allowedTabs"> Files</label>
                         <label><input type="checkbox" value="Map" v-model="forms.share.allowedTabs"> Map</label>
                         <label><input type="checkbox" value="History" v-model="forms.share.allowedTabs"> History</label>
                         <label><input type="checkbox" value="Network" v-model="forms.share.allowedTabs"> Network</label>
                     </div>
                 </div>

                 <div v-if="shareResult" class="bg-green-100 p-3 rounded border border-green-300 break-all text-xs font-mono">
                     {{ shareResult }}
                 </div>

                 <div class="flex gap-2">
                     <button @click="closeModal" class="flex-1 bg-gray-100 font-bold py-2 rounded-xl">Close</button>
                     <button v-if="!shareResult" @click="createShare" class="flex-1 bg-black text-white font-bold py-2 rounded-xl">Generate</button>
                     <button v-else @click="copyShare" class="flex-1 bg-green-500 text-white font-bold py-2 rounded-xl">Copy</button>
                 </div>
             </div>
        </div>
    </div>

    <!-- DATALISTS FOR AUTOCOMPLETE -->
    <datalist id="occupations"><option v-for="o in suggestions.occupations" :value="o"></option></datalist>
    <datalist id="nationalities"><option v-for="n in suggestions.nationalities" :value="n"></option></datalist>
    <datalist id="ideologies"><option v-for="i in suggestions.ideologies" :value="i"></option></datalist>

  </div>
</body>
`;
