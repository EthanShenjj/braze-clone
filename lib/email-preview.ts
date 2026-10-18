import sanitizeHtml from "sanitize-html";
export function safeEmailPreview(html: string) {
  const clean = sanitizeHtml(html, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "style", "html", "head", "body", "meta", "title"]), allowedAttributes: { "*": ["style", "class", "dir", "align", "width", "height", "bgcolor"], a: ["href", "title", "target"], img: ["src", "alt", "width", "height"], meta: ["name", "content"], style: ["type"] }, allowedSchemes: ["https", "http", "mailto", "data"], allowedSchemesByTag: { img: ["https", "data"] }, allowVulnerableTags: true });
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; base-uri 'none'; form-action 'none'; frame-src 'none'"><style>body{font-family:Arial,sans-serif;margin:0;padding:20px}img{max-width:100%}</style>${clean}`;
}
