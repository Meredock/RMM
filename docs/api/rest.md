# REST API — Dashboard Backend

Base URL: `http://<dashboard-host>/api/v1`

All endpoints require a bearer token unless noted.

---

## Alerts

### `POST /alerts`
Ingest an alert from `remote-error-check`.

**Request body:**
```json
{
  "source": "remote-error-check",
  "endpoint": "https://example.com/health",
  "status_code": 503,
  "error": "Service Unavailable",
  "timestamp": "2026-06-10T12:00:00Z"
}
```

**Response:** `201 Created`

---

### `GET /alerts`
Retrieve recent alerts.

**Query params:** `?limit=50&since=2026-06-01T00:00:00Z`

**Response:**
```json
[
  {
    "id": "uuid-v4",
    "source": "remote-error-check",
    "endpoint": "https://example.com/health",
    "status_code": 503,
    "error": "Service Unavailable",
    "timestamp": "2026-06-10T12:00:00Z",
    "resolved": false
  }
]
```

---

## Agents

### `GET /agents`
List all registered agents.

**Response:**
```json
[
  {
    "id": "uuid-v4",
    "hostname": "workstation-01",
    "platform": "windows",
    "version": "1.0.0",
    "online": true,
    "last_seen": "2026-06-10T12:00:00Z"
  }
]
```

### `GET /agents/:id/metrics`
Retrieve stored metrics for an agent.

**Query params:** `?from=2026-06-10T00:00:00Z&to=2026-06-10T12:00:00Z`

---

## Auth

### `POST /auth/login`
Obtain a JWT token. *(No bearer token required)*

**Request body:**
```json
{ "username": "admin", "password": "..." }
```

**Response:**
```json
{ "token": "<jwt>", "expires_at": "2026-06-11T12:00:00Z" }
```
