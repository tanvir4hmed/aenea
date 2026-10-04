# Compact workspace request — implementation checklist

This records each requested change, not a claim of hosted visual acceptance.

## Command Center

- [x] Move the incident selector into the right-hand Incident status card.
- [x] Use a labelled refresh icon instead of Refresh incidents text; refresh list and selected status together.
- [x] Remove the synthetic-signal instructional paragraph.
- [x] Remove the standalone picker strip so the map and status move up.
- [x] Reduce the desktop right rail from 420–480px to 280–384px and give the space to the map.
- [x] Keep the full house visible; remove all category tabs, including Whole house.
- [x] Remove the map subtitle and instructional paragraphs. Loading/error state remains visible when needed; the app-wide simulation safety footer remains.
- [x] Replace fixed category widths with proportional column spans and measured dense-row packing; repack on resizing, content changes and device-count changes.
- [x] Display washroom sensors together in one category box, with each sensor's room in its label.
- [x] Rename numbered washrooms to Master Washroom, Family Washroom and Living Room Washroom across canonical defaults, dropdowns, map, documentation and both saved cloud catalogs.
- [x] Allow smaller categories, including washrooms and garage, to share the row. Narrow screens fall back to full-width categories.
- [x] Use device-count-weighted room widths and wrapping tiles; remove the old 12-device collapse so populated rooms grow rather than hide devices.

## Simulation Studio

- [x] Remove Reporting mode and Initial state controls.
- [x] Remove Connectivity and Duration controls.
- [x] Keep Repeat interval compact, including Once. New/edited definitions use active, online reports; repeats are bounded to at least five minutes and two reports. The computed run length is visible, not an editable field.
- [x] Remove Send a clear state at end; new/edited definitions do not emit an automatic clear. Previously saved definitions are not silently rewritten until edited and saved.
- [x] Start with a canonical house-room selection, not an all-devices list.
- [x] Show only enabled, installed simulation devices from the selected room; adding devices remains in Settings.
- [x] Offer three alert levels: Notification, Warning and Critical. Unsupported levels are disabled; real signal kinds remain device-compatible, and backend risk assessment is not overridden.
- [x] Single alert uses one-device selection; Scenario uses multi-device checkboxes and requires at least two distinct devices.
- [x] Show installed, available and already-added counts for the selected room, plus the full definition count.
- [x] Remove devices from availability after adding them; clear the pending selection. Removing a queued device makes it available again.
- [x] Reject duplicates and cross-room device selections; scenarios can deliberately combine devices by switching rooms between additions.
- [x] Show an add/enable-device warning when a room has no available devices.
- [x] Compact Name, Type, Room, Repeat interval and per-device alert controls; keep optional observation collapsed.
- [x] Place editor errors, map-origin no-saved-alert notices and validation guidance below Save. Command Center feedback appears below Send, its corresponding action.

## Verification and release

- Four focused simulation-form tests and the 12 catalog checks pass; no large test suite was run.
- Web lint and production build pass.
- Cloud catalog read-back confirms 24 devices per household and all three renamed washrooms; incidents and other data were not modified by the rename.
- Local preview mirrors the integrated picker and preserves the Studio component when switching between map and editor.
- Browser visual acceptance remains unverified. Push uses the existing automatic deployment; deployment completion is not awaited.
