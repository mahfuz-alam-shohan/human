export const SUBJECT_DETAIL_SECTION = `
            <!-- SUBJECT DETAIL -->
            <div v-if="currentTab === 'detail' && selected" class="flex-1 flex flex-col min-h-0 h-full bg-white">
                
                <!-- HEADER (FIXED HEIGHT) -->
                <div class="min-h-[5rem] h-auto border-b-4 border-black flex items-start md:items-center px-4 justify-between bg-yellow-50 z-10 sticky top-0 shrink-0 py-2 flex-wrap gap-3 md:gap-4">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        <button @click="changeTab('targets')" class="w-10 h-10 rounded-full flex items-center justify-center text-black border-2 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all shrink-0"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="min-w-0">
                            <div class="font-black font-heading text-xl text-black truncate">{{ selected.full_name }}</div>
                            <div class="text-xs font-bold text-gray-500 truncate uppercase tracking-widest">{{ selected.alias || 'The Profile' }}</div>
                        </div>
                    </div>
                    <!-- WRAP ADDED HERE -->
                    <div class="flex gap-2 flex-wrap justify-end shrink-0 ml-auto md:ml-2 w-full md:w-auto">
                        <button @click="exportData" class="hidden md:flex items-center gap-2 bg-white hover:bg-gray-50 text-black px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all whitespace-nowrap"><i class="fa-solid fa-download"></i> JSON</button>
                        <button v-if="hasPermission('deleteSubjects')" @click="deleteProfile" class="bg-red-400 hover:bg-red-300 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-trash"></i></button>
                        <button v-if="hasPermission('editSubjects')" @click="openModal('edit-profile')" class="bg-blue-400 hover:bg-blue-300 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-pen"></i></button>
                        <button v-if="hasPermission('manageShares')" @click="openModal('share-secure')" class="bg-yellow-400 hover:bg-yellow-300 text-black px-3 py-2 rounded-lg text-xs font-bold border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-y-1 transition-all"><i class="fa-solid fa-share-nodes"></i></button>
                    </div>
                </div>

                <!-- SUB TABS -->
                <div class="flex border-b-4 border-black overflow-x-auto bg-white shrink-0 no-scrollbar touch-scroll p-2 gap-2">
                    <button v-for="t in visibleSubjectTabs" 
                        @click="changeSubTab(t)" 
                        :class="subTab === t ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'"
                        class="px-4 py-2 text-sm font-black font-heading rounded-lg border-2 border-black transition-all whitespace-nowrap">
                        {{ subjectTabLabels[t] || t }}
                    </button>
                </div>

                <!-- DETAIL CONTENT WRAPPER -->
                <!-- UPDATED: Fixed constraints for map view scrolling -->
                <div :class="['flex-1 min-h-0 bg-yellow-50', (subTab === 'map' || subTab === 'network') ? 'relative overflow-hidden flex flex-col' : 'overflow-y-auto p-4 md:p-8']">
                    
                    <!-- OVERVIEW -->
                    <div v-if="subTab === 'overview'" class="space-y-6 max-w-5xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-4">
                                <div class="aspect-[4/5] bg-white rounded-2xl relative overflow-hidden group shadow-[6px_6px_0px_#000] border-4 border-black max-w-[220px] mx-auto md:max-w-none md:mx-0">
                                    <img :src="resolveImg(selected.avatar_path)" class="w-full h-full object-cover">
                                    <button @click="triggerUpload('avatar')" class="hidden md:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 items-center justify-center text-white font-bold transition-all backdrop-blur-sm">
                                        <i class="fa-solid fa-camera mr-2"></i> New Pic
                                    </button>
                                    <button @click="triggerUpload('avatar')" class="md:hidden absolute bottom-3 right-3 bg-blue-500 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg border-2 border-white z-10 active:scale-90 transition-transform">
                                        <i class="fa-solid fa-camera"></i>
                                    </button>
                                </div>
                                <div class="fun-card p-4 text-center">
                                    <div class="text-xs text-gray-400 font-black uppercase mb-1">Threat Level</div>
                                    <span class="text-xl font-black px-3 py-1 rounded-lg border-2 border-black inline-block" :class="getThreatColor(selected.threat_level, true)">{{selected.threat_level}}</span>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-6">
                                <div class="fun-card p-6 border-l-[10px] border-l-blue-500">
                                    <h3 class="text-lg font-heading font-black text-blue-600 mb-2">The Gist</h3>
                                    <p class="text-base font-bold text-gray-700 leading-relaxed">{{ (analysisResult && analysisResult.summary) || 'Not enough info yet!' }}</p>
                                    <div class="flex gap-2 mt-4 flex-wrap">
                                        <span v-for="tag in (analysisResult && analysisResult.tags ? analysisResult.tags : [])" class="text-[10px] px-3 py-1 bg-violet-200 text-violet-800 rounded-full border-2 border-black font-black">{{tag}}</span>
                                    </div>
                                </div>
                                <div class="fun-card p-6 md:p-8">
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Name</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.full_name}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Origin</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.nationality || '???'}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Job</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.occupation || '???'}}</div></div>
                                        <div><label class="text-[10px] text-gray-400 font-black uppercase block mb-1">Group</label><div class="text-xl font-bold text-black border-b-2 border-gray-200 pb-1">{{selected.ideology || '???'}}</div></div>
                                    </div>
                                    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <div class="flex justify-between mb-2"><label class="text-[10px] text-gray-400 font-black uppercase">Habits</label><button @click="quickAppend('modus_operandi')" :disabled="!hasPermission('editSubjects')" class="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-300 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"><i class="fa-solid fa-plus"></i> Add</button></div>
                                            <div class="text-sm font-bold text-gray-600 bg-gray-50 p-4 rounded-xl h-32 overflow-y-auto whitespace-pre-wrap border-2 border-gray-200">{{selected.modus_operandi || 'Empty...'}}</div>
                                        </div>
                                        <div>
                                            <div class="flex justify-between mb-2"><label class="text-[10px] text-gray-400 font-black uppercase">Weakness</label><button @click="quickAppend('weakness')" :disabled="!hasPermission('editSubjects')" class="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded border border-red-300 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"><i class="fa-solid fa-plus"></i> Add</button></div>
                                            <div class="text-sm font-bold text-gray-600 bg-gray-50 p-4 rounded-xl h-32 overflow-y-auto whitespace-pre-wrap border-2 border-gray-200">{{selected.weakness || 'Empty...'}}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- CAPABILITIES -->
                    <div v-show="subTab === 'capabilities'" class="max-w-5xl mx-auto h-full flex flex-col md:flex-row gap-6">
                        <div class="w-full md:w-1/3 fun-card p-4 space-y-4">
                            <h3 class="font-black font-heading text-lg">Skill Set</h3>
                            <div v-for="skill in ['Leadership', 'Technical', 'Combat', 'Social Eng', 'Observation', 'Stealth']" :key="skill" class="space-y-1">
                                <div class="flex justify-between text-xs font-bold">
                                    <span>{{skill}}</span>
                                    <span>{{ getSkillScore(skill) }}%</span>
                                </div>
                                <input type="range" min="0" max="100" :value="getSkillScore(skill)" @input="e => updateSkill(skill, e.target.value)" class="w-full accent-violet-500" :disabled="!hasPermission('manageIntel')">
                            </div>
                        </div>
                        <div class="flex-1 fun-card p-4 flex items-center justify-center bg-white relative">
                            <div class="absolute top-2 left-2 text-xs font-bold text-gray-400 uppercase">Analysis Radar</div>
                            <div class="w-full max-w-md aspect-square relative">
                                <canvas id="skillsChart"></canvas>
                            </div>
                        </div>
                    </div>
                    
                    <!-- ATTRIBUTES -->
                    <div v-if="subTab === 'attributes'" class="max-w-5xl mx-auto space-y-6">
                         <div class="flex justify-between items-center">
                            <h3 class="font-black font-heading text-2xl text-black">Intel Ledger</h3>
                            <button v-if="hasPermission('manageIntel')" @click="openModal('add-intel')" class="bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold fun-btn hover:bg-violet-400">Add Stuff</button>
                        </div>
                        <div v-for="(items, category) in groupedIntel" :key="category" class="space-y-3">
                            <h4 class="text-sm font-black uppercase text-gray-400 border-b-2 border-gray-300 pb-1 ml-2">{{ category }}</h4>
                            <div v-if="category === 'Social Media'" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <a v-for="item in items" :key="item.id" :href="item.value" target="_blank" class="fun-card p-3 flex flex-col items-center justify-center gap-2 group hover:scale-105 transition-transform" :style="{borderColor: getSocialInfo(item.value).color}">
                                    <i :class="getSocialInfo(item.value).icon" class="text-3xl" :style="{color: getSocialInfo(item.value).color}"></i>
                                    <div class="font-bold text-xs text-black">{{item.label}}</div>
                                    <button v-if="hasPermission('manageIntel')" @click.prevent="deleteItem('subject_intel', item.id)" class="absolute top-1 right-1 text-red-300 hover:text-red-500 text-[10px]"><i class="fa-solid fa-times"></i></button>
                                </a>
                            </div>
                            <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div v-for="item in items" :key="item.id" class="fun-card p-4 relative group hover:bg-yellow-50">
                                    <div class="text-[10px] text-violet-500 font-black uppercase mb-1">{{item.label}}</div>
                                    <div class="text-black font-bold break-words text-sm">{{item.value}}</div>
                                    <button v-if="hasPermission('manageIntel')" @click="deleteItem('subject_intel', item.id)" class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold hover:scale-110"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TIMELINE -->
                    <div v-show="subTab === 'timeline'" class="h-full flex flex-col space-y-4">
                        <div class="flex justify-between items-center">
                             <h3 class="font-black font-heading text-2xl text-black">History Log</h3>
                             <button v-if="hasPermission('manageIntel')" @click="openModal('add-interaction')" class="bg-green-400 text-white hover:bg-green-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Log Event</button>
                        </div>
                        <div class="flex-1 fun-card p-6 overflow-y-auto min-h-0 bg-white">
                            <div class="relative pl-8 border-l-4 border-gray-200 space-y-8 my-4">
                                <div v-for="ix in selected.interactions" :key="ix.id" class="relative group">
                                    <div class="absolute -left-[43px] top-1 w-6 h-6 rounded-full bg-white border-4 border-black shadow-sm"></div>
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                                        <span class="text-lg font-black font-heading text-black">{{ix.type}}</span>
                                        <span class="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded border border-gray-200">{{new Date(ix.date).toLocaleString()}}</span>
                                        <button v-if="hasPermission('manageIntel')" @click="deleteItem('subject_interactions', ix.id)" class="ml-auto text-gray-300 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-xl text-sm font-bold text-gray-700 border-2 border-gray-200 whitespace-pre-wrap">{{ix.transcript || ix.conclusion}}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- MAP (Detail) with Mobile Drawer -->
                    <div v-show="subTab === 'map'" class="h-full flex flex-col relative p-4 md:p-8">
                        <div class="flex justify-between items-center mb-4 shrink-0">
                            <h3 class="font-black font-heading text-2xl text-black">Locations</h3>
                            <button v-if="hasPermission('manageLocations')" @click="openModal('add-location')" class="bg-blue-400 text-white hover:bg-blue-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Add Pin</button>
                        </div>
                        
                        <!-- Main Layout -->
                        <div class="flex-1 flex md:grid md:grid-cols-3 gap-6 min-h-0 relative overflow-hidden">
                            
                            <!-- MAP CONTAINER -->
                            <div class="w-full h-full md:col-span-2 bg-white rounded-2xl overflow-hidden relative border-4 border-black shadow-[4px_4px_0px_#000]">
                                <div id="subjectMap" class="w-full h-full z-0"></div>
                                
                                <!-- Mobile: Toggle Button -->
                                <button @click="showProfileMapList = !showProfileMapList" class="md:hidden absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-sm p-3 rounded-xl border-4 border-black shadow-[2px_2px_0px_#000] font-bold text-sm fun-btn">
                                    <i class="fa-solid" :class="showProfileMapList ? 'fa-map' : 'fa-list'"></i> {{ showProfileMapList ? 'Hide List' : 'Locations' }}
                                </button>
                            </div>

                            <!-- LIST CONTAINER -->
                            <!-- FIX: overflow-hidden on parent to contain the inner scrollable div -->
                            <div :class="[
                                'absolute md:static inset-y-0 right-0 w-full md:w-auto bg-white/95 md:bg-transparent z-[401] md:z-auto transition-transform duration-300 transform',
                                showProfileMapList ? 'translate-x-0 shadow-2xl' : 'translate-x-full md:translate-x-0'
                            ]" class="flex flex-col h-full border-l-4 border-black md:border-l-0 md:border-none p-4 md:p-0 overflow-hidden">
                                
                                <!-- Mobile Header -->
                                <div class="md:hidden flex justify-between items-center mb-4 pb-2 border-b-2 border-gray-200 shrink-0">
                                    <h3 class="font-black font-heading text-xl">Saved Locations</h3>
                                    <button @click="showProfileMapList = false" class="text-red-500 font-bold bg-red-100 p-2 rounded-full w-8 h-8 flex items-center justify-center"><i class="fa-solid fa-times"></i></button>
                                </div>

                                <!-- SCROLLING AREA -->
                                <div class="space-y-3 overflow-y-auto flex-1 min-h-0 md:pr-1 overscroll-contain pb-4 touch-scroll" style="touch-action: pan-y;">
                                    <div v-for="loc in selected.locations" :key="loc.id" class="fun-card p-4 hover:bg-blue-50 border-2 flex flex-col gap-2">
                                        <div class="flex justify-between items-center" @click="flyTo(loc); if(window.innerWidth < 768) showProfileMapList = false;">
                                            <div class="font-black text-black text-sm font-heading cursor-pointer">{{loc.name}}</div>
                                            <span class="text-[10px] uppercase bg-white text-black px-2 py-0.5 rounded border-2 border-black font-bold shadow-[2px_2px_0px_#000]">{{loc.type}}</span>
                                        </div>
                                        <div class="text-xs font-bold text-gray-500 mb-2 cursor-pointer" @click="flyTo(loc); if(window.innerWidth < 768) showProfileMapList = false;">{{loc.address}}</div>
                                        
                                        <!-- ACTION BUTTONS: Wrapped for mobile -->
                                        <div class="flex gap-2 justify-end mt-1 pt-2 border-t-2 border-dashed border-gray-200 flex-wrap">
                                            <button @click.stop="copyCoords(loc.lat, loc.lng)" class="text-xs font-bold text-blue-500 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 flex items-center gap-1 shrink-0" title="Copy Coordinates">
                                                <i class="fa-solid fa-copy"></i>
                                            </button>
                                            <button v-if="hasPermission('manageLocations')" @click.stop="openModal('edit-location', loc)" class="text-xs font-bold text-green-600 hover:text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 shrink-0">
                                                <i class="fa-solid fa-pen"></i> Edit
                                            </button>
                                            <button v-if="hasPermission('manageLocations')" @click.stop="deleteItem('subject_locations', loc.id)" class="text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 shrink-0">
                                                <i class="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div v-if="selected.locations.length === 0" class="text-center text-gray-400 font-bold py-8">No locations saved yet.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- NETWORK (Detail) -->
                    <div v-show="subTab === 'network'" class="h-full flex flex-col p-4 md:p-8">
                         <div class="flex justify-between items-center mb-4">
                            <h3 class="font-black font-heading text-2xl text-black">Connections</h3>
                            <button v-if="hasPermission('manageRelationships')" @click="openModal('add-rel')" class="bg-pink-400 text-white hover:bg-pink-300 px-4 py-2 rounded-xl text-sm font-bold fun-btn">Link Person</button>
                        </div>
                        <div v-if="selected.familyReport && selected.familyReport.length > 0" class="fun-card p-4 mb-6 border-l-[10px] border-l-purple-400 bg-purple-50">
                             <h4 class="text-lg font-black text-purple-700 mb-3 flex items-center gap-2 font-heading"><i class="fa-solid fa-people-roof"></i> Family</h4>
                             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                 <div v-for="fam in selected.familyReport" class="flex items-center gap-3 p-2 rounded-xl bg-white border-2 border-black shadow-[3px_3px_0px_#000] hover:translate-y-1 hover:shadow-none transition-all cursor-pointer" @click="viewSubject(fam.id)">
                                     <div class="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 border-2 border-black"><img :src="resolveImg(fam.avatar)" class="w-full h-full object-cover"></div>
                                     <div><div class="text-sm font-bold text-black">{{fam.name}}</div><div class="text-[10px] text-purple-600 uppercase tracking-wide font-black">{{fam.role}}</div></div>
                                 </div>
                             </div>
                        </div>
                        <div class="flex-1 fun-card border-4 border-black relative overflow-hidden min-h-[400px]">
                            <div id="relNetwork" class="absolute inset-0"></div>
                        </div>
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
                                        <button v-if="hasPermission('manageRelationships')" @click="openModal('edit-rel', rel)" class="text-gray-400 hover:text-blue-500 p-2"><i class="fa-solid fa-pen"></i></button>
                                        <button v-if="hasPermission('manageRelationships')" @click="deleteItem('subject_relationships', rel.id)" class="text-gray-400 hover:text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="subTab === 'files'" class="space-y-6">
                         <div class="flex gap-4">
                            <div v-if="hasPermission('manageFiles')" @click="triggerUpload('media')" class="h-28 w-32 rounded-2xl border-4 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-500 transition-all text-gray-400 group">
                                <i class="fa-solid fa-cloud-arrow-up text-3xl mb-1 group-hover:scale-110 transition-transform"></i>
                                <span class="text-xs font-black uppercase">Upload</span>
                            </div>
                            <div v-if="hasPermission('manageFiles')" @click="openModal('add-media-link')" class="h-28 w-32 rounded-2xl border-4 border-gray-200 bg-white flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all text-gray-400 hover:text-black gap-1 group">
                                <i class="fa-solid fa-link text-2xl group-hover:scale-110 transition-transform"></i>
                                <span class="text-xs font-black uppercase">Link</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div v-for="m in selected.media" :key="m.id" class="fun-card group relative aspect-square overflow-hidden bg-white p-2">
                                <div class="w-full h-full rounded-lg overflow-hidden border-2 border-gray-200 relative">
                                    <img v-if="m.media_type === 'link' || m.content_type.startsWith('image')" :src="m.external_url || '/api/media/'+m.object_key" class="w-full h-full object-cover transition-transform group-hover:scale-110" onerror="this.src='https://placehold.co/400?text=IMG'">
                                    <div v-else class="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50"><i class="fa-solid fa-file text-5xl"></i></div>
                                </div>
                                <a :href="m.external_url || '/api/media/'+m.object_key" target="_blank" class="absolute inset-0 z-10"></a>
                                <div class="absolute bottom-2 left-2 right-2 bg-black/80 p-1 rounded-lg text-[10px] font-bold text-white truncate text-center pointer-events-none z-10">{{m.description}}</div>
                                <button v-if="hasPermission('manageFiles')" @click.stop="deleteItem('subject_media', m.id)" class="absolute top-0 right-0 bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-bl-xl font-bold shadow-sm z-20 hover:bg-red-600 border-l-2 border-b-2 border-white"><i class="fa-solid fa-times"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

`;
