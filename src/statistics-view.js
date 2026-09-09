window.createStatisticsDashboard = function createStatisticsDashboard({ root, state, escapeHtml: html, formatListeningDuration: duration, formatSize: size, onPlay, onPlaylist }) {
  const api = window.YuvisStatistics;
  const periods = { day: '今天', week: '近 7 天', month: '近 30 天', year: '近 365 天', all: '全部记录' };
  const categories = { listening: '聆听概览', library: '音乐库分析', playlists: '歌单概览' };
  const count = (value) => Math.round(value).toLocaleString('zh-CN');
  const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : '0%';
  let library;
  let report;
  let lastDetailUpdate = 0;

  // Set individual style properties after rendering to respect the app's strict CSP.
  function applyChartStyles(scope = root) {
    scope.querySelectorAll('.stats-trend-bars').forEach((element) => element.style.setProperty('--bar-count', element.children.length));
    scope.querySelectorAll('[data-stat-height]').forEach((element) => { element.style.height = `${element.dataset.statHeight}%`; });
    scope.querySelectorAll('[data-stat-width]').forEach((element) => { element.style.width = `${element.dataset.statWidth}%`; });
  }

  function card(label, value, hint, key = '', primary = false) {
    return `<article class="stats-summary-card ${primary ? 'primary' : ''}"><span>${label}</span><strong${key ? ` data-stat-value="${key}"` : ''}>${value}</strong><small>${hint}</small></article>`;
  }
  function panel(title, note, content, className = '') {
    return `<article class="stats-panel ${className}"><header><h3>${title}</h3><small>${note}</small></header>${content}</article>`;
  }
  function empty(text) {
    return `<div class="stats-empty">${text}</div>`;
  }
  function comparison() {
    if (!report.previous) return '全部已保存的聆听记录';
    const label = state.statsPeriod === 'day' ? '昨天' : `前 ${report.range.length} 天`;
    if (!report.previous.seconds) return report.seconds ? `${label}暂无聆听记录` : `与${label}相同`;
    const difference = (report.seconds - report.previous.seconds) / report.previous.seconds * 100;
    return difference === 0 ? `与${label}相同` : `较${label} ${difference > 0 ? '↑' : '↓'} ${Math.abs(difference).toFixed(1)}%`;
  }
  function listeningValues() {
    return {
      seconds: duration(report.seconds), plays: count(report.plays), tracks: count(report.trackCount), active: count(report.activeDays),
      average: duration(report.averageSeconds), peak: report.peak ? duration(report.peak.seconds) : '暂无记录',
      peakDate: report.peak?.key || '播放音乐后开始记录', comparison: comparison(), dayHint: `天 · 当前范围共 ${count(report.range.length)} 天`
    };
  }
  function trendMarkup() {
    const metric = state.statsTrendMetric;
    const maximum = Math.max(1, ...report.trend.map((item) => item[metric]));
    const label = (item) => item.startKey === item.endKey ? item.startKey : `${item.startKey} 至 ${item.endKey}`;
    const valueLabel = (item) => metric === 'seconds' ? duration(item.seconds) : `${count(item.plays)} 次`;
    const keys = report.trend;
    return `<div class="stats-trend-meta"><span>${report.range.length > 31 ? `每 ${Math.ceil(report.range.length / 12)} 天汇总` : '按日统计'}</span><span>最高 ${valueLabel(keys.reduce((best, item) => item[metric] > best[metric] ? item : best, keys[0]))}</span></div>
      <div class="stats-trend-bars" aria-label="${metric === 'seconds' ? '聆听时长' : '有效播放次数'}趋势">
        ${keys.map((item) => `<button type="button" class="stats-trend-column" aria-label="${label(item)}，${valueLabel(item)}" title="${label(item)}\n${valueLabel(item)}"><i data-stat-height="${item[metric] ? Math.max(2, item[metric] / maximum * 100) : 0}"></i></button>`).join('')}
      </div><div class="stats-trend-labels"><span>${report.range.startKey}</span><span>${report.range.endKey === report.range.startKey ? '' : report.range.endKey}</span></div>
      ${report.seconds ? '' : '<p class="stats-chart-empty">这个时间段还没有聆听记录</p>'}`;
  }
  function rankingMarkup() {
    if (!report.topTracks.length) return empty('听满 1 分钟后，这里会出现歌曲排行');
    return `<div class="stats-song-ranking">${report.topTracks.slice(0, 10).map((item, index) => {
      const track = library.tracksByPath.get(item.key);
      return `<button class="stats-song-row" type="button" ${track ? `data-stats-track="${html(track.id)}"` : 'disabled'} title="${html(item.title)} · ${track ? '点击播放' : '不在当前音乐库'}">
        <span class="stats-song-index">${String(index + 1).padStart(2, '0')}</span><span class="stats-song-name"><strong>${html(item.title)}</strong><small>${html(track?.artist || '不在当前音乐库')}</small></span>
        <span class="stats-song-numbers"><strong>${count(item.plays)} 次</strong><small>${duration(item.seconds)}</small></span></button>`;
    }).join('')}</div>`;
  }
  function distributions(items, total, limit = 6) {
    if (!total) return empty('导入音乐后显示分布');
    return `<div class="stats-distribution">${items.slice(0, limit).map((item) => `<div class="stats-distribution-row"><div><strong title="${html(item.label)}">${html(item.label)}</strong><span>${count(item.count)} 首 <em>${percent(item.count, total)}</em></span></div><i><b data-stat-width="${item.count / total * 100}"></b></i></div>`).join('')}</div>`;
  }
  function listeningBody() {
    const values = listeningValues();
    return `<div class="stats-summary-grid">
      ${card('聆听时长', values.seconds, `<span data-stat-value="comparison">${values.comparison}</span>`, 'seconds', true)}
      ${card('有效播放', values.plays, '次 · 单次播放满 1 分钟', 'plays')}
      ${card('听过的歌曲', values.tracks, '首 · 按有效记录去重', 'tracks')}
      ${card('活跃天数', values.active, `<span data-stat-value="dayHint">${values.dayHint}</span>`, 'active')}
    </div><div class="stats-listening-grid">
      ${panel('聆听趋势', `<label class="stats-select-label">指标 <select data-stats-trend aria-label="趋势图统计指标"><option value="seconds" ${state.statsTrendMetric === 'seconds' ? 'selected' : ''}>聆听时长</option><option value="plays" ${state.statsTrendMetric === 'plays' ? 'selected' : ''}>有效播放</option></select></label>`, `<div id="statsTrend">${trendMarkup()}</div><div class="stats-listening-insights"><div><span>日均聆听</span><strong data-stat-value="average">${values.average}</strong><small>按范围内全部天数计算</small></div><div><span>最高单日</span><strong data-stat-value="peak">${values.peak}</strong><small data-stat-value="peakDate">${values.peakDate}</small></div></div>`, 'stats-trend-panel')}
      ${panel('最常听的歌曲', 'TOP 10 · 按有效播放次数', `<div id="statsSongRanking">${rankingMarkup()}</div>`)}
    </div><p class="stats-method-note">聆听时长从播放第一秒累计；单次播放满 1 分钟计 1 次有效播放。歌曲数按有效记录去重，排行榜时长仅统计达标播放，可能少于总聆听时长。时间范围按本地日期计算，包含今天。</p>`;
  }
  function libraryBody() {
    return `<div class="stats-summary-grid">
      ${card('本地歌曲', count(library.count), '首 · 当前音乐库', '', true)}
      ${card('乐库总时长', duration(library.seconds), '全部歌曲完整播放一遍')}
      ${card('音乐文件大小', size(library.bytes), '已导入文件合计，不代表磁盘使用率')}
      ${card('喜欢的音乐', count(library.favoriteCount), `首 · 占当前音乐库 ${percent(library.favoriteCount, library.count)}`)}
    </div><div class="stats-collection-facts"><span><strong>${count(library.artists.length)}</strong> 个艺术家标签</span><span><strong>${count(library.albums.length)}</strong> 张专辑</span><span><strong>${count(library.formats.length)}</strong> 种文件格式</span><span>平均歌曲时长 <strong>${duration(library.averageDuration)}</strong></span></div>
    <div class="stats-panel-grid">
      ${panel('艺术家分布', 'TOP 6 · 收录数量 / 乐库占比', distributions(library.artists, library.count))}
      ${panel('专辑分布', 'TOP 6 · 按艺术家与专辑分组', distributions(library.albums, library.count))}
      ${panel('音频文件格式', '按文件扩展名分类', distributions(library.formats, library.count, 20))}
      ${panel('歌曲时长分布', '收录数量 / 乐库占比', distributions(library.durationGroups.map(([label, count]) => ({ label, count })), library.count))}
    </div><p class="stats-method-note">此分类展示当前音乐库，不受聆听时间范围影响。缺失的艺术家、专辑、格式或时长单独标为未知；平均时长仅计算已知时长的歌曲。</p>`;
  }
  function playlistsBody() {
    return `<div class="stats-summary-grid">
      ${card('我的歌单', count(library.playlistRows.length), '个 · 当前保存的歌单', '', true)}
      ${card('歌单收录总数', count(library.playlistEntries), '首 · 包含跨歌单重复收录')}
      ${card('覆盖乐库歌曲', count(library.coveredCount), `首 · 乐库覆盖率 ${percent(library.coveredCount, library.count)}`)}
      ${card('空歌单', count(library.emptyPlaylists), `个 · 还有 ${count(Math.max(0, library.count - library.coveredCount))} 首乐库歌曲未加入歌单`)}
    </div>${panel('歌单收录情况', '按收录数量排列 · 点击打开歌单', library.playlistRows.length ? `<div class="stats-playlist-table"><div class="stats-playlist-head"><span>歌单名称</span><span>收录歌曲</span><span>可用时长</span><span>当前乐库未收录</span></div>${library.playlistRows.map((row) => `<button class="stats-playlist-row" type="button" data-stats-playlist="${html(row.id)}"><strong title="${html(row.name)}">${html(row.name)}</strong><span>${count(row.count)} 首</span><span>${duration(row.seconds)}</span><span class="${row.missing ? 'stats-missing' : ''}">${count(row.missing)} 首</span></button>`).join('')}</div>` : empty('创建歌单后，可以在这里查看收录情况'), 'stats-playlists-panel')}
    <p class="stats-method-note">覆盖歌曲按文件路径去重；歌单时长只合计当前音乐库中可用的歌曲。“当前乐库未收录”表示没有匹配到乐库记录，不代表本地文件已被删除。</p>`;
  }
  function render() {
    library = api.libraryReport(state.library, state.favorites, state.playlists);
    report = api.listeningReport(state.listeningStats, state.statsPeriod);
    root.innerHTML = `<div class="stats-toolbar"><div class="stats-category-tabs" role="tablist" aria-label="统计分类">${Object.entries(categories).map(([key, label]) => `<button type="button" id="statsTab-${key}" data-stats-category="${key}" role="tab" aria-selected="${key === state.statsCategory}" aria-controls="statsContent" tabindex="${key === state.statsCategory ? 0 : -1}">${label}</button>`).join('')}</div><span class="stats-local-note">本机记录 · 实时更新</span></div>
      <div class="stats-range-toolbar" ${state.statsCategory !== 'listening' ? 'hidden' : ''}><div class="stats-period-buttons" role="group" aria-label="聆听时间范围">${Object.entries(periods).map(([key, label]) => `<button type="button" data-stats-period="${key}" aria-pressed="${key === state.statsPeriod}">${label}</button>`).join('')}</div><span id="statsDateRange">${report.range.startKey} — ${report.range.endKey}</span></div>
      <div id="statsContent" role="tabpanel" aria-labelledby="statsTab-${state.statsCategory}">${state.statsCategory === 'listening' ? listeningBody() : state.statsCategory === 'library' ? libraryBody() : playlistsBody()}</div>`;
    applyChartStyles();
    lastDetailUpdate = Date.now();
  }
  function update() {
    if (state.statsCategory !== 'listening') return;
    if (!root.querySelector('[data-stat-value="seconds"]')) return render();
    report = api.listeningReport(state.listeningStats, state.statsPeriod);
    const values = listeningValues();
    root.querySelectorAll('[data-stat-value]').forEach((element) => { element.textContent = values[element.dataset.statValue]; });
    root.querySelector('#statsDateRange').textContent = `${report.range.startKey} — ${report.range.endKey}`;
    if (Date.now() - lastDetailUpdate < 5000) return;
    for (const [selector, markup] of [['#statsTrend', trendMarkup()], ['#statsSongRanking', rankingMarkup()]]) {
      const element = root.querySelector(selector);
      if (!element.contains(document.activeElement)) {
        element.innerHTML = markup;
        applyChartStyles(element);
      }
    }
    lastDetailUpdate = Date.now();
  }
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.statsCategory) {
      state.statsCategory = button.dataset.statsCategory;
      render();
      root.querySelector(`[data-stats-category="${state.statsCategory}"]`).focus({ preventScroll: true });
    } else if (button.dataset.statsPeriod) {
      state.statsPeriod = button.dataset.statsPeriod;
      render();
      root.querySelector(`[data-stats-period="${state.statsPeriod}"]`).focus({ preventScroll: true });
    } else if (button.dataset.statsTrack) onPlay(button.dataset.statsTrack);
    else if (button.dataset.statsPlaylist) onPlaylist(button.dataset.statsPlaylist);
  });
  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-stats-trend]')) return;
    state.statsTrendMetric = event.target.value;
    root.querySelector('#statsTrend').innerHTML = trendMarkup();
    applyChartStyles();
  });
  root.addEventListener('keydown', (event) => {
    const current = event.target.closest('[data-stats-category]');
    if (!current || event.ctrlKey || event.altKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const keys = Object.keys(categories);
    const index = keys.indexOf(current.dataset.statsCategory);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    root.querySelector(`[data-stats-category="${keys[next]}"]`).click();
  });
  return { render, update };
};
