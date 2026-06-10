# RMM Dashboard

The dashboard is the central web interface for the RMM suite. It aggregates data from the **agent** and **remote-error-check** components, displays real-time metrics and alerts, and provides remote management controls.

## Planned Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript (Vite) |
| Backend API | Node.js / Express **or** Go (to be decided) |
| Real-time | WebSocket |
| Database | PostgreSQL (metrics) + Redis (pub/sub) |
| Auth | JWT-based authentication |

## Planned Features

- **Agent overview** — list of connected agents, online/offline status, platform info
- **Metrics viewer** — CPU, memory, disk, network charts per agent
- **Remote terminal** — browser-based shell into managed machines
- **Desktop control** — remote screen capture and mouse/keyboard input
- **File manager** — browse and transfer files on managed machines
- **Alerts panel** — errors reported by `remote-error-check`, threshold breaches
- **Script execution** — run commands or scripts on one or many agents

## Integration Points

- Agents connect via WebSocket to the dashboard backend (see [`docs/api/websocket.md`](../docs/api/websocket.md))
- `remote-error-check` forwards results to the dashboard REST API (see [`docs/api/rest.md`](../docs/api/rest.md))

## Getting Started (placeholder)

> Setup instructions will be added once the dashboard is scaffolded.
