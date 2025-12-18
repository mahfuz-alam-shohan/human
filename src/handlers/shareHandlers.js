import { errorResponse, generateToken, isoTimestamp, response } from '../utils.js';

export async function handleCreateShareLink(req, db, origin, adminId) {
    const { subjectId, durationMinutes, requireLocation, allowedTabs } = await req.json();
    if (!subjectId) return errorResponse('subjectId required', 400);
    
    // Verify Ownership
    const owner = await db.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(subjectId, adminId).first();
    if (!owner) return errorResponse("Unauthorized", 403);

    const minutes = durationMinutes || 60;
    const durationSeconds = Math.max(60, Math.floor(minutes * 60)); 
    const isRequired = requireLocation ? 1 : 0;
    const allowedTabsStr = allowedTabs ? JSON.stringify(allowedTabs) : null;

    const token = generateToken();
    await db.prepare('INSERT INTO subject_shares (subject_id, token, duration_seconds, require_location, allowed_tabs, created_at, is_active, views) VALUES (?, ?, ?, ?, ?, ?, 1, 0)')
        .bind(subjectId, token, durationSeconds, isRequired, allowedTabsStr, isoTimestamp()).run();
    
    const url = `${origin}/share/${token}`;
    return response({ url, token, duration_seconds: durationSeconds, require_location: isRequired, allowed_tabs: allowedTabs });
}

export async function handleListShareLinks(db, subjectId, adminId) {
    const owner = await db.prepare('SELECT id FROM subjects WHERE id = ? AND admin_id = ?').bind(subjectId, adminId).first();
    if (!owner) return response([]);
    const res = await db.prepare('SELECT * FROM subject_shares WHERE subject_id = ? ORDER BY created_at DESC').bind(subjectId).all();
    
    // EXPIRE OLD LINKS ON LIST
    const links = res.results;
    const now = Date.now();
    const updates = [];

    for (const link of links) {
        if (link.is_active === 1 && link.started_at && link.duration_seconds) {
            const start = new Date(link.started_at).getTime();
            const elapsed = (now - start) / 1000;
            if (elapsed > link.duration_seconds) {
                link.is_active = 0; // Local update
                updates.push(db.prepare('UPDATE subject_shares SET is_active = 0 WHERE id = ?').bind(link.id));
            }
        }
    }
    
    if (updates.length > 0) await db.batch(updates);

    return response(links);
}

export async function handleRevokeShareLink(db, token) {
    await db.prepare('UPDATE subject_shares SET is_active = 0 WHERE token = ?').bind(token).run();
    return response({ success: true });
}

export async function handleGetSharedSubject(db, token, req) {
    const link = await db.prepare('SELECT * FROM subject_shares WHERE token = ?').bind(token).first();
    if (!link) return errorResponse('LINK INVALID', 404);
    if (!link.is_active) return errorResponse('LINK REVOKED', 410);

    // --- CHECK EXPIRATION ---
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
    }

    // --- LOCATION LOCK ---
    if (link.require_location === 1) {
        const url = new URL(req.url);
        const lat = url.searchParams.get('lat');
        const lng = url.searchParams.get('lng');

        // IF LOCATION IS REQUIRED BUT NOT PROVIDED -> LOCK
        if (!lat || !lng) {
            // RETURN PARTIAL INFO FOR "BAIT"
            const partial = await db.prepare('SELECT full_name, avatar_path FROM subjects WHERE id = ?').bind(link.subject_id).first();
            return response({ 
                error: 'LOCATION_REQUIRED', 
                partial: partial 
            }, 428); // 428 Precondition Required
        }

        // IF PROVIDED, LOG IT AND PROCEED
        await db.prepare('INSERT INTO subject_locations (subject_id, name, type, lat, lng, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(link.subject_id, 'Anonymous Viewer', 'Viewer Sighting', parseFloat(lat), parseFloat(lng), `Accessed via Secure Link: ${token.slice(0,8)}...`, isoTimestamp()).run();
    }
        
    await db.prepare('UPDATE subject_shares SET views = views + 1 WHERE id = ?').bind(link.id).run();

    // FETCH ALL INFOS
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(link.subject_id).first();
    if (!subject) return errorResponse('Subject not found', 404);

    const interactions = await db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(link.subject_id).all();
    const locations = await db.prepare('SELECT * FROM subject_locations WHERE subject_id = ?').bind(link.subject_id).all();
    const media = await db.prepare('SELECT * FROM subject_media WHERE subject_id = ?').bind(link.subject_id).all();
    const intel = await db.prepare('SELECT * FROM subject_intel WHERE subject_id = ?').bind(link.subject_id).all();
    const skills = await db.prepare('SELECT * FROM subject_skills WHERE subject_id = ?').bind(link.subject_id).all();
    const relationships = await db.prepare(`
        SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.occupation as target_role
        FROM subject_relationships r
        LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
        WHERE r.subject_a_id = ? OR r.subject_b_id = ?
    `).bind(link.subject_id, link.subject_id, link.subject_id).all();

    // --- APPLY TAB FILTERING (SECURITY) ---
    const allowedTabs = link.allowed_tabs ? JSON.parse(link.allowed_tabs) : ['Profile', 'Intel', 'Capabilities', 'History', 'Network', 'Files', 'Map'];
    const isProfileAllowed = allowedTabs.includes('Profile');

    return response({
        // Header info (Always returned)
        id: subject.id,
        full_name: subject.full_name,
        alias: subject.alias,
        occupation: subject.occupation,
        nationality: subject.nationality,
        threat_level: subject.threat_level,
        avatar_path: subject.avatar_path,
        
        // Profile Tab Data (Filtered)
        dob: isProfileAllowed ? subject.dob : null,
        age: isProfileAllowed ? subject.age : null,
        height: isProfileAllowed ? subject.height : null,
        weight: isProfileAllowed ? subject.weight : null,
        blood_type: isProfileAllowed ? subject.blood_type : null,
        modus_operandi: isProfileAllowed ? subject.modus_operandi : null,
        
        // Other Lists (Filtered)
        interactions: allowedTabs.includes('History') ? interactions.results : [],
        locations: allowedTabs.includes('Map') ? locations.results : [],
        media: allowedTabs.includes('Files') ? media.results : [],
        intel: allowedTabs.includes('Intel') ? intel.results : [],
        skills: allowedTabs.includes('Capabilities') ? skills.results : [],
        relationships: allowedTabs.includes('Network') ? relationships.results : [],
        
        meta: { 
            remaining_seconds: link.duration_seconds ? Math.floor(link.duration_seconds - ((Date.now() - new Date(link.started_at).getTime()) / 1000)) : null,
            allowed_tabs: allowedTabs
        }
    });
}
