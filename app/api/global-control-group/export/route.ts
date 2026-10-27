import { exportGlobalControlMembers } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET() {
  try {
    const ids = exportGlobalControlMembers();
    const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    return new Response(["external_user_id", ...ids.map(cell)].join("\r\n") + "\r\n", { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="global-control-group.csv"',
      "Cache-Control": "no-store",
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed." }, { status: 409 });
  }
}
