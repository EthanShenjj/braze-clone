import { notFound } from "next/navigation";
import { getResource } from "@/lib/braze-store";
import { smsMetrics } from "@/lib/sms-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SmsPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getResource(id);
  if (!record || record.type !== "sms-preview-share" || Number(record.data.expiresAt) < Date.now() || typeof record.data.message !== "string") notFound();
  const message = record.data.message;
  const metrics = smsMetrics(message);
  return <main style={{ maxWidth: 440, margin: "48px auto", padding: 24, fontFamily: "Aribau,Arial,sans-serif" }}><h1 style={{ fontSize: 20 }}>SMS Preview</h1><div style={{ minHeight: 344, padding: 20, border: "2px solid #c4c4c7", background: "#fff" }}><div style={{ padding: 16, borderRadius: "17px 17px 17px 3px", background: "#d9d9dd", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 16 }}>{message}</div></div><p>{metrics.characters} | {metrics.segments} Billable Segment{metrics.segments === 1 ? "" : "s"}</p><small>Actual rendering may not be identical to this preview depending on the user&apos;s environment.</small></main>;
}
