import { createServer } from 'node:http';
import { isIP, createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { lstat, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runCode, runnerHealthy } from './run.mjs';
import { createRunQueue, createRateLimiter, normalizeIp } from './limits.mjs';

export const MAX_BODY_BYTES = 96 * 1024;
const MAX_CODE_BYTES = 64 * 1024;
const MAX_STDIN_BYTES = 16 * 1024;
const rejected = messageKo => ({ error: 'rejected', messageKo });

export function rateLimitPerMinute(value = process.env.RATE_LIMIT_PER_MIN) {
  if (value === undefined || value === '') return 10;
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('RATE_LIMIT_PER_MIN must be a positive integer');
  return Number(value);
}

export function clientIp(request, trustProxy = false) {
  const forwarded = request.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') {
    const last = forwarded.split(',').pop().trim();
    if (isIP(last)) return normalizeIp(last);
  }
  return normalizeIp(request.socket.remoteAddress || 'unknown');
}

export function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '요청 본문은 JSON 객체여야 해요.';
  if (!['c', 'java', 'python'].includes(body.lang)) return '지원하지 않는 언어예요.';
  if (typeof body.code !== 'string' || Buffer.byteLength(body.code, 'utf8') > MAX_CODE_BYTES) return '코드는 64 KB 이하의 문자열이어야 해요.';
  if (body.stdin !== undefined && (typeof body.stdin !== 'string' || Buffer.byteLength(body.stdin, 'utf8') > MAX_STDIN_BYTES)) return '표준 입력은 16 KB 이하의 문자열이어야 해요.';
  return null;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], settled = false;
    const fail = message => {
      if (settled) return;
      settled = true; chunks = []; clearTimeout(timer);
      reject(new Error(message)); request.resume();
    };
    const timer = setTimeout(() => fail('요청 본문을 받는 시간이 초과했어요.'), 5000);
    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) fail('요청 본문은 96 KB 이하여야 해요.');
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

export function createRunnerServer({
  executor = runCode, healthCheck = runnerHealthy,
  queue = createRunQueue(),
  limiter = createRateLimiter({ limit: rateLimitPerMinute() }),
  trustProxy = process.env.TRUST_PROXY === '1',
  logger = entry => console.log(JSON.stringify(entry)),
  onFatal = () => {},
} = {}) {
  const server = createServer({ maxHeaderSize: 16 * 1024 }, async (request, response) => {
    const started = Date.now(), id = randomUUID();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    function send(status, payload) {
      if (response.destroyed) return;
      if (!request.complete) response.setHeader('Connection', 'close');
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
      logger({ event: 'request', id, status, durationMs: Date.now() - started });
    }
    try {
      const path = request.url?.split('?')[0];
      if (request.method === 'GET' && path === '/study/api/health') return healthCheck() ? send(200, { ok: true }) : send(503, { ok: false });
      if (path !== '/study/api/run') return send(404, rejected('요청한 경로를 찾을 수 없어요.'));
      if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return send(405, rejected('POST 요청만 사용할 수 있어요.')); }
      if (!limiter.take(clientIp(request, trustProxy))) {
        response.setHeader('Retry-After', '60');
        return send(429, { error: 'rate-limited', messageKo: '1분 동안의 실행 요청 한도를 넘었어요. 잠시 기다려 주세요.' });
      }
      const contentType = request.headers['content-type'] || '';
      if (!/^application\/json\s*(?:;\s*charset\s*=\s*utf-8\s*)?$/i.test(contentType) || request.headers['content-encoding']) return send(400, rejected('압축하지 않은 application/json 본문을 보내 주세요.'));
      if (Number(request.headers['content-length']) > MAX_BODY_BYTES) return send(400, rejected('요청 본문은 96 KB 이하여야 해요.'));
      let body;
      try { body = await readJson(request); }
      catch (error) { response.setHeader('Connection', 'close'); return send(400, rejected(error.message)); }
      const problem = validateRequest(body);
      if (problem) return send(400, rejected(problem));
      const pending = queue.submit(() => {
        if (response.destroyed) return null;
        return executor({ lang: body.lang, code: body.code, stdin: body.stdin ?? '' });
      });
      if (!pending) { response.setHeader('Retry-After', '20'); return send(429, { error: 'busy', messageKo: '실행 대기열이 가득 찼어요. 잠시 후 다시 시도해 주세요.' }); }
      const result = await pending;
      if (result !== null) send(200, result);
    } catch {
      // Cleanup failure poisons the runner: answer 503 and let the process exit so the
      // container is recreated (fresh tmpfs). Never keep serving from an unclean sandbox.
      if (!healthCheck()) {
        response.setHeader('Retry-After', '30');
        send(503, { error: 'unavailable', messageKo: '실행기를 다시 시작하는 중이에요. 잠시 후 다시 시도해 주세요.' });
        onFatal();
      } else send(500, rejected('서버에서 요청을 처리하지 못했어요.'));
    }
    finally { if (!request.complete) request.resume(); }
  });
  server.on('close', () => limiter.close?.());
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.timeout = 250_000; // Nine queued jobs, each may compile and run.
  server.maxConnections = 128;
  return server;
}

export async function listenRunner(server, { socketPath = process.env.LISTEN_SOCKET, port = process.env.PORT || 8788, host = process.env.HOST || '127.0.0.1' } = {}) {
  if (socketPath) {
    try {
      const existing = await lstat(socketPath);
      if (!existing.isSocket()) throw new Error('LISTEN_SOCKET path already exists');
      const probe = await new Promise(resolve => {
        const connection = createConnection(socketPath);
        connection.setTimeout(1000);
        connection.once('connect', () => { connection.destroy(); resolve('active'); });
        connection.once('error', error => resolve(error.code));
        connection.once('timeout', () => { connection.destroy(); resolve('timeout'); });
      });
      if (probe !== 'ECONNREFUSED') throw new Error('LISTEN_SOCKET path already exists');
      const current = await lstat(socketPath);
      if (current.dev !== existing.dev || current.ino !== existing.ino || !current.isSocket()) throw new Error('LISTEN_SOCKET path changed during probe');
      await unlink(socketPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const oldMask = process.umask(0o117);
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, () => { server.off('error', reject); resolve(); }); }); }
    finally { process.umask(oldMask); }
  } else {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), host, () => { server.off('error', reject); resolve(); }); });
  }
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let server;
  let exiting = false;
  server = createRunnerServer({
    onFatal() {
      if (exiting) return;
      exiting = true;
      console.error(JSON.stringify({ event: 'fatal', reason: 'job cleanup failed; exiting for container restart' }));
      server.close();
      // Give in-flight 503 responses a moment to flush, then die non-zero: tini exits and
      // Docker's restart policy recreates the container.
      setTimeout(() => process.exit(70), 1500);
    },
  });
  listenRunner(server).catch(error => { console.error(error.message); process.exitCode = 1; });
  const shutdown = () => { server.close(); setTimeout(() => process.exit(0), 25_000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
