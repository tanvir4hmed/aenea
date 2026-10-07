import React from 'react';
import './userGuide.css';

const steps = [
  { title: 'Sign in', page: 'alexa-sim', link: 'Open Live assistance', instructions: [
    'On the welcome screen, reveal or copy the displayed guest credentials. Open guest sign in, enter them and sign in.',
    'There is no public sign-up. Your own account has its own records; visitors using the same guest account share its test data.',
  ], result: 'A new account opens Maple House with 24 simulated devices in 10 rooms. No alerts or incidents are created just by signing in.' },
  { title: 'Check your devices', page: 'settings', link: 'Open Settings', instructions: [
    'Open Settings → Device list. Find a device by name, room or type. The supplied devices are enough for your first test.',
    'To add one: choose Add device, select Room / area and Type, check its name, leave Enabled checked, then press Add device.',
    'Use Edit, Duplicate or Delete beside a device to manage it. Rooms and Maple House are fixed; no location setup is needed.',
  ], result: 'Only enabled, compatible simulated devices can be chosen for a new alert. Adding a device alone never sends a signal.' },
  { title: 'Create your first single alert', page: 'simulation-lab', link: 'Open Simulation Studio', instructions: [
    'In Create simulation choose Master Bedroom, enter “Bedroom smoke test” and choose Single alert.',
    'Choose its Smoke detector. Keep its supported Critical signal level and Repeat interval set to Once.',
    'Press Add 1 device alert. Check that the detector appears in the definition, then press Save single alert.',
    'Optional device details is extra text describing the simulated observation. You can leave it empty.',
  ], result: 'You have saved a reusable recipe. It is not an incident yet, and nothing has triggered.' },
  { title: 'Try a scenario', page: 'simulation-lab', link: 'Open Simulation Studio', instructions: [
    'Choose Scenario and give it a name, such as “Kitchen heat and gas”. Choose Kitchen and select its heat and gas detectors.',
    'Choose a supported signal for each device, press Add device alerts, then Save scenario. A scenario needs at least two different devices.',
    'For other rooms, add the first selection to the definition before choosing the next room. Your already-added devices stay in the definition.',
    'Simulation severity offers Automatic, Low/notification, Medium/orange and High/red for each device. This is exercise input, not a real sensor measurement. You can also change it on an added device before saving.',
    'Once sends one report per device. A repeat interval sends reports for the duration shown below that field.',
    'Saved simulations lists your recipes. Search, filter, change pages, Edit or Delete there. Save edits before leaving the form.',
  ], result: 'You can reuse a saved single or scenario many times. One device may belong to several saved scenarios, but cannot appear twice in one trigger batch.' },
  { title: 'Send the alert', page: 'command-center', link: 'Open Command Center', instructions: [
    'In Trigger Alert / Scenario select your saved single alert or scenario. Use Ctrl-click on Windows or Command-click on Mac to select several entries.',
    'Keep Incident assignment on Automatic, then press Send single alert, Send scenario or Send selected alerts & scenarios.',
    'Automatic creates a named incident or joins a related open incident. Different hazard groups can produce separate incidents even in one batch.',
    'Choose a listed open incident only when you deliberately want to add compatible evidence to it. The selected map incident does not override Automatic assignment.',
    'Clicking a map device helps find its saved simulations; it does not send anything. If none exists, Create alert for this device opens Studio.',
  ], result: 'A run is scheduled. Watch Simulation runs for published counts and View links. Scheduling is not proof that all reports or assessments have finished.' },
  { title: 'Let Alexa+ explain', page: 'alexa-sim', link: 'Open Live assistance', instructions: [
    'Select the incident. Read its briefing and Active signals. New reports update automatically while the page is open.',
    'Listen to briefing reads the current text once. Enable spoken updates reads important changed briefings; Mute stops automatic speech.',
    'Ask “Which devices reported?”, “What changed?” or “Is the assessment current?” You can type naturally about these topics.',
    'Use microphone allows English speech through your browser. Allow microphone access; the question sends when you finish. Cancel listening stops capture.',
    'Current status reads the latest incident information. Evidence timeline reports loaded records. I have seen this acknowledges receipt and leaves the incident open.',
    'Click an active signal to open its device on the map. Clear removes this incident’s conversation from this browser.',
  ], result: 'Answers use saved incident evidence. People’s presence is unknown. Device controls and calling are not available. Speech needs this page open; cloud runs continue after you close it.' },
  { title: 'Review and finish', page: 'incident-history', link: 'Open Incident history', instructions: [
    'Find an incident in History, then open it. Overview shows its record; the evidence and decision views show reports and assessments.',
    'Decision review shows the summary, cited evidence and uncertainties. Agree or Reject records your opinion; this is optional and does not resolve the incident.',
    'In Manage this incident, Save name renames it. Retry assessment requests another assessment if one failed or needs updating.',
    'When you decide the test is finished, choose Resolve incident and confirm. Remaining associated simulation generation is cancelled.',
  ], result: 'History stays available. A fresh later alert can start a new incident. Seen, assessment review, Stop run and Resolve are four different operations.' },
  { title: 'Clean up', page: 'settings', link: 'Open Settings', instructions: [
    'Delete a saved simulation in Studio to remove its recipe. Past incidents remain.',
    'Delete a device in Settings to remove it from the inventory. Edit saved simulations that refer to it before using them again.',
    'Delete an incident from its History record, or use Settings → Data & cleanup. Follow the confirmation shown; deleting removes its saved evidence as well.',
    'Check the deletion status: requested or pending is not completed. Cleanup runs after a drain period and may take longer.',
    'Clear local drafts removes browser-only drafts and conversations. Sign out also clears conversations; it does not delete cloud incidents.',
  ], result: 'Deleting all saved devices leaves an empty inventory; they do not return on refresh. Existing rooms remain visible.' },
];

const dependencies = [
  ['No sign-in', 'You can read this guide, but cannot manage devices, trigger tests or read account incidents.'],
  ['No enabled device', 'Studio cannot create a valid alert for that device. Add or enable one in Settings.'],
  ['No saved simulation', 'Command Center has nothing to send. Create and save a single or scenario first.'],
  ['No successful trigger', 'No new incident or agent assessment is produced. Saving a recipe is not a trigger.'],
  ['Assessment pending or failed', 'Recorded signals can still appear. The app does not invent an AI answer; wait or use Retry assessment.'],
  ['Microphone or speech unavailable', 'Type your question and read the briefing. Device reports and cloud processing still work.'],
];

export default function UserGuide({ navigate }) {
  return <div className="user-guide">
    <section className="card"><span className="eyebrow">USER GUIDE</span><h2>Your first Aenea test</h2>
      <p>Start with one saved alert. Send it from Command Center, then let Alexa+ explain what the house reported.</p>
      <ol className="guide-flow" aria-label="First test sequence">{['Check devices', 'Save simulation', 'Send alert', 'Read or hear briefing', 'Review & resolve'].map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}</ol>
      <p className="notice">This house and its signals are simulated. Follow official alarms and emergency guidance during a real incident.</p>
    </section>
    <section className="card"><h2>Follow these steps</h2><p>Open a step for instructions. The buttons take you to the right page.</p>
      {steps.map((step, index) => <details className="guide-step" key={step.title} open={index === 0}><summary>{index + 1}. {step.title}</summary>
        <ol>{step.instructions.map(text => <li key={text}>{text}</li>)}</ol><p className="guide-result"><strong>What you get: </strong>{step.result}</p>
        <button onClick={() => navigate(step.page)}>{step.link}</button>
      </details>)}
    </section>
    <section className="card"><h2>What needs to be ready?</h2><div className="guide-table-scroll"><table className="guide-table"><thead><tr><th scope="col">If this is missing</th><th scope="col">What happens</th></tr></thead><tbody>{dependencies.map(([condition, outcome]) => <tr key={condition}><th scope="row">{condition}</th><td>{outcome}</td></tr>)}</tbody></table></div></section>
    <section className="card"><h2>Understand what you see</h2>
      <details className="guide-step"><summary>Map colours</summary><p>Normal means no active alert is shown in the selected incident; it does not prove safety. Notification signals include an ordinary doorbell or camera motion. Warnings include leaks and some equipment faults. Red marks urgent evidence, such as CO or gas, or corroborated smoke/heat reports from different devices in one room. A current assessment may raise urgency. Repeating the same detector alone does not create independent corroboration.</p></details>
      <details className="guide-step"><summary>Stop, clear, seen and resolve</summary><p><strong>Stop run</strong> stops future test generation; one report already being sent may arrive. It does not clear a reported alarm. New Studio definitions do not send an automatic clear. <strong>I have seen this</strong> acknowledges receipt. <strong>Agree/Reject</strong> reviews the assessment. <strong>Resolve incident</strong> closes the incident by your confirmation and stops its associated runs.</p></details>
      <details className="guide-step"><summary>Limits and repeat timing</summary><p>Each incident starts with a 2,000-signal practice allowance. Approaching or reaching it is shown in Command Center. At the limit, generation pauses; the incident stays open. Allow more test signals, then Resume pending, to continue within the maximum of 10,000. Fresh incidents get a fresh allowance. Scheduled repeat delivery is checked about once a minute and can arrive later; the published count shows actual progress.</p><p>Capacity: 200 devices, 30 per room, 250 saved definitions, 2,000 saved signal references and 200 distinct devices per run.</p></details>
      <details className="guide-step"><summary>A button is unavailable or a request failed</summary><p>Check that loading has finished, a valid incident or simulation is selected, and the required devices are enabled. An overlap warning names the selections sharing a device; deselect one. A device already in an active run must finish or be stopped before another run can use it.</p><p>For a failed send, check Simulation runs before retrying. Retry run request preserves the same request. Resume pending continues a paused run. If the app says settings changed, refresh before saving. If authentication expires, sign in again.</p></details>
      <details className="guide-step"><summary>Sessions, voice and saved conversations</summary><p>Sign-in can last up to 24 hours with automatic token refresh. Sign out on shared computers. Speech needs browser support and permission. Voice questions are read-only. Replies are kept in this browser for up to seven days, with the latest 20 per incident; Clear or sign-out removes them. Old replies describe evidence available when they were answered.</p></details>
    </section>
  </div>;
}
