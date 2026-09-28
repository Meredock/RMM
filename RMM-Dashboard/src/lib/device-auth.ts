import { prisma } from "./prisma";
import { hashApiKey } from "./crypto";

// findDeviceByApiKey resolves the device an agent API key belongs to. Only the
// key's hash is stored, so the lookup is by hash.
export function findDeviceByApiKey(apiKey: string) {
  return prisma.device.findUnique({ where: { apiKeyHash: hashApiKey(apiKey) } });
}
