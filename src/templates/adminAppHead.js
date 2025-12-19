export const ADMIN_APP_HEAD = `
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>PEOPLE OS // PLAYGROUND</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <!-- Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  
  <style>
    /* Hide Vue templates until mounted to avoid raw mustache flashing */
    [v-cloak] { display: none !important; }

    /* Refined Light Theme */
    :root { 
        --bg-color: #F5F7FB;
        --card-bg: #FFFFFF;
        --border-color: #0F172A;
        --shadow-color: rgba(15, 23, 42, 0.12);
        --primary: #1D4ED8;
    }
    
    body { 
        font-family: 'Inter', system-ui, -apple-system, sans-serif; 
        background-color: var(--bg-color); 
        color: #1f2937;
        background-image: linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(245,247,251,1) 30%);
        font-weight: 600;
    }

    h1, h2, h3, h4, .font-heading { font-family: 'Space Grotesk', 'Inter', sans-serif; letter-spacing: -0.01em; }
    
    /* "Sticker" Card Style replacing Glass */
    .fun-card { 
        background: var(--card-bg); 
        border: 2px solid var(--border-color); 
        box-shadow: 0px 10px 30px -12px var(--shadow-color);
        border-radius: 1rem; 
        transition: all 0.12s ease-in-out;
    }
    
    /* Input Fields - Chunky */
    .fun-input { 
        background: #fff; 
        border: 2px solid var(--border-color); 
        color: #000; 
        border-radius: 0.75rem; 
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        box-shadow: 0px 6px 18px -12px var(--shadow-color);
    }
    .fun-input:focus { 
        outline: none; 
        box-shadow: 0px 0px 0px 3px rgba(29, 78, 216, 0.15); 
        border-color: var(--primary);
    }
    .fun-input::placeholder { color: #94A3B8; font-weight: 500; }

    /* Buttons - Clicky */
    .fun-btn {
        border: 2px solid var(--border-color);
        box-shadow: 0px 6px 18px -12px var(--shadow-color);
        transition: all 0.12s;
        font-family: 'Space Grotesk', 'Inter', sans-serif;
    }
    .fun-btn:active {
        transform: translate(1px, 1px);
        box-shadow: 0px 4px 12px -10px var(--shadow-color);
    }
    .fun-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border: 2px solid transparent; border-radius: 999px; }
    ::-webkit-scrollbar-track { background: transparent; }

    /* Utility helpers */
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .touch-scroll { -webkit-overflow-scrolling: touch; }

    .safe-area-pb { padding-bottom: env(safe-area-inset-bottom); }
    .animate-bounce-in { animation: bounceIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    @keyframes bounceIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    
    /* Marker - FIXED */
    .avatar-marker-fun { 
        width: 100%; height: 100%; 
        border-radius: 50%; 
        background: white;
        border: 3px solid white; 
        box-shadow: 0 0 0 2px var(--border-color); /* Faux border that follows radius */
        overflow: hidden; /* Clips image */
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .avatar-marker-fun img {
        width: 100%; 
        height: 100%;
        object-fit: cover;
        display: block;
    }
    
    /* Toggle Switch */
    .toggle-checkbox:checked {
        right: 0;
        border-color: #68D391;
    }
    .toggle-checkbox:checked + .toggle-label {
        background-color: #68D391;
    }
    
    /* Refresh Spin */
    .spin-fast { animation: spin 0.5s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }

    /* Mobile polish */
    @media (max-width: 640px) {
        .toast-stack { left: 1rem; right: 1rem; width: auto; }
        .toast-card { width: 100%; }
        .mobile-brand { min-width: 0; }
        .mobile-brand span { display: inline-block; max-width: 9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    }
  </style>
</head>
`;
