import { createHash, createHmac } from "crypto";

/**
 * Dependency-free AWS Signature V4 presigned URL generator for S3 (and any
 * S3-compatible store via a custom endpoint: Backblaze B2, Cloudflare R2,
 * MinIO, Wasabi, ...).
 *
 * The dashboard presigns a short-lived PUT so the agent can upload a finished
 * backup archive without ever holding cloud credentials. Validated against the
 * canonical AWS SigV4 example in s3-presign.test.ts.
 */

export interface PresignParams {
  method?: string; // defaults to PUT
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  bucket: string;
  key: string;
  /** Custom endpoint for S3-compatible providers, e.g. https://s3.us-west-002.backblazeb2.com */
  endpoint?: string;
  /** URL lifetime in seconds (max 604800). */
  expiresIn?: number;
  /** Signed Content-Type the agent must send on the PUT, if any. */
  signedHeaders?: Record<string, string>;
  now?: Date;
}

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

function uriEncode(value: string, encodeSlash = true): string {
  let out = encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
  if (!encodeSlash) out = out.replace(/%2F/g, "/");
  return out;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso.slice(0, 15) + "Z", dateStamp: iso.slice(0, 8) };
}

/**
 * Resolve the request host and canonical path. With no endpoint we use
 * virtual-hosted-style S3 (`bucket.s3.region.amazonaws.com/key`); with a custom
 * endpoint we use path-style (`endpoint/bucket/key`), which every S3-compatible
 * provider accepts.
 */
function resolveTarget(p: PresignParams): { host: string; canonicalUri: string; origin: string } {
  const encodedKey = uriEncode(p.key, false);
  if (p.endpoint) {
    const url = new URL(p.endpoint);
    return {
      host: url.host,
      canonicalUri: `/${uriEncode(p.bucket)}/${encodedKey}`,
      origin: `${url.protocol}//${url.host}`,
    };
  }
  const region = p.region === "us-east-1" ? "s3" : `s3.${p.region}`;
  const host = `${p.bucket}.${region}.amazonaws.com`;
  return { host, canonicalUri: `/${encodedKey}`, origin: `https://${host}` };
}

export function presignUrl(p: PresignParams): string {
  const method = (p.method || "PUT").toUpperCase();
  const expiresIn = Math.min(p.expiresIn ?? 900, 604800);
  const { amzDate, dateStamp } = amzDates(p.now ?? new Date());
  const { host, canonicalUri, origin } = resolveTarget(p);

  // Canonical (and signed) headers — host plus any caller-supplied headers.
  const headers: Record<string, string> = { host, ...(p.signedHeaders ?? {}) };
  const headerKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders =
    headerKeys
      .map((k) => {
        const original = Object.keys(headers).find((h) => h.toLowerCase() === k)!;
        return `${k}:${headers[original].trim()}`;
      })
      .join("\n") + "\n";
  const signedHeaders = headerKeys.join(";");

  const credentialScope = `${dateStamp}/${p.region}/${SERVICE}/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${p.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  if (p.sessionToken) {
    query["X-Amz-Security-Token"] = p.sessionToken;
  }

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${p.secretAccessKey}`, dateStamp), p.region), SERVICE),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return `${origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
