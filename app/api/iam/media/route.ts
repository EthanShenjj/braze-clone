import { createResource, listResources } from "@/lib/braze-store";
export const runtime = "nodejs";
export async function GET() {
  return Response.json({ data: listResources("iam-media").map(item => ({ id: item.id, name: item.name, url: `/api/iam/media/${item.id}`, mimeType: item.data.mimeType, size: item.data.size })) });
}
export async function POST(request: Request) {
  if (!request.body) return Response.json({ error: "Choose an image." }, { status: 400 });
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > 5 * 1024 * 1024 + 65536) { await reader.cancel(); return Response.json({ error: "Images must be no larger than 5 MB." }, { status: 413 }); } chunks.push(result.value); }
  try {
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
    const file = form.get("file"); if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new Error("Choose an image no larger than 5 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : /^GIF8[79]a/.test(bytes.subarray(0,6).toString()) ? "image/gif" : "";
    if (!mime) throw new Error("Upload a PNG, JPEG, or GIF image.");
    const row = createResource({ type: "iam-media", name: file.name.slice(0,200), data: { mimeType: mime, size: bytes.length, base64: bytes.toString("base64") } });
    return Response.json({ id: row.id, name: row.name, url: `/api/iam/media/${row.id}`, mimeType: mime, size: bytes.length }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid image." }, { status: 400 }); }
}
