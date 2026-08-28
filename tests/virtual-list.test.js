const test = require('node:test');
const assert = require('node:assert/strict');
const { computeVirtualWindow } = require('../src/virtual-list');

test('small lists render without virtualization', () => {
  assert.deepEqual(computeVirtualWindow({
    total: 499,
    scrollTop: 1000,
    viewportHeight: 600,
    rowHeight: 62,
    threshold: 500
  }), { virtual: false, start: 0, end: 499, before: 0, after: 0 });
});

test('large lists render only the visible window with overscan', () => {
  const window = computeVirtualWindow({
    total: 10000,
    scrollTop: 6200,
    viewportHeight: 620,
    rowHeight: 62,
    overscan: 8,
    threshold: 500
  });
  assert.deepEqual(window, {
    virtual: true,
    start: 92,
    end: 118,
    before: 5704,
    after: 612684
  });
});

test('virtual window stays within list bounds near the end', () => {
  const window = computeVirtualWindow({
    total: 1000,
    scrollTop: 100000,
    viewportHeight: 620,
    rowHeight: 62,
    overscan: 8,
    threshold: 500
  });
  assert.equal(window.end, 1000);
  assert.ok(window.start < window.end);
  assert.equal(window.after, 0);
});
