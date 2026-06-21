import { NextResponse } from "next/server";

// Public endpoint agents poll to discover the latest available build. Configure
// via env on the dashboard:
//   AGENT_LATEST_VERSION       e.g. "1.2.0"
//   AGENT_DOWNLOAD_URL_WINDOWS e.g. a GitHub release asset URL for rmm-agent.exe
//   AGENT_DOWNLOAD_URL_LINUX / AGENT_DOWNLOAD_URL_DARWIN
// If AGENT_LATEST_VERSION is unset, auto-update is effectively disabled.
export async function GET() {
  return NextResponse.json({
    version: process.env.AGENT_LATEST_VERSION ?? null,
    downloads: {
      windows: process.env.AGENT_DOWNLOAD_URL_WINDOWS ?? null,
      linux: process.env.AGENT_DOWNLOAD_URL_LINUX ?? null,
      darwin: process.env.AGENT_DOWNLOAD_URL_DARWIN ?? null,
    },
  });
}
