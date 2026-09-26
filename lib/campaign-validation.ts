import { normalizeWebhookVariants, validateWebhookVariant } from "./webhook-model";
import { validateWhatsAppCampaign } from "./whatsapp-model";

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
  if (campaign.channel === "email" && !campaign.subject?.trim()) issues.push("Add an email subject line in Sending info.");
  const rows = campaign.config?.emailRows;
  const hasRows = Array.isArray(rows) && rows.some((row: { cells?: { blocks?: unknown[] }[] }) => Array.isArray(row?.cells) && row.cells.some(cell => Array.isArray(cell?.blocks) && cell.blocks.length > 0));
  const blocks = campaign.config?.emailBlocks;
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
  if (campaign.channel === "whatsapp") {
    issues.push(...validateWhatsAppCampaign(campaign));
  } else if (campaign.channel === "webhook") {
    issues.push(...normalizeWebhookVariants(campaign).flatMap(variant => validateWebhookVariant(variant)));
  } else if (!campaign.body?.trim() && !(campaign.channel === "email" && (hasRows || hasBlocks)) && !["feature", "api"].includes(campaign.channel)) {
    issues.push("Add message content before launching.");
  }
  return [...new Set(issues)];
}
