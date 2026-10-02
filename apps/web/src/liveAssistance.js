const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const outputs = { virtual_notification: 'In-app notification', virtual_valve: 'Water valve', virtual_lights: 'Lights', virtual_siren: 'Alarm' };
const actions = { notify: 'Send notification', close_valve: 'Close water valve', lights_on: 'Turn on lights', siren_on: 'Sound alarm' };
const kinds = { smoke: 'Smoke detector', carbon_monoxide: 'Carbon monoxide detector', water_leak: 'Water leak sensor', motion: 'Motion sensor', doorbell: 'Doorbell', medical_sos: 'Medical alert button', severe_weather: 'Weather feed' };
const humanName = (value, id) => typeof value === 'string' && value.trim() && value !== id && !value.match(uuid) ? value.trim() : '';
export const readableText = value => String(value || '').replace(uuid, 'device record').replaceAll('_', ' ');
export function signalDetails(device, catalog, timeline = []) {
  const context = timeline.find(item => item.event?.event_id === device.event_id)?.event_context;
  const registered = catalog?.devices?.find(item => item.id === device.device_id);
  const recordedName = humanName(context?.device?.name, device.device_id) || humanName(device.name, device.device_id);
  const displayName = humanName(device.display_name, device.device_id);
  const catalogName = humanName(registered?.name, device.device_id);
  const currentName = !recordedName && (device.display_name_source === 'current_catalog' || !!catalogName);
  const name = recordedName || displayName || catalogName || kinds[device.kind] || `${readableText(device.kind) || 'Device'} signal`;
  const room = context?.device?.room || device.room;
  const location = context?.location?.name || device.location_name;
  const place = [room, location].filter(Boolean).join(' · ') || 'Location not recorded in this report';
  return { name, place, currentName, missingContext: !room && !location };
}
export function actionName(action) {
  const proposal = action.proposal || {};
  return humanName(proposal.device_name, proposal.device_id) || outputs[proposal.capability || proposal.device_id] || 'Response device';
}
export const actionLabel = action => actions[action.proposal?.action] || 'Review action';
export function actionStatusLabel(action) {
  return ({ pending_confirmation: 'Needs confirmation', allowed: 'Ready to run', executing: 'Running', succeeded: 'Completed · simulated', failed: 'Failed', blocked: 'Not permitted', expired: 'Expired' })[action.status] || 'Outcome pending';
}
export function actionExplanation(action) {
  const reason = action.result || action.policy_reason || '';
  const labels = {
    'Virtual device is not enabled for this household': 'This output was not enabled when the proposal was checked.',
    'No registered output for this incident location': 'No matching output was registered at this location when the proposal was checked.',
    'Household has not preauthorized this action': 'Automatic response was not permitted when this historical proposal was checked.',
    'Actuator no longer belongs to this incident location/capability': 'The output configuration changed; this proposal cannot run.',
    'Closing virtual valve requires explicit confirmation': 'This historical valve proposal required confirmation. Device controls are now disabled.',
    'Household preauthorization and evidence checks passed': 'Permission and evidence checks passed for this simulated action.',
    'Evidence is missing, stale or future dated': 'The supporting evidence is no longer eligible. A current assessment is needed.',
  };
  return labels[reason] || readableText(reason) || 'No outcome has been recorded yet.';
}
export function responseGroups(actions, context, catalog, eligible) {
  const visible = [], history = [];
  for (const action of actions) {
    const proposal = action.proposal || {};
    const registered = catalog?.devices?.some(device => device.id === proposal.device_id && ['light', 'siren', 'notification', 'water_valve'].includes(device.type));
    const legacy = Boolean(outputs[proposal.device_id]);
    const knownMissing = catalog?.revision != null && !registered;
    const current = context?.incident?.latest_assessment === action.assessment_id;
    const completed = ['succeeded', 'failed'].includes(action.status);
    const display = !legacy && !knownMissing && (completed || (current && action.status === 'blocked') || eligible(action));
    (display ? visible : history).push(action);
  }
  visible.sort((a, b) => Number(b.status === 'pending_confirmation' && eligible(b)) - Number(a.status === 'pending_confirmation' && eligible(a)));
  return { visible, history };
}
