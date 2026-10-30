/** Campaign-level editing capabilities, separate from permission to administer workspace defaults. */
export type EmailSendingCapabilities = { from: boolean; ipPool: boolean; replyTo: boolean; bcc: boolean; customReplyTo: boolean };
export function emailSendingCapabilities(config: Record<string, unknown> | undefined, requireListedAddresses = false): EmailSendingCapabilities {
  const full = config?.access === "full";
  const value = config?.emailSendingCapabilities;
  const overrides = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowed = (key: keyof EmailSendingCapabilities, fallback: boolean) => typeof overrides[key] === "boolean" ? overrides[key] as boolean : fallback;
  const replyTo = allowed("replyTo", true);
  return { from: allowed("from", full), ipPool: allowed("ipPool", full), replyTo, bcc: allowed("bcc", true), customReplyTo: replyTo && !requireListedAddresses && allowed("customReplyTo", full) };
}
