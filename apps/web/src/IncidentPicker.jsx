import React from 'react';

export default function IncidentPicker({ incidents, selected, onSelect, onRefresh, onMore, busy = false }) {
  return <section className="card no-print">
    <div className="row"><label>Incident
      <select value={selected} onChange={e => onSelect(e.target.value)} disabled={busy}>
        <option value="">Choose an incident</option>
        {selected && !incidents.some(i => i.incident_id === selected) && <option value={selected}>{selected.slice(0, 8)} · awaiting list refresh</option>}
        {incidents.map(i => <option key={i.incident_id} value={i.incident_id}>{i.incident_id.slice(0, 8)} · {i.status.replaceAll('_', ' ')}</option>)}
      </select>
    </label><div className="actions"><button disabled={busy} onClick={onRefresh}>Refresh incidents</button>
      {onMore && <button disabled={busy} onClick={onMore}>Load more incidents</button>}</div></div>
    {!incidents.length && <p>Send a synthetic signal in Simulation lab, then refresh this list.</p>}
  </section>;
}
