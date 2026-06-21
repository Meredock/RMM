import { prisma } from "./prisma";
import { notify } from "./notify";
import type { AlertType, AlertSeverity } from "@prisma/client";

// createAlert persists an alert and fires an outbound notification for it.
export async function createAlert(input: {
  deviceId?: string | null;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
}) {
  const alert = await prisma.alert.create({
    data: {
      deviceId: input.deviceId ?? null,
      type: input.type,
      severity: input.severity,
      message: input.message,
    },
  });
  void notify(input.type.replace(/_/g, " "), input.message, input.severity);
  return alert;
}
