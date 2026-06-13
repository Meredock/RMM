import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(date: Date | string | null): string {
  if (!date) return "Never";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatBytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export function getStatusColor(isOnline: boolean) {
  return isOnline
    ? "bg-green-500"
    : "bg-red-500";
}

export function getSeverityColor(severity: string) {
  switch (severity) {
    case "CRITICAL": return "destructive";
    case "WARNING": return "warning";
    case "INFO": return "secondary";
    default: return "secondary";
  }
}

export function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 40 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
