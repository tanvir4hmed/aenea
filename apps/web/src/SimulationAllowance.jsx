import React, { useState } from 'react';

export default function SimulationAllowance({ api, incident, state, refresh }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const budget = state?.simulation_budget;
  if (!budget || state?.incident?.resolved_at) return null;
  const exhausted = budget.used >= budget.limit;
  return <div className="simulation-allowance"><span>Simulation allowance: {budget.used} / {budget.limit} reserved</span>
    <progress aria-label="Simulation allowance used" value={budget.used} max={budget.limit}/>
    {budget.used >= budget.limit * 0.8 && <p role="status">{exhausted ? 'Generation paused at the limit. Accepted events still process; alarms are not automatically cleared.' : 'Approaching the simulation limit.'}</p>}
    {budget.limit < budget.maximum && <button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api(`/incidents/${incident}/simulation-limit`, { method: 'POST', body: JSON.stringify({ limit: Math.min(budget.maximum, budget.limit + 2000) }) }); await refresh(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>Extend by {Math.min(2000, budget.maximum - budget.limit)}</button>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}
