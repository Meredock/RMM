import React, { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as Device from "expo-device";
import { enableBackgroundHeartbeat } from "./src/background-heartbeat";
import { loadCredentials, saveCredentials, sendHeartbeat as sendAgentHeartbeat } from "./src/agent";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export default function App() {
  const [dashboardUrl, setDashboardUrl] = useState("http://192.168.1.50:3000");
  const [registrationSecret, setRegistrationSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to register the phone agent.");

  const deviceName = useMemo(() => {
    return Device.modelName || Device.modelId || "Phone";
  }, []);

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const saved = await loadCredentials();
        if (saved.dashboardUrl) setDashboardUrl(saved.dashboardUrl);
        if (saved.apiKey) setApiKey(saved.apiKey);
        if (saved.deviceId) setDeviceId(saved.deviceId);
      } catch {
        // Ignore storage issues in the minimal first pass.
      }
    };

    loadSaved();
  }, []);

  useEffect(() => {
    if (!apiKey || !dashboardUrl) return;

    void sendHeartbeat();
    void enableBackgroundHeartbeat();
    const interval = setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [apiKey, dashboardUrl]);

  async function sendHeartbeat(credentials = { dashboardUrl, apiKey, deviceId }) {
    try {
      const pendingCommands = await sendAgentHeartbeat(credentials);
      setStatus(`Heartbeat sent. Pending commands: ${pendingCommands}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Heartbeat failed";
      setStatus(message);
    }
  }

  async function registerDevice() {
    setLoading(true);
    setStatus("Registering device...");

    try {
      const normalizedUrl = dashboardUrl.replace(/\/$/, "");
      const res = await fetch(`${normalizedUrl}/api/agent/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(registrationSecret ? { "x-registration-secret": registrationSecret } : {}),
        },
        body: JSON.stringify({
          name: deviceName,
          hostname: Device.deviceName || "phone-agent",
          platform: Platform.OS || "android",
          osVersion: `${Device.osName || "Mobile"} ${Device.osVersion || "unknown"}`,
          ipAddress: "mobile",
          agentVersion: "1.0.0-phone",
          deviceType: "phone",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Registration failed");
      }

      const nextApiKey = json.apiKey || "";
      const nextDeviceId = json.deviceId || "";
      setApiKey(nextApiKey);
      setDeviceId(nextDeviceId);
      await saveCredentials({ dashboardUrl, apiKey: nextApiKey, deviceId: nextDeviceId });
      setStatus(`Registered successfully. Device ID: ${nextDeviceId || "unknown"}`);
      await sendHeartbeat({ dashboardUrl, apiKey: nextApiKey, deviceId: nextDeviceId });
      void enableBackgroundHeartbeat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown registration error";
      Alert.alert("Registration failed", message);
      setStatus(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>RMM Phone Agent</Text>
        <Text style={styles.subtitle}>Mobile device management</Text>

        <View style={styles.panel}>
          <Text style={styles.label}>Dashboard URL</Text>
          <TextInput
            value={dashboardUrl}
            onChangeText={setDashboardUrl}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            placeholder="https://dashboard.example.com"
          />

          <Text style={styles.label}>Registration secret</Text>
          <TextInput
            value={registrationSecret}
            onChangeText={setRegistrationSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={styles.input}
            placeholder="Optional if not configured"
          />

          <Text style={styles.meta}>Device: {deviceName}</Text>
          <Text style={styles.meta}>OS: {Device.osName || "Unknown"}</Text>
          <Text style={styles.meta}>API Key: {apiKey || "not registered"}</Text>
          <Text style={styles.meta}>Device ID: {deviceId || "not registered"}</Text>
          {apiKey && <Text style={styles.meta}>Heartbeat: every 30 seconds while open; background delivery is OS scheduled.</Text>}

          <TouchableOpacity style={styles.primaryButton} onPress={registerDevice} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Register Device</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => void sendHeartbeat()}>
            <Text style={styles.secondaryButtonText}>Send Heartbeat</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.status}>{status}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 16,
  },
  panel: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  label: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 14,
  },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  meta: {
    color: "#cbd5e1",
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#f8fafc",
    fontWeight: "600",
  },
  status: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
  },
});
