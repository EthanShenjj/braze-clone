"use client";
import { useEffect } from "react";
import { registerUnsavedNavigation } from "@/lib/unsaved-navigation";
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const release = registerUnsavedNavigation(action => { if (window.confirm("Discard your unsaved changes?")) action(); });
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("beforeunload", unload); release(); };
  }, [dirty]);
}
