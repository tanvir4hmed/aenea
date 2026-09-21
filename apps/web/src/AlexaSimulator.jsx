import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';

const commands = {
  'what is happening': 'get_incident_status',
  'show the timeline': 'get_incident_timeline',
  'who is safe': 'get_household_status',
  'acknowledge incident': 'acknowledge_incident',
  'prepare a handoff': 'get_responder_summary',
};
function describe(name, data) {
  if (data.assessment?.assessment) return data.assessment.assessment.summary;
  if (name === 'get_incident_status') return 'Incident stage: ' + (data.incident?.status || 'unknown').replaceAll('_',' ') + '.';
  if (name === 'get_household_status') return data.items?.length ?
    data.items.map(p => p.person + ': ' + p.status.replaceAll('_',' ') + ' (self-reported at ' + p.reported_at + ')').join('. ') + (data.next_cursor ? '. Partial page; more check-ins exist.' : '') :
    'No household check-ins are recorded. Everyone’s status is unknown.';
  if (name === 'report_person_status') return data.person + ' is recorded as ' + data.status.replaceAll('_',' ') + '. This is a self-report.';
  if (name === 'acknowledge_incident') return 'Incident acknowledged. It has not been marked resolved.';
  if (name === 'get_responder_summary') return data.notice + (data.partial ? ' The summary is partial; additional records exist.' : '');
  if (name === 'get_incident_timeline') return 'Loaded ' + data.items.length + ' incident records.' + (data.next_cursor ? ' More records are available.' : '');
  return (data.status || 'recorded').replaceAll('_',' ') + ': ' + (data.result || data.policy_reason || 'See the recorded result.');
}

export default function AlexaSimulator({ config, incidents, selected, onSelect }) {
  const client = useMemo(() => createMcpClient(config.apiUrl), [config.apiUrl]);
  const [input, setInput] = useState('what is happening'), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [person, setPerson] = useState('Me'), [status, setStatus] = useState('unknown');
  const [actions, setActions] = useState([]), [readAloud, setReadAloud] = useState(false);
  const [cursor, setCursor] = useState(null);
  const recognition = useRef(null);
  useEffect(() => () => { recognition.current?.abort(); window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { setActions([]); setCursor(null); setMessages([]); }, [selected]);
  async function run(name, extra = {}, phrase = name) {
    if (!selected) { setError('Select an incident first.'); return; }
    setBusy(true); setError('');
    try {
      const data = await client.call(name, { incident_id: selected, ...extra });
      const reply = describe(name, data);
      setMessages(old => [...old, { phrase, reply, data }]);
      if (name === 'get_incident_timeline') {
        setActions(old => [...new Map([...old, ...data.items.filter(i => i.action_id && i.proposal)]
          .map(action => [action.action_id, action])).values()]);
        setCursor(data.next_cursor);
      }
      if (['confirm_action', 'request_safe_action', 'get_action_status'].includes(name))
        setActions(old => old.map(a => a.action_id === data.action_id ? data : a));
      if (readAloud && window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function submit(e) {
    e.preventDefault();
    const phrase = input.toLowerCase().replace(/[?.!]/g, '').trim();
    if (!commands[phrase]) { setError('Use one of the supported phrases below. This simulator uses explicit commands.'); return; }
    run(commands[phrase], {}, input);
  }
  function listen() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setError('Speech recognition is unavailable here; type or use the buttons.'); return; }
    recognition.current?.abort();
    const mic = new Speech(); recognition.current = mic;
    mic.lang = 'en-US'; mic.interimResults = false;
    mic.onresult = e => setInput(e.results[0][0].transcript);
    mic.onerror = () => setError('Microphone unavailable. You can type instead.');
    mic.start();
  }
  return <section className="card">
    <h2>Alexa+ experience simulation</h2>
    <p>Explicit English commands use our hosted MCP tools and real saved incident state. This is a web simulation, not a native Alexa connection.</p>
    <label>Incident <select value={selected} disabled={busy} onChange={e => onSelect(e.target.value)}>
      <option value="">Choose an incident</option>
      {incidents.map(i => <option key={i.incident_id} value={i.incident_id}>{i.incident_id.slice(0,8)}</option>)}
    </select></label>
    <form onSubmit={submit}><label>Say or type a supported phrase <input value={input} onChange={e => setInput(e.target.value)} disabled={busy}/></label>
      <button disabled={busy} type="submit">{busy ? 'Working…' : 'Send'}</button>
      <button disabled={busy} type="button" onClick={listen}>Use microphone</button>
    </form>
    <small>Microphone transcription may use your browser’s speech service. Review the text before sending.</small>
    <label><input type="checkbox" checked={readAloud} onChange={e => setReadAloud(e.target.checked)}/>Read responses aloud</label>
    <div className="actions">{Object.keys(commands).map(phrase => <button key={phrase} disabled={busy}
      onClick={() => run(commands[phrase], {}, phrase)}>{phrase}</button>)}</div>
    <fieldset><legend>Report a simulated household check-in</legend>
      <label>Person <input maxLength={60} value={person} onChange={e => setPerson(e.target.value)}/></label>
      <label>Status <select value={status} onChange={e => setStatus(e.target.value)}>
        {['unknown','safe','needs_help','not_home'].map(s => <option key={s}>{s}</option>)}</select></label>
      <button disabled={busy} onClick={() => run('report_person_status', { person, status }, 'Report check-in')}>Report check-in</button>
    </fieldset>
    <p>Show the timeline to load assessed actions. Each confirmation applies only to the displayed virtual action.</p>
    {actions.map(a => <article key={a.action_id}><h3>{a.proposal.action.replaceAll('_',' ')} · {a.proposal.device_id}</h3>
      <p>{a.status.replaceAll('_',' ')} — {a.result || a.policy_reason}</p>
      <button disabled={busy} onClick={() => run('get_action_status', { action_id: a.action_id })}>Read status</button>
      {a.status === 'allowed' && <button disabled={busy} onClick={() => run('request_safe_action', { action_id: a.action_id })}>Request virtual action</button>}
      {a.status === 'pending_confirmation' && <button disabled={busy || Date.now() >= a.expires_at * 1000}
        onClick={() => run('confirm_action', { action_id: a.action_id, confirm: true }, 'I confirm this virtual valve closure')}>Confirm this virtual valve closure</button>}
    </article>)}
    {cursor && <button disabled={busy} onClick={() => run('get_incident_timeline', { cursor }, 'Load more records')}>Load more records</button>}
    {error && <p role="alert">{error}</p>}
    <div aria-live="polite">{messages.map((m,i) => <article key={i}><p><b>You:</b> {m.phrase}</p><p><b>Aenea:</b> {m.reply}</p>
      <details><summary>Recorded evidence and tool result</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(m.data,null,2)}</pre></details></article>)}</div>
  </section>;
}
