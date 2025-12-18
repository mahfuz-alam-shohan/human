export const TARGETS_SECTION = `
            <!-- TARGETS LIST -->
            <div v-if="currentTab === 'targets'" class="flex-1 flex flex-col min-h-0 h-full">
                <div class="p-4 border-b-4 border-black bg-white z-10 sticky top-0 shrink-0">
                    <div class="relative max-w-2xl mx-auto">
                        <i class="fa-solid fa-search absolute left-4 top-4 text-gray-400 text-lg"></i>
                        <input v-model="search" placeholder="Find someone..." class="fun-input w-full py-3 pl-12 pr-4 text-lg">
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start touch-scroll">
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
            </div>`;
