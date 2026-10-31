import { describe, expect, it } from 'vitest';
import { common, hexToNumber, voxel } from '../../src/content/palettes';

const HEX = /^#[0-9a-f]{6}$/;

describe('palettes', () => {
  it('uses lowercase 6-digit hex colors everywhere', () => {
    const all = [...Object.values(common), ...Object.values(voxel)];
    for (const color of all) expect(color).toMatch(HEX);
  });

  it('converts hex to a three.js color number', () => {
    expect(hexToNumber('#ff8a1f')).toBe(0xff8a1f);
  });
});
