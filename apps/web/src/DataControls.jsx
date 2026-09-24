import React, { useEffect, useState } from 'react';

export default function DataControls({ api, incidents, onDeleted, onClearDrafts, disabled }) {
  const [target, setTarget] = useState(''), [confirmation, setConfirmation] = useState('');
  const [records, setRecords] = useState([]), [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function copyId() {
    try { await navigator.clipboard.writeText(target); setNotice('Full incident ID copied. Paste it into the confirmation field.'); }
    catch { setNotice('Copy is unavailable. Select the full ID below and copy it manually.'); }
  }
  async function load(next = null) {
    const result = await api('/household/deletions' + (next ? '?cursor=' + encodeURIComponent(next) : ''));
    setRecords(old => next ? [...new Map([...old, ...result.items].map(item => [item.incident_id, item])).values()] : result.items);
    setCursor(result.next_cursor);
  }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  async function perform(task) {
    if (busy || disabled) return;
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="card"><h2>Data controls</h2>
    <p>Delete an incident and its evidence, assessments, actions and check-ins from active storage. New signals and actions for that incident are blocked immediately.</p>
    <form onSubmit={event => { event.preventDefault(); perform(async () => {
      const result = await api(`/incidents/${target}/delete`, { method: 'POST', body: JSON.stringify({ confirm_incident_id: confirmation }) });
      onDeleted(target); setTarget(''); setConfirmation('');
      setNotice(result.cleanup_status === 'completed' ? 'Incident cleanup is complete.' : 'Deletion requested. Background cleanup starts after at least 15 minutes.');
      await load();
    }); }}><fieldset disabled={busy || disabled}><legend>Delete one incident</legend>
      <label>Incident<select required value={target} onChange={event => { setTarget(event.target.value); setConfirmation(''); }}><option value="">Choose an incident</option>{incidents.map(item => <option key={item.incident_id} value={item.incident_id}>{item.incident_id.slice(0, 8)} · {item.event_count} signals</option>)}</select></label>
      {target && <><p>Type this ID to confirm: <code>{target}</code> <button type="button" onClick={copyId}>Copy ID</button></p><label>Incident ID<input required value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off"/></label><p>This also clears this tab’s simulation queue when it contains signals for this incident. Deletion cannot be undone in the app.</p></>}
      <div className="actions"><button disabled={!target || confirmation !== target}>Delete incident and stored evidence</button></div>
    </fieldset></form>
    <p className="guest-warning">Cleanup removes all S3 evidence versions and active database records. A minimal deletion marker remains to block replays. Backups, workflow history and service logs expire under their separate retention settings. Deleting here does not purge those retained copies.</p>
    <div className="row"><h3>Cleanup status</h3><button disabled={busy || disabled} onClick={() => perform(() => load())}>Refresh cleanup status</button></div>
    {!records.length && <p>No deletion requests loaded.</p>}
    {records.map(item => <article className="catalog-item" key={item.incident_id}><strong>{item.incident_id.slice(0, 8)} · {item.cleanup_status}</strong><p>Requested {new Date(item.requested_at * 1000).toLocaleString()}{item.completed_at ? ` · Completed ${new Date(item.completed_at * 1000).toLocaleString()}` : ` · Eligible after ${new Date(item.eligible_at * 1000).toLocaleString()}`}</p>{item.cleanup_status === 'retrying' && <p>Cleanup is incomplete. The scheduled worker will retry; do not treat this as fully deleted.</p>}</article>)}
    {cursor && <button disabled={busy || disabled} onClick={() => perform(() => load(cursor))}>Load more cleanup requests</button>}
    <details><summary>Clear this browser’s simulation drafts</summary><p>Removes the local queue and pending retry payloads, without deleting server evidence. An uncertain signal may already have been accepted.</p><button disabled={busy || disabled} onClick={() => { if (window.confirm('Clear this tab’s simulation queue, including uncertain requests? Saved incidents remain.')) { onClearDrafts(); setNotice('Local simulation queue cleared.'); } }}>Clear local drafts</button></details>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
