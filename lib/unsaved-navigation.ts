"use client";
let pendingGuard: ((action: () => void) => void) | null = null;
export function requestAppNavigation(action: () => void) { if (pendingGuard) pendingGuard(action); else action(); }
export function registerUnsavedNavigation(guard: (action: () => void) => void) { pendingGuard = guard; return () => { if (pendingGuard === guard) pendingGuard = null; }; }
