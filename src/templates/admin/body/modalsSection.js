export const MODALS_SECTION = `
    <!-- MODALS -->
    <div v-if="modal.active && modal.active !== 'mini-profile'" class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="closeModal">
        <div class="w-full max-w-2xl fun-card flex flex-col max-h-[90vh] animate-bounce-in overflow-hidden border-4">
             
             <div class="flex justify-between items-center p-4 border-b-4 border-black bg-yellow-300">
                <h3 class="font-black text-xl text-black font-heading">{{ modalTitle }}</h3>
                <button @click="closeModal" class="w-8 h-8 rounded-full flex items-center justify-center bg-white border-2 border-black shadow-[2px_2px_0px_#000] active:translate-y-1 active:shadow-none transition-all"><i class="fa-solid fa-xmark font-bold"></i></button>
            </div>
            
            <div class="overflow-y-auto p-4 md:p-6 space-y-6 bg-white">
                <!-- COMMAND PALETTE -->
                <div v-if="modal.active === 'cmd'">
                    <input ref="cmdInput" v-model="cmdQuery" placeholder="Start typing..." class="fun-input w-full p-4 text-xl mb-4">
                    <div class="space-y-2">
                        <div v-for="res in cmdResults" @click="res.action" class="p-3 rounded-xl hover:bg-blue-100 cursor-pointer flex justify-between items-center border-2 border-gray-100 hover:border-black transition-all group">
                             <div><div class="font-black text-lg text-black font-heading">{{res.title}}</div><div class="text-xs font-bold text-gray-500">{{res.desc}}</div></div>
                             <i class="fa-solid fa-arrow-right text-gray-300 group-hover:text-black font-bold"></i>
                        </div>
                    </div>
                </div>

                <!-- ADD/EDIT REL -->
                 <form v-if="['add-rel', 'edit-rel'].includes(modal.active)" @submit.prevent="submitRel" class="space-y-6">
                    <div class="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl text-sm font-bold text-blue-900 mb-4">{{ modal.active === 'edit-rel' ? 'Editing link for' : 'Linking' }} <strong>{{selected.full_name}}</strong></div>

                    <!-- Target Picker -->
                    <div v-if="modal.active === 'add-rel'" class="space-y-3">
                        <div class="relative">
                            <input v-model="relationSearch" placeholder="Search by name, role, or origin" class="fun-input w-full p-3 text-sm pl-10" required>
                            <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400"></i>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                            <button 
                                v-for="person in relationCandidates" 
                                :key="person.id" 
                                type="button"
                                @click="pickRelationTarget(person)"
                                class="flex items-center gap-3 p-3 rounded-xl border-2 transition-all"
                                :class="forms.rel.targetId === person.id ? 'border-blue-500 bg-blue-50 shadow-[2px_2px_0px_#1E3A8A]' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'">
                                <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-black bg-gray-100 shrink-0">
                                    <img v-if="resolveImg(person.avatar_path)" :src="resolveImg(person.avatar_path)" class="w-full h-full object-cover">
                                    <div v-else class="w-full h-full flex items-center justify-center font-black text-gray-400">{{person.full_name.charAt(0)}}</div>
                                </div>
                                <div class="text-left min-w-0">
                                    <div class="font-black text-sm text-gray-900 truncate">{{ person.full_name }}</div>
                                    <div class="text-[11px] font-bold text-gray-500 truncate">{{ person.occupation || 'Unknown role' }}</div>
                                    <div class="text-[10px] font-bold text-blue-600 uppercase tracking-wide" v-if="person.nationality">{{ person.nationality }}</div>
                                </div>
                                <i class="fa-solid" :class="forms.rel.targetId === person.id ? 'fa-check text-blue-600' : 'fa-plus text-gray-400'" aria-hidden="true"></i>
                            </button>
                            <div v-if="relationCandidates.length === 0" class="col-span-full text-center text-xs font-bold text-gray-500 py-4 border-2 border-dashed border-gray-200 rounded-xl">No matches yet. Try another search.</div>
                        </div>
                        <div v-if="selectedRelTarget" class="flex items-center gap-3 bg-blue-50 border-2 border-blue-300 rounded-xl p-3">
                            <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-black bg-white shrink-0">
                                <img v-if="resolveImg(selectedRelTarget.avatar_path)" :src="resolveImg(selectedRelTarget.avatar_path)" class="w-full h-full object-cover">
                                <div v-else class="w-full h-full flex items-center justify-center font-black text-gray-400">{{selectedRelTarget.full_name.charAt(0)}}</div>
                            </div>
                            <div class="min-w-0">
                                <div class="font-black text-sm text-gray-900 truncate">{{ selectedRelTarget.full_name }}</div>
                                <div class="text-[11px] font-bold text-gray-500 truncate">{{ selectedRelTarget.occupation || 'Unknown role' }}</div>
                                <div class="text-[10px] font-bold text-blue-600 uppercase tracking-wide" v-if="selectedRelTarget.nationality">{{ selectedRelTarget.nationality }}</div>
                            </div>
                            <span class="ml-auto text-[11px] font-black text-blue-700 bg-blue-100 px-2 py-1 rounded-lg border border-blue-200">Selected</span>
                        </div>
                    </div>
                    <div v-else class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border-2 border-gray-200">
                        <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-black bg-gray-100 shrink-0">
                            <img 
                                v-if="resolveImg((selectedRelTarget && selectedRelTarget.avatar_path) ? selectedRelTarget.avatar_path : (modal.data && modal.data.avatar_path ? modal.data.avatar_path : ''))" 
                                :src="resolveImg((selectedRelTarget && selectedRelTarget.avatar_path) ? selectedRelTarget.avatar_path : (modal.data && modal.data.avatar_path ? modal.data.avatar_path : ''))" 
                                class="w-full h-full object-cover">
                            <div v-else class="w-full h-full flex items-center justify-center font-black text-gray-400">{{ (selectedRelTarget && selectedRelTarget.full_name ? selectedRelTarget.full_name.charAt(0) : '?') }}</div>
                        </div>
                        <div class="min-w-0">
                            <div class="font-black text-sm text-gray-900 truncate">{{ (selectedRelTarget && selectedRelTarget.full_name) || 'Existing target' }}</div>
                            <div class="text-[11px] font-bold text-gray-500 truncate">{{ (selectedRelTarget && selectedRelTarget.occupation) || 'Existing relationship' }}</div>
                        </div>
                    </div>

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

                <!-- ADD/EDIT SUBJECT -->
                <form v-if="['add-subject', 'edit-profile'].includes(modal.active)" @submit.prevent="submitSubject" class="space-y-6">
                    <div v-if="modal.active === 'edit-profile'" class="bg-gray-100 p-4 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-between">
                         <div class="text-sm font-bold text-gray-600">Profile Picture</div>
                         <button type="button" @click="triggerUpload('avatar')" class="bg-white px-4 py-2 rounded-lg border-2 border-black font-bold text-xs hover:bg-gray-50 flex items-center gap-2">
                            <i class="fa-solid fa-camera"></i> Change Photo
                         </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        <div class="space-y-4">
                            <label class="block text-xs font-black uppercase text-gray-400">Who is it?</label>
                            <input v-model="forms.subject.full_name" placeholder="Full Name *" class="fun-input w-full p-3 text-sm" required>
                            <input v-model="forms.subject.alias" placeholder="Nickname" class="fun-input w-full p-3 text-sm">
                            <input v-model="forms.subject.occupation" list="list-occupations" placeholder="Job" class="fun-input w-full p-3 text-sm">
                            <input v-model="forms.subject.nationality" list="list-nationalities" placeholder="Origin" class="fun-input w-full p-3 text-sm">
                        </div>
                        <div class="space-y-4">
                             <label class="block text-xs font-black uppercase text-gray-400">Details</label>
                             <select v-model="forms.subject.threat_level" class="fun-input w-full p-3 text-sm">
                                <option value="Low">🟢 Low Priority</option><option value="Medium">🟡 Medium Priority</option><option value="High">🟠 High Priority</option><option value="Critical">🔴 Critical</option>
                            </select>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="date" v-model="forms.subject.dob" class="fun-input w-full p-3 text-sm text-gray-500">
                                <input type="number" v-model="forms.subject.age" placeholder="Age" class="fun-input w-full p-3 text-sm">
                            </div>
                             <input v-model="forms.subject.ideology" list="list-ideologies" placeholder="Team/Group" class="fun-input w-full p-3 text-sm">
                        </div>
                    </div>
                    <div class="pt-4 border-t-2 border-gray-200"><h4 class="text-xs font-black uppercase text-gray-400 mb-4">Stats</h4><div class="grid grid-cols-2 md:grid-cols-4 gap-4"><input v-model="forms.subject.height" placeholder="Height" class="fun-input p-2 text-xs"><input v-model="forms.subject.weight" placeholder="Weight" class="fun-input p-2 text-xs"><input v-model="forms.subject.blood_type" placeholder="Blood" class="fun-input p-2 text-xs"></div></div>
                    <div class="space-y-4"><label class="block text-xs font-black uppercase text-gray-400">Secret Notes</label><textarea v-model="forms.subject.modus_operandi" placeholder="Habits..." rows="3" class="fun-input w-full p-3 text-sm"></textarea><textarea v-model="forms.subject.weakness" placeholder="Weakness..." rows="3" class="fun-input w-full p-3 text-sm"></textarea></div>
                    <button type="submit" :disabled="processing" class="w-full bg-violet-500 hover:bg-violet-400 text-white font-black font-heading py-4 rounded-xl text-lg fun-btn">{{ processing ? 'Saving...' : 'Save This Person' }}</button>
                </form>

                <!-- ADD INTEL -->
                <form v-if="modal.active === 'add-intel'" @submit.prevent="submitIntel" class="space-y-4">
                    <select v-model="forms.intel.category" class="fun-input w-full p-3 text-sm">
                        <option>General</option><option>Contact Info</option><option>Social Media</option><option>Education</option><option>Financial</option><option>Medical</option><option>Family</option>
                    </select>
                    <input v-model="forms.intel.label" placeholder="Label (e.g. Phone)" class="fun-input w-full p-3 text-sm" required>
                    <textarea v-model="forms.intel.value" @input="handleIntelInput" placeholder="Value" rows="3" class="fun-input w-full p-3 text-sm" required></textarea>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-blue-500">Add Info</button>
                 </form>

                 <!-- ADD MEDIA LINK -->
                 <form v-if="modal.active === 'add-media-link'" @submit.prevent="submitMediaLink" class="space-y-4">
                    <input v-model="forms.mediaLink.url" placeholder="Paste URL Here" class="fun-input w-full p-3 text-sm" required>
                    <input v-model="forms.mediaLink.description" placeholder="What is it?" class="fun-input w-full p-3 text-sm">
                    <select v-model="forms.mediaLink.type" class="fun-input w-full p-3 text-sm"><option value="image/jpeg">Image</option><option value="application/pdf">Document</option><option value="video/mp4">Video</option><option value="text/plain">Other</option></select>
                    <button type="submit" :disabled="processing" class="w-full bg-pink-400 text-white font-black py-4 rounded-xl fun-btn hover:bg-pink-500">Save Link</button>
                 </form>

                 <!-- SHARE -->
                 <div v-if="modal.active === 'share-secure'" class="space-y-6">
                    <p class="text-sm font-bold text-gray-500">Make a secret link for others.</p>
                    
                    <div class="flex items-center gap-3 p-4 bg-yellow-100 rounded-xl border-2 border-yellow-500">
                        <div class="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                            <input type="checkbox" name="toggle" id="location-toggle" v-model="forms.share.requireLocation" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
                            <label for="location-toggle" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer border-2 border-black"></label>
                        </div>
                        <div class="flex-1">
                             <div class="text-xs font-black uppercase text-yellow-800">Lock with Location</div>
                             <div class="text-[10px] font-bold text-yellow-700">Viewer MUST share location to see content.</div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-xs font-black uppercase text-gray-400">Allowed Access</label>
                        <div class="flex flex-wrap gap-2">
                            <label v-for="tab in ['Profile', 'Intel', 'Capabilities', 'History', 'Network', 'Files', 'Map']" :key="tab" class="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-200 border-2 border-transparent has-[:checked]:border-black has-[:checked]:bg-white transition-all shadow-sm">
                                <input type="checkbox" :value="tab" v-model="forms.share.allowedTabs" class="accent-black w-4 h-4">
                                <span class="text-xs font-bold">{{ tab }}</span>
                            </label>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <select v-model="forms.share.minutes" class="fun-input w-32 p-2 text-sm"><option :value="30">30 Mins</option><option :value="60">1 Hour</option><option :value="1440">24 Hours</option><option :value="10080">7 Days</option></select>
                        <button @click="createShareLink" :disabled="processing" class="flex-1 bg-yellow-400 text-black font-black rounded-xl text-sm fun-btn hover:bg-yellow-500">Create Magic Link</button>
                    </div>
                    
                    <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                        <div v-for="link in activeShareLinks" class="flex justify-between items-center p-3 bg-gray-100 rounded-xl border-2 border-gray-300">
                            <div>
                                <div class="text-xs font-mono font-bold text-gray-600">...{{link.token.slice(-8)}}</div>
                                <div class="text-[10px] font-bold text-gray-400 uppercase">
                                    {{link.is_active ? 'Active' : 'Dead'}} &bull; {{link.views}} peeks 
                                    <span v-if="link.require_location" class="text-red-500 ml-1"><i class="fa-solid fa-lock"></i> LOC</span>
                                </div>
                            </div>
                            <div class="flex gap-2"><button @click="copyToClipboard(getShareUrl(link.token))" class="text-blue-500 hover:text-blue-700 font-bold p-2"><i class="fa-regular fa-copy"></i></button><button v-if="link.is_active" @click="revokeLink(link.token)" class="text-red-400 hover:text-red-600 p-2"><i class="fa-solid fa-ban"></i></button></div>
                        </div>
                    </div>
                 </div>
                 
                 <!-- LOCATION PICKER (ADD/EDIT) -->
                 <form v-if="['add-location', 'edit-location'].includes(modal.active)" @submit.prevent="submitLocation" class="space-y-4">
                    <div class="relative">
                         <input v-model="locationSearchQuery" @input="debounceSearch" placeholder="Find place..." class="fun-input w-full p-3 pl-10 text-sm">
                         <i class="fa-solid fa-search absolute left-3 top-3.5 text-gray-400"></i>
                         <div v-if="locationSearchResults.length" class="absolute w-full bg-white border-2 border-black max-h-48 overflow-y-auto mt-1 shadow-xl rounded-xl z-50">
                             <div v-for="res in locationSearchResults" :key="res.place_id" @click="selectLocation(res)" class="p-3 hover:bg-yellow-100 cursor-pointer text-xs border-b border-gray-100 font-bold text-gray-700">{{ res.display_name }}</div>
                         </div>
                    </div>
                    <div class="h-48 w-full bg-gray-100 rounded-xl border-2 border-black relative overflow-hidden"><div id="locationPickerMap" class="absolute inset-0 z-0"></div></div>
                    
                    <!-- NEW: Manual Coordinates -->
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[10px] font-bold text-gray-500 uppercase">Latitude</label>
                            <input v-model.number="forms.location.lat" type="number" step="any" placeholder="0.0000" class="fun-input w-full p-2 text-xs" @input="updatePickerMarker">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-gray-500 uppercase">Longitude</label>
                            <input v-model.number="forms.location.lng" type="number" step="any" placeholder="0.0000" class="fun-input w-full p-2 text-xs" @input="updatePickerMarker">
                        </div>
                    </div>

                    <input v-model="forms.location.name" placeholder="Name (e.g. Secret Base)" class="fun-input w-full p-3 text-sm">
                    <select v-model="forms.location.type" class="fun-input w-full p-3 text-sm"><option>Residence</option><option>Workplace</option><option>Frequented Spot</option><option>Other</option></select>
                    <button type="submit" :disabled="processing" class="w-full bg-blue-500 text-white font-black py-4 rounded-xl fun-btn hover:bg-blue-600">{{ modal.active === 'edit-location' ? 'Update Pin' : 'Drop Pin' }}</button>
                </form>

                <form v-if="modal.active === 'add-interaction'" @submit.prevent="submitInteraction" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <input type="datetime-local" v-model="forms.interaction.date" class="fun-input p-3 text-sm" required>
                        <select v-model="forms.interaction.type" class="fun-input p-3 text-sm"><option>Meeting</option><option>Call</option><option>Email</option><option>Event</option><option>Observation</option></select>
                    </div>
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
            
            <div class="flex flex-wrap justify-center gap-2 mb-6">
                <span class="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full border-2 border-gray-200">{{modal.data.occupation || 'No Job'}}</span>
                <span v-if="modal.data.nationality" class="text-xs font-bold text-blue-500 bg-blue-50 px-3 py-1 rounded-full border-2 border-blue-100">{{modal.data.nationality}}</span>
                <span v-if="modal.data.threat_level" class="text-xs font-bold px-3 py-1 rounded-full border-2" :class="getThreatColor(modal.data.threat_level, true)">{{modal.data.threat_level}}</span>
            </div>

            <button @click="viewSubject(modal.data.id)" class="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-3 rounded-xl text-lg fun-btn shadow-[3px_3px_0px_#000] active:shadow-none active:translate-y-1">Open Folder</button>
        </div>
    </div>
`;
