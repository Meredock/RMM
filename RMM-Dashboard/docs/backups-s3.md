# Backups: S3 / cloud storage

The dashboard's backup feature can send each job's archive to **local/network
storage** (default) or to an **S3-compatible bucket**, chosen per job.

## How it works

1. A backup job stores its storage target (`storageType` = `LOCAL` or `S3`,
   plus bucket/prefix/region/endpoint for S3).
2. When a job runs (manually or via schedule), the dashboard builds the agent's
   `backup` command. For S3 jobs it **presigns a short-lived PUT URL** and
   includes it in the command — cloud credentials stay on the dashboard and
   never reach the agent.
3. The agent zips the sources locally (its normal behaviour) and, if an upload
   URL is present, PUTs the archive to the bucket, then removes the local copy.
4. The agent reports the final `location` (the bucket URL), which is stored on
   the `BackupRun` and shown in the UI. The presigned signature is stripped
   before storage.

Presigning is a dependency-free SigV4 implementation (`src/lib/s3-presign.ts`),
validated against AWS's canonical signature example.

## Server configuration

Set these where the dashboard runs (e.g. Render env). Only needed if any job
uses S3:

| Variable | Purpose |
|----------|---------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credentials used to presign uploads |
| `AWS_REGION` | Default region when a job doesn't set one |
| `AWS_SESSION_TOKEN` | Only for temporary STS credentials |

Per job you can also set a custom **endpoint** and **region** for S3-compatible
providers (Backblaze B2, Cloudflare R2, Wasabi, MinIO). With no endpoint the
dashboard uses AWS virtual-hosted-style addressing; with an endpoint it uses
path-style, which those providers accept.

The bucket must allow `PutObject` for the credentials above. CORS is not
required (the agent PUTs server-to-server, not from a browser).

## Database migration

This feature adds columns to `BackupJob` and a `StorageType` enum. Apply the
migration when deploying:

```bash
cd RMM-Dashboard
npx prisma migrate deploy   # applies prisma/migrations/*_add_backup_s3_storage
```

Existing jobs default to `LOCAL`, so current behaviour is unchanged.

## Hosting the GUI at backup.fixsmith.com.au

The backup UI is the existing per-device backups page. To surface it on the
subdomain:

1. Add `backup.fixsmith.com.au` as a custom domain on the dashboard's Render
   service and point the DNS CNAME at Render.
2. The dashboard middleware already redirects the `backup.` subdomain root to
   the backup overview (`/backups`, also linked in the sidebar), which lists
   every job and recent runs across devices. Per-device create/run/schedule
   actions live on each device's Backups tab.
