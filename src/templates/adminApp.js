import { adminStyles } from './adminStyles.js';
import { adminScript } from './adminScript.js';

export function serveAdminHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-[100dvh]">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>PEOPLE OS // ADMIN</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>${adminStyles}</style>
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
                <p class="text-slate-500 text-lg font-bold">Secure Gateway</p>
            </div>
            <form @submit.prevent="handleAuth" class="space-y-4">
                <input v-model="auth.email" type="email" placeholder="Identity" class="fun-input w-full p-4 text-lg" required>
                <input v-model="auth.password" type="password" placeholder="Passcode" class="fun-input w-full p-4 text-lg" required>
                <button type="submit" :disabled="loading" class="w-full bg-violet-500 hover:bg-violet-400 text-white font-heading font-bold py-4 rounded-xl text-lg fun-btn flex items-center justify-center">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    {{ loading ? 'Verifying...' : 'Access' }}
                </button>
                <div v-if="loading || locationStatus" class="text-center text-xs font-bold text-blue-600 animate-pulse">
                    <i class="fa-solid fa-satellite-dish mr-1"></i> {{ locationStatus }}
                </div>
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
            
            <button @click="refreshApp" :disabled="processing" class="text-gray-400 hover:text-green-500 p-4 transition-colors text-xl"><i class="fa-solid fa-arrows-rotate" :class="{'spin-fast': processing}"></i></button>
            <button @click="openModal('cmd')" class="text-gray-400 hover:text-blue-500 p-4 transition-colors text-xl"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button v-if="can('manage_admins')" @click="openSettings" class="text-gray-400 hover:text-black p-4 transition-colors text-xl"><i class="fa-solid fa-gear"></i></button>
            <button @click="handleLogout" class="text-gray-400 hover:text-red-500 p-4 transition-colors text-xl"><i class="fa-solid fa-power-off"></i></button>
        </nav>

        <!-- MOBILE TOP BAR -->
        <header class="md:hidden h-16 bg-white border-b-4 border-black flex items-center justify-between px-4 z-20 shrink-0 sticky top-0 shadow-lg">
            <div class="flex items-center gap-2">
                <div class="w-10 h-10 bg-violet-500 rounded-lg border-2 border-black flex items-center justify-center text-white text-lg shadow-[2px_2px_0px_#000]"><i class="fa-solid fa-cube"></i></div>
                <span class="font-heading font-black text-xl text-black tracking-tight">People OS</span>
            </div>
            <div class="flex items-center gap-1">
                 <button @click="refreshApp" :disabled="processing" class="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-black hover:bg-green-100 bg-white shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all"><i class="fa-solid fa-arrows-rotate" :class="{'spin-fast': processing}"></i></button>
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
                        <button v-if="can('manage_data')" @click="openModal('add-subject')" class="bg-yellow-300 text-black p-4 rounded-xl fun-btn flex flex-col items-center justify-center gap-1 hover:bg-yellow-400">
                            <i class="fa-solid fa-plus text-3xl"></i><span class="text-xs font-black uppercase font-heading">Add New</span>
                        </button>
                    </div>

                    <div class="fun-card overflow-hidden flex flex-col h-[50vh] md:h-auto border-4">
                        <div class="p-4 border-b-4 border-black flex justify-between items-center bg-white">
                            <h3 class="text-lg font-heading font-black text-black"><i class="fa-solid fa-bolt text-yellow-500 mr-2"></i>Recent Buzz</h3>
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

            <!-- MAP TAB -->
            <div v-if="currentTab === 'map'" class="flex-1 flex h-full relative bg-blue-100 min-h-0 border-4 border-black m-2 md:m-4 rounded-xl overflow-hidden shadow-[4px_4px_0px_#000]">
                <div class="absolute inset-0 z-0" id="warRoomMap"></div>
                <!-- ... map controls ... -->
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

            <!-- NETWORK TAB -->
            <div v-if="currentTab === 'network'" class="flex-1 flex flex-col h-full bg-white relative min-h-0 m-4 border-4 border-black rounded-xl shadow-[4px_4px_0px_#000] overflow-hidden">
                <div id="globalNetworkGraph" class="w-full h-full bg-white"></div>
            </div>

            <!-- SYSTEM / ADMIN MANAGEMENT -->
            <div v-if="currentTab === 'system'" class="flex-1 flex flex-col h-full bg-yellow-50 overflow-hidden">
                 <div class="flex border-b-4 border-black bg-white shrink-0 p-2 gap-2">
                    <button v-for="t in ['Users', 'Logs']" @click="changeSubTab(t.toLowerCase())" :class="subTab === t.toLowerCase() ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'" class="px-4 py-2 text-sm font-black font-heading rounded-lg border-2 border-black transition-all">{{ t }}</button>
                </div>
                
                <!-- USERS SUBTAB -->
                <div v-if="subTab === 'users'" class="flex-1 overflow-y-auto p-4 md:p-8">
                     <div class="max-w-4xl mx-auto">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-black font-heading">Authorized Personnel</h2>
                            <button @click="openModal('admin-editor')" class="bg-violet-500 text-white px-4 py-2 rounded-xl border-2 border-black font-bold shadow-[3px_3px_0px_#000] active:translate-y-1 active:shadow-none hover:bg-violet-600 transition-all"><i class="fa-solid fa-plus mr-2"></i>New Agent</button>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div v-for="admin in adminList" :key="admin.id" class="fun-card p-4 bg-white flex flex-col gap-2 relative group">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="font-black text-lg">{{admin.email}}</div>
                                        <div class="text-xs font-bold uppercase tracking-wider text-gray-500">{{admin.role}}</div>
                                    </div>
                                    <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center border-2 border-black font-bold text-gray-400" :title="admin.role"><i class="fa-solid fa-user-shield"></i></div>
                                </div>
                                <div class="text-[10px] text-gray-400 font-mono mt-auto">ID: {{admin.id.slice(0,8)}}...</div>
                                <div class="mt-2 text-xs font-bold" :class="admin.require_location ? 'text-green-600' : 'text-gray-400'">
                                    <i class="fa-solid" :class="admin.require_location ? 'fa-lock' : 'fa-lock-open'"></i> 
                                    {{ admin.require_location ? 'Location Locked' : 'No Location Req' }}
                                </div>
                                <div class="flex gap-2 mt-2 pt-2 border-t-2 border-gray-100">
                                    <button @click="openModal('admin-editor', admin)" class="text-xs font-bold text-blue-500 hover:text-blue-700">Edit Permissions</button>
                                    <button v-if="admin.id !== 'root'" @click="deleteAdmin(admin.id)" class="text-xs font-bold text-red-500 hover:text-red-700 ml-auto">Revoke</button>
                                </div>
                            </div>
                        </div>
                     </div>
                </div>

                <!-- LOGS SUBTAB -->
                <div v-if="subTab === 'logs'" class="flex-1 flex flex-col md:flex-row overflow-hidden">
                    <div class="w-full md:w-1/3 bg-white border-r-4 border-black overflow-y-auto p-4">
                         <h3 class="font-black font-heading text-xl mb-4">Access Log</h3>
                         <div class="space-y-3">
                             <div v-for="log in adminLogs" :key="log.id" class="p-3 rounded-xl border-2 border-gray-200 text-sm bg-gray-50">
                                 <div class="font-bold">{{log.admin_email}}</div>
                                 <div class="flex justify-between text-xs text-gray-500 mt-1">
                                     <span>{{log.action}}</span>
                                     <span>{{new Date(log.timestamp).toLocaleString()}}</span>
                                 </div>
                                 <div class="text-[10px] font-mono text-gray-400 mt-1">IP: {{log.ip}}</div>
                             </div>
                         </div>
                    </div>
                    <div class="flex-1 bg-blue-100 relative">
                        <div id="adminLogMap" class="absolute inset-0"></div>
                    </div>
                </div>
            </div>

            <!-- SUBJECT DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col min-h-0 h-full bg-white">
                <!-- Header -->
                <div class="min-h-[5rem] h-auto border-b-4 border-black flex items-center px-4 justify-between bg-yellow-50 z-10 sticky top-0 shrink-0 py-2">
                    <div class="flex items-center gap-3 min-w-0">
                        <button @click="changeTab('targets')" class="w-10 h-10 rounded-full flex items-center justify-center text-black border-2 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all shrink-0"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="min-w-0">
                            <div class="font-black font-heading text-xl text-black truncate">{{ selected.full_name }}</div>
                            <div class="text-xs font-bold text-gray-500 truncate uppercase tracking-widest">{{ selected.alias || 'The Profile' }}</div>
                        </div>
                    </div>
                    <div class="flex gap-2 flex-wrap justify-end shrink-0 ml-2 max-w-[50%]">
                        <button @click="exportData" class="hidden md:flex items-center gap-2 bg-white hover:bg-gray-50 text-black px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-download"></i> JSON</button>
                        <button v-if="can('delete_data')" @click="deleteProfile" class="bg-red-400 hover:bg-red-300 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-trash"></i></button>
                        <button v-if="can('manage_data')" @click="openModal('edit-profile')" class="bg-blue-400 hover:bg-blue-300 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-pen"></i></button>
                        <button @click="openModal('share-secure')" class="bg-yellow-400 hover:bg-yellow-300 text-black px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-share-nodes"></i></button>
                    </div>
                </div>
                
                 <div class="flex border-b-4 border-black overflow-x-auto bg-white shrink-0 no-scrollbar p-2 gap-2">
                    <button v-for="t in ['Overview', 'Capabilities', 'Attributes', 'Timeline', 'Map', 'Network', 'Files']" 
                        @click="changeSubTab(t.toLowerCase())" 
                        :class="subTab === t.toLowerCase() ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'"
                        class="px-4 py-2 text-sm font-black font-heading rounded-lg border-2 border-black transition-all whitespace-nowrap">
                        {{ t }}
                    </button>
                </div>

                <div :class="['flex-1 min-h-0 bg-yellow-50', (subTab === 'map' || subTab === 'network') ? 'relative overflow-hidden flex flex-col' : 'overflow-y-auto p-4 md:p-8']">
                    <!-- Overview -->
                    <div v-if="subTab === 'overview'" class="space-y-6 max-w-5xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-[4/5] bg-white rounded-2xl relative overflow-hidden group shadow-[6px_6px_0px_#000] border-4 border-black max-w-[220px] mx-auto md:max-w-none md:mx-0">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                    <button v-if="can('manage_data')" @click="triggerUpload('avatar')" class="hidden md:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 items-center justify-center text-white font-bold transition-all backdrop-blur-sm"><i class="fa-solid fa-camera mr-2"></i> New Pic</button>
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
                                    <div class="flex gap-2 mt-4 flex-wrap"><span v-for="tag in analysisResult?.tags" class="text-[10px] px-3 py-1 bg-violet-200 text-violet-800 rounded-full border-2 border-black font-black">{{tag}}</span></div>
                                </div>
                                <div class="fun-card p-6 md:p-8">
                                     <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Name</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.full_name}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Origin</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.nationality || '???'}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Job</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.occupation || '???'}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Group</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.ideology || '???'}}</div></div>
                                    </div>
                                    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div><div class="flex justify-between mb-2"><label class="text-[10px] text-gray-400 font-black uppercase">Habits</label><button v-if="can('manage_data')" @click="quickAppend('modus_operandi')" class="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-300 hover:bg-blue-200"><i class="fa-solid fa-plus"></i> Add</button></div><div class="text-sm font-bold text-gray-600 bg-gray-50 p-4 rounded-xl h-32 overflow-y-auto whitespace-pre-wrap border-2 border-gray-200">{{selected.modus_operandi || 'Empty...'}}</div></div>
                                        <div><div class="flex justify-between mb-2"><label class="text-[10px] text-gray-400 font-black uppercase">Weakness</label><button v-if="can('manage_data')" @click="quickAppend('weakness')" class="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded border border-red-300 hover:bg-red-200"><i class="fa-solid fa-plus"></i> Add</button></div><div class="text-sm font-bold text-gray-600 bg-gray-50 p-4 rounded-xl h-32 overflow-y-auto whitespace-pre-wrap border-2 border-gray-200">{{selected.weakness || 'Empty...'}}</div></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Capabilities -->
                    <div v-show="subTab === 'capabilities'" class="max-w-5xl mx-auto h-full flex flex-col md:flex-row gap-6">
                        <div class="w-full md:w-1/3 fun-card p-4 space-y-4">
                            <h3 class="font-black font-heading text-lg">Skill Set</h3>
                            <div v-for="skill in ['Leadership', 'Technical', 'Combat', 'Social Eng', 'Observation', 'Stealth']" :key="skill" class="space-y-1">
                                <div class="flex justify-between text-xs font-bold"><span>{{skill}}</span><span>{{ getSkillScore(skill) }}%</span></div>
                                <input type="range" min="0" max="100" :value="getSkillScore(skill)" :disabled="!can('manage_data')" @input="e => updateSkill(skill, e.target.value)" class="w-full accent-violet-500">
                            </div>
                        </div>
                        <div class="flex-1 fun-card p-4 flex items-center justify-center bg-white relative"><div class="absolute top-2 left-2 text-xs font-bold text-gray-400 uppercase">Analysis Radar</div><div class="w-full max-w-md aspect-square relative"><canvas id="skillsChart"></canvas></div></div>
                    </div>
                    
                    <!-- Attributes -->
                    <div v-if="subTab === 'attributes'" class="max-w-5xl mx-auto space-y-6">
                         <div class="flex justify-between items-center"><h3 class="font-black font-heading text-2xl text-black">Intel Ledger</h3><button v-if="can('manage_data')" @click="openModal('add-intel')" class="bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold fun-btn hover:bg-violet-400">Add Stuff</button></div>
                        <div v-for="(items, category) in groupedIntel" :key="category" class="space-y-3">
                            <h4 class="text-sm font-black uppercase text-gray-400 border-b-2 border-gray-300 pb-1 ml-2">{{ category }}</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div v-for="item in items" :key="item.id" class="fun-card p-4 relative group hover:bg-yellow-50">
                                    <div class="text-[10px] text-violet-500 font-black uppercase mb-1">{{item.label}}</div>
                                    <div class="text-black font-bold break-words text-sm">{{item.value}}</div>
                                    <button v-if="can('delete_data')" @click="deleteItem('subject_intel', item.id)" class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold hover:scale-110"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Timeline -->
                    <div v-show="subTab === 'timeline'" class="h-full flex flex-col space-y-4">
                        <div class="flex justify-between items-center"><h3 class="font-black font-heading text-2xl text-black">History Log</h3><button v-if="can('manage_data')" @click="openModal('add-interaction')" class="bg-green-400 text-white hover:bg-green-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Log Event</button></div>
                        <div class="flex-1 fun-card p-6 overflow-y-auto min-h-0 bg-white">
                            <div class="relative pl-8 border-l-4 border-gray-200 space-y-8 my-4">
                                <div v-for="ix in selected.interactions" :key="ix.id" class="relative group">
                                    <div class="absolute -left-[43px] top-1 w-6 h-6 rounded-full bg-white border-4 border-black shadow-sm"></div>
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-2"><span class="text-lg font-black font-heading text-black">{{ix.type}}</span><span class="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded border border-gray-200">{{new Date(ix.date).toLocaleString()}}</span><button v-if="can('delete_data')" @click="deleteItem('subject_interactions', ix.id)" class="ml-auto text-gray-300 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash"></i></button></div>
                                    <div class="bg-gray-50 p-4 rounded-xl text-sm font-bold text-gray-700 border-2 border-gray-200 whitespace-pre-wrap">{{ix.transcript || ix.conclusion}}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Map Detail -->
                    <div v-show="subTab === 'map'" class="h-full flex flex-col relative p-4 md:p-8">
                        <div class="flex justify-between items-center mb-4 shrink-0"><h3 class="font-black font-heading text-2xl text-black">Locations</h3><button v-if="can('manage_data')" @click="openModal('add-location')" class="bg-blue-400 text-white hover:bg-blue-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Add Pin</button></div>
                        <div class="flex-1 flex md:grid md:grid-cols-3 gap-6 min-h-0 relative overflow-hidden">
                            <div class="w-full h-full md:col-span-2 bg-white rounded-2xl overflow-hidden relative border-4 border-black shadow-[4px_4px_0px_#000]"><div id="subjectMap" class="w-full h-full z-0"></div><button @click="showProfileMapList = !showProfileMapList" class="md:hidden absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-sm p-3 rounded-xl border-4 border-black shadow-[2px_2px_0px_#000] font-bold text-sm fun-btn"><i class="fa-solid" :class="showProfileMapList ? 'fa-map' : 'fa-list'"></i> {{ showProfileMapList ? 'Hide List' : 'Locations' }}</button></div>
                            <div :class="['absolute md:static inset-y-0 right-0 w-full md:w-auto bg-white/95 md:bg-transparent z-[401] md:z-auto transition-transform duration-300 transform', 'translate-x-full md:translate-x-0', showProfileMapList ? '!translate-x-0 shadow-2xl' : '']" class="flex flex-col h-full border-l-4 border-black md:border-l-0 md:border-none p-4 md:p-0 overflow-hidden">
                                <div class="space-y-3 overflow-y-auto flex-1 min-h-0 md:pr-1 overscroll-contain pb-4" style="touch-action: pan-y;">
                                    <div v-for="loc in selected.locations" :key="loc.id" class="fun-card p-4 hover:bg-blue-50 border-2 flex flex-col gap-2">
                                        <div class="flex justify-between items-center" @click="flyTo(loc); if(window.innerWidth < 768) showProfileMapList = false;"><div class="font-black text-black text-sm font-heading cursor-pointer">{{loc.name}}</div><span class="text-[10px] uppercase bg-white text-black px-2 py-0.5 rounded border-2 border-black font-bold shadow-[2px_2px_0px_#000]">{{loc.type}}</span></div>
                                        <div class="flex gap-2 justify-end mt-1 pt-2 border-t-2 border-dashed border-gray-200 flex-wrap">
                                            <button @click.stop="copyCoords(loc.lat, loc.lng)" class="text-xs font-bold text-blue-500 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 flex items-center gap-1 shrink-0"><i class="fa-solid fa-copy"></i></button>
                                            <button v-if="can('manage_data')" @click.stop="openModal('edit-location', loc)" class="text-xs font-bold text-green-600 hover:text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 shrink-0"><i class="fa-solid fa-pen"></i> Edit</button>
                                            <button v-if="can('manage_data')" @click.stop="deleteItem('subject_locations', loc.id)" class="text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 shrink-0"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Network Detail WITH FAMILY REPORT -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col p-4 md:p-8">
                         <div class="flex justify-between items-center mb-4"><h3 class="font-black font-heading text-2xl text-black">Connections</h3><button v-if="can('manage_data')" @click="openModal('add-rel')" class="bg-pink-400 text-white hover:bg-pink-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Link Person</button></div>
                         
                         <!-- FAMILY REPORT BLOCK -->
                         <div v-if="selected.familyReport && selected.familyReport.length > 0" class="fun-card p-4 mb-6 border-l-[10px] border-l-purple-400 bg-purple-50">
                             <h4 class="text-lg font-black text-purple-700 mb-3 flex items-center gap-2 font-heading"><i class="fa-solid fa-people-roof"></i> Family</h4>
                             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                 <div v-for="fam in selected.familyReport" class="flex items-center gap-3 p-2 rounded-xl bg-white border-2 border-black shadow-[3px_3px_0px_#000] hover:translate-y-1 hover:shadow-none transition-all cursor-pointer" @click="viewSubject(fam.id)">
                                     <div class="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 border-2 border-black"><img :src="resolveImg(fam.avatar)" class="w-full h-full object-cover"></div>
                                     <div><div class="text-sm font-bold text-black">{{fam.name}}</div><div class="text-[10px] text-purple-600 uppercase tracking-wide font-black">{{fam.role}}</div></div>
                                 </div>
                             </div>
                        </div>

                         <div class="flex-1 fun-card border-4 border-black relative overflow-hidden min-h-[400px]"><div id="relNetwork" class="absolute inset-0"></div></div>
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
                                        <button v-if="can('manage_data')" @click="openModal('edit-rel', rel)" class="text-gray-400 hover:text-blue-500 p-2"><i class="fa-solid fa-pen"></i></button>
                                        <button v-if="can('manage_data')" @click="deleteItem('subject_relationships', rel.id)" class="text-gray-400 hover:text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Files -->
                     <div v-if="subTab === 'files'" class="space-y-6">
                         <div class="flex gap-4" v-if="can('manage_data')">
                            <div @click="triggerUpload('media')" class="h-28 w-32 rounded-2xl border-4 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-500 transition-all text-gray-400 group"><i class="fa-solid fa-cloud-arrow-up text-3xl mb-1 group-hover:scale-110 transition-transform"></i><span class="text-xs font-black uppercase">Upload</span></div>
                            <div @click="openModal('add-media-link')" class="h-28 w-32 rounded-2xl border-4 border-gray-200 bg-white flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all text-gray-400 hover:text-black gap-1 group"><i class="fa-solid fa-link text-2xl group-hover:scale-110 transition-transform"></i><span class="text-xs font-black uppercase">Link</span></div>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div v-for="m in selected.media" :key="m.id" class="fun-card group relative aspect-square overflow-hidden bg-white p-2">
                                <div class="w-full h-full rounded-lg overflow-hidden border-2 border-gray-200 relative">
                                    <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transition-transform group-hover:scale-110" onerror="this.src='https://placehold.co/400?text=IMG'">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50"><i class="fa-solid fa-file text-5xl"></i></div>
                                </div>
                                <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0 z-10"></a>
                                <button v-if="can('delete_data')" @click.stop="deleteItem('subject_media', m.id)" class="absolute top-0 right-0 bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-bl-xl font-bold shadow-sm z-20 hover:bg-red-600 border-l-2 border-b-2 border-white"><i class="fa-solid fa-times"></i></button>
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
    <div v-if="modal.active && modal.active !== 'mini-profile'" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-2xl fun-card flex flex-col max-h-[90vh] animate-bounce-in overflow-hidden border-4">
             <div class="flex justify-between items-center p-4 border-b-4 border-black bg-yellow-300">
                <h3 class="font-black text-xl text-black font-heading">{{ modalTitle }}</h3>
                <button @click="closeModal" class="w-8 h-8 rounded-full flex items-center justify-center bg-white border-2 border-black shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all"><i class="fa-solid fa-xmark font-bold"></i></button>
            </div>
            
            <div class="overflow-y-auto p-4 md:p-6 space-y-6 bg-white">
                <!-- CMD -->
                <div v-if="modal.active === 'cmd'">
                    <input ref="cmdInput" v-model="cmdQuery" placeholder="Start typing..." class="fun-input w-full p-4 text-xl mb-4">
                    <div class="space-y-2"><div v-for="res in cmdResults" @click="res.action" class="p-3 rounded-xl hover:bg-blue-100 cursor-pointer flex justify-between items-center border-2 border-gray-100 hover:border-black transition-all group"><div><div class="font-black text-lg text-black font-heading">{{res.title}}</div><div class="text-xs font-bold text-gray-500">{{res.desc}}</div></div><i class="fa-solid fa-arrow-right text-gray-300 group-hover:text-black font-bold"></i></div></div>
                </div>

                <!-- ADMIN EDITOR (NEW) -->
                <form v-if="modal.active === 'admin-editor'" @submit.prevent="submitAdmin" class="space-y-6">
                    <div class="space-y-4">
                        <label class="block text-xs font-black uppercase text-gray-400">Credentials</label>
                        <input v-model="adminForm.email" type="email" placeholder="Email Address" class="fun-input w-full p-3 text-sm" required>
                        <input v-model="adminForm.password" type="password" :placeholder="adminForm.id ? 'Leave blank to keep current password' : 'Password'" class="fun-input w-full p-3 text-sm" :required="!adminForm.id">
                        
                        <!-- Role Selector (Only editable for adding/editing Sub-Admins) -->
                        <select v-if="adminForm.role !== 'super_admin'" v-model="adminForm.role" class="fun-input w-full p-3 text-sm">
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                        </select>
                        <!-- For Super Admin, just show label -->
                        <div v-else class="text-xs font-bold text-gray-500 uppercase tracking-wider p-2 bg-gray-100 rounded border border-gray-300">
                            Role: Super Admin (Fixed)
                        </div>
                    </div>

                    <!-- NEW: Require Location Checkbox (Hidden for Super Admin) -->
                    <div v-if="adminForm.role !== 'super_admin'" class="flex items-center gap-3 p-4 bg-yellow-100 border-2 border-yellow-400 rounded-xl">
                        <input type="checkbox" id="reqLoc" v-model="adminForm.requireLocation" class="w-6 h-6 accent-yellow-600 rounded cursor-pointer">
                        <div>
                            <label for="reqLoc" class="block font-bold text-sm text-yellow-900 cursor-pointer">Require Location for Login</label>
                            <div class="text-xs text-yellow-700">If checked, this admin MUST enable GPS to access the system.</div>
                        </div>
                    </div>

                    <div v-if="adminForm.role !== 'super_admin'" class="pt-4 border-t-2 border-gray-200">
                        <label class="block text-xs font-black uppercase text-gray-400 mb-2">Access Control</label>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <label v-for="perm in PERMISSION_KEYS" :key="perm.key" class="flex items-center gap-3 p-3 rounded-lg border-2 border-transparent bg-gray-50 hover:bg-gray-100 cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:border-blue-300 transition-all">
                                <input type="checkbox" v-model="adminForm.permissions[perm.key]" class="w-5 h-5 accent-blue-600 rounded">
                                <span class="text-sm font-bold">{{ perm.label }}</span>
                            </label>
                        </div>
                    </div>

                    <button type="submit" :disabled="processing" class="w-full bg-violet-500 hover:bg-violet-400 text-white font-black font-heading py-4 rounded-xl text-lg fun-btn">{{ processing ? 'Saving...' : 'Save Agent' }}</button>
                </form>

                <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"><div class="space-y-4"><label class="block text-xs font-black uppercase text-gray-400">Who is it?</label><input v-model="forms.subject.full_name" placeholder="Full Name *" class="fun-input w-full p-3 text-sm" required><input v-model="forms.subject.alias" placeholder="Nickname" class="fun-input w-full p-3 text-sm"><input v-model="forms.subject.occupation" list="list-occupations" placeholder="Job" class="fun-input w-full p-3 text-sm"><input v-model="forms.subject.nationality" list="list-nationalities" placeholder="Origin" class="fun-input w-full p-3 text-sm"></div><div class="space-y-4"><label class="block text-xs font-black uppercase text-gray-400">Details</label><select v-model="forms.subject.threat_level" class="fun-input w-full p-3 text-sm"><option value="Low">🟢 Low Priority</option><option value="Medium">🟡 Medium Priority</option><option value="High">🟠 High Priority</option><option value="Critical">🔴 Critical</option></select><div class="grid grid-cols-2 gap-2"><input type="date" v-model="forms.subject.dob" class="fun-input w-full p-3 text-sm text-gray-500"><input type="number" v-model="forms.subject.age" placeholder="Age" class="fun-input w-full p-3 text-sm"></div><input v-model="forms.subject.ideology" list="list-ideologies" placeholder="Team/Group" class="fun-input w-full p-3 text-sm"></div></div>
                    <div class="pt-4 border-t-2 border-gray-200"><h4 class="text-xs font-black uppercase text-gray-400 mb-4">Stats</h4><div class="grid grid-cols-2 md:grid-cols-4 gap-4"><input v-model="forms.subject.height" placeholder="Height" class="fun-input p-2 text-xs"><input v-model="forms.subject.weight" placeholder="Weight" class="fun-input p-2 text-xs"><input v-model="forms.subject.blood_type" placeholder="Blood" class="fun-input p-2 text-xs"></div></div>
                    <div class="space-y-4"><label class="block text-xs font-black uppercase text-gray-400">Secret Notes</label><textarea v-model="forms.subject.modus_operandi" placeholder="Habits..." rows="3" class="fun-input w-full p-3 text-sm"></textarea><textarea v-model="forms.subject.weakness" placeholder="Weakness..." rows="3" class="fun-input w-full p-3 text-sm"></textarea></div>
                    <button type="submit" :disabled="processing" class="w-full bg-violet-500 hover:bg-violet-400 text-white font-black font-heading py-4 rounded-xl text-lg fun-btn">{{ processing ? 'Saving...' : 'Save This Person' }}</button>
                </form>

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

                 <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <select v-model="forms.intel.category" class="fun-input w-full p-3 text-sm"><option>General</option><option>Contact Info</option><option>Social Media</option><option>Education</option><option>Financial</option><option>Medical</option><option>Family</option></select>
                    <input v-model="forms.intel.label" placeholder="Label (e.g. Phone)" class="fun-input w-full p-3 text-sm" required>
                    <textarea v-model="forms.intel.value" @input="handleIntelInput" placeholder="Value" rows="3" class="fun-input w-full p-3 text-sm" required></textarea>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-blue-500">Add Info</button>
                 </form>

                 <form v-if="modal.active === 'add-media-link'" @submit.prevent="submitMediaLink" class="space-y-4">
                    <input v-model="forms.mediaLink.url" placeholder="Paste URL Here" class="fun-input w-full p-3 text-sm" required>
                    <input v-model="forms.mediaLink.description" placeholder="What is it?" class="fun-input w-full p-3 text-sm">
                    <select v-model="forms.mediaLink.type" class="fun-input w-full p-3 text-sm"><option value="image/jpeg">Image</option><option value="application/pdf">Document</option><option value="video/mp4">Video</option><option value="text/plain">Other</option></select>
                    <button type="submit" :disabled="processing" class="w-full bg-pink-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-pink-500">Save Link</button>
                 </form>
                 
                 <form v-if="['add-location', 'edit-location'].includes(modal.active)" @submit.prevent="submitLocation" class="space-y-4">
                    <div class="relative"><input v-model="locationSearchQuery" @input="debounceSearch" placeholder="Find place..." class="fun-input w-full p-3 pl-10 text-sm"><i class="fa-solid fa-search absolute left-3 top-3.5 text-gray-400"></i><div v-if="locationSearchResults.length" class="absolute w-full bg-white border-2 border-black max-h-48 overflow-y-auto mt-1 shadow-xl rounded-xl z-50"><div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-yellow-100 cursor-pointer text-xs border-b border-gray-100 font-bold text-gray-700">{{ res.display_name }}</div></div></div>
                    <div class="h-48 w-full bg-gray-100 rounded-xl border-2 border-black relative overflow-hidden"><div id="locationPickerMap" class="absolute inset-0 z-0"></div></div>
                    <div class="grid grid-cols-2 gap-2"><div><label class="text-[10px] font-bold text-gray-500 uppercase">Latitude</label><input v-model.number="forms.location.lat" type="number" step="any" placeholder="0.0000" class="fun-input w-full p-2 text-xs" @input="updatePickerMarker"></div><div><label class="text-[10px] font-bold text-gray-500 uppercase">Longitude</label><input v-model.number="forms.location.lng" type="number" step="any" placeholder="0.0000" class="fun-input w-full p-2 text-xs" @input="updatePickerMarker"></div></div>
                    <input v-model="forms.location.name" placeholder="Name (e.g. Secret Base)" class="fun-input w-full p-3 text-sm">
                    <select v-model="forms.location.type" class="fun-input w-full p-3 text-sm"><option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Other</option></select>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-500 text-white font-black py-4 rounded-xl fun-btn hover:bg-blue-600">{{ modal.active === 'edit-location' ? 'Update Pin' : 'Drop Pin' }}</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4"><input type="datetime-local" v-model="forms.interaction.date" class="fun-input p-3 text-sm" required><select v-model="forms.interaction.type" class="fun-input p-3 text-sm"><option>Meeting</option><option>Call</option><option>Email</option><option>Event</option><option>Observation</option></select></div>
                    <textarea v-model="forms.interaction.transcript" placeholder="What happened?" rows="5" class="fun-input w-full p-3 text-sm"></textarea>
                    <button type="submit" :disabled="processing" class="w-full bg-orange-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-orange-500">Log It</button>
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
                <img v-if="resolveImg(modal.data.avatar_path)" :src="resolveImg(modal.data.avatar_path)" class="w-full h-full object-cover">
                <div v-else class="w-full h-full flex items-center justify-center text-4xl font-black text-gray-300">{{modal.data.full_name.charAt(0)}}</div>
            </div>
            <h3 class="text-2xl font-black text-black mb-1 font-heading">{{modal.data.full_name}}</h3>
            <div class="flex flex-wrap justify-center gap-2 mb-6"><span class="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full border-2 border-gray-200">{{modal.data.occupation || 'No Job'}}</span><span v-if="modal.data.threat_level" class="text-xs font-bold px-3 py-1 rounded-full border-2" :class="getThreatColor(modal.data.threat_level, true)">{{modal.data.threat_level}}</span></div>
            <button @click="viewSubject(modal.data.id)" class="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-3 rounded-xl text-lg fun-btn shadow-[3px_3px_0px_#000] active:shadow-none active:translate-y-1">Open Folder</button>
        </div>
    </div>
  </div>
  <script>${adminScript}</script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
