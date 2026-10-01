// View-only snapshots: a cached assessment must never authorize an action.
export function createIncidentCache(limit = 8) {
  const entries = new Map();
  return {
    remember(id, data) {
      entries.delete(id);
      entries.set(id, data);
      while (entries.size > limit) entries.delete(entries.keys().next().value);
    },
    preview(id) {
      const data = entries.get(id);
      return data ? { ...data, refreshing: true, assessment_current: false } : null;
    },
    remove: id => entries.delete(id),
    clear: () => entries.clear(),
  };
}
