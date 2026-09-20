import { cookies } from "next/headers";
import type { RecommendationRecord } from "./braze-store";

const cookiePrefix = "braze_recommendation_";
const maxAge = 60 * 60 * 24 * 30;

function cookieName(id: string) {
  return `${cookiePrefix}${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export async function readRecommendationCookie(id: string) {
  const value = (await cookies()).get(cookieName(id))?.value;
  if (!value) return null;
  try {
    const recommendation = JSON.parse(decodeURIComponent(value)) as RecommendationRecord;
    return recommendation.id === id && recommendation.type === "recommendations" ? recommendation : null;
  } catch {
    return null;
  }
}

export async function writeRecommendationCookie(recommendation: RecommendationRecord) {
  (await cookies()).set(cookieName(recommendation.id), encodeURIComponent(JSON.stringify(recommendation)), {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
