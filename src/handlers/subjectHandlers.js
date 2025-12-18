import { SUBJECT_DETAIL_TABS } from '../constants.js';
import { errorResponse, response } from '../utils.js';
import { generateFamilyReport } from '../analysis.js';

export async function handleGetSubjectFull(db, id, adminCtx) {
    const subject = await db.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first();
    if (!subject) return errorResponse("Subject not found", 404);

    const allowedTabs = adminCtx?.is_master ? SUBJECT_DETAIL_TABS : (adminCtx?.allowed_sections?.subjectTabs || SUBJECT_DETAIL_TABS);
    const canSee = (tab) => adminCtx?.is_master || allowedTabs.includes(tab);

    const [media, intel, relationships, interactions, locations, skills] = await Promise.all([
        db.prepare('SELECT * FROM subject_media WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_intel WHERE subject_id = ? ORDER BY created_at ASC').bind(id).all(),
        db.prepare(`
            SELECT r.*, COALESCE(s.full_name, r.custom_name) as target_name, COALESCE(s.avatar_path, r.custom_avatar) as target_avatar, s.occupation as target_role, s.threat_level as target_threat
            FROM subject_relationships r
            LEFT JOIN subjects s ON s.id = (CASE WHEN r.subject_a_id = ? THEN r.subject_b_id ELSE r.subject_a_id END)
            WHERE r.subject_a_id = ? OR r.subject_b_id = ?
        `).bind(id, id, id).all(),
        db.prepare('SELECT * FROM subject_interactions WHERE subject_id = ? ORDER BY date DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_locations WHERE subject_id = ? ORDER BY created_at DESC').bind(id).all(),
        db.prepare('SELECT * FROM subject_skills WHERE subject_id = ?').bind(id).all()
    ]);

    const familyReport = canSee('network') ? generateFamilyReport(relationships.results, id) : [];

    return response({
        ...subject,
        media: canSee('files') ? media.results : [],
        intel: canSee('attributes') ? intel.results : [],
        relationships: canSee('network') ? relationships.results : [],
        interactions: canSee('timeline') ? interactions.results : [],
        locations: canSee('map') ? locations.results : [],
        skills: canSee('capabilities') ? skills.results : [],
        familyReport: familyReport
    });
}
