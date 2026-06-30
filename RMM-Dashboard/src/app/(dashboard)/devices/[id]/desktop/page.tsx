"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Circle, Maximize2, Minimize2, MousePointer } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Status = "connecting" | "ready" | "error";

export default function DesktopPage() {
  const { id } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [statusMsg, setStatusMsg] = useState("Connecting...");
  const [fps, setFps] = useState(0);
  const [remoteSize, setRemoteSize] = useState({ w: 1920, h: 1080 });
  const [inputEnabled, setInputEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const fpsRef = useRef({ count: 0, last: 0 });

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const drawFrame = useCallback((b64: string, w: number, h: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      setRemoteSize({ w, h });
    }

    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = `data:image/jpeg;base64,${b64}`;

    fpsRef.current.count++;
    const now = Date.now();
    if (now - fpsRef.current.last >= 1000) {
      setFps(fpsRef.current.count);
      fpsRef.current.count = 0;
      fpsRef.current.last = now;
    }
  }, []);

  // Map canvas coords to remote screen coords
  const toRemote = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = remoteSize.w / rect.width;
    const scaleY = remoteSize.h / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, [remoteSize]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inputEnabled) return;
    send({ type: "DESKTOP_MOUSE", event: "move", ...toRemote(e) });
  }, [inputEnabled, send, toRemote]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inputEnabled) return;
    e.preventDefault();
    send({ type: "DESKTOP_MOUSE", event: "down", button: e.button, ...toRemote(e) });
  }, [inputEnabled, send, toRemote]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inputEnabled) return;
    send({ type: "DESKTOP_MOUSE", event: "up", button: e.button, ...toRemote(e) });
  }, [inputEnabled, send, toRemote]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!inputEnabled) return;
    send({ type: "DESKTOP_SCROLL", delta: e.deltaY, ...toRemote(e) });
  }, [inputEnabled, send, toRemote]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!inputEnabled) return;
    e.preventDefault();
    send({ type: "DESKTOP_KEY", event: "down", key: e.key, code: e.code, modifiers: { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey } });
  }, [inputEnabled, send]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!inputEnabled) return;
    send({ type: "DESKTOP_KEY", event: "up", key: e.key, code: e.code });
  }, [inputEnabled, send]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useEffect(() => {
    let active = true;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/ws/client?deviceId=${id}&type=DESKTOP`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      if (!active) return;
      const msg = JSON.parse(e.data);
      if (msg.type === "ERROR") { setStatus("error"); setStatusMsg(String(msg.error)); return; }
      if (msg.type === "SESSION_INIT") return;
      if (msg.type === "SESSION_READY") { setStatus("ready"); setStatusMsg("Connected"); return; }
      if (msg.type === "SESSION_END") { setStatus("error"); setStatusMsg("Session ended"); return; }
      if (msg.type === "DESKTOP_FRAME") {
        drawFrame(msg.data as string, msg.width as number, msg.height as number);
      }
    };
    ws.onclose = () => {
      if (!active) return;
      setStatus("error");
      setStatusMsg("Disconnected");
    };
    return () => {
      active = false;
      ws.close();
    };
  }, [id, drawFrame]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col h-screen bg-black">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#161b22] border-b border-[#30363d] shrink-0 z-10">
        <Link href={`/devices/${id}`} className="text-[#8b949e] hover:text-[#e6edf3]">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-[#8b949e] text-sm">Remote Desktop</span>
        <div className={`flex items-center gap-1.5 text-xs ml-4 ${status === "ready" ? "text-green-400" : "text-yellow-400"}`}>
          <Circle className="h-2 w-2 fill-current" />
          {statusMsg}
        </div>
        {status === "ready" && (
          <span className="text-xs text-[#8b949e] ml-2">
            {remoteSize.w}×{remoteSize.h} · {fps} fps
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInputEnabled((v) => !v)}
            className={inputEnabled ? "text-green-400" : "text-[#8b949e]"}
          >
            <MousePointer className="h-4 w-4 mr-1" />
            {inputEnabled ? "Input on" : "Input off"}
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black relative">
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center text-[#8b949e] text-sm z-10 bg-black">
            {statusMsg}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{ cursor: "default", display: status === "ready" ? "block" : "none" }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
