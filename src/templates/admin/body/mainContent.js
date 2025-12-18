import { DASHBOARD_SECTION } from './dashboardSection.js';
import { TARGETS_SECTION } from './targetsSection.js';
import { GLOBAL_MAP_SECTION } from './mapSection.js';
import { GLOBAL_NETWORK_SECTION } from './networkSection.js';
import { SUBJECT_DETAIL_SECTION } from './subjectSection.js';
import { MOBILE_NAV_SECTION } from './mobileNavSection.js';

export const MAIN_CONTENT_SECTION = `
        <!-- CONTENT -->
        <main class="flex-1 relative overflow-hidden flex flex-col pb-20 md:pb-0 safe-area-pb">
${DASHBOARD_SECTION}
${TARGETS_SECTION}
${GLOBAL_MAP_SECTION}
${GLOBAL_NETWORK_SECTION}
${SUBJECT_DETAIL_SECTION}
        </main>
${MOBILE_NAV_SECTION}`;
