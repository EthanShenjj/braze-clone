import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { renderWebhookText, validateWebhookVariant, type WebhookHeader, type WebhookVariant } from "./webhook-model";

export type WebhookAttempt = {
  attempt: number;
  statusCode: number | null;
  outcome: "delivered" | "failed" | "blocked";
  responseBody: string;
  error: string;
  durationMs: number;
};

export type WebhookDeliveryResult = {
  url: string;
  method: string;
  requestHeaders: WebhookHeader[];
  requestBody: string;
  attempts: WebhookAttempt[];
  delivered: boolean;
};

export function webhookDeliveryCapability() {
  return {
    enabled: process.env.WEBHOOK_DELIVERY_ENABLED === "true",
    allowedHosts: allowedHosts(),
    allowPrivateHosts: process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS === "true",
    maxAttempts: Math.min(5, Math.max(1, Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 5))),
    timeoutMs: Math.min(120_000, Math.max(1_000, Number(process.env.WEBHOOK_TIMEOUT_MS ?? 120_000))),
  };
}

function allowedHosts() {
  return (process.env.WEBHOOK_ALLOWED_HOSTS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
}

function hostnameAllowed(hostname: string, rules: string[]) {
  const host = hostname.toLowerCase();
  return rules.some(rule => rule === host || (rule.startsWith("*.") && host.endsWith(rule.slice(1)) && host !== rule.slice(2)));
}

function privateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

async function assertSafeDestination(url: URL) {
  const capability = webhookDeliveryCapability();
  if (!capability.enabled) throw new Error("Webhook delivery is disabled. Set WEBHOOK_DELIVERY_ENABLED=true to enable it.");
  if (!capability.allowedHosts.length || !hostnameAllowed(url.hostname, capability.allowedHosts)) {
    throw new Error(`Destination host “${url.hostname}” is not in WEBHOOK_ALLOWED_HOSTS.`);
  }
  const resolved = await lookup(url.hostname, { all: true, verbatim: true });
  if (!resolved.length) throw new Error("Destination host did not resolve to an IP address.");
  if (!capability.allowPrivateHosts && resolved.some(entry => privateAddress(entry.address))) {
    throw new Error("Private, loopback, and link-local webhook destinations are blocked.");
  }
}

function retryable(status: number | null) { return status === 408 || status === 429 || (status !== null && status >= 500); }

function retryDelay(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Math.min(30_000, Number(retryAfter) * 1000);
  return Math.min(5_000, 250 * 2 ** (attempt - 1));
}

function wait(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function deliverWebhook(variant: WebhookVariant, context: Record<string, unknown>, locale = "en", requestedAttempts?: number): Promise<WebhookDeliveryResult> {
  const issues = validateWebhookVariant(variant, context);
  if (issues.length) throw new Error(issues.join(" "));
  const url = renderWebhookText(variant.url, context, locale, variant.translations);
  const parsed = new URL(url);
  await assertSafeDestination(parsed);
  const requestHeaders = variant.headers.map(header => ({ ...header, value: renderWebhookText(header.value, context, locale, variant.translations) }));
  const requestBody = variant.method === "GET" ? "" : renderWebhookText(variant.body, context, locale, variant.translations);
  const headers = new Headers();
  for (const header of requestHeaders) headers.set(header.key, header.value);
  const attempts: WebhookAttempt[] = [];
  const maximum = Math.min(webhookDeliveryCapability().maxAttempts, Math.max(1, requestedAttempts ?? webhookDeliveryCapability().maxAttempts));
  for (let attempt = 1; attempt <= maximum; attempt += 1) {
    const started = Date.now();
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        method: variant.method,
        headers,
        body: requestBody || undefined,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(webhookDeliveryCapability().timeoutMs),
      });
      const responseBody = (await response.text()).slice(0, 8_192);
      const delivered = response.status >= 200 && response.status < 300;
      attempts.push({ attempt, statusCode: response.status, outcome: delivered ? "delivered" : "failed", responseBody, error: "", durationMs: Date.now() - started });
      if (delivered || !retryable(response.status) || attempt === maximum) break;
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "Webhook request failed.";
      attempts.push({ attempt, statusCode: null, outcome: "failed", responseBody: "", error, durationMs: Date.now() - started });
      if (attempt === maximum) break;
    }
    await wait(retryDelay(response, attempt));
  }
  return { url, method: variant.method, requestHeaders, requestBody, attempts, delivered: attempts.at(-1)?.outcome === "delivered" };
}
