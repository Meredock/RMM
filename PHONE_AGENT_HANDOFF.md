# Phone Agent Handoff

## Goal
Build a phone-managed device agent for the existing RMM so mobile devices can register, heartbeat, and appear in the dashboard alongside desktop agents.

## Status
This is a working first pass, not a production-ready mobile monitoring system.

Implemented:
- Dashboard UI page for a Phone Agent overview: [RMM-Dashboard/src/app/(dashboard)/phone/page.tsx](RMM-Dashboard/src/app/(dashboard)/phone/page.tsx)
- Phone agent summary logic: [RMM-Dashboard/src/lib/phone-agent.ts](RMM-Dashboard/src/lib/phone-agent.ts)
- Summary test coverage: [RMM-Dashboard/src/lib/phone-agent.test.ts](RMM-Dashboard/src/lib/phone-agent.test.ts)
- Sidebar nav entry: [RMM-Dashboard/src/components/Sidebar.tsx](RMM-Dashboard/src/components/Sidebar.tsx)
- Device type normalizer: [RMM-Dashboard/src/lib/device-type.ts](RMM-Dashboard/src/lib/device-type.ts)
- Prisma schema support for device type: [RMM-Dashboard/prisma/schema.prisma](RMM-Dashboard/prisma/schema.prisma)
- Dashboard agent registration + heartbeat updates for phone/device classification: [RMM-Dashboard/src/app/api/agent/register/route.ts](RMM-Dashboard/src/app/api/agent/register/route.ts) and [RMM-Dashboard/src/app/api/agent/heartbeat/route.ts](RMM-Dashboard/src/app/api/agent/heartbeat/route.ts)
- Mobile Expo app scaffold: [RMM-Mobile/App.tsx](RMM-Mobile/App.tsx), [RMM-Mobile/README.md](RMM-Mobile/README.md), [RMM-Mobile/package.json](RMM-Mobile/package.json)
- Secure mobile enrollment storage for the API key and device ID, using Expo SecureStore
- Foreground heartbeats every 30 seconds and OS-scheduled background heartbeats (best effort, 15-minute minimum)
- Phone/tablet filtering in the dashboard device list and Phone Agent overview
- Registration and heartbeat input validation, enrollment audit events, and a 30-minute mobile offline grace period
- Battery percentage and connection-type telemetry shown on mobile device details (stored through the existing device custom fields)

## Verified
Commands run successfully:
- Dashboard: `cd /home/meredock/.claude/ide/RMM/RMM-Dashboard && npx prisma generate && npx tsc --noEmit`
- Mobile app: `cd /home/meredock/.claude/ide/RMM/RMM-Mobile && npx tsc --noEmit`

Both exited successfully with no TypeScript errors.

## Design assumptions
- The repo already has a desktop Go agent and a web dashboard. This phone agent is a separate mobile client, not a rewrite of the desktop agent.
- We are using the same `agent/register` and `agent/heartbeat` endpoints for compatibility.
- The initial mobile app is intentionally minimal and focuses on: registration, battery/network metadata, heartbeat status, and dashboard visibility.

## Remaining work for next agent
1. Add actual phone device telemetry and actions
   - Consent-aware location reporting
   - Remote actions such as ping, lock, or wipe behind policy controls

2. Add policy and privacy
   - Decide what is allowed on Android vs iOS.
   - Add explicit user consent and enrollment flow.
   - Document privacy boundaries and compliance requirements.

3. Harden the backend further
   - Add mobile-specific alert rules and action routing.
   - Add audit log entries for device actions.

## Recommended next implementation order
1. Add a true device health page for mobile devices.
2. Add consent-aware battery and network telemetry.
3. Add consent-aware geolocation.
4. Add admin actions for lock / ping / wipe policy.

## Notes for another agent
- The app is already scaffolded in [RMM-Mobile](RMM-Mobile).
- The repo uses Next.js + Prisma + existing dashboard auth pattern.
- The desktop agent code is in [RMM-Agent](RMM-Agent); do not try to repurpose it as the phone agent unless specifically required.
- The phone app should remain thin and use the same RMM API contract instead of inventing a parallel backend.

## Initial acceptance criteria
- A phone can register via the existing registration API.
- The device appears under the dashboard with `deviceType = phone`.
- The dashboard marks the device online when the mobile heartbeat is received.
- The phone agent can send a heartbeat on a timer and can be re-registered without code duplication.

## Suggested starting prompt for another agent
"Continue the phone agent work by implementing the next production phase: add background heartbeat loop, mobile dashboard filtering, and phone-specific device details while keeping the existing RMM API contract intact."
