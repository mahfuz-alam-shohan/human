import { APP_TITLE } from './constants.js';
import {
  BadRequestError,
  buildCorsHeaders,
  ensureEnv,
  isoTimestamp,
  jsonResponse,
  errorResponse,
  detectMimeType,
  isInlineSafeMime,
  sanitizeFileName,
  sanitizeSubjectPayload,
  safeJson,
  safeVal,
  verifyJwt
} from './utils.js';
import {
  handleCreateLocation,
  handleGetDashboard,
  handleGetMapData,
  handleGetSharedSubject,
  handleGetSubjectFull,
  handleGetSubjectSuggestions,
  handleLogin,
  handleShareCreate,
  handleShareList,
  handleShareRevoke,
} from './handlers.js';
import { Database } from './db.js';
import { serveHtml, serveSharedHtml } from './templates.js';

async function getOwnedSubject(db, subjectId, adminId) {
  if (!subjectId) return null;
  return db.prepare('SELECT * FROM subjects WHERE id = ? AND admin_id = ? AND is_archived = 0').bind(subjectId, adminId).first();
}

async function getRecordSubjectContext(db, table, id) {
  switch (table) {
    case 'subject_interactions':
    case 'subject_locations':
    case 'subject_intel':
    case 'subject_media':
      return db.prepare(`SELECT subject_id FROM ${table} WHERE id = ?`).bind(id).first();
    case 'subject_relationships':
      return db.prepare('SELECT subject_a_id, subject_b_id FROM subject_relationships WHERE id = ?').bind(id).first();
    default:
      return null;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.endsWith('/') && url.pathname.length > 1 ? url.pathname.slice(0, -1) : url.pathname;
    const corsHeaders = buildCorsHeaders(req.headers.get('Origin'), env?.ALLOWED_ORIGINS);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      ensureEnv(env);
      const database = new Database(env.DB);
      // OPTIMIZATION: Only run schema check on specific actions or lazily to save time/errors
      await database.ensureSchema();
      const db = env.DB;

      // --- PUBLIC ROUTES ---
      if (path === '/api/health' && req.method === 'GET') {
        return jsonResponse({ status: 'ok', service: APP_TITLE, timestamp: isoTimestamp() }, 200, corsHeaders);
      }

      const shareHtmlMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
      if (req.method === 'GET' && shareHtmlMatch) return serveSharedHtml(shareHtmlMatch[1]);

      if (req.method === 'GET' && (path === '/' || path === '/index.html')) return serveHtml();

      // Media is public (or you can secure it, but usually images need to be loaded by browser)
      if (req.method === 'GET' && path.startsWith('/api/media/')) {
        const key = path.replace('/api/media/', '');
        const obj = await env.BUCKET.get(key);
        if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders });
        const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
        const disposition = obj.httpMetadata?.contentDisposition || (isInlineSafeMime(contentType)
          ? 'inline'
          : `attachment; filename="${sanitizeFileName(key)}"`);
        return new Response(obj.body, { headers: { 'Content-Type': contentType, 'Content-Disposition': disposition, ...corsHeaders } });
      }

      const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
      if (req.method === 'GET' && shareApiMatch) return handleGetSharedSubject(db, shareApiMatch[1], corsHeaders);

      if (path === '/api/login' && req.method === 'POST') return handleLogin(req, db, env.JWT_SECRET, corsHeaders);

      // --- AUTHENTICATION MIDDLEWARE ---
      // All routes below this point require a valid JWT token
      const authHeader = req.headers.get('Authorization');
      const token = authHeader && authHeader.split(' ')[1];
      if (!token) return errorResponse('Unauthorized: No token provided', 401, null, corsHeaders);

      const session = await verifyJwt(token, env.JWT_SECRET);
      if (!session || !session.id) return errorResponse('Unauthorized: Invalid token', 401, null, corsHeaders);
      const adminId = session.id; // Trusted Admin ID from token

      // --- PROTECTED ROUTES ---

      if (path === '/api/dashboard') return handleGetDashboard(db, adminId, corsHeaders);
      if (path === '/api/map-data') return handleGetMapData(db, adminId, corsHeaders);
      if (path === '/api/subject-suggestions') return handleGetSubjectSuggestions(db, adminId, corsHeaders);

      if (path === '/api/subjects') {
        if (req.method === 'GET') {
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
          const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
          const res = await db
            .prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?')
            .bind(adminId, limit, offset)
            .all();
          const total = await db.prepare('SELECT COUNT(*) as c FROM subjects WHERE admin_id = ? AND is_archived = 0').bind(adminId).first();
          return jsonResponse(res.results, 200, { ...corsHeaders, 'X-Total-Count': total?.c ?? 0, 'X-Limit': limit, 'X-Offset': offset });
        }
        if (req.method === 'POST') {
          const p = sanitizeSubjectPayload(await safeJson(req));
          // Enforce adminId from token
          p.admin_id = adminId;
          
          await db.prepare(
              `INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, sex, occupation, nationality, ideology, religion, modus_operandi, weakness, dob, age, avatar_path, last_sighted, height, weight, identifying_marks, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              safeVal(p.admin_id), safeVal(p.full_name), safeVal(p.alias), safeVal(p.threat_level), safeVal(p.status), safeVal(p.sex), safeVal(p.occupation), safeVal(p.nationality), safeVal(p.ideology), safeVal(p.religion), safeVal(p.modus_operandi), safeVal(p.weakness), safeVal(p.dob), safeVal(p.age), safeVal(p.avatar_path), safeVal(p.last_sighted), safeVal(p.height), safeVal(p.weight), safeVal(p.identifying_marks), isoTimestamp()
            ).run();
          return jsonResponse({ success: true }, 201, corsHeaders);
        }
      }

      const subjectIdMatch = path.match(/^\/api\/subjects\/(\d+)$/);
      if (subjectIdMatch) {
        const id = subjectIdMatch[1];
        if (req.method === 'GET') return handleGetSubjectFull(db, id, adminId, corsHeaders);
        if (req.method === 'PATCH') {
          const body = await safeJson(req);
          const payload = sanitizeSubjectPayload(body);
          delete payload.id;
          delete payload.created_at;
          delete payload.admin_id; // Prevent changing ownership

          const keys = Object.keys(payload);
          if (!keys.length) return errorResponse('No valid subject fields provided', 400, null, corsHeaders);

          const set = keys.map((k) => `${k} = ?`).join(', ');
          const vals = keys.map((k) => payload[k]);
          await db.prepare(`UPDATE subjects SET ${set}, updated_at = ? WHERE id = ? AND admin_id = ?`)
            .bind(...vals, isoTimestamp(), id, adminId).run();

          return jsonResponse({ success: true }, 200, corsHeaders);
        }
      }

      if (path === '/api/share-links') {
        if (req.method === 'POST') return handleShareCreate(req, db, url.origin, adminId, corsHeaders);
        if (req.method === 'GET') return handleShareList(db, url.searchParams.get('subjectId'), url.origin, adminId, corsHeaders);
        if (req.method === 'DELETE') return handleShareRevoke(db, url.searchParams.get('token'), adminId, corsHeaders);
      }

      // Handle Multipart Uploads (FormData)
      if (path === '/api/upload-avatar' || path === '/api/upload-media') {
        if (req.method !== 'POST') return errorResponse('Method not allowed', 405, null, corsHeaders);

        const formData = await req.formData();
        const file = formData.get('file');
        const subjectId = formData.get('subjectId');

        if (!file || !subjectId) return errorResponse('Missing file or subjectId', 400, null, corsHeaders);

        const subject = await getOwnedSubject(db, Number(subjectId), adminId);
        if (!subject) return errorResponse('Subject not found or archived', 404, null, corsHeaders);

        const buffer = await file.arrayBuffer();
        const detectedType = detectMimeType(buffer, file.type);
        const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(file.name)}`;
        const httpMetadata = { contentType: detectedType };
        if (!isInlineSafeMime(detectedType)) {
          httpMetadata.contentDisposition = `attachment; filename="${sanitizeFileName(file.name)}"`;
        }

        await env.BUCKET.put(key, buffer, { httpMetadata });

        if (path.includes('avatar')) {
            await db.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ? AND admin_id = ?').bind(key, subjectId, adminId).run();
        } else {
            await db.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?,?,?,?,?)')
              .bind(subjectId, key, detectedType, 'Attached File', isoTimestamp()).run();
        }
        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      if (req.method === 'POST') {
        // Safe check for JSON body routes
        const p = path !== '/api/nuke' ? await safeJson(req) : {};

        if (path === '/api/interaction') {
          const subject = await getOwnedSubject(db, Number(p.subject_id), adminId);
          if (!subject) return errorResponse('Subject not found or archived', 404, null, corsHeaders);
          await db.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, created_at) VALUES (?,?,?,?,?,?)')
            .bind(p.subject_id, p.date, p.type, safeVal(p.transcript), safeVal(p.conclusion), isoTimestamp()).run();
          return jsonResponse({ success: true }, 201, corsHeaders);
        }

        if (path === '/api/location') {
          return handleCreateLocation(db, p, adminId, corsHeaders);
        }

        if (path === '/api/intel') {
          const subject = await getOwnedSubject(db, Number(p.subject_id), adminId);
          if (!subject) return errorResponse('Subject not found or archived', 404, null, corsHeaders);
          await db.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)')
            .bind(p.subject_id, p.category, p.label, p.value, isoTimestamp()).run();
          return jsonResponse({ success: true }, 201, corsHeaders);
        }

        if (path === '/api/relationship') {
          const sourceSubject = await getOwnedSubject(db, Number(p.subjectA), adminId);
          if (!sourceSubject) return errorResponse('Subject not found or archived', 404, null, corsHeaders);
          if (p.targetId) {
            const targetSubject = await getOwnedSubject(db, Number(p.targetId), adminId);
            if (!targetSubject) return errorResponse('Target subject not found or archived', 404, null, corsHeaders);
          }
          await db.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, custom_name, custom_avatar, created_at) VALUES (?,?,?,?,?,?)')
            .bind(p.subjectA, safeVal(p.targetId), p.type, safeVal(p.customName), safeVal(p.customAvatar), isoTimestamp()).run();
          return jsonResponse({ success: true }, 201, corsHeaders);
        }

        if (path === '/api/delete') {
          const { table, id } = p;
          const safeTables = ['subjects', 'subject_interactions', 'subject_locations', 'subject_intel', 'subject_relationships', 'subject_media'];
          if (safeTables.includes(table)) {
            if (table === 'subjects') {
              const res = await db.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ? AND admin_id = ?').bind(id, adminId).run();
              if (!res.meta?.changes) return errorResponse('Subject not found', 404, null, corsHeaders);
            } else {
              const context = await getRecordSubjectContext(db, table, id);
              if (!context) return errorResponse('Record not found', 404, null, corsHeaders);
              const subjectIds = [context.subject_id, context.subject_a_id, context.subject_b_id].filter(Boolean);
              const owned = await Promise.all(subjectIds.map((sid) => getOwnedSubject(db, sid, adminId)));
              if (!owned.some(Boolean)) return errorResponse('Forbidden', 403, null, corsHeaders);
              await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
            }
            return jsonResponse({ success: true }, 200, corsHeaders);
          }
        }

        // SECURED NUKE: Now requires the JWT token to reach here
        if (path === '/api/nuke') {
          await database.nuke();
          return jsonResponse({ success: true }, 200, corsHeaders);
        }
      }

      return errorResponse('Route Not Found', 404, null, corsHeaders);
    } catch (e) {
      const status = e instanceof BadRequestError ? e.status : 500;
      const payload = status === 500 ? { error: 'Internal Server Error', message: e.message } : { error: e.message };
      return jsonResponse(payload, status, corsHeaders);
    }
  },
};
