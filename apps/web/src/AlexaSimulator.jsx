import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';
import { commands, commandFor, describe, canExecute } from './alexaConversation';

export default function AlexaSimulator({ config, incidents, selected, onSelect }) {
  const client = useMemo(() => createMcpClient(config), [config.apiUrl, config.clientId, config.cognitoDomain]);
  const [input, setInput] = useState(''), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [person, setPerson] = useState('Resident A'), [status, setStatus] = useState('unknown');
  const [actions, setActions] = useState([]), [readAloud, setReadAloud] = useState(false);
  const [context, setContext] = useState(null), [refreshedAt, setRefreshedAt] = useState(null);
  const [cursor, setCursor] = useState(null), [peopleCursor, setPeopleCursor] = useState(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef(null), lock = useRef(false), generation = useRef(0);
  useEffect(() => {
    generation.current += 1; lock.current = false; setBusy(false); setError(''); setActions([]); setCursor(null); setPeopleCursor(null); setMessages([]); setContext(null); setRefreshedAt(null);
    recognition.current?.abort(); setListening(false); window.speechSynthesis?.cancel();
    return () => { generation.current += 1; recognition.current?.abort(); window.speechSynthesis?.cancel(); };
  }, [selected]);
  function saveActions(data, append = false) {
    const rows = data.items.filter(item => item.action_id && item.proposal);
    setActions(old => [...new Map([...(append ? old : []), ...rows].map(action => [action.action_id, action])).values()]);
    setCursor(data.next_cursor);
  }
  async function run(tool, extra = {}, phrase = tool) {
    if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const version = generation.current;
    try {
      const data = await client.call(tool, { incident_id: selected, ...extra });
      if (version !== generation.current) return;
      const reply = describe(tool, data);
      setMessages(old => [...old.slice(-29), { phrase, reply, data, tool, time: new Date().toLocaleTimeString() }]);
      if (tool === 'get_incident_status') { setContext(data); setRefreshedAt(new Date().toLocaleTimeString()); }
      if (tool === 'get_incident_timeline') saveActions(data, !!extra.cursor);
      if (tool === 'get_household_status') setPeopleCursor(data.next_cursor);
      if (['confirm_action', 'request_safe_action', 'get_action_status'].includes(tool)) setActions(old => old.map(action => action.action_id === data.action_id ? data : action));
      if (readAloud && window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply)); }
    } catch (failure) { if (version === generation.current) setError(failure.message); }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  }
  async function refresh() {
    if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const version = generation.current;
    try {
      const state = await client.call('get_incident_status', { incident_id: selected });
      const records = await client.call('get_incident_timeline', { incident_id: selected });
      if (version !== generation.current) return;
      setContext(state); saveActions(records); setRefreshedAt(new Date().toLocaleTimeString());
    } catch (failure) { if (version === generation.current) setError(failure.message); }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  }
  function submit(event) {
    event.preventDefault(); const command = commandFor(input);
    if (!command) { setError('Choose a suggested command below. Device approvals use the explicit action buttons.'); return; }
    run(command.tool, {}, input);
  }
  function listen() {
    if (listening) { recognition.current?.abort(); setListening(false); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setError('Speech recognition is unavailable here. Type a command or use a button.'); return; }
    const version = generation.current;
    const mic = new Speech(); recognition.current = mic;
    mic.lang = 'en-US'; mic.interimResults = false;
    mic.onresult = event => { if (version === generation.current) setInput(event.results[0][0].transcript); };
    mic.onerror = () => { if (version === generation.current) { setError('Microphone stopped or unavailable. You can type instead.'); setListening(false); } };
    mic.onend = () => { if (version === generation.current) setListening(false); };
    try { mic.start(); setListening(true); } catch { setError('Unable to start microphone. Try a typed command.'); }
  }
  return <>
    <section className="card"><div className="row"><div><h2>Alexa+ coordination</h2><p>Web simulator · English commands · Saved incident state</p></div><button disabled={busy || !selected} onClick={refresh}>{busy ? 'Working…' : 'Refresh context and actions'}</button></div>
      <label>Incident<select value={selected} disabled={busy} onChange={event => onSelect(event.target.value)}><option value="">Choose an incident</option>{selected && !incidents.some(item => item.incident_id === selected) && <option value={selected}>{selected.slice(0, 8)}</option>}{incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{item.incident_id.slice(0, 8)}</option>)}</select></label>
      {!selected && <p>Select an incident, then refresh its context or ask a question.</p>}
      {context && <div className="context-bar"><span>Evidence revision {context.incident.event_count}</span><strong>{context.assessment_current ? 'Current assessment' : 'Awaiting current assessment'}</strong><span>Review: {context.incident.decision_review || 'unreviewed'}</span><span>Read at {refreshedAt}</span></div>}
      <form onSubmit={submit}><label>Command<input value={input} placeholder="What is happening?" onChange={event => setInput(event.target.value)} disabled={busy || !selected}/></label><div className="actions"><button className="primary" disabled={busy || !selected || !input.trim()}>Send command</button><button disabled={busy || !selected} type="button" aria-pressed={listening} onClick={listen}>{listening ? 'Stop microphone' : 'Use microphone'}</button></div></form>
      <label><input type="checkbox" checked={readAloud} onChange={event => { setReadAloud(event.target.checked); if (!event.target.checked) window.speechSynthesis?.cancel(); }}/>Read replies aloud</label>
      <p className="guest-warning">Microphone transcription uses your browser’s speech service. Review text before sending. This is not a native Alexa connection.</p>
      <div className="actions">{commands.map(command => <button key={command.tool} disabled={busy || !selected} onClick={() => run(command.tool, {}, command.phrase)}>{command.phrase}</button>)}</div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <div className="columns"><section className="card"><div className="row"><h2>Conversation</h2><button disabled={busy || !messages.length} onClick={() => { setMessages([]); window.speechSynthesis?.cancel(); }}>Clear local chat</button></div>
      {!messages.length && <p>Ask about evidence, check-ins or the response. Replies refer only to saved records.</p>}
      <div className="conversation" role="log" aria-label="Incident conversation" aria-relevant="additions">{messages.map((message, index) => <article className="conversation-turn" key={index}><small>{message.time}</small><p><strong>You:</strong> {message.phrase}</p><p><strong>Aenea:</strong> {message.reply}</p><details><summary>Source records</summary><pre className="evidence-json">{JSON.stringify(message.data, null, 2)}</pre></details></article>)}</div>
      {peopleCursor && <button disabled={busy} onClick={() => run('get_household_status', { cursor: peopleCursor }, 'Read more check-ins')}>Read more check-ins</button>}
    </section><div>
      <section className="card"><h2>Check in</h2><form onSubmit={event => { event.preventDefault(); run('report_person_status', { person: person.trim(), status }, `Report ${person.trim()}: ${status.replaceAll('_', ' ')}`); }}><fieldset disabled={busy || !selected}><legend>Simulated self-report</legend><label>Resident<input required pattern="[A-Za-z0-9 _\-]{1,60}" maxLength={60} value={person} onChange={event => setPerson(event.target.value)}/></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}>{Object.entries({ unknown: 'Unknown', safe: 'Reported safe', needs_help: 'Needs help', not_home: 'Reported away' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button disabled={!person.trim()}>Record check-in</button></fieldset></form></section>
      <section className="card"><h2>Coordinated actions</h2>{!context && <p>Refresh context and actions to see which proposals can be requested.</p>}{context && !actions.length && <p>No actions in the loaded records.</p>}
        {actions.map(action => { const eligible = canExecute(action, context); return <article className="catalog-item" key={action.action_id}><h3>{action.proposal.action.replaceAll('_', ' ')}</h3><p>{action.status.replaceAll('_', ' ')} · Revision {action.evidence_revision ?? 'legacy'}</p><p>{action.result || action.policy_reason}</p><div className="actions"><button disabled={busy} onClick={() => run('get_action_status', { action_id: action.action_id }, 'Read action outcome')}>Read outcome</button>
          {action.status === 'allowed' && <button disabled={busy || !eligible} onClick={() => run('request_safe_action', { action_id: action.action_id }, 'Request virtual action')}>Request virtual action</button>}
          {action.status === 'pending_confirmation' && <button disabled={busy || !eligible} onClick={() => run('confirm_action', { action_id: action.action_id, assessment_id: action.assessment_id, confirm: true }, 'Confirm this revision’s virtual valve closure')}>Confirm virtual valve closure</button>}</div>
          {!eligible && !['succeeded', 'failed'].includes(action.status) && <small>Refresh context. Outdated, expired or rejected proposals cannot execute.</small>}
        </article>; })}
        {cursor && <button disabled={busy} onClick={() => run('get_incident_timeline', { cursor }, 'Read more action records')}>Load more records</button>}
      </section>
    </div></div>
  </>;
}
