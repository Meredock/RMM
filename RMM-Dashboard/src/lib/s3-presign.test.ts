import { test } from "node:test";
import assert from "node:assert/strict";
import { presignUrl } from "./s3-presign";

/**
 * Validates the SigV4 core against the canonical example published by AWS
 * ("Authenticating Requests: Using Query Parameters"). The example presigns a
 * GET of examplebucket/test.txt and documents the exact expected signature, so
 * matching it proves the canonical-request / signing-key / signature steps.
 *
 * Run with: npx tsx --test src/lib/s3-presign.test.ts
 */
test("reproduces the documented AWS signature", () => {
  const url = presignUrl({
    method: "GET",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    bucket: "examplebucket",
    key: "test.txt",
    expiresIn: 86400,
    now: new Date("2013-05-24T00:00:00Z"),
  });

  assert.ok(url.startsWith("https://examplebucket.s3.amazonaws.com/test.txt?"));
  assert.ok(
    url.includes("X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request")
  );
  assert.ok(
    url.includes(
      "X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    )
  );
});

test("uses path-style addressing for a custom endpoint", () => {
  const url = presignUrl({
    accessKeyId: "key",
    secretAccessKey: "secret",
    region: "us-west-002",
    bucket: "fixsmith-backups",
    key: "clients/acme/nightly.zip",
    endpoint: "https://s3.us-west-002.backblazeb2.com",
    now: new Date("2026-06-21T00:00:00Z"),
  });
  assert.ok(
    url.startsWith(
      "https://s3.us-west-002.backblazeb2.com/fixsmith-backups/clients/acme/nightly.zip?"
    )
  );
  assert.ok(url.includes("X-Amz-Signature="));
});

test("defaults to a PUT presign with the region in the host", () => {
  const url = presignUrl({
    accessKeyId: "key",
    secretAccessKey: "secret",
    region: "ap-southeast-2",
    bucket: "fixsmith-backups",
    key: "a.zip",
    now: new Date("2026-06-21T00:00:00Z"),
  });
  assert.ok(url.includes("https://fixsmith-backups.s3.ap-southeast-2.amazonaws.com/a.zip?"));
  assert.ok(url.includes("X-Amz-Expires=900"));
});

test("includes a session token when supplied", () => {
  const url = presignUrl({
    accessKeyId: "key",
    secretAccessKey: "secret",
    sessionToken: "tok/en+value",
    region: "us-east-1",
    bucket: "b",
    key: "k.zip",
    now: new Date("2026-06-21T00:00:00Z"),
  });
  assert.ok(url.includes("X-Amz-Security-Token=tok%2Fen%2Bvalue"));
});
