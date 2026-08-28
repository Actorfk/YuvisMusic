(function exposeVirtualList(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YuvisVirtualList = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  function computeVirtualWindow({
    total,
    scrollTop,
    viewportHeight,
    rowHeight,
    overscan = 8,
    threshold = 500
  }) {
    const itemCount = Math.max(0, Math.floor(Number(total) || 0));
    const height = Math.max(1, Number(rowHeight) || 1);
    if (itemCount < threshold) {
      return { virtual: false, start: 0, end: itemCount, before: 0, after: 0 };
    }
    const safeScrollTop = Math.max(0, Number(scrollTop) || 0);
    const safeViewportHeight = Math.max(height, Number(viewportHeight) || height);
    const buffer = Math.max(0, Math.floor(Number(overscan) || 0));
    const visibleRows = Math.ceil(safeViewportHeight / height);
    const windowSize = visibleRows + buffer * 2;
    const unclampedStart = Math.max(0, Math.floor(safeScrollTop / height) - buffer);
    const start = Math.min(unclampedStart, Math.max(0, itemCount - windowSize));
    const end = Math.min(itemCount, start + windowSize);
    return {
      virtual: true,
      start,
      end,
      before: start * height,
      after: Math.max(0, (itemCount - end) * height)
    };
  }

  return { computeVirtualWindow };
}));
