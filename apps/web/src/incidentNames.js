export function incidentName(item = {}) {
  item ||= {};
  if (item.name && !/^Incident\s+[\da-f-]+$/i.test(item.name)) return item.name;
  const hazard = ({ fire_gas: 'Smoke / gas reports', water_leak: 'Water leak', security: 'Security activity', medical_sos: 'Medical alert', severe_weather: 'Weather alert' })[item.hazard_family];
  if (hazard) return hazard;
  const date = item.created_at && new Date(item.created_at);
  if (date && !Number.isNaN(date.valueOf())) return 'Report · ' + date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return 'Saved report';
}
export function incidentLabel(item = {}) {
  item ||= {};
  const date = item.created_at ? new Date(item.created_at) : null;
  const name = incidentName(item);
  return [name, !name.startsWith('Report · ') && date && !Number.isNaN(date.valueOf()) ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
    (item.status || 'processing').replaceAll('_', ' ')].filter(Boolean).join(' · ');
}
