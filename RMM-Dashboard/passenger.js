// cPanel / Phusion Passenger startup file for the RMM dashboard.
//
// cPanel's "Setup Node.js App" (Passenger) loads a startup FILE directly with
// Node — it does not run an npm script or the `tsx` binary. Node on its own
// can't parse the TypeScript custom server (server.ts), so this shim registers
// tsx's CommonJS require-hook and then requires the real server. That is the
// same on-the-fly transpile that `tsx server.ts` does on Render, which keeps
// server.ts the single source of truth for both hosts (no compiled copy to
// drift out of sync).
//
// Passenger monkey-patches http.Server.listen and supplies its own socket, so
// the PORT/HOST that server.ts passes to listen() are ignored under Passenger —
// that is expected and fine.
//
// This file is only used on cPanel. Render still starts via `tsx server.ts`
// (see render.yaml) and is completely unaffected.
require("tsx/cjs");
require("./server.ts");
