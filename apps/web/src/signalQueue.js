export function deliveryRows(drafts, onlyId = null, nextOnly = false) {
  const rows = drafts.filter(row => row.status !== 'accepted' && (onlyId ? row.id === onlyId : row.checked));
  return nextOnly ? rows.slice(0, 1) : rows;
}
