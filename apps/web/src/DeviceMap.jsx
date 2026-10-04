import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { deviceTypes, humanize } from './devices';
import { incidentBriefing, reportingDevices } from './commandCenter';
import { alertStates } from './simulations';
import { house, roomGroups, isMapleHouse } from './house';
import './house.css';

const symbols = { smoke_detector: '◉', co_detector: 'CO', leak_sensor: '≈', camera: '◧', medical_button: '+', weather_feed: '☁', heat_detector: '♨', gas_detector: 'G', freeze_sensor: '❄', power_monitor: 'ϟ', security_contact: '⌑', glass_break_sensor: '◇', security_panel: '!', smart_lock: '⌾' };

export default function DeviceMap({ catalog, ready, timeline, state, selected, summary, onDevice, navigate, focusedDevice }) {
  const map = useRef(null);
  const focusedOnce = useRef(null);
  const [locationId, setLocationId] = useState('');
  const [room, setRoom] = useState('');
  useEffect(() => { setLocationId(''); setRoom(''); }, [selected]);
  const focused = catalog.devices.find(item => item.id === focusedDevice?.id);
  useEffect(() => {
    if (!focused || !ready) return;
    const area = focused.room || 'Unassigned area';
    setLocationId(focused.location_id); setRoom(area);
  }, [focusedDevice?.nonce, focused?.id, ready]);
  useEffect(() => {
    if (!focused || !map.current || locationId !== focused.location_id || focusedOnce.current === focusedDevice?.nonce) return;
    const button = [...map.current.querySelectorAll('[data-device-id]')].find(element => element.dataset.deviceId === focused.id);
    if (button) { focusedOnce.current = focusedDevice.nonce; button.focus({ preventScroll: true }); button.scrollIntoView({ block: 'nearest' }); }
  }, [locationId, room, focusedDevice?.nonce, focused?.id]);
  // Measure category heights into dense grid rows; keep a plain-grid fallback.
  useLayoutEffect(() => {
    const grid = map.current?.querySelector('.house-cutaway');
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const groups = [...grid.children];
    let frame;
    const pack = () => {
      grid.classList.add('packed');
      for (const group of groups) {
        const span = 'span ' + Math.ceil((group.getBoundingClientRect().height + 8) / 12);
        if (group.style.gridRowEnd !== span) group.style.gridRowEnd = span;
      }
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(pack); });
    observer.observe(grid); groups.forEach(group => observer.observe(group)); pack();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); grid.classList.remove('packed'); groups.forEach(group => { group.style.gridRowEnd = ''; }); };
  }, [catalog, ready]);
  const currentState = state?.incident?.incident_id === selected ? state : null;
  const currentIncident = currentState?.incident || summary;
  const site = catalog.locations.find(item => item.id === (locationId || currentIncident?.location_id)) || catalog.locations[0];
  const devices = catalog.devices.filter(item => item.location_id === site?.id);
  const fixed = isMapleHouse(catalog);
  const levels = fixed ? roomGroups : [{ name: 'Existing setup', rooms: [...new Set(devices.map(item => item.room || 'Unassigned area'))] }];
  const membersIn = name => devices.filter(item => (item.room || 'Unassigned area') === name);
  const reporting = reportingDevices(timeline, currentState);
  const states = alertStates(catalog, timeline, currentState);
  return <section ref={map} className="card device-map" aria-busy={!ready}>
    <div className="row"><div><h2>{fixed ? house.name : 'Household Overview'}</h2></div><button onClick={() => navigate('settings')}>Manage devices</button></div>
    {!fixed && <div className="map-toolbar"><label>Existing location<select value={site?.id || ''} onChange={event => { setLocationId(event.target.value); setRoom(''); }}>{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}
    {selected && (!currentState || currentState.refreshing) && <p className="sync-status" role="status">Loading the selected incident’s device reports…</p>}
    {ready && focusedDevice?.inspect && !focused && <p className="notice">This report’s device is no longer in your device list. Its recorded evidence remains in History.</p>}
    {!ready ? <p role="status">Loading saved devices…</p> : <>
      <div className={fixed ? 'house-cutaway' : ''}>
      {levels.map(level => <section className={'house-level' + (level.name === 'Washrooms' ? ' washroom-group' : '')} style={{ '--group-span': level.rooms.reduce((count, name) => count + membersIn(name).length, 0) >= 7 ? 12 : 6 }} key={level.name} aria-label={level.name}>
      <div className="house-level-label"><h3>{level.name}</h3><span>{level.rooms.reduce((count, name) => count + devices.filter(device => device.room === name).length, 0)} devices</span></div>
      <div className="room-map">{level.rooms.map(name => {
        const members = membersIn(name);
        const active = members.filter(item => reporting.has(item.id));
        const visible = members;
        const red = members.some(item => states.get(item.id)?.level === 'red');
        return <section key={name} style={{ '--room-weight': Math.max(1, Math.sqrt(members.length)) }} className={'map-room ' + (room === name ? 'focused ' : '') + (red ? 'urgent-room' : active.length ? 'reporting' : '')} aria-label={name}>
          <button className="room-title" aria-pressed={room === name} onClick={() => { setRoom(name); }}><strong>{name}</strong><small>{members.length} devices{active.length ? ` · ${active.length} with evidence` : ''}</small></button>
          <div className="map-devices">{visible.map(device => <button key={device.id} data-device-id={device.id} aria-pressed={focusedDevice?.id === device.id} className={'map-device ' + (focusedDevice?.id === device.id ? 'selected-device ' : '') + (states.get(device.id)?.level === 'red' ? 'red-alert' : reporting.has(device.id) ? 'has-evidence' : '')} onClick={() => { setRoom(name); if (deviceTypes[device.type]?.category === 'actuator') { navigate('settings'); return; } onDevice({ id: device.id, nonce: Date.now() }); }} aria-label={`${device.name}, ${states.get(device.id)?.reason || (device.enabled ? 'no evidence loaded' : 'disabled')}`} title={states.get(device.id)?.reason}>
            <span className="device-symbol" aria-hidden="true">{symbols[device.type] || '◉'}</span><strong>{level.name === 'Washrooms' ? device.name.replace(' Washroom', '') : device.name.startsWith(name + ' · ') ? device.name.slice(name.length + 3) : device.name}</strong><small>{states.get(device.id)?.level === 'red' ? 'Red alert' : !device.enabled ? 'Disabled' : reporting.has(device.id) ? 'Evidence recorded' : 'No incident report'}</small>
          </button>)}</div>
          {!members.length && <p className="map-caption">{name}: no devices</p>}
        </section>;
      })}</div></section>)}
      </div>
    </>}
  </section>;
}

export function IncidentBriefing({ state, selected, timeline, navigate }) {
  const assessment = state?.latest_assessment;
  const summary = assessment?.assessment;
  const pending = (state?.actions || timeline).filter(item => item.status === 'pending_confirmation' && item.assessment_id === assessment?.assessment_id && (item.note_revision || 0) === (state?.incident?.note_revision || 0) && state?.incident?.decision_review !== 'rejected' && Date.now() < item.expires_at * 1000);
  const text = incidentBriefing(state, selected);
  return <aside className="card alexa-briefing"><span className="mode-label">Alexa+ simulation</span><div className="alexa-orb" aria-hidden="true">a</div><h2>Incident briefing</h2><div role="status" aria-live="polite" aria-atomic="true"><p>{text}</p><p>{(state?.canonical_severity || summary) && <span className="badge">{humanize(state?.canonical_severity || summary.severity)}</span>} {state?.incident && `Evidence revision ${state.incident.event_count || 0}`}</p></div>
    <button disabled={!selected} onClick={() => { if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } }}>Read briefing aloud</button>
    <div className="actions"><button disabled={!selected} onClick={() => navigate('alexa-sim')}>Ask Alexa+</button><button disabled={!selected} onClick={() => navigate('incident-history')}>Incident history</button></div>
    <h3>Needs your attention</h3><p>{pending.length && state?.assessment_current ? `${pending.length} proposed action(s) need confirmation. Review the current decisions below.` : 'No current confirmation shown in loaded records.'}</p>
    <small>Updates as saved incident evidence is processed. Full reasoning is available in Incident history.</small>
  </aside>;
}
