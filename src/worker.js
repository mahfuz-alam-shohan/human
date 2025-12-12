import { ensureSchema, nukeDatabase } from './db.js';
import { hashPassword, isoTimestamp, response, errorResponse } from './utils.js';
import { handleGetDashboard, handleGetSuggestions, handleGetGlobalNetwork, handleGetMapData } from './handlers/dashboard.js';
import { handleGetSubjectFull, createSubject, listSubjects, updateSubject, createInteraction, createLocation, createIntel, upsertRelationship, createMediaLink } from './handlers/subjects.js';
import { handleCreateShareLink, handleListShareLinks, handleRevokeShareLink, handleGetSharedSubject } from './handlers/share.js';
import { handleUpload, handleGetMedia } from './handlers/media.js';
import { serveSharedHtml } from './frontend/shared.js';
import { serveHtml } from './frontend/main.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      await ensureSchema(env.DB);

      const shareMatch = path.match(/^\/share\/([a-zA-Z0-9]+)$/);
      if (req.method === 'GET' && shareMatch) return serveSharedHtml(shareMatch[1]);

      if (req.method === 'GET' && path === '/') return serveHtml();

      if (path === '/api/login') {
        const { email, password } = await req.json();
        const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
        if (!admin) {
          const hash = await hashPassword(password);
          const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)').bind(email, hash, isoTimestamp()).run();
          return response({ id: res.meta.last_row_id });
        }
        const hashed = await hashPassword(password);
        if (hashed !== admin.password_hash) return errorResponse('ACCESS DENIED', 401);
        return response({ id: admin.id });
      }

      if (path === '/api/dashboard') return handleGetDashboard(env.DB, url.searchParams.get('adminId'));
      if (path === '/api/suggestions') return handleGetSuggestions(env.DB, url.searchParams.get('adminId'));
      if (path === '/api/global-network') return handleGetGlobalNetwork(env.DB, url.searchParams.get('adminId'));

      if (path === '/api/subjects') {
        if (req.method === 'POST') return createSubject(env.DB, await req.json());
        return listSubjects(env.DB, url.searchParams.get('adminId'));
      }

      if (path === '/api/map-data') return handleGetMapData(env.DB, url.searchParams.get('adminId'));

      const idMatch = path.match(/^\/api\/subjects\/(\d+)$/);
      if (idMatch) {
        const id = idMatch[1];
        if (req.method === 'PATCH') return updateSubject(env.DB, id, await req.json());
        return handleGetSubjectFull(env.DB, id);
      }

      if (path === '/api/interaction') return createInteraction(env.DB, await req.json());
      if (path === '/api/location') return createLocation(env.DB, await req.json());
      if (path === '/api/intel') return createIntel(env.DB, await req.json());
      if (path === '/api/relationship') {
        const payload = await req.json();
        return upsertRelationship(env.DB, payload, req.method === 'PATCH');
      }
      if (path === '/api/media-link') return createMediaLink(env.DB, await req.json());

      if (path === '/api/share-links') {
        if (req.method === 'DELETE') return handleRevokeShareLink(env.DB, url.searchParams.get('token'));
        if (req.method === 'POST') return handleCreateShareLink(req, env.DB, url.origin);
        return handleListShareLinks(env.DB, url.searchParams.get('subjectId'));
      }
      const shareApiMatch = path.match(/^\/api\/share\/([a-zA-Z0-9]+)$/);
      if (shareApiMatch) return handleGetSharedSubject(env.DB, shareApiMatch[1]);

      if (path === '/api/delete') {
        const { table, id } = await req.json();
        const safeTables = ['subjects','subject_interactions','subject_locations','subject_intel','subject_relationships','subject_media'];
        if (safeTables.includes(table)) {
          if (table === 'subjects') await env.DB.prepare('UPDATE subjects SET is_archived = 1 WHERE id = ?').bind(id).run();
          else await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
          return response({ success: true });
        }
      }

      if (path === '/api/upload-avatar' || path === '/api/upload-media') {
        return handleUpload(env.DB, env.BUCKET, path, await req.json());
      }

      if (path.startsWith('/api/media/')) {
        const key = path.replace('/api/media/', '');
        return handleGetMedia(env.BUCKET, key);
      }

      if (path === '/api/nuke') {
        await nukeDatabase(env.DB);
        return response({ success: true });
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      return errorResponse(e.message);
    }
  }
};
