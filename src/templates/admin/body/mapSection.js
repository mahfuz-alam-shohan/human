export const GLOBAL_MAP_SECTION = `
            <!-- GLOBAL MAP TAB -->
            <div v-if="currentTab === 'map'" class="flex-1 flex h-full relative bg-blue-100 min-h-0 border-4 border-black m-2 md:m-4 rounded-xl overflow-hidden shadow-[4px_4px_0px_#000]">
                <div class="absolute inset-0 z-0" id="warRoomMap"></div>
                <div class="absolute top-4 left-1/2 -translate-x-1/2 z-[400] w-[calc(100%-2rem)] max-w-[18rem] sm:max-w-[20rem] md:w-80 md:max-w-none px-1 md:px-0">
                    <div class="relative group">
                        <input v-model="mapSearchQuery" @input="updateMapFilter" placeholder="Scout Map..." class="w-full bg-white border-4 border-black rounded-full py-2 pl-10 pr-4 font-bold text-sm shadow-[4px_4px_0px_#000] focus:outline-none focus:translate-y-1 focus:shadow-none transition-all">
                        <i class="fa-solid fa-crosshairs absolute left-3.5 top-3 text-black"></i>
                    </div>
                </div>
                <div class="absolute top-16 left-3 right-3 md:left-4 md:right-auto bottom-4 md:w-72 max-w-[26rem] fun-card z-[400] flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 p-0" :class="{'translate-x-0': showMapSidebar, '-translate-x-[120%]': !showMapSidebar}">
                    <div class="p-3 border-b-4 border-black flex justify-between items-center bg-yellow-200">
                        <h3 class="font-black font-heading text-black">Active Points</h3>
                        <div class="text-xs font-bold bg-white border-2 border-black text-black px-2 py-0.5 rounded-md">{{filteredMapData.length}}</div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 space-y-2 bg-white min-h-0 touch-scroll">
                        <div v-for="loc in filteredMapData" @click="flyToGlobal(loc)" class="p-2 rounded-xl hover:bg-gray-100 cursor-pointer border-2 border-transparent hover:border-black transition-all flex items-center gap-3">
                             <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-black bg-gray-100 shrink-0"><img :src="resolveImg(loc.avatar_path) || 'https://ui-avatars.com/api/?name='+loc.full_name" class="w-full h-full object-cover"></div>
                             <div class="min-w-0"><div class="font-bold text-sm text-black truncate font-heading">{{loc.full_name}}</div><div class="text-[10px] font-bold text-gray-500 truncate">{{loc.name}}</div></div>
                        </div>
                    </div>
                </div>
                <button @click="showMapSidebar = !showMapSidebar" class="absolute top-16 left-3 md:left-4 z-[401] bg-white p-3 rounded-xl shadow-[4px_4px_0px_#000] text-black border-4 border-black fun-btn" v-if="!showMapSidebar"><i class="fa-solid fa-list-ul"></i></button>
            </div>`;
