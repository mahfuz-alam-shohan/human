import { isoTimestamp } from './utils.js';
import { FAMILY_KEYWORDS } from './constants.js';

export function analyzeProfile(subject, interactions, intel) {
    const dataPoints = intel.length + interactions.length + (subject.modus_operandi ? 1 : 0);
    const completeness = Math.min(100, Math.floor((dataPoints / 20) * 100));
    
    const tags = [];
    const textBank = [
        subject.modus_operandi || '', 
        subject.occupation || '',
        ...interactions.map(i => i.type),
        ...intel.map(i => i.category)
    ].join(' ').toLowerCase();

    if (textBank.includes('business') || textBank.includes('meeting') || textBank.includes('work')) tags.push('Professional');
    if (textBank.includes('family') || textBank.includes('home')) tags.push('Family');
    if (textBank.includes('finance') || textBank.includes('money')) tags.push('Financial');
    if (textBank.includes('medical') || textBank.includes('health')) tags.push('Medical');
    
    return {
        score: completeness,
        tags: tags,
        summary: `Profile is ${completeness}% complete. Contains ${interactions.length} interactions and ${intel.length} attribute points.`,
        generated_at: isoTimestamp()
    };
}

export function generateFamilyReport(relationships, subjectId) {
    const family = [];
    relationships.forEach(r => {
        let relativeRole = '';
        if (r.subject_a_id == subjectId) relativeRole = r.role_b || 'Associate'; 
        else relativeRole = r.relationship_type || 'Associate';

        const isFamily = FAMILY_KEYWORDS.some(k => relativeRole.toLowerCase().includes(k));
        
        if (isFamily) {
            family.push({
                name: r.target_name,
                role: relativeRole,
                id: r.subject_a_id == subjectId ? r.subject_b_id : r.subject_a_id,
                avatar: r.target_avatar
            });
        }
    });
    return family;
}
