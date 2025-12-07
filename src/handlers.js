import {
  buildShareUrl,
  coerceLatLng,
  errorResponse,
  evaluateShareStatus,
  generateToken,
  hashPassword,
  isoTimestamp,
  safeJson,
  safeVal,
  jsonResponse,
  signJwt
} from './utils.js';

export async function handleLogin(req, db, jwtSecret, corsHeaders) {
  const { email, password } = await safeJson(req);
  if (!jwtSecret) return errorResponse('Service misconfigured', 500, 'Missing JWT secret', corsHeaders);
  if (!email || !password) return errorResponse("Missing credentials", 400, null, corsHeaders);

  let admin = await db.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();

  if (!admin) {
    const hash = await hashPassword(password);
    const createdAt = isoTimestamp();
    const insert = await db.prepare(`
      INSERT INTO admins (email, password_hash, created_at)
      SELECT ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM admins)
    `).bind(email, hash, createdAt).run();
    if (insert.meta?.changes) {
      admin = await db.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
    } else {
        return errorResponse("Admin not found", 404, null, corsHeaders);
    }
  } else {
      const hashed = await hashPassword(password);
      if (hashed !== admin.password_hash) return errorResponse('Access Denied', 401, null, corsHeaders);
  }

  // Generate JWT
  const token = await signJwt({ id: admin.id, email: admin.email }, jwtSecret);
  return jsonResponse({ token, id: admin.id }, 200, corsHeaders);
}

export async function handleShareCreate(req, db, origin, adminId, corsHeaders) {
  try {
    const body = await safeJson(req);

    if (!body.subjectId) return errorResponse('Subject ID required', 400, null, corsHeaders);
    const subjectId = Number(body.subjectId);
    const subject = await db.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ? AND is_archived = 0').bind(subjectId, adminId).first();
    if (!subject) return errorResponse('Subject not found or archived', 404, null, corsHeaders);

    const requestedMinutes = Number.parseInt(body.durationMinutes, 10);
    const minutes = Math.max(1, Math.min(Number.isNaN(requestedMinutes) ? 30 : requestedMinutes, 10080));
    const durationSeconds = minutes * 60;
    const token = generateToken();
    const createdAt = isoTimestamp();

    await db.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, is_active, views, created_at) VALUES (?,?, ?, 1, 0, ?)')
      .bind(subject.id, token, durationSeconds, createdAt).run();

    const shareUrl = buildShareUrl(origin, token);
    const expiresAt = new Date(new Date(createdAt).getTime() + durationSeconds * 1000).toISOString();

    return jsonResponse({ url: shareUrl, token, expires_at: expiresAt, duration_seconds: durationSeconds }, 201, corsHeaders);
  } catch (e) {
    return errorResponse('Failed to create share link', 500, e.message, corsHeaders);
  }
}

export async function handleGetSharedSubject(db, token, corsHeaders) {
  const link = await db.prepare('SELECT * FROM subject_shares WHERE token = ?').bind(token).first();

  if (!link) return errorResponse('INVALID LINK', 404, null, corsHeaders);

  const isActive = Number(link.is_active) === 1;
  const { expired, remainingSeconds, expiresAt: evaluatedExpiry } = evaluateShareStatus(link);

  if (expired || !isActive) {
    if (isActive) await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id).run();
    return errorResponse('LINK EXPIRED', 410, null, corsHeaders);
  }

  let remaining = remainingSeconds ?? link.duration_seconds;
  const now = new Date();
  const startTime = link.started_at ? new Date(link.started_at) : now;
  const computedExpiry = evaluatedExpiry || new Date(startTime.getTime() + link.duration_seconds * 1000);

  if (!link.started_at) {
    await db.prepare('UPDATE subject_shares SET started_at = ?, views = 1 WHERE id = ?')
      .bind(startTime.toISOString(), link.id).run();
  } else {
    const elapsedSeconds = (now.getTime() - startTime.getTime()) / 1000;
    remaining = link.duration_seconds - elapsedSeconds;

    if (remaining <= 0) {
      await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id).run();
      return errorResponse('LINK EXPIRED', 410, null, corsHeaders);
    }

    await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();
  }

  const subject = await db.prepare(`
    SELECT full_name, alias, occupation, nationality, ideology, threat_level,
           avatar_path, status, social_links, age, sex, gender, height, weight,
           identifying_marks, last_sighted, created_at
    FROM subjects WHERE id = ?
  `).bind(link.subject_id).first();

  if (!subject) return errorResponse("Subject data unavailable", 404, null, corsHeaders);

  const [interactions, locations, media] = await Promise.all([
    db.prepare('SELECT date, type, conclusion FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC LIMIT 5').bind(link.subject_id).all(),
    db.prepare('SELECT name, type, address, lat, lng FROM subject_locations WHERE subject_id = ?').bind(link.subject_id).all(),
    db.prepare('SELECT object_key, description, content_type FROM subject_media WHERE subject_id = ?').bind(link.subject_id).all()
  ]);

  return jsonResponse({
    ...subject,
    interactions: interactions.results,
    locations: (locations.results || []).map(coerceLatLng),
    media: media.results,
    meta: {
      remaining_seconds: Math.floor(remaining),
      started_at: link.started_at || startTime.toISOString(),
      expires_at: computedExpiry.toISOString(),
      views: link.views + 1
    }
  }, 200, corsHeaders);
}

export async function handleShareList(db, subjectId, origin, adminId, corsHeaders) {
  try {
    if (!subjectId) return errorResponse('Subject ID required', 400, null, corsHeaders);
    const subject = await db.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ? AND is_archived = 0').bind(subjectId, adminId).first();
    if (!subject) return errorResponse('Subject not found or archived', 404, null, corsHeaders);

    const result = await db.prepare('SELECT * FROM subject_shares WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
    const now = new Date();
    const links = await Promise.all((result.results || []).map(async (link) => {
      const isActive = Number(link.is_active) === 1;
      const status = evaluateShareStatus(link, now);

      if (status.expired && isActive) {
        await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id).run();
      }

      return {
        ...link,
        is_active: !status.expired && isActive,
        expires_at: status.expiresAt ? status.expiresAt.toISOString() : null,
        remaining_seconds: status.remainingSeconds,
        url: buildShareUrl(origin, link.token)
      };
    }));
    return jsonResponse(links, 200, corsHeaders);
  } catch (e) {
    return errorResponse('Failed to fetch share links', 500, e.message, corsHeaders);
  }
}

export async function handleShareRevoke(db, token, adminId, corsHeaders) {
  if (!token) return errorResponse('Share token required', 400, null, corsHeaders);
  try {
    const res = await db.prepare('
      UPDATE subject_shares
      SET is_active = 0
      WHERE token = ? AND subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
    ').bind(token, adminId).run();

    if (!res.meta?.changes) return errorResponse('Share token not found', 404, null, corsHeaders);
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (e) {
    return errorResponse('Failed to revoke link', 500, e.message, corsHeaders);
  }
}

export async function handleCreateLocation(db, payload, adminId, corsHeaders) {
  const errors = [];
  const subjectId = Number(payload.subject_id);
  if (!subjectId || Number.isNaN(subjectId)) errors.push('Valid subject_id is required');
  if (!payload.name || !payload.name.trim()) errors.push('Location name is required');

  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) errors.push('Valid coordinates are required');

  if (errors.length) return errorResponse(errors.join('; '), 400, null, corsHeaders);

  const subject = await db.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ? AND is_archived = 0').bind(subjectId, adminId).first();
  if (!subject) return errorResponse('Subject not found or archived', 404, null, corsHeaders);

  const createdAt = isoTimestamp();
  await db.prepare('INSERT INTO subject_locations (subject_id, name, address, lat, lng, type, notes, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(subjectId, payload.name.trim(), safeVal(payload.address), lat, lng, safeVal(payload.type) || 'pin', safeVal(payload.notes), createdAt)
    .run();

  return jsonResponse({
    success: true,
    location: {
      subject_id: subjectId,
      name: payload.name.trim(),
      address: safeVal(payload.address),
      lat,
      lng,
      type: safeVal(payload.type) || 'pin',
      notes: safeVal(payload.notes),
      created_at: createdAt,
    },
  }, 200, corsHeaders);
}

export async function handleGetDashboard(db, adminId, corsHeaders) {
  const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Contact Added' as desc, created_at as date FROM subjects WHERE admin_id = ?
        UNION ALL
        SELECT 'interaction' as type, subject_id as ref_id, type as title, conclusion as desc, created_at as date FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        UNION ALL
        SELECT 'location' as type, subject_id as ref_id, name as title, type as desc, created_at as date FROM subject_locations WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)
        ORDER BY date DESC LIMIT 20
    `).bind(adminId, adminId, adminId).all();

  const stats = await db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM subjects WHERE admin_id = ? AND is_archived = 0) as targets,
            (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as evidence,
            (SELECT COUNT(*) FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects WHERE admin_id = ?)) as encounters
    `).bind(adminId, adminId, adminId).first();

  return jsonResponse({ feed: recent.results, stats }, 200, corsHeaders);
}

export async function handleGetSubjectFull(db, id, adminId, corsHeaders) {
  const subject = await db.prepare('SELECT * FROM subjects WHERE id = ? AND admin_id = ? AND is_archived = 0').bind(id, adminId).first();
  if (!subject) return errorResponse("Subject not found", 404, null, corsHeaders);

  const [media, intel, relationships, interactions, locations] = await Promise.all([
    db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
    db.prepare('SELECT * FROM subject_intel WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
    db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.id as target_real_id
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(id, id, id).all(),
    db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
    db.prepare('SELECT * FROM subject_locations WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all()
  ]);

  return jsonResponse({
    ...subject,
    media: media.results,
    intel: intel.results,
    relationships: relationships.results,
    interactions: interactions.results,
    locations: (locations.results || []).map(coerceLatLng)
  }, 200, corsHeaders);
}

export async function handleGetMapData(db, adminId, corsHeaders) {
  const query = `
        SELECT l.id, l.name, l.lat, l.lng, l.type, s.id as subject_id, s.full_name, s.alias, s.avatar_path, s.threat_level
        FROM subject_locations l
        JOIN subjects s ON l.subject_id = s.id
        WHERE s.admin_id = ? AND s.is_archived = 0 AND l.lat IS NOT NULL
    `;
  const res = await db.prepare(query).bind(adminId).all();
  return jsonResponse((res.results || []).map(coerceLatLng), 200, corsHeaders);
}

export async function handleGetSubjectSuggestions(db, adminId, corsHeaders) {
  if (!adminId) return errorResponse('Admin ID required', 400, null, corsHeaders);

  const fetchDistinct = async (column) => {
    const res = await db.prepare(`
      SELECT DISTINCT ${column} as value
      FROM subjects
      WHERE admin_id = ? AND ${column} IS NOT NULL AND TRIM(${column}) != ''
      ORDER BY ${column} COLLATE NOCASE
    `).bind(adminId).all();
    return (res.results || []).map((r) => r.value);
  };

  const [nationality, ideology, religion] = await Promise.all([
    fetchDistinct('nationality'),
    fetchDistinct('ideology'),
    fetchDistinct('religion')
  ]);

  return jsonResponse({ nationality, ideology, religion }, 200, corsHeaders);
}
