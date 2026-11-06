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

export function createCompileQueue({ concurrency = 2, maxQueued = 6 } = {}) {
  let active = 0;
  const waiting = [];
  function start(job, resolve, reject) {
    active++;
    Promise.resolve().then(job).then(resolve, reject).finally(() => {
      active--;
      const next = waiting.shift();
      if (next) start(...next);
    });
  }
  return {
    submit(job) {
      if (active >= concurrency && waiting.length >= maxQueued) return null;
      return new Promise((resolve, reject) => {
        if (active < concurrency) start(job, resolve, reject);
        else waiting.push([job, resolve, reject]);
      });
    },
    stats: () => ({ active, queued: waiting.length }),
  };
}
