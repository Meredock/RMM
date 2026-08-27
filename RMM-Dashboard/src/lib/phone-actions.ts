export type MobileActionCommand = "mobile:ping" | "mobile:locate" | "mobile:lock";

const MOBILE_ALLOWED_COMMANDS = new Set<MobileActionCommand>([
  "mobile:ping",
  "mobile:locate",
  "mobile:lock",
]);

export function normalizePhoneActionCommand(command: string): MobileActionCommand | undefined {
  const trimmed = command.trim().toLowerCase();
  if (!trimmed) return undefined;

  if (trimmed === "mobile:ping" || trimmed === "ping") return "mobile:ping";
  if (trimmed === "mobile:locate" || trimmed === "locate") return "mobile:locate";
  if (trimmed === "mobile:lock" || trimmed === "lock") return "mobile:lock";
  return undefined;
}

export function isAllowedDeviceCommand(deviceType: string | null | undefined, command: string): boolean {
  const normalized = normalizePhoneActionCommand(command);
  if (deviceType === "phone" || deviceType === "tablet") {
    return normalized !== undefined && MOBILE_ALLOWED_COMMANDS.has(normalized);
  }

  return true;
}
