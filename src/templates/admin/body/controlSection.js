export const CONTROL_SECTION = `
            <div v-if="currentTab === 'control'" class="flex-1 overflow-y-auto p-4 md:p-8 bg-white">
                <div class="max-w-6xl mx-auto space-y-8">
                    <div class="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h2 class="text-2xl font-heading font-black text-black flex items-center gap-2"><i class="fa-solid fa-book text-amber-500"></i> Master Control Guide</h2>
                            <p class="text-sm font-bold text-gray-600">Operate this site from the mother-company hub with documented runbooks and API calls.</p>
                        </div>
                        <button @click="refreshApp" class="bg-black text-white px-4 py-2 rounded-xl font-bold shadow-[3px_3px_0px_#000] hover:translate-y-[-1px] transition-transform active:translate-y-0">
                            <i class="fa-solid fa-arrows-rotate mr-2"></i>Sync Data
                        </button>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div v-for="section in controlGuide.accessProtocols" :key="section.title" class="fun-card p-5 border-4 border-black bg-amber-50 space-y-3">
                            <div class="flex items-center gap-2">
                                <div class="w-10 h-10 bg-black text-white rounded-lg flex items-center justify-center text-lg shadow-[3px_3px_0px_#000]"><i class="fa-solid fa-key"></i></div>
                                <div>
                                    <div class="font-heading font-black text-black">{{ section.title }}</div>
                                    <div class="text-xs font-bold text-gray-500">{{ section.desc }}</div>
                                </div>
                            </div>
                            <ul class="space-y-2">
                                <li v-for="item in section.items" :key="item" class="flex items-start gap-2 text-sm font-bold text-gray-700">
                                    <i class="fa-solid fa-circle-check text-emerald-500 mt-0.5"></i>
                                    <span>{{ item }}</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div class="fun-card border-4 border-black bg-white">
                        <div class="p-4 border-b-4 border-black flex items-center justify-between flex-wrap gap-2">
                            <h3 class="font-heading font-black text-lg text-black flex items-center gap-2"><i class="fa-solid fa-network-wired text-blue-500"></i> API Catalog</h3>
                            <span class="text-xs font-bold text-gray-500">Master admin only</span>
                        </div>
                        <div class="divide-y-2 divide-black">
                            <div v-for="api in controlGuide.apiCatalog" :key="api.path" class="p-4 flex flex-col gap-2 bg-gray-50">
                                <div class="flex items-center justify-between gap-3 flex-wrap">
                                    <div class="flex items-center gap-2">
                                        <span class="px-2 py-1 rounded-lg border-2 border-black bg-white text-xs font-black uppercase text-gray-700">{{ api.method }}</span>
                                        <span class="text-sm font-heading font-black text-black">{{ api.name }}</span>
                                    </div>
                                    <code class="text-[11px] font-mono bg-black text-white px-2 py-1 rounded-lg shadow-[2px_2px_0px_#000]">{{ api.path }}</code>
                                </div>
                                <div class="text-xs font-bold text-gray-600">{{ api.purpose }}</div>
                                <pre class="bg-white border-2 border-dashed border-gray-300 rounded-xl p-3 text-xs font-mono whitespace-pre-wrap">{{ api.sample }}</pre>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="fun-card p-5 border-4 border-black bg-violet-50 space-y-4">
                            <div class="flex items-center gap-2">
                                <div class="w-10 h-10 bg-violet-500 text-white rounded-lg flex items-center justify-center text-lg shadow-[3px_3px_0px_#000]"><i class="fa-solid fa-clipboard-list"></i></div>
                                <div>
                                    <div class="font-heading font-black text-black">Runbooks</div>
                                    <div class="text-xs font-bold text-gray-500">Follow these when acting from the mother-company.</div>
                                </div>
                            </div>
                            <div class="space-y-3">
                                <div v-for="book in controlGuide.runbooks" :key="book.title" class="bg-white border-2 border-black rounded-xl p-3 space-y-2 shadow-[2px_2px_0px_#000]">
                                    <div class="font-heading font-black text-black">{{ book.title }}</div>
                                    <ol class="list-decimal list-inside space-y-1 text-sm font-bold text-gray-700">
                                        <li v-for="step in book.steps" :key="step">{{ step }}</li>
                                    </ol>
                                </div>
                            </div>
                        </div>

                        <div class="fun-card p-5 border-4 border-black bg-blue-50 space-y-3">
                            <div class="flex items-center gap-2">
                                <div class="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center text-lg shadow-[3px_3px_0px_#000]"><i class="fa-solid fa-code"></i></div>
                                <div>
                                    <div class="font-heading font-black text-black">Build & Integration Notes</div>
                                    <div class="text-xs font-bold text-gray-500">Keep cross-system control safe and consistent.</div>
                                </div>
                            </div>
                            <ul class="space-y-2">
                                <li v-for="note in controlGuide.buildNotes" :key="note" class="flex items-start gap-2 text-sm font-bold text-gray-700">
                                    <i class="fa-solid fa-bolt text-blue-500 mt-0.5"></i>
                                    <span>{{ note }}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
`;
