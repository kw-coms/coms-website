import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { validateSketch } from './validation.mjs';
import { compileSketch, failure } from './compile.mjs';
import { createRateLimiter, createCompileQueue } from './limits.mjs';

export const MAX_BODY_BYTES = 80 * 1024;
export const AUTH_MESSAGE = '로그인한 동아리원만 컴파일할 수 있어요.';
export function rateLimitPerMinute(value = process.env.RATE_LIMIT_PER_MIN) {
  if (value === undefined || value === '') return 10;
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('RATE_LIMIT_PER_MIN must be a positive integer');
  return Number(value);
}
export function clientIp(request, trustProxy = false) {
  const forwarded = request.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim();
    if (isIP(first)) return first;
  }
  return request.socket.remoteAddress || 'unknown';
}
export async function checkAuth(cookie, url, { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  if (!url) return true;
  try {
    const response = await fetchImpl(url, {
      method: 'GET', headers: { Cookie: cookie || '' },
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    return response.status === 200;
  } catch { return false; }
}
function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], settled = false;
    const fail = message => {
      if (settled) return;
      settled = true; chunks = []; clearTimeout(timer); reject(new Error(message));
      request.resume();
    };
    const timer = setTimeout(() => fail('요청 본문을 받는 시간이 초과했어요.'), 5000);
    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) fail('요청 본문은 80 KB 이하여야 해요.');
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('올바른 JSON 본문을 보내 주세요.')); }
    });
    request.on('error', () => fail('요청 본문을 읽지 못했어요.'));
    request.on('aborted', () => fail('요청이 중단되었어요.'));
  });
}
export function createCompileServer({
  runner, tempRoot, queue = createCompileQueue(), limiter = createRateLimiter({ limit: rateLimitPerMinute() }),
  trustProxy = process.env.TRUST_PROXY === '1', authCheckUrl = process.env.AUTH_CHECK_URL || '',
  fetchImpl = fetch, logger = entry => console.log(JSON.stringify(entry)),
} = {}) {
  if (authCheckUrl && !/^https?:$/.test(new URL(authCheckUrl).protocol)) throw new Error('AUTH_CHECK_URL must use HTTP(S)');
  const server = createServer({ maxHeaderSize: 16 * 1024 }, async (request, response) => {
    const started = Date.now(), id = randomUUID();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    let logged = false;
    function send(status, payload) {
      if (response.destroyed) return;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
      if (!logged) {
        logged = true;
        logger({ event: 'request', id, status, durationMs: Date.now() - started, ...(payload.reason ? { reason: payload.reason } : {}) });
      }
    }
    try {
      const path = request.url?.split('?')[0];
      if (request.method === 'GET' && path === '/lab/api/health') return send(200, { ok: true });
      if (path !== '/lab/api/compile') return send(404, failure('rejected', '요청한 경로를 찾을 수 없어요.'));
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return send(405, failure('rejected', 'POST 요청만 사용할 수 있어요.'));
      }
      if (!limiter.take(clientIp(request, trustProxy))) {
        response.setHeader('Retry-After', '60');
        return send(429, failure('rate-limited', '1분 동안의 컴파일 요청 한도를 넘었어요. 잠시 기다려 주세요.'));
      }
      const contentType = request.headers['content-type'] || '';
      if (!/^application\/json\s*(?:;\s*charset\s*=\s*utf-8\s*)?$/i.test(contentType) || request.headers['content-encoding']) {
        return send(400, failure('rejected', '압축하지 않은 application/json 본문을 보내 주세요.'));
      }
      if (Number(request.headers['content-length']) > MAX_BODY_BYTES) return send(400, failure('rejected', '요청 본문은 80 KB 이하여야 해요.'));
      let body;
      try { body = await readJson(request); }
      catch (error) { response.setHeader('Connection', 'close'); return send(400, failure('rejected', error.message)); }
      const rejection = validateSketch(body?.sketch);
      if (rejection) return send(400, failure('rejected', rejection));
      if (!await checkAuth(request.headers.cookie, authCheckUrl, { fetchImpl })) return send(401, failure('rejected', AUTH_MESSAGE));
      const pending = queue.submit(() => {
        if (response.destroyed) return failure('rejected', '요청이 중단되었어요.');
        return compileSketch(body.sketch, { runner, tempRoot });
      });
      if (!pending) { response.setHeader('Retry-After', '20'); return send(429, failure('busy', '컴파일 대기열이 가득 찼어요. 잠시 후 다시 시도해 주세요.')); }
      const result = await pending;
      return send(result.ok || result.reason === 'compile' ? 200 : 504, result);
    } catch {
      send(500, failure('compile', '서버에서 요청을 처리하지 못했어요.'));
    } finally {
      // Discard unread bodies on early rejection without buffering them.
      if (!request.complete) request.resume();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.timeout = 95_000; // Four 20 s compile waves + auth/body overhead.
  server.maxConnections = 128;
  return server;
}
export async function listenCompiler(server, { socketPath = process.env.LISTEN_SOCKET, port = process.env.PORT || 8787 } = {}) {
  if (socketPath) {
    // Fail closed: never replace a socket another process may still be serving.
    try {
      await lstat(socketPath);
      throw new Error('LISTEN_SOCKET path already exists');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const oldMask = process.umask(0o117); // 0777 & ~0117 = 0660
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, () => { server.off('error', reject); resolve(); }); }); }
    finally { process.umask(oldMask); }
  } else {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), '0.0.0.0', () => { server.off('error', reject); resolve(); }); });
  }
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createCompileServer();
  listenCompiler(server).catch(error => { console.error(error.message); process.exitCode = 1; });
  const shutdown = () => { server.close(); setTimeout(() => process.exit(0), 25_000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
