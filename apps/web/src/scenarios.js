// Authored synthetic observations, never model outcomes or prerecorded backend results.
export const scenarios = [
  { id: 'smoke', title: 'Smoke + camera context', description: 'A sensor signal with ambiguous hallway motion. Camera context never proves occupancy.',
    steps: [
      { kind: 'smoke', category: 'sensor', source: 'demo-kitchen-smoke', observation: 'Synthetic kitchen smoke alarm signal. Cause and occupancy are unverified.' },
      { kind: 'motion', category: 'camera', source: 'demo-hallway-camera', observation: 'Synthetic hallway motion event. No person identified; movement is not a safety check-in.' },
    ] },
  { id: 'water', title: 'Water leak + explicit approval', description: 'Use a new incident. Only a saved pending valve proposal can be confirmed; smoke/CO blocks closure.',
    steps: [{ kind: 'water_leak', category: 'sensor', source: 'demo-utility-leak', observation: 'Synthetic utility-area water leak signal. Ask for household confirmation before any virtual valve closure.' }] },
  { id: 'camera', title: 'Camera context only', description: 'Ambiguous doorbell/motion signals: no verified intrusion, identity or occupancy.',
    steps: [
      { kind: 'doorbell', category: 'camera', source: 'demo-front-door', observation: 'Synthetic doorbell press. Visitor identity and intent are unknown.' },
      { kind: 'motion', category: 'camera', source: 'demo-front-door', observation: 'Synthetic front-door motion. Not proof of intrusion or someone remaining inside.' },
    ] },
];

export function scenarioEvent(step, household, incident) {
  return { incident_id: incident, adapter: step.category === 'camera' ? 'camera-simulator' : 'sensor', event: {
    event_id: crypto.randomUUID(), household_id: household, occurred_at: new Date().toISOString(),
    source: { source_id: step.source, category: step.category, simulated: true },
    kind: step.kind, observation: step.observation,
  } };
}
