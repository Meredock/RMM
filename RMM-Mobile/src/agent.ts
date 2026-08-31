import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const STORAGE_KEYS = {
  dashboardUrl: "rmm.dashboardUrl",
  apiKey: "rmm.apiKey",
  deviceId: "rmm.deviceId",
};

export type AgentCredentials = {
  dashboardUrl: string;
  apiKey: string;
  deviceId: string;
};

export async function loadCredentials(): Promise<AgentCredentials> {
  const [dashboardUrl, apiKey, deviceId] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.dashboardUrl),
    SecureStore.getItemAsync(STORAGE_KEYS.apiKey),
    SecureStore.getItemAsync(STORAGE_KEYS.deviceId),
  ]);

  return { dashboardUrl: dashboardUrl ?? "", apiKey: apiKey ?? "", deviceId: deviceId ?? "" };
}

export async function saveCredentials(credentials: AgentCredentials) {
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.dashboardUrl, credentials.dashboardUrl),
    SecureStore.setItemAsync(STORAGE_KEYS.apiKey, credentials.apiKey),
    SecureStore.setItemAsync(STORAGE_KEYS.deviceId, credentials.deviceId),
  ]);
}

export async function getLocationTelemetry(): Promise<{ location_consent: boolean; location_lat?: number; location_lng?: number }> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      return { location_consent: false };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: false,
    });

    return {
      location_consent: true,
      location_lat: position.coords.latitude,
      location_lng: position.coords.longitude,
    };
  } catch {
    return { location_consent: false };
  }
}

export function normalizePhoneCommand(command: string): "ping" | "locate" | "lock" | "unsupported" {
  const normalized = command.trim().toLowerCase();
  if (normalized === "mobile:ping" || normalized === "ping") return "ping";
  if (normalized === "mobile:locate" || normalized === "locate") return "locate";
  if (normalized === "mobile:lock" || normalized === "lock") return "lock";
  return "unsupported";
}

export async function executePhoneCommand(command: string): Promise<{ success: boolean; output: string; exitCode: number }> {
  switch (normalizePhoneCommand(command)) {
    case "ping":
      return {
        success: true,
        output: "Ping acknowledged by the phone agent.",
        exitCode: 0,
      };
    case "lock": {
      const output = "Lock request acknowledged; direct OS lock is not available in this first-pass mobile client without device-policy support.";
      return {
        success: true,
        output,
        exitCode: 0,
      };
    }
    case "locate": {
      const location = await getLocationTelemetry();
      if (location.location_lat === undefined || location.location_lng === undefined) {
        return {
          success: false,
          output: "Location unavailable. Grant foreground location permission to report coordinates.",
          exitCode: 1,
        };
      }

      return {
        success: true,
        output: `Location: ${location.location_lat.toFixed(5)}, ${location.location_lng.toFixed(5)}`,
        exitCode: 0,
      };
    }
    default:
      return {
        success: false,
        output: `Unsupported mobile command: ${command}`,
        exitCode: 1,
      };
  }
}

export async function sendHeartbeat(credentials: AgentCredentials): Promise<number> {
  if (!credentials.apiKey || !credentials.dashboardUrl) {
    throw new Error("The phone agent is not enrolled.");
  }

  const [batteryLevel, networkState, locationTelemetry] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    Network.getNetworkStateAsync(),
    getLocationTelemetry(),
  ]);
  const batteryPercent = batteryLevel >= 0 ? Math.round(batteryLevel * 100) : undefined;

  const response = await fetch(`${credentials.dashboardUrl.replace(/\/$/, "")}/api/agent/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": credentials.apiKey },
    body: JSON.stringify({
      platform: Platform.OS || "android",
      device_type: "phone",
      ip_address: "mobile",
      os_version: `${Device.osName || "Mobile"} ${Device.osVersion || "unknown"}`,
      agent_version: "1.0.0-phone",
      cpu_percent: 0,
      ram_percent: 0,
      disk_percent: 0,
      battery_level: batteryPercent,
      connection_type: networkState.type ?? undefined,
      ...locationTelemetry,
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error || "Heartbeat failed");

  const pendingCommands: Array<{ id: string; command: string }> = json.pendingCommands ?? [];
  for (const pendingCommand of pendingCommands) {
    const result = await executePhoneCommand(pendingCommand.command);
    try {
      await fetch(`${credentials.dashboardUrl.replace(/\/$/, "")}/api/agent/command/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": credentials.apiKey },
        body: JSON.stringify({
          commandId: pendingCommand.id,
          output: result.output,
          exitCode: result.exitCode,
          success: result.success,
        }),
      });
    } catch {
      // Ignore command-result send failures; the next heartbeat will retry the pending state.
    }
  }

  return pendingCommands.length;
}
