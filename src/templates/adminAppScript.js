export const ADMIN_APP_SCRIPT = `
  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        // --- STATE ---
        const view = ref('auth');
        const loading = ref(false);
        const user = ref({ permissions: {} }); // Current logged in user
        const detailTab = ref('Intel');
        
        // Auth
        const auth = reactive({ email: '', password: '', reqLocation: false, error: null });

        // Data
        const team = ref([]); // Admin list
        const subjects = ref([]);
        const feed = ref([]);
        const stats = ref({});
        const selected = ref(null);
        const currentTab = ref('dashboard');
        const search = ref('');
        const filterStatus = ref('All');
        const suggestions = reactive({ occupations: [], nationalities: [], ideologies: [] });
        const shareResult = ref(null);

        // Forms & Modals
        const modal = reactive({ active: null });
        const forms = reactive({
            admin: { permissions: { tabs: [], can_create: false } },
            subject: { status: 'Active', threat_level: 'Low' },
            intel: {},
            interaction: {},
            location: {},
            relationship: {},
            media: {},
            share: { durationMinutes: 60, requireLocation: false, allowedTabs: ['Profile', 'Intel', 'Files', 'Map', 'History', 'Network'] }
        });
        
        // Notifications
        const toasts = ref([]);
        const notify = (title, msg, type = 'success') => {
             toasts.value.push({id:Date.now(), title, msg, color: type==='error'?'red':'green', icon: type==='error'?'fa-circle-xmark':'fa-circle-check'});
             setTimeout(()=>toasts.value.shift(), 3000);
        };

        // --- COMPUTED PROPERTIES ---

        // Controls which sidebar tabs are visible based on Permissions
        const visibleTabs = computed(() => {
            const all = [
                { id: 'dashboard', icon: 'fa-solid fa-chart-pie', label: 'Briefing' },
                { id: 'targets', icon: 'fa-solid fa-address-book', label: 'Database' },
                { id: 'map', icon: 'fa-solid fa-map-location-dot', label: 'Global Map' },
                { id: 'network', icon: 'fa-solid fa-circle-nodes', label: 'Network' },
            ];
            
            let allowed = all;
            if (!user.value.is_master) {
                const tabs = user.value.permissions?.tabs || [];
                allowed = all.filter(t => tabs.includes(t.id));
            }
            
            // Only Master sees Team tab
            if (user.value.is_master) {
                allowed.push({ id: 'team', icon: 'fa-solid fa-users-gear', label: 'Team' });
            }
            return allowed;
        });

        const canCreate = computed(() => user.value.is_master || user.value.permissions?.can_create);
        
        const filteredSubjects = computed(() => {
            let res = subjects.value;
            if (filterStatus.value !== 'All') res = res.filter(s => s.status === filterStatus.value);
            if (search.value) {
                const q = search.value.toLowerCase();
                res = res.filter(s => s.full_name.toLowerCase().includes(q) || (s.alias && s.alias.toLowerCase().includes(q)));
            }
            return res;
        });

        // --- API WRAPPER ---
        const api = async (ep, opts = {}) => {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) };
            try {
                const res = await fetch('/api' + ep, { ...opts, headers });
                
                // Auth Errors
                if(res.status === 401) { 
                    localStorage.removeItem('token'); 
                    view.value = 'auth'; 
                    throw new Error("Session Expired"); 
                }
                // Location Requirement Trigger
                if (res.status === 428) throw new Error("LOCATION_REQUIRED");

                const data = await res.json();
                if(data.error) throw new Error(data.error);
                return data;
            } catch(e) {
                if (e.message !== "LOCATION_REQUIRED") notify('System Error', e.message, 'error');
                throw e;
            }
        };

        // --- AUTHENTICATION FLOW ---
        const handleAuth = async (coords = null) => {
            loading.value = true;
            auth.error = null;
            try {
                const body = { email: auth.email, password: auth.password };
                if (coords) body.location = { lat: coords.latitude, lng: coords.longitude };

                const res = await api('/login', { method: 'POST', body: JSON.stringify(body) });
                
                localStorage.setItem('token', res.token);
                user.value = res.user;
                view.value = 'app';
                fetchData(); // Initial Data Load

            } catch(e) {
                if (e.message === "LOCATION_REQUIRED") {
                    auth.reqLocation = true; // Show Location UI
                    auth.error = null;
                } else {
                    auth.error = e.message;
                }
            } finally {
                loading.value = false;
            }
        };

        const retryAuthWithLocation = () => {
             loading.value = true;
             if (!navigator.geolocation) {
                 auth.error = "Geolocation not supported by device";
                 loading.value = false;
                 return;
             }
             navigator.geolocation.getCurrentPosition(
                 (pos) => handleAuth(pos.coords),
                 (err) => {
                     auth.error = "Location denied: " + err.message;
                     loading.value = false;
                 },
                 { enableHighAccuracy: true }
             );
        };

        const handleLogout = () => {
            localStorage.removeItem('token');
            location.reload();
        };

        // --- DATA FETCHING ---
        const fetchData = async () => {
            try {
                // Determine what to fetch based on permissions
                const allowedIds = visibleTabs.value.map(t => t.id);
                
                if (user.value.is_master) fetchTeam();
                
                if (allowedIds.includes('dashboard')) {
                    const d = await api('/dashboard');
                    stats.value = d.stats; 
                    feed.value = d.feed;
                }
                
                if (allowedIds.includes('targets')) {
                    subjects.value = await api('/subjects');
                    const suggs = await api('/suggestions');
                    Object.assign(suggestions, suggs);
                }
                
                if (allowedIds.includes('map')) {
                    // Map data fetched when tab activates
                }

            } catch(e) { console.error(e); }
        };

        const fetchTeam = async () => {
            team.value = await api('/team');
        };

        // --- TEAM MANAGEMENT ---
        const submitAdmin = async () => {
             const endpoint = '/team';
             const method = modal.active === 'add-admin' ? 'POST' : 'PATCH';
             await api(endpoint, { method, body: JSON.stringify(forms.admin) });
             
             fetchTeam();
             closeModal();
             notify('Team Updated', `Admin ${forms.admin.email} processed.`);
        };

        const deleteAdmin = async (id) => {
            if(!confirm("Permanently revoke this admin's access?")) return;
            await api('/team', { method: 'DELETE', body: JSON.stringify({id}) });
            fetchTeam();
            notify('Revoked', 'Admin removed from system');
        };

        // --- SUBJECT MANAGEMENT ---
        const submitSubject = async () => {
            const method = modal.active === 'add-subject' ? 'POST' : 'PATCH';
            const url = modal.active === 'add-subject' ? '/subjects' : '/subjects/' + forms.subject.id;
            
            const res = await api(url, { method, body: JSON.stringify(forms.subject) });
            
            if (modal.active === 'add-subject') {
                viewSubject(res.id);
            } else {
                viewSubject(forms.subject.id); // Refresh
            }
            fetchData(); // Refresh list
            closeModal();
        };

        const archiveSubject = async (id) => {
            if(!confirm("Archive this profile? It will be hidden from main lists.")) return;
            await api('/delete', { method: 'POST', body: JSON.stringify({ table: 'subjects', id }) });
            selected.value = null;
            currentTab.value = 'targets';
            fetchData();
        };

        // --- SUB-DATA HANDLING (Generic) ---
        const submitGeneric = async () => {
             const type = modal.active.split('-')[1]; // intel, interaction, location...
             let body = { ...forms[type] };
             
             // Contextual IDs
             body.subject_id = selected.value.id; 
             if (type === 'relationship') body.subjectA = selected.value.id; 

             await api('/' + (type === 'media-link' ? 'media-link' : type), { method: 'POST', body: JSON.stringify(body) });
             
             viewSubject(selected.value.id); // Refresh detail view
             closeModal();
             notify('Data Logged', `${type} added to profile.`);
        };

        const handleFileUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                await api('/upload-media', { 
                    method: 'POST', 
                    body: JSON.stringify({ 
                        subjectId: selected.value.id, 
                        data: base64, 
                        filename: file.name, 
                        contentType: file.type 
                    }) 
                });
                viewSubject(selected.value.id);
                notify('Upload Complete', 'File encrypted and stored.');
            };
            reader.readAsDataURL(file);
        };

        // --- VIEW LOGIC ---
        const viewSubject = async (id) => {
            loading.value = true;
            try {
                selected.value = await api('/subjects/'+id);
                currentTab.value = 'detail';
                // Reset map if map tab active
                if(detailTab.value === 'Map') initSubjectMap(); 
            } finally { loading.value = false; }
        };

        const resolveImg = (p) => p ? (p.startsWith('http') || p.startsWith('/') ? p : '/api/media/'+p) : null;

        const changeTab = (t) => {
             if (visibleTabs.value.find(vt => vt.id === t)) {
                 currentTab.value = t;
                 selected.value = null;
             }
        };

        const openModal = (type, data = null) => {
            modal.active = type;
            // Reset Forms
            if (type === 'add-admin') forms.admin = { is_active: true, require_location: false, permissions: { tabs: ['dashboard', 'targets'], can_create: false } };
            if (type === 'edit-admin') forms.admin = { ...data, password: '' };
            if (type === 'add-subject') forms.subject = { status: 'Active', threat_level: 'Low' };
            if (type === 'edit-subject') forms.subject = { ...data };
            
            // Sub-forms
            if (type === 'add-interaction') forms.interaction = { date: new Date().toISOString().slice(0,16), type: 'Sighting' };
            if (type === 'add-location') forms.location = { type: 'Last Seen' };
            if (type === 'share') { shareResult.value = null; forms.share.requireLocation = false; }
        };

        const closeModal = () => modal.active = null;

        // --- SHARING ---
        const openShareModal = () => openModal('share');
        
        const createShare = async () => {
            const res = await api('/share-links', { 
                method: 'POST', 
                body: JSON.stringify({ subjectId: selected.value.id, ...forms.share }) 
            });
            shareResult.value = res.url;
        };

        const copyShare = () => {
            navigator.clipboard.writeText(shareResult.value);
            notify('Copied', 'Secure link on clipboard');
            closeModal();
        };

        // --- VISUALIZATION INIT ---
        
        const initSubjectMap = () => {
             nextTick(() => {
                const el = document.getElementById('subjectMap');
                if(!el || !selected.value) return;
                // Re-init logic (Leaflet requires destroying old map or check if exists)
                // Simplified for this context:
                if(el._leaflet_id) return; // Already init
                
                const map = L.map('subjectMap').setView([20,0], 2);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
                
                selected.value.locations.forEach(l => {
                    L.marker([l.lat, l.lng]).addTo(map).bindPopup(l.name + ' (' + l.type + ')');
                });
             });
        };

        const initGlobalMap = async () => {
             const data = await api('/map-data');
             const el = document.getElementById('warRoomMap');
             if(!el) return;
             // Check if map already exists to avoid error
             // Note: In real app, store map instance in ref to remove() it.
             const map = L.map('warRoomMap').setView([20,0], 2);
             L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
             data.forEach(d => {
                 L.marker([d.lat, d.lng]).addTo(map).bindPopup(\`<b>\${d.full_name}</b><br>\${d.name}\`);
             });
        };

        const initNetwork = async () => {
             const data = await api('/global-network');
             const container = document.getElementById('globalNetworkGraph');
             if(!container) return;
             
             const options = {
                 nodes: { borderWidth: 2, size: 30, color: { border: '#000', background: '#fff' }, font: { color: '#fff' } },
                 edges: { color: 'gray', smooth: true },
                 physics: { stabilization: false, barnesHut: { gravitationalConstant: -8000 } }
             };
             new vis.Network(container, data, options);
        };

        // --- WATCHERS ---
        watch(currentTab, (t) => {
             if (t === 'map') nextTick(initGlobalMap);
             if (t === 'network') nextTick(initNetwork);
        });
        
        watch(detailTab, (t) => {
             if (t === 'Map') initSubjectMap();
        });

        // --- LIFECYCLE ---
        onMounted(() => {
            const t = localStorage.getItem('token');
            if(t) {
                try {
                    // Pre-decode for UI
                    const payload = JSON.parse(atob(t.split('.')[1]));
                    user.value = { is_master: false, email: payload.email }; 
                    handleAuth(); // Verify token & get fresh permissions
                } catch(e) {
                    view.value = 'auth';
                }
            }
        });

        return {
            view, loading, auth, user, visibleTabs, canCreate,
            currentTab, detailTab, stats, feed, team, subjects, filteredSubjects, selected,
            modal, forms, toasts, suggestions, shareResult,
            search, filterStatus,
            
            handleAuth, retryAuthWithLocation, handleLogout,
            changeTab, openModal, closeModal, viewSubject,
            submitAdmin, deleteAdmin, submitSubject, submitGeneric, archiveSubject,
            handleFileUpload, resolveImg, fetchData,
            openShareModal, createShare, copyShare
        };
      }
    }).mount('#app');
  </script>
`;
