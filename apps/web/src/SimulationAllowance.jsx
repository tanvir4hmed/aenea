import React, { useEffect, useRef, useState } from 'react';

export default function SimulationAllowance({ api, incident, state, refresh }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0), locked = useRef(false);
  useEffect(() => {
    generation.current += 1; locked.current = false; setBusy(false); setError(''); setNotice('');
    return () => { generation.current += 1; };
  }, [incident]);
  const budget = state?.simulation_budget;
  if (!budget || state?.incident?.resolved_at) return null;
  const exhausted = budget.used >= budget.limit;
  async function extend() {
    if (locked.current) return;
    const version = generation.current;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const saved = await api(`/incidents/${incident}/simulation-limit`, { method: 'POST', body: JSON.stringify({ limit: Math.min(budget.maximum, budget.limit + 2000) }) });
      if (version !== generation.current) return;
      setNotice(`Practice limit saved: ${saved.limit.toLocaleString()} signals. Resume any paused run in Command Center.`);
      await refresh();
    } catch (failure) {
      if (version !== generation.current) return;
      setError(failure.status === 409 ? 'The incident or limit changed. Refresh this incident before trying again.' : failure.message);
      if (failure.status === 409) await refresh().catch(() => {});
    } finally { if (version === generation.current) { locked.current = false; setBusy(false); } }
  }
  return <details className="simulation-allowance" open={budget.used >= budget.limit * 0.8 ? true : undefined}>
    <summary>Practice signal limit · {budget.used.toLocaleString()} of {budget.limit.toLocaleString()} used</summary>
    <p>This limit controls generated test signals for this incident. It does not measure risk or resolve the incident.</p>
    <progress aria-label="Practice signals used" value={budget.used} max={budget.limit}/>
    {budget.used >= budget.limit * 0.8 && <p role="status">{exhausted ? 'Test generation paused at the limit. Increase the limit, then resume the run in Command Center.' : 'Approaching the practice limit.'}</p>}
    {budget.limit < budget.maximum && <button disabled={busy || state.refreshing} onClick={extend}>{busy ? 'Saving limit…' : `Allow ${Math.min(2000, budget.maximum - budget.limit).toLocaleString()} more test signals`}</button>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </details>;
}
