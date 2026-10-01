import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';
import { commands, commandFor, describe, canExecute } from './alexaConversation';
import { incidentLabel, incidentName } from './incidentNames';
import { incidentBriefing } from './commandCenter';

const icons = { smoke: '🔥', carbon_monoxide: '⚠', water_leak: '💧', medical_sos: '✚', severe_weather: '⛈', motion: '◉', doorbell: '♧' };

export default function AlexaSimulator({ config, api, incidents, selected, onSelect, state, timeline, onRefresh }) {
  const client = useMemo(() => createMcpClient(config), [config.apiUrl, config.clientId, config.cognitoDomain]);
  const [input, setInput] = useState(''), [note, setNote] = useState(''), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [readAloud, setReadAloud] = useState(false);
  const [listening, setListening] = useState(false), [now, setNow] = useState(Date.now());
  const recognition = useRef(null), generation = useRef(0), lock = useRef(false), spoken = useRef({ at: 0, id: '', severity: '' });
  const noteRequest = useRef(null);
  const briefing = state?.briefing;
  const context = { ...state, assessment: state?.latest_assessment };
  const actions = state?.actions || timeline.filter(item => item.action_id && item.proposal);
  const briefingCurrent = briefing && briefing.resolved === !!state?.incident?.resolved_at && briefing.evidence_revision === state?.incident?.event_count && briefing.assessment_id === state?.incident?.latest_assessment && (briefing.note_revision || 0) === (state?.incident?.note_revision || 0) && state?.incident?.decision_review !== 'rejected';
  const text = briefingCurrent ? briefing.text : incidentBriefing(state, selected);
  const storageKey = `aenea-note-${state?.household_id || ''}-${selected}`;
  function speak(value) { if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(value)); } }
  useEffect(() => {
    generation.current += 1; lock.current = false; setBusy(false); setError(''); setMessages([]); setInput('');
    recognition.current?.abort(); setListening(false); window.speechSynthesis?.cancel(); spoken.current = { at: 0, id: '', severity: '' };
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey)); noteRequest.current = saved; setNote(saved?.text || ''); } catch { noteRequest.current = null; setNote(''); }
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
  return <>
    <section className="card alexa-live"><div className="row"><h2>{selected ? incidentName(state?.incident || { incident_id: selected }) : 'Alexa+ coordination'}</h2><span role="status">{!state?.receivedAt ? 'Connecting…' : now - state.receivedAt > 30000 ? 'Updates delayed' : 'Live · refreshes automatically'}</span></div>
      <label>Incident<select value={selected} onChange={event => onSelect(event.target.value)}><option value="">Choose an incident</option>{selected && !incidents.some(item => item.incident_id === selected) && <option value={selected}>{incidentLabel({ incident_id: selected })}</option>}{incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{incidentLabel(item)}</option>)}</select></label>
      <div className="live-briefing" role="status" aria-live="polite"><span className="badge">{state?.incident?.resolved_at ? 'Resolved' : state?.canonical_severity || 'Waiting'}</span><p>{text}</p></div>
      <div className="affected-devices">{(state?.active_devices || []).map(device => <span className="hazard-chip" key={device.device_id}><span aria-hidden="true">{icons[device.kind] || '◉'}</span> {device.name || device.device_id.slice(0, 8)} · {device.room || 'Unassigned area'} · {device.kind.replaceAll('_', ' ')}</span>)}</div>
      <div className="actions"><button disabled={!selected} onClick={() => speak(text)}>Replay briefing</button><button aria-pressed={readAloud} onClick={() => { setReadAloud(value => !value); if (readAloud) window.speechSynthesis?.cancel(); }}>{readAloud ? 'Mute spoken updates' : 'Enable spoken updates'}</button><button disabled={busy || !selected} onClick={() => perform(onRefresh)}>Refresh now</button></div>
      <small>Browser simulation. Cloud processing continues when this page closes; browser speech does not.</small>
    </section>
    <section className="card"><h2>Ask Alexa+</h2><form className="alexa-command" onSubmit={event => { event.preventDefault(); const command = commandFor(input); if (command) { run(command.tool, {}, input); return; } perform(async version => { const result = await api(`/incidents/${selected}/message`, { method: 'POST', body: JSON.stringify({ text: input }) }); if (version !== generation.current) return; setMessages(old => [...old.slice(-19), { phrase: input, reply: result.tool ? describe(result.tool, result.data) : result.message }]); await onRefresh(); }); }}>
      <label>Ask about this incident<input maxLength={600} value={input} onChange={event => setInput(event.target.value)} placeholder="Ask in your own words…"/></label><div className="actions"><button className="primary" disabled={busy || !selected || !input.trim()}>Ask</button><button type="button" aria-pressed={listening} disabled={busy || !selected} onClick={listen}>{listening ? 'Stop microphone' : 'Use microphone'}</button></div></form>
      <details className="alexa-help"><summary>What can I ask?</summary><p>Write a question in your own words. Alexa+ can answer from this incident’s saved evidence and current assessment. Try:</p><ul><li>What happened, and which devices reported it?</li><li>Has anything changed? Is the assessment current?</li><li>Show me the evidence and action timeline.</li><li>I acknowledge that I have seen this incident.</li></ul><p>These requests read incident information or record your acknowledgement. To approve an agent-proposed device action, review its card below and confirm it there.</p></details>
      <small>Voice input uses your browser’s English speech service. Review the transcription before sending.</small>
      <div className="actions">{commands.map(command => <button key={command.tool} disabled={busy || !selected} onClick={() => run(command.tool, {}, command.tool === 'get_incident_status' ? 'Read incident status' : command.tool === 'get_incident_timeline' ? 'Read evidence and action timeline' : 'Record acknowledgement')}>{command.tool === 'get_incident_status' ? 'Read incident status' : command.tool === 'get_incident_timeline' ? 'View evidence and action timeline' : 'Acknowledge I have seen this'}</button>)}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <div role="log" aria-label="Command replies">{messages.map((message, index) => <article className="conversation-turn" key={index}><strong>{message.phrase}</strong><p>{message.reply}</p></article>)}</div>
    </section>
    <div className="columns"><section className="card"><h2>Coordinated actions</h2>{!actions.length && <p>No action records loaded. Agent proposals require configured outputs and policy approval.</p>}
      {actions.map(action => <article className="catalog-item" key={action.action_id}><h3>{action.proposal.device_name || action.proposal.device_id}</h3><p>{action.proposal.action.replaceAll('_', ' ')} · {action.status.replaceAll('_', ' ')}</p><p>{action.result || action.policy_reason}</p>
        {action.status === 'pending_confirmation' && <button disabled={busy || !canExecute(action, context)} onClick={() => run('confirm_action', { action_id: action.action_id, assessment_id: action.assessment_id, confirm: true }, 'Confirm selected virtual action')}>Confirm {action.proposal.action.replaceAll('_', ' ')}</button>}
        <button disabled={busy} onClick={() => run('get_action_status', { action_id: action.action_id }, 'Read action outcome')}>Read outcome</button>
      </article>)}
      <p>Full evidence, proposals and historical reports remain in Incident history.</p>
    </section><section className="card"><h2>Optional incident note</h2><form className="incident-note-form" onSubmit={event => { event.preventDefault(); perform(async version => { const request = noteRequest.current?.text === note.trim() ? noteRequest.current : { request_id: crypto.randomUUID(), text: note.trim() }; noteRequest.current = request; sessionStorage.setItem(storageKey, JSON.stringify(request)); await api(`/incidents/${selected}/notes`, { method: 'POST', body: JSON.stringify(request) }); if (version !== generation.current) return; noteRequest.current = null; sessionStorage.removeItem(storageKey); setNote(''); await onRefresh(); }); }}>
      <label>Additional context<textarea rows={3} maxLength={1000} value={note} onChange={event => { const text = event.target.value; setNote(text); const request = { request_id: crypto.randomUUID(), text }; noteRequest.current = request; sessionStorage.setItem(storageKey, JSON.stringify(request)); }} placeholder="Anything the devices cannot report…"/></label><button disabled={busy || !selected || !!state?.incident?.resolved_at || !note.trim()}>Save note</button></form>
      <small>Optional and unverified. Not a device reading, person registry or emergency message.</small>
      {(state?.notes?.items || []).map(item => <article key={item.sk}><p>{item.data.text}</p><small>{new Date(item.recorded_at).toLocaleString()} · user report</small></article>)}
      {state?.notes?.partial && <p>Older notes are in Incident history.</p>}
    </section></div>
  </>;
}
