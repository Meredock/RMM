import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { RelayServer } from "./src/lib/relay";
import { startBackupScheduler } from "./src/lib/backup-scheduler";
import { startHttpMonitorScheduler } from "./src/lib/http-monitor";
import { startRetention } from "./src/lib/retention";
import { startTaskScheduler } from "./src/lib/task-scheduler";
import { startOfflineMonitor } from "./src/lib/offline-monitor";
import { jwtSecretProblem } from "./src/lib/secret";

const dev = process.env.NODE_ENV !== "production";

// Fail fast on a missing or placeholder JWT_SECRET instead of starting up and
// erroring on every request.
if (!dev) {
  const problem = jwtSecretProblem(process.env.JWT_SECRET);
  if (problem) {
    console.error(`> Refusing to start: ${problem}. Generate one with: openssl rand -base64 32`);
    process.exit(1);
  }
  if (!process.env.AGENT_REGISTRATION_SECRET) {
    console.warn("> AGENT_REGISTRATION_SECRET is not set: new agent registrations will be rejected");
  }
}
const port = parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  new RelayServer(server);
  startBackupScheduler();
  startHttpMonitorScheduler();
  startRetention();
  startTaskScheduler();
  startOfflineMonitor();

  server.listen(port, host, () => {
    console.log(`> Ready on http://${host}:${port}`);
  });
});
