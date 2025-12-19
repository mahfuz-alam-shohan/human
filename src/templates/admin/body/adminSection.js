export const ADMIN_SECTION = `
            <div v-if="currentTab === 'admins'" class="flex-1 overflow-y-auto p-4 md:p-8 bg-yellow-50">
                <div class="max-w-6xl mx-auto space-y-6">
                    <div class="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h2 class="text-2xl font-heading font-black text-black flex items-center gap-2"><i class="fa-solid fa-user-shield text-purple-500"></i> Admin Control</h2>
                            <p class="text-sm font-bold text-gray-500">Master admin controls access to every menu.</p>
                        </div>
                        <button @click="fetchAdminConsole" class="bg-white border-2 border-black px-4 py-2 rounded-xl font-bold hover:bg-gray-50 shadow-[3px_3px_0px_#000] active:translate-y-1 active:shadow-none"><i class="fa-solid fa-rotate"></i> Refresh</button>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="fun-card p-5 space-y-4 border-4 border-black">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-xl font-heading font-black text-black">{{ editingAdminId ? 'Edit Admin' : 'Add Admin' }}</h3>
                                    <p class="text-xs font-bold text-gray-500">{{ editingAdminId ? 'Updating '+forms.admin.email : 'Create a trusted operator' }}</p>
                                </div>
                                <button v-if="editingAdminId" @click="resetAdminForm" class="text-xs font-bold text-blue-500 hover:text-blue-700"><i class="fa-solid fa-rotate-left"></i> Reset</button>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input v-model="forms.admin.email" placeholder="Email" class="fun-input p-3 text-sm">
                                <input v-model="forms.admin.password" type="password" placeholder="Password" class="fun-input p-3 text-sm" :required="!editingAdminId">
                            </div>
                            <div class="flex flex-wrap gap-3">
                                <label class="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border-2 border-black shadow-sm cursor-pointer">
                                    <input type="checkbox" v-model="forms.admin.is_master" class="accent-black w-4 h-4">
                                    <span class="text-xs font-black text-purple-700">Master</span>
                                </label>
                                <label class="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border-2 border-black shadow-sm cursor-pointer">
                                    <input type="checkbox" v-model="forms.admin.is_disabled" class="accent-black w-4 h-4">
                                    <span class="text-xs font-black text-red-700">Disabled</span>
                                </label>
                            </div>

                            <div class="border-2 border-dashed border-gray-200 rounded-xl p-3 space-y-3 bg-white">
                                <div class="text-xs font-black uppercase text-gray-400">Main Tabs</div>
                                <div class="flex flex-wrap gap-2">
                                    <label v-for="tab in [{id:'dashboard',label:'Briefing'},{id:'targets',label:'Database'},{id:'map',label:'Global Map'},{id:'network',label:'Network'},{id:'admins',label:'Admins'}]" :key="tab.id" class="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg border-2 border-transparent has-[:checked]:border-black has-[:checked]:bg-white cursor-pointer">
                                        <input type="checkbox" :value="tab.id" v-model="forms.admin.allowedSections.mainTabs" class="accent-black w-4 h-4">
                                        <span class="text-xs font-bold">{{tab.label}}</span>
                                    </label>
                                </div>
                            </div>

                            <div class="border-2 border-dashed border-gray-200 rounded-xl p-3 space-y-3 bg-white">
                                <div class="text-xs font-black uppercase text-gray-400">Profile Tabs</div>
                                <div class="grid grid-cols-2 gap-2">
                                    <label v-for="tab in [{id:'overview',label:'Overview'},{id:'capabilities',label:'Capabilities'},{id:'attributes',label:'Intel'},{id:'timeline',label:'History'},{id:'map',label:'Map'},{id:'network',label:'Network'},{id:'files',label:'Files'}]" :key="tab.id" class="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg border-2 border-transparent has-[:checked]:border-black has-[:checked]:bg-white cursor-pointer">
                                        <input type="checkbox" :value="tab.id" v-model="forms.admin.allowedSections.subjectTabs" class="accent-black w-4 h-4">
                                        <span class="text-xs font-bold">{{tab.label}}</span>
                                    </label>
                                </div>
                            </div>

                            <div class="border-2 border-dashed border-gray-200 rounded-xl p-3 space-y-2 bg-white">
                                <div class="text-xs font-black uppercase text-gray-400">Permissions</div>
                                <div class="grid grid-cols-2 gap-2">
                                    <label v-for="perm in [
                                        {id:'createSubjects',label:'Create Profiles'},
                                        {id:'editSubjects',label:'Edit Profiles'},
                                        {id:'deleteSubjects',label:'Delete Profiles'},
                                        {id:'manageIntel',label:'Intel & Notes'},
                                        {id:'manageLocations',label:'Locations'},
                    {id:'manageRelationships',label:'Relationships'},
                    {id:'manageFiles',label:'Files'},
                    {id:'manageShares',label:'Sharing'}
                                    ]" :key="perm.id" class="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg border-2 border-transparent has-[:checked]:border-black has-[:checked]:bg-white cursor-pointer">
                                        <input type="checkbox" v-model="forms.admin.allowedSections.permissions[perm.id]" class="accent-black w-4 h-4">
                                        <span class="text-xs font-bold">{{perm.label}}</span>
                                    </label>
                                </div>
                            </div>

                            <button @click="saveAdmin" :disabled="processing" class="w-full bg-purple-500 text-white font-black py-3 rounded-xl fun-btn hover:bg-purple-400 shadow-[4px_4px_0px_#000] active:shadow-none active:translate-y-1">
                                <i class="fa-solid fa-floppy-disk mr-2"></i>{{ processing ? 'Saving...' : (editingAdminId ? 'Update Admin' : 'Create Admin') }}
                            </button>
                        </div>

                        <div class="space-y-4">
                            <div class="fun-card p-4 border-4 border-black space-y-3">
                                <div class="flex items-center justify-between">
                                    <h3 class="font-heading font-black text-lg text-black">Team</h3>
                                    <span class="text-xs font-bold text-gray-500">{{admins.length}} total</span>
                                </div>
                                <div class="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                                    <div v-for="adm in admins" :key="adm.id" class="border-2 border-black rounded-xl p-3 bg-white flex flex-col gap-2">
                                        <div class="flex items-center justify-between gap-2">
                                            <div>
                                                <div class="font-black text-black">{{adm.email}}</div>
                                                <div class="text-[10px] font-bold uppercase text-gray-500">{{adm.is_master ? 'Master' : 'Standard'}} <span v-if="adm.is_disabled" class="text-red-600 ml-1">(Disabled)</span></div>
                                            </div>
                                            <div class="flex gap-2">
                                                <button @click="editAdmin(adm)" class="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded border-2 border-blue-300 hover:bg-blue-200">Edit</button>
                                                <button @click="toggleAdminStatus(adm)" class="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded border-2 border-gray-300 hover:bg-gray-200">{{adm.is_disabled ? 'Enable' : 'Disable'}}</button>
                                                <button @click="forceLogoutAdmin(adm)" class="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded border-2 border-red-300 hover:bg-red-200" :disabled="adm.id === adminProfile.id">Logout</button>
                                            </div>
                                        </div>
                                        <div class="text-[11px] font-bold text-gray-600 flex flex-wrap gap-1">
                                            <span v-for="tab in adm.allowed_sections.mainTabs" class="px-2 py-1 bg-gray-100 rounded border border-gray-300">#{{tab}}</span>
                                        </div>
                                        <div class="text-[10px] text-gray-500 font-bold">Last login: {{ adm.last_login_at ? new Date(adm.last_login_at).toLocaleString() : 'Never' }}</div>
                                    </div>
                                </div>
                            </div>

                            <div class="fun-card p-4 border-4 border-black space-y-2">
                                <div class="flex items-center justify-between">
                                    <h3 class="font-heading font-black text-lg text-black">Login Activity</h3>
                                    <span class="text-xs font-bold text-gray-500">Latest 200</span>
                                </div>
                                <div class="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                                    <div v-for="log in adminLogs" :key="log.id" class="p-3 bg-gray-100 rounded-lg border-2 border-gray-200">
                                        <div class="text-sm font-black text-black">{{log.email || 'Unknown'}}</div>
                                        <div class="text-[11px] font-bold text-gray-600">{{ new Date(log.logged_in_at).toLocaleString() }} • {{log.ip_address || 'Unknown IP'}}</div>
                                        <div class="text-[10px] font-mono text-gray-400 truncate">{{log.user_agent}}</div>
                                    </div>
                                    <div v-if="adminLogs.length === 0" class="text-center text-gray-400 font-bold py-4 text-sm">No logins recorded yet.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
`;
