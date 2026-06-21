// notify sends an outbound notification to the configured webhook. The payload
// includes a `text` field (so Slack/Discord/Mattermost incoming webhooks work
// out of the box) plus structured fields for custom integrations. Configure via
// ALERT_WEBHOOK_URL on the dashboard; with no URL set, notifications are skipped.
export async function notify(title: string, message: string, severity = "INFO") {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*${title}*\n${message}`,
        title,
        message,
        severity,
        source: "fixsmith-rmm",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("[notify] webhook failed:", e);
  }
}
