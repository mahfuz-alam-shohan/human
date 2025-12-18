import { DEFAULT_ALLOWED_SECTIONS } from '../constants.js';
import { hashPassword } from '../security.js';
import { normalizeAllowedSections, serializeAllowedSections } from '../permissions.js';
import { errorResponse, isoTimestamp, response } from '../utils.js';

const cloneAllowed = () => JSON.parse(JSON.stringify(DEFAULT_ALLOWED_SECTIONS));

export async function recordAdminLogin(db, adminId, userAgent, ipAddress) {
    try {
        await db.prepare('INSERT INTO admin_logins (admin_id, user_agent, ip_address, logged_in_at) VALUES (?, ?, ?, ?)')
            .bind(adminId, userAgent || 'unknown', ipAddress || 'unknown', isoTimestamp())
            .run();
        await db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').bind(isoTimestamp(), adminId).run();
    } catch (e) {
        console.error('Failed to record admin login', e);
    }
}

export async function handleListAdmins(db) {
    const admins = await db.prepare(`
        SELECT a.*, (
            SELECT MAX(logged_in_at) FROM admin_logins l WHERE l.admin_id = a.id
        ) as latest_login
        FROM admins a
        ORDER BY a.created_at ASC
    `).all();

    return response(admins.results.map(sanitizeAdmin));
}

export async function handleListAdminLogins(db) {
    const res = await db.prepare(`
        SELECT l.id, l.admin_id, l.user_agent, l.ip_address, l.logged_in_at, a.email 
        FROM admin_logins l 
        LEFT JOIN admins a ON a.id = l.admin_id
        ORDER BY l.logged_in_at DESC
        LIMIT 200
    `).all();
    return response(res.results);
}

export async function handleCreateAdmin(req, db) {
    const { email, password, allowedSections } = await req.json();
    if (!email || !password) return errorResponse('Email and password required', 400);

    const existing = await db.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
    if (existing) return errorResponse('Admin already exists', 409);

    const hash = await hashPassword(password);
    const serialized = serializeAllowedSections(allowedSections || cloneAllowed());
    const now = isoTimestamp();

    const res = await db.prepare('INSERT INTO admins (email, password_hash, allowed_sections, created_at) VALUES (?, ?, ?, ?)')
        .bind(email, hash, serialized, now)
        .run();

    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').bind(res.meta.last_row_id).first();
    return response(sanitizeAdmin(admin), 201);
}

export async function handleUpdateAdmin(req, db, id, currentAdminId) {
    const payload = await req.json();
    const target = await db.prepare('SELECT * FROM admins WHERE id = ?').bind(id).first();
    if (!target) return errorResponse('Admin not found', 404);

    const updates = [];
    const bindings = [];

    if (payload.allowedSections) {
        updates.push('allowed_sections = ?');
        bindings.push(serializeAllowedSections(payload.allowedSections));
    }

    if (payload.hasOwnProperty('is_disabled')) {
        if (target.id === currentAdminId && payload.is_disabled) {
            return errorResponse('Cannot disable yourself', 400);
        }
        updates.push('is_disabled = ?');
        bindings.push(payload.is_disabled ? 1 : 0);
    }

    if (payload.password) {
        updates.push('password_hash = ?');
        bindings.push(await hashPassword(payload.password));
    }

    if (payload.forceLogout) {
        updates.push('token_version = token_version + 1');
    }

    if (payload.is_master !== undefined) {
        updates.push('is_master = ?');
        bindings.push(payload.is_master ? 1 : 0);
    }

    if (updates.length === 0) return response({ success: true });

    await db.prepare(`UPDATE admins SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings, id).run();
    const updated = await db.prepare('SELECT * FROM admins WHERE id = ?').bind(id).first();
    return response(sanitizeAdmin(updated));
}

export function sanitizeAdmin(row) {
    if (!row) return null;
    const allowed = normalizeAllowedSections(row.allowed_sections);
    return {
        id: row.id,
        email: row.email,
        is_master: row.is_master === 1 || row.is_master === true,
        is_disabled: row.is_disabled === 1 || row.is_disabled === true,
        allowed_sections: allowed,
        token_version: row.token_version || 0,
        created_at: row.created_at,
        last_login_at: row.last_login_at || row.latest_login || null
    };
}
