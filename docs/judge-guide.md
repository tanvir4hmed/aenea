# Aenea judge guide

## Access

Open [Aenea](https://aenea.qleam.com). The public [user guide](https://aenea.qleam.com/guide) is available without signing in.

The welcome screen displays a shared guest email and a hidden password with reveal/copy controls. Copy those values, choose **Open guest sign in**, and enter them in the Cognito form. The button opens sign-in; it does not automatically populate another domain's form. Registration is not required.

Guest activity is shared with other visitors. Use fictional names, addresses and observations; do not delete another visitor's incidents. Final hosted login acceptance has not yet been recorded. The owner must confirm current credentials in the submitted testing instructions.

## Short walkthrough

1. **Settings:** create a fictional named location and add a smoke detector and camera with Simulation connection. Multiple devices are supported. Real-device connection choices are unavailable, not configured integrations.
2. **Simulation Studio:** save named single alerts for the smoke detector and camera, or save both in a scenario. Studio only saves definitions. In **Command Center**, choose the smoke alert from **Trigger saved alerts**, choose a new incident and send. Add the camera alert later to that incident, or select both definitions to send a sequential batch. Overlapping device selections are blocked.
3. **Incident:** inspect the saved evidence and wait for a current assessment. An accepted receipt only proves ingress. Review citations, uncertainty and policy outcomes.
4. **Alexa+:** select that incident, use **Refresh context and actions**, then the status suggestion. Record a fictional check-in. Only supported commands are interpreted; microphone input is optional and reviewed before sending.
5. **Studio:** send the next selected signal in the same run. Return to the incident and observe its new evidence revision. Older assessments remain history, not authority for new actions.
6. **Decision review:** inspect the evidence snapshot and record agreement/rejection if desired. Rejecting blocks future execution for that assessment; it cannot undo an already executed virtual command. Agreement does not approve an action.
7. **Handoff:** prepare and inspect the timestamped summary. Partial warnings matter. Copy/print is manual and sends nothing to emergency services.

For a separate water-only test, configure virtual permissions first. An eligible valve proposal requires explicit confirmation of its current assessment and expires. Do not assume the model will propose every action.

## Reset and limitations

Clear Studio drafts to clear local inputs; replay creates a fresh run. To delete an incident you created, use **Settings → Data controls** and confirm its full ID. Cleanup waits at least 15 minutes and then runs on the five-minute schedule; check status later. It removes active incident data/evidence versions but retains a replay-blocking marker. Backups, logs and exported copies have separate retention.

Catalog capacity is 50 locations/200 total devices, with 30 devices per room. The server library supports 50 definitions and 100 total saved device-alert rows. A scenario and combined trigger selection each support at most 20 distinct devices; the reasoner also accepts at most 20 signals per incident. Start a new incident when that evidence budget is reached.

This is a browser Alexa+ simulation over shared cloud tools. No physical Alexa/Ring device or AWS account is required to use the hosted app. Devices, check-ins and effects are synthetic; motion is not proof of occupancy or safety. Follow official alarms and emergency guidance.

If a write times out, read saved state before retrying. Use the pending signal retry rather than sending a newly identified duplicate. Report persistent errors with the time and incident ID, never a token/password.
