import { APP_TITLE, CORS_HEADERS } from './constants.js';
import {
  BadRequestError,
  ensureEnv,
  isoTimestamp,
  jsonResponse,
  errorResponse,
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.endsWith('/') && url.pathname.length > 1 ? url.pathname.slice(0, -1) : url.pathname;

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      ensureEnv(env);
      const database = new Database(env.DB);
      // OPTIMIZATION: Only run schema check on specific actions or lazily to save time/errors
      await database.ensureSchema();
      const db = env.DB;

      // --- PUBLIC ROUTES ---
      if (path === '/api/health' && req.method === 'GET') {
        return jsonResponse({ status: 'ok', service: APP_TITLE, timestamp: isoTimestamp() });
      }

      const shareHtmlMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
      if (req.method === 'GET' && shareHtmlMatch) return serveSharedHtml(shareHtmlMatch[1]);

      if (req.method === 'GET' && (path === '/' || path === '/index.html')) return serveHtml();

      // Media is public (or you can secure it, but usually images need to be loaded by browser)
      if (req.method === 'GET' && path.startsWith('/api/media/')) {
        const key = path.replace('/api/media/', '');
        const obj = await env.BUCKET.get(key);
        if (!obj) return new Response('Not found', { status: 404 });
        return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', ...CORS_HEADERS } });
      }

      const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
      if (req.method === 'GET' && shareApiMatch) return handleGetSharedSubject(db, shareApiMatch[1]);

      if (path === '/api/login' && req.method === 'POST') return handleLogin(req, db, env.JWT_SECRET);

      // --- AUTHENTICATION MIDDLEWARE ---
      // All routes below this point require a valid JWT token
      const authHeader = req.headers.get('Authorization');
      const token = authHeader && authHeader.split(' ')[1];
      if (!token) return errorResponse('Unauthorized: No token provided', 401);
      
      const session = await verifyJwt(token, env.JWT_SECRET);
      if (!session || !session.id) return errorResponse('Unauthorized: Invalid token', 401);
      const adminId = session.id; // Trusted Admin ID from token

      // --- PROTECTED ROUTES ---

      if (path === '/api/dashboard') return handleGetDashboard(db, adminId);
      if (path === '/api/map-data') return handleGetMapData(db, adminId);
      if (path === '/api/subject-suggestions') return handleGetSubjectSuggestions(db, adminId);

      if (path === '/api/subjects') {
        if (req.method === 'GET') {
          const res = await db
            .prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC')
            .bind(adminId)
            .all();
          return jsonResponse(res.results);
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
          return jsonResponse({ success: true });
        }
      }

      const subjectIdMatch = path.match(/^\/api\/subjects\/(\d+)$/);
      if (subjectIdMatch) {
        const id = subjectIdMatch[1];
        if (req.method === 'GET') return handleGetSubjectFull(db, id);
        if (req.method === 'PATCH') {
          const body = await safeJson(req);
          const payload = sanitizeSubjectPayload(body);
          delete payload.id; 
          delete payload.created_at;
          delete payload.admin_id; // Prevent changing ownership

          const keys = Object.keys(payload);
          if (!keys.length) return errorResponse('No valid subject fields provided', 400);

          const set = keys.map((k) => `${k} = ?`).join(', ');
          const vals = keys.map((k) => payload[k]);
          await db.prepare(`UPDATE subjects SET ${set}, updated_at = ? WHERE id = ? AND admin_id = ?`)
            .bind(...vals, isoTimestamp(), id, adminId).run();

          return jsonResponse({ success: true });
        }
      }

      if (path === '/api/share-links') {
        if (req.method === 'POST') return handleShareCreate(req, db, url.origin);
        if (req.method === 'GET') return handleShareList(db, url.searchParams.get('subjectId'), url.origin);
        if (req.method === 'DELETE') return handleShareRevoke(db, url.searchParams.get('token'));
      }

      // Handle Multipart Uploads (FormData)
      if (path === '/api/upload-avatar' || path === '/api/upload-media') {
        if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
        
        const formData = await req.formData();
        const file = formData.get('file');
        const subjectId = formData.get('subjectId');

        if (!file || !subjectId) return errorResponse('Missing file or subjectId', 400);
        
        const buffer = await file.arrayBuffer();
        const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(file.name)}`;
        
        await env.BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type } });

        if (path.includes('avatar')) {
            await db.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
        } else {
            await db.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?,?,?,?,?)')
              .bind(subjectId, key, file.type, 'Attached File', isoTimestamp()).run();
        }
        return jsonResponse({ success: true });
      }

      if (req.method === 'POST') {
        // Safe check for JSON body routes
        const p = path !== '/api/nuke' ? await safeJson(req) : {};

        if (path === '/api/interaction') {
          await db.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, created_at) VALUES (?,?,?,?,?,?)')
            .bind(p.subject_id, p.date, p.type, safeVal(p.transcript), safeVal(p.conclusion), isoTimestamp()).run();
          return jsonResponse({ success: true });
        }

        if (path === '/api/location') {
          return handleCreateLocation(db, p);
        }

        if (path === '/api/intel') {
          await db.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)')
            .bind(p.subject_id, p.category, p.label, p.value, isoTimestamp()).run();
          return jsonResponse({ success: true });
        }

        if (path === '/api/relationship') {
          await db.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, custom_name, custom_avatar, created_at) VALUES (?,?,?,?,?,?)')
            .bind(p.subjectA, safeVal(p.targetId), p.type, safeVal(p.customName), safeVal(p.customAvatar), isoTimestamp()).run();
          return jsonResponse({ success: true });
        }

        if (path === '/api/delete') {
          const { table, id } = p;
          const safeTables = ['subjects', 'subject_interactions', 'subject_locations', 'subject_intel', 'subject_relationships', 'subject_media'];
          if (safeTables.includes(table)) {
            if (table === 'subjects') await db.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ?').bind(id).run();
            else await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
            return jsonResponse({ success: true });
          }
        }

        // SECURED NUKE: Now requires the JWT token to reach here
        if (path === '/api/nuke') {
          await database.nuke();
          return jsonResponse({ success: true });
        }
      }

      return errorResponse('Route Not Found', 404);
    } catch (e) {
      const status = e instanceof BadRequestError ? e.status : 500;
      const payload = status === 500 ? { error: 'Internal Server Error', message: e.message } : { error: e.message };
      return jsonResponse(payload, status);
    }
  },
};
