const encoder = new TextEncoder();

const toBase64Url = (str) => btoa(String.fromCharCode.apply(null, new Uint8Array(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function createToken(payload, secret) {
    const header = { alg: "HS256", typ: "JWT" };
    const encHeader = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
    const encPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const data = new TextEncoder().encode(`${encHeader}.${encPayload}`);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, data);
    return `${encHeader}.${encPayload}.${toBase64Url(signature)}`;
}

export async function verifyToken(token, secret) {
    try {
        const [h, p, s] = token.split('.');
        if (!h || !p || !s) return null;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        const data = new TextEncoder().encode(`${h}.${p}`);
        const sig = fromBase64Url(s);
        const isValid = await crypto.subtle.verify("HMAC", key, sig, data);
        if (!isValid) return null;
        return JSON.parse(new TextDecoder().decode(fromBase64Url(p)));
    } catch (e) { return null; }
}

export async function hashPassword(secret) {
  const data = encoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
