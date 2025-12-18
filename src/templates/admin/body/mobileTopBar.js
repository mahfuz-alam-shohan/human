export const MOBILE_TOP_BAR_SECTION = `
        <!-- MOBILE TOP BAR -->
        <header class="md:hidden h-16 bg-white border-b-4 border-black flex items-center justify-between px-4 z-20 shrink-0 sticky top-0 shadow-lg">
            <div class="flex items-center gap-2">
                <div class="w-10 h-10 bg-violet-500 rounded-lg border-2 border-black flex items-center justify-center text-white text-lg shadow-[2px_2px_0px_#000]">
                    <i class="fa-solid fa-cube"></i>
                </div>
                <span class="font-heading font-black text-xl text-black tracking-tight">People OS</span>
            </div>
            <div class="flex items-center gap-1">
                 <!-- Mobile Refresh Button -->
                 <button @click="refreshApp" :disabled="processing" class="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-black hover:bg-green-100 bg-white shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all">
                    <i class="fa-solid fa-arrows-rotate" :class="{'spin-fast': processing}"></i>
                 </button>
                 <button @click="openModal('cmd')" class="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-black hover:bg-yellow-100 bg-white shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none"><i class="fa-solid fa-magnifying-glass"></i></button>
            </div>
        </header>`;
