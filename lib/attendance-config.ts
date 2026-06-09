/**
 * Central source of truth for all attendance policy values.
 * Change these when the policy changes — no need to hunt through other files.
 */
export const ATTENDANCE = {
  /** Required internship hours per major */
  baseHours: {
    IT: 350,
    MMA: 200,
    'Net Sec': 350,
    CS: 250,
  } as Record<string, number>,

  /** Morning: on-time at or before this hour:00; 8:01 AM+ is late */
  morningGraceHour: 8,
  /** After-lunch: on-time at or before this hour:00; 13:01 PM+ is late */
  afternoonGraceHour: 13,
  /** Clock-outs during this hour (12:xx) are treated as temporary lunch breaks */
  lunchBreakHour: 12,
  /** Staying until this hour earns full-day credit; leaving before = half-day */
  endOfDayHour: 17,

  /** Each bracket of this many minutes (or fraction) of lateness adds one penalty unit */
  penaltyBracketMinutes: 15,
  /** Hours added to required total per late-arrival penalty bracket */
  penaltyHoursPerBracket: 2,
} as const;
