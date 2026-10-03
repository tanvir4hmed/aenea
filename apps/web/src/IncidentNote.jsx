import React, { useEffect, useRef, useState } from 'react';

export default function IncidentNote({ api, selected, state, onRefresh }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const request = useRef(null), generation = useRef(0), lock = useRef(false);
  const key = `aenea-note-${state?.household_id || ''}-${selected}`;
  useEffect(() => {
    generation.current++; lock.current = false; setBusy(false); setMessage('');
    try { request.current = JSON.parse(sessionStorage.getItem(key)); setText(request.current?.text || ''); }
    catch { request.current = null; setText(''); }
    return () => { generation.current++; };
  }, [key]);
  function edit(value) {
    setText(value);
    request.current = { request_id: crypto.randomUUID(), text: value };
    sessionStorage.setItem(key, JSON.stringify(request.current));
  }
  async function save(event) {
    event.preventDefault();
    if (lock.current || !selected || !text.trim()) return;
    const version = generation.current;
    lock.current = true; setBusy(true); setMessage('');
    const payload = request.current?.text === text.trim() ? request.current : { request_id: crypto.randomUUID(), text: text.trim() };
    request.current = payload; sessionStorage.setItem(key, JSON.stringify(payload));
    try {
      await api(`/incidents/${selected}/notes`, { method: 'POST', body: JSON.stringify(payload) });
      sessionStorage.removeItem(key);
      if (generation.current !== version) return;
      request.current = null; setText(''); setMessage('Context saved. The agent will reassess it.');
      await onRefresh();
    } catch (error) { if (generation.current === version) setMessage(error.message); }
    finally { if (generation.current === version) { lock.current = false; setBusy(false); } }
  }
  return <section className="card incident-note"><h2>Add context</h2><p>Something the sensors cannot report? Add a short note.</p>
    <form className="incident-note-form" onSubmit={save}>
      <label>Optional note<textarea rows={2} maxLength={1000} value={text} onChange={event => edit(event.target.value)} placeholder="For example: water is coming from under the sink" disabled={!selected || busy}/></label>
      <button className="primary" disabled={busy || !selected || !!state?.incident?.resolved_at || !text.trim()}>{busy ? 'Saving…' : 'Save note'}</button>
    </form>
    {message && <p role="status">{message}</p>}
    {!!state?.notes?.items?.length && <details><summary>Saved notes · {state.notes.total || state.notes.items.length}</summary>
      {state.notes.items.map(item => <article key={item.sk}><p>{item.data.text}</p><small>{new Date(item.recorded_at).toLocaleString()} · reported context</small></article>)}
      {state.notes.partial && <small>Older notes are in Incident history.</small>}
    </details>}
  </section>;
}
