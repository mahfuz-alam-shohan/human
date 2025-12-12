import { generateFamilyReport } from '../analysis.js';
import { SUBJECT_COLUMNS } from '../constants.js';
import { errorResponse, isoTimestamp, response, safeVal } from '../utils.js';

export async function handleGetSubjectFull(db, id) {
  const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
  if (!subject) return errorResponse("Subject not found", 404);

  const [media, intel, relationships, interactions, locations] = await Promise.all([
    db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
    db.prepare('SELECT * FROM subject_intel WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
    db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.occupation as target_role, s.threat_level as target_threat
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(id, id, id).all(),
    db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
    db.prepare('SELECT * FROM subject_locations WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all()
  ]);

  const familyReport = generateFamilyReport(relationships.results, id);

  return response({
    ...subject,
    media: media.results,
    intel: intel.results,
    relationships: relationships.results,
    interactions: interactions.results,
    locations: locations.results,
    familyReport: familyReport
  });
}

export async function createSubject(db, payload) {
  const now = isoTimestamp();
  await db.prepare(`INSERT INTO subjects (admin_id, full_name, alias, threat_level, status, occupation, nationality, ideology, modus_operandi, weakness, dob, age, height, weight, blood_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      safeVal(payload.admin_id),
      safeVal(payload.full_name),
      safeVal(payload.alias),
      safeVal(payload.threat_level),
      safeVal(payload.status),
      safeVal(payload.occupation),
      safeVal(payload.nationality),
      safeVal(payload.ideology),
      safeVal(payload.modus_operandi),
      safeVal(payload.weakness),
      safeVal(payload.dob),
      safeVal(payload.age),
      safeVal(payload.height),
      safeVal(payload.weight),
      safeVal(payload.blood_type),
      now,
      now
    )
    .run();
  return response({ success: true });
}

export async function listSubjects(db, adminId) {
  const res = await db.prepare('SELECT * FROM subjects WHERE admin_id = ? AND is_archived = 0 ORDER BY created_at DESC').bind(adminId).all();
  return response(res.results);
}

export async function updateSubject(db, id, payload) {
  const keys = Object.keys(payload).filter(k => SUBJECT_COLUMNS.includes(k));

  if (keys.length > 0) {
    const set = keys.map(k => `${k} = ?`).join(', ') + ", updated_at = ?";
    const vals = keys.map(k => safeVal(payload[k]));
    vals.push(isoTimestamp());
    await db.prepare(`UPDATE subjects SET ${set} WHERE id = ?`).bind(...vals, id).run();
  }

  return response({ success: true });
}

export async function createInteraction(db, payload) {
  await db.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, evidence_url, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(payload.subject_id, payload.date, payload.type, safeVal(payload.transcript), safeVal(payload.conclusion), safeVal(payload.evidence_url), isoTimestamp()).run();
  return response({ success: true });
}

export async function createLocation(db, payload) {
  await db.prepare('INSERT INTO subject_locations (subject_id, name, address, lat, lng, type, notes, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(payload.subject_id, payload.name, safeVal(payload.address), safeVal(payload.lat), safeVal(payload.lng), payload.type, safeVal(payload.notes), isoTimestamp()).run();
  return response({ success: true });
}

export async function createIntel(db, payload) {
  await db.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)')
    .bind(payload.subject_id, payload.category, payload.label, payload.value, isoTimestamp()).run();
  return response({ success: true });
}

export async function upsertRelationship(db, payload, isUpdate = false) {
  if (isUpdate) {
    await db.prepare('UPDATE subject_relationships SET relationship_type = ?, role_b = ? WHERE id = ?')
      .bind(payload.type, payload.reciprocal, payload.id).run();
  } else {
    await db.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, role_b, created_at) VALUES (?,?,?,?,?)')
      .bind(payload.subjectA, payload.targetId, payload.type, payload.reciprocal, isoTimestamp()).run();
  }
  return response({ success: true });
}

export async function createMediaLink(db, payload) {
  await db.prepare('INSERT INTO subject_media (subject_id, media_type, external_url, content_type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(payload.subjectId, 'link', payload.url, payload.type || 'link', payload.description || 'External Link', isoTimestamp()).run();
  return response({ success: true });
}
