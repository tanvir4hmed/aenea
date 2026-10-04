import React from 'react';
import { incidentLabel } from './incidentNames';

export default function IncidentPicker({ incidents, selected, onSelect, onRefresh, onMore, busy = false, compact = false }) {
  return <section className={compact ? 'incident-picker-inline no-print' : 'card no-print'}>
    <div className="row"><label>Incident
      <select value={selected} onChange={e => onSelect(e.target.value)} disabled={busy}>
        <option value="">Choose an incident</option>
        {selected && !incidents.some(i => i.incident_id === selected) && <option value={selected}>{selected.slice(0, 8)} · awaiting list refresh</option>}
        {incidents.map(i => <option key={i.incident_id} value={i.incident_id}>{incidentLabel(i)}</option>)}
      </select>
    </label><div className="actions"><button disabled={busy} onClick={onRefresh} aria-label="Refresh incidents" title="Refresh incidents"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg></button>
      {onMore && <button disabled={busy} onClick={onMore}>{compact ? 'More' : 'Load more incidents'}</button>}</div></div>
  </section>;
}
