import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createMcpClient } from './mcp';
import { commands, commandFor, describe, conversationKey, readConversation, writeConversation, finalTranscriptOnce } from './alexaConversation';
import { readableText, signalDetails } from './liveAssistance';
import { incidentLabel, incidentName } from './incidentNames';
import { incidentBriefing } from './commandCenter';
import { Icon } from './AppShell';
import './live-assistance.css';

const words = value => readableText(value || 'unknown');
const icons = { smoke: '🔥', carbon_monoxide: '⚠', water_leak: '💧', medical_sos: '✚', severe_weather: '⛈', motion: '◉', doorbell: '♧' };
const dateLabel = value => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function AlexaSimulator({ config, api, incidents, selected, onSelect, state, timeline = [], onRefresh, navigate, catalog, household, onViewDevice }) {
  const client = useMemo(() => createMcpClient(config), [config.apiUrl, config.clientId, config.cognitoDomain]);
  const [input, setInput] = useState(''), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [readAloud, setReadAloud] = useState(false);
  const [listening, setListening] = useState(false), [now, setNow] = useState(Date.now());
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const recognition = useRef(null), generation = useRef(0), lock = useRef(false), spoken = useRef({ at: 0, id: '', severity: '' });
  const messagesRef = useRef([]), historyLog = useRef(null);
  const storageKey = conversationKey(household || state?.household_id, selected);
  const activeKey = useRef(storageKey); activeKey.current = storageKey;
  const briefing = state?.briefing;
  const briefingCurrent = !state?.refreshing && briefing && briefing.resolved === !!state?.incident?.resolved_at && briefing.evidence_revision === state?.incident?.event_count && briefing.assessment_id === state?.incident?.latest_assessment && (briefing.note_revision || 0) === (state?.incident?.note_revision || 0) && state?.incident?.decision_review !== 'rejected';
  const text = readableText(briefingCurrent ? briefing.text : incidentBriefing(state, selected));
  const severity = state?.incident?.resolved_at ? 'resolved' : state?.canonical_severity || 'waiting';
  const currentIncident = state?.incident || incidents.find(item => item.incident_id === selected) || { incident_id: selected };
  const locationName = catalog?.locations?.find(item => item.id === currentIncident.location_id)?.name;
  const signals = state?.active_devices?.map(device => ({ ...device, display: signalDetails(device, catalog, timeline) }));
  const missingSignalContext = signals?.some(device => device.display.missingContext);
  const connection = !selected ? 'Ready for a signal' : !state?.receivedAt ? 'Loading incident…'
    : state.refreshing ? 'Saved view · awaiting update' : state.incident?.resolved_at
      ? now - state.receivedAt > 90000 ? 'Updates delayed' : 'Resolved · checking every minute'
      : now - state.receivedAt > 30000 ? 'Updates delayed' : 'Connected · checking every 10s';

  function speak(value) { if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(value)); } }
  function stopListening() { const mic = recognition.current; recognition.current = null; mic?.abort(); setListening(false); }
  useEffect(() => {
    generation.current += 1; lock.current = false; setBusy(false); setError(''); setInput('');
    const saved = readConversation(window.localStorage, storageKey); messagesRef.current = saved; setMessages(saved); setStorageUnavailable(false);
    stopListening(); window.speechSynthesis?.cancel(); spoken.current = { at: 0, id: '', severity: '' };
    return () => { generation.current += 1; const mic = recognition.current; recognition.current = null; mic?.abort(); window.speechSynthesis?.cancel(); };
  }, [storageKey, selected]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (historyLog.current) historyLog.current.scrollTop = historyLog.current.scrollHeight; }, [messages]);
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
    lock.current = true; setBusy(true); setError('');
    try { await task(current); } catch (failure) { if (current()) setError(failure.message); }
    finally { if (current()) { lock.current = false; setBusy(false); } }
  }
  async function run(tool, args = {}, phrase = tool) {
    await perform(async current => {
      const data = await client.call(tool, { incident_id: selected, ...args });
      if (!current()) return;
      const reply = describe(tool, data); appendReply(phrase, reply);
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
    <div className="live-grid live-overview-grid">
      <section className={'card assistance-hero severity-' + severity} aria-busy={!!selected && (!state || state.refreshing)}>
        <div className="hero-heading"><span className="eyebrow">ALEXA+ · INCIDENT ASSISTANCE</span><span className="severity-label">{words(severity)}</span></div>
        <div className="briefing-heading"><div className="voice-emblem" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 28v8m10-17v26m10-34v42m10-34v26m10-17v8"/></svg></div>
          <div>{locationName && <span className="hero-location">{locationName}</span>}<h2>{selected ? incidentName(currentIncident) : 'Ready when a signal arrives'}</h2></div>
        </div>
        <div className="assistance-brief" role="status" aria-live="polite"><p>{selected ? text : 'Add your devices, prepare a simulation, then send an alert from Command Center.'}</p></div>
        <div className="actions hero-controls"><button className="primary" disabled={!selected || !state || state.refreshing} onClick={() => speak(text)}>Listen to briefing</button>
          <button aria-pressed={readAloud} onClick={() => { setReadAloud(value => !value); if (readAloud) window.speechSynthesis?.cancel(); }}>{readAloud ? 'Spoken updates on · Mute' : 'Enable spoken updates'}</button>
        </div>
        <p className="hero-footnote">Browser simulation · Spoken updates need this page open.</p>
        {state?.receivedAt && <p className="hero-footnote">Status received {dateLabel(state.receivedAt)}.{state.last_reported_at ? ` Latest signal occurred ${dateLabel(state.last_reported_at)}.` : ' Latest signal time is unavailable.'} A recent refresh does not verify conditions at the location.</p>}
        {!selected && navigate && <div className="actions"><button onClick={() => navigate(catalog?.devices?.length ? 'command-center' : 'settings')}>{catalog?.devices?.length ? 'Open map & trigger an alert' : 'Set up your devices'}</button></div>}
      </section>

      <section className="card live-signals"><div className="row"><h2>Active signals</h2>{navigate && <button onClick={() => navigate('command-center')}>View map</button>}</div>
        {!state ? <p>{selected ? 'Loading device reports…' : 'Signals appear here when an incident starts.'}</p> : signals === undefined ? <p>Current device state is updating.</p> : !signals.length ? <p>No active signals in the received incident data.</p> : <div className="signal-grid">{signals.map(device => <button type="button" className={'signal-tile signal-' + (device.level || 'normal')} key={device.device_id} onClick={() => onViewDevice ? onViewDevice(device.device_id) : navigate?.('command-center')} aria-label={'View ' + device.display.name + ' on map'}>
          <span className="signal-icon" aria-hidden="true">{icons[device.kind] || '◉'}</span><div><h3>{device.display.name}</h3><p>{device.display.place}</p><small>{words(device.kind)}{device.alarm === 'unknown' ? ' · state unverified' : ''}{device.display.currentName ? ' · name from current settings' : ''}</small></div>
        </button>)}</div>}
        {missingSignalContext && <p className="signal-context-note">Some older reports have no saved location details. Current settings cannot verify where those historical signals occurred.</p>}
      </section>
      <section className="card conversation-panel"><h2 className="ask-heading"><Icon name="voice"/>Ask Alexa+</h2><p className="ask-intro">Ask about this incident’s signals and assessment.</p>
        <form className="alexa-command" onSubmit={event => { event.preventDefault(); stopListening(); ask(); }}>
          <label className="sr-only" htmlFor="incident-question">Your question</label><input id="incident-question" maxLength={600} value={input} onChange={event => setInput(event.target.value)} placeholder="Which devices reported?" disabled={busy || !selected}/>
          <div className="actions"><button className="primary" disabled={busy || !selected || !storageKey || !input.trim()}>{busy ? 'Finding answer…' : 'Ask'}</button><button type="button" aria-pressed={listening} disabled={busy || !selected || !storageKey} onClick={listen}>{listening ? 'Cancel listening' : 'Use microphone'}</button></div>
          <p className="voice-instruction" role="status">{listening ? 'Listening… Your question sends when you finish.' : ''}</p>
        </form>
        <div className="question-shortcuts">{commands.map(command => <button key={command.tool} disabled={busy || listening || !selected || !storageKey} onClick={() => run(command.tool, {}, command.phrase)}>{command.label}</button>)}</div>
        <div className="conversation-heading"><h3>Conversation</h3>{!!messages.length && <button disabled={busy} onClick={() => { messagesRef.current = []; setMessages([]); try { window.localStorage.removeItem(storageKey); } catch { /* Optional storage. */ } }}>Clear</button>}</div>
        {storageUnavailable && <p className="history-notice">Replies could not be saved in this browser.</p>}
        <div className="conversation-log" ref={historyLog} role="log" aria-label="Incident conversation history" aria-live="polite">{!messages.length && <p className="conversation-empty">{selected ? 'Your answers will appear here.' : 'Select an incident to ask a question.'}</p>}{messages.map((message, index) => <article className="conversation-turn" key={message.at + ':' + index}><time dateTime={new Date(message.at).toISOString()}>{dateLabel(message.at)}{message.source === 'voice' ? ' · voice' : ''}</time><strong>{message.phrase}</strong><p>{message.reply}</p></article>)}</div>
        <details className="alexa-help"><summary>Examples & privacy</summary><p>“What changed?” · “Is the assessment current?” · “Show the timeline.”</p><small>English microphone questions send automatically using your browser’s speech service. Up to 20 replies are saved here for 7 days; sign out or Clear removes them.</small></details>
      </section>
    </div>
  </div>;
}
