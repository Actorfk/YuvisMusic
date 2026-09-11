'use strict';

// Uses an isolated profile and generated silent WAVs; never reads the user's library.
// node tests/runtime-playback-session-smoke.js [packaged executable]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'yuvis-playback-session-'));
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

  async function seedForNextLaunch(value) {
    await evaluate(`playbackSessionReady = false; playbackSessionChanged = false;
      localStorage.setItem('playbackSession', ${JSON.stringify(typeof value === 'string' ? value : JSON.stringify(value))});`);
    await close();
    await launch();
  }

  try {
    const paths = [];
    for (const title of ['Alpha', 'Bravo', 'Charlie']) {
      const pcmBytes = 8000 * 2 * 60;
      const wav = Buffer.alloc(44 + pcmBytes);
      wav.write('RIFF'); wav.writeUInt32LE(36 + pcmBytes, 4); wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcmBytes, 40);
      const file = path.join(artifacts, `${title}.wav`);
      await fs.writeFile(file, wav);
      paths.push(file);
    }
    await launch();
    assert.equal(await evaluate('state.library.length'), 0, 'Isolated profile starts with an empty library');
    await evaluate(`(async () => { mergeTracks(await window.desktop.restoreTracks(${JSON.stringify(paths)}));
      state.muted = true; applyPlaybackSettings();
      state.queue = [state.library[2], state.library[0], state.library[1]];
      loadTrack(state.library[0]); })()`);
    await waitFor('audio.readyState >= 1 && !audio.paused && !pendingPlaybackSeek', 'real audio playback');
    await evaluate('audio.currentTime = 12.75; audio.pause();');
    await waitFor("!audio.seeking && JSON.parse(localStorage.playbackSession).position >= 12.75", 'seek saved');
    const expected = await evaluate('({ history: state.history, stats: state.listeningStats, position: audio.currentTime })');
    await close();
    await launch();
    await waitFor('audio.readyState >= 1 && !pendingPlaybackSeek && !audio.seeking', 'restored metadata and seek');
    const restored = await evaluate(`({ title: currentTrack()?.title, queue: state.queue.map(track => track.title), position: audio.currentTime, paused: audio.paused, history: state.history, stats: state.listeningStats, timeText: $('#currentTime').textContent })`);
    assert.equal(restored.title, 'Alpha');
    assert.deepEqual(restored.queue, ['Charlie', 'Alpha', 'Bravo']);
    assert.ok(Math.abs(restored.position - expected.position) < .15);
    assert.equal(restored.paused, true);
    assert.deepEqual(restored.history, expected.history);
    assert.deepEqual(restored.stats, expected.stats);
    assert.equal(restored.timeText, '0:12');
    console.log('PASS: full process restart restores song, fractional position and queue without autoplay or extra statistics');

    await evaluate("executeAssistantTool('remove_from_queue', { query: 'Alpha' })");
    assert.deepEqual(await evaluate('JSON.parse(localStorage.playbackSession).queuePaths'), [paths[2], paths[1]]);
    await evaluate("$('#clearQueueBtn').click(); audio.currentTime = 18.25;");
    await waitFor('!audio.seeking', 'second seek');
    await evaluate('attemptPlayback()');
    await close();
    await launch();
    await waitFor('audio.readyState >= 1 && !pendingPlaybackSeek && !audio.seeking', 'empty queue current song restore');
    assert.deepEqual(await evaluate('state.queue'), []);
    assert.equal(await evaluate('currentTrack().title'), 'Alpha');
    assert.equal(await evaluate('audio.paused'), true);
    assert.ok(await evaluate('audio.currentTime >= 18.25 && audio.currentTime < 20'));
    const resumedAt = await evaluate('audio.currentTime');
    await evaluate("$('#playPauseBtn').click()");
    await waitFor(`!audio.paused && audio.currentTime > ${resumedAt + .2}`, 'continue from restored position');
    await evaluate('audio.pause()');
    console.log('PASS: closing while playing saves progress; cleared queue stays empty; play resumes from saved position');

    await evaluate('loadTrack(state.library[0], false, { restoring: true, position: 40 }); loadTrack(state.library[1], false);');
    await waitFor('audio.readyState >= 1 && !pendingPlaybackSeek && !audio.seeking', 'track switch during pending restore seek');
    assert.equal(await evaluate('currentTrack().title'), 'Bravo');
    assert.equal(await evaluate('audio.currentTime'), 0);
    assert.equal(await evaluate('JSON.parse(localStorage.playbackSession).position'), 0);

    await seedForNextLaunch({ version: 1, queuePaths: [paths[2], path.join(artifacts, 'missing.wav'), paths[1]], currentPath: path.join(artifacts, 'missing.wav'), position: 20 });
    assert.equal(await evaluate('state.currentId'), null);
    assert.deepEqual(await evaluate('state.queue.map(track => track.title)'), ['Charlie', 'Bravo']);
    assert.equal(await evaluate("$('#playbackErrorModal').hidden"), true);
    await seedForNextLaunch('{broken json');
    assert.equal(await evaluate('state.currentId'), null);
    assert.equal(await evaluate('state.queue.length'), 0);
    await seedForNextLaunch({ version: 1, queuePaths: [paths[0]], currentPath: paths[0], position: 60 });
    await waitFor('audio.readyState >= 1 && !pendingPlaybackSeek && !audio.seeking', 'completed song restore');
    assert.equal(await evaluate('audio.currentTime'), 0);
    assert.equal(await evaluate('audio.paused'), true);
    console.log('PASS: missing files, malformed saved data and completed tracks restore safely');

    await evaluate("openSettings('playback')");
    await send('Emulation.setDeviceMetricsOverride', { width: 1040, height: 680, deviceScaleFactor: 1, mobile: false });
    await delay(350);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(artifacts, 'playback-settings-compact.png'), Buffer.from(shot.data, 'base64'));
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ executable, restored, passed: true }, null, 2));
    await close();
    console.log(`Artifacts: ${artifacts}`);
  } finally {
    if (child && child.exitCode === null) {
      await close().catch(() => child.kill());
    }
    socket?.close();
    await fs.writeFile(path.join(artifacts, 'electron.log'), appLog);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
