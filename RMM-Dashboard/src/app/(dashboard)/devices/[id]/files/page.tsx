"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Folder, File, Upload,
  Download, Trash2, FolderPlus, Home, Loader2, Circle, RefreshCw,
  FolderOpen, Scissors, Copy, ClipboardPaste, Pencil, Info, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContextMenu, ContextMenuItem } from "@/components/ContextMenu";
import Link from "next/link";

interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
}

interface Clipboard {
  item: FileItem;
  op: "cut" | "copy";
}

interface MenuState {
  x: number;
  y: number;
  item: FileItem | null; // null = empty-space (background) menu
}

type Status = "connecting" | "ready" | "error";

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, (msg: Record<string, unknown>) => void>>(new Map());
  const [status, setStatus] = useState<Status>("connecting");
  const [statusMsg, setStatusMsg] = useState("Connecting...");
  const [currentPath, setCurrentPath] = useState("/");
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [properties, setProperties] = useState<FileItem | null>(null);
  const sessionIdRef = useRef<string>("");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const send = useCallback((msg: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const request = useCallback(
    <T,>(type: string, payload: Record<string, unknown>): Promise<T> => {
      return new Promise((resolve) => {
        const reqId = Math.random().toString(36).slice(2);
        pendingRef.current.set(reqId, (msg) => resolve(msg as T));
        send({ ...payload, type, reqId });
      });
    },
    [send]
  );

  const listDir = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const res = await request<{ items: FileItem[] }>("FILES_LIST", { path });
        setItems(res.items ?? []);
        setCurrentPath(path);
      } finally {
        setLoading(false);
      }
    },
    [request]
  );

  const navigate = useCallback(
    (path: string) => {
      setHistory((h) => [...h, currentPath]);
      listDir(path);
    },
    [currentPath, listDir]
  );

  const goBack = useCallback(() => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      listDir(prev);
    }
  }, [history, listDir]);

  const downloadFile = useCallback(
    async (path: string, name: string) => {
      const res = await request<{ data: string }>("FILES_READ", { path });
      if (!res.data) return;
      const bytes = Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
    [request]
  );

  const deleteItem = useCallback(
    async (path: string) => {
      if (!confirm(`Delete ${path}?`)) return;
      await request("FILES_DELETE", { path });
      listDir(currentPath);
    },
    [request, listDir, currentPath]
  );

  const uploadFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const destPath = `${currentPath.replace(/\/$/, "")}/${file.name}`;
        await request("FILES_WRITE", { path: destPath, data: base64 });
        listDir(currentPath);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [request, listDir, currentPath]
  );

  const mkdir = useCallback(async () => {
    const name = prompt("Folder name:");
    if (!name) return;
    const newPath = `${currentPath.replace(/\/$/, "")}/${name}`;
    await request("FILES_MKDIR", { path: newPath });
    listDir(currentPath);
  }, [request, listDir, currentPath]);

  const renameItem = useCallback(
    async (item: FileItem) => {
      const newName = prompt("Rename to:", item.name);
      if (!newName || newName === item.name) return;
      const parent = item.path.slice(0, item.path.lastIndexOf("/"));
      await request("FILES_RENAME", { from: item.path, to: `${parent}/${newName}` });
      listDir(currentPath);
    },
    [request, listDir, currentPath]
  );

  // paste drops the clipboard item into targetDir. A "cut" moves (rename), a
  // "copy" duplicates (server-side copy); same-folder copies get a " - Copy"
  // name to avoid clobbering the original.
  const paste = useCallback(
    async (targetDir: string) => {
      if (!clipboard) return;
      const base = targetDir.replace(/\/$/, "");
      let destName = clipboard.item.name;

      if (clipboard.op === "copy" && targetDir === currentPath) {
        const existing = new Set(items.map((i) => i.name));
        if (existing.has(destName)) {
          const dot = clipboard.item.isDir ? -1 : destName.lastIndexOf(".");
          const stem = dot > 0 ? destName.slice(0, dot) : destName;
          const ext = dot > 0 ? destName.slice(dot) : "";
          let candidate = `${stem} - Copy${ext}`;
          let n = 2;
          while (existing.has(candidate)) candidate = `${stem} - Copy (${n++})${ext}`;
          destName = candidate;
        }
      }

      const to = `${base}/${destName}`;
      if (clipboard.op === "cut") {
        await request("FILES_RENAME", { from: clipboard.item.path, to });
        setClipboard(null);
      } else {
        await request("FILES_COPY", { from: clipboard.item.path, to });
      }
      listDir(currentPath);
    },
    [clipboard, items, currentPath, request, listDir]
  );

  const openItem = useCallback(
    (item: FileItem) => {
      if (item.isDir) navigate(item.path);
      else downloadFile(item.path, item.name);
    },
    [navigate, downloadFile]
  );

  const buildMenu = useCallback(
    (item: FileItem | null): ContextMenuItem[] => {
      if (!item) {
        // Background menu (right-click on empty space)
        return [
          { label: "New Folder", icon: <FolderPlus className="h-4 w-4" />, onClick: mkdir },
          {
            label: "Paste",
            icon: <ClipboardPaste className="h-4 w-4" />,
            disabled: !clipboard,
            onClick: () => paste(currentPath),
          },
          { label: "Upload file…", icon: <Upload className="h-4 w-4" />, onClick: () => uploadInputRef.current?.click() },
          { divider: true },
          { label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => listDir(currentPath) },
        ];
      }
      return [
        item.isDir
          ? { label: "Open", icon: <FolderOpen className="h-4 w-4" />, onClick: () => navigate(item.path) }
          : { label: "Download", icon: <Download className="h-4 w-4" />, onClick: () => downloadFile(item.path, item.name) },
        ...(item.isDir && clipboard
          ? [{ label: "Paste into folder", icon: <ClipboardPaste className="h-4 w-4" />, onClick: () => paste(item.path) }]
          : []),
        { divider: true },
        { label: "Cut", icon: <Scissors className="h-4 w-4" />, onClick: () => setClipboard({ item, op: "cut" }) },
        { label: "Copy", icon: <Copy className="h-4 w-4" />, onClick: () => setClipboard({ item, op: "copy" }) },
        { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => renameItem(item) },
        { label: "Copy path", icon: <Link2 className="h-4 w-4" />, onClick: () => navigator.clipboard?.writeText(item.path) },
        { divider: true },
        { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => deleteItem(item.path) },
        { divider: true },
        { label: "Properties", icon: <Info className="h-4 w-4" />, onClick: () => setProperties(item) },
      ];
    },
    [clipboard, currentPath, mkdir, paste, listDir, navigate, downloadFile, renameItem, deleteItem]
  );

  useEffect(() => {
    let active = true;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/ws/client?deviceId=${id}&type=FILES`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      if (!active) return;
      const msg = JSON.parse(e.data) as Record<string, unknown>;

      if (msg.type === "ERROR") {
        setStatus("error");
        setStatusMsg(String(msg.error ?? "Agent not connected"));
        return;
      }
      if (msg.type === "SESSION_INIT") return;
      if (msg.type === "SESSION_READY") {
        setStatus("ready");
        setStatusMsg("Connected");
        sessionIdRef.current = String(msg.sessionId ?? "");
        listDir("/");
        return;
      }

      // Route to pending request
      const reqId = String(msg.reqId ?? "");
      if (reqId && pendingRef.current.has(reqId)) {
        pendingRef.current.get(reqId)!(msg);
        pendingRef.current.delete(reqId);
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
  }, [id, listDir]);

  const pathParts = currentPath.split("/").filter(Boolean);
  const isWindowsPath = /^[A-Za-z]:$/.test(pathParts[0] ?? "");
  const buildBreadcrumbPath = (i: number) =>
    isWindowsPath
      ? pathParts[0] + "/" + pathParts.slice(1, i + 1).join("/")
      : "/" + pathParts.slice(0, i + 1).join("/");

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <Link href={`/devices/${id}`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-medium">File Manager</span>
        <div className={`flex items-center gap-1.5 ml-auto text-xs ${status === "ready" ? "text-green-400" : "text-red-400"}`}>
          <Circle className="h-2 w-2 fill-current" />
          {statusMsg}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 shrink-0">
        <Button variant="ghost" size="icon" onClick={goBack} disabled={history.length === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => listDir("/")}>
          <Home className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => listDir(currentPath)}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm flex-1 min-w-0 ml-2 overflow-hidden">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground shrink-0">/</button>
          {pathParts.map((part, i) => {
            const path = buildBreadcrumbPath(i);
            return (
              <span key={path} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <button
                  onClick={() => navigate(path)}
                  className={`truncate ${i === pathParts.length - 1 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-1 ml-auto shrink-0">
          <Button variant="ghost" size="sm" onClick={mkdir} disabled={status !== "ready"}>
            <FolderPlus className="h-4 w-4 mr-1" /> New Folder
          </Button>
          <Button variant="ghost" size="sm" disabled={status !== "ready"} onClick={() => uploadInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />Upload
          </Button>
        </div>
      </div>

      {/* File list */}
      <div
        className="flex-1 overflow-auto"
        onContextMenu={(e) => {
          if (status !== "ready") return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, item: null });
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : status !== "ready" ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            {statusMsg}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium w-full">Name</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium whitespace-nowrap">Size</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium whitespace-nowrap">Modified</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Empty directory</td></tr>
              )}
              {[...items].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)).map((item) => (
                <tr
                  key={item.path}
                  className={`hover:bg-accent/50 group ${
                    clipboard?.op === "cut" && clipboard.item.path === item.path ? "opacity-50" : ""
                  }`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ x: e.clientX, y: e.clientY, item });
                  }}
                  onDoubleClick={() => openItem(item)}
                >
                  <td className="px-4 py-2">
                    <button
                      className="flex items-center gap-2 w-full text-left"
                      onClick={() => item.isDir ? navigate(item.path) : undefined}
                    >
                      {item.isDir
                        ? <Folder className="h-4 w-4 text-yellow-400 shrink-0" />
                        : <File className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <span className={item.isDir ? "text-foreground font-medium" : "text-foreground"}>
                        {item.name}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap">
                    {item.isDir ? <Badge variant="outline" className="text-xs">DIR</Badge> : formatSize(item.size)}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap text-xs">
                    {new Date(item.modTime).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                      {!item.isDir && (
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => downloadFile(item.path, item.name)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteItem(item.path)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Hidden input used by the toolbar and context-menu upload actions */}
      <input ref={uploadInputRef} type="file" className="hidden" onChange={uploadFile} />

      {/* Right-click context menu */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildMenu(menu.item)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Properties dialog */}
      {properties && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setProperties(null)}
        >
          <div
            className="w-96 max-w-[90vw] rounded-lg border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2.5">
              {properties.isDir
                ? <Folder className="h-5 w-5 text-yellow-400 shrink-0" />
                : <File className="h-5 w-5 text-muted-foreground shrink-0" />}
              <span className="font-medium truncate">{properties.name}</span>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ["Type", properties.isDir ? "Folder" : "File"],
                ["Size", properties.isDir ? "—" : formatSize(properties.size)],
                ["Location", properties.path],
                ["Modified", new Date(properties.modTime).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="break-all text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={() => setProperties(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
