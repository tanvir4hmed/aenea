import React, { useState } from 'react';
import { deviceTypes, humanize } from './devices';
import { incidentBriefing, reportingDevices } from './commandCenter';
import { alertStates } from './simulations';

const symbols = { smoke_detector: '◉', co_detector: 'CO', leak_sensor: '≈', camera: '◧', medical_button: '+', weather_feed: '☁' };

export default function DeviceMap({ catalog, ready, timeline, state, selected, onDevice, navigate }) {
  const [locationId, setLocationId] = useState('');
  const [room, setRoom] = useState('');
  const [expanded, setExpanded] = useState({});
  const site = catalog.locations.find(item => item.id === locationId) || catalog.locations[0];
  const devices = catalog.devices.filter(item => item.location_id === site?.id);
  const rooms = [...new Set(devices.map(item => item.room || 'Unassigned area'))];
  const reporting = reportingDevices(timeline, state);
  const states = alertStates(catalog, timeline, state);
  return <section className="card device-map" aria-busy={!ready}>
    <div className="row"><h2>Household Overview</h2><span className="mode-label">Simulation</span></div>
    <div className="map-toolbar"><label>Location<select value={site?.id || ''} onChange={event => { setLocationId(event.target.value); setRoom(''); }}><option value="" disabled>Choose location</option>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button onClick={() => navigate('settings')}>Manage devices</button></div>
    {!ready ? <p role="status">Loading saved devices…</p> : !devices.length ? <div className="empty-state"><h3>{site ? 'No devices at this location' : 'Set up your first location'}</h3><p>Add named rooms and devices in Settings to populate this view.</p></div> : <>
      <p className="map-caption">Select a device to inspect its alert state. Trigger saved simulations in the panel on the right.</p>
      <div className="room-map">{rooms.map(name => {
        const members = devices.filter(item => (item.room || 'Unassigned area') === name);
        const active = members.filter(item => reporting.has(item.id));
        const visible = expanded[name] || members.length <= 12 ? members : members.filter(item => reporting.has(item.id));
        const red = members.some(item => states.get(item.id)?.level === 'red');
        return <section key={name} className={'map-room ' + (room === name ? 'focused ' : '') + (red ? 'urgent-room' : active.length ? 'reporting' : '')} aria-label={name}>
          <button className="room-title" aria-pressed={room === name} onClick={() => { setRoom(name); setExpanded(old => ({ ...old, [name]: true })); }}><strong>{name}</strong><small>{members.length} devices{active.length ? ` · ${active.length} with evidence` : ''}</small></button>
          <div className="map-devices">{visible.map(device => <button key={device.id} className={'map-device ' + (states.get(device.id)?.level === 'red' ? 'red-alert' : reporting.has(device.id) ? 'has-evidence' : '')} onClick={() => { setRoom(name); onDevice({ id: device.id, nonce: Date.now() }); }} aria-label={`${device.name}, ${states.get(device.id)?.reason || (device.enabled ? 'no evidence loaded' : 'disabled')}`} title={states.get(device.id)?.reason}>
            <span className="device-symbol" aria-hidden="true">{symbols[device.type] || '◉'}</span><strong>{device.name}</strong><small>{states.get(device.id)?.level === 'red' ? 'Red alert' : !device.enabled ? 'Disabled' : reporting.has(device.id) ? 'Evidence recorded' : deviceTypes[device.type]?.label}</small>
          </button>)}</div>
          {members.length > 12 && !expanded[name] && <button onClick={() => setExpanded(old => ({ ...old, [name]: true }))}>Show all {members.length} devices</button>}
          {members.length > 12 && !expanded[name] && <p className="map-caption">{Object.entries(members.filter(item => !reporting.has(item.id)).reduce((counts, item) => ({ ...counts, [item.type]: (counts[item.type] || 0) + 1 }), {})).map(([type, count]) => `${count} ${deviceTypes[type]?.label || type}`).join(' · ')}</p>}
        </section>;
      })}</div>
      <p className="map-caption">{selected ? `Evidence shown for incident ${selected.slice(0, 8)}. ` : ''}No evidence shown does not mean a device or room is safe. Layout is schematic.</p>
      <details><summary>Alert colours</summary><p>Amber: evidence recorded. Red: a recent device cited by the current urgent assessment, or three distinct smoke detectors reporting in the same room within five minutes. Simulated escalation does not establish fire size or activate a siren; virtual action outcomes are shown separately.</p></details>
    </>}
  </section>;
}

export function IncidentBriefing({ state, selected, timeline, navigate }) {
  const assessment = state?.latest_assessment;
  const summary = assessment?.assessment;
  const pending = timeline.filter(item => item.status === 'pending_confirmation' && item.assessment_id === assessment?.assessment_id);
  const text = incidentBriefing(state, selected);
  return <aside className="card alexa-briefing"><span className="mode-label">Alexa+ simulation</span><div className="alexa-orb" aria-hidden="true">a</div><h2>Incident briefing</h2><div role="status" aria-live="polite" aria-atomic="true"><p>{text}</p><p>{summary && <span className="badge">{humanize(summary.severity)}</span>} {state?.incident && `Evidence revision ${state.incident.event_count || 0}`}</p></div>
    <button disabled={!selected} onClick={() => { if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } }}>Read briefing aloud</button>
    <div className="actions"><button disabled={!selected} onClick={() => navigate('alexa-sim')}>Ask Alexa+</button><button disabled={!selected} onClick={() => navigate('handoff')}>Prepare handoff</button></div>
    <h3>Needs your attention</h3><p>{pending.length && state?.assessment_current ? `${pending.length} proposed action(s) need confirmation. Review the current decisions below.` : 'No current confirmation shown in loaded records.'}</p>
    <small>Updates as saved incident evidence is processed. Full reasoning is available in Incident history.</small>
  </aside>;
}
