import { normalizeDeviceType, type DeviceType } from "./device-type";

const MAX_NAME_LENGTH = 120;
const MAX_HOSTNAME_LENGTH = 255;
const MAX_METADATA_LENGTH = 500;
const ALLOWED_DEVICE_TYPES = new Set(["desktop", "phone", "tablet"]);

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request body must be a JSON object");
  return value as JsonObject;
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long`);
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength = MAX_METADATA_LENGTH) {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long`);
  return normalized || undefined;
}

function optionalMetric(value: unknown, field: string, maximum = 100) {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${field} must be a number between 0 and ${maximum}`);
  }
  return value;
}

function optionalCoordinate(value: unknown, field: string, minimum: number, maximum: number) {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be a number between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string) {
  if (value == null) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function resolveProvidedDeviceType(value: unknown, platform?: string): DeviceType {
  const type = optionalString(value, "device type", 20);
  if (type && !ALLOWED_DEVICE_TYPES.has(type.toLowerCase())) {
    throw new Error("device type must be desktop, phone, or tablet");
  }
  return normalizeDeviceType(type ?? platform);
}

export function validateRegistrationPayload(value: unknown) {
  const body = object(value);
  const platform = optionalString(body.platform, "platform", 100);
  return {
    name: requiredString(body.name, "name", MAX_NAME_LENGTH),
    hostname: requiredString(body.hostname, "hostname", MAX_HOSTNAME_LENGTH),
    platform: platform ?? "unknown",
    deviceType: resolveProvidedDeviceType(body.deviceType, platform),
    osVersion: optionalString(body.osVersion, "os version"),
    ipAddress: optionalString(body.ipAddress, "IP address", 100),
    agentVersion: optionalString(body.agentVersion, "agent version", 100),
  };
}

export function validateHeartbeatPayload(value: unknown) {
  const body = object(value);
  const cpuPercent = optionalMetric(body.cpu_percent, "cpu_percent");
  const ramPercent = optionalMetric(body.ram_percent, "ram_percent");
  if ((cpuPercent === undefined) !== (ramPercent === undefined)) {
    throw new Error("cpu_percent and ram_percent must be supplied together");
  }

  const locationLat = optionalCoordinate(body.location_lat, "location_lat", -90, 90);
  const locationLng = optionalCoordinate(body.location_lng, "location_lng", -180, 180);
  if ((locationLat === undefined) !== (locationLng === undefined)) {
    throw new Error("location_lat and location_lng must be supplied together");
  }
  const locationConsent = optionalBoolean(body.location_consent, "location_consent");

  const deviceType = optionalString(body.device_type, "device type", 20);
  if (deviceType && !ALLOWED_DEVICE_TYPES.has(deviceType.toLowerCase())) {
    throw new Error("device type must be desktop, phone, or tablet");
  }

  return {
    cpuPercent,
    ramPercent,
    ramUsedMb: optionalMetric(body.ram_used_mb, "ram_used_mb", Number.MAX_SAFE_INTEGER) ?? 0,
    ramTotalMb: optionalMetric(body.ram_total_mb, "ram_total_mb", Number.MAX_SAFE_INTEGER) ?? 0,
    diskPercent: optionalMetric(body.disk_percent, "disk_percent") ?? 0,
    diskUsedGb: optionalMetric(body.disk_used_gb, "disk_used_gb", Number.MAX_SAFE_INTEGER) ?? 0,
    diskTotalGb: optionalMetric(body.disk_total_gb, "disk_total_gb", Number.MAX_SAFE_INTEGER) ?? 0,
    batteryLevel: optionalMetric(body.battery_level, "battery_level"),
    connectionType: optionalString(body.connection_type, "connection type", 50),
    locationLat,
    locationLng,
    locationConsent,
    ipAddress: optionalString(body.ip_address, "IP address", 100),
    osVersion: optionalString(body.os_version, "os version"),
    agentVersion: optionalString(body.agent_version, "agent version", 100),
    platform: optionalString(body.platform, "platform", 100),
  };
}
