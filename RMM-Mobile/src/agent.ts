import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Battery from "expo-battery";
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

export async function sendHeartbeat(credentials: AgentCredentials): Promise<number> {
  if (!credentials.apiKey || !credentials.dashboardUrl) {
    throw new Error("The phone agent is not enrolled.");
  }

  const [batteryLevel, networkState] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    Network.getNetworkStateAsync(),
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
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error || "Heartbeat failed");
  return json.pendingCommands?.length ?? 0;
}
