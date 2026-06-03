// ─── Philippine public holidays ───────────────────────────────────────────────

// Fixed-date regular + special non-working holidays (MM-DD)
const FIXED_HOLIDAYS = new Set([
  '01-01', // New Year's Day
  '02-25', // EDSA People Power Revolution
  '04-09', // Araw ng Kagitingan
  '05-01', // Labor Day
  '06-12', // Independence Day
  '08-21', // Ninoy Aquino Day
  '11-01', // All Saints Day
  '11-30', // Bonifacio Day
  '12-08', // Feast of the Immaculate Conception
  '12-24', // Christmas Eve
  '12-25', // Christmas Day
  '12-30', // Rizal Day
  '12-31', // New Year's Eve
]);

// Easter Sunday via Anonymous Gregorian algorithm
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Returns YYYY-MM-DD strings for moveable holidays in a given year
function getMoveableHolidays(year: number): Set<string> {
  const easter = easterDate(year);

  const maundyThursday = new Date(easter);
  maundyThursday.setDate(easter.getDate() - 3);

  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  // National Heroes Day = last Monday of August
  const heroesDay = new Date(year, 7, 31);
  while (heroesDay.getDay() !== 1) heroesDay.setDate(heroesDay.getDate() - 1);

  return new Set([
    maundyThursday.toISOString().split('T')[0],
    goodFriday.toISOString().split('T')[0],
    heroesDay.toISOString().split('T')[0],
  ]);
}

// Cache moveable holidays per year to avoid recomputing in tight loops
const moveableCache = new Map<number, Set<string>>();

export function isPhHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (FIXED_HOLIDAYS.has(mmdd)) return true;

  if (!moveableCache.has(year)) moveableCache.set(year, getMoveableHolidays(year));
  const yyyymmdd = date.toISOString().split('T')[0];
  return moveableCache.get(year)!.has(yyyymmdd);
}

// ─── End-date calculator ──────────────────────────────────────────────────────

/**
 * Counts Mon–Sat working days (skipping Sundays and Philippine holidays)
 * from startDateStr until totalDays are accumulated, then returns that date.
 */
export function calcEndDate(startDateStr: string, hours: number, closedDates: string[] = []): string {
  if (!startDateStr || !hours) return '';
  const totalDays = Math.ceil(hours / 8);
  const closedSet = new Set(closedDates);
  const date = new Date(startDateStr + 'T00:00:00');
  let counted = 0;
  while (true) {
    const dateStr = date.toISOString().split('T')[0];
    if (date.getDay() !== 0 && !isPhHoliday(date) && !closedSet.has(dateStr)) {
      counted++;
      if (counted >= totalDays) break;
    }
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().split('T')[0];
}
