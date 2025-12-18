export const SIDEBAR_SECTION = `
        <!-- SIDEBAR (Desktop) -->
        <nav class="hidden md:flex flex-col w-24 bg-white border-r-4 border-black items-center py-6 z-20 shrink-0">
            <div class="mb-8 text-yellow-500 text-4xl drop-shadow-[2px_2px_0px_#000]"><i class="fa-solid fa-cube"></i></div>
            <div class="flex-1 space-y-4 w-full px-3">
                <button v-for="t in tabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'bg-pink-300 text-black shadow-[3px_3px_0px_#000]' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'" class="w-full aspect-square rounded-2xl border-4 border-black flex flex-col items-center justify-center gap-1 transition-all group active:translate-y-1 active:shadow-none" :title="t.label">
                    <i :class="t.icon" class="text-2xl group-hover:scale-110 transition-transform"></i>
                    <span class="text-[10px] font-heading font-bold uppercase tracking-wider">{{t.label}}</span>
                </button>
            </div>
            
            <!-- Desktop Refresh Button -->
            <button @click="refreshApp" :disabled="processing" class="text-gray-400 hover:text-green-500 p-4 transition-colors text-xl" title="Refresh Data">
                <i class="fa-solid fa-arrows-rotate" :class="{'spin-fast': processing}"></i>
            </button>

            <button @click="openModal('cmd')" class="text-gray-400 hover:text-blue-500 p-4 transition-colors text-xl"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button @click="openSettings" class="text-gray-400 hover:text-black p-4 transition-colors text-xl"><i class="fa-solid fa-gear"></i></button>
            <button @click="handleLogout" class="text-gray-400 hover:text-red-500 p-4 transition-colors text-xl"><i class="fa-solid fa-power-off"></i></button>
        </nav>`;
