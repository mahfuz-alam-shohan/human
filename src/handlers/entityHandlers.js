import { errorResponse, isoTimestamp, response, safeVal } from '../utils.js';

async function ensureSubjectExists(db, subjectId) {
    return db.prepare('SELECT id FROM subjects WHERE id = ?').bind(subjectId).first();
}

export async function handleInteraction(req, db) {
    const p = await req.json();
    const subject = await ensureSubjectExists(db, p.subject_id);
    if(!subject) return errorResponse("Subject not found", 404);
    
    await db.prepare('INSERT INTO subject_interactions (subject_id, date, type, transcript, conclusion, evidence_url, created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(p.subject_id, p.date, p.type, safeVal(p.transcript), safeVal(p.conclusion), safeVal(p.evidence_url), isoTimestamp()).run();
    return response({success:true});
}

export async function handleLocation(req, db) {
    const p = await req.json();
    if (req.method === 'PATCH') {
         const loc = await db.prepare('SELECT subject_id FROM subject_locations WHERE id = ?').bind(p.id).first();
         if (!loc) return errorResponse("Location not found", 404);
         
         const subject = await ensureSubjectExists(db, loc.subject_id);
         if(!subject) return errorResponse("Subject not found", 404);

         await db.prepare('UPDATE subject_locations SET name = ?, address = ?, lat = ?, lng = ?, type = ?, notes = ? WHERE id = ?')
            .bind(p.name, safeVal(p.address), safeVal(p.lat), safeVal(p.lng), p.type, safeVal(p.notes), p.id).run();
         return response({success:true});
    } else {
        const subject = await ensureSubjectExists(db, p.subject_id);
        if(!subject) return errorResponse("Subject not found", 404);
        
        await db.prepare('INSERT INTO subject_locations (subject_id, name, address, lat, lng, type, notes, created_at) VALUES (?,?,?,?,?,?,?,?)')
            .bind(p.subject_id, p.name, safeVal(p.address), safeVal(p.lat), safeVal(p.lng), p.type, safeVal(p.notes), isoTimestamp()).run();
        return response({success:true});
    }
}

export async function handleIntel(req, db) {
    const p = await req.json();
    const subject = await ensureSubjectExists(db, p.subject_id);
    if(!subject) return errorResponse("Subject not found", 404);

    await db.prepare('INSERT INTO subject_intel (subject_id, category, label, value, created_at) VALUES (?,?,?,?,?)')
        .bind(p.subject_id, p.category, p.label, p.value, isoTimestamp()).run();
    return response({success:true});
}

export async function handleSkills(req, db) {
    const p = await req.json();
    const subject = await ensureSubjectExists(db, p.subject_id);
    if(!subject) return errorResponse("Subject not found", 404);

    // Upsert logic basically: Delete existing skill by name for this subject then insert new
    await db.prepare('DELETE FROM subject_skills WHERE subject_id = ? AND skill_name = ?').bind(p.subject_id, p.skill_name).run();
    await db.prepare('INSERT INTO subject_skills (subject_id, skill_name, score, created_at) VALUES (?,?,?,?)')
        .bind(p.subject_id, p.skill_name, p.score, isoTimestamp()).run();
    return response({success:true});
}

export async function handleRelationship(req, db) {
    const p = await req.json();
    if (req.method === 'PATCH') {
        const rel = await db.prepare('SELECT subject_a_id, subject_b_id FROM subject_relationships WHERE id = ?').bind(p.id).first();
        if (!rel) return errorResponse("Relationship not found", 404);
        const [subjectA, subjectB] = await Promise.all([
            ensureSubjectExists(db, rel.subject_a_id),
            ensureSubjectExists(db, rel.subject_b_id)
        ]);
        if (!subjectA || !subjectB) return errorResponse("Subject not found", 404);
        await db.prepare('UPDATE subject_relationships SET relationship_type = ?, role_b = ? WHERE id = ?')
            .bind(p.type, p.reciprocal, p.id).run();
    } else {
        const subjectA = await ensureSubjectExists(db, p.subjectA);
        if (!subjectA) return errorResponse("Subject not found", 404);
        if (p.targetId) {
            const subjectB = await ensureSubjectExists(db, p.targetId);
            if (!subjectB) return errorResponse("Subject not found", 404);
        }
        await db.prepare('INSERT INTO subject_relationships (subject_a_id, subject_b_id, relationship_type, role_b, created_at) VALUES (?,?,?,?,?)')
            .bind(p.subjectA, p.targetId, p.type, p.reciprocal, isoTimestamp()).run();
    }
    return response({success:true});
}

export async function handleMediaLink(req, db) {
    const { subjectId, url, type, description } = await req.json();
    const subject = await ensureSubjectExists(db, subjectId);
    if(!subject) return errorResponse("Subject not found", 404);
    
    await db.prepare('INSERT INTO subject_media (subject_id, media_type, external_url, content_type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(subjectId, 'link', url, type || 'link', description || 'External Link', isoTimestamp()).run();
    return response({success:true});
}
