import { response } from '../utils.js';

export async function handleGetDashboard(db) {
    const recent = await db.prepare(`
        SELECT 'subject' as type, id as ref_id, full_name as title, 'Profile Updated' as desc, COALESCE(updated_at, created_at) as date FROM subjects
        UNION ALL
        SELECT 'interaction' as type, subject_id as ref_id, type as title, conclusion as desc, created_at as date FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects)
        UNION ALL
        SELECT 'location' as type, subject_id as ref_id, name as title, type as desc, created_at as date FROM subject_locations WHERE subject_id IN (SELECT id FROM subjects)
        ORDER BY date DESC LIMIT 50
    `).all();

    const stats = await db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM subjects WHERE is_archived = 0) as targets,
            (SELECT COUNT(*) FROM subject_media WHERE subject_id IN (SELECT id FROM subjects)) as evidence,
            (SELECT COUNT(*) FROM subject_interactions WHERE subject_id IN (SELECT id FROM subjects)) as encounters
    `).first();

    return response({ feed: recent.results, stats });
}

export async function handleGetSuggestions(db) {
    const occupations = await db.prepare("SELECT DISTINCT occupation FROM subjects WHERE is_archived = 0").all();
    const nationalities = await db.prepare("SELECT DISTINCT nationality FROM subjects WHERE is_archived = 0").all();
    const ideologies = await db.prepare("SELECT DISTINCT ideology FROM subjects WHERE is_archived = 0").all();
    
    return response({
        occupations: occupations.results.map(r => r.occupation).filter(Boolean),
        nationalities: nationalities.results.map(r => r.nationality).filter(Boolean),
        ideologies: ideologies.results.map(r => r.ideology).filter(Boolean)
    });
}

export async function handleGetGlobalNetwork(db) {
    const subjects = await db.prepare('SELECT id, full_name, occupation, avatar_path, threat_level, network_x, network_y FROM subjects WHERE is_archived = 0').all();
    
    if (subjects.results.length === 0) return response({ nodes: [], edges: [] });

    const subjectIds = subjects.results.map(s => s.id).join(',');
    
    const relationships = await db.prepare(`
        SELECT subject_a_id, subject_b_id, relationship_type, role_b
        FROM subject_relationships 
        WHERE subject_a_id IN (${subjectIds}) AND subject_b_id IN (${subjectIds})
    `).all();

    return response({
        nodes: subjects.results.map(s => ({
            id: s.id,
            label: s.full_name,
            group: s.threat_level,
            image: s.avatar_path,
            shape: 'circularImage',
            occupation: s.occupation,
            x: s.network_x,
            y: s.network_y
        })),
        edges: relationships.results.map(r => ({
            from: r.subject_a_id,
            to: r.subject_b_id,
            label: `${r.relationship_type} / ${r.role_b || '?'}`,
            arrows: 'to',
            font: { align: 'middle' }
        }))
    });
}

export async function handleGetMapData(db) {
    const query = `
        SELECT l.id, l.name, l.lat, l.lng, l.type, l.address, s.id as subject_id, s.full_name, s.alias, s.avatar_path, s.threat_level, s.occupation
        FROM subject_locations l
        JOIN subjects s ON l.subject_id = s.id
        WHERE s.is_archived = 0 AND l.lat IS NOT NULL
        ORDER BY l.created_at ASC
    `;
    const res = await db.prepare(query).all();
    return response(res.results);
}
