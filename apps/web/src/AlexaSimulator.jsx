import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';
import { commands, commandFor, describe, canExecute, conversationKey, readConversation, writeConversation, finalTranscriptOnce } from './alexaConversation';
import { actionExplanation, actionLabel, actionName, actionStatusLabel, readableText, responseGroups, signalDetails } from './liveAssistance';
import { incidentLabel, incidentName } from './incidentNames';
import { incidentBriefing } from './commandCenter';
import IncidentNote from './IncidentNote';
import './live-assistance.css';

const words = value => readableText(value || 'unknown');
const icons = { smoke: '🔥', carbon_monoxide: '⚠', water_leak: '💧', medical_sos: '✚', severe_weather: '⛈', motion: '◉', doorbell: '♧' };
const dateLabel = value => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function AlexaSimulator({ config, api, incidents, selected, onSelect, state, timeline = [], onRefresh, navigate, catalog, household, view = 'overview' }) {
  const client = useMemo(() => createMcpClient(config), [config.apiUrl, config.clientId, config.cognitoDomain]);
  const [input, setInput] = useState(''), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [readAloud, setReadAloud] = useState(false);
  const [listening, setListening] = useState(false), [now, setNow] = useState(Date.now());
  const [allActions, setAllActions] = useState(false), [notice, setNotice] = useState(''), [storageUnavailable, setStorageUnavailable] = useState(false);
  const recognition = useRef(null), generation = useRef(0), lock = useRef(false), spoken = useRef({ at: 0, id: '', severity: '' });
  const messagesRef = useRef([]), historyLog = useRef(null);
  const storageKey = conversationKey(household || state?.household_id, selected);
  const activeKey = useRef(storageKey); activeKey.current = storageKey;
  const briefing = state?.briefing;
  const context = { ...state, assessment: state?.latest_assessment };
  const actions = state?.actions || timeline.filter(item => item.action_id && item.proposal);
  const briefingCurrent = !state?.refreshing && briefing && briefing.resolved === !!state?.incident?.resolved_at && briefing.evidence_revision === state?.incident?.event_count && briefing.assessment_id === state?.incident?.latest_assessment && (briefing.note_revision || 0) === (state?.incident?.note_revision || 0) && state?.incident?.decision_review !== 'rejected';
  const text = readableText(briefingCurrent ? briefing.text : incidentBriefing(state, selected));
  const eligible = action => canExecute(action, context, now);
  const responses = responseGroups(actions, context, catalog, eligible);
  const pending = responses.visible.filter(action => action.status === 'pending_confirmation' && eligible(action));
  const severity = state?.incident?.resolved_at ? 'resolved' : state?.canonical_severity || 'waiting';
  const currentIncident = state?.incident || incidents.find(item => item.incident_id === selected) || { incident_id: selected };
  const locationName = catalog?.locations?.find(item => item.id === currentIncident.location_id)?.name;
  const signals = state?.active_devices?.map(device => ({ ...device, display: signalDetails(device, catalog, timeline) }));
  const missingSignalContext = signals?.some(device => device.display.missingContext);
  const connection = !selected ? 'Ready for a signal' : !state?.receivedAt ? 'Loading incident…'
    : state.refreshing ? 'Saved view · awaiting update' : now - state.receivedAt > 30000 ? 'Updates delayed' : 'Connected · checking every 10s';

  function speak(value) { if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(value)); } }
  function stopListening() { const mic = recognition.current; recognition.current = null; mic?.abort(); setListening(false); }
  useEffect(() => {
    generation.current += 1; lock.current = false; setBusy(false); setError(''); setInput(''); setAllActions(false); setNotice('');
    const saved = readConversation(window.localStorage, storageKey); messagesRef.current = saved; setMessages(saved); setStorageUnavailable(false);
    stopListening(); window.speechSynthesis?.cancel(); spoken.current = { at: 0, id: '', severity: '' };
    return () => { generation.current += 1; const mic = recognition.current; recognition.current = null; mic?.abort(); window.speechSynthesis?.cancel(); };
  }, [storageKey, selected]);
  useEffect(() => { if (view !== 'ask') stopListening(); }, [view]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (historyLog.current) historyLog.current.scrollTop = historyLog.current.scrollHeight; }, [messages, view]);
  useEffect(() => {
    if (!readAloud || !briefingCurrent || !briefing?.id || spoken.current.id === briefing.id) return;
    const urgent = briefing.severity === 'urgent' && spoken.current.severity !== 'urgent';
    if (now - spoken.current.at < 30000 && !urgent) return;
    speak(text); spoken.current = { id: briefing.id, at: now, severity: briefing.severity };
  }, [briefing?.id, briefingCurrent, readAloud, now]);

  function appendReply(phrase, reply, source = 'text') {
    const next = [...messagesRef.current.slice(-19), { phrase, reply: readableText(reply), at: Date.now(), source }];
    messagesRef.current = next; setMessages(next);
    setStorageUnavailable(!writeConversation(window.localStorage, storageKey, next));
  }
  async function perform(task) {
    if (!selected || !storageKey || lock.current) return;
    const version = generation.current, key = storageKey;
    const current = () => version === generation.current && activeKey.current === key;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(current); } catch (failure) { if (current()) setError(failure.message); }
    finally { if (current()) { lock.current = false; setBusy(false); } }
  }
  async function run(tool, args = {}, phrase = tool) {
    await perform(async current => {
      const data = await client.call(tool, { incident_id: selected, ...args });
      if (!current()) return;
      const reply = describe(tool, data); appendReply(phrase, reply);
      if (tool === 'confirm_action') setNotice(reply);
      if (!tool.startsWith('get_')) await onRefresh();
    });
  }
  function ask(value = input, source = 'text') {
    const question = value.trim();
    if (!question || lock.current) return;
    if (question.length > 600) { setError('Please ask a shorter question (up to 600 characters).'); return; }
    const command = commandFor(question);
    if (command && !(source === 'voice' && command.tool === 'acknowledge_incident')) { setInput(''); run(command.tool, {}, question); return; }
    perform(async current => {
      const result = await api('/incidents/' + selected + '/message', { method: 'POST', body: JSON.stringify({ text: question, ...(source === 'voice' ? { read_only: true } : {}) }) });
      if (!current()) return;
      appendReply(question, result.answer || (result.tool ? describe(result.tool, result.data) : result.message), source); setInput('');
      if (result.tool === 'acknowledge_incident') await onRefresh();
    });
  }
  function listen() {
    if (listening) { stopListening(); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setError('Microphone unavailable. Type your question instead.'); return; }
    const mic = new Speech(), version = generation.current, key = storageKey;
    const current = () => recognition.current === mic && generation.current === version && activeKey.current === key;
    recognition.current = mic; mic.lang = 'en-US'; mic.interimResults = true; mic.continuous = false;
    mic.onresult = finalTranscriptOnce(current, transcript => { setInput(transcript); setListening(false); ask(transcript, 'voice'); });
    mic.onerror = event => { if (current()) { setError(event.error === 'no-speech' ? 'No speech detected. Try the microphone again or type your question.' : 'Microphone unavailable. You can type instead.'); setListening(false); } };
    mic.onend = () => { if (current()) { recognition.current = null; setListening(false); } };
    try { mic.start(); setListening(true); setError(''); } catch { recognition.current = null; setError('Unable to start microphone. Use text instead.'); }
  }

  return <div className="live-experience">
    <div className="live-toolbar">
      <label>Incident<select value={selected} onChange={event => onSelect(event.target.value)}><option value="">Choose an incident</option>
        {selected && !incidents.some(item => item.incident_id === selected) && <option value={selected}>{incidentLabel({ incident_id: selected })}</option>}
        {incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{incidentLabel(item)}</option>)}
      </select></label>
      <div className="live-connection"><span role="status">{connection}</span><button disabled={busy || !selected || !storageKey} onClick={() => perform(() => onRefresh())}>Refresh</button></div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {view === 'overview' ? <div className="live-grid live-overview-grid">
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
        {state?.receivedAt && <p className="hero-footnote">Status received {dateLabel(state.receivedAt)}.{state.last_reported_at ? ` Latest signal occurred ${dateLabel(state.last_reported_at)}.` : ' Latest signal time is unavailable.'} A recent refresh does not verify conditions at the location.</p>}
        {!selected && navigate && <div className="actions"><button onClick={() => navigate(catalog?.devices?.length ? 'command-center' : 'settings')}>{catalog?.devices?.length ? 'Open map & trigger an alert' : 'Set up your devices'}</button></div>}
      </section>

      <section className="card response-panel"><div className="row"><h2>Coordinated response</h2>{pending.length > 0 && <span className="attention-count">{pending.length} to confirm</span>}</div>
        <p>{pending.length ? 'These simulated actions need your confirmation.' : state?.refreshing ? 'Checking the latest decisions…' : 'Responses from configured outputs, with their saved outcomes.'}</p>
        {!responses.visible.length && <div className="quiet-state"><strong>{selected ? 'No current response to confirm' : 'Waiting for an incident'}</strong><p>{selected ? 'Sensors report signals. Separate output devices handle notifications, lights, alarms or a simulated valve.' : 'An incoming signal starts assessment automatically.'}</p></div>}
        {responses.visible.slice(0, allActions ? undefined : 4).map(action => <article className={'response-item response-' + action.status} key={action.action_id}>
          <div className="row"><h3>{actionName(action)}</h3><span className="badge">{actionStatusLabel(action)}</span></div>
          <p>{actionExplanation(action)}</p>
          {action.status === 'pending_confirmation' && <div className="actions"><button className="primary" disabled={busy || !eligible(action)} onClick={() => run('confirm_action', { action_id: action.action_id, assessment_id: action.assessment_id, confirm: true }, actionLabel(action))}>{actionLabel(action)} · Confirm</button></div>}
        </article>)}
        {responses.visible.length > 4 && <button onClick={() => setAllActions(value => !value)}>{allActions ? 'Show fewer responses' : 'View all ' + responses.visible.length + ' responses'}</button>}
        {!!responses.history.length && <details className="response-history"><summary>Earlier or unavailable proposals · {responses.history.length}</summary><p>These records are retained for review. Older generic outputs, removed devices and expired proposals cannot be confirmed here. A blocked output does not invalidate a sensor report.</p>
          {responses.history.map(action => <article key={action.action_id}><strong>{actionName(action)}</strong><span>{actionStatusLabel(action)}</span><p>{actionExplanation(action)}</p></article>)}
        </details>}
        {navigate && <p className="response-settings">Set up outputs in <button className="inline-button" onClick={() => navigate('settings', 'permissions')}>Settings → Response permissions</button>.</p>}
        {navigate && selected && <a className="detail-link" href="/incident-history" onClick={event => { event.preventDefault(); navigate('incident-history'); }}>Review decisions & evidence →</a>}
      </section>

      <section className="card live-signals"><div className="row"><h2>Active signals</h2>{navigate && <button onClick={() => navigate('command-center')}>View map</button>}</div>
        {!state ? <p>{selected ? 'Loading device reports…' : 'Select an incident to see its reported signals.'}</p> : signals === undefined ? <p>Current device state is updating.</p> : !signals.length ? <p>No active signals in the received incident data.</p> : <div className="signal-grid">{signals.map(device => <article className={'signal-tile signal-' + (device.level || 'normal')} key={device.device_id}>
          <span className="signal-icon" aria-hidden="true">{icons[device.kind] || '◉'}</span><div><h3>{device.display.name}</h3><p>{device.display.place}</p><small>{words(device.kind)}{device.alarm === 'unknown' ? ' · state unverified' : ''}{device.display.currentName ? ' · name from current settings' : ''}</small></div>
        </article>)}</div>}
        {missingSignalContext && <p className="signal-context-note">Some older reports have no saved location details. Current settings cannot verify where those historical signals occurred.</p>}
      </section>
    </div> : <div className="live-grid live-ask-grid">
      <section className="card conversation-panel"><h2>Ask Alexa+</h2><p>Ask one question about the selected incident. Answers use its saved evidence.</p>
        <form className="alexa-command" onSubmit={event => { event.preventDefault(); stopListening(); ask(); }}>
          <label>What would you like to know?<input maxLength={600} value={input} onChange={event => setInput(event.target.value)} placeholder="Is anyone confirmed to be at home?" disabled={busy || !selected}/></label>
          <div className="actions"><button className="primary" disabled={busy || !selected || !storageKey || !input.trim()}>{busy ? 'Finding answer…' : 'Ask'}</button><button type="button" aria-pressed={listening} disabled={busy || !selected || !storageKey} onClick={listen}>{listening ? 'Cancel listening' : 'Use microphone'}</button></div>
          <p className={'voice-instruction' + (listening ? ' is-listening' : '')} role="status">{listening ? 'Listening… Pause when finished; your question sends automatically. Cancel stops listening.' : 'Microphone questions send automatically when you finish speaking. Approvals still need a button click.'}</p>
        </form>
        <div className="question-shortcuts">{commands.map(command => <button key={command.tool} disabled={busy || listening || !selected || !storageKey} onClick={() => run(command.tool, {}, command.phrase)}>{command.label}</button>)}</div>
        <details className="alexa-help"><summary>Example questions & voice privacy</summary><p>“Which devices reported?” · “Is anybody in the house?” · “Is the assessment current?” English transcription uses your browser’s speech service.</p></details>
        <div className="conversation-heading"><h3>Conversation history</h3>{!!messages.length && <button disabled={busy} onClick={() => { messagesRef.current = []; setMessages([]); try { window.localStorage.removeItem(storageKey); } catch { /* Session-only history is also cleared. */ } }}>Clear history</button>}</div>
        <p className="history-notice">{storageUnavailable ? 'Browser storage is unavailable; these replies last until you leave this page.' : 'Last 20 replies for this incident are saved in this browser for up to 7 days. Sign out or clear local drafts to remove them.'} Earlier answers reflect the evidence at the time.</p>
        <div className="conversation-log" ref={historyLog} role="log" aria-label="Incident conversation history" aria-live="polite">{!messages.length && <p className="quiet-state">Your questions and answers will appear here.</p>}{messages.map((message, index) => <article className="conversation-turn" key={message.at + ':' + index}><time dateTime={new Date(message.at).toISOString()}>{dateLabel(message.at)}{message.source === 'voice' ? ' · voice question' : ''}</time><strong>{message.phrase}</strong><p>{message.reply}</p></article>)}</div>
      </section>
      <IncidentNote key={selected} api={api} selected={selected} state={state} onRefresh={onRefresh}/>
    </div>}
  </div>;
}
