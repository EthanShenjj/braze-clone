# CMP-075 binary campaign brief extraction

The Operator route now resolves stored PDF and DOCX briefs into real local text, alongside TXT, Markdown and CSV. The original resource, download URL and metadata are preserved. Extraction itself makes no AI calls or external requests. The existing configured Operator endpoint receives extracted text only through its normal generation flow.

The implementation follows the primary [unpdf 1.4 documentation](https://github.com/unjs/unpdf/tree/v1.4.0) and [Mammoth raw-text API](https://github.com/mwilliamson/mammoth.js#basic-conversion). Exact parser versions are locked to `unpdf@1.4.0` and `mammoth@1.13.0`. unpdf 1.4 bundles PDF.js 5.4 and works with the repository's Node 22 runtime; newer mainline documentation requires Node 24. Dependencies were installed with scripts disabled. The repository AGENTS instructions and bundled Next.js route-handler guide were read before editing.

## Processing bounds

- Actual input bytes: at most 15 MiB; the route also bounds the stored Base64 before decoding.
- Returned prompt text: at most 100,000 characters, with an explicit truncation notice.
- PDF: at most 100 pages and 2,000 streams. Flate, ASCII85 and ASCIIHex stream expansion is checked before parsing: 8 MiB per stream/stage and 32 MiB in aggregate. Indirect/ambiguous filters and unsupported compression formats are rejected with a notice. Image filters are not rendered or OCRed. PDF.js evaluates no JavaScript and receives no remote font/CMap URLs.
- DOCX: at most 2,000 ZIP entries, 8 MiB per entry, 32 MiB aggregate expanded content, and bounded expansion ratio. Actual inflation uses a maximum output length. Directory/local headers, entry names, sizes, non-overlap and CRC32 are validated; encryption, ZIP64, traversal, duplicate entries and XML entity declarations are rejected.
- Binary parsing runs in a worker with a 128 MiB V8 old-generation limit, 16 MiB young-generation limit and 4 MiB stack. A 10-second deadline terminates the worker rather than merely abandoning a still-running parser. V8 heap settings do not claim an OS-wide resident-memory quota.

Malformed, encrypted, unsupported, image-only or over-limit documents return a visible notice and no invented text. PDF pages without extractable text produce an OCR limitation notice. TXT/MD/CSV support UTF-8 and BOM-marked UTF-16. Extraction does not change or detach the source bytes.

## Integration

`extractCampaignBriefText(name, bytes)` returns `Promise<{text?:string,notice?:string}>`. The bounded route `resolveBrief` is now async and returns `{brief,...extraction}`; the root-owned shared Operator dependency now awaits it and returns 422 on resolver failures. Worker modules resolve from the deployed project package. After reading bundled Next.js `serverExternalPackages` and `output` guides, `next.config.ts` now externalizes the two native parser packages and includes only their exact locked runtime dependency closure in the `/api/campaign-operator` file trace. A relocation test copies precisely those traced package directories into an isolated temporary deployment and successfully extracts both PDF and DOCX text without access to the original project node_modules. No broad node_modules trace was added. This worker did not edit the shared Operator model.

Files: `lib/campaign-brief-text.ts`, bounded import/resolveBrief in `app/api/campaign-operator/route.ts`, `package.json`, `package-lock.json`, `next.config.ts`, `tests/campaign-brief-text.test.mjs`, and repository-authored fixtures in `tests/fixtures/campaign-briefs/`.

## Validation

Node 22 command: `node --experimental-transform-types --test tests/campaign-brief-text.test.mjs` — **10/10 passed**. Tests use actual compressed PDF text, actual OOXML DOCX with Japanese text, a password-protected PDF, a no-text PDF, a real 101-page PDF, actual compressed expansion bombs, corrupt ZIP CRC, entity/traversal cases, and text/PDF truncation. No real AI provider was contacted. Combined extractor and Operator endpoint tests passed **24/24**, including async real-DOCX prompt integration and the isolated traced-deployment smoke test. `tsc --noEmit --incremental false --pretty false` passed after the root-owned async dependency update. No full build or server was run by this worker.
