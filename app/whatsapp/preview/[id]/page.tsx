import { notFound } from "next/navigation";
import { getResource } from "@/lib/braze-store";
import type { prepareWhatsAppMessage } from "@/lib/whatsapp-model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function WhatsAppPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getResource(id);
  if (record?.type !== "whatsapp-preview-share" || Number(record.data.expiresAt) < Date.now() || !record.data.payload) notFound();
  const payload = record.data.payload as ReturnType<typeof prepareWhatsAppMessage>;
  return <main style={{ maxWidth: 440, margin: "48px auto", padding: 24, fontFamily: "Aribau,Arial,sans-serif" }}><h1 style={{ fontSize: 20 }}>WhatsApp Preview</h1><div style={{ minHeight: 500, background: "#e4ded7", padding: 24 }}><article style={{ background: "#fff", borderRadius: "0 13px 13px", padding: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{payload.mediaUrl && (payload.mediaType === "video" ? <video controls src={payload.mediaUrl} style={{maxWidth:"100%"}}/> : payload.mediaType === "audio" ? <audio controls src={payload.mediaUrl} style={{maxWidth:"100%"}}/> : payload.mediaType === "document" ? <a href={payload.mediaUrl}>View document</a> : <img alt="Message media" src={payload.mediaUrl} style={{maxWidth:"100%",borderRadius:8}}/>)}{payload.headerText && <b>{payload.headerText}</b>}<p>{payload.message}</p>{payload.footer && <small>{payload.footer}</small>}{payload.buttons.map((button, index) => <div key={index} style={{ padding: 10, borderTop: "1px solid #dedee0", textAlign: "center", color: "#57a3cb" }}>{button.label}</div>)}{payload.listOptions.map((row, index) => <p key={index}>{row}</p>)}{payload.carouselCards?.map((card, index) => <div key={index} style={{ padding: 12, borderTop: "1px solid #dedee0" }}><b>Card {index + 1}</b><p>{card.body}</p>{card.buttons.map((button, i) => <div key={i}>{button.label}</div>)}</div>)}</article></div><p style={{ fontSize: 12 }}>Actual rendering may not be identical to this preview depending on the user&apos;s device. This snapshot expires in 7 days.</p></main>;
}
