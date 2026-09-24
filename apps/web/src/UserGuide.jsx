import React from 'react';

export default function UserGuide({ navigate }) {
  return <div className="guide-grid">
    <section className="card"><span className="eyebrow">GET STARTED</span><h2>Follow an incident from signal to response</h2>
      <ol className="guide-steps">
        <li><h3>Add locations and devices</h3><p>In Settings, create locations with your own names and optional addresses. Add devices with a name, room and type. Duplicate a device to create another sensor or camera. Simulation is the available connection method.</p></li>
        <li><h3>Compose and send signals</h3><p>In Simulation Studio, add device observations to the queue and select which to send. Choose a new or existing incident. Send selected signals together, or send the next signal and add more context later. The same run keeps its incident until you clear or replay the queue.</p></li>
        <li><h3>Review the response</h3><p>Open Command center to inspect evidence, the saved AI assessment and policy decisions. An accepted signal may take a moment to appear.</p></li>
        <li><h3>Coordinate through Alexa+</h3><p>Select an incident and refresh context and actions. Use suggested commands to check status, read check-ins or prepare a handoff. Valve approval is tied to the displayed assessment. If it changes, refresh and review the new proposal before confirming. Clearing local chat keeps incident history.</p></li>
        <li><h3>Check in and prepare a handoff</h3><p>Household keeps reports for the selected incident. Handoff prepares a timestamped summary for review or printing.</p></li>
      </ol><button className="primary" onClick={() => navigate('simulation-lab')}>Open Simulation lab</button>
    </section>
    <div><section className="card"><h2>Understand the controls</h2>
      <details open><summary>Incidents and signals</summary><p>An incident groups related evidence. A signal is one observation. You can send another signal later to the selected incident. Built-in scenarios send a sequence using their own controls.</p></details>
      <details><summary>Assessments and actions</summary><p>An assessment is the AI’s interpretation of available evidence. Policy checks determine whether a virtual action is allowed. A proposed or pending action is not a completed action; inspect the recorded result.</p></details>
      <details><summary>New evidence and decision review</summary><p>New signals advance the incident’s evidence revision. Older assessments stay in history, but cannot authorize new actions. Decision review shows the saved input, citations, uncertainties and policy reasons. You can agree or reject the current assessment; rejection blocks future execution, while agreement does not bypass device confirmation. Automatic assessment is limited to 20 signals per incident.</p></details>
      <details><summary>Check-ins</summary><p>“Reported safe” is a self-report for that incident, not verified safety. Motion does not identify people. Missing reports remain unknown.</p></details>
      <details><summary>Retries and session expiry</summary><p>After an uncertain write, refresh its saved status before retrying. The signal retry control reuses the original event. Access tokens refresh while your sign-in session remains valid.</p></details>
      <details><summary>Edit, delete and replay</summary><p>Settings saves locations and devices to your account. Delete or move devices before deleting their location. Catalog deletion does not erase past incident evidence. Signal drafts are kept in this browser tab; uncertain requests keep the same event ID for retry. Replay creates new events in a new incident. Sending several signals is sequential, not an atomic batch; receipts show which were accepted.</p></details>
      <details><summary>Delete incident data</summary><p>In Settings → Data controls, choose an incident and type its full ID to confirm. New work is blocked immediately. Background cleanup becomes eligible after 15 minutes and runs on a five-minute schedule. Refresh cleanup status; only “completed” means active database records and all stored S3 evidence versions have been removed. Minimal replay-blocking markers remain. Backups and service history follow separate retention settings. Locations and device settings are not deleted with an incident.</p></details>
    </section><section className="card"><h2>About this workspace</h2><p>Signals and device actions are simulated. The Alexa+ page is a browser simulator. Handoff does not contact emergency services.</p><p>The shared guest account is visible to other visitors. Use fictional names and observations.</p></section></div>
  </div>;
}
