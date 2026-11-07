import { isIP } from 'node:net';

export function normalizeIp(value) {
  if (typeof value !== 'string') return 'unknown';
  const address = value.toLowerCase().split('%')[0];
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return 'unknown';
  // Expand embedded IPv4 before IPv6 compression; both mapped spellings share one key.
  let expanded = address;
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (dotted) {
    const octets = dotted[2].split('.').map(Number);
    expanded = dotted[1] + ((octets[0] << 8) | octets[1]).toString(16) + ':' + ((octets[2] << 8) | octets[3]).toString(16);
  }
  const [head, tail] = expanded.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const parts = expanded.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  if (parts.length !== 8) return 'unknown';
  const words = parts.map(part => Number.parseInt(part, 16));
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return `${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
  }
  return parts.slice(0, 4).map(part => Number.parseInt(part, 16).toString(16)).join(':') + '::/64';
}

export function createRateLimiter({ limit = 10, windowMs = 60_000, now = Date.now, maxKeys = 10_000, setIntervalImpl = setInterval } = {}) {
  if (![limit, windowMs, maxKeys].every(n => Number.isSafeInteger(n) && n > 0)) throw new RangeError('rate limit settings must be positive integers');
  const clients = new Map();
  let overflow = { count: 0, resetAt: 0 };
  const sweep = setIntervalImpl(() => {
    const time = now();
    for (const [key, entry] of clients) if (entry.resetAt <= time) clients.delete(key);
  }, windowMs);
  sweep.unref?.();
  return {
    take(ip) {
      const time = now();
      let entry = clients.get(ip);
      if (entry && entry.resetAt <= time) { clients.delete(ip); entry = undefined; }
      if (!entry) {
        if (clients.size >= maxKeys) {
          if (overflow.resetAt <= time) overflow = { count: 0, resetAt: time + windowMs };
          entry = overflow;
        } else {
          entry = { count: 0, resetAt: time + windowMs };
          clients.set(ip, entry);
        }
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
    close() { clearInterval(sweep); },
    stats() { return { clients: clients.size }; },
  };
}

export const QUEUE_TIMEOUT = Symbol('queue-timeout');
// One job at a time. A request that cannot start within maxWaitMs resolves QUEUE_TIMEOUT so the
// whole request (wait + compile 15 s + run 10 s + cleanup) stays well under the proxy's 60 s.
export function createRunQueue({ maxWaitMs = 25_000, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  let active = 0;
  const waiting = [];
  function start(job, resolve, reject) {
    active = 1;
    Promise.resolve().then(job).then(resolve, reject).finally(() => {
      active = 0;
      const next = waiting.shift();
      if (next) { clearTimeoutImpl(next.timer); start(next.job, next.resolve, next.reject); }
    });
  }
  return {
    submit(job) {
      if (active && waiting.length >= 8) return null;
      return new Promise((resolve, reject) => {
        if (!active) return start(job, resolve, reject);
        const entry = { job, resolve, reject };
        entry.timer = setTimeoutImpl(() => {
          const index = waiting.indexOf(entry);
          if (index >= 0) { waiting.splice(index, 1); resolve(QUEUE_TIMEOUT); }
        }, maxWaitMs);
        entry.timer?.unref?.();
        waiting.push(entry);
      });
    },
    stats: () => ({ active, queued: waiting.length }),
  };
}

// Crash-safe small state files on the disk-backed state volume (root-only dir, files 0600).
function writeFileAtomic(fs, file, text) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
const describe = error => ({ name: error?.name, code: error?.code, message: String(error?.message).replace(/[\x00-\x1f]/g, ' ').slice(0, 200) });

// Persistent deny-list of clients whose job made sandbox cleanup fail or crashed the server (each
// costs a restart for everybody). Outlives process and container restarts. A missing file means
// empty; any other read/write failure is logged, never silent.
export function createDenyList({ file, ttlMs = 15 * 60_000, max = 1000, now = Date.now, fs, logger = () => {} } = {}) {
  const entries = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('deny-list file is not an object');
    const t = now();
    for (const [key, until] of Object.entries(parsed).slice(-max)) {
      if (key.length > 100 || !Number.isFinite(until) || until <= t) continue;
      entries.set(key, Math.min(until, t + ttlMs)); // a tampered far-future expiry cannot lock a client out for long
    }
  } catch (error) { if (error.code !== 'ENOENT') logger({ event: 'denylist-read-failed', ...describe(error) }); }
  const prune = () => { const t = now(); for (const [key, until] of entries) if (until <= t) entries.delete(key); };
  return {
    has(key) { const until = entries.get(key); return until !== undefined && until > now(); },
    remainingSeconds(key) { return Math.max(1, Math.ceil(((entries.get(key) ?? 0) - now()) / 1000)); },
    add(key) {
      prune();
      if (entries.size >= max && !entries.has(key)) entries.delete(entries.keys().next().value);
      entries.set(key, now() + ttlMs);
      try { writeFileAtomic(fs, file, JSON.stringify(Object.fromEntries(entries))); }
      catch (error) { logger({ event: 'denylist-write-failed', ...describe(error) }); }
    },
  };
}

// The one job currently running, durably recorded BEFORE it starts and removed after its cleanup.
// A record found at startup means the previous server died mid-job (OOM, SIGKILL, crash): the
// client that submitted it is blamed.
export function createInflight({ file, fs, logger = () => {} } = {}) {
  return {
    begin(record) { writeFileAtomic(fs, file, JSON.stringify(record)); },
    end() { try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') logger({ event: 'inflight-clear-failed', ...describe(error) }); } },
    recover() {
      let record = null;
      try { record = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') logger({ event: 'inflight-read-failed', ...describe(error) }); }
      this.end();
      return record && typeof record.clientKey === 'string' ? record : null;
    },
  };
}
