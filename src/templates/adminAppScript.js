import { ADMIN_APP_SCRIPT_CONTENT } from './admin/script/appScriptContent.js';
import { wrapScriptTag } from './admin/script/wrapScript.js';

export const ADMIN_APP_SCRIPT = wrapScriptTag([ADMIN_APP_SCRIPT_CONTENT]);
