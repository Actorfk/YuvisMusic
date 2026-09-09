'use strict';

// Run against an isolated Electron profile: node tests/runtime-reorder-smoke.js <CDP port> <artifact directory>
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const port = Number(process.argv[2] || 9334);
const artifactDirectory = path.resolve(process.argv[3]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
  const target = targets.find((item) => item.url.endsWith('/index.html'));
  assert.ok(target, 'Player page available');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const point = (selector, fraction = .5) => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing row: ' + ${JSON.stringify(selector)});
    const rect = element.getBoundingClientRect();
    return { x: rect.left + Math.min(110, rect.width / 2), y: rect.top + rect.height * ${fraction} };
  })()`);
  const drag = async (source, targetSelector, after = false, cancel = false) => {
    console.log(`Drag ${source} -> ${targetSelector}${cancel ? ' (cancel)' : ''}`);
    const a = await point(source);
    const b = await point(targetSelector, after ? .8 : .2);
    await mouse('mousePressed', a.x, a.y);
    await mouse('mouseMoved', a.x + 8, a.y);
    await mouse('mouseMoved', b.x, b.y);
    await delay(35);
    const previewY = await evaluate("document.querySelector('.reorder-drag-preview').getBoundingClientRect().top");
    await delay(65);
    const animationState = await evaluate(`(() => {
      const preview = document.querySelector('.reorder-drag-preview');
      const rows = [...document.querySelectorAll('.reorder-shifting:not(.reorder-source)')];
      return { y: preview.getBoundingClientRect().top, shifted: rows.some(row => Math.abs(new DOMMatrixReadOnly(getComputedStyle(row).transform).m42) > 1), sources: document.querySelectorAll('.reorder-source').length };
    })()`);
    assert.ok(Math.abs(animationState.y - previewY) > .1, 'Lifted row smoothly follows the pointer');
    assert.equal(animationState.shifted, true, 'Neighboring rows visibly make room');
    assert.equal(animationState.sources, 1);
    if (!cancel) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const surface = source.startsWith('#playlistNav') ? 'playlists' : source.startsWith('#queueList') ? 'queue' : 'songs';
      await fs.writeFile(path.join(artifactDirectory, `drag-animation-${surface}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    assert.equal(await evaluate("document.body.classList.contains('list-reordering')"), true);
    if (cancel) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await mouse('mouseReleased', b.x, b.y);
    assert.equal(await evaluate("Boolean(document.querySelector('.reorder-settling'))"), true, 'Release/cancel animates back into the list');
    await delay(300);
    assert.equal(await evaluate("document.body.classList.contains('list-reordering')"), false);
    assert.equal(await evaluate("document.querySelectorAll('.reorder-drag-preview, .reorder-source, .reorder-shifting').length"), 0, 'Animation state is fully cleaned up');
  };
  const titleOrder = () => evaluate('getVisibleTracks().map(track => track.title)');
  const trackSelector = (index) => `#trackList [data-track-index="${index}"]`;
  try {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await fs.mkdir(artifactDirectory, { recursive: true });
    const paths = [];
    for (const title of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
      const pcmBytes = 8000 * 2 * 30;
      const wav = Buffer.alloc(44 + pcmBytes);
      wav.write('RIFF'); wav.writeUInt32LE(36 + pcmBytes, 4); wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcmBytes, 40);
      const file = path.join(artifactDirectory, `${title}.wav`);
      await fs.writeFile(file, wav);
      paths.push(file);
    }
    await evaluate(`(async () => {
      audio.pause(); audio.volume = 0; closeModals(); state.failedTracks.clear(); document.body.classList.remove('has-playback-failure');
      setLibrary(await window.desktop.restoreTracks(${JSON.stringify(paths)}));
      persistLibrary(); state.listSortModes = {}; state.search = ''; state.view = 'library';
      state.playlists = ['First', 'Second', 'Third'].map((name, index) => ({ id: 'qa-' + index, name, createdAt: Date.now(), trackPaths: state.library.map(track => track.path) }));
      state.playlists[0].trackPaths.splice(1, 0, 'C:\\\\Unavailable\\\\missing.mp3');
      persistPlaylists(); state.favorites = new Set(state.library.map(track => track.id));
      renderView(); renderQueue(); window.qaTracks = [...state.library];
    })()`);
    await drag(trackSelector(0), trackSelector(2), true);
    assert.deepEqual(await titleOrder(), ['Bravo', 'Charlie', 'Alpha', 'Delta']);
    assert.equal(await evaluate('currentListSortMode()'), 'manual');
    const libraryOrder = await evaluate('JSON.parse(localStorage.libraryPaths)');

    await evaluate("state.view = 'favorite'; renderView();");
    await drag(trackSelector(3), trackSelector(0));
    assert.deepEqual(await titleOrder(), ['Delta', 'Alpha', 'Bravo', 'Charlie']);
    assert.deepEqual(await evaluate('JSON.parse(localStorage.libraryPaths)'), libraryOrder);

    await evaluate("state.view = 'playlist'; state.activePlaylistId = 'qa-0'; renderView();");
    await drag(trackSelector(2), trackSelector(0));
    assert.deepEqual(await titleOrder(), ['Charlie', 'Alpha', 'Bravo', 'Delta']);
    assert.match(await evaluate('activePlaylist().trackPaths[1]'), /missing.mp3$/);
    await drag('#playlistNav [data-playlist-id="qa-2"]', '#playlistNav [data-playlist-id="qa-0"]');
    assert.deepEqual(await evaluate('state.playlists.map(item => item.id)'), ['qa-2', 'qa-0', 'qa-1']);
    assert.equal(await evaluate('state.activePlaylistId'), 'qa-0', 'Dragging a sidebar item does not open it');

    await evaluate("state.queue = [...window.qaTracks]; loadTrack(window.qaTracks[1]); openQueueMenu();");
    await delay(350);
    assert.equal(await evaluate('audio.paused'), false);
    const currentId = await evaluate('state.currentId');
    const elapsed = await evaluate('audio.currentTime');
    await drag('#queueList .queue-item:nth-child(4)', '#queueList .queue-item:nth-child(2)', true);
    assert.deepEqual(await evaluate('state.queue.map(track => track.title)'), ['Alpha', 'Bravo', 'Delta', 'Charlie']);
    assert.equal(await evaluate('state.currentId'), currentId);
    assert.equal(await evaluate('audio.paused'), false);
    assert.ok(await evaluate('audio.currentTime') >= elapsed);
    await evaluate('nextTrack(1)');
    assert.equal(await evaluate('currentTrack().title'), 'Delta');
    await delay(200);
    assert.equal(await evaluate('audio.paused'), false);
    await evaluate('audio.pause(); closeQueueMenu();');
    await delay(300);

    await evaluate("state.view = 'library'; state.library.forEach(track => track.artist = ['Alpha', 'Charlie'].includes(track.title) ? 'match' : 'hidden'); rebuildTrackIndex(); state.search = 'match'; renderView();");
    await drag(trackSelector(1), trackSelector(0));
    assert.deepEqual(await evaluate('state.library.map(track => track.title)'), ['Bravo', 'Alpha', 'Charlie', 'Delta']);
    await drag(trackSelector(0), trackSelector(1), true, true);
    assert.deepEqual(await titleOrder(), ['Alpha', 'Charlie'], 'Escape cancels without changing order');

    await evaluate("state.search = ''; renderLibrary(); document.querySelector('#sortSelect').value = 'title-desc'; document.querySelector('#sortSelect').dispatchEvent(new Event('change'));");
    assert.deepEqual(await titleOrder(), ['Delta', 'Charlie', 'Bravo', 'Alpha']);
    await evaluate("document.querySelector('#sortSelect').value = 'manual'; document.querySelector('#sortSelect').dispatchEvent(new Event('change'));");
    assert.deepEqual(await titleOrder(), ['Bravo', 'Alpha', 'Charlie', 'Delta']);
    await send('Page.reload');
    await delay(900);
    assert.deepEqual(await titleOrder(), ['Bravo', 'Alpha', 'Charlie', 'Delta'], 'Manual order restored after reload');
    assert.deepEqual(await evaluate('state.playlists.map(item => item.id)'), ['qa-2', 'qa-0', 'qa-1']);
    await evaluate("state.view = 'playlist'; state.activePlaylistId = 'qa-0'; renderView();");
    assert.deepEqual(await titleOrder(), ['Charlie', 'Alpha', 'Bravo', 'Delta']);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(artifactDirectory, 'reorder-ui.png'), Buffer.from(screenshot.data, 'base64'));

    await evaluate(`state.view = 'library'; state.search = ''; setListSortMode('manual');
      setLibrary(Array.from({ length: 10000 }, (_, index) => ({ id: 'large-' + index, path: 'C:/QA/' + index + '.wav', title: 'Song ' + index, artist: 'QA', album: 'QA', modifiedAt: 0, duration: 30, cover: null, coverState: 'none' })));
      renderView(); document.querySelector('#trackList').scrollIntoView({ block: 'start' });`);
    await delay(80);
    const a = await point('#trackList [data-track-id="large-0"]');
    const edge = await evaluate("(() => { const rect = document.querySelector('.main-content').getBoundingClientRect(); return { x: rect.left + 120, y: rect.bottom - 8 }; })()");
    await mouse('mousePressed', a.x, a.y);
    await mouse('mouseMoved', a.x + 8, a.y);
    await mouse('mouseMoved', edge.x, edge.y);
    await delay(1400);
    assert.equal(await evaluate("document.body.classList.contains('list-reordering')"), true);
    assert.ok(await evaluate("Number(document.querySelector('#trackList [data-track-index]').dataset.trackIndex)") > 0, 'Virtual window advanced while dragging');
    await mouse('mouseMoved', edge.x, edge.y - 90);
    await mouse('mouseReleased', edge.x, edge.y - 90);
    assert.ok(await evaluate("state.library.findIndex(track => track.id === 'large-0')") > 10);
    assert.ok(await evaluate("document.querySelectorAll('#trackList [data-track-id]').length") < 60);
    assert.equal(await evaluate('new Set(state.library.map(track => track.id)).size'), 10000);
    await evaluate('state.queue = state.library.slice(0, 1000); renderQueue(); openQueueMenu();');
    await delay(250);
    const queueSource = await evaluate('state.queue[0].id');
    const q = await point('#queueList .queue-item');
    const queueEdge = await evaluate("(() => { const rect = document.querySelector('#queueList').getBoundingClientRect(); return { x: rect.left + 100, y: rect.bottom - 6 }; })()");
    await mouse('mousePressed', q.x, q.y);
    await mouse('mouseMoved', q.x + 8, q.y);
    await mouse('mouseMoved', queueEdge.x, queueEdge.y);
    await delay(1100);
    assert.ok(await evaluate("document.querySelector('#queueList').scrollTop") > 400);
    await mouse('mouseMoved', queueEdge.x, queueEdge.y - 80);
    await mouse('mouseReleased', queueEdge.x, queueEdge.y - 80);
    assert.ok(await evaluate(`state.queue.findIndex(track => track.id === ${JSON.stringify(queueSource)})`) > 8);
    assert.ok(await evaluate("document.querySelectorAll('#queueList [data-queue-id]').length") < 50);
    await evaluate("closeQueueMenu(); document.querySelector('.main-content').scrollTop = 0; renderLibrary();");
    await delay(300);
    await send('Emulation.setDeviceMetricsOverride', { width: 1040, height: 680, deviceScaleFactor: 1, mobile: false });
    const layout = await evaluate("(() => { const select = document.querySelector('#sortSelect').getBoundingClientRect(); const main = document.querySelector('.main-content').getBoundingClientRect(); return { inside: select.left >= main.left && select.right <= main.right, overflow: document.documentElement.scrollWidth > innerWidth }; })()");
    assert.deepEqual(layout, { inside: true, overflow: false });
    const compactScreenshot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(artifactDirectory, 'reorder-compact-ui.png'), Buffer.from(compactScreenshot.data, 'base64'));
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate("state.queue = state.library.slice(0, 3); renderQueue(); document.querySelector('#queueList').scrollTop = 0; openQueueMenu();");
    await delay(300);
    const reducedIds = await evaluate('state.queue.map(track => track.id)');
    const reducedStart = await point('#queueList .queue-item:nth-child(1)');
    const reducedEnd = await point('#queueList .queue-item:nth-child(3)', .8);
    await mouse('mousePressed', reducedStart.x, reducedStart.y);
    await mouse('mouseMoved', reducedStart.x + 8, reducedStart.y);
    await mouse('mouseMoved', reducedEnd.x, reducedEnd.y);
    await delay(50);
    assert.equal(await evaluate("document.querySelector('.reorder-drag-preview').getAnimations().length"), 0);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.reorder-shifting')).transitionDuration"), '0s');
    await mouse('mouseReleased', reducedEnd.x, reducedEnd.y);
    assert.deepEqual(await evaluate('state.queue.map(track => track.id)'), [reducedIds[1], reducedIds[2], reducedIds[0]]);
    assert.equal(await evaluate("document.querySelectorAll('.reorder-drag-preview, .reorder-source, .reorder-shifting').length"), 0);
    await send('Emulation.setEmulatedMedia', { features: [] });
    console.log('PASS: animated pointer drags and cleanup, reduced motion, library/favorites/playlists/queue, persistence, filtered order, Escape, playback continuity, virtual scrolling (10,000 songs / 1,000 queued), compact layout');
  } finally {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }).catch(() => {});
    await mouse('mouseReleased', 0, 0).catch(() => {});
    await evaluate('audio.pause()').catch(() => {});
    socket.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
