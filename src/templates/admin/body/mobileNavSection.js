export const MOBILE_NAV_SECTION = `
        <!-- MOBILE NAV -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 h-auto min-h-[4rem] bg-white border-t-4 border-black flex justify-around items-center z-50 safe-area-pb py-1 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
            <button v-for="t in visibleTabs" @click="changeTab(t.id)" :class="currentTab === t.id ? 'text-black translate-y-[-4px]' : 'text-gray-400'" class="flex flex-col items-center justify-center w-full h-full p-2 active:bg-gray-100 transition-all">
                <i :class="t.icon" class="text-2xl mb-1 drop-shadow-md"></i>
                <span class="text-[10px] font-black uppercase tracking-wide">{{t.label}}</span>
            </button>
        </nav>`;
