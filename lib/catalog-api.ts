import { CatalogValidationError } from "./catalog-model";

export function catalogErrorResponse(error: unknown) {
  if (error instanceof CatalogValidationError) return Response.json({ error: error.message, code: error.code }, { status: error.code.includes("duplicate") ? 409 : 400 });
  return Response.json({ error: error instanceof Error ? error.message : "Unable to update catalog." }, { status: 500 });
}
