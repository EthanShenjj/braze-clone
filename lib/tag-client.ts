export async function resolveBrowserTags(tags: string[]): Promise<string[]> {
  const response = await fetch("/api/tags/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to validate tags.");
  return result.tags;
}
