import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { loadCredentials, sendHeartbeat } from "./agent";

export const BACKGROUND_HEARTBEAT_TASK = "rmm-phone-agent-heartbeat";
const MINIMUM_INTERVAL_SECONDS = 15 * 60;

if (!TaskManager.isTaskDefined(BACKGROUND_HEARTBEAT_TASK)) {
  TaskManager.defineTask(BACKGROUND_HEARTBEAT_TASK, async () => {
    try {
      const credentials = await loadCredentials();
      if (!credentials.apiKey) return BackgroundFetch.BackgroundFetchResult.NoData;
      await sendHeartbeat(credentials);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function enableBackgroundHeartbeat() {
  const status = await BackgroundFetch.getStatusAsync();
  if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return false;

  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_HEARTBEAT_TASK);
  if (!registered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_HEARTBEAT_TASK, {
      minimumInterval: MINIMUM_INTERVAL_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
  return true;
}
