import type { BackupJob } from "@prisma/client";
import { presignUrl } from "./s3-presign";

/**
 * Builds the `backup <json>` command the agent executes, for a given job.
 * Centralises logic previously duplicated between the run-now route and the
 * scheduler. For S3 jobs it presigns a short-lived PUT so the agent uploads the
 * archive directly to object storage — no cloud credentials on the agent.
 */

export class BackupConfigError extends Error {}

const URL_TTL_SECONDS = 86_400; // 24h — covers slow heartbeats and large uploads

export function defaultArchiveName(jobName: string): string {
  const slug = jobName.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${slug}-${new Date().toISOString().slice(0, 10)}`;
}

export function buildBackupCommand(
  job: BackupJob,
  opts: { archiveName?: string } = {}
): { command: string; archiveName: string } {
  const archiveName = opts.archiveName ?? defaultArchiveName(job.name);

  const payload: Record<string, unknown> = {
    sources: job.sources,
    exclude: job.exclude.length > 0 ? job.exclude : undefined,
    maxBytes: job.maxBytes || undefined,
    name: archiveName,
  };

  if (job.storageType === "S3") {
    payload.upload = presignBackupUpload(job, archiveName);
    // Omit destination so the agent stages the zip in its own
    // platform-correct default dir before uploading, then removes it.
  } else {
    payload.destination = job.destination || undefined;
  }

  return { command: `backup ${JSON.stringify(payload)}`, archiveName };
}

function presignBackupUpload(job: BackupJob, archiveName: string) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN || undefined;
  const region = job.s3Region || process.env.AWS_REGION || "";

  if (!accessKeyId || !secretAccessKey) {
    throw new BackupConfigError(
      "S3 storage requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on the server"
    );
  }
  if (!job.s3Bucket) {
    throw new BackupConfigError("S3 job is missing a bucket");
  }
  if (!region) {
    throw new BackupConfigError("S3 job is missing a region (set s3Region or AWS_REGION)");
  }

  const prefix = (job.s3Prefix || "").replace(/^\/+|\/+$/g, "");
  const key = [prefix, `${archiveName}.zip`].filter(Boolean).join("/");

  const url = presignUrl({
    method: "PUT",
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region,
    bucket: job.s3Bucket,
    key,
    endpoint: job.s3Endpoint || undefined,
    expiresIn: URL_TTL_SECONDS,
  });

  return {
    url,
    method: "PUT",
    headers: { "Content-Type": "application/zip" },
  };
}
