import { defineEventHandler, getHeader, readBody, createError } from 'h3';
import dns from 'node:dns';
import net from 'node:net';

/**
 * Permissioned network relay for the code sandbox (net.fetch).
 *
 * The sandbox itself has no network access; generated requests arrive here
 * only after per-domain user consent. This route is the last line of
 * defense: strict SSRF rules, https-only, method whitelist, hard size/time
 * caps, text-shaped responses only.
 */

const ALLOWED_METHODS = new Set(['GET', 'POST']);
const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB
const TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 64 * 1024;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
  return false;
}

async function assertPublicHost(hostname) {
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw createError({ statusCode: 400, statusMessage: 'Blocked host' });
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw createError({ statusCode: 400, statusMessage: 'Blocked host' });
    return;
  }
  try {
    const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw createError({ statusCode: 400, statusMessage: 'Blocked host' });
      }
    }
  } catch (err) {
    if (err?.statusCode === 400) throw err;
    throw createError({ statusCode: 400, statusMessage: 'Could not resolve host' });
  }
}

export default defineEventHandler(async (event) => {
  // Defense in depth: routes in PROTECTED_PATHS already require a session
  // token; re-check here since this endpoint performs outbound fetches.
  if (!getHeader(event, 'x-session-token')) {
    throw createError({ statusCode: 401, statusMessage: 'Session token required' });
  }

  const body = await readBody(event).catch(() => null);
  const url = typeof body?.url === 'string' ? body.url : '';
  const method = String(body?.method || 'GET').toUpperCase();
  let payload = body?.body;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' });
  }
  if (parsed.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'Only https:// URLs are allowed' });
  }
  if (parsed.username || parsed.password) {
    throw createError({ statusCode: 400, statusMessage: 'Credentials in URL are not allowed' });
  }
  if (!ALLOWED_METHODS.has(method)) {
    throw createError({ statusCode: 400, statusMessage: 'Method not allowed' });
  }
  if (payload !== undefined && payload !== null) {
    payload = String(payload);
    if (Buffer.byteLength(payload) > MAX_BODY_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Request body too large' });
    }
  } else {
    payload = undefined;
  }

  await assertPublicHost(parsed.hostname);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(parsed.toString(), {
      method,
      headers: { Accept: 'text/*, application/json, application/*' },
      ...(payload !== undefined ? { body: payload } : {}),
      signal: controller.signal,
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const raw = await upstream.text();
    const totalBytes = Buffer.byteLength(raw);
    const truncated = totalBytes > MAX_RESPONSE_BYTES;
    const text = truncated ? raw.slice(0, Math.floor(MAX_RESPONSE_BYTES / 4)) : raw;

    return {
      status: upstream.status,
      contentType,
      bytes: totalBytes,
      truncated,
      body: text,
      finalUrl: upstream.url || parsed.toString(),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createError({ statusCode: 504, statusMessage: 'Upstream timed out' });
    }
    throw createError({
      statusCode: 502,
      statusMessage: `Upstream request failed: ${error?.message || 'unknown error'}`,
    });
  } finally {
    clearTimeout(timeoutId);
  }
});
