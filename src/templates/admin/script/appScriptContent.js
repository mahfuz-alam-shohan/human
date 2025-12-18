export const ADMIN_APP_SCRIPT_CONTENT = `
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    const PRESETS = [
        { a: 'Father', b: 'Child' }, { a: 'Mother', b: 'Child' }, { a: 'Parent', b: 'Child' },
        { a: 'Son', b: 'Parent' }, { a: 'Daughter', b: 'Parent' }, { a: 'Child', b: 'Parent' },
        { a: 'Brother', b: 'Sibling' }, { a: 'Sister', b: 'Sibling' },
        { a: 'Husband', b: 'Wife' }, { a: 'Wife', b: 'Husband' }, { a: 'Spouse', b: 'Spouse' },
        { a: 'Uncle', b: 'Niece/Nephew' }, { a: 'Aunt', b: 'Niece/Nephew' },
        { a: 'Grandfather', b: 'Grandchild' }, { a: 'Grandmother', b: 'Grandchild' },
        { a: 'Teacher', b: 'Student' }, { a: 'Employer', b: 'Employee' },
        { a: 'Friend', b: 'Friend' }, { a: 'Associate', b: 'Associate' }
    ];

    createApp({
      setup() {
        const view = ref('auth');
        const loading = ref(false);
        const processing = ref(false); 
        const auth = reactive({ email: '', password: '' });
        const adminProfile = ref(null);
        const allTabs = [
            { id: 'dashboard', icon: 'fa-solid fa-chart-pie', label: 'Briefing' },
            { id: 'targets', icon: 'fa-solid fa-address-book', label: 'Database' },
            { id: 'map', icon: 'fa-solid fa-map-location-dot', label: 'Global Map' },
            { id: 'network', icon: 'fa-solid fa-circle-nodes', label: 'Network' },
            { id: 'admins', icon: 'fa-solid fa-user-shield', label: 'Admins' },
        ];
        const defaultAllowed = {
            mainTabs: ['dashboard', 'targets', 'map', 'network'],
            subjectTabs: ['overview', 'capabilities', 'attributes', 'timeline', 'map', 'network', 'files'],
            permissions: {
                createSubjects: true,
                editSubjects: true,
                deleteSubjects: true,
                manageIntel: true,
                manageLocations: true,
                manageRelationships: true,
                manageFiles: true,
                manageShares: true
            }
        };
        
        const currentTab = ref('dashboard');
        const subTab = ref('overview');
        
        const stats = ref({});
        const feed = ref([]);
        const subjects = ref([]);
        const suggestions = reactive({ occupations: [], nationalities: [], ideologies: [] });
        const selected = ref(null);
        const admins = ref([]);
        const adminLogs = ref([]);
        const editingAdminId = ref(null);
        const activeShareLinks = ref([]);
        const search = ref('');
        const modal = reactive({ active: null, data: null });
        const analysisResult = ref(null);
        const mapData = ref([]);
        const mapSearchQuery = ref('');
        const presets = ref(PRESETS);
        const toasts = ref([]);
        const showMapSidebar = ref(window.innerWidth >= 768);
        const showProfileMapList = ref(false); // Mobile Drawer State
        
        const locationSearchQuery = ref('');
        const locationSearchResults = ref([]);
        let pickerMapInstance = null;
        let mapInstance = null;
        let warRoomMapInstance = null;
        let searchTimeout = null;
        
        const cmdQuery = ref('');
        const cmdInput = ref(null);

        // Helper to get local date string for inputs
        const getLocalISOString = () => {
            const d = new Date();
            const offset = d.getTimezoneOffset() * 60000;
            const local = new Date(d.getTime() - offset);
            return local.toISOString().slice(0, 16);
        };
        const cloneAllowed = () => JSON.parse(JSON.stringify(defaultAllowed));

        const forms = reactive({
            subject: {}, 
            interaction: {}, 
            location: {}, 
            intel: {}, 
            rel: { type: '', reciprocal: '' }, 
            share: { minutes: 60, requireLocation: false, allowedTabs: [] }, 
            mediaLink: {},
            admin: { email: '', password: '', allowedSections: cloneAllowed(), is_disabled: false, is_master: false }
        });

        // Charts
        let skillsChartInstance = null;

        // Social Media Detection
        const socialMap = [
            { regex: /facebook\.com/, name: 'Facebook', icon: 'fa-brands fa-facebook', color: '#1877F2' },
            { regex: /twitter\.com|x\.com/, name: 'X / Twitter', icon: 'fa-brands fa-x-twitter', color: '#000000' },
            { regex: /instagram\.com/, name: 'Instagram', icon: 'fa-brands fa-instagram', color: '#E1306C' },
            { regex: /linkedin\.com/, name: 'LinkedIn', icon: 'fa-brands fa-linkedin', color: '#0077B5' },
            { regex: /github\.com/, name: 'GitHub', icon: 'fa-brands fa-github', color: '#333' },
            { regex: /youtube\.com/, name: 'YouTube', icon: 'fa-brands fa-youtube', color: '#FF0000' },
            { regex: /t\.me/, name: 'Telegram', icon: 'fa-brands fa-telegram', color: '#0088cc' },
            { regex: /wa\.me/, name: 'WhatsApp', icon: 'fa-brands fa-whatsapp', color: '#25D366' },
            { regex: /tiktok\.com/, name: 'TikTok', icon: 'fa-brands fa-tiktok', color: '#000000' },
            { regex: /reddit\.com/, name: 'Reddit', icon: 'fa-brands fa-reddit', color: '#FF4500' },
        ];

        const getSocialInfo = (url) => {
            return socialMap.find(s => s.regex.test(url)) || { name: 'Website', icon: 'fa-solid fa-globe', color: '#6B7280' };
        };

        const handleIntelInput = () => {
            const val = forms.intel.value;
            const social = socialMap.find(s => s.regex.test(val));
            if (social) {
                forms.intel.category = 'Social Media';
                forms.intel.label = social.name;
            }
        };

        // Computed
        const allowedSections = computed(() => adminProfile.value?.allowed_sections || cloneAllowed());
        const hasPermission = (perm) => adminProfile.value?.is_master || !!allowedSections.value.permissions?.[perm];
        const canSeeTab = (tab) => {
            if (tab === 'detail') return true;
            if (tab === 'admins') return !!adminProfile.value?.is_master;
            return adminProfile.value?.is_master || allowedSections.value.mainTabs.includes(tab);
        };
        const visibleTabs = computed(() => allTabs.filter(t => canSeeTab(t.id)));
        const visibleSubjectTabs = computed(() => (adminProfile.value?.is_master ? defaultAllowed.subjectTabs : allowedSections.value.subjectTabs));
        const pickSubjectTab = () => visibleSubjectTabs.value[0] || 'overview';
        const subjectTabLabels = { overview: 'Overview', capabilities: 'Capabilities', attributes: 'Attributes', timeline: 'Timeline', map: 'Map', network: 'Network', files: 'Files' };
        const filteredSubjects = computed(() => subjects.value.filter(s => s.full_name.toLowerCase().includes(search.value.toLowerCase())));
        const filteredMapData = computed(() => !mapSearchQuery.value ? mapData.value : mapData.value.filter(d => d.full_name.toLowerCase().includes(mapSearchQuery.value.toLowerCase()) || d.name.toLowerCase().includes(mapSearchQuery.value.toLowerCase())));
        const groupedIntel = computed(() => selected.value?.intel ? selected.value.intel.reduce((a, i) => (a[i.category] = a[i.category] || []).push(i) && a, {}) : {});
        const cmdResults = computed(() => cmdQuery.value ? subjects.value.filter(s => s.full_name.toLowerCase().includes(cmdQuery.value.toLowerCase())).slice(0, 5).map(s => ({ title: s.full_name, desc: s.occupation, action: () => { viewSubject(s.id); closeModal(); } })) : []);
        
        // FIXED RESOLVE IMG
        const resolveImg = (p) => {
            if (!p) return null;
            if (p.startsWith('http') || p.startsWith('data:') || p.startsWith('/api/media/')) return p;
            return '/api/media/' + p;
        };

        const modalTitle = computed(() => ({ 
            'add-subject':'New Profile', 
            'edit-profile':'Edit Profile', 
            'add-interaction':'Log Event', 
            'add-location':'Add Location', 
            'edit-location':'Edit Location', // Title for edit mode
            'add-intel':'Add Attribute', 
            'add-rel':'Connect Profile', 
            'edit-rel': 'Edit Connection', 
            'share-secure':'Share Profile', 
            'add-media-link': 'Add External Media' 
        }[modal.active] || 'Menu'));

        // Notification System
        const notify = (title, msg, type='info') => {
            const id = Date.now();
            const icon = type==='error'?'fa-solid fa-circle-exclamation':(type==='success'?'fa-solid fa-check-circle':'fa-solid fa-info-circle');
            const color = type==='error'?'#EF4444':(type==='success'?'#10B981':'#3B82F6');
            toasts.value.push({ id, title, msg, icon, color });
            setTimeout(() => toasts.value = toasts.value.filter(t => t.id !== id), 3000);
        };

        // API
        const api = async (ep, opts = {}) => {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) };
            try {
                const res = await fetch('/api' + ep, { ...opts, headers });
                if(res.status === 401) { view.value = 'auth'; throw new Error("Session Expired"); }
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                return data;
            } catch(e) { notify('System Error', e.message, 'error'); throw e; }
        };

        const ensureTabValidity = () => {
            if (currentTab.value === 'detail') return;
            if (!visibleTabs.value.length) { currentTab.value = 'dashboard'; return; }
            if (!visibleTabs.value.find(t => t.id === currentTab.value)) {
                currentTab.value = visibleTabs.value[0]?.id || 'dashboard';
            }
        };
        const ensureSubTabValidity = () => {
            if (!visibleSubjectTabs.value.includes(subTab.value)) {
                subTab.value = pickSubjectTab();
            }
        };

        const handleAuth = async () => {
            loading.value = true;
            try {
                const res = await api('/login', { method: 'POST', body: JSON.stringify(auth) });
                localStorage.setItem('token', res.token);
                adminProfile.value = res.admin;
                view.value = 'app';
                ensureTabValidity();
                ensureSubTabValidity();
                await fetchData();
                if (currentTab.value === 'admins' && adminProfile.value?.is_master) fetchAdminConsole();
            } catch(e) {} finally { loading.value = false; }
        };
        const hydrateSession = async () => {
            try {
                const profile = await api('/me');
                adminProfile.value = profile;
                ensureTabValidity();
                ensureSubTabValidity();
            } catch(e) {
                localStorage.removeItem('token');
                view.value = 'auth';
                throw e;
            }
        };

        const fetchData = async () => {
            const jobs = [];
            if (canSeeTab('dashboard')) {
                jobs.push(api('/dashboard').then(d => { stats.value = d.stats; feed.value = d.feed; }).catch(() => {}));
            } else {
                stats.value = {}; feed.value = [];
            }

            if (canSeeTab('targets')) {
                jobs.push(api('/subjects').then(s => { subjects.value = s; }).catch(() => { subjects.value = []; }));
                jobs.push(api('/suggestions').then(sugg => Object.assign(suggestions, sugg)).catch(() => {
                    suggestions.occupations = []; suggestions.nationalities = []; suggestions.ideologies = [];
                }));
            } else {
                subjects.value = [];
                suggestions.occupations = []; suggestions.nationalities = []; suggestions.ideologies = [];
            }
            await Promise.all(jobs);
        };

        const viewSubject = async (id) => {
            if (!canSeeTab('targets')) { notify('Access Denied', 'You cannot open profiles', 'error'); return; }
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            subTab.value = pickSubjectTab();
            showProfileMapList.value = false; // Reset drawer state
            analysisResult.value = analyzeLocal(selected.value);
            if(modal.active === 'cmd' || modal.active === 'mini-profile') closeModal(); 
        };

        const analyzeLocal = (s) => {
             const points = (s.intel?.length || 0) + (s.interactions?.length || 0);
             const completeness = Math.min(100, Math.floor(points * 5));
             const tags = [];
             if(s.intel?.some(i => i.category === 'Social Media')) tags.push('Digital');
             if(s.interactions?.length > 5) tags.push('Frequent Contact');
             return { summary: \`Profile is \${completeness}% complete based on data density.\`, tags };
        };

        // Skills Logic
        const getSkillScore = (name) => selected.value.skills?.find(s => s.skill_name === name)?.score || 50;
        const updateSkill = async (name, val) => {
            if (!hasPermission('manageIntel')) { notify('Access Denied', 'Editing capabilities is restricted', 'error'); return; }
            await api('/skills', { method: 'POST', body: JSON.stringify({ subject_id: selected.value.id, skill_name: name, score: val }) });
            // Update local
            const idx = selected.value.skills.findIndex(s => s.skill_name === name);
            if(idx > -1) selected.value.skills[idx].score = parseInt(val);
            else selected.value.skills.push({ skill_name: name, score: parseInt(val) });
            renderSkillsChart();
        };

        const renderSkillsChart = () => {
            const ctx = document.getElementById('skillsChart');
            if(!ctx) return;
            if(skillsChartInstance) skillsChartInstance.destroy();
            
            const labels = ['Leadership', 'Technical', 'Combat', 'Social Eng', 'Observation', 'Stealth'];
            const data = labels.map(l => getSkillScore(l));

            skillsChartInstance = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Capabilities',
                        data: data,
                        fill: true,
                        backgroundColor: 'rgba(139, 92, 246, 0.2)', // Violet-500
                        borderColor: 'rgb(139, 92, 246)',
                        pointBackgroundColor: 'rgb(139, 92, 246)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgb(139, 92, 246)'
                    }]
                },
                options: {
                    elements: { line: { borderWidth: 3 } },
                    scales: { r: { angleLines: { display: true }, suggestedMin: 0, suggestedMax: 100 } },
                    plugins: { legend: { display: false } }
                }
            });
        };

        // Relation Presets
        const applyPreset = (p) => { forms.rel.type = p.a; forms.rel.reciprocal = p.b; };
        const autoFillReciprocal = () => { const p = PRESETS.find(pr => pr.a.toLowerCase() === forms.rel.type.toLowerCase()); if (p) forms.rel.reciprocal = p.b; };

        // Quick Note
        const quickAppend = async (field) => {
            if (!hasPermission('editSubjects')) { notify('Access Denied', 'You cannot modify notes', 'error'); return; }
            if (processing.value) return;
            const note = prompt("Add note:");
            if(!note) return;
            processing.value = true;
            try {
                const newVal = (selected.value[field] ? selected.value[field] + "\\n\\n" : "") + \`[\${new Date().toLocaleDateString()}] \${note}\`;
                await api('/subjects/'+selected.value.id, { method: 'PATCH', body: JSON.stringify({ [field]: newVal }) });
                selected.value[field] = newVal;
                notify('Success', 'Note appended', 'success');
            } finally {
                processing.value = false;
            }
        };

        // Export
        const exportData = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selected.value, null, 2));
            const el = document.createElement('a');
            el.setAttribute("href", dataStr);
            el.setAttribute("download", \`\${selected.value.full_name.replace(/ /g,'_')}_Dossier.json\`);
            document.body.appendChild(el); el.click(); el.remove();
        };

        // Map Logic
        const initMap = (id, data, isPicker = false) => {
            const el = document.getElementById(id);
            if(!el) return;
            if(isPicker && pickerMapInstance) { pickerMapInstance.remove(); pickerMapInstance = null; }
            if(!isPicker && id === 'subjectMap' && mapInstance) { mapInstance.remove(); mapInstance = null; }
            if(!isPicker && id === 'warRoomMap' && warRoomMapInstance) { warRoomMapInstance.remove(); warRoomMapInstance = null; }

            const map = L.map(id, { attributionControl: false, zoomControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
            L.control.zoom({ position: 'bottomright' }).addTo(map);

            setTimeout(() => map.invalidateSize(), 200);

            if(isPicker) {
                 pickerMapInstance = map;
                 map.on('click', e => {
                    forms.location.lat = e.latlng.lat; forms.location.lng = e.latlng.lng;
                    map.eachLayer(l => { if(l instanceof L.Marker) map.removeLayer(l); });
                    L.marker(e.latlng).addTo(map);
                 });
            } else {
                if(id === 'subjectMap') mapInstance = map; else warRoomMapInstance = map;
                renderMapData(map, data);
            }
        };

        // Syncs manual input with map marker
        const updatePickerMarker = () => {
            if (!pickerMapInstance) return;
            const lat = parseFloat(forms.location.lat);
            const lng = parseFloat(forms.location.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                pickerMapInstance.eachLayer(l => { if(l instanceof L.Marker) pickerMapInstance.removeLayer(l); });
                L.marker([lat, lng]).addTo(pickerMapInstance);
                pickerMapInstance.setView([lat, lng], 15);
            }
        };

        const renderMapData = (map, data) => {
            if(!map) return;
            map.eachLayer(layer => { if (layer instanceof L.Marker || layer instanceof L.Polyline) map.removeLayer(layer); });
            
            const bounds = []; // Initialize bounds array

            const grouped = data.reduce((acc, loc) => {
                if(!acc[loc.subject_id]) acc[loc.subject_id] = { locations: [], avatar: loc.avatar_path, name: loc.full_name };
                if(loc.lat) acc[loc.subject_id].locations.push(loc);
                return acc;
            }, {});

            Object.values(grouped).forEach(group => {
                if(group.locations.length > 1) {
                    const latlngs = group.locations.map(l => [l.lat, l.lng]);
                    L.polyline(latlngs, { color: '#8B5CF6', weight: 4, opacity: 0.8, dashArray: '5, 10' }).addTo(map);
                }
                group.locations.forEach(loc => {
                    if(!loc.lat) return;
                    
                    bounds.push([loc.lat, loc.lng]); // Add to bounds

                    const avatar = loc.avatar_path || (selected.value?.avatar_path);
                    const name = loc.full_name || (selected.value?.full_name);
                    const iconHtml = \`<div class="avatar-marker-fun"><img src="\${resolveImg(avatar) || 'https://ui-avatars.com/api/?name='+name}"></div>\`;
                    const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
                    L.marker([loc.lat, loc.lng], { icon }).addTo(map).bindPopup(\`<b>\${name}</b><br>\${loc.name}\`);
                });
            });

            // Fit bounds if we have points
            if(bounds.length > 0) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            }
        };

        const updateMapFilter = () => { if(warRoomMapInstance) renderMapData(warRoomMapInstance, filteredMapData.value); };
        const flyTo = (loc) => { if(mapInstance) mapInstance.flyTo([loc.lat, loc.lng], 15); };
        const flyToGlobal = (loc) => { if(warRoomMapInstance) { warRoomMapInstance.flyTo([loc.lat, loc.lng], 15); if(window.innerWidth < 768) showMapSidebar.value = false; } };

        const debounceSearch = () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                if(!locationSearchQuery.value) return;
                const res = await fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(locationSearchQuery.value)}\`);
                locationSearchResults.value = await res.json();
            }, 500);
        };
        const selectLocation = (res) => {
            forms.location.lat = parseFloat(res.lat); forms.location.lng = parseFloat(res.lon); forms.location.address = res.display_name;
            locationSearchResults.value = [];
            if(pickerMapInstance) { pickerMapInstance.setView([res.lat, res.lon], 15); L.marker([res.lat, res.lon]).addTo(pickerMapInstance); }
        };

        // NEW: Copy Coords
        const copyCoords = (lat, lng) => {
            const str = \`\${lat}, \${lng}\`;
            navigator.clipboard.writeText(str);
            notify('Copied', str, 'success');
        };

        const changeTab = (t) => { 
            if (!canSeeTab(t)) { notify('Access Denied', 'You cannot view this tab', 'error'); return; }
            currentTab.value = t; 
            if (t === 'admins' && adminProfile.value?.is_master) fetchAdminConsole();
        };
        const changeSubTab = (t) => { 
            if (!visibleSubjectTabs.value.includes(t)) { notify('Access Denied', 'This section is hidden for you', 'error'); return; }
            subTab.value = t; 
        };
        const openModal = (t, item = null) => {
             const permMap = {
                'add-subject': 'createSubjects',
                'edit-profile': 'editSubjects',
                'add-interaction': 'manageIntel',
                'add-intel': 'manageIntel',
                'add-location': 'manageLocations',
                'edit-location': 'manageLocations',
                'add-rel': 'manageRelationships',
                'edit-rel': 'manageRelationships',
                'share-secure': 'manageShares',
                'add-media-link': 'manageFiles'
             };
             if (permMap[t] && !hasPermission(permMap[t])) { notify('Access Denied', 'You are not allowed to do this', 'error'); return; }
             modal.active = t;
             if(t === 'add-subject') forms.subject = { threat_level: 'Low', status: 'Active' };
             if(t === 'edit-profile') forms.subject = { ...selected.value };
             if(t === 'add-interaction') forms.interaction = { subject_id: selected.value.id, date: getLocalISOString() }; // Use local time
             if(t === 'add-intel') forms.intel = { subject_id: selected.value.id, category: 'General' };
             if(t === 'add-media-link') forms.mediaLink = { subjectId: selected.value.id, type: 'image/jpeg' };
             
             // Location Handling
             if(t === 'add-location') { 
                 forms.location = { subject_id: selected.value.id }; 
                 locationSearchQuery.value = ''; 
                 nextTick(() => initMap('locationPickerMap', [], true)); 
             }
             if(t === 'edit-location' && item) {
                 forms.location = { ...item }; // Copy existing data
                 locationSearchQuery.value = '';
                 nextTick(() => initMap('locationPickerMap', [], true));
             }

             if(t === 'add-rel') forms.rel = { subjectA: selected.value.id, type: '', reciprocal: '' }; 
             if(t === 'edit-rel' && item) {
                forms.rel = { id: item.id, subjectA: selected.value.id, targetId: item.subject_a_id === selected.value.id ? item.subject_b_id : item.subject_a_id, type: item.subject_a_id === selected.value.id ? item.relationship_type : item.role_b, reciprocal: item.subject_a_id === selected.value.id ? item.role_b : item.relationship_type };
             }
             if(t === 'share-secure') { forms.share.requireLocation = false; forms.share.allowedTabs = ['Profile', 'Intel', 'Capabilities', 'History', 'Network', 'Files', 'Map']; fetchShareLinks(); }
             if(t === 'cmd') nextTick(() => cmdInput.value?.focus());
             // MINI PROFILE LOGIC
             if(t === 'mini-profile' && item) modal.data = item;
        };
        const closeModal = () => { modal.active = null; };

        // Watchers
        watch(() => forms.subject.dob, (val) => { if(val) forms.subject.age = new Date().getFullYear() - new Date(val).getFullYear(); });
        watch(() => forms.subject.age, (val) => { if(val && !forms.subject.dob) forms.subject.dob = \`\${new Date().getFullYear()-val}-01-01\`; });

        // Refresh Logic
        const refreshApp = async () => {
            if(processing.value) return;
            processing.value = true;
            try {
                if(currentTab.value === 'detail' && selected.value) {
                    await viewSubject(selected.value.id);
                } else {
                    await fetchData();
                    if(currentTab.value === 'map' && canSeeTab('map')) { mapData.value = await api('/map-data'); initMap('warRoomMap', mapData.value); }
                    if(currentTab.value === 'admins' && adminProfile.value?.is_master) await fetchAdminConsole();
                }
                ensureTabValidity();
                ensureSubTabValidity();
                notify('Synced', 'Data refreshed', 'success');
            } catch(e) {
                // error handled in api wrapper
            } finally {
                processing.value = false;
            }
        };

        // Submissions
        const submitSubject = async () => { 
            if(processing.value) return;
            processing.value = true; 
            try { 
                const isEdit = modal.active === 'edit-profile'; 
                const required = isEdit ? 'editSubjects' : 'createSubjects';
                if (!hasPermission(required)) { notify('Access Denied', 'You cannot save this profile', 'error'); return; }
                await api(isEdit ? '/subjects/' + selected.value.id : '/subjects', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(forms.subject) }); 
                if(isEdit) selected.value = { ...selected.value, ...forms.subject }; else fetchData(); 
                closeModal(); 
                notify('Success', 'Profile saved', 'success'); 
            } finally { processing.value = false; } 
        };
        
        const submitInteraction = async () => { 
            if(processing.value) return;
            if (!hasPermission('manageIntel')) { notify('Access Denied', 'You cannot log this', 'error'); return; }
            processing.value = true; 
            try { await api('/interaction', { method: 'POST', body: JSON.stringify(forms.interaction) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } 
        };
        
        const submitLocation = async () => { 
            if(processing.value) return;
            if (!hasPermission('manageLocations')) { notify('Access Denied', 'You cannot edit locations', 'error'); return; }
            processing.value = true; 
            try { 
                // Determine method based on presence of ID (edit vs add)
                const method = forms.location.id ? 'PATCH' : 'POST';
                await api('/location', { method: method, body: JSON.stringify(forms.location) }); 
                viewSubject(selected.value.id); 
                closeModal(); 
            } finally { processing.value = false; } 
        };
        
        const submitIntel = async () => { 
            if(processing.value) return;
            if (!hasPermission('manageIntel')) { notify('Access Denied', 'You cannot add intel', 'error'); return; }
            processing.value = true; 
            try { await api('/intel', { method: 'POST', body: JSON.stringify(forms.intel) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } 
        };
        
        const submitRel = async () => { 
            if(processing.value) return;
            if (!hasPermission('manageRelationships')) { notify('Access Denied', 'You cannot change relationships', 'error'); return; }
            processing.value = true; 
            try { 
                const method = forms.rel.id ? 'PATCH' : 'POST'; 
                const payload = method === 'POST' ? { subjectA: selected.value.id, targetId: forms.rel.targetId, type: forms.rel.type, reciprocal: forms.rel.reciprocal } : { id: forms.rel.id, type: forms.rel.type, reciprocal: forms.rel.reciprocal }; 
                await api('/relationship', { method: method, body: JSON.stringify(payload) }); 
                viewSubject(selected.value.id); closeModal(); 
            } finally { processing.value = false; } 
        };
        
        const submitMediaLink = async () => { 
            if(processing.value) return;
            if (!hasPermission('manageFiles')) { notify('Access Denied', 'You cannot add files', 'error'); return; }
            processing.value = true; 
            try { await api('/media-link', { method: 'POST', body: JSON.stringify(forms.mediaLink) }); viewSubject(selected.value.id); closeModal(); } finally { processing.value = false; } 
        };
        
        const deleteItem = async (table, id) => { 
            if(processing.value) return;
            const permMap = {
                subject_interactions: 'manageIntel',
                subject_locations: 'manageLocations',
                subject_intel: 'manageIntel',
                subject_relationships: 'manageRelationships',
                subject_media: 'manageFiles'
            };
            const perm = permMap[table] || 'editSubjects';
            if (!hasPermission(perm)) { notify('Access Denied', 'You cannot remove this', 'error'); return; }
            if(confirm('Delete item?')) { 
                processing.value = true;
                try { await api('/delete', { method: 'POST', body: JSON.stringify({ table, id }) }); viewSubject(selected.value.id); } finally { processing.value = false; }
            } 
        };
        
        const deleteProfile = async () => { 
            if(processing.value) return;
            if (!hasPermission('deleteSubjects')) { notify('Access Denied', 'You cannot delete profiles', 'error'); return; }
            if(confirm('WARNING: DELETE THIS PROFILE?')) { 
                processing.value = true;
                try { await api('/delete', { method: 'POST', body: JSON.stringify({ table: 'subjects', id: selected.value.id }) }); fetchData(); changeTab('targets'); } finally { processing.value = false; }
            } 
        };

        // Files
        const fileInput = ref(null);
        const uploadType = ref(null);
        const triggerUpload = (type) => { 
            if (!hasPermission('manageFiles')) { notify('Access Denied', 'You cannot upload files', 'error'); return; }
            uploadType.value = type; fileInput.value.click(); 
        };
        const handleFile = async (e) => {
             const f = e.target.files[0]; if(!f) return;
             if(processing.value) return;
             processing.value = true;
             
             const reader = new FileReader(); reader.readAsDataURL(f);
             reader.onload = async (ev) => {
                 try {
                    await api(uploadType.value === 'avatar' ? '/upload-avatar' : '/upload-media', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, data: ev.target.result.split(',')[1], filename: f.name, contentType: f.type }) });
                    viewSubject(selected.value.id);
                 } finally {
                    processing.value = false;
                    e.target.value = ''; // Reset input to allow re-uploading same file
                 }
             };
        };

        const fetchShareLinks = async () => { activeShareLinks.value = await api('/share-links?subjectId=' + selected.value.id); };
        
        const createShareLink = async () => { 
            if(processing.value) return;
            if (!hasPermission('manageShares')) { notify('Access Denied', 'You cannot create shares', 'error'); return; }
            processing.value = true;
            try { await api('/share-links', { method: 'POST', body: JSON.stringify({ subjectId: selected.value.id, durationMinutes: forms.share.minutes, requireLocation: forms.share.requireLocation, allowedTabs: forms.share.allowedTabs }) }); fetchShareLinks(); } finally { processing.value = false; }
        };
        
        const revokeLink = async (t) => { 
            if(processing.value) return;
            if (!hasPermission('manageShares')) { notify('Access Denied', 'You cannot revoke shares', 'error'); return; }
            processing.value = true;
            try { await api('/share-links?token='+t, { method: 'DELETE' }); fetchShareLinks(); } finally { processing.value = false; }
        };

        // Admin Management
        const resetAdminForm = () => { editingAdminId.value = null; Object.assign(forms.admin, { email: '', password: '', allowedSections: cloneAllowed(), is_disabled: false, is_master: false }); };
        const editAdmin = (admin) => {
            editingAdminId.value = admin.id;
            Object.assign(forms.admin, { email: admin.email, password: '', allowedSections: JSON.parse(JSON.stringify(admin.allowed_sections)), is_disabled: admin.is_disabled, is_master: admin.is_master });
        };
        const saveAdmin = async () => {
            if (processing.value) return;
            if (!adminProfile.value?.is_master) { notify('Access Denied', 'Only the master admin can do this', 'error'); return; }
            if (!editingAdminId.value && !forms.admin.password) { notify('Missing Data', 'New admins need a password', 'error'); return; }
            processing.value = true;
            try {
                const payload = { email: forms.admin.email, allowedSections: forms.admin.allowedSections, is_disabled: forms.admin.is_disabled, is_master: forms.admin.is_master };
                if (forms.admin.password) payload.password = forms.admin.password;
                if (editingAdminId.value) await api('/admins/' + editingAdminId.value, { method: 'PATCH', body: JSON.stringify(payload) });
                else await api('/admins', { method: 'POST', body: JSON.stringify(payload) });
                await fetchAdminConsole();
                resetAdminForm();
                notify('Saved', 'Admin permissions updated', 'success');
            } finally { processing.value = false; }
        };
        const toggleAdminStatus = async (admin) => {
            if (!adminProfile.value?.is_master) return notify('Access Denied', 'Master only', 'error');
            await api('/admins/' + admin.id, { method: 'PATCH', body: JSON.stringify({ is_disabled: !admin.is_disabled }) });
            await fetchAdminConsole();
        };
        const forceLogoutAdmin = async (admin) => {
            if (!adminProfile.value?.is_master) return notify('Access Denied', 'Master only', 'error');
            await api('/admins/' + admin.id, { method: 'PATCH', body: JSON.stringify({ forceLogout: true }) });
            await fetchAdminConsole();
            notify('Logged Out', admin.email + ' sessions revoked', 'success');
        };
        const fetchAdminConsole = async () => {
            if (!adminProfile.value?.is_master) return;
            const [list, logs] = await Promise.all([api('/admins'), api('/admins/logins')]);
            admins.value = list;
            adminLogs.value = logs;
        };
        
        const copyToClipboard = (t) => { navigator.clipboard.writeText(t); notify('Copied', 'Link copied', 'success'); };
        const getShareUrl = (t) => window.location.origin + '/share/' + t;
        const getThreatColor = (l, bg) => { const c = { 'Critical': 'red', 'High': 'orange', 'Medium': 'yellow', 'Low': 'green' }[l] || 'gray'; return bg ? \`bg-\${c}-100 text-\${c}-800 border-2 border-\${c}-500\` : \`text-\${c}-600\`; };
        const openSettings = () => { 
            if (!adminProfile.value?.is_master) { notify('Master Only', 'Only the master admin can reset data', 'error'); return; }
            if(confirm("RESET SYSTEM?")) { api('/nuke', {method:'POST'}).then(() => { localStorage.clear(); window.location.href = '/'; }); } 
        };
        const handleLogout = () => { localStorage.removeItem('token'); location.reload(); };

        watch(subTab, (val) => {
            if(!visibleSubjectTabs.value.includes(val)) return;
            if(val === 'map') nextTick(() => initMap('subjectMap', selected.value.locations || []));
            if(val === 'capabilities') nextTick(renderSkillsChart); // RENDER CHART ON TAB CHANGE
            if(val === 'network') nextTick(() => {
                 const container = document.getElementById('relNetwork');
                 if(!container || !selected.value) return;
                 const mainAvatar = resolveImg(selected.value.avatar_path) || 'https://ui-avatars.com/api/?name='+selected.value.full_name;
                 const nodes = [{ id: selected.value.id, label: selected.value.full_name, size: 30, shape: 'circularImage', image: mainAvatar, borderWidth: 4, color: {border: '#000000', background: '#ffffff'} }];
                 const edges = [];
                 selected.value.relationships.forEach(r => {
                    const targetId = r.subject_a_id === selected.value.id ? r.subject_b_id : r.subject_a_id;
                    const targetAvatar = resolveImg(r.target_avatar) || 'https://ui-avatars.com/api/?name='+r.target_name;
                    nodes.push({ id: targetId || 'ext-'+r.id, label: r.target_name, shape: 'circularImage', image: targetAvatar, borderWidth: 3, color: {border: '#000000', background: '#ffffff'} });
                    edges.push({ 
                        from: selected.value.id, 
                        to: targetId || 'ext-'+r.id, 
                        label: r.subject_a_id === selected.value.id ? r.relationship_type : (r.role_b || r.relationship_type), 
                        // Updated Edge Style
                        font: { align: 'middle', face: 'Comic Neue', size: 14, strokeWidth: 0, background: 'white', color: '#000000' }, 
                        color: {color:'#000000', width: 2, highlight: '#8B5CF6'},
                        smooth: { type: 'continuous', roundness: 0.5 },
                        arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } }
                    });
                 });
                 const network = new vis.Network(container, { nodes, edges }, { 
                     nodes: { borderWidth: 3, font: { face: 'Fredoka', size: 14, color: '#000000' } }, 
                     edges: { color: '#000000', width: 2, smooth: { type: 'continuous', forceDirection: 'none' } },
                     physics: { enabled: false }, // Static 
                     interaction: { dragNodes: true, zoomView: true, dragView: true, hover: true }
                 });
                 // CLICK HANDLER FOR MINI PROFILE
                 network.on("click", (params) => {
                     if(params.nodes.length > 0) {
                         const nodeId = params.nodes[0];
                         const nodeData = data.nodes.find(n => n.id === nodeId);
                         if(nodeData) openModal('mini-profile', { id: nodeId, full_name: nodeData.label, occupation: nodeData.occupation, avatar_path: nodeData.image, nationality: nodeData.group === 'Low' ? '' : '', threat_level: nodeData.group });
                     }
                 });
            });
        });

        watch(currentTab, (val) => {
             if(val === 'map' && canSeeTab('map')) nextTick(async () => { mapData.value = await api('/map-data'); initMap('warRoomMap', mapData.value); });
             if(val === 'network' && canSeeTab('network')) nextTick(async () => {
                const data = await api('/global-network');
                const container = document.getElementById('globalNetworkGraph');
                
                // --- CLUSTER CENTROID LOGIC ---
                let totalX = 0, totalY = 0, count = 0;
                data.nodes.forEach(n => {
                    if (n.x !== null && n.y !== null && n.x !== undefined && n.y !== undefined) {
                        totalX += n.x;
                        totalY += n.y;
                        count++;
                    }
                });
                
                const avgX = count > 0 ? totalX / count : 0;
                const avgY = count > 0 ? totalY / count : 0;

                data.nodes.forEach(n => { 
                    n.image = resolveImg(n.image) || 'https://ui-avatars.com/api/?name='+n.label;
                    n.borderWidth = 3;
                    n.color = { border: '#000000', background: '#ffffff' };
                    n.font = { face: 'Fredoka', size: 14, color: '#000000', background: '#ffffff' };
                    
                    // IF NO POSITION SAVED, PLACE NEAR CLUSTER OR RANDOM
                    if (n.x === null || n.x === undefined) {
                        const angle = Math.random() * Math.PI * 2;
                        const radius = 100 + Math.random() * 200; // Place in a ring around center
                        n.x = avgX + Math.cos(angle) * radius;
                        n.y = avgY + Math.sin(angle) * radius;
                    }
                });

                // GLOBAL NETWORK OPTIONS
                const options = { 
                    nodes: { 
                        shape: 'circularImage', 
                        borderWidth: 3,
                        physics: false // KEY CHANGE: Nodes don't push each other
                    }, 
                    edges: { 
                        color: { color: '#000000', highlight: '#8B5CF6' },
                        width: 2,
                        selectionWidth: 4,
                        hoverWidth: 3,
                        arrows: { to: { enabled: true, scaleFactor: 1, type: 'arrow' } },
                        smooth: {
                            enabled: true,
                            type: 'continuous', // Fixes the "0,0 reference" curve issue
                            roundness: 0.5,
                            forceDirection: 'none'
                        },
                        font: {
                            align: 'middle',
                            size: 12,
                            face: 'Comic Neue',
                            background: 'white',
                            strokeWidth: 0,
                            color: '#000000'
                        }
                    },
                    physics: { 
                        enabled: false, // GLOBAL DISABLE: No physics simulation at all
                        stabilization: false
                    },
                    interaction: { 
                        dragNodes: true, 
                        dragView: true, 
                        zoomView: true, 
                        hover: true, // Highlights edges on hover
                        selectConnectedEdges: true
                    } 
                };

                const network = new vis.Network(container, data, options);
                
                // Focus on the cluster
                network.moveTo({ position: { x: avgX, y: avgY } });

                // --- SAVE POSITION ON DRAG END ---
                network.on("dragEnd", function (params) {
                    if (params.nodes.length > 0) {
                        const positions = network.getPositions(params.nodes);
                        Object.keys(positions).forEach(id => {
                            const pos = positions[id];
                            api('/subjects/'+id, { method: 'PATCH', body: JSON.stringify({ network_x: Math.round(pos.x), network_y: Math.round(pos.y) }) });
                        });
                    }
                });

                network.on("click", (params) => {
                    if(params.nodes.length > 0) {
                        const nodeId = params.nodes[0];
                        const nodeData = data.nodes.find(n => n.id === nodeId);
                        if(nodeData) openModal('mini-profile', { id: nodeId, full_name: nodeData.label, occupation: nodeData.occupation, avatar_path: nodeData.image, nationality: nodeData.group === 'Low' ? '' : '', threat_level: nodeData.group });
                    }
                });
            });
            if (val === 'admins' && adminProfile.value?.is_master) fetchAdminConsole();
        });

        onMounted(async () => { 
            if(localStorage.getItem('token')) { 
                view.value = 'app'; 
                await hydrateSession(); 
                await fetchData(); 
            } 
        });

        return {
            view, loading, processing, auth, adminProfile, visibleTabs, currentTab, subTab, visibleSubjectTabs, subjectTabLabels, stats, feed, subjects, filteredSubjects, selected, search, modal, forms,
            analysisResult, cmdQuery, cmdResults, cmdInput, locationSearchQuery, locationSearchResults, modalTitle, groupedIntel, admins, adminLogs,
            handleAuth, fetchData, viewSubject, changeTab, changeSubTab, openModal, closeModal, 
            submitSubject, submitInteraction, submitLocation, submitIntel, submitRel, triggerUpload, handleFile, deleteItem, deleteProfile, hasPermission,
            fetchShareLinks, createShareLink, revokeLink, copyToClipboard, getShareUrl, resolveImg, getThreatColor, saveAdmin, editAdmin, resetAdminForm, toggleAdminStatus, forceLogoutAdmin,
            activeShareLinks, suggestions, debounceSearch, selectLocation, openSettings, handleLogout, fetchAdminConsole,
            mapData, mapSearchQuery, updateMapFilter, filteredMapData, presets, applyPreset, autoFillReciprocal, toasts, quickAppend, exportData, submitMediaLink,
            showMapSidebar, flyToGlobal, flyTo, showProfileMapList,
            fileInput,
            getSkillScore, updateSkill, // New Capability Functions
            getSocialInfo, handleIntelInput, // Social Media Logic
            refreshApp,
            copyCoords, updatePickerMarker // Location Edit
        };
      }
    }).mount('#app');
  
`;
