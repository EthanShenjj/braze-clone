"use client";

import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import CatalogStudio, { RecommendationStudio } from "./catalog-studio";
import "./catalog-workspace.css";

export default function CatalogWorkspace({ locale, notify }: { locale: Locale; notify: (message: string) => void }) {
  const pathname = usePathname();
  const recommendation = pathname.match(/^\/engagement\/predictions\/([^/]+)\/([^/]+)$/);
  if (recommendation) return <RecommendationStudio locale={locale} id={recommendation[1]} notify={notify}/>;
  return <CatalogStudio locale={locale} notify={notify}/>;
}
