'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

const port = Number(process.argv[2] || 9333);
const screenshotPath = process.argv[3] || '';

async function waitForTarget(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'));
      if (target?.webSocketDebuggerUrl) return target;
    } catch { /* Electron is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for Electron on port ${port}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  const target = await waitForTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  try {
    const initial = await client.evaluate(`(async () => {
      if (document.readyState !== 'complete') await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
      const status = await window.desktop.getLibraryCacheStatus();
      return { title: document.title, status, virtualApi: typeof window.YuvisVirtualList?.computeVirtualWindow };
    })()`);
    assert.equal(initial.virtualApi, 'function');
    assert.equal(typeof initial.status.totalBytes, 'number');

    const libraryResult = await client.evaluate(`(() => {
      const tracks = Array.from({ length: 10000 }, (_, index) => ({
        id: 'perf-' + index,
        path: 'C:\\\\Perf\\\\song-' + index + '.mp3',
        url: 'file:///C:/Perf/song-' + index + '.mp3',
        title: 'Song ' + String(index).padStart(5, '0'),
        artist: 'Artist ' + index % 100,
        album: 'Album ' + index % 50,
        duration: 180,
        modifiedAt: 1700000000000 + index,
        cover: null,
        coverState: 'none',
        lyrics: null,
        lyricsState: 'idle',
        size: 1024
      }));
      const startedAt = performance.now();
      setLibrary(tracks);
      state.view = 'library';
      state.search = '';
      renderView();
      return {
        renderMs: performance.now() - startedAt,
        rows: document.querySelectorAll('#trackList [data-track-id]').length,
        summary: document.querySelector('#trackSummary').textContent,
        indexed: state.trackById.size === 10000 && state.trackByPath.size === 10000
      };
    })()`);
    assert.equal(libraryResult.summary, '10000 首歌曲');
    assert.equal(libraryResult.indexed, true);
    assert.ok(libraryResult.rows < 100, `Expected fewer than 100 rendered rows, received ${libraryResult.rows}`);

    const scrollResult = await client.evaluate(`(async () => {
      const scroller = document.querySelector('.main-content');
      const list = document.querySelector('#trackList');
      const listTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = listTop + 6200;
      scroller.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rows = [...list.querySelectorAll('[data-track-index]')];
      return { rows: rows.length, firstIndex: Number(rows[0]?.dataset.trackIndex), scrollHeight: scroller.scrollHeight };
    })()`);
    assert.ok(scrollResult.rows < 100);
    assert.ok(scrollResult.firstIndex >= 80 && scrollResult.firstIndex <= 100, `Unexpected virtual scroll result ${JSON.stringify(scrollResult)}`);

    const queueResult = await client.evaluate(`(async () => {
      state.queue = state.library.slice(0, 1000);
      renderQueue();
      const list = document.querySelector('#queueList');
      list.scrollTop = 12000;
      list.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { rows: list.querySelectorAll('[data-queue-id]').length, scrollHeight: list.scrollHeight };
    })()`);
    assert.ok(queueResult.rows < 100);
    assert.ok(queueResult.scrollHeight >= 59000);

    const searchResult = await client.evaluate(`(async () => {
      const input = document.querySelector('#searchInput');
      input.value = 'Song 09999';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      return {
        summary: document.querySelector('#trackSummary').textContent,
        rows: document.querySelectorAll('#trackList [data-track-id]').length
      };
    })()`);
    assert.deepEqual(searchResult, { summary: '1 首歌曲', rows: 1 });

    const cacheResult = await client.evaluate(`(async () => {
      openSettings('storage');
      await new Promise((resolve) => setTimeout(resolve, 100));
      document.querySelector('#cleanLibraryCacheBtn').click();
      while (document.querySelector('#cleanLibraryCacheBtn').disabled) await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        size: document.querySelector('#cacheSizeValue').textContent,
        detail: document.querySelector('#cacheDetailValue').textContent
      };
    })()`);
    assert.match(cacheResult.detail, /元数据/);

    if (screenshotPath) {
      const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    }

    process.stdout.write(`${JSON.stringify({ initial, libraryResult, scrollResult, queueResult, searchResult, cacheResult }, null, 2)}\n`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
