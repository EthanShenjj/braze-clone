import "server-only";
export function canEditEmailPreferences() { return process.env.BRAZE_EMAIL_PREFERENCES_READ_ONLY !== "1"; }
