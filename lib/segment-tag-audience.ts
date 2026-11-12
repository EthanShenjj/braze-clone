import type { AudienceRule, MessageDraft } from "./campaign-shared.ts";

export type SegmentAudienceFilter = Omit<AudienceRule,"id">;
export function hasTaggedReceiptFilters(filters:SegmentAudienceFilter[]):boolean {
  return filters.some(filter=>filter.field.startsWith("receipt_tag_count:")||filter.field.startsWith("receipt_tag_last:"));
}

/** Inline Segment previews use the same rule SQL as the saved Segment in Campaign targeting. */
export function segmentAudienceSnapshot(filters:SegmentAudienceFilter[],workspaceId="local"):MessageDraft {
  return {channel:"push",audience:"All Users",config:{workspaceId,audienceGroups:[{id:"segment-preview",operator:"AND",exclude:false,rules:filters.map((filter,index)=>({...filter,id:`segment-rule-${index}`}))}]}};
}
