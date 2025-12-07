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

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

export function errorResponse(msg, status = 500, details = null) {
  console.error(`API Error: ${msg}`, details);
  return jsonResponse({ error: msg, details }, status);
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
  if (!env || !env.DB || !env.BUCKET) {
    throw new Error('Required bindings are missing (DB or BUCKET)');
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
