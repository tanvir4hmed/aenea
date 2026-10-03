import React, { useEffect, useRef, useState } from 'react';

export default function SimulationRuns({ api, household, started, onSelect, active = true }) {
  const [runs, setRuns] = useState([]), [cursor, setCursor] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), pageCursor = useRef(null);
  const known = useRef([]);
  useEffect(() => { known.current = runs; }, [runs]);
  const [visibleCount, setVisibleCount] = useState(20);
  useEffect(() => { if (started) { setRuns(old => [started, ...old.filter(run => run.id !== started.id)]); localStorage.setItem('aenea-last-run-' + household, started.id); } }, [started]);
  async function refresh(more = false) {
    if (lock.current) return;
    lock.current = true;
    try {
      const result = await api('/household/runs' + (more && pageCursor.current ? '?cursor=' + encodeURIComponent(pageCursor.current) : ''));
      const last = localStorage.getItem('aenea-last-run-' + household);
      if (!more) {
        const pending = known.current.filter(run => ['running', 'paused'].includes(run.status) && !result.items.some(item => item.id === run.id));
        for (const run of pending) {
          try { result.items.push(await api('/household/runs/' + run.id)); }
          catch (failure) { if (failure.status !== 404) throw failure; setRuns(old => old.filter(item => item.id !== run.id)); }
        }
      }
      if (last && !result.items.some(run => run.id === last)) {
        try { result.items.unshift(await api('/household/runs/' + last)); } catch (failure) { if (failure.status !== 404) throw failure; localStorage.removeItem('aenea-last-run-' + household); }
      }
      setRuns(old => [...new Map([...old, ...result.items].map(run => [run.id, run])).values()].sort((a, b) => b.created_at - a.created_at));
      if (more || pageCursor.current === null) { pageCursor.current = result.next_cursor || ''; setCursor(result.next_cursor); }
      setError('');
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; }
  }
  useEffect(() => { if (!active) return; let mounted = true; const tick = () => { if (mounted && !document.hidden) refresh(); }; tick(); const timer = setInterval(tick, 10000); return () => { mounted = false; clearInterval(timer); }; }, [household, active]);
  async function control(run, action) {
    setBusy(true);
    try { const result = await api('/household/runs/' + run.id, { method: 'POST', body: JSON.stringify({ action }) }); setRuns(old => old.map(item => item.id === run.id ? result : item)); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <details className="simulation-runs" open={runs.some(run => ['running', 'paused'].includes(run.status))}><summary>Simulation runs</summary>
    {error && <p role="alert" className="error">{error}</p>}
    {!runs.length && <p>No runs yet.</p>}
    {runs.slice(0, visibleCount).map(run => <article key={run.id} className="catalog-item"><strong>{run.names.join(' + ')}</strong><p>{run.status} · {run.accepted}/{run.expected} published</p><small>{run.message}</small><div className="actions">{run.incident_ids.map(id => <button key={id} onClick={() => onSelect(id)}>View incident {id.slice(0, 8)}</button>)}{['running', 'paused'].includes(run.status) && <button disabled={busy} onClick={() => control(run, 'stop')}>Stop run</button>}{run.status === 'paused' && <button disabled={busy} onClick={() => control(run, 'resume')}>Resume pending</button>}</div></article>)}
    {(cursor || runs.length > visibleCount) && <button onClick={() => { setVisibleCount(value => value + 20); if (cursor) refresh(true); }}>Load more runs</button>}
  </details>;
}
