export const DASHBOARD_SECTION = `
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
            </div>`;
