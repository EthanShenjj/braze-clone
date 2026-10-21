import { createResource, listResources } from "@/lib/braze-store";

export const runtime = "nodejs";
const limit = 5 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "video/mp4", "video/3gpp", "audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg", "application/pdf"]);

export function GET() {
  return Response.json({ data: listResources("whatsapp-media").map(item => ({ id: item.id, name: item.name, mimeType: item.data.mimeType, url: `/api/whatsapp/media/${item.id}` })) });
}

export async function POST(request: Request) {
  if (!request.body) return Response.json({ error: "Choose a media file." }, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > limit + 65536) { await reader.cancel(); return Response.json({ error: "Local media files must be no larger than 5MB." }, { status: 413 }); }
    chunks.push(chunk.value);
  }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData(); }
  catch { return Response.json({ error: "Choose a valid media file." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > limit || !types.has(file.type)) return Response.json({ error: "Choose a supported JPG, PNG, MP4, audio, or PDF file up to 5MB." }, { status: 400 });
  const record = createResource({ type: "whatsapp-media", name: file.name.slice(0, 200), data: { mimeType: file.type, size: file.size, base64: Buffer.from(await file.arrayBuffer()).toString("base64") } });
  return Response.json({ id: record.id, url: `/api/whatsapp/media/${record.id}`, name: record.name, mimeType: file.type }, { status: 201 });
}
