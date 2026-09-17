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
  const blocks = campaign.config?.emailBlocks;
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
  if (!campaign.body?.trim() && !(campaign.channel === "email" && hasBlocks) && !["feature", "api"].includes(campaign.channel)) {
    issues.push("Add message content before launching.");
  }
  return issues;
}
