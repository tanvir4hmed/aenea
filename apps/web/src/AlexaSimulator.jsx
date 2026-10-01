import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';
import { commands, commandFor, describe, canExecute } from './alexaConversation';
import { incidentLabel, incidentName } from './incidentNames';
import { incidentBriefing } from './commandCenter';
import IncidentNote from './IncidentNote';
const words = value => String(value || 'unknown').replaceAll('_', ' ');

const icons = { smoke: '🔥', carbon_monoxide: '⚠', water_leak: '💧', medical_sos: '✚', severe_weather: '⛈', motion: '◉', doorbell: '♧' };

export default function AlexaSimulator({ config, api, incidents, selected, onSelect, state, timeline, onRefresh, navigate, catalog }) {
  const client = useMemo(() => createMcpClient(config), [config.apiUrl, config.clientId, config.cognitoDomain]);
  const [input, setInput] = useState(''), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [readAloud, setReadAloud] = useState(false);
  const [listening, setListening] = useState(false), [now, setNow] = useState(Date.now());
  const recognition = useRef(null), generation = useRef(0), lock = useRef(false), spoken = useRef({ at: 0, id: '', severity: '' });
  const [allActions, setAllActions] = useState(false);
  const briefing = state?.briefing;
  const context = { ...state, assessment: state?.latest_assessment };
  const actions = state?.actions || timeline.filter(item => item.action_id && item.proposal);
  const briefingCurrent = !state?.refreshing && briefing && briefing.resolved === !!state?.incident?.resolved_at && briefing.evidence_revision === state?.incident?.event_count && briefing.assessment_id === state?.incident?.latest_assessment && (briefing.note_revision || 0) === (state?.incident?.note_revision || 0) && state?.incident?.decision_review !== 'rejected';
  const text = briefingCurrent ? briefing.text : incidentBriefing(state, selected);
  const pending = actions.filter(action => action.status === 'pending_confirmation' && canExecute(action, context, now));
  const orderedActions = [...pending, ...actions.filter(action => !pending.includes(action))];
  const severity = state?.incident?.resolved_at ? 'resolved' : state?.canonical_severity || 'waiting';
  const currentIncident = state?.incident || incidents.find(item => item.incident_id === selected) || { incident_id: selected };
  const locationName = catalog?.locations?.find(item => item.id === currentIncident.location_id)?.name;
  const connection = !selected ? 'Ready for a signal' : !state?.receivedAt ? 'Loading incident…'
    : state.refreshing ? 'Updating saved view…' : now - state.receivedAt > 30000 ? 'Updates delayed' : 'Live updates';
  function speak(value) { if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(value)); } }
  useEffect(() => {
    generation.current += 1; lock.current = false; setBusy(false); setError(''); setMessages([]); setInput(''); setAllActions(false);
    recognition.current?.abort(); setListening(false); window.speechSynthesis?.cancel(); spoken.current = { at: 0, id: '', severity: '' };
    return () => { generation.current += 1; recognition.current?.abort(); window.speechSynthesis?.cancel(); };
  }, [selected, state?.household_id]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!readAloud || !briefingCurrent || !briefing?.id || spoken.current.id === briefing.id) return;
    const urgent = briefing.severity === 'urgent' && spoken.current.severity !== 'urgent';
    if (now - spoken.current.at < 30000 && !urgent) return;
    speak(text); spoken.current = { id: briefing.id, at: now, severity: briefing.severity };
  }, [briefing?.id, briefingCurrent, readAloud, now]);
  async function perform(task) {
    if (!selected || lock.current) return;
    const version = generation.current; lock.current = true; setBusy(true); setError('');
    try { await task(version); } catch (failure) { if (version === generation.current) setError(failure.message); }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  }
  async function run(tool, args = {}, phrase = tool) {
    await perform(async version => { const data = await client.call(tool, { incident_id: selected, ...args }); if (version !== generation.current) return;
      setMessages(old => [...old.slice(-19), { phrase, reply: describe(tool, data) }]); await onRefresh(); });
  }
  function listen() {
    if (listening) { recognition.current?.abort(); setListening(false); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setError('Microphone unavailable. Type a command or note instead.'); return; }
    const mic = new Speech(), version = generation.current; recognition.current = mic;
    mic.lang = 'en-US'; mic.interimResults = false;
    mic.onresult = event => { if (generation.current === version) setInput(event.results[0][0].transcript); };
    mic.onerror = () => { if (generation.current === version) { setError('Microphone unavailable. You can type instead.'); setListening(false); } };
    mic.onend = () => { if (generation.current === version) setListening(false); };
    try { mic.start(); setListening(true); } catch { setError('Unable to start microphone. Use text instead.'); }
  }
  return <div className="live-experience">
    <div className="live-toolbar">
      <label>Incident<select value={selected} onChange={event => onSelect(event.target.value)}><option value="">Choose an incident</option>
        {selected && !incidents.some(item => item.incident_id === selected) && <option value={selected}>{incidentLabel({ incident_id: selected })}</option>}
        {incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{incidentLabel(item)}</option>)}
      </select></label>
      <div className="live-connection"><span role="status">{connection}</span><button disabled={busy || !selected} onClick={() => perform(onRefresh)}>Refresh</button></div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="live-grid">
      <section className={'card assistance-hero severity-' + severity} aria-busy={!!selected && (!state || state.refreshing)}>
        <div className="hero-heading"><span className="eyebrow">ALEXA+ · INCIDENT ASSISTANCE</span><span className="severity-label">{words(severity)}</span></div>
        <div className="briefing-heading"><div className="voice-emblem" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 28v8m10-17v26m10-34v42m10-34v26m10-17v8"/></svg></div>
          <div>{locationName && <span className="hero-location">{locationName}</span>}<h2>{selected ? incidentName(currentIncident) : 'Ready when a signal arrives'}</h2></div>
        </div>
        <div className="assistance-brief" role="status" aria-live="polite"><p>{selected ? text : 'Aenea brings incoming alerts, agent decisions and coordinated responses into one view.'}</p></div>
        <div className="actions hero-controls"><button className="primary" disabled={!selected || !state || state.refreshing} onClick={() => speak(text)}>Listen to briefing</button>
          <button aria-pressed={readAloud} onClick={() => { setReadAloud(value => !value); if (readAloud) window.speechSynthesis?.cancel(); }}>{readAloud ? 'Spoken updates on · Mute' : 'Enable spoken updates'}</button>
        </div>
        <p className="hero-footnote">Browser simulation · Spoken updates need this page open.</p>
        {!selected && navigate && <div className="actions"><button onClick={() => navigate(catalog?.devices?.length ? 'command-center' : 'settings')}>{catalog?.devices?.length ? 'Open map & trigger an alert' : 'Set up your devices'}</button></div>}
      </section>

      <section className="card response-panel"><div className="row"><h2>Coordinated response</h2>{pending.length > 0 && <span className="attention-count">{pending.length} to confirm</span>}</div>
        <p>{pending.length ? 'Review these proposals when you can.' : state?.refreshing ? 'Checking the latest decisions…' : 'Agent proposals and recorded outcomes appear here.'}</p>
        {!actions.length && <div className="quiet-state"><strong>{selected ? 'No action records yet' : 'Waiting for an incident'}</strong><p>{selected ? 'Actions depend on the evidence and your configured output permissions.' : 'An incoming signal starts assessment automatically.'}</p>{navigate && <button onClick={() => navigate('settings')}>Response settings</button>}</div>}
        {orderedActions.slice(0, allActions ? undefined : 4).map(action => <article className={'response-item response-' + action.status} key={action.action_id}>
          <div className="row"><h3>{action.proposal.device_name || action.proposal.device_id}</h3><span className="badge">{words(action.status)}</span></div>
          <p>{words(action.proposal.action)} · {action.result || action.policy_reason || 'Awaiting outcome'}</p>
          <div className="actions">{action.status === 'pending_confirmation' && <button className="primary" disabled={busy || !canExecute(action, context, now)} onClick={() => run('confirm_action', { action_id: action.action_id, assessment_id: action.assessment_id, confirm: true }, 'Confirm selected virtual action')}>Confirm {words(action.proposal.action)}</button>}
            <button disabled={busy} onClick={() => run('get_action_status', { action_id: action.action_id }, 'Read action outcome')}>Read outcome</button>
          </div>
        </article>)}
        {actions.length > 4 && <button onClick={() => setAllActions(value => !value)}>{allActions ? 'Show fewer actions' : 'View all ' + actions.length + ' actions'}</button>}
        {navigate && selected && <a className="detail-link" href="/incident-history" onClick={event => { event.preventDefault(); navigate('incident-history'); }}>Review decisions & evidence →</a>}
      </section>

      <section className="card live-signals"><div className="row"><h2>Active signals</h2>{navigate && <button onClick={() => navigate('command-center')}>View map</button>}</div>
        {!state ? <p>{selected ? 'Loading device reports…' : 'Select an incident to see its reported signals.'}</p> : state.active_devices === undefined ? <p>Current device state is updating.</p> : !state.active_devices.length ? <p>No active signals in the received incident data.</p> : <div className="signal-grid">{state.active_devices.map(device => <article className={'signal-tile signal-' + (device.level || 'normal')} key={device.device_id}>
          <span className="signal-icon" aria-hidden="true">{icons[device.kind] || '◉'}</span><div><h3>{device.name || device.device_id.slice(0, 8)}</h3><p>{device.room || 'Unassigned area'} · {words(device.kind)}</p></div>
        </article>)}</div>}
      </section>

      <section className="card conversation-panel"><h2>Ask Alexa+</h2><p>Ask about the incident, its signals or the latest assessment.</p>
        <form className="alexa-command" onSubmit={event => { event.preventDefault(); const command = commandFor(input); if (command) { run(command.tool, {}, input); return; } perform(async version => { const result = await api('/incidents/' + selected + '/message', { method: 'POST', body: JSON.stringify({ text: input }) }); if (version !== generation.current) return; setMessages(old => [...old.slice(-19), { phrase: input, reply: result.tool ? describe(result.tool, result.data) : result.message }]); await onRefresh(); }); }}>
          <label>What would you like to know?<input maxLength={600} value={input} onChange={event => setInput(event.target.value)} placeholder="What has changed since the first alert?"/></label>
          <div className="actions"><button className="primary" disabled={busy || !selected || !input.trim()}>{busy ? 'Working…' : 'Ask'}</button><button type="button" aria-pressed={listening} disabled={busy || !selected} onClick={listen}>{listening ? 'Stop microphone' : 'Use microphone'}</button></div>
        </form>
        <div className="question-shortcuts">{commands.map(command => <button key={command.tool} disabled={busy || !selected} onClick={() => run(command.tool, {}, command.phrase)}>{command.label}</button>)}</div>
        <details className="alexa-help"><summary>Examples & voice options</summary><p>“Which devices reported?” · “Is the assessment current?” · “Show the evidence timeline.” Write in your own words. Approve device actions on their response cards.</p><small>English voice transcription uses your browser’s speech service. Review it before sending.</small></details>
        <div className="conversation-log" role="log" aria-label="Command replies">{messages.map((message, index) => <article className="conversation-turn" key={index}><strong>{message.phrase}</strong><p>{message.reply}</p></article>)}</div>
      </section>
      <IncidentNote key={selected} api={api} selected={selected} state={state} onRefresh={onRefresh}/>
    </div>
  </div>;
}
