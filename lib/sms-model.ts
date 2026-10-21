import { renderBrazeLiquid } from "./email-liquid.ts";

// GSM 03.38 extension characters consume two septets, including the escape.
const gsmBasic = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const gsmExtended = new Set(Array.from("\f^{}\\[~]|€"));

export function smsMetrics(message: string) {
  const gsm = Array.from(message).every(char => gsmBasic.has(char) || gsmExtended.has(char));
  const units = gsm ? Array.from(message).reduce((total, char) => total + (gsmExtended.has(char) ? 2 : 1), 0) : message.length;
  const single = gsm ? 160 : 70;
  const multipart = gsm ? 153 : 67;
  // Do not split a GSM escape sequence or a UTF-16 surrogate pair across segments.
  let segments = units ? 1 : 0;
  if (units > single) {
    segments = 1;
    let used = 0;
    for (const char of message) {
      const size = gsm ? (gsmExtended.has(char) ? 2 : 1) : char.length;
      if (used + size > multipart) { segments++; used = 0; }
      used += size;
    }
  }
  return { characters: message.length, units, encoding: gsm ? "GSM-7" : "UCS-2", segments };
}

export function smsPreview(message: string, profile: Record<string, unknown> = {}, shorten = true) {
  const rendered = renderBrazeLiquid(message, profile);
  return shorten ? rendered.replace(/https?:\/\/[^\s<>"']+/g, (url) => `https://brz.ai/XXXXXXXX${url.match(/[.,!?;:)\]]+$/)?.[0] ?? ""}`) : rendered;
}

export const smsLanguages = [
  ["ar", "Arabic"], ["zh", "Chinese"], ["en", "English"], ["fr", "French"], ["de", "German"],
  ["he", "Hebrew"], ["id", "Indonesian"], ["it", "Italian"], ["ja", "Japanese"], ["ko", "Korean"],
  ["ms", "Malay"], ["es", "Spanish"], ["tl", "Tagalog"], ["th", "Thai"], ["vi", "Vietnamese"],
] as const;

export function smsLanguageSnippet(languages: string[]) {
  return languages.map((code, index) => `{% ${index ? "elsif" : "if"} \${language} == '${code}' %}\n\n`).join("") + "{% else %}\n\n{% endif %}";
}

export function smsIssues(message: string, groupId: string) {
  return [!groupId && "Select an SMS subscription group.", !message.trim() && "Add message content.", message.length > 20000 && "Message must be 20,000 characters or fewer."].filter(Boolean) as string[];
}
