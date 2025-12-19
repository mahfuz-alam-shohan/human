import { AUTH_SECTION } from './admin/body/authSection.js';
import { MAIN_APP_SECTION } from './admin/body/mainAppShell.js';
import { TOAST_SECTION } from './admin/body/toastSection.js';
import { MODALS_SECTION } from './admin/body/modalsSection.js';

export const ADMIN_APP_BODY = `
<body class="h-[100dvh] overflow-hidden text-slate-900">
  <div id="app" class="h-full flex flex-col">

${TOAST_SECTION}

${AUTH_SECTION}

${MAIN_APP_SECTION}

${MODALS_SECTION}

  </div>

`;
