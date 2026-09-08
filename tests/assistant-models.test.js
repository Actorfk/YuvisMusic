'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { assistantModelsEndpoint, fetchAssistantModels } = require('../src/assistant-models');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('model discovery preserves API prefixes and queries and accepts a completion URL', () => {
  for (const suffix of ['', '/', '/chat/completions', '/chat/completions/', '/models/']) {
    assert.equal(assistantModelsEndpoint(`https://example.test/custom/v1${suffix}?version=1#fragment`), 'https://example.test/custom/v1/models?version=1');
  }
  assert.equal(assistantModelsEndpoint('http://localhost:1234'), 'http://localhost:1234/models');
  for (const invalid of ['', 'not a url', 'file:///private', 'https://user:password@example.test']) {
    assert.throws(() => assistantModelsEndpoint(invalid));
  }
});

test('discovery uses GET and the supplied key, returning all unique model IDs', async () => {
  const requests = [];
  await withServer((req, res) => {
    requests.push({ method: req.method, path: req.url, key: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'z-model' }, null, { id: '' }, { id: 12 }] }));
  }, async (origin) => {
    assert.deepEqual(await fetchAssistantModels({ baseUrl: `${origin}/v1/chat/completions`, apiKey: 'test-only-key' }), ['a-model', 'z-model']);
    await fetchAssistantModels({ baseUrl: `${origin}/v1` });
    assert.deepEqual(requests, [
      { method: 'GET', path: '/v1/models', key: 'Bearer test-only-key' },
      { method: 'GET', path: '/v1/models', key: undefined }
    ]);
  });
});

test('empty lists remain usable and malformed responses report a useful error', async () => {
  await withServer((req, res) => {
    res.end(req.url.startsWith('/empty') ? '{"data":[]}' : req.url.startsWith('/html') ? '<html>Login</html>' : '{"unexpected":[]}');
  }, async (origin) => {
    assert.deepEqual(await fetchAssistantModels({ baseUrl: `${origin}/empty` }), []);
    for (const path of ['html', 'invalid']) {
      await assert.rejects(fetchAssistantModels({ baseUrl: `${origin}/${path}` }), /有效的模型列表/);
    }
  });
});

test('HTTP failures never expose response bodies or credentials', async () => {
  await withServer((req, res) => {
    res.statusCode = Number(req.url.split('/')[1]);
    res.end('private provider response: test-only-key');
  }, async (origin) => {
    for (const [status, message] of [[401, /无效/], [403, /权限/], [404, /未提供模型列表/], [429, /频繁/], [500, /HTTP 500/]]) {
      await assert.rejects(fetchAssistantModels({ baseUrl: `${origin}/${status}`, apiKey: 'test-only-key' }), (error) => {
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /private|test-only-key/);
        return true;
      });
    }
  });
});

test('timeouts include stalled bodies and redirects are not followed with a key', async () => {
  const requests = [];
  await withServer((req, res) => {
    requests.push(req.url);
    if (req.url.startsWith('/redirect')) {
      res.writeHead(302, { Location: '/other/models' });
      res.end();
    } else if (req.url.startsWith('/body')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"data":');
    }
  }, async (origin) => {
    for (const path of ['hang', 'body']) {
      await assert.rejects(fetchAssistantModels({ baseUrl: `${origin}/${path}` }, { timeoutMs: 60 }), /超时/);
    }
    await assert.rejects(fetchAssistantModels({ baseUrl: `${origin}/redirect`, apiKey: 'test-only-key' }), /无法连接/);
    assert.ok(!requests.includes('/other/models'));
  });
});
