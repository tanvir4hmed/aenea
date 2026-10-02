import React from 'react';
import { signalDetails } from './liveAssistance';

export default function HistoryRecord({ item }) {
  const category = item.event?.kind || item.kind || (item.person ? 'historical_report' : 'record');
  const message = item.event?.observation || item.data?.text || item.data?.result || item.data?.policy_reason || item.data?.message || item.data?.assessment?.summary;
  const person = item.person ? item : item.kind === 'person_status' ? item.data : null;
  const source = item.event ? signalDetails({ device_id: item.event.source?.source_id, event_id: item.event.event_id, kind: item.event.kind }, null, [item]) : null;
  return <li><span className="badge">SIMULATED</span><h3>{category.replaceAll('_', ' ')}</h3>
    <p>{message || (person ? `${person.person}: ${person.status} — historical, unverified report` : 'Coordination decision recorded')}</p>
    <time>{new Date(item.event?.occurred_at || item.recorded_at || item.reported_at).toLocaleString()}</time>
    {source && <small>{source.name} · {source.place}</small>}
    <details><summary>Saved evidence details</summary><pre>{JSON.stringify(item, null, 2)}</pre></details>
  </li>;
}
