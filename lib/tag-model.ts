export const engagementTagLimit = 175;
export type WorkspaceTag = { id: string; name: string; parentId: string | null; path: string; updatedAt: string; usages: TagUsage[] };
export type TagUsage = { id: string; type: string; name: string; status: string };

export function tagNames(value: unknown, limited = false): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(name => typeof name !== "string" || !name.trim())) throw new Error("Tags must be an array of non-empty names.");
  const names = [...new Set(value.map(name => (name as string).trim()))];
  if (limited && names.length > engagementTagLimit) throw new Error(`A Campaign, Canvas or Segment can have at most ${engagementTagLimit} tags.`);
  return names;
}

// Braze's Campaign Tag As action shares the union across every selected Campaign.
export function campaignBulkTags(current: unknown[], additions: unknown): string[] {
  return tagNames([...current.flatMap(value => tagNames(value)), ...tagNames(additions)], true);
}

export function resolveTagAliases(names: string[], aliases: Record<string, string | null>): string[] {
  return [...new Set(names.map(name => {
    if (!Object.hasOwn(aliases, name)) return name;
    if (aliases[name] === null) throw new Error(`Tag "${name}" was deleted. Remove it before saving.`);
    return aliases[name];
  }))];
}

export function tagParentIsValid(id: string, parentId: string | null, tags: Pick<WorkspaceTag, "id" | "parentId">[]): boolean {
  const seen = new Set([id]);
  let cursor = parentId;
  while (cursor) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const parent = tags.find(tag => tag.id === cursor);
    if (!parent) return false;
    cursor = parent.parentId;
  }
  return true;
}
