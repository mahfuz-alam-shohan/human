export function isoTimestamp() {
    // Forces UTC+6 (Bangladesh Standard Time)
    const now = new Date();
    const utcTime = now.getTime();
    const offsetHours = 6;
    const bstTime = new Date(utcTime + (offsetHours * 60 * 60 * 1000));
    // Replace the 'Z' (UTC) with '+06:00' to explicitly indicate the offset
    return bstTime.toISOString().replace('Z', '+06:00');
}

export function sanitizeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
}

export function generateToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2,'0')).join('');
}

export function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
}

export function errorResponse(msg, status = 500) {
    return response({ error: msg, code: msg }, status);
}

export function safeVal(v) {
    return v === undefined || v === '' ? null : v;
}
