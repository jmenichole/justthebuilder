import { log } from "../logger.js";

const HELPER_WEBHOOK_URL =
  process.env.JUSTTHEHELPER_WEBHOOK_URL || "https://justthehelper.fly.dev/webhooks/kofi";

const JTH_CODE_RE = /\bJTH-[A-Z0-9]{6}\b/i;

/**
 * Ko-fi allows one webhook URL per account. JustTheBuilder receives all events;
 * forward membership / JustTheHelper link-code payments to the helper app.
 * @param {string} rawBody Original application/x-www-form-urlencoded body
 * @param {object} payload Parsed Ko-fi JSON
 */
export async function forwardKofiToJustTheHelper(rawBody, payload) {
  if (!payload?.type) return { forwarded: false, reason: "no_type" };

  const message = payload.message || "";
  const hasHelperCode = JTH_CODE_RE.test(message);

  const shouldForward =
    payload.type === "Subscription" ||
    (hasHelperCode && (payload.type === "Donation" || payload.type === "Shop Order"));

  if (!shouldForward) return { forwarded: false, reason: "not_helper_event" };

  try {
    const res = await fetch(HELPER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: rawBody
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log(`[kofi] helper forward failed ${res.status}: ${text.slice(0, 120)}`);
      return { forwarded: false, reason: "helper_http_error", status: res.status };
    }
    log(`[kofi] forwarded ${payload.type} to JustTheHelper`);
    return { forwarded: true, status: res.status };
  } catch (err) {
    log(`[kofi] helper forward error: ${err.message}`);
    return { forwarded: false, reason: "helper_fetch_error" };
  }
}
