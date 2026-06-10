# RMM Suite — Architecture Overview

## Components

```
┌─────────────────────────────────────────────────────┐
│                   Dashboard                         │
│  ┌─────────────────┐   ┌─────────────────────────┐  │
│  │  Frontend (React)│   │  Backend API (WS + REST)│  │
│  └────────┬────────┘   └────────┬────────────────┘  │
└───────────┼────────────────────┼────────────────────┘
            │  Browser UI        │ WebSocket / REST
            │                    │
     ┌──────┘         ┌──────────┴──────────┐
     │                │                     │
┌────▼────┐    ┌──────▼──────┐    ┌─────────▼────────┐
│  User   │    │    Agent    │    │ Remote Error Check│
│ Browser │    │  (Go svc)   │    │   (Node.js svc)  │
└─────────┘    └─────────────┘    └──────────────────┘
                Managed machines    Endpoint monitoring
```

## Data Flow

1. **Agent → Dashboard**
   - The agent runs as a system service on each managed machine.
   - On startup it connects to the dashboard backend via WebSocket.
   - It streams metrics (CPU, memory, disk, network) and responds to commands (terminal, file ops, desktop capture, script execution).

2. **Remote Error Check → Dashboard**
   - Runs on a schedule (cron), polling configured HTTP/TCP endpoints.
   - On error or threshold breach, it POSTs an alert to the dashboard REST API.

3. **Dashboard → User**
   - The React frontend connects to the backend over WebSocket for live updates.
   - Users can inspect agents, view metrics, trigger remote actions, and review alerts.

## Component Locations

| Component | Path | Language |
|-----------|------|----------|
| Agent | `agent/` | Go |
| Remote Error Check | `remote-error-check/` | Node.js |
| Dashboard | `dashboard/` | React + (Go or Node.js backend) |
| API contracts | `docs/api/` | Markdown |

## API Contracts

- [WebSocket Protocol](api/websocket.md) — agent ↔ dashboard backend
- [REST API](api/rest.md) — remote-error-check → dashboard, and frontend → dashboard backend
