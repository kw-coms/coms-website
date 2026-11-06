export function createRateLimiter({ limit = 10, windowMs = 60_000, now = Date.now, maxKeys = 10_000 } = {}) {
  const clients = new Map();
  return {
    take(ip) {
      const time = now();
      // Also bounds memory when clients rotate IPs.
      for (const [key, entry] of clients) if (entry.resetAt <= time) clients.delete(key);
      let entry = clients.get(ip);
      if (!entry) {
        if (clients.size >= maxKeys) return false;
        entry = { count: 0, resetAt: time + windowMs };
        clients.set(ip, entry);
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
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
