import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const MAX_STATE_BYTES = 4 * 1024 * 1024;
const pending = new Map();

export class ClubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function clubMemberId(key) {
  if (typeof key !== 'string' || !/^m:[A-Za-z0-9_-]{1,64}$/.test(key)) throw new ClubError(401, '로그인한 동아리원만 이용할 수 있어요.');
  return createHash('sha256').update(key).digest('hex');
}

/** The runner is the only writer of the private state volume. Serialize writes per file. */
export function createClubStore({ directory, filename, initial }) {
  if (!/^[a-z-]+\.json$/.test(filename) || typeof initial !== 'function') throw new TypeError('Invalid club store');
  const root = resolve(directory);
  const file = resolve(root, filename);
  const schema = initial();

  async function ensureDirectory() {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const entry = await lstat(root);
    if (!entry.isDirectory() || entry.mode & 0o077) throw new Error('Club store directory must be private');
  }

  async function readState() {
    await ensureDirectory();
    let handle;
    try {
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const entry = await handle.stat();
      if (!entry.isFile() || entry.mode & 0o077 || entry.size > MAX_STATE_BYTES) throw new Error('Invalid club state file');
      const state = JSON.parse(await handle.readFile('utf8'));
      if (!state || state.version !== schema.version || Object.keys(schema).some(key => Array.isArray(schema[key]) && !Array.isArray(state[key]))) {
        throw new Error('Invalid club state data');
      }
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return initial();
      throw error;
    } finally { await handle?.close(); }
  }

  async function writeState(data) {
    if (Buffer.byteLength(data) > MAX_STATE_BYTES) throw new ClubError(507, '저장 공간을 사용할 수 없어요.');
    const temporary = `${file}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(data);
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

  return {
    async read() {
      await pending.get(file);
      return readState();
    },
    async update(mutate) {
      const work = (pending.get(file) ?? Promise.resolve()).then(async () => {
        const state = await readState();
        const previous = JSON.stringify(state);
        const value = await mutate(state);
        const next = JSON.stringify(state);
        if (next !== previous) await writeState(next);
        return value;
      });
      const settled = work.catch(() => {});
      pending.set(file, settled);
      try { return await work; }
      finally { if (pending.get(file) === settled) pending.delete(file); }
    },
  };
}
