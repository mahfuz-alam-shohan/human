export const adminStyles = `
    /* Kiddy Theme Config */
    :root { 
        --bg-color: #FEF9C3; /* Yellow-100 */
        --card-bg: #FFFFFF;
        --border-color: #000000;
        --shadow-color: #000000;
        --primary: #8B5CF6; /* Violet */
    }
    
    body { 
        font-family: 'Comic Neue', cursive; 
        background-color: var(--bg-color); 
        color: #1f2937;
        /* Dot pattern background */
        background-image: radial-gradient(#F59E0B 2px, transparent 2px);
        background-size: 30px 30px;
        font-weight: 700;
    }

    h1, h2, h3, h4, .font-heading { font-family: 'Fredoka', sans-serif; }
    
    /* "Sticker" Card Style replacing Glass */
    .fun-card { 
        background: white; 
        border: 3px solid black; 
        box-shadow: 5px 5px 0px 0px rgba(0,0,0,1);
        border-radius: 1rem; 
        transition: all 0.1s ease-in-out;
    }
    
    /* Input Fields - Chunky */
    .fun-input { 
        background: #fff; 
        border: 3px solid black; 
        color: #000; 
        border-radius: 0.75rem; 
        font-family: 'Comic Neue', cursive;
        font-weight: 700;
        box-shadow: 3px 3px 0px 0px rgba(0,0,0,0.1);
    }
    .fun-input:focus { 
        outline: none; 
        box-shadow: 3px 3px 0px 0px #8B5CF6; 
        border-color: #8B5CF6;
    }
    .fun-input::placeholder { color: #9CA3AF; font-weight: 400; }

    /* Buttons - Clicky */
    .fun-btn {
        border: 3px solid black; 
        box-shadow: 3px 3px 0px 0px black;
        transition: all 0.1s;
        font-family: 'Fredoka', sans-serif;
    }
    .fun-btn:active {
        transform: translate(2px, 2px);
        box-shadow: 1px 1px 0px 0px black;
    }
    .fun-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 12px; }
    ::-webkit-scrollbar-thumb { background: #FCD34D; border: 3px solid black; border-radius: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }

    .safe-area-pb { padding-bottom: env(safe-area-inset-bottom); }
    .animate-bounce-in { animation: bounceIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    @keyframes bounceIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    
    /* Marker - FIXED */
    .avatar-marker-fun { 
        width: 100%; height: 100%; 
        border-radius: 50%; 
        background: white;
        border: 3px solid white; 
        box-shadow: 0 0 0 3px black; /* Faux border that follows radius */
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
`;
