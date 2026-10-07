// Completed deletion markers remain on the server, not in the active cleanup UI.
export function unfinishedCleanupRequests(records) {
  return records.filter(item => item.cleanup_status !== 'completed');
}
