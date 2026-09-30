# Signal priority and red-alert policy

This is a conservative **simulation policy**, not a vendor alarm specification or diagnosis.

| Tier | Signals | Aenea response |
| --- | --- | --- |
| Notification only | doorbell, motion, package, vehicle, person detected, normal door/window contact-open | Ordinary Alexa+ update; no red state and no virtual siren proposal from that signal alone. |
| Warning | water leak, severe weather, freeze risk, power outage, tamper, smart-lock tamper | Visible warning and normal evidence/agent assessment. |
| Critical | smoke, heat, carbon monoxide, gas leak, medical SOS, security panel alarm, forced entry, glass break | Evidence reaches the same incident pipeline and can drive permitted virtual actions. |

## When the map becomes red

Red is set from current device state, not a repeated copy of an old event:

1. A current CO, gas-leak, medical SOS, security-alarm, forced-entry or glass-break report is red immediately.
2. Two or more distinct active smoke/heat/CO/gas devices in the same registered room are red together.
3. A current validated agent assessment can raise a cited device to urgent; it cannot lower the deterministic floor.

One smoke or heat detector is therefore a warning by default, not proof of a large fire. Repeats from the same device are updates, not independent corroboration. Clear state removes that device from active escalation. An urgent/red state is a coordination cue, not a claim of emergency dispatch, occupancy or safety.

The policy does not generate browser audio by itself. A pre-authorized **virtual siren** can be proposed only for current critical fire, gas or verified security signals; its actual outcome is recorded. Real Ring/Alexa/physical-device integrations are not present in this prototype.
