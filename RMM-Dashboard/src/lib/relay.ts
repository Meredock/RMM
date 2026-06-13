import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage, Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { jwtVerify } from "jose";
import { parse as parseCookies } from "cookie";

const SESSION_COOKIE = "rmm_session";
// Read JWT_SECRET lazily so it picks up the value after Next.js has loaded .env
const getSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ?? "fallback-dev-secret-change-in-prod"
  );

export type SessionType = "TERMINAL" | "FILES" | "DESKTOP";

export interface Msg {
  type: string;
  sessionId?: string;
  [key: string]: unknown;
}

interface AgentConn {
  ws: WebSocket;
  deviceId: string;
}

interface ClientSession {
  sessionId: string;
  deviceId: string;
  type: SessionType;
  clientWs: WebSocket;
}

export class RelayServer {
  private agentConns = new Map<string, AgentConn>(); // deviceId → agent ws
  private clientSessions = new Map<string, ClientSession>(); // sessionId → session
  private agentWss: WebSocketServer;
  private clientWss: WebSocketServer;

  constructor(server: Server) {
    this.agentWss = new WebSocketServer({ noServer: true });
    this.clientWss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (url.pathname === "/ws/agent") {
        this.agentWss.handleUpgrade(req, socket as never, head, (ws) =>
          this.onAgentConnect(ws, req)
        );
      } else if (url.pathname === "/ws/client") {
        this.clientWss.handleUpgrade(req, socket as never, head, (ws) =>
          this.onClientConnect(ws, req)
        );
      }
      // Let Next.js handle /_next/* WebSocket paths (HMR etc.)
    });
  }

  // ── Agent side ──────────────────────────────────────────────────────────

  private onAgentConnect(ws: WebSocket, req: IncomingMessage) {
    let deviceId: string | null = null;

    ws.on("message", async (raw) => {
      let msg: Msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "AUTH") {
        const { PrismaClient } = await import("@prisma/client");
        const db = new PrismaClient();
        const device = await db.device
          .findUnique({ where: { apiKey: String(msg.apiKey) } })
          .finally(() => db.$disconnect());

        if (!device) {
          ws.send(JSON.stringify({ type: "AUTH_FAIL", error: "Unknown device" }));
          ws.close();
          return;
        }

        deviceId = device.id;
        this.agentConns.set(deviceId, { ws, deviceId });
        ws.send(JSON.stringify({ type: "AUTH_OK", deviceId }));
        console.log(`[relay] Agent connected: ${device.name} (${deviceId})`);
        return;
      }

      if (!deviceId) return;

      // Forward agent message to matching client session
      if (msg.sessionId) {
        const session = this.clientSessions.get(msg.sessionId);
        if (session?.clientWs.readyState === WebSocket.OPEN) {
          session.clientWs.send(raw.toString());
        }
      }
    });

    ws.on("close", () => {
      if (deviceId) {
        this.agentConns.delete(deviceId);
        // Close all sessions for this device
        for (const [sid, session] of this.clientSessions) {
          if (session.deviceId === deviceId) {
            session.clientWs.send(
              JSON.stringify({ type: "SESSION_END", sessionId: sid, reason: "agent_disconnected" })
            );
            this.clientSessions.delete(sid);
          }
        }
        console.log(`[relay] Agent disconnected: ${deviceId}`);
      }
    });
  }

  // ── Client (browser) side ───────────────────────────────────────────────

  private async onClientConnect(ws: WebSocket, req: IncomingMessage) {
    // Auth via session cookie
    const cookies = parseCookies(req.headers.cookie ?? "");
    const token = cookies[SESSION_COOKIE];
    if (!token) {
      ws.close(4401, "Unauthorized");
      return;
    }
    try {
      await jwtVerify(token, getSecret());
    } catch {
      ws.close(4401, "Unauthorized");
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const deviceId = url.searchParams.get("deviceId");
    const type = (url.searchParams.get("type") ?? "TERMINAL") as SessionType;

    if (!deviceId) {
      ws.close(4400, "Missing deviceId");
      return;
    }

    const agentConn = this.agentConns.get(deviceId);
    if (!agentConn || agentConn.ws.readyState !== WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ERROR", error: "Agent not connected" }));
      ws.close();
      return;
    }

    const sessionId = uuidv4();
    this.clientSessions.set(sessionId, { sessionId, deviceId, type, clientWs: ws });

    // Tell agent to start this session first; it will reply SESSION_READY which
    // the relay forwards to the browser. That way the browser only sends data
    // once the agent's session goroutine is actually running.
    agentConn.ws.send(
      JSON.stringify({ type: "SESSION_START", sessionId, sessionType: type })
    );

    ws.on("message", (raw) => {
      let msg: Msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      // Inject sessionId and forward to agent
      msg.sessionId = sessionId;
      if (agentConn.ws.readyState === WebSocket.OPEN) {
        agentConn.ws.send(JSON.stringify(msg));
      }
    });

    ws.on("close", () => {
      this.clientSessions.delete(sessionId);
      if (agentConn.ws.readyState === WebSocket.OPEN) {
        agentConn.ws.send(JSON.stringify({ type: "SESSION_END", sessionId }));
      }
    });

    console.log(`[relay] Client session ${type} started: ${sessionId} → ${deviceId}`);
  }
}
