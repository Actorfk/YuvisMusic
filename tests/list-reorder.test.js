const test = require('node:test');
const assert = require('node:assert/strict');
const { reorderVisibleItems } = require('../src/list-reorder');

const identity = (value) => value;
const move = (items, visible, source, target, after) => reorderVisibleItems(items, visible, source, target, after, identity);

test('moves songs before and after targets in either direction without changing the input', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(move(items, items, 'a', 'c', true), ['b', 'c', 'a', 'd']);
  assert.deepEqual(move(items, items, 'a', 'c', false), ['b', 'a', 'c', 'd']);
  assert.deepEqual(move(items, items, 'd', 'a', false), ['d', 'a', 'b', 'c']);
  assert.deepEqual(move(items, items, 'd', 'a', true), ['a', 'd', 'b', 'c']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

test('dragging a sorted search result preserves hidden and unavailable items', () => {
  const items = ['hidden', 'c', 'offline', 'a', 'b', 'last-hidden'];
  assert.deepEqual(move(items, ['a', 'b', 'c'], 'c', 'a', true), ['hidden', 'a', 'offline', 'c', 'b', 'last-hidden']);
});

test('invalid, stale, duplicate and unchanged drops are ignored', () => {
  const items = ['a', 'b', 'c'];
  for (const [visible, source, target, after] of [
    [items, 'a', 'a', true], [items, 'a', 'b', false], [items, 'b', 'a', true],
    [items, 'gone', 'b', true], [items, 'a', 'gone', true],
    [['a', 'b', 'gone'], 'a', 'b', true], [['a', 'a', 'b'], 'a', 'b', true]
  ]) assert.equal(move(items, visible, source, target, after), items);
});

test('large virtual lists reorder by stable IDs and retain track objects and current track', () => {
  const tracks = Array.from({ length: 10000 }, (_, index) => ({ id: `track-${index}` }));
  const current = tracks[5];
  const reordered = reorderVisibleItems(tracks, tracks.map((track) => track.id), current.id, tracks[9999].id, true);
  assert.equal(reordered.at(-1), current);
  assert.equal(reordered[5], tracks[6]);
  assert.equal(new Set(reordered).size, 10000);
});
