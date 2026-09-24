'use strict';

// Checks actual Windows WM_NCHITTEST results using an isolated, empty profile.
// node tests/runtime-player-drag-smoke.js [packaged executable]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'yuvis-player-drag-'));
  const profile = path.join(artifacts, 'profile');
  // Prevent the app's legacy-profile migration from copying existing local data into QA.
  await fs.mkdir(path.join(profile, 'Local Storage'), { recursive: true });
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const executable = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let child;
  let socket;
  let evaluate;
  let send;
  let appLog = '';

  async function waitFor(expression, message) {
    for (let attempt = 0; attempt < 160; attempt += 1) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    throw new Error(`Timed out: ${message}`);
  }

  async function launch() {
    child = spawn(executable, [
      ...(process.argv[2] ? [] : [root]),
      `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`
    ], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => { appLog += data; });
    child.stderr.on('data', (data) => { appLog += data; });
    let target;
    for (let attempt = 0; attempt < 160; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(500) }).then((response) => response.json());
        target = targets.find((item) => item.url.endsWith('/index.html'));
        if (target) break;
      } catch { /* App is still starting. */ }
      await delay(50);
    }
    assert.ok(target, 'Player opened');
    socket = new WebSocket(target.webSocketDebuggerUrl);
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
    socket.onclose = () => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Player closed')); }
      pending.clear();
    };
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
    evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await waitFor("typeof playbackSessionReady !== 'undefined' && playbackSessionReady", 'startup restoration');
  }

  async function close() {
    if (!child || child.exitCode !== null) return;
    await evaluate('window.desktop.close()').catch(() => {});
    for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt += 1) await delay(50);
    assert.notEqual(child.exitCode, null, 'Player closed normally and flushed its profile');
    socket?.close();
  }


  const hitTestScript = path.join(__dirname, 'native-window-hit-test.ps1');
  // Read-only native hit testing: 2 = HTCAPTION (window drag), 1 = HTCLIENT.
  async function nativeHit(x = 600, y = 20) {
    const { execFile } = require('node:child_process');
    const run = require('node:util').promisify(execFile);
    const result = await run('powershell.exe', ['-NoProfile', '-File', hitTestScript,
      '-TargetProcessId', String(child.pid), '-ClientX', String(Math.round(x)), '-ClientY', String(Math.round(y))],
    { windowsHide: true, timeout: 10000 });
    return Number(result.stdout.trim());
  }

  async function center(selector) {
    return evaluate('(() => { const r = document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
  }

  async function click(selector) {
    const point = await center(selector);
    await send('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount:1});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount:1});
  }

  try {
    await launch();
    assert.equal(await evaluate('state.library.length'), 0);
    assert.equal(await nativeHit(), 2, 'Normal titlebar is a native drag region');
    await evaluate("$('#openNowPlaying').click()");
    await waitFor("document.querySelector('#nowPlayingPage').classList.contains('open')", 'first player open');
    assert.equal(await nativeHit(), 2, 'First open registers a native drag region without playing audio');
    assert.equal(await evaluate('audio.paused && !audio.currentSrc'), true);
    assert.equal(await nativeHit(600, 150), 1, 'Content area stays interactive');
    for (const selector of ['#closeNowPlayingBtn', '#fullscreenLyricsBtn', '[data-now-playing-style="vinyl"]']) {
      const point = await center(selector);
      assert.equal(await nativeHit(point.x, point.y), 1, selector + ' is excluded from native dragging');
    }
    await click('[data-now-playing-style="vinyl"]');
    assert.equal(await evaluate('state.nowPlayingStyle'), 'vinyl');
    assert.equal(await evaluate('state.playerOpen'), true, 'Header controls do not dismiss the page');
    assert.equal(await nativeHit(), 2);
    await click('#closeNowPlayingBtn');
    await waitFor("document.querySelector('#nowPlayingPage').hidden", 'collapse');
    assert.equal(await nativeHit(), 2, 'Normal titlebar restored');
    await evaluate("$('#openNowPlaying').click()");
    await waitFor("document.querySelector('#nowPlayingPage').classList.contains('open')", 'reopen');
    assert.equal(await nativeHit(), 2, 'Reopening remains draggable');
    await click('#fullscreenLyricsBtn');
    await waitFor('state.fullscreenLyrics', 'fullscreen');
    await delay(400);
    assert.equal(await nativeHit(), 1, 'Fullscreen disables native dragging');
    await click('#fullscreenLyricsBtn');
    await waitFor('!state.fullscreenLyrics', 'exit fullscreen');
    await delay(400);
    assert.equal(await nativeHit(), 2, 'Native dragging restored after fullscreen');
    assert.equal(await evaluate('audio.paused && !audio.currentSrc'), true, 'No playback needed throughout');
    console.log('PASS: native first-open drag, button exclusions, style switch, collapse/reopen and fullscreen round trip, without audio');
  } finally {
    await close().catch(() => child?.kill());
  }
}
main().catch(error => {console.error(error);process.exitCode = 1;});
