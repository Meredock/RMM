# WebSocket API — Agent ↔ Dashboard

The RMM agent establishes a persistent WebSocket connection to the dashboard backend on startup.

**Endpoint:** `ws://<dashboard-host>/ws/agent`

## Authentication

The agent sends an `auth` message as its first frame after connecting.

```json
{
  "type": "auth",
  "token": "<agent-api-token>"
}
```

The server responds:

```json
{
  "type": "auth_result",
  "success": true,
  "agent_id": "uuid-v4"
}
```

## Message Types (Agent → Dashboard)

### `metrics`
Sent on a configurable interval (default: 30s).

```json
{
  "type": "metrics",
  "agent_id": "uuid-v4",
  "timestamp": "2026-06-10T12:00:00Z",
  "cpu_percent": 23.5,
  "mem_total_mb": 16384,
  "mem_used_mb": 8192,
  "disk_total_gb": 512,
  "disk_used_gb": 200,
  "net_rx_bytes": 1048576,
  "net_tx_bytes": 524288
}
```

### `terminal_output`
Response to a `terminal_input` command.

```json
{
  "type": "terminal_output",
  "session_id": "uuid-v4",
  "data": "base64-encoded-bytes"
}
```

### `desktop_frame`
Screen capture frame in response to `desktop_start`.

```json
{
  "type": "desktop_frame",
  "session_id": "uuid-v4",
  "format": "jpeg",
  "data": "base64-encoded-image"
}
```

## Message Types (Dashboard → Agent)

### `terminal_input`
```json
{
  "type": "terminal_input",
  "session_id": "uuid-v4",
  "data": "base64-encoded-bytes"
}
```

### `exec`
Run a command and return output.

```json
{
  "type": "exec",
  "command": "systemctl status rmm-agent",
  "timeout_seconds": 30
}
```

### `desktop_start` / `desktop_stop`
```json
{ "type": "desktop_start", "session_id": "uuid-v4", "fps": 10 }
{ "type": "desktop_stop",  "session_id": "uuid-v4" }
```

### `file_list`
```json
{ "type": "file_list", "path": "/var/log" }
```
