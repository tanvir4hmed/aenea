export function permissionPayload(outputs, devices) {
  return Object.fromEntries(outputs.map(device => [device.id, {
    enabled: devices[device.id]?.enabled === true,
    preauthorized: device.type !== 'water_valve' && devices[device.id]?.preauthorized === true,
    fail_next: devices[device.id]?.fail_next === true,
  }]));
}

export function permissionsChanged(outputs, draft, saved) {
  return JSON.stringify(permissionPayload(outputs, draft)) !== JSON.stringify(permissionPayload(outputs, saved));
}
