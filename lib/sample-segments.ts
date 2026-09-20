export type SampleSegmentRule = {
  field: "lifecycle" | "country" | "subscribed" | "reachable" | "attribute";
  value: string | number;
  attribute?: "language" | "plan";
};

export type SampleSegment = {
  id: string;
  name: string;
  description: string;
  rule: SampleSegmentRule;
};

export const sampleSegments: SampleSegment[] = [
  { id: "seg_new", name: "New Users", description: "Users in the new-user lifecycle stage", rule: { field: "lifecycle", value: "New Users" } },
  { id: "seg_recent", name: "Recent Purchasers", description: "Users who recently completed a purchase", rule: { field: "lifecycle", value: "Recent Purchasers" } },
  { id: "seg_subscribed", name: "Active Subscribers", description: "Users currently subscribed to messaging", rule: { field: "subscribed", value: 1 } },
  { id: "seg_reachable", name: "Reachable Users", description: "Users with at least one reachable messaging channel", rule: { field: "reachable", value: 1 } },
  { id: "seg_pro", name: "Pro Plan Customers", description: "Customers on the Pro plan", rule: { field: "attribute", attribute: "plan", value: "pro" } },
  { id: "seg_free", name: "Free Plan Customers", description: "Customers on the Free plan", rule: { field: "attribute", attribute: "plan", value: "free" } },
  { id: "seg_language_en", name: "English Speakers", description: "Users whose profile language is English", rule: { field: "attribute", attribute: "language", value: "en" } },
  { id: "seg_language_zh", name: "Chinese Speakers", description: "Users whose profile language is Chinese", rule: { field: "attribute", attribute: "language", value: "zh" } },
  { id: "seg_country_us", name: "United States Users", description: "Users located in the United States", rule: { field: "country", value: "US" } },
  { id: "seg_country_gb", name: "United Kingdom Users", description: "Users located in the United Kingdom", rule: { field: "country", value: "GB" } },
  { id: "seg_country_cn", name: "China Users", description: "Users located in China", rule: { field: "country", value: "CN" } },
  { id: "seg_country_sg", name: "Singapore Users", description: "Users located in Singapore", rule: { field: "country", value: "SG" } },
  { id: "seg_country_de", name: "Germany Users", description: "Users located in Germany", rule: { field: "country", value: "DE" } },
];

export function sampleSegmentByName(name: string) {
  return sampleSegments.find(segment => segment.name === name);
}
