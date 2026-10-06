# Aenea user guide

The same step-by-step guide is available inside the app at **User guide**. Start with a single smoke test, then try a scenario. All device signals are simulated; assessments use the actual processing pipeline.

## 1. Sign in

On the welcome screen, reveal or copy the displayed guest credentials. Choose **Open guest sign in**, enter those credentials and sign in. There is no public sign-up. A personal account has its own records; visitors sharing the guest account share its test data.

A new workspace contains **Maple House**, 10 fixed rooms and 24 simulated sensors. Opening the app does not create incidents. If you previously saved an empty device inventory, it remains empty.

## 2. Check or add a device

Open **Settings → Device list**. You can use the supplied sensors immediately. Search by name, room or type; use room filters and pagination for a larger inventory.

To add a sensor, choose **Add device**, select its room and type, check its name, leave **Enabled** checked and choose **Add device**. Connection is Simulation. Use **Edit**, **Duplicate** or **Delete** beside an existing device. Maple House and its rooms are already configured.

A disabled or removed device cannot generate a new valid alert. Adding a sensor does not trigger it.

## 3. Save a single alert

Open **Simulation Studio → Create simulation**:

1. Choose **Master Bedroom**.
2. Enter **Bedroom smoke test** as the name.
3. Choose **Single alert** and **Once**.
4. Select its smoke detector and keep its supported Critical signal level.
5. Choose **Add 1 device alert**. Check the detector now appears in the definition.
6. Choose **Save single alert**.

**Optional device details** adds descriptive observation text; leave it empty for this test. Saving stores a reusable recipe. It does not send a signal or create an incident.

For a scenario, choose **Scenario**, select at least two different devices, add them and save. Example: Kitchen heat and gas detectors. To span rooms, add one room's selection before choosing another room. Alert levels only offer signals supported by that device. Studio's Critical signal category does not force the map red: a single smoke/heat report starts at warning, and the backend assesses combined evidence.

**Saved simulations** shows saved recipes with search, type/room/device filters, pagination, Edit and Delete. Unsaved changes must be saved before leaving. A single device/signal cannot have duplicate single definitions; scenarios may reuse sensors.

## 4. Trigger from Command Center

In **Trigger Alert / Scenario**, select your saved recipe. Ctrl-click on Windows or Command-click on Mac selects several entries. Keep **Incident assignment → Automatic** and press the Send button.

Automatic creates a readable incident or joins a related open one. Different hazard groups may produce different incidents within the same batch. Choosing an existing open incident deliberately adds compatible evidence there. The incident currently displayed on the map does not override Automatic assignment.

Clicking a device on the map finds related saved simulations; it does not send them. If there is no saved recipe, **Create alert for this device** opens Studio.

An overlap warning names recipes sharing a device. Deselect an overlapping recipe: each physical sensor can appear once per batch. A sensor already in an active run must finish or be stopped before another run uses it.

Watch **Simulation runs**. Scheduled means the run exists; published counts show actual delivery. **View** opens its incident. **Stop run** stops future generation; one in-flight signal may still arrive. **Resume pending** continues a paused run. Cloud runs continue with the browser closed.

## 5. Read or hear Alexa+

Open **Live assistance** and select the incident:

| Control | What it does |
| --- | --- |
| Incident selector | Chooses the incident whose evidence and conversation you see |
| Refresh | Requests its current status |
| Listen to briefing | Reads the displayed briefing once |
| Enable spoken updates / Mute | Turns automatic speech for changed briefings on/off |
| Active signal | Opens that device on the map |
| Ask | Sends a typed incident question |
| Use microphone / Cancel listening | Captures an English question; sends it when speech finishes / cancels capture |
| Current status | Reads the latest saved incident status through MCP |
| Evidence timeline | Reports available timeline records; open History to inspect them |
| I have seen this | Records receipt; the incident remains open |
| Clear | Removes this incident's conversation from this browser |

Try **Which devices reported?**, **What changed?**, **What is uncertain?** or **Is the assessment current?** Natural wording is supported for the available status, devices, uncertainty, assessment and timeline topics. This is not an unrestricted assistant. It cannot verify who is home, control devices or call anyone.

Spoken updates need this page open and a supported browser. If speech fails, read the briefing or type. Voice questions are read-only. The last 20 replies per incident stay in this browser for up to seven days; Clear or sign-out removes them. An earlier reply reflects evidence available at that time.

## 6. Review, rename and resolve

Open **Incident history**, find a record and open it. Its overview, evidence and decision views show the incident, reports and assessments. Search/filter/page controls help with longer lists; load additional records when offered.

**Decision review** shows the model summary, cited evidence and uncertainties. Agree/Reject records an optional review, not resolution. New evidence may make the previous assessment outdated. **Retry assessment**, under **Manage this incident**, requests reassessment. **Save name** renames the incident.

When you decide the test is finished, choose **Resolve incident** and confirm. Associated remaining simulation generation stops. Historical evidence remains. A fresh later alert can create a new incident with a fresh practice allowance.

**Seen**, **Agree/Reject**, **Stop run** and **Resolve** are distinct. Stopping a run does not clear an alarm. New Studio definitions do not automatically emit a clear state.

## 7. Delete the right thing

- **Studio → Delete:** removes a saved recipe; past evidence stays.
- **Settings → Delete device:** removes a sensor; edit affected recipes before running them again. Past evidence stays.
- **History → Delete**, or **Settings → Data & cleanup:** requests removal of an incident and its stored evidence. Follow the displayed confirmation.
- **Clear local drafts:** clears browser-only drafts/conversations, not cloud incidents.

Check deletion progress: requested/pending is not completed. A 15-minute drain precedes scheduled cleanup and it can take longer. Completed means application evidence cleanup finished; service history and backups have separate retention. Deleting all saved sensors leaves the inventory empty; rooms stay visible.

## Dependencies and troubleshooting

| Missing prerequisite | What you will not get |
| --- | --- |
| Sign-in | Account data, editing and triggering; the guide remains readable |
| Enabled compatible sensor | A valid simulation using that sensor |
| Saved simulation | A selectable trigger recipe |
| Successful signal delivery | A new incident/assessment from that test |
| Completed assessment | A current AI briefing; saved signals can still appear |
| Browser speech permission/support | Voice interaction; text and cloud processing still work |

If Send fails, check the run list before retrying. **Retry run request** preserves request identity. If settings changed elsewhere, refresh before saving. If sign-in expires, sign in again; normal sessions can persist for up to 24 hours with token refresh.

Each incident starts with a **2,000-signal practice allowance**. At the limit, generation pauses while the incident stays open. In Command Center allow more test signals, then resume the run, up to 10,000. Repeat delivery is checked about once per minute and can arrive later. Repeats are new reports from the same sensor, not independent corroboration.

Map colours reflect the selected incident: ordinary notifications, warnings and urgent red indications. Red may come from one intrinsically urgent signal, corroborating smoke/heat devices in one room, or a current validated urgent assessment. A normal tile or missing evidence does not prove safety. Follow official alarms and emergency guidance during real incidents.
