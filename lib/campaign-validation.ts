import { variantsFor as inAppVariants, validateInAppVariant } from "./in-app-model";
import { normalizeWebhookVariants, validateWebhookVariant } from "./webhook-model";
import { validateWhatsAppCampaign } from "./whatsapp-model";
import { validateLineCampaign } from "./line-model";
import { scheduleValidationIssues } from "./in-app-schedule";

export type CampaignForValidation = {
  name: string;
  channel: string;
  subject?: string;
  body?: string;
  config?: Record<string, unknown>;
};

export function campaignValidationIssues(campaign: CampaignForValidation): string[] {
  const issues: string[] = [];
  if (!campaign.name.trim()) issues.push("Enter a campaign name.");
  if (campaign.channel === "feature") {
    if (!campaign.subject?.trim()) issues.push("Select a Feature Flag.");
    const rollout = Number((campaign.config?.channelValues as Record<string, unknown> | undefined)?.rollout ?? 50);
    if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) issues.push("Feature rollout must be between 0 and 100.");
    try { const properties = JSON.parse(campaign.body || "{}"); if (!properties || typeof properties !== "object" || Array.isArray(properties)) issues.push("Feature properties must be a JSON object."); } catch { issues.push("Feature properties must be valid JSON."); }
  }
  if (["multichannel", "operator"].includes(campaign.channel)) {
    const values = (campaign.config?.channelValues ?? {}) as Record<string, unknown>;
    const channels = Array.isArray(values.channels) ? values.channels as string[] : [];
    const content = (values.channelContent ?? {}) as Record<string, string>; const linked = (values.childCampaignIds ?? {}) as Record<string, string>;
    if (!channels.length) issues.push("Select at least one delivery channel.");
    if (new Set(channels).size !== channels.length) issues.push("Choose each delivery channel only once.");
    for (const channel of channels) if (!content[channel]?.trim() && !linked[channel]) issues.push(`Add content or select a saved Campaign for ${channel}.`);
    if (values.rule && values.rule !== "Send all channels at once") issues.push("Delayed engagement-based fallback requires a scheduled Canvas journey.");
    return issues;
  }
  if (campaign.channel === "email" && !campaign.subject?.trim()) issues.push("Add an email subject line in Sending info.");
  const rows = campaign.config?.emailRows;
  const hasRows = Array.isArray(rows) && rows.some((row: { cells?: { blocks?: unknown[] }[] }) => Array.isArray(row?.cells) && row.cells.some(cell => Array.isArray(cell?.blocks) && cell.blocks.length > 0));
  const blocks = campaign.config?.emailBlocks;
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
  if (campaign.channel === "line") {
    issues.push(...validateLineCampaign(campaign));
  } else if (campaign.channel === "iam") {
    try { issues.push(...inAppVariants(campaign).flatMap(validateInAppVariant)); } catch { issues.push("Invalid in-app message configuration."); }
    const delivery = campaign.config?.delivery as Record<string, unknown> | undefined;
    if (delivery?.schemaVersion === 2) issues.push(...scheduleValidationIssues(delivery));
  } else if (campaign.channel === "whatsapp") {
    issues.push(...validateWhatsAppCampaign(campaign));
  } else if (campaign.channel === "webhook") {
    issues.push(...normalizeWebhookVariants(campaign).flatMap(variant => validateWebhookVariant(variant)));
  } else if (!campaign.body?.trim() && !(campaign.channel === "email" && (hasRows || hasBlocks)) && !["feature", "api"].includes(campaign.channel)) {
    issues.push("Add message content before launching.");
  }
  return [...new Set(issues)];
}
