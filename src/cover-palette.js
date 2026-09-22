(function exposeCoverPalette(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YuvisCoverPalette = api;
})(typeof globalThis === 'undefined' ? null : globalThis, () => {
  function extractCoverPalette(pixels) {
    const buckets = new Map();
    for (let index = 0; index + 3 < pixels.length; index += 4) {
      const [r, g, b, alpha] = pixels.slice(index, index + 4);
      if (alpha < 128) continue;
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const bucket = buckets.get(key) || { sum: [0, 0, 0], count: 0 };
      bucket.sum[0] += r; bucket.sum[1] += g; bucket.sum[2] += b; bucket.count += 1;
      buckets.set(key, bucket);
    }
    const colors = [...buckets.values()].map(({ sum, count }) => {
      const rgb = sum.map((value) => Math.round(value / count));
      const range = Math.max(...rgb) - Math.min(...rgb);
      return { rgb, score: count * (1 + range / 128) };
    }).sort((a, b) => b.score - a.score);
    if (!colors.length) return null;
    // Prefer actual cover colors over white borders or black lettering, but keep
    // monochrome artwork neutral when there is no chromatic palette to extract.
    const chromatic = colors.filter(({ rgb }) => Math.max(...rgb) - Math.min(...rgb) > 24);
    const candidates = chromatic.length ? chromatic : colors;
    const primary = candidates[0].rgb;
    const secondary = candidates.find(({ rgb }) => rgb.reduce((sum, value, index) => sum + (value - primary[index]) ** 2, 0) > 3600)?.rgb || primary;
    return { primary, secondary };
  }

  function createCoverPaletteController({ loadPixels, apply }) {
    const cache = new Map();
    let activeSource;
    let generation = 0;
    let pending = Promise.resolve();
    return {
      update(source) {
        source = source || null;
        if (source === activeSource) return pending;
        activeSource = source;
        const request = ++generation;
        apply(null);
        if (!source) return (pending = Promise.resolve());
        if (!cache.has(source)) {
          cache.set(source, Promise.resolve().then(() => loadPixels(source)).then(extractCoverPalette).catch(() => null));
          if (cache.size > 32) cache.delete(cache.keys().next().value);
        }
        pending = cache.get(source).then((palette) => {
          if (request === generation) apply(palette);
        });
        return pending;
      }
    };
  }

  return Object.freeze({ extractCoverPalette, createCoverPaletteController });
});
