// --- Frontend: Main Admin App (Kiddy/Playful Theme + Full Features) ---

import { ADMIN_APP_BODY } from './adminAppBody.js';
import { ADMIN_APP_HEAD } from './adminAppHead.js';
import { ADMIN_APP_SCRIPT } from './adminAppScript.js';

export function serveAdminHtml() {
  const html = `<!DOCTYPE html>
<html lang="en" class="h-[100dvh]">
${ADMIN_APP_HEAD}
${ADMIN_APP_BODY}
${ADMIN_APP_SCRIPT}
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
