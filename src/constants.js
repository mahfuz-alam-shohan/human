export const APP_TITLE = "PEOPLE OS // INTELLIGENCE";

export const RELATION_PRESETS = [
    { a: 'Father', b: 'Child', family: true }, { a: 'Mother', b: 'Child', family: true },
    { a: 'Parent', b: 'Child', family: true }, { a: 'Son', b: 'Parent', family: true },
    { a: 'Daughter', b: 'Parent', family: true }, { a: 'Brother', b: 'Sibling', family: true },
    { a: 'Sister', b: 'Sibling', family: true }, { a: 'Husband', b: 'Wife', family: true },
    { a: 'Wife', b: 'Husband', family: true }, { a: 'Spouse', b: 'Spouse', family: true },
    { a: 'Uncle', b: 'Niece/Nephew', family: true }, { a: 'Aunt', b: 'Niece/Nephew', family: true },
    { a: 'Grandfather', b: 'Grandchild', family: true }, { a: 'Grandmother', b: 'Grandchild', family: true },
    { a: 'Teacher', b: 'Student', family: false }, { a: 'Employer', b: 'Employee', family: false },
    { a: 'Colleague', b: 'Colleague', family: false }, { a: 'Associate', b: 'Associate', family: false },
    { a: 'Friend', b: 'Friend', family: false },
];

export const FAMILY_KEYWORDS = ['father', 'mother', 'parent', 'son', 'daughter', 'child', 'brother', 'sister', 'sibling', 'husband', 'wife', 'spouse', 'uncle', 'aunt', 'niece', 'nephew', 'grand'];

export const SUBJECT_COLUMNS = [
    'full_name', 'alias', 'dob', 'age', 'gender', 'occupation', 'nationality', 
    'ideology', 'location', 'contact', 'hometown', 'previous_locations', 
    'modus_operandi', 'notes', 'weakness', 'avatar_path', 'is_archived', 
    'status', 'threat_level', 'last_sighted', 'height', 'weight', 'eye_color', 
    'hair_color', 'blood_type', 'identifying_marks', 'social_links', 
    'digital_identifiers',
    'network_x', 'network_y'
];

export const SUBJECT_DETAIL_TABS = ['overview', 'capabilities', 'attributes', 'timeline', 'map', 'network', 'files'];
export const MAIN_APP_TABS = ['dashboard', 'targets', 'map', 'network', 'admins'];

export const DEFAULT_ALLOWED_SECTIONS = {
    mainTabs: ['dashboard', 'targets', 'map', 'network'],
    subjectTabs: SUBJECT_DETAIL_TABS,
    permissions: {
        createSubjects: true,
        editSubjects: true,
        deleteSubjects: true,
        manageIntel: true,
        manageLocations: true,
        manageRelationships: true,
        manageFiles: true,
        manageShares: true
    }
};
