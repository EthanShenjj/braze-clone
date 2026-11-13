"use client";
const guards: Array<{guard:(action: () => void) => void}> = [];
export function requestAppNavigation(action: () => void) { const current=guards.at(-1); if (current) current.guard(action); else action(); }
export function registerUnsavedNavigation(guard: (action: () => void) => void) {
  const registration={guard};
  guards.push(registration);
  return () => { const index=guards.indexOf(registration); if(index!==-1)guards.splice(index,1); };
}
