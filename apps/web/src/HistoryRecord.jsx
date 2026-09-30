import React from 'react';

export default function HistoryRecord({ item }) {
  const category = item.event?.kind || item.kind || (item.person ? 'historical_report' : 'record');
  const message = item.event?.observation || item.data?.text || item.data?.result || item.data?.policy_reason || item.data?.message || item.data?.assessment?.summary;
  const person = item.person ? item : item.kind === 'person_status' ? item.data : null;
  return <li><span className="badge">SIMULATED</span><h3>{category.replaceAll('_', ' ')}</h3>
    <p>{message || (person ? `${person.person}: ${person.status} — historical, unverified report` : 'Coordination decision recorded')}</p>
    <time>{new Date(item.event?.occurred_at || item.recorded_at || item.reported_at).toLocaleString()}</time>
    {item.event && <small>{item.context?.device?.name || item.event.source.source_id}</small>}
    <details><summary>Saved evidence details</summary><pre>{JSON.stringify(item, null, 2)}</pre></details>
  </li>;
}
