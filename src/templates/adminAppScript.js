export const ADMIN_APP_SCRIPT = `
  <script>
    const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

    createApp({
      setup() {
        // --- STATE ---
        const view = ref('auth');
        const loading = ref(false);
        const user = ref({ permissions: {} }); 
        const detailTab = ref('Intel');
        
        // Auth
        const auth = reactive({ email: '', password: '', reqLocation: false, error: null });

        // Data
        const team = ref([]); 
        const subjects = ref([]);
        const feed = ref([]);
        const stats = ref({});
        const selected = ref(null);
        const currentTab = ref('dashboard');
        const search = ref('');
        const filterStatus = ref('All');

        // Forms
        const modal = reactive({ active: null });
        const forms = reactive({
            admin: { permissions: { tabs: [], allowed_ids: [], detail_tabs: [], can_create: false } },
            subject: { status: 'Active', threat_level: 'Low' },
            intel: {}, interaction: {}, location: {}, relationship: {}, media: {}, skill: {}, share: {}
        });
        
        const toasts = ref([]);
        const notify = (title, msg) => {
             toasts.value.push({id:Date.now(), title, msg, icon: 'fa-check-circle'});
             setTimeout(()=>toasts.value.shift(), 3000);
        };

        // --- COMPUTED ---
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
            if (user.value.is_master) allowed.push({ id: 'team', icon: 'fa-solid fa-users-gear', label: 'Team' });
            return allowed;
        });

        const canCreate = computed(() => user.value.is_master || user.value.permissions?.can_create);
        
        const filteredSubjects = computed(() => {
            let res = subjects.value;
            if (filterStatus.value !== 'All') res = res.filter(s => s.status === filterStatus.value);
            if (search.value) res = res.filter(s => s.full_name.toLowerCase().includes(search.value.toLowerCase()) || (s.alias && s.alias.toLowerCase().includes(search.value.toLowerCase())));
            return res;
        });

        const canViewDetailTab = (tab) => {
            if (user.value.is_master) return true;
            const allowed = user.value.permissions?.detail_tabs || [];
            return allowed.length === 0 || allowed.includes(tab);
        };

        // --- API ---
        const api = async (ep, opts = {}) => {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) };
            try {
                const res = await fetch('/api' + ep, { ...opts, headers });
                if(res.status === 401) { localStorage.removeItem('token'); view.value = 'auth'; throw new Error("Expired"); }
                if (res.status === 428) throw new Error("LOCATION_REQUIRED");
                const data = await res.json();
                if(data.error) throw new Error(data.error);
                return data;
            } catch(e) {
                if (e.message !== "LOCATION_REQUIRED") notify('Error', e.message);
                throw e;
            }
        };

        // --- AUTH ---
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
                fetchData();
            } catch(e) {
                if (e.message === "LOCATION_REQUIRED") auth.reqLocation = true;
                else auth.error = e.message;
            } finally { loading.value = false; }
        };

        const retryAuthWithLocation = () => {
             loading.value = true;
             navigator.geolocation.getCurrentPosition(
                 (pos) => handleAuth(pos.coords),
                 (err) => { auth.error = "Location denied"; loading.value = false; },
                 { enableHighAccuracy: true }
             );
        };

        const handleLogout = () => { localStorage.removeItem('token'); location.reload(); };

        // --- DATA ---
        const fetchData = async () => {
            const allowed = visibleTabs.value.map(t=>t.id);
            if (user.value.is_master) team.value = await api('/team');
            
            if (allowed.includes('dashboard')) {
                const d = await api('/dashboard');
                stats.value = d.stats; feed.value = d.feed;
                nextTick(initChart);
            }
            // Master needs subjects for dropdowns in modals even if tab hidden
            if (allowed.includes('targets') || user.value.is_master) {
                subjects.value = await api('/subjects');
            }
        };

        // --- ACTIONS ---
        const submitAdmin = async () => {
             const method = modal.active === 'add-admin' ? 'POST' : 'PATCH';
             await api('/team', { method, body: JSON.stringify(forms.admin) });
             fetchData(); closeModal(); notify('System', 'Admin Access Updated');
        };

        const deleteAdmin = async (id) => {
            if(confirm("Permanently remove this admin?")) { await api('/team', { method: 'DELETE', body: JSON.stringify({id}) }); fetchData(); }
        };

        const submitGeneric = async () => {
             const type = modal.active.split('-')[1]; // subject, intel, interaction...
             let body = { ...forms[type] };
             if (type !== 'subject') body.subject_id = selected.value.id;
             if (type === 'relationship') body.subjectA = selected.value.id;

             const method = (type === 'subject' && body.id) ? 'PATCH' : 'POST';
             const url = type === 'subject' ? (body.id ? '/subjects/'+body.id : '/subjects') : '/' + type;

             const res = await api(url, { method, body: JSON.stringify(body) });
             
             if (type === 'subject') {
                 if(!body.id) viewSubject(res.id); // View new
                 else viewSubject(body.id); // Refresh current
                 fetchData();
             } else {
                 viewSubject(selected.value.id);
             }
             closeModal();
             notify('System', 'Data point committed');
        };
        
        const handleFileUpload = (e) => {
             const file = e.target.files[0];
             if(!file) return;
             const reader = new FileReader();
             reader.onload = async () => {
                 await api('/upload-media', { method:'POST', body: JSON.stringify({ subjectId: selected.value.id, data: reader.result.split(',')[1], filename: file.name, contentType: file.type })});
                 viewSubject(selected.value.id);
                 notify('Upload', 'File Encrypted & Stored');
             }
             reader.readAsDataURL(file);
        };

        const viewSubject = async (id) => {
            selected.value = await api('/subjects/'+id);
            currentTab.value = 'detail';
            // Default tab logic
            if (!canViewDetailTab(detailTab.value)) {
                const tabs = ['Intel', 'Media', 'Network', 'Timeline', 'Map', 'Skills'];
                detailTab.value = tabs.find(t => canViewDetailTab(t)) || '';
            }
            if(detailTab.value === 'Map') nextTick(initSubjectMap);
        };

        const openModal = (type, data) => {
            modal.active = type;
            if (type === 'add-admin') forms.admin = { is_active: true, require_location: false, permissions: { tabs: ['dashboard', 'targets'], detail_tabs:['Intel','Media','Timeline','Network','Map','Skills'], allowed_ids: [], can_create: false } };
            if (type === 'edit-admin') forms.admin = { ...data, password: '' };
            if (type === 'add-subject') forms.subject = { status:'Active', threat_level:'Low' };
            if (type === 'edit-subject') forms.subject = { ...data };
            if (type.includes('interaction')) forms.interaction = { date: new Date().toISOString().slice(0,16), type:'Sighting' };
        };

        const closeModal = () => modal.active = null;
        const changeTab = (t) => currentTab.value = t;
        const resolveImg = (p) => p ? (p.startsWith('http')?p:'/api/media/'+p) : null;

        // --- VISUALIZATION ---
        const initChart = () => {
             const ctx = document.getElementById('dashboardChart');
             if(!ctx || window.myChart) return;
             // Mock data for visual, real data can be derived from feed
             window.myChart = new Chart(ctx, {
                 type: 'line',
                 data: { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets: [{ label: 'Signals', data: [12, 19, 3, 5, 2, 3, 9], borderColor: 'black', tension: 0.4 }] },
                 options: { responsive: true, maintainAspectRatio: false }
             });
        };

        const initSubjectMap = () => {
             const mapId = 'subjectMap';
             const el = document.getElementById(mapId);
             if(!el) return;
             // Crude re-init prevention
             if(el.innerHTML) el.innerHTML = '';
             const map = L.map(mapId).setView([20,0], 2);
             L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
             selected.value.locations.forEach(l => L.marker([l.lat, l.lng]).addTo(map).bindPopup(l.name));
        };

        const initGlobalMap = async () => {
             const data = await api('/map-data');
             const el = document.getElementById('warRoomMap');
             if(!el) return;
             if(el.innerHTML) el.innerHTML = '';
             const map = L.map('warRoomMap').setView([20,0], 2);
             L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
             data.forEach(d => {
                 const icon = L.divIcon({ className: 'custom-icon', html: \`<div class="w-2 h-2 bg-red-500 rounded-full border border-white"></div>\` });
                 L.marker([d.lat, d.lng], {icon}).addTo(map).bindPopup(\`<b>\${d.full_name}</b><br>\${d.name}\`);
             });
        };

        const initNetwork = async () => {
             const d = await api('/global-network');
             const container = document.getElementById('globalNetworkGraph');
             if(!container) return;
             const options = {
                 nodes: { borderWidth: 2, size: 30, color: { border: '#000', background: '#fff' }, font: { color: '#fff' } },
                 edges: { color: 'gray', smooth: true },
                 physics: { stabilization: false }
             };
             new vis.Network(container, d, options);
        };

        watch(currentTab, (t) => {
            if(t==='map') nextTick(initGlobalMap);
            if(t==='network') nextTick(initNetwork);
            if(t==='dashboard') nextTick(initChart);
        });
        
        watch(detailTab, (t) => { if(t==='Map') nextTick(initSubjectMap); });

        onMounted(() => {
            if(localStorage.getItem('token')) {
                try {
                    const payload = JSON.parse(atob(localStorage.getItem('token').split('.')[1]));
                    user.value = { is_master: false, email: payload.email }; 
                    handleAuth();
                } catch(e) { view.value = 'auth'; }
            }
        });

        return {
            view, auth, user, team, subjects, feed, stats, selected, currentTab, detailTab,
            visibleTabs, canCreate, filteredSubjects, modal, forms, toasts, search, filterStatus, loading,
            handleAuth, retryAuthWithLocation, handleLogout, fetchData, submitAdmin, deleteAdmin,
            submitGeneric, handleFileUpload, viewSubject, openModal, closeModal, changeTab, resolveImg, canViewDetailTab
        };
      }
    }).mount('#app');
  </script>
`;
