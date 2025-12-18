export const ADMIN_APP_BODY = `
<body class="h-[100dvh] overflow-hidden text-slate-900 bg-slate-50 font-sans">
  <div id="app" class="h-full flex flex-col">

    <!-- TOAST NOTIFICATIONS -->
    <div class="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
        <div v-for="t in toasts" :key="t.id" class="pointer-events-auto bg-white border-4 border-black shadow-[4px_4px_0px_0px_#000] rounded-xl p-4 flex items-center gap-3 animate-bounce-in min-w-[300px]">
            <i :class="t.icon" class="text-2xl" :style="{color: t.color}"></i>
            <div>
                <div class="text-lg font-heading font-bold text-black">{{t.title}}</div>
                <div class="text-sm font-bold text-gray-500">{{t.msg}}</div>
            </div>
        </div>
    </div>

    <!-- AUTH SCREEN -->
    <div v-if="view === 'auth'" class="flex-1 flex items-center justify-center p-6 bg-yellow-50 pattern-grid">
        <div class="w-full max-w-sm fun-card p-8 bg-white text-center relative z-10">
            <div class="w-20 h-20 bg-yellow-300 border-4 border-black rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-sm"><i class="fa-solid fa-user-secret"></i></div>
            <h1 class="text-4xl font-heading font-black mb-1">PEOPLE OS</h1>
            <div class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-6">Intelligence Database</div>
            
            <div v-if="auth.reqLocation" class="bg-blue-50 border-2 border-blue-500 rounded-xl p-4 mb-4 animate-pulse">
                <i class="fa-solid fa-location-dot text-3xl text-blue-500 mb-2"></i>
                <div class="text-sm font-bold text-blue-900">Security Check</div>
                <div class="text-xs text-blue-700">Master Admin requires location verification.</div>
            </div>

            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Identifier" class="fun-input w-full p-4" required :disabled="auth.reqLocation">
                <input v-model="auth.password" type="password" placeholder="Passcode" class="fun-input w-full p-4" required :disabled="auth.reqLocation">
                
                <button v-if="!auth.reqLocation" type="submit" :disabled="loading" class="w-full bg-black text-white font-heading font-bold py-4 rounded-xl flex items-center justify-center hover:bg-gray-800 transition-colors">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>{{ loading ? 'Verifying...' : 'Access System' }}
                </button>
                <button v-else type="button" @click="retryAuthWithLocation" :disabled="loading" class="w-full bg-blue-600 text-white font-heading font-bold py-4 rounded-xl flex items-center justify-center hover:bg-blue-500 transition-colors">
                     <i v-if="loading" class="fa-solid fa-satellite-dish fa-spin mr-2"></i>{{ loading ? 'Acquiring GPS...' : 'Share Location & Login' }}
                </button>
            </form>
            <div v-if="auth.error" class="mt-4 text-red-500 font-bold text-sm bg-red-50 p-2 rounded border border-red-100">{{ auth.error }}</div>
        </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
        
        <!-- SIDEBAR -->
        <nav class="hidden md:flex flex-col w-24 bg-white border-r-4 border-black items-center py-6 z-20 shrink-0 gap-4 overflow-y-auto no-scrollbar">
            <div class="mb-4 text-yellow-500 text-4xl hover:scale-110 transition-transform cursor-pointer drop-shadow-sm" @click="changeTab('dashboard')"><i class="fa-solid fa-cube"></i></div>
            
            <button v-for="t in visibleTabs" :key="t.id" @click="changeTab(t.id)" 
                :class="currentTab === t.id ? 'bg-black text-white shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'" 
                class="w-16 h-16 rounded-2xl border-2 border-black flex flex-col items-center justify-center gap-1 transition-all relative group">
                <i :class="t.icon" class="text-xl group-hover:scale-110 transition-transform"></i>
                <span class="text-[9px] font-black uppercase">{{t.label}}</span>
                <div v-if="t.id === 'team'" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></div>
            </button>

            <div class="mt-auto flex flex-col items-center w-full px-2 gap-2">
                <div v-if="user.is_master" class="text-[8px] font-black uppercase text-center bg-yellow-300 px-1 py-0.5 rounded border border-black w-full text-black">MASTER</div>
                <div v-else class="text-[8px] font-black uppercase text-center bg-gray-200 px-1 py-0.5 rounded border border-gray-400 w-full text-gray-500">AGENT</div>
                <button @click="handleLogout" class="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-colors"><i class="fa-solid fa-power-off text-xl"></i></button>
            </div>
        </nav>

        <!-- CONTENT -->
        <main class="flex-1 relative overflow-hidden flex flex-col pb-20 md:pb-0 safe-area-pb bg-slate-50">

            <!-- DASHBOARD -->
            <div v-if="currentTab === 'dashboard'" class="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                 <div class="max-w-7xl mx-auto space-y-6">
                    <div class="flex justify-between items-center">
                        <div>
                            <h2 class="text-4xl font-heading font-black">Command Center</h2>
                            <p class="text-gray-500 font-bold">System Status: Optimal</p>
                        </div>
                        <button v-if="canCreate" @click="openModal('add-subject')" class="bg-black text-white px-6 py-3 rounded-xl fun-btn font-bold flex gap-2 items-center shadow-[4px_4px_0px_#000] active:shadow-none active:translate-y-1"><i class="fa-solid fa-plus"></i> New Target</button>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="fun-card p-4 bg-white flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center text-xl"><i class="fa-solid fa-users"></i></div><div><div class="text-3xl font-black">{{ stats.targets || 0 }}</div><div class="text-xs text-gray-500 font-bold uppercase">Subjects</div></div></div>
                        <div class="fun-card p-4 bg-white flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center text-xl"><i class="fa-solid fa-eye"></i></div><div><div class="text-3xl font-black">{{ stats.encounters || 0 }}</div><div class="text-xs text-gray-500 font-bold uppercase">Sightings</div></div></div>
                        <div class="fun-card p-4 bg-white flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-purple-100 text-purple-500 flex items-center justify-center text-xl"><i class="fa-solid fa-file"></i></div><div><div class="text-3xl font-black">{{ stats.evidence || 0 }}</div><div class="text-xs text-gray-500 font-bold uppercase">Files</div></div></div>
                        <div class="fun-card p-4 bg-green-100 border-green-300 flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-green-200 text-green-700 flex items-center justify-center text-xl"><i class="fa-solid fa-satellite"></i></div><div><div class="text-xs font-black text-green-800 uppercase">System</div><div class="text-sm font-bold text-green-700">ONLINE</div></div></div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-[50vh]">
                        <div class="md:col-span-2 fun-card bg-white flex flex-col p-4">
                            <h3 class="font-bold mb-4">Activity Volume</h3>
                            <div class="flex-1 relative"><canvas id="dashboardChart"></canvas></div>
                        </div>
                        <div class="fun-card bg-white flex flex-col">
                            <div class="p-4 border-b-2 border-gray-100 flex justify-between items-center"><h3 class="font-bold">Intel Feed</h3><button @click="fetchData" class="text-blue-500 text-sm font-bold hover:underline">Refresh</button></div>
                            <div class="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                                <div v-for="item in feed" :key="item.date" @click="viewSubject(item.ref_id)" class="p-3 hover:bg-blue-50 border border-gray-100 rounded-lg flex gap-3 cursor-pointer group transition-colors">
                                    <div class="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-blue-200 flex items-center justify-center text-gray-400 group-hover:text-blue-700"><i class="fa-solid fa-bell"></i></div>
                                    <div class="flex-1 min-w-0">
                                        <div class="font-bold text-sm truncate">{{ item.title }}</div>
                                        <div class="text-xs text-gray-500 truncate">{{ item.desc }}</div>
                                    </div>
                                    <div class="text-[10px] text-gray-300 font-mono">{{ new Date(item.date).toLocaleDateString() }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TEAM (NEW) -->
            <div v-if="currentTab === 'team'" class="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="flex justify-between items-center">
                        <div><h2 class="text-3xl font-heading font-black">Team Command</h2><p class="text-gray-500 font-bold">Manage Sub-Admin Access & Permissions</p></div>
                        <button @click="openModal('add-admin')" class="bg-violet-600 text-white px-6 py-3 rounded-xl fun-btn font-bold shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none"><i class="fa-solid fa-user-plus mr-2"></i>Recruit Admin</button>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div v-for="adm in team" :key="adm.id" class="fun-card p-5 bg-white relative group transition-all hover:-translate-y-1 hover:shadow-md">
                            <div class="flex justify-between items-start mb-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-black border-2 border-black" :class="adm.is_master?'bg-yellow-300':'bg-gray-200'">{{adm.email.slice(0,2).toUpperCase()}}</div>
                                    <div><div class="font-black text-sm">{{adm.email}}</div><div class="text-[10px] font-bold text-gray-400">Since {{new Date(adm.created_at).toLocaleDateString()}}</div></div>
                                </div>
                                <div v-if="adm.is_master" class="bg-black text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">MASTER</div>
                                <div v-else class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button @click="openModal('edit-admin', adm)" class="text-blue-500 bg-blue-50 p-2 rounded hover:bg-blue-100"><i class="fa-solid fa-pen"></i></button>
                                    <button @click="deleteAdmin(adm.id)" class="text-red-500 bg-red-50 p-2 rounded hover:bg-red-100"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                            <div v-if="!adm.is_master" class="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                                <div class="flex justify-between text-xs font-bold"><span class="text-gray-500 uppercase">Status</span><span :class="adm.is_active?'text-green-600':'text-red-600'">{{adm.is_active?'ACTIVE':'DISABLED'}}</span></div>
                                <div class="flex justify-between text-xs font-bold"><span class="text-gray-500 uppercase">GPS Lock</span><span :class="adm.require_location?'text-blue-600':'text-gray-400'">{{adm.require_location?'ON':'OFF'}}</span></div>
                                <div class="flex justify-between text-xs font-bold"><span class="text-gray-500 uppercase">Subjects</span><span class="bg-gray-200 px-1 rounded">{{adm.permissions.allowed_ids?.length || 'All'}}</span></div>
                                <div v-if="adm.last_location" class="pt-2 border-t border-gray-200 text-[10px] text-gray-400 font-mono text-center flex items-center justify-center gap-1">
                                    <i class="fa-solid fa-location-arrow text-blue-500"></i>{{ JSON.parse(adm.last_location).lat.toFixed(4) }}, {{ JSON.parse(adm.last_location).lng.toFixed(4) }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TARGETS -->
            <div v-if="currentTab === 'targets'" class="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                 <div class="max-w-7xl mx-auto">
                    <div class="mb-6 flex gap-4">
                        <div class="relative flex-1">
                            <i class="fa-solid fa-search absolute left-4 top-4 text-gray-400"></i>
                            <input v-model="search" placeholder="Search targets by name, alias, or ID..." class="fun-input w-full p-3 pl-10 text-lg shadow-sm">
                        </div>
                        <select v-model="filterStatus" class="fun-input p-3 font-bold shadow-sm"><option value="All">All Status</option><option value="Active">Active</option><option value="Monitoring">Monitoring</option><option value="Deceased">Deceased</option></select>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        <div v-for="s in filteredSubjects" :key="s.id" @click="viewSubject(s.id)" class="fun-card bg-white p-3 cursor-pointer hover:-translate-y-1 hover:shadow-[4px_4px_0px_#000] transition-all group">
                            <div class="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden border-2 border-black relative">
                                <img v-if="s.avatar_path" :src="resolveImg(s.avatar_path)" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all">
                                <div v-else class="w-full h-full flex items-center justify-center text-4xl text-gray-300"><i class="fa-solid fa-user"></i></div>
                                <div class="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase border border-black" :class="{'bg-red-500 text-white':s.threat_level==='High','bg-orange-400':s.threat_level==='Medium','bg-green-400':s.threat_level==='Low'}">{{s.threat_level}}</div>
                            </div>
                            <div class="font-black truncate leading-tight">{{ s.full_name }}</div>
                            <div class="text-xs text-purple-600 font-bold mb-1">{{s.alias || 'No Alias'}}</div>
                            <div class="flex gap-1 flex-wrap"><span class="text-[9px] bg-gray-100 border border-gray-300 px-1 rounded font-mono">{{ s.occupation }}</span></div>
                        </div>
                    </div>
                 </div>
            </div>

            <!-- MAP & NETWORK -->
            <div v-if="currentTab === 'map'" class="flex-1 relative bg-slate-200"><div id="warRoomMap" class="absolute inset-0"></div></div>
            <div v-if="currentTab === 'network'" class="flex-1 relative bg-slate-900"><div id="globalNetworkGraph" class="w-full h-full"></div></div>

            <!-- DETAIL VIEW (Full Restoration) -->
            <div v-if="currentTab === 'detail' && selected" class="absolute inset-0 z-30 bg-white flex flex-col">
                <div class="bg-white border-b-4 border-black p-4 shrink-0 flex justify-between items-center shadow-sm z-20">
                    <div class="flex items-center gap-4">
                        <button @click="changeTab('targets')" class="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center hover:bg-gray-100"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="flex items-center gap-3">
                             <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-black"><img v-if="selected.avatar_path" :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover"></div>
                             <div><h2 class="text-2xl font-black leading-none">{{ selected.full_name }}</h2><div class="text-sm font-mono text-gray-500">{{selected.occupation}} / {{selected.nationality}}</div></div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button v-if="canCreate" @click="openModal('edit-subject', selected)" class="bg-gray-100 px-4 py-2 rounded-lg font-bold border-2 border-gray-300 hover:bg-gray-200">Edit Profile</button>
                    </div>
                </div>

                <div class="flex-1 overflow-hidden flex flex-col md:flex-row">
                    <!-- Profile Sidebar -->
                    <div class="w-full md:w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4 shrink-0 space-y-4 custom-scrollbar">
                        <div class="fun-card p-4 bg-white text-center">
                            <div class="text-[10px] uppercase text-gray-400 font-bold mb-1">Threat Assessment</div>
                            <div class="inline-block px-4 py-1 rounded-full border-2 font-black text-lg uppercase" :class="{'border-red-500 bg-red-50 text-red-600':selected.threat_level==='High','border-green-500 bg-green-50 text-green-600':selected.threat_level==='Low'}">{{ selected.threat_level }}</div>
                            <div v-if="selected.analysis" class="mt-2 text-xs text-gray-500 border-t pt-2">{{selected.analysis.summary}}</div>
                        </div>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between border-b border-gray-200 pb-1"><span>Status</span><b class="uppercase">{{selected.status}}</b></div>
                            <div class="flex justify-between border-b border-gray-200 pb-1"><span>Age</span><b>{{selected.age}}</b></div>
                            <div class="flex justify-between border-b border-gray-200 pb-1"><span>Gender</span><b>{{selected.gender}}</b></div>
                            <div class="flex justify-between border-b border-gray-200 pb-1"><span>Height/Weight</span><b>{{selected.height}} / {{selected.weight}}</b></div>
                        </div>
                        <div v-if="selected.familyReport && selected.familyReport.length" class="bg-white p-3 rounded-xl border border-gray-200">
                             <div class="text-[10px] font-black uppercase text-gray-400 mb-2">Family Unit</div>
                             <div class="space-y-2">
                                 <div v-for="f in selected.familyReport" class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded" @click="viewSubject(f.id)">
                                     <img :src="resolveImg(f.avatar)" class="w-6 h-6 rounded-full border border-gray-300 object-cover">
                                     <div class="text-xs leading-none">
                                         <div class="font-bold">{{f.name}}</div><div class="text-[10px] text-gray-500">{{f.role}}</div>
                                     </div>
                                 </div>
                             </div>
                        </div>
                        <div v-if="selected.modus_operandi" class="bg-yellow-50 p-3 rounded border border-yellow-200 text-xs italic text-yellow-800">
                            <div class="font-black not-italic mb-1 uppercase">Modus Operandi</div>"{{selected.modus_operandi}}"
                        </div>
                    </div>

                    <!-- Tabs Content -->
                    <div class="flex-1 flex flex-col min-w-0 bg-white">
                        <div class="flex border-b border-gray-200 overflow-x-auto hide-scrollbar">
                            <button v-for="t in ['Intel', 'Media', 'Network', 'Timeline', 'Map', 'Skills']" 
                                v-show="canViewDetailTab(t)"
                                @click="detailTab = t" 
                                :class="detailTab === t ? 'border-b-4 border-black text-black bg-gray-50' : 'text-gray-400 hover:text-black'"
                                class="px-6 py-3 font-bold text-sm uppercase whitespace-nowrap transition-colors">
                                {{ t }}
                            </button>
                        </div>
                        
                        <div class="flex-1 overflow-y-auto p-6 bg-slate-50 relative custom-scrollbar">
                            <!-- INTEL -->
                            <div v-if="detailTab === 'Intel'" class="space-y-4">
                                <button v-if="canCreate" @click="openModal('add-intel')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-800">+ Add Data point</button>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div v-for="item in selected.intel" class="fun-card p-4 bg-white border-l-4 border-blue-500 shadow-sm">
                                        <div class="flex justify-between"><div class="text-xs font-bold text-blue-500 uppercase">{{item.category}}</div><div class="text-[10px] text-gray-400">{{new Date(item.created_at).toLocaleDateString()}}</div></div>
                                        <div class="font-black text-sm mb-1">{{item.label}}</div>
                                        <div class="text-gray-600 text-sm leading-snug">{{item.value}}</div>
                                    </div>
                                </div>
                            </div>
                            <!-- MEDIA -->
                            <div v-if="detailTab === 'Media'" class="space-y-4">
                                <div v-if="canCreate" class="flex gap-2">
                                    <button @click="$refs.fileInput.click()" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold flex gap-2 items-center"><i class="fa-solid fa-upload"></i> Upload File</button>
                                    <input type="file" ref="fileInput" @change="handleFileUpload" class="hidden">
                                </div>
                                <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    <div v-for="m in selected.media" class="aspect-square bg-gray-200 rounded-xl overflow-hidden relative group border border-gray-300 cursor-pointer shadow-sm hover:shadow-md" @click="window.open(resolveImg(m.object_key), '_blank')">
                                        <img v-if="m.content_type.startsWith('image')" :src="resolveImg(m.object_key)" class="w-full h-full object-cover">
                                        <div v-else class="w-full h-full flex items-center justify-center text-4xl text-gray-400"><i class="fa-solid fa-file"></i></div>
                                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"><div class="text-white text-xs truncate">{{m.description}}</div></div>
                                    </div>
                                </div>
                            </div>
                            <!-- TIMELINE -->
                            <div v-if="detailTab === 'Timeline'" class="space-y-4">
                                <button v-if="canCreate" @click="openModal('add-interaction')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold">+ Log Event</button>
                                <div class="pl-4 border-l-2 border-gray-200 space-y-6">
                                    <div v-for="log in selected.interactions" class="relative">
                                        <div class="absolute -left-[21px] w-3 h-3 bg-black rounded-full border-2 border-white ring-2 ring-gray-100"></div>
                                        <div class="fun-card p-3 bg-white text-sm shadow-sm">
                                            <div class="font-bold flex justify-between mb-1"><span class="uppercase text-xs tracking-wider">{{log.type}}</span><span class="text-gray-400 text-xs font-mono">{{new Date(log.date).toLocaleDateString()}}</span></div>
                                            <div class="text-gray-800">{{log.transcript}}</div>
                                            <div v-if="log.conclusion" class="mt-2 bg-yellow-50 p-2 text-xs text-yellow-800 rounded"><b>Analysis:</b> {{log.conclusion}}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- SKILLS -->
                            <div v-if="detailTab === 'Skills'" class="space-y-4">
                                <button v-if="canCreate" @click="openModal('add-skill')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold">+ Add Skill</button>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div v-for="s in selected.skills" class="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                        <div class="flex justify-between text-sm font-bold mb-1"><span>{{s.skill_name}}</span><span>{{s.score}}%</span></div>
                                        <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden"><div class="bg-black h-full rounded-full" :style="{width: s.score + '%'}"></div></div>
                                    </div>
                                </div>
                            </div>
                            <!-- NETWORK -->
                            <div v-if="detailTab === 'Network'" class="h-full flex flex-col">
                                <button v-if="canCreate" @click="openModal('add-relationship')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold w-fit mb-4">+ Connect Subject</button>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                     <div v-for="rel in selected.relationships" class="fun-card p-3 bg-white flex items-center gap-3 cursor-pointer hover:bg-gray-50" @click="viewSubject(rel.subject_a_id == selected.id ? rel.subject_b_id : rel.subject_a_id)">
                                         <img :src="resolveImg(rel.target_avatar)" class="w-10 h-10 rounded-full border border-black object-cover">
                                         <div><div class="font-bold text-sm">{{rel.target_name}}</div><div class="text-xs text-gray-500">{{rel.relationship_type}}</div></div>
                                     </div>
                                </div>
                            </div>
                            <!-- MAP -->
                            <div v-if="detailTab === 'Map'" class="h-full flex flex-col">
                                <button v-if="canCreate" @click="openModal('add-location')" class="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold w-fit mb-4">+ Pin Location</button>
                                <div class="flex-1 bg-gray-200 rounded-xl border-2 border-black relative overflow-hidden"><div id="subjectMap" class="absolute inset-0"></div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- ADMIN MODAL -->
    <div v-if="['add-admin', 'edit-admin'].includes(modal.active)" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="w-full max-w-xl fun-card bg-white border-4 border-black p-6 max-h-[90vh] overflow-y-auto shadow-[8px_8px_0px_#000]">
             <div class="flex justify-between items-center mb-6 border-b-2 border-black pb-2">
                 <h3 class="font-heading font-black text-2xl">Access Control</h3>
                 <button @click="closeModal" class="text-gray-400 hover:text-red-500"><i class="fa-solid fa-times text-xl"></i></button>
             </div>
             <form @submit.prevent="submitAdmin" class="space-y-6">
                 <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1"><label class="text-xs font-bold uppercase">Email</label><input v-if="modal.active === 'add-admin'" v-model="forms.admin.email" type="email" class="fun-input w-full p-2" required></div>
                    <div class="space-y-1"><label class="text-xs font-bold uppercase">Password</label><input v-model="forms.admin.password" type="password" class="fun-input w-full p-2"></div>
                 </div>
                 <div class="flex gap-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
                     <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" v-model="forms.admin.is_active" class="accent-green-500 w-4 h-4"><span class="font-bold text-sm">Active</span></label>
                     <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" v-model="forms.admin.require_location" class="accent-blue-500 w-4 h-4"><span class="font-bold text-sm">Require Location</span></label>
                     <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" v-model="forms.admin.permissions.can_create" class="accent-purple-500 w-4 h-4"><span class="font-bold text-sm">Can Add Data</span></label>
                 </div>
                 <!-- Permissions -->
                 <div class="space-y-4">
                     <div class="bg-gray-100 p-3 rounded-xl border-2 border-gray-200">
                         <div class="font-bold text-xs uppercase text-gray-500 mb-2">Main Tabs Access</div>
                         <div class="flex gap-3 flex-wrap">
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="dashboard" v-model="forms.admin.permissions.tabs" class="accent-black"> Dashboard</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="targets" v-model="forms.admin.permissions.tabs" class="accent-black"> Database</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="map" v-model="forms.admin.permissions.tabs" class="accent-black"> Map</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="network" v-model="forms.admin.permissions.tabs" class="accent-black"> Network</label>
                         </div>
                     </div>
                     <div class="bg-yellow-50 p-3 rounded-xl border-2 border-yellow-200">
                         <div class="font-bold text-xs uppercase text-yellow-700 mb-2">Profile Detail Tabs</div>
                         <div class="flex gap-3 flex-wrap">
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="Intel" v-model="forms.admin.permissions.detail_tabs" class="accent-black"> Intel</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="Media" v-model="forms.admin.permissions.detail_tabs" class="accent-black"> Media</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="Timeline" v-model="forms.admin.permissions.detail_tabs" class="accent-black"> Timeline</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="Network" v-model="forms.admin.permissions.detail_tabs" class="accent-black"> Network</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="Skills" v-model="forms.admin.permissions.detail_tabs" class="accent-black"> Skills</label>
                             <label class="flex items-center gap-1 text-sm font-bold"><input type="checkbox" value="Map" v-model="forms.admin.permissions.detail_tabs" class="accent-black"> Map</label>
                         </div>
                     </div>
                     <div class="bg-blue-50 p-3 rounded-xl border-2 border-blue-200">
                         <div class="font-bold text-xs uppercase text-blue-700 mb-2">Specific Subject Access (Select none for ALL)</div>
                         <div class="max-h-32 overflow-y-auto border bg-white p-2 rounded text-sm space-y-1 custom-scrollbar">
                             <label v-for="s in subjects" :key="s.id" class="flex items-center gap-2 cursor-pointer hover:bg-gray-50"><input type="checkbox" :value="s.id" v-model="forms.admin.permissions.allowed_ids" class="accent-blue-500"> {{ s.full_name }}</label>
                         </div>
                     </div>
                 </div>
                 <div class="flex gap-3">
                     <button type="button" @click="closeModal" class="flex-1 bg-gray-200 py-3 rounded-xl font-bold hover:bg-gray-300">Cancel</button>
                     <button type="submit" class="flex-1 bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 shadow-[4px_4px_0px_#000] active:translate-y-1 active:shadow-none">Save Changes</button>
                 </div>
             </form>
        </div>
    </div>

    <!-- OTHER MODALS (Simplified Structure but specific inputs) -->
    <div v-if="modal.active && !['add-admin','edit-admin','share'].includes(modal.active)" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="w-full max-w-md fun-card bg-white p-6 border-4 border-black animate-bounce-in">
            <h3 class="font-black text-xl mb-4 capitalize">{{modal.active.replace('-', ' ')}}</h3>
            <form @submit.prevent="submitGeneric" class="space-y-3">
                
                <!-- SUBJECT -->
                <div v-if="modal.active.includes('subject')" class="space-y-3">
                    <input v-model="forms.subject.full_name" placeholder="Full Name" class="fun-input w-full p-2" required>
                    <input v-model="forms.subject.alias" placeholder="Alias" class="fun-input w-full p-2">
                    <input v-model="forms.subject.occupation" placeholder="Role/Occupation" class="fun-input w-full p-2">
                    <div class="flex gap-2">
                        <input v-model="forms.subject.age" placeholder="Age" type="number" class="fun-input w-1/2 p-2">
                        <select v-model="forms.subject.threat_level" class="fun-input w-1/2 p-2"><option>Low</option><option>Medium</option><option>High</option></select>
                    </div>
                </div>

                <!-- INTEL -->
                <div v-if="modal.active.includes('intel')" class="space-y-3">
                    <input v-model="forms.intel.category" placeholder="Category (Finance, Medical...)" class="fun-input w-full p-2" required>
                    <input v-model="forms.intel.label" placeholder="Label" class="fun-input w-full p-2" required>
                    <textarea v-model="forms.intel.value" placeholder="Data Value..." class="fun-input w-full p-2 h-20" required></textarea>
                </div>

                <!-- INTERACTION -->
                <div v-if="modal.active.includes('interaction')" class="space-y-3">
                    <select v-model="forms.interaction.type" class="fun-input w-full p-2"><option>Sighting</option><option>Meeting</option><option>Digital</option></select>
                    <input v-model="forms.interaction.date" type="datetime-local" class="fun-input w-full p-2" required>
                    <textarea v-model="forms.interaction.transcript" placeholder="Notes..." class="fun-input w-full p-2 h-20"></textarea>
                </div>
                
                <!-- SKILL -->
                <div v-if="modal.active.includes('skill')" class="space-y-3">
                    <input v-model="forms.skill.skill_name" placeholder="Skill Name" class="fun-input w-full p-2" required>
                    <input v-model="forms.skill.score" type="number" max="100" placeholder="Score (0-100)" class="fun-input w-full p-2" required>
                </div>

                <!-- RELATIONSHIP -->
                <div v-if="modal.active.includes('relationship')" class="space-y-3">
                    <select v-model="forms.relationship.targetId" class="fun-input w-full p-2" required>
                        <option v-for="s in subjects" :value="s.id" v-show="s.id !== selected.id">{{s.full_name}}</option>
                    </select>
                    <input v-model="forms.relationship.type" placeholder="Relationship (e.g. Brother)" class="fun-input w-full p-2" required>
                    <input v-model="forms.relationship.reciprocal" placeholder="Reciprocal (e.g. Sister)" class="fun-input w-full p-2" required>
                </div>
                
                <!-- LOCATION -->
                <div v-if="modal.active.includes('location')" class="space-y-3">
                    <input v-model="forms.location.name" placeholder="Place Name" class="fun-input w-full p-2" required>
                    <div class="flex gap-2">
                        <input v-model="forms.location.lat" placeholder="Lat" class="fun-input w-1/2 p-2" required>
                        <input v-model="forms.location.lng" placeholder="Lng" class="fun-input w-1/2 p-2" required>
                    </div>
                </div>

                <div class="flex gap-2 pt-2">
                    <button type="button" @click="closeModal" class="flex-1 bg-gray-200 py-2 rounded-xl font-bold">Cancel</button>
                    <button class="flex-1 bg-black text-white py-2 rounded-xl font-bold shadow-[3px_3px_0px_#000] active:translate-y-1 active:shadow-none">Save</button>
                </div>
            </form>
        </div>
    </div>

  </div>
</body>
`;
