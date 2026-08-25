(function exposeTrackIdentity(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YuvisTrackIdentity = api;
})(typeof globalThis === 'undefined' ? null : globalThis, () => {
  const WINDOWS_ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\)/i;
  const LEGACY_MTIME_SUFFIX = /^(.*):(\d+(?:\.\d+)?)$/;

  function stableTrackId(filePath) {
    return String(filePath || '').replaceAll('/', '\\').toLocaleLowerCase('en-US');
  }

  function migrateLegacyTrackId(trackId) {
    if (typeof trackId !== 'string') return '';
    const legacyMatch = trackId.match(LEGACY_MTIME_SUFFIX);
    if (legacyMatch && WINDOWS_ABSOLUTE_PATH.test(legacyMatch[1])) return stableTrackId(legacyMatch[1]);
    return WINDOWS_ABSOLUTE_PATH.test(trackId) ? stableTrackId(trackId) : trackId;
  }

  function migrateStoredTrackIds(trackIds) {
    const seen = new Set();
    const migrated = [];
    for (const trackId of Array.isArray(trackIds) ? trackIds : []) {
      const stableId = migrateLegacyTrackId(trackId);
      if (!stableId || seen.has(stableId)) continue;
      seen.add(stableId);
      migrated.push(stableId);
    }
    return migrated;
  }

  return Object.freeze({ stableTrackId, migrateLegacyTrackId, migrateStoredTrackIds });
});
