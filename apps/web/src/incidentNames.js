export function incidentName(item = {}) {
  return item.name || `Incident ${String(item.incident_id || '').slice(0, 8).toUpperCase()}`;
}
export function incidentLabel(item = {}) {
  const date = item.created_at ? new Date(item.created_at) : null;
  return [incidentName(item), date && !Number.isNaN(date.valueOf()) ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
    (item.status || 'processing').replaceAll('_', ' ')].filter(Boolean).join(' · ');
}
