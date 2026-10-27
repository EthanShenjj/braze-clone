import { notFound } from "next/navigation";
import sanitizeHtml from "sanitize-html";
import { getPublishedPage } from "@/lib/workspace-service";
import LandingPageForm from "../../ui/landing-page-form";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function PublishedLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const page = getPublishedPage(slug); if (!page) notFound();
  const html = sanitizeHtml(String(page.data.html ?? ""), { allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "h1", "h2"], allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, "*": ["style"], img: ["src", "alt", "width", "height"] }, allowedSchemes: ["http", "https", "mailto"], allowedStyles: { "*": { color: [/^#[a-f0-9]{3,8}$/i, /^[a-z]+$/i], "background-color": [/^#[a-f0-9]{3,8}$/i], "text-align": [/^(left|right|center)$/], "font-size": [/^\d+(?:px|em|rem|%)$/], "max-width": [/^\d+(?:px|%)$/] } } });
  return <main style={{ maxWidth: 760, margin: "60px auto", padding: "32px 24px", background: "white", borderRadius: 8 }}><div dangerouslySetInnerHTML={{ __html: html }}/><LandingPageForm slug={slug} collectEmail={Boolean(page.data.collectEmail)} buttonLabel={String(page.data.buttonLabel ?? "Submit")} questions={(page.survey?.data.questions ?? []) as Array<{ id: string; label: string; type: string; required: boolean; options?: string[] }>}/></main>;
}
