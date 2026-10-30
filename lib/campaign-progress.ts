import { campaignValidationIssues, campaignComposeIssues, campaignAudienceIssues } from './campaign-validation.ts';
import { deliveryScheduleIssues } from './campaign-scheduling.ts';
import { allocationIssues, type MessageDraft } from './campaign-shared.ts';
import { conversionConfigurationIssues } from './campaign-form-model.ts';
import { scheduleValidationIssues } from './in-app-schedule.ts';

export function campaignStepIssues(draft:MessageDraft & {name:string;conversion?:string}) {
  const compose=campaignComposeIssues(draft);
  const delivery=(draft.config?.delivery??{}) as Record<string,unknown>;
  const schedule=[...(["feature","api"].includes(draft.channel)?[]:deliveryScheduleIssues(draft)),...(draft.channel==='iam'&&delivery.schemaVersion===2?scheduleValidationIssues(delivery):[])];
  const audience=[...campaignAudienceIssues(draft),...allocationIssues(draft)];
  const conversions=conversionConfigurationIssues(draft);
  return [compose,schedule,audience,conversions,campaignValidationIssues(draft)];
}
