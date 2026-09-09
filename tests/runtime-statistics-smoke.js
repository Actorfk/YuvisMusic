'use strict';

// Use an isolated Electron profile. Arguments: CDP port and screenshot directory.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const port = Number(process.argv[2] || 9335);
const directory = path.resolve(process.argv[3]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) }).then((response) => response.json());
  const target = targets.find((item) => item.url.endsWith('/index.html'));
  assert.ok(target);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  let sequence = 0;
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const screenshot = async (name) => {
    await delay(80);
    const image = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(directory, `${name}.png`), Buffer.from(image.data, 'base64'));
  };
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const category = (name) => click(`[data-stats-category="${name}"]`);
  const period = (name) => click(`[data-stats-period="${name}"]`);
  const metric = (key) => evaluate(`document.querySelector('[data-stat-value="${key}"]').textContent`);
  try {
    await fs.mkdir(directory, { recursive: true });
    await send('Page.reload');
    await delay(400);
    await evaluate(`(() => {
      audio.pause(); closeModals();
      const titles = ['晴天', '夜曲', '稻香', '七里香', '红豆', '匆匆那年', '十年', '好久不见', '慢慢喜欢你', '忽然之间', '平凡之路', '那些花儿'];
      const artists = ['周杰伦', '王菲', '陈奕迅', '莫文蔚'];
      const formats = ['mp3', 'flac', 'wav', 'm4a'];
      setLibrary(Array.from({ length: 24 }, (_, index) => ({
        id: 'stats-' + index, path: 'C:/Statistics/' + index + '.' + formats[index % 4], title: titles[index % 12], artist: artists[index % 4],
        album: '精选专辑 ' + index % 6, duration: index === 23 ? 0 : 145 + index * 13, size: (index % 4 + 1) * 6 * 1024 * 1024, modifiedAt: Date.now(), cover: null, coverState: 'none'
      })));
      state.favorites = new Set(state.library.slice(0, 7).map(track => track.id));
      state.playlists = [
        { id: 'study', name: '安静的午后 · 学习与专注', trackPaths: state.library.slice(0, 12).map(track => track.path) },
        { id: 'drive', name: '沿途的风 · 公路歌单', trackPaths: [...state.library.slice(8, 18).map(track => track.path), 'C:/Old/missing.mp3'] },
        { id: 'empty', name: '下一次旅行', trackPaths: [] }
      ];
      const days = {};
      for (let index = 0; index < 30; index++) {
        const date = new Date(); date.setDate(date.getDate() - index);
        const key = localDateKey(date);
        const track = state.library[index % 12];
        const seconds = (index % 6 + 1) * 300;
        const plays = index === 10 ? 12 : index % 5 + 1;
        days[key] = { seconds, plays, tracks: { [index === 10 ? 'C:/Old/removed.mp3' : track.path]: { title: index === 10 ? '未收录的旧歌曲' : track.title, seconds, plays, valid: true } } };
      }
      state.listeningStats = { days }; state.statsCategory = 'listening'; state.statsPeriod = 'week'; state.statsTrendMetric = 'seconds'; state.view = 'stats'; renderView();
    })()`);
    assert.equal(await metric('seconds'), '1 小时 50 分');
    assert.equal(await metric('plays'), '18');
    assert.equal(await metric('tracks'), '7');
    assert.equal(await metric('active'), '7');
    assert.equal(await evaluate("document.querySelectorAll('.stats-trend-column').length"), 7);
    assert.ok(await evaluate("[...document.querySelectorAll('.stats-trend-column i')].some(bar => bar.getBoundingClientRect().height > 20)"), 'Nonempty data renders actual visible bars');
    assert.equal(await evaluate("listeningPeriodSummary('week').seconds"), 6600, 'Existing assistant totals remain compatible');
    await screenshot('listening-week');
    await period('day');
    assert.equal(await metric('seconds'), '5 分 0 秒');
    assert.equal(await metric('plays'), '1');
    await period('month');
    assert.equal(await evaluate("document.querySelectorAll('.stats-trend-column').length"), 30);
    assert.ok(await evaluate("document.querySelector('.stats-song-row:disabled').textContent.includes('未收录的旧歌曲')"));
    await evaluate("document.querySelector('[data-stats-trend]').value = 'plays'; document.querySelector('[data-stats-trend]').dispatchEvent(new Event('change', { bubbles: true }));");
    assert.ok(await evaluate("document.querySelector('.stats-trend-column').title.includes('次')"));
    await period('year');
    assert.ok(await evaluate("document.querySelectorAll('.stats-trend-column').length") <= 12);
    await period('all');
    assert.equal(await evaluate("document.querySelectorAll('.stats-trend-column').length"), 30);
    await period('week');
    await evaluate(`(() => {
      window.qaFocusedRanking = document.querySelector('[data-stats-track]'); qaFocusedRanking.focus();
      const original = Date.now;
      Date.now = () => original() + 6000;
      state.listeningStats.days[localDateKey()].seconds += 1;
      updateLiveStatistics();
      Date.now = original;
    })()`);
    assert.equal(await evaluate('document.activeElement === qaFocusedRanking'), true, 'Live update preserves keyboard focus');
    assert.equal(await evaluate("document.querySelector('#statsDateRange').textContent.includes(localDateKey())"), true);
    await evaluate(`(() => { const original = loadTrack; window.qaPlayed = null; loadTrack = (track) => { window.qaPlayed = track.id; }; document.querySelector('[data-stats-track]').click(); loadTrack = original; })()`);
    assert.ok((await evaluate('window.qaPlayed')).startsWith('stats-'));

    await category('library');
    assert.equal(await evaluate("document.querySelector('.stats-range-toolbar').hidden"), true);
    assert.equal(await evaluate("document.querySelectorAll('.stats-panel').length"), 4);
    assert.ok(await evaluate("[...document.querySelectorAll('.stats-distribution-row b')].some(bar => bar.getBoundingClientRect().width > 20)"));
    assert.ok(await evaluate("document.querySelector('#statsContent').textContent.includes('时长未知')"));
    await screenshot('library-analysis');
    await category('playlists');
    assert.equal(await evaluate("document.querySelectorAll('.stats-playlist-row').length"), 3);
    assert.equal(await evaluate("document.querySelector('.stats-missing').textContent"), '1 首');
    await screenshot('playlist-analysis');
    await click('[data-stats-playlist="study"]');
    assert.equal(await evaluate('state.view'), 'playlist');
    assert.equal(await evaluate('state.activePlaylistId'), 'study');
    await evaluate("state.view = 'stats'; renderView();");
    await category('library');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    assert.equal(await evaluate('state.statsCategory'), 'playlists');
    await send('Emulation.setDeviceMetricsOverride', { width: 1040, height: 680, deviceScaleFactor: 1, mobile: false });
    for (const name of ['listening', 'library', 'playlists']) {
      await category(name);
      const overflow = await evaluate("(() => { const content = document.querySelector('.main-content'); return { body: document.documentElement.scrollWidth > innerWidth, content: content.scrollWidth > content.clientWidth + 1 }; })()");
      assert.deepEqual(overflow, { body: false, content: false }, `${name} fits compact window`);
      await screenshot(`compact-${name}`);
    }
    await send('Emulation.clearDeviceMetricsOverride');
    await evaluate("setLibrary([]); state.playlists = []; state.favorites = new Set(); state.listeningStats = { days: {} }; state.statsPeriod = 'week'; state.statsCategory = 'listening'; renderStatistics();");
    assert.equal(await metric('seconds'), '0 秒');
    assert.equal(await metric('plays'), '0');
    assert.ok(await evaluate("document.querySelector('#statsContent').textContent.includes('还没有聆听记录')"));
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.stats-trend-column i')].map(bar => bar.style.height)"), Array(7).fill('0%'));
    await screenshot('empty-listening');
    for (const name of ['library', 'playlists']) {
      await category(name);
      assert.equal(await evaluate("/NaN|Infinity|undefined/.test(document.querySelector('#statsContent').textContent)"), false);
    }
    await evaluate(`state.library = [{ id: 'unsafe', path: 'C:/a.mp3', title: '<img src=x onerror=alert(1)>', artist: '<script>bad</script>', album: 'Missing', duration: 0 }]; rebuildTrackIndex(); state.statsCategory = 'library'; renderStatistics();`);
    assert.equal(await evaluate("document.querySelectorAll('#statsContent script, #statsContent img').length"), 0);
    console.log('PASS: period totals, trends, rankings, live update focus, actions, categories, compact layout, zero/unknown data, safe labels');
  } finally { socket.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
