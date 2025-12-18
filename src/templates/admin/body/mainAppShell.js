import { SIDEBAR_SECTION } from './sidebarSection.js';
import { MOBILE_TOP_BAR_SECTION } from './mobileTopBar.js';
import { MAIN_CONTENT_SECTION } from './mainContent.js';

export const MAIN_APP_SECTION = `
    <!-- MAIN APP -->
    <div v-else class="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
        
${SIDEBAR_SECTION}

${MOBILE_TOP_BAR_SECTION}

${MAIN_CONTENT_SECTION}
    </div>`;
