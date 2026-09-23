import React from 'react';

export default function UserGuide({ navigate }) {
  return <div className="guide-grid">
    <section className="card"><span className="eyebrow">GET STARTED</span><h2>Follow an incident from signal to response</h2>
      <ol className="guide-steps">
        <li><h3>Send a signal</h3><p>In Simulation lab, choose a signal and select “Start new incident with signal”. To add context later, select that incident and choose “Add signal to selected incident”.</p></li>
        <li><h3>Review the response</h3><p>Open Command center to inspect evidence, the saved AI assessment and policy decisions. An accepted signal may take a moment to appear.</p></li>
        <li><h3>Coordinate through Alexa+</h3><p>The web simulator reads the same incident records. Use its supported phrases or buttons to check status, report a person’s status and review actions.</p></li>
        <li><h3>Check in and prepare a handoff</h3><p>Household keeps reports for the selected incident. Handoff prepares a timestamped summary for review or printing.</p></li>
      </ol><button className="primary" onClick={() => navigate('simulation-lab')}>Open Simulation lab</button>
    </section>
    <div><section className="card"><h2>Understand the controls</h2>
      <details open><summary>Incidents and signals</summary><p>An incident groups related evidence. A signal is one observation. You can send another signal later to the selected incident. Built-in scenarios send a sequence using their own controls.</p></details>
      <details><summary>Assessments and actions</summary><p>An assessment is the AI’s interpretation of available evidence. Policy checks determine whether a virtual action is allowed. A proposed or pending action is not a completed action; inspect the recorded result.</p></details>
      <details><summary>Check-ins</summary><p>“Reported safe” is a self-report for that incident, not verified safety. Motion does not identify people. Missing reports remain unknown.</p></details>
      <details><summary>Retries and session expiry</summary><p>After an uncertain write, refresh its saved status before retrying. The signal retry control reuses the original event. Access tokens refresh while your sign-in session remains valid.</p></details>
    </section><section className="card"><h2>About this workspace</h2><p>Signals and device actions are simulated. The Alexa+ page is a browser simulator. Handoff does not contact emergency services.</p><p>The shared guest account is visible to other visitors. Use fictional names and observations.</p></section></div>
  </div>;
}
