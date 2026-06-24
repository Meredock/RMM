import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { RelayServer } from "./src/lib/relay";
import { startBackupScheduler } from "./src/lib/backup-scheduler";
import { startHttpMonitorScheduler } from "./src/lib/http-monitor";
import { startRetention } from "./src/lib/retention";

const dev = process.env.NODE_ENV !== "production";
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

  server.listen(port, host, () => {
    console.log(`> Ready on http://${host}:${port}`);
  });
});
