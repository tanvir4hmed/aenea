import React, { useEffect, useState } from 'react';

const deviceNames = {
  virtual_lights: 'Virtual lights', virtual_siren: 'Virtual siren',
  virtual_notification: 'In-app notification', virtual_valve: 'Virtual water valve',
};
const defaults = Object.fromEntries(Object.keys(deviceNames).map(id =>
  [id, { enabled: true, preauthorized: false, fail_next: false }]));

export default function Coordination({ api, timeline, incident, simulation, onRefresh, settingsOnly = false }) {
  const [devices, setDevices] = useState(defaults);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  async function reloadDevices() {
    const data = await api('/household/devices');
    setDevices(Object.fromEntries(Object.keys(deviceNames).map(id => [id, {
      enabled: data.devices?.[id]?.enabled ?? false,
      preauthorized: data.devices?.[id]?.preauthorized ?? false,
      fail_next: data.devices?.[id]?.fail_next ?? false,
    }])));
    setLoaded(true);
  }
  useEffect(() => {
    reloadDevices().catch(e => setMessage(e.message));
  }, []);
  async function perform(task) {
    setBusy(true); setMessage('');
    try { await task(); } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  const assessments = timeline.filter(i => i.sk.startsWith('ASSESSMENT#'))
    .sort((a,b) => b.created_at - a.created_at);
  const latest = assessments[0];
  const actions = timeline.filter(i => i.sk.startsWith('ACTION#'));
  return <section className="card">
    <h2>{settingsOnly ? 'Virtual action permissions' : 'Assessment and coordinated actions'}</h2>
    {settingsOnly && <p>These four simulated outputs are separate from the input sensors and cameras in your device catalog.</p>}
    {message && <p role="status">{message}</p>}
    {simulation && <details><summary>Virtual household permissions and failure simulation</summary>
      <p>Save your choices before sending a signal. Notifications appear here; no external messages are sent. Valve closure always needs confirmation.</p>
      {Object.entries(deviceNames).map(([id, label]) => <fieldset key={id}><legend>{label}</legend>
        {['enabled', ...(id === 'virtual_valve' ? [] : ['preauthorized']), 'fail_next'].map(key =>
          <label key={key}><input type="checkbox" checked={devices[id][key]} disabled={busy || !loaded}
            onChange={e => setDevices(old => ({ ...old, [id]: { ...old[id], [key]: e.target.checked } }))}/>
            {key === 'enabled' ? 'Enabled' : key === 'preauthorized' ? 'Allow automatic simulated action' : 'Fail next simulated action'}</label>)}
      </fieldset>)}
      <button disabled={busy || !loaded} onClick={() => perform(async () => {
        await api('/household/devices', { method: 'PUT', body: JSON.stringify({ devices }) });
        await reloadDevices(); setMessage('Virtual household permissions saved.');
      })}>Save permissions</button>
      <button disabled={busy} onClick={() => perform(async () => {
        await reloadDevices(); setMessage('Loaded saved permissions and remaining failure flags. Unsaved edits were replaced.');
      })}>Reload saved device settings</button>
      <p>Failure flags are consumed only when an eligible virtual action executes. Reload after a run before configuring the next one; no physical device is affected.</p>
    </details>}
    {!settingsOnly && <>{!latest && <p>{incident ? 'Waiting for an assessment. Load additional timeline entries if needed.' : 'Select an incident to see assessments and policy decisions.'}</p>}
    {latest?.status === 'assessment_failed' && <p role="alert">Assessment unavailable. No actions authorized. Send a new signal to request a new assessment.</p>}
    {latest?.assessment && <article>
      <span className="badge">AI ASSESSMENT · SIMULATED EVIDENCE</span>
      <h3>{latest.assessment.incident_type.replaceAll('_',' ')} · {latest.assessment.severity}</h3>
      <p>{latest.assessment.summary}</p>
      <p>Model confidence: {Math.round(latest.assessment.confidence * 100)}% (not a calibrated probability)</p>
      <p>Evidence: {latest.assessment.evidence_ids.join(', ')}</p>
      {latest.assessment.uncertainties.map((value, index) => <p key={index}>Uncertainty: {value}</p>)}
    </article>}
    {actions.map(action => <article key={action.action_id}>
      <h3>{deviceNames[action.proposal.device_id]} · {action.proposal.action.replaceAll('_',' ')}</h3>
      <p>{action.status.replaceAll('_',' ')} — {action.result || action.policy_reason}</p>
      {action.alternate_plan && <p>Alternate plan: {action.alternate_plan}</p>}
      {action.status === 'pending_confirmation' && <button disabled={busy || Date.now() >= action.expires_at * 1000}
        onClick={() => perform(async () => {
          await api('/incidents/' + incident + '/actions/' + action.action_id + '/confirm',
            { method: 'POST', body: JSON.stringify({ confirm: true }) });
          await onRefresh(); setMessage('Confirmation processed; see the recorded result.');
        })}>Confirm closing virtual water valve</button>}
      {action.status === 'pending_confirmation' && <small>Expires {new Date(action.expires_at * 1000).toLocaleTimeString()}</small>}
    </article>)}</>}
  </section>;
}
