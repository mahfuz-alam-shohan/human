import { sanitizeFileName, isoTimestamp, response } from '../utils.js';

export async function handleUpload(db, bucket, path, payload) {
  const { subjectId, data, filename, contentType } = payload;
  const key = `sub-${subjectId}-${Date.now()}-${sanitizeFileName(filename)}`;
  const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  await bucket.put(key, binary, { httpMetadata: { contentType } });

  if (path.includes('avatar')) await db.prepare('UPDATE subjects SET avatar_path = ? WHERE id = ?').bind(key, subjectId).run();
  else await db.prepare('INSERT INTO subject_media (subject_id, object_key, content_type, description, created_at) VALUES (?,?,?,?,?)').bind(subjectId, key, contentType, 'Attached File', isoTimestamp()).run();
  return response({ success: true });
}

export async function handleGetMedia(bucket, key) {
  const obj = await bucket.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' }});
}
