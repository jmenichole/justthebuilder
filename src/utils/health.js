import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./logger.js";
import { parseKofiFormBody, handleKofiPayload, publicThanksUrl } from "./kofi/webhook.js";
import { forwardKofiToJustTheHelper } from "./kofi/forwardHelper.js";

let _client = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const thanksHtmlPath = path.resolve(__dirname, "..", "..", "kofi-thanks.html");

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function renderThanksPage(code) {
  if (fs.existsSync(thanksHtmlPath)) {
    let html = fs.readFileSync(thanksHtmlPath, "utf-8");
    html = html.replace(/\{\{CODE\}\}/g, code ? escapeHtml(code) : "");
    html = html.replace(/\{\{CODE_BLOCK\}\}/g, code ? `<p class="code">${escapeHtml(code)}</p>` : "");
    html = html.replace(
      /\{\{CODE_INSTRUCTIONS\}\}/g,
      code
        ? `<p>Your unlock code: <strong><code>${escapeHtml(code)}</code></strong></p>`
        : "<p>Check your <strong>Discord DMs</strong> from JustTheBuilder for your code, or use the transaction ID from your Ko-fi email receipt with <code>/setup redeem</code>.</p>"
    );
    return html;
  }
  return `<!DOCTYPE html><html><body><h1>Thanks for your purchase!</h1>${code ? `<p>Code: <code>${escapeHtml(code)}</code></p>` : ""}<p>Run <code>/setup redeem</code> in your server.</p></body></html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function handleKofiWebhook(req, res) {
  try {
    const body = await readBody(req);
    const payload = parseKofiFormBody(body);

    const forward = await forwardKofiToJustTheHelper(body, payload);
    if (forward.forwarded && payload.type !== "Shop Order") {
      sendJson(res, 200, { ok: true, forwarded: "justthehelper" });
      return;
    }

    const result = await handleKofiPayload(payload, _client);

    if (!result.ok && result.reason === "invalid_token") {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    try {
      const { postAnalytics } = await import("./ops.js");
      if (result.code) {
        postAnalytics({
          event: "kofi_purchase",
          title: "☕ Ko-fi shop order",
          description: result.entry?.fromName ? `From **${result.entry.fromName}**` : "New shop order",
          fields: [
            { name: "Code", value: `\`${result.code}\``, inline: true },
            { name: "Transaction", value: `\`${result.entry?.kofiTransactionId || "?"}\``, inline: true },
            {
              name: "Thanks URL",
              value: publicThanksUrl(result.code),
              inline: false
            }
          ]
        });
      }
    } catch (err) {
      log(`[kofi] analytics failed: ${err.message}`);
    }

    sendJson(res, 200, { ok: true });
  } catch (err) {
    log(`[kofi] webhook error: ${err.message}`);
    sendJson(res, 400, { error: "bad_request" });
  }
}

/**
 * Start HTTP server: health checks + Ko-fi webhook + thank-you page.
 * @param {import('discord.js').Client} client
 * @param {number} [port]
 */
export function startHealthServer(client, port = Number(process.env.PORT) || 3000) {
  _client = client;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { status: "ok", uptime: process.uptime() });
        return;
      }

      if (req.method === "GET" && url.pathname === "/status") {
        sendJson(res, 200, {
          status: "ok",
          uptime: Math.floor(process.uptime()),
          guilds: _client?.guilds?.cache?.size ?? 0,
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          env: process.env.NODE_ENV || "development"
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/webhooks/kofi") {
        await handleKofiWebhook(req, res);
        return;
      }

      if (req.method === "GET" && (url.pathname === "/kofi/thanks" || url.pathname === "/kofi-thanks")) {
        const code = url.searchParams.get("code")?.trim().toUpperCase() || "";
        sendHtml(res, 200, renderThanksPage(code));
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      log(`HTTP handler error: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
    }
  });

  server.on("error", (err) => log(`Health server error: ${err.message}`));
  server.listen(port, "0.0.0.0", () =>
    log(`HTTP server on :${port} — /health, POST /webhooks/kofi, GET /kofi/thanks`)
  );
  return server;
}
