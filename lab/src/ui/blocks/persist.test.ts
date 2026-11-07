// Blocks survive the document paths: JSON export/import (validateScene) and the share link.
import { describe, expect, it } from 'vitest';
import { decodeShare, EXAMPLES, encodeShare, validateScene } from '../../core';
import type { Scene } from '../../core';
import { generate } from './generate';
import { STARTER_BLOCKS } from './starters';

const base = EXAMPLES.find((e) => e.id === 'distance-alarm')!.scene;
const scene: Scene = { ...base, version: 2, codeMode: 'blocks', blocks: STARTER_BLOCKS['distance-alarm'], code: generate(STARTER_BLOCKS['distance-alarm']).code };

describe('blocks are part of the document', () => {
  it('validateScene keeps codeMode and blocks', () => {
    const back = validateScene(JSON.parse(JSON.stringify(scene)));
    expect(back.codeMode).toBe('blocks');
    expect(back.blocks).toEqual(scene.blocks);
  });
  it('a share link keeps them', async () => {
    const back = await decodeShare(await encodeShare(scene));
    expect(back.codeMode).toBe('blocks');
    expect(back.blocks).toEqual(scene.blocks);
    expect(back.code).toBe(scene.code);
  });
  it('every starter fits the 256 KB block limit by a wide margin', () => {
    for (const [id, ws] of Object.entries(STARTER_BLOCKS)) expect(JSON.stringify(ws).length, id).toBeLessThan(8000);
  });
});
