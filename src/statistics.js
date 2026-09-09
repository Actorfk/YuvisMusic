(function exposeStatistics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YuvisStatistics = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';
  const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const pathKey = (value) => String(value || '').replaceAll('/', '\\').toLowerCase();
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function parseDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return dateKey(date) === key ? date : null;
  }
  function offsetDate(date, offset) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() + offset);
    return result;
  }
  function listeningRange(period, days = {}, now = new Date()) {
    const end = offsetDate(now, 0);
    const endKey = dateKey(end);
    const count = { day: 1, week: 7, month: 30, year: 365 }[period] || 7;
    const first = Object.keys(days).filter((key) => key <= endKey && parseDate(key)).sort()[0];
    const start = period === 'all' ? (parseDate(first || '') || end) : offsetDate(end, 1 - count);
    const length = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
    return { start, end, startKey: dateKey(start), endKey, length,
      previousStart: period === 'all' ? null : dateKey(offsetDate(start, -length)),
      previousEnd: period === 'all' ? null : dateKey(offsetDate(start, -1)) };
  }
  function aggregateDays(days, startKey, endKey) {
    const tracks = new Map();
    const result = { seconds: 0, plays: 0, activeDays: 0, peak: null };
    for (const key of Object.keys(days).sort()) {
      if (key < startKey || key > endKey || !parseDate(key)) continue;
      const day = days[key];
      if (!day || typeof day !== 'object') continue;
      const seconds = number(day.seconds);
      result.seconds += seconds;
      result.plays += number(day.plays);
      if (seconds > 0) result.activeDays += 1;
      if (seconds > (result.peak?.seconds || 0)) result.peak = { key, seconds };
      for (const [rawKey, track] of Object.entries(day.tracks || {})) {
        if (!track || typeof track !== 'object') continue;
        const seconds = number(track.seconds);
        const plays = number(track.plays);
        if (!track.valid && seconds < 60 && plays === 0) continue;
        const key = pathKey(rawKey);
        const value = tracks.get(key) || { key, title: '未知歌曲', seconds: 0, plays: 0 };
        value.title = String(track.title || value.title);
        value.seconds += seconds;
        value.plays += plays;
        tracks.set(key, value);
      }
    }
    const topTracks = [...tracks.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds || a.title.localeCompare(b.title, 'zh-CN'));
    return { ...result, tracks, topTracks, trackCount: tracks.size };
  }
  function listeningReport(stats, period = 'week', now = new Date()) {
    const days = stats?.days || {};
    const range = listeningRange(period, days, now);
    const selected = aggregateDays(days, range.startKey, range.endKey);
    const previous = range.previousStart ? aggregateDays(days, range.previousStart, range.previousEnd) : null;
    const step = range.length <= 31 ? 1 : Math.ceil(range.length / 12);
    const trend = [];
    for (let index = 0; index < range.length; index += step) {
      const startKey = dateKey(offsetDate(range.start, index));
      const endKey = dateKey(offsetDate(range.start, Math.min(index + step - 1, range.length - 1)));
      let seconds = 0, plays = 0;
      for (let day = index; day < Math.min(index + step, range.length); day += 1) {
        const item = days[dateKey(offsetDate(range.start, day))];
        seconds += number(item?.seconds);
        plays += number(item?.plays);
      }
      trend.push({ startKey, endKey, seconds, plays });
    }
    return { ...selected, range, previous, trend, averageSeconds: selected.seconds / range.length };
  }
  function libraryReport(library, favorites = new Set(), playlists = []) {
    const tracksByPath = new Map(library.map((track) => [pathKey(track.path), track]));
    const artists = new Map(), albums = new Map(), formats = new Map();
    const durationGroups = [ ['3 分钟以内', 0], ['3–5 分钟', 0], ['5 分钟以上', 0], ['时长未知', 0] ];
    let seconds = 0, bytes = 0, favoriteCount = 0, knownDurationCount = 0;
    const add = (map, key, label = key) => {
      const item = map.get(key) || { label, count: 0 };
      item.count += 1;
      map.set(key, item);
    };
    for (const track of library) {
      const duration = number(track.duration);
      seconds += duration;
      bytes += number(track.size);
      if (duration) knownDurationCount += 1;
      if (favorites.has(track.id)) favoriteCount += 1;
      add(artists, track.artist || '未知艺术家');
      const album = track.album || '未知专辑';
      const artist = track.artist || '未知艺术家';
      add(albums, `${artist}\0${album}`, `${album} · ${artist}`);
      const extension = /\.([a-z0-9]+)$/i.exec(track.path || '')?.[1].toUpperCase() || '未知格式';
      add(formats, extension);
      durationGroups[duration === 0 ? 3 : duration < 180 ? 0 : duration <= 300 ? 1 : 2][1] += 1;
    }
    const sort = (map) => [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
    const covered = new Set();
    const playlistRows = playlists.map((playlist) => {
      const keys = new Set((playlist.trackPaths || []).map(pathKey).filter(Boolean));
      let available = 0, seconds = 0;
      for (const key of keys) {
        const track = tracksByPath.get(key);
        if (!track) continue;
        covered.add(key);
        available += 1;
        seconds += number(track.duration);
      }
      return { id: playlist.id, name: playlist.name, count: keys.size, available, missing: keys.size - available, seconds };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    return { count: library.length, seconds, bytes, favoriteCount, artists: sort(artists), albums: sort(albums), formats: sort(formats), durationGroups,
      averageDuration: knownDurationCount ? seconds / knownDurationCount : 0, tracksByPath,
      playlistRows, coveredCount: covered.size, emptyPlaylists: playlistRows.filter((row) => row.count === 0).length,
      playlistEntries: playlistRows.reduce((sum, row) => sum + row.count, 0) };
  }
  return { listeningRange, listeningReport, aggregateDays, libraryReport, pathKey };
}));
