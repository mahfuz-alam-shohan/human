import { CORS_HEADERS, SUBJECT_COLUMNS, encoder } from './constants.js';

export function isoTimestamp() {
  return new Date().toISOString();
}

export function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age >= 0 ? age : null;
}

export function generateToken() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildShareUrl(origin, token) {
  try {
    const base = origin || '';
    const url = new URL(`/share/${token}`, base);
    return url.toString();
  } catch (e) {
    return `/share/${token}`;
  }
}

export async function hashPassword(secret) {
  const data = encoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sanitizeFileName(name) {
  return (name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'upload';
}

export function buildCorsHeaders(origin, allowedOrigins) {
  const headers = { ...CORS_HEADERS };
  const allowlist = (allowedOrigins || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  if (allowlist.includes('*')) {
    headers['Access-Control-Allow-Origin'] = origin || '*';
    return headers;
  }

  if (!allowlist.length && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    return headers;
  }

  if (origin && allowlist.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function safeVal(v) {
  return v === undefined || v === '' ? null : v;
}

export function sanitizeSubjectPayload(data = {}) {
  const payload = {};
  SUBJECT_COLUMNS.forEach((key) => {
    if (data[key] !== undefined) payload[key] = safeVal(data[key]);
  });
  return payload;
}

export function coerceLatLng(record) {
  if (!record) return record;
  const toNum = (val) => (val === null || val === undefined ? null : Number(val));
  return {
    ...record,
    lat: toNum(record.lat),
    lng: toNum(record.lng),
  };
}

export function jsonResponse(data, status = 200, headers = CORS_HEADERS) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function errorResponse(msg, status = 500, details = null, headers = CORS_HEADERS) {
  console.error(`API Error: ${msg}`, details);
  return jsonResponse({ error: msg, details }, status, headers);
}

export async function safeJson(req) {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch (e) {
    throw new BadRequestError('Invalid JSON body');
  }
}

export function ensureEnv(env) {
  if (!env || !env.DB || !env.BUCKET || !env.JWT_SECRET) {
    throw new Error('Required bindings are missing (DB, BUCKET, or JWT_SECRET)');
  }
}

export function evaluateShareStatus(link, now = new Date()) {
  const durationSeconds = Number(link.duration_seconds) || 0;
  if (!durationSeconds) return { expired: false, remainingSeconds: null, expiresAt: null };

  if (!link.started_at) {
    return { expired: false, remainingSeconds: durationSeconds, expiresAt: null };
  }

  const expiresAt = new Date(new Date(link.started_at).getTime() + durationSeconds * 1000);
  const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  return { expired: remainingSeconds <= 0, remainingSeconds, expiresAt };
}

export function detectMimeType(buffer, declaredType = '') {
  const bytes = new Uint8Array(buffer);
  const startsWith = (signature, offset = 0) => signature.every((b, i) => bytes[offset + i] === b);

  if (bytes.length >= 4 && startsWith([0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (bytes.length >= 3 && startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytes.length >= 8 && startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 6 && (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))) return 'image/gif';
  if (bytes.length >= 12 && startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';

  if (declaredType && /^image\//.test(declaredType)) return declaredType;
  return declaredType || 'application/octet-stream';
}

export function isInlineSafeMime(mime) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'].includes(mime);
}

// --- JWT HELPERS ---
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

export async function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(payload));
  const data = encoder.encode(`${encodedHeader}.${encodedBody}`);
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
  return `${encodedHeader}.${encodedBody}.${encodedSignature}`;
}

export async function verifyJwt(token, secret) {
  try {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) return null;
    const data = encoder.encode(`${h}.${b}`);
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const signature = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    return valid ? JSON.parse(base64UrlDecode(b)) : null;
  } catch (e) {
    return null;
  }
}

export class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequestError';
    this.status = 400;
  }
}
