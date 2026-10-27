export type GlobalControlSettings = {
  enabled: boolean;
  percentage: number | null;
  exclusionTags: string[];
  seed: string | null;
  enabledAt: string | null;
};
export type GlobalControlCounts = { total: number; control: number; treatment: number; sample: number };
export type GlobalControlSnapshot = {
  settings: Omit<GlobalControlSettings, "seed">;
  counts: GlobalControlCounts;
  availableTags: string[];
  updatedAt: string | null;
};
export type GlobalControlCommand =
  | { action: "enable"; percentage: number }
  | { action: "disable" }
  | { action: "update-exclusions"; exclusionTags: string[] };

export function normalizeGlobalControl(value: Record<string, unknown> = {}, legacySeed?: string): GlobalControlSettings {
  const percentage = Number(value.percentage);
  const valid = Number.isInteger(percentage) && percentage >= 1 && percentage <= 15;
  return {
    enabled: value.enabled === true && valid,
    percentage: valid ? percentage : null,
    exclusionTags: Array.isArray(value.exclusionTags) ? [...new Set(value.exclusionTags.filter((tag): tag is string => typeof tag === "string").map(tag => tag.trim()).filter(Boolean))] : [],
    seed: typeof value.seed === "string" ? value.seed : legacySeed ?? null,
    enabledAt: typeof value.enabledAt === "string" ? value.enabledAt : null,
  };
}

// One workspace bucket is shared by every engagement. The adjacent, disjoint
// interval forms a similarly sized treatment sample for reporting.
export function globalControlCohort(settings: GlobalControlSettings, bucket: number) {
  if (!settings.enabled || !settings.seed || settings.percentage === null) return "treatment";
  if (bucket < settings.percentage / 100) return "control";
  return bucket < settings.percentage / 50 ? "sample" : "treatment";
}

export function hasGlobalControlExemption(settings: GlobalControlSettings, tags: unknown, channel?: string) {
  if (channel === "feature") return false;
  return channel === "api" || Array.isArray(tags) && tags.some(tag => typeof tag === "string" && settings.exclusionTags.includes(tag));
}

export function validateGlobalControlCommand(value: unknown): asserts value is GlobalControlCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Global Control Group request.");
  const command = value as Record<string, unknown>;
  if (command.action === "enable") {
    if (typeof command.percentage !== "number" || !Number.isInteger(command.percentage) || command.percentage < 1 || command.percentage > 15) throw new Error("Enter a whole number between 1 and 15.");
  } else if (command.action === "update-exclusions") {
    if (!Array.isArray(command.exclusionTags) || command.exclusionTags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 255)) throw new Error("Select valid exclusion tags.");
  } else if (command.action !== "disable") throw new Error("Unknown Global Control Group action.");
}
