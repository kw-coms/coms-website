import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const pending = new Map();

function memberFile(directory, key) {
  if (typeof key !== 'string' || !/^m:[A-Za-z0-9_-]{1,64}$/.test(key)) {
    throw new TypeError('An authenticated member key is required');
  }
  return join(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
}

function validateRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || !Array.isArray(value.solved)) {
    throw new Error('Invalid judge progress record');
  }
  const seen = new Set();
  for (const entry of value.solved) {
    if (!entry || typeof entry !== 'object' || !Number.isSafeInteger(entry.number) || entry.number < 1 ||
        !Number.isSafeInteger(entry.day) || entry.day < 0 || seen.has(entry.number)) {
      throw new Error('Invalid judge progress record');
    }
    seen.add(entry.number);
  }
  return value;
}

async function readRecord(file) {
  try { return validateRecord(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return { version: 1, solved: [] };
    throw error;
  }
}

function summary(record, day) {
  const days = new Set(record.solved.map(entry => entry.day));
  let cursor = days.has(day) ? day : day - 1;
  let streak = 0;
  while (days.has(cursor)) { streak++; cursor--; }
  return {
    solved: record.solved.map(entry => entry.number).sort((a, b) => a - b),
    solvedToday: record.solved.filter(entry => entry.day === day).length,
    streak,
  };
}

async function writeRecord(file, record) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(record));
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
  } catch (error) {
    await handle?.close();
    await unlink(temporary).catch(cleanupError => { if (cleanupError.code !== 'ENOENT') throw cleanupError; });
    throw error;
  }
}

export function createJudgeProgress({ directory, now = Date.now }) {
  if (typeof directory !== 'string' || !directory) throw new TypeError('Progress directory is required');
  const dayNow = () => {
    const time = now();
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid current time');
    return Math.floor((time + KST_OFFSET_MS) / DAY_MS);
  };
  const ensureDirectory = async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.mode & 0o077) throw new Error('Judge progress directory must be private');
  };
  return {
    async get(key) {
      const file = memberFile(directory, key);
      await pending.get(file);
      await ensureDirectory();
      return summary(await readRecord(file), dayNow());
    },
    async recordSolved(key, number) {
      const file = memberFile(directory, key);
      if (!Number.isSafeInteger(number) || number < 1) throw new TypeError('A positive problem number is required');
      const previous = pending.get(file) ?? Promise.resolve();
      const work = previous.then(async () => {
        await ensureDirectory();
        const record = await readRecord(file);
        const day = dayNow();
        if (!record.solved.some(entry => entry.number === number)) {
          record.solved.push({ number, day });
          await writeRecord(file, record);
        }
        return summary(record, day);
      });
      const settled = work.catch(() => {});
      pending.set(file, settled);
      try { return await work; }
      finally { if (pending.get(file) === settled) pending.delete(file); }
    },
  };
}
