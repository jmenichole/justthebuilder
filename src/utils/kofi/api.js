import fs from "fs";
import path from "path";
import { log } from "../logger.js";

const DEFAULT_BASE = "https://ko-fi.com/api/v1";
const CATALOG_PATH = path.resolve("data", "kofi", "shop-catalog.json");

/**
 * Ko-fi API key (`KF_API_...`) from ko-fi.com → Settings → API / Applications.
 * Aliases supported for cross-repo tooling.
 */
export function getKofiApiKey() {
  return (
    process.env.KOFI_API_KEY?.trim() ||
    process.env.KOFI_ACCESS_TOKEN?.trim() ||
    process.env.KO_FI_ACCESS_TOKEN?.trim() ||
    ""
  );
}

export function getKofiApiBaseUrl() {
  const base = process.env.KOFI_API_BASE_URL?.trim() || DEFAULT_BASE;
  return base.replace(/\/$/, "");
}

function buildUrl(resourcePath, query) {
  const base = getKofiApiBaseUrl();
  const url = new URL(resourcePath.replace(/^\//, ""), `${base}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/**
 * @param {string} method
 * @param {string} resourcePath
 * @param {{ query?: object, body?: object }} [opts]
 */
export async function kofiApiRequest(method, resourcePath, opts = {}) {
  const key = getKofiApiKey();
  if (!key) {
    throw new Error(
      "KOFI_API_KEY not set. Add it to Fly secrets, GitHub org secrets, or .env (never commit)."
    );
  }

  const url = buildUrl(resourcePath, opts.query);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "JustTheBuilder/1.0 (Ko-fi API client)"
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 200);
    if (snippet.includes("Just a moment") || snippet.includes("cloudflare")) {
      throw new Error(
        "Ko-fi API blocked by Cloudflare from this network. Run from Fly.io, your machine, or retry later."
      );
    }
    throw new Error(`Ko-fi API returned non-JSON (${res.status}): ${snippet}`);
  }

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.title ||
      (Array.isArray(data?.errors) ? data.errors.join(", ") : null) ||
      `Ko-fi API HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

/** @returns {Promise<object>} */
export async function getCurrentUser() {
  return kofiApiRequest("GET", "/me");
}

/**
 * @param {{ page?: number, limit?: number }} [opts]
 * @returns {Promise<{ items: object[], raw: object }>}
 */
export async function listShopItems(opts = {}) {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const paths = ["/shop-items", "/shop_items", "/shop/items"];

  let lastErr;
  for (const resourcePath of paths) {
    try {
      const raw = await kofiApiRequest("GET", resourcePath, {
        query: { page, limit }
      });
      const items = normalizeShopItems(raw);
      return { items, raw };
    } catch (err) {
      lastErr = err;
      if (err.status && err.status !== 404) throw err;
    }
  }
  throw lastErr || new Error("Could not list shop items from Ko-fi API");
}

function normalizeShopItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.shop_items)) return raw.shop_items;
  return [];
}

/**
 * Create a shop item. Ko-fi may restrict this on some accounts — surfaces API errors clearly.
 * @param {{ name: string, price: number|string, description?: string, currency?: string }} input
 */
export async function createShopItem(input) {
  const body = {
    name: input.name,
    price: Number(input.price),
    description: input.description || "",
    currency: input.currency || "USD"
  };
  if (!body.name?.trim()) throw new Error("Shop item name is required");
  if (!Number.isFinite(body.price) || body.price <= 0) {
    throw new Error("Shop item price must be a positive number");
  }

  const paths = ["/shop-items", "/shop_items", "/shop/items"];
  let lastErr;
  for (const resourcePath of paths) {
    try {
      return await kofiApiRequest("POST", resourcePath, { body });
    } catch (err) {
      lastErr = err;
      if (err.status && ![404, 405].includes(err.status)) throw err;
    }
  }
  throw lastErr || new Error("Ko-fi API does not support creating shop items on this endpoint");
}

/**
 * @param {{ page?: number, limit?: number, type?: string }} [opts]
 */
export async function listTransactions(opts = {}) {
  const query = {
    page: opts.page ?? 1,
    limit: opts.limit ?? 25
  };
  if (opts.type) query.type = opts.type;
  return kofiApiRequest("GET", "/transactions", { query });
}

/**
 * Persist shop catalog for webhook filtering + agent reference.
 * @returns {Promise<object[]>}
 */
export async function syncShopCatalog() {
  const { items } = await listShopItems({ limit: 100 });
  const dir = path.dirname(CATALOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const catalog = {
    syncedAt: new Date().toISOString(),
    items: items.map((item) => ({
      name: item.name || item.title,
      price: item.price ?? item.unit_price,
      direct_link_code: item.direct_link_code || item.directLinkCode || item.code,
      id: item.id,
      enabled: item.enabled ?? item.is_enabled ?? true
    }))
  };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  log(`[kofi] synced ${catalog.items.length} shop item(s) to ${CATALOG_PATH}`);
  return catalog.items;
}

/** @returns {object[]} */
export function loadShopCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8")).items || [];
  } catch {
    return [];
  }
}

/**
 * Codes from env + catalog sync + default Basic pack.
 * @returns {Set<string>}
 */
export function allowedShopCodes() {
  const allowed = new Set(["2c6f47f1fc"]);
  for (const key of ["KOFI_SHOP_ITEM_CODE", "KOFI_CREATOR_SHOP_ITEM_CODE"]) {
    const v = process.env[key]?.trim();
    if (v) allowed.add(v);
  }
  const extra = process.env.KOFI_ALLOWED_SHOP_CODES?.split(/[,\s]+/).filter(Boolean) || [];
  for (const code of extra) allowed.add(code.trim());
  for (const item of loadShopCatalog()) {
    const code = item.direct_link_code;
    if (code) allowed.add(String(code));
  }
  return allowed;
}
