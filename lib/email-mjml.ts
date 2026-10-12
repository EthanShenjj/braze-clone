const XML_VOID_TAGS = "area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr";
const XML_VOID_TAG_PATTERN = new RegExp(`<(${XML_VOID_TAGS})(\\b[^>]*?)(?:\\s*\\/)?>`, "gi");

/**
 * GrapesJS renders rich text as HTML, where void elements such as <br> do not
 * need a closing slash. MJML is parsed as XML in the email editor, so the same
 * markup must be serialized as <br /> before it reaches the MJML parser.
 */
export function normalizeXmlVoidTags(source: string) {
  return source.replace(XML_VOID_TAG_PATTERN, (_match, tag: string, attributes: string) =>
    `<${tag}${attributes.trimEnd()} />`,
  );
}

export function hasHtmlStyleVoidTags(source: string) {
  return normalizeXmlVoidTags(source) !== source;
}

export function normalizeMjmlDocument(source: string) {
  const normalized = normalizeXmlVoidTags(source).replace(
    /<mj-all([^>]*)><mj-text([^>]*)><mj-class([^>]*)><\/mj-class><\/mj-text><\/mj-all>/g,
    "<mj-all$1 /><mj-text$2 /><mj-class$3 />",
  );
  const documentEnd = normalized.lastIndexOf("</mjml>");
  if (documentEnd < 0 || !normalized.slice(documentEnd + 7).trim()) return normalized;
  const document = normalized.slice(0, documentEnd + 7);
  const trailing = normalized.slice(documentEnd + 7).trim();
  const bodyEnd = document.lastIndexOf("</mj-body>");
  return bodyEnd < 0 ? normalized : `${document.slice(0, bodyEnd)}${trailing}${document.slice(bodyEnd)}`;
}
