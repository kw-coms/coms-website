import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARTS } from './core';

// A new catalog part must ship with its thumbnails: run `npm run parts:thumbs`.
describe('part thumbnails', () => {
  for (const kind of Object.keys(PARTS)) {
    for (const suffix of ['', '-lg']) {
      it(`${kind}${suffix}.webp exists and is a WebP`, () => {
        const file = new URL(`../../public/parts/${kind}${suffix}.webp`, import.meta.url);
        expect(existsSync(file), 'run npm run parts:thumbs').toBe(true);
        const b = readFileSync(file);
        expect(b.subarray(0, 4).toString()).toBe('RIFF');
        expect(b.subarray(8, 12).toString()).toBe('WEBP');
        expect(b.length).toBeLessThan(40_000);
      });
    }
  }
});
