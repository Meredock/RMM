# RMM — Remote Monitoring & Management Suite

A monorepo containing all components of the RMM platform.

## Components

| Component | Path | Description |
|-----------|------|-------------|
| **Agent** | [`agent/`](agent/) | Go service installed on managed machines. Streams metrics and responds to remote commands. |
| **Remote Error Check** | [`remote-error-check/`](remote-error-check/) | Node.js service that polls HTTP/TCP endpoints on a schedule and reports errors. |
| **Dashboard** | [`dashboard/`](dashboard/) | *(Planned)* React + backend web application — central UI for agents, metrics, and alerts. |

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for a full overview of how the components work together.

## API Contracts

- [`docs/api/websocket.md`](docs/api/websocket.md) — WebSocket protocol (agent ↔ dashboard)
- [`docs/api/rest.md`](docs/api/rest.md) — REST API (remote-error-check → dashboard, frontend → dashboard)

## Quick Start

Each component is independently runnable. Refer to the README in each subdirectory:

- [Agent setup](agent/installer/README.txt)
- [Remote Error Check setup](remote-error-check/README.md)
- [Dashboard setup](dashboard/README.md) *(placeholder)*
