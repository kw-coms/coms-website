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

export function createRunQueue() {
  let active = 0;
  const waiting = [];
  function start(job, resolve, reject) {
    active = 1;
    Promise.resolve().then(job).then(resolve, reject).finally(() => {
      active = 0;
      const next = waiting.shift();
      if (next) start(...next);
    });
  }
  return {
    submit(job) {
      if (active && waiting.length >= 8) return null;
      return new Promise((resolve, reject) => {
        if (active) waiting.push([job, resolve, reject]);
        else start(job, resolve, reject);
      });
    },
    stats: () => ({ active, queued: waiting.length }),
  };
}
