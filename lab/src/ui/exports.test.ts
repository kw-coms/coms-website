import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartInstance, Scene } from '../core/types';

let downloads: { name: string; blob: Blob }[];
let blobs: Map<string, Blob>;

const part = (id: string, kind: PartInstance['kind'], props: PartInstance['props']): PartInstance => ({ id, kind, pos: [0, 0, 0], rotY: 0, props });
const scene = (title: string, code: string, parts: PartInstance[]): Scene => ({ version: 2, title, code, parts, wires: [] });

beforeEach(() => {
  downloads = [];
  blobs = new Map();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((object: Blob | MediaSource) => {
    const url = `blob:test-${blobs.size}`;
    expect(object).toBeInstanceOf(Blob);
    blobs.set(url, object as Blob);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.stubGlobal('document', {
    body: { appendChild: () => undefined },
    createElement: () => {
      const anchor = {
        href: '', download: '',
        click() { downloads.push({ name: this.download, blob: blobs.get(this.href)! }); },
        remove: () => undefined,
      };
      return anchor;
    },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('file exports', () => {
  it('downloads the sketch as exact UTF-8 .ino text with a safe Korean filename', async () => {
    const { loadScene } = await import('./store');
    const { exportIno } = await import('./actions');
    const code = 'void setup() { Serial.println("안녕"); }\nvoid loop() {}\n';
    loadScene(scene('한글 회로 / 2026', code, []));

    exportIno();

    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toBe('한글_회로_2026.ino');
    expect(downloads[0]!.blob.type).toBe('text/plain;charset=utf-8');
    expect(await downloads[0]!.blob.text()).toBe(code);
  });

  it('downloads exact BOM CSV with Korean names, quantity grouping, and RFC-style quote escaping', async () => {
    const { loadScene } = await import('./store');
    const { exportBom } = await import('./actions');
    loadScene(scene('부품표', '', [
      part('r1', 'resistor', { ohms: 220 }),
      part('r2', 'resistor', { ohms: 220 }),
      part('r3', 'resistor', { ohms: 1000 }),
      part('led1', 'led', { color: 'red,"bright"' }),
    ]));

    exportBom();

    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toBe('circuit-lab-bom.csv');
    expect(downloads[0]!.blob.type).toBe('text/csv;charset=utf-8');
    expect([...new Uint8Array(await downloads[0]!.blob.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await downloads[0]!.blob.text()).toBe(
      '"부품","종류","값","수량","부품 ID"\r\n' +
      '"저항","resistor","저항=220Ω","2","r1 r2"\r\n' +
      '"저항","resistor","저항=1000Ω","1","r3"\r\n' +
      '"LED","led","색상=red,""bright""","1","led1"',
    );
  });
});
