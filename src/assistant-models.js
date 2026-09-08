'use strict';

function assistantModelsEndpoint(baseUrl) {
  let url;
  try { url = new URL(String(baseUrl || '').trim()); } catch {
    throw new Error('请填写有效的模型地址');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('模型地址必须使用 HTTP 或 HTTPS');
  if (url.username || url.password) throw new Error('请在 API Key 输入框中填写密钥');
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  url.pathname = pathname.endsWith('/models') ? pathname : `${pathname}/models`;
  url.hash = '';
  return url.toString();
}

async function fetchAssistantModels({ baseUrl, apiKey = '' }, { timeoutMs = 15000 } = {}) {
  const endpoint = assistantModelsEndpoint(baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    let response;
    try {
      response = await fetch(endpoint, { headers, signal: controller.signal, redirect: 'error' });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error('无法连接模型服务，请检查地址和网络');
    }
    if (!response.ok) {
      const messages = {
        401: 'API Key 无效或已过期，请检查密钥',
        403: '当前 API Key 没有获取模型列表的权限',
        404: '服务未提供模型列表，请检查地址或手动填写模型名',
        429: '请求过于频繁，请稍后重试'
      };
      throw new Error(messages[response.status] || `获取模型失败（HTTP ${response.status}）`);
    }
    let data;
    try { data = await response.json(); } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error('服务未返回有效的模型列表，可手动填写模型名');
    }
    if (!Array.isArray(data?.data)) throw new Error('服务未返回有效的模型列表，可手动填写模型名');
    return [...new Set(data.data.map((model) => typeof model?.id === 'string' ? model.id.trim() : '').filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (controller.signal.aborted) throw new Error('获取模型超时，请检查地址或网络后重试');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { assistantModelsEndpoint, fetchAssistantModels };
