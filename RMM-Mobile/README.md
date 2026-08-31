# RMM Phone Agent

This is a lightweight Expo-based mobile agent for the existing Fixsmith RMM dashboard.

It registers a phone as a managed device and sends a heartbeat to the dashboard so the phone can appear in the RMM and report its online state.

## Quick start

1. Install project dependencies:
   npm install
2. Start the app:
   npm start
3. Point the app at your dashboard URL, such as:
   http://192.168.1.50:3000
4. Enter the registration secret if one is configured on the dashboard.
5. Tap Register Device.

## Dashboard requirements

The app uses the existing agent endpoints:

- POST /api/agent/register
- POST /api/agent/heartbeat

The dashboard must have `AGENT_REGISTRATION_SECRET` configured if you want to require a secret.

## Notes

This is intentionally a minimal first-pass phone agent. It focuses on:

- registration
- heartbeat updates
- device metadata
- online/offline visibility inside the RMM dashboard

After enrollment, the app sends a foreground heartbeat every 30 seconds and registers an OS-scheduled background fetch task. Background execution is best-effort: Android and iOS control the actual cadence, which cannot be more frequent than 15 minutes and may be delayed by battery-saving policies. Test it in a development or production build; it is not a replacement for a persistent service.

It does not yet implement deep iOS restrictions or full device management controls.
