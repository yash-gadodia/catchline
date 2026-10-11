// Copy for the scheduled push set (IMPROVEMENT_PLAN.md 3.2). Pure and
// deterministic — variant rotation keys off the couple-local date, never
// Math.random. Lives inside the function dir so `supabase functions serve`
// and deploy bundling both see it; jest-tested from
// src/features/notifications/scheduledCopy.test.ts.

export function streakSaverTitle(partnerName: string): string {
  return `finish today's drop with ${partnerName} 💛`;
}

export function streakSaverBody(partnerName: string): string {
  return `${partnerName} already played — your turn to light it up 💛`;
}

export function driftTitle(): string {
  return "today's drop is still open 💛";
}

// localDayISO: the couple-local date "YYYY-MM-DD" from _drift_reminder_candidates.
export function driftReminderBody(partnerName: string, localDayISO: string): string {
  const variants = [
    `your daily moment with ${partnerName} is still there ☕`,
    `one small question before the day ends — ${partnerName} might surprise you ✨`,
    `two spare minutes? see what ${partnerName} would say today 🫶`,
  ];
  const day = Number(localDayISO.slice(8, 10));
  const idx = Number.isFinite(day) ? day % variants.length : 0;
  return variants[idx];
}
