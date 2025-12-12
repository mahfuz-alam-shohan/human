import { handleGetSubjectFull } from './subjects.js';
import { generateToken, isoTimestamp, response, errorResponse } from '../utils.js';

export async function handleCreateShareLink(req, db, origin) {
  const { subjectId, durationMinutes } = await req.json();
  if (!subjectId) return errorResponse('subjectId required', 400);

  const minutes = durationMinutes || 60;
  const durationSeconds = Math.max(60, Math.floor(minutes * 60));

  const token = generateToken();
  await db.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, created_at, is_active, views) VALUES (?, ?, ?, ?, 1, 0)')
    .bind(subjectId, token, durationSeconds, isoTimestamp()).run();

  const url = `${origin}/share/${token}`;
  return response({ url, token, duration_seconds: durationSeconds });
}

export async function handleListShareLinks(db, subjectId) {
  const res = await db.prepare('SELECT * FROM subject_shares WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
  return response(res.results);
}

export async function handleRevokeShareLink(db, token) {
  await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE token = ?').bind(token).run();
  return response({ success: true });
}

export async function handleGetSharedSubject(db, token) {
  const link = await db.prepare('SELECT * FROM subject_shares WHERE token = ?').bind(token).first();
  if (!link) return errorResponse('LINK INVALID', 404);
  if (!link.is_active) return errorResponse('LINK REVOKED', 410);

  if (link.duration_seconds) {
    const now = Date.now();
    const startedAt = link.started_at || isoTimestamp();

    if (!link.started_at) {
      await db.prepare('UPDATE subject_shares SET started_at = ? WHERE id = ?').bind(startedAt, link.id).run();
    }

    const elapsed = (now - new Date(startedAt).getTime()) / 1000;
    const remaining = link.duration_seconds - elapsed;

    if (remaining <= 0) {
      await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id).run();
      return errorResponse('LINK EXPIRED', 410);
    }

    await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();

    const fullSubject = await handleGetSubjectFull(db, link.subject_id);
    const data = await fullSubject.json();

    return response({ ...data, meta: { remaining_seconds: Math.floor(remaining) } });
  }
  return errorResponse('INVALID CONFIG', 500);
}
