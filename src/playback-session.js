(function exposePlaybackSession(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YuvisPlaybackSession = api;
})(typeof globalThis === 'undefined' ? null : globalThis, () => {
  const pathKey = (value) => value.replaceAll('/', '\\').toLocaleLowerCase('en-US');

  function normalizePlaybackSession(value) {
    if (!value || value.version !== 1) return null;
    const seen = new Set();
    const queuePaths = (Array.isArray(value.queuePaths) ? value.queuePaths : []).filter((item) => {
      if (typeof item !== 'string' || !item.trim() || seen.has(pathKey(item))) return false;
      seen.add(pathKey(item));
      return true;
    });
    return {
      version: 1,
      queuePaths,
      currentPath: typeof value.currentPath === 'string' && value.currentPath.trim() ? value.currentPath : null,
      position: Number.isFinite(value.position) && value.position >= 0 ? value.position : 0
    };
  }

  function resolvePlaybackSession(value, tracks) {
    const session = normalizePlaybackSession(value);
    const byPath = new Map(tracks.map((track) => [pathKey(track.path), track]));
    return {
      queue: session ? session.queuePaths.map((item) => byPath.get(pathKey(item))).filter(Boolean) : [],
      currentTrack: session?.currentPath ? byPath.get(pathKey(session.currentPath)) || null : null,
      position: session?.position || 0
    };
  }

  function restoredPlaybackPosition(position, duration) {
    if (!Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration <= 0) return 0;
    // A completed track should be ready to play again, without triggering auto-next on startup.
    return position >= duration ? 0 : position;
  }

  return Object.freeze({ normalizePlaybackSession, resolvePlaybackSession, restoredPlaybackPosition });
});
