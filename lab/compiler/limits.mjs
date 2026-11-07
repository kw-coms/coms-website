export function normalizeIp(ip) {
  if (typeof ip !== 'string') return 'unknown';
  let addr = ip.toLowerCase().split('%')[0];
  if (addr.startsWith('::ffff:') && addr.includes('.')) return addr.slice(7);
  if (!addr.includes(':')) return addr;
  const [head, tail] = addr.split('::');
  const h = head ? head.split(':') : [];
  if (tail === undefined) return h.slice(0, 4).map(x => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
  const t = tail ? tail.split(':').flatMap(x => x.includes('.') ? ['0', '0'] : [x]) : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return full.slice(0, 4).map(x => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export function createRateLimiter({ limit = 10, windowMs = 60_000, now = Date.now, maxKeys = 10_000, setIntervalImpl = setInterval } = {}) {
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) throw new RangeError('maxKeys must be a positive integer');
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
      if (entry && entry.resetAt <= time) {
        clients.delete(ip);
        entry = undefined;
      }
      if (!entry) {
        // Never evict live entries (that would let IP rotation reset counters); a full table
        // charges new keys to one shared overflow bucket until the sweep frees space.
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

// Resolved (instead of the job's result) for a job that waited maxWaitMs without getting a slot.
export const QUEUE_WAIT_EXPIRED = Symbol('queue-wait-expired');

// maxWaitMs bounds the time spent waiting for a slot so that wait + the 20 s compile stays well
// under the 60 s the host proxy gives a request (it sets no proxy_read_timeout of its own).
export function createCompileQueue({ concurrency = 2, maxQueued = 6, maxWaitMs = 25_000, setTimeoutImpl = setTimeout } = {}) {
  let active = 0;
  const waiting = [];
  function start(job, resolve, reject) {
    active++;
    Promise.resolve().then(job).then(resolve, reject).finally(() => {
      active--;
      const next = waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        start(next.job, next.resolve, next.reject);
      }
    });
  }
  return {
    submit(job) {
      if (active >= concurrency && waiting.length >= maxQueued) return null;
      return new Promise((resolve, reject) => {
        if (active < concurrency) return start(job, resolve, reject);
        const entry = { job, resolve, reject, timer: undefined };
        entry.timer = setTimeoutImpl(() => {
          const index = waiting.indexOf(entry);
          if (index !== -1) waiting.splice(index, 1);
          resolve(QUEUE_WAIT_EXPIRED);
        }, maxWaitMs);
        entry.timer.unref?.();
        waiting.push(entry);
      });
    },
    stats: () => ({ active, queued: waiting.length }),
  };
}
