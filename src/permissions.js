import { DEFAULT_ALLOWED_SECTIONS } from './constants.js';

const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_ALLOWED_SECTIONS));

export function normalizeAllowedSections(raw) {
    const base = cloneDefault();
    if (!raw) return base;
    let parsed = raw;
    try {
        if (typeof raw === 'string') parsed = JSON.parse(raw);
    } catch (_) {
        return base;
    }
    return {
        mainTabs: parsed.mainTabs && Array.isArray(parsed.mainTabs) ? parsed.mainTabs : base.mainTabs,
        subjectTabs: parsed.subjectTabs && Array.isArray(parsed.subjectTabs) ? parsed.subjectTabs : base.subjectTabs,
        permissions: { ...base.permissions, ...(parsed.permissions || {}) }
    };
}

export function canAccessTab(admin, tab) {
    if (!admin) return false;
    if (admin.is_master) return true;
    return normalizeAllowedSections(admin.allowed_sections).mainTabs.includes(tab);
}

export function canAccessSubjectTab(admin, tab) {
    if (!admin) return false;
    if (admin.is_master) return true;
    return normalizeAllowedSections(admin.allowed_sections).subjectTabs.includes(tab);
}

export function canPerform(admin, permission) {
    if (!admin) return false;
    if (admin.is_master) return true;
    const allowed = normalizeAllowedSections(admin.allowed_sections).permissions;
    return !!allowed?.[permission];
}

export function serializeAllowedSections(val) {
    if (!val) return JSON.stringify(cloneDefault());
    return JSON.stringify(normalizeAllowedSections(val));
}

export function attachAllowed(adminRow) {
    if (!adminRow) return null;
    const allowed = normalizeAllowedSections(adminRow.allowed_sections);
    return { ...adminRow, allowed_sections: allowed };
}
