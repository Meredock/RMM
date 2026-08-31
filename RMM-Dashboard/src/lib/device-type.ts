export type DeviceType = "desktop" | "phone" | "tablet" | "unknown";

export function normalizeDeviceType(value?: string | null): DeviceType {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("iphone") || normalized.includes("ipad") || normalized.includes("android") || normalized.includes("phone") || normalized.includes("mobile")) {
    return normalized.includes("ipad") || normalized.includes("tablet") ? "tablet" : "phone";
  }

  if (normalized.includes("linux") || normalized.includes("windows") || normalized.includes("darwin") || normalized.includes("mac")) {
    return "desktop";
  }

  return "unknown";
}
