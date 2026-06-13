"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Circle } from "lucide-react";
import Link from "next/link";

type Status = "connecting" | "ready" | "disconnected" | "error";

export default function TerminalPage() {
  const { id } = useParams<{ id: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [statusMsg, setStatusMsg] = useState("Connecting to agent...");
  const [reconnectKey, setReconnectKey] = useState(0);

  const statusColors: Record<Status, string> = {
    connecting: "text-yellow-400",
    ready: "text-green-400",
    disconnected: "text-red-400",
    error: "text-red-400",
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let aborted = false;
    const cleanup: Array<() => void> = [];

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      if (aborted) return;
      const { FitAddon } = await import("@xterm/addon-fit");
      if (aborted) return;
      await import("@xterm/xterm/css/xterm.css");
      if (aborted) return;

      const term = new Terminal({
        theme: {
          background: "#0d1117", foreground: "#e6edf3", cursor: "#58a6ff",
          selectionBackground: "#264f78", black: "#484f58", brightBlack: "#6e7681",
          red: "#ff7b72", brightRed: "#ffa198", green: "#3fb950", brightGreen: "#56d364",
          yellow: "#d29922", brightYellow: "#e3b341", blue: "#58a6ff", brightBlue: "#79c0ff",
          magenta: "#bc8cff", brightMagenta: "#d2a8ff", cyan: "#39c5cf", brightCyan: "#56d4dd",
          white: "#b1bac4", brightWhite: "#f0f6fc",
        },
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);
      fitAddon.fit();
      cleanup.push(() => term.dispose());

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/client?deviceId=${id}&type=TERMINAL`);
      wsRef.current = ws;
      cleanup.push(() => ws.close());

      ws.onopen = () => { if (!aborted) setStatusMsg("Waiting for agent..."); };

      ws.onmessage = (e) => {
        if (aborted) return;
        const msg = JSON.parse(e.data);
        if (msg.type === "ERROR") {
          setStatus("error");
          setStatusMsg(msg.error ?? "Agent not connected");
          term.writeln(`\r\n\x1b[31mError: ${msg.error}\x1b[0m`);
          return;
        }
        if (msg.type === "SESSION_INIT") return;
        if (msg.type === "SESSION_READY") {
          setStatus("ready");
          setStatusMsg("Connected");
          term.focus();
          return;
        }
        if (msg.type === "SESSION_END") {
          setStatus("disconnected");
          setStatusMsg("Session ended");
          term.writeln("\r\n\x1b[33mSession ended.\x1b[0m");
          return;
        }
        if (msg.type === "TERM_DATA" && msg.data) {
          term.write(atob(msg.data as string));
        }
      };

      ws.onclose = () => {
        if (aborted) return;
        setStatus("disconnected");
        setStatusMsg("Disconnected");
        term.writeln("\r\n\x1b[33mConnection closed.\x1b[0m");
      };

      ws.onerror = () => {
        if (aborted) return;
        setStatus("error");
        setStatusMsg("Connection error");
      };

      term.onData((data) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        // Local echo + Enter handling (no PTY, so we echo manually).
        let echo = "";
        let send = "";
        for (const ch of data) {
          const code = ch.charCodeAt(0);
          if (code === 13) {       // Enter → show newline, send LF
            echo += "\r\n";
            send += "\n";
          } else if (code === 127 || code === 8) { // Backspace
            echo += "\b \b";
            send += ch;
          } else if (code >= 32) { // Printable
            echo += ch;
            send += ch;
          } else {                 // Control chars (Ctrl+C etc.) — forward only
            send += ch;
          }
        }
        if (echo) term.write(echo);
        if (send) {
          // Encode as UTF-8 base64
          const bytes = new TextEncoder().encode(send);
          let bin = "";
          bytes.forEach((b) => { bin += String.fromCharCode(b); });
          ws.send(JSON.stringify({ type: "TERM_DATA", data: btoa(bin) }));
        }
      });

      const sendResize = () => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "TERM_RESIZE", cols: term.cols, rows: term.rows }));
        }
      };

      const observer = new ResizeObserver(sendResize);
      observer.observe(containerRef.current!);
      cleanup.push(() => observer.disconnect());
    })();

    return () => {
      aborted = true;
      cleanup.forEach(fn => fn());
    };
  }, [id, reconnectKey]);

  const reconnect = () => {
    setStatus("connecting");
    setStatusMsg("Reconnecting...");
    wsRef.current?.close();
    setReconnectKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <Link href={`/devices/${id}`} className="text-[#8b949e] hover:text-[#e6edf3] transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-[#8b949e] text-sm font-mono">terminal</span>
        <div className={`flex items-center gap-1.5 ml-auto text-xs ${statusColors[status]}`}>
          <Circle className="h-2 w-2 fill-current" />
          {statusMsg}
        </div>
        {status === "disconnected" && (
          <button onClick={reconnect} className="text-xs text-[#58a6ff] hover:underline ml-2">
            Reconnect
          </button>
        )}
      </div>
      <div ref={containerRef} className="flex-1 p-2" style={{ minHeight: 0 }} />
    </div>
  );
}
