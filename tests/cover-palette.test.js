const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCoverPalette, createCoverPaletteController } = require('../src/cover-palette');
const red = [200, 40, 55, 255];
const blue = [30, 90, 190, 255];

test('cover palette retains distinct artwork colors and ignores transparent pixels and white borders', () => {
  const pixels = [...Array(20).fill([255, 255, 255, 255]), ...Array(8).fill(red), ...Array(4).fill(blue), ...Array(40).fill([0, 255, 0, 0])].flat();
  assert.deepEqual(extractCoverPalette(pixels), { primary: red.slice(0, 3), secondary: blue.slice(0, 3) });
});

test('monochrome and single-color covers remain neutral or in their original hue', () => {
  for (const color of [[0, 0, 0, 255], [255, 255, 255, 255], [128, 128, 128, 255], red]) {
    assert.deepEqual(extractCoverPalette(color), { primary: color.slice(0, 3), secondary: color.slice(0, 3) });
  }
  assert.equal(extractCoverPalette([]), null);
  assert.equal(extractCoverPalette([255, 0, 0, 0]), null);
});

test('late artwork cannot overwrite a newer song, cached covers are reused, and no cover clears stale colors', async () => {
  const resolvers = new Map();
  let loads = 0;
  let palette;
  const controller = createCoverPaletteController({
    loadPixels: (source) => { loads += 1; return new Promise((resolve) => resolvers.set(source, resolve)); },
    apply: (value) => { palette = value; }
  });
  const first = controller.update('red');
  assert.equal(controller.update('red'), first);
  const second = controller.update('blue');
  await Promise.resolve();
  resolvers.get('blue')(blue);
  await second;
  resolvers.get('red')(red);
  await first;
  assert.deepEqual(palette.primary, blue.slice(0, 3));
  await controller.update('red');
  assert.equal(loads, 2);
  assert.deepEqual(palette.primary, red.slice(0, 3));
  const delayed = controller.update('delayed');
  await Promise.resolve();
  await controller.update(null);
  resolvers.get('delayed')(blue);
  await delayed;
  assert.equal(palette, null);
});

test('unreadable artwork falls back without rejecting and palette cache stays bounded', async () => {
  let palette;
  let loads = 0;
  const controller = createCoverPaletteController({
    loadPixels: async (source) => { loads += 1; if (source === 'broken') throw new Error('decode'); return red; },
    apply: (value) => { palette = value; }
  });
  await controller.update('broken');
  assert.equal(palette, null);
  for (let index = 0; index < 33; index += 1) await controller.update(String(index));
  await controller.update('0');
  assert.equal(loads, 35);
});
