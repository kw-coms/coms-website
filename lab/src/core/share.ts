import type { Scene } from './types';
import { validateScene } from './scene';

export { validateScene } from './scene';

const MAX_DECODED_BYTES = 32 * 1024;
const MAX_ENCODED_CHARS = 50_000;

function fail(message: string): never {
  throw new Error(message);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > MAX_ENCODED_CHARS) {
    return fail('공유 링크 형식이 올바르지 않습니다.');
  }
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function readBounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) fail('공유 데이터가 32 KB를 초과합니다.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function encodeShare(scene: Scene): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(validateScene(scene)));
  if (bytes.length > MAX_DECODED_BYTES) fail('공유 데이터가 32 KB를 초과합니다.');
  const compressed = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64Url(await readBounded(compressed, MAX_ENCODED_CHARS));
}

export async function decodeShare(hash: string): Promise<Scene> {
  const encoded = hash.replace(/^#/, '').replace(/^scene=/, '');
  try {
    const compressed = fromBase64Url(encoded);
    const decompressed = new Blob([compressed as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const bytes = await readBounded(decompressed, MAX_DECODED_BYTES);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return validateScene(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof Error && /공유 데이터|장면|부품|선|코드|제목|블록|메모|미션/.test(error.message)) {
      throw error;
    }
    return fail('공유 링크를 읽을 수 없습니다.');
  }
}
