import { Timestamp } from 'firebase/firestore';

// ─── Intern ──────────────────────────────────────────────────────────────────

export type InternStatus = 'active' | 'inactive' | 'done';

export interface Intern {
  id: string;
  name: string;
  email: string;
  studentId: string;
  course: string;
  major: string;
  year: number;
  school: string;
  supervisor: string;
  nfcUid: string;             // NFC card UID — must be unique
  requiredHours: number;
  completedHours: number;
  remainingHours: number;
  status: InternStatus;
  isClockedIn: boolean;
  lastClockIn: Timestamp | null;
  photoUrl: string | null;
  startDate: Timestamp;
  endDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type InternCreate = Omit<Intern, 'id' | 'createdAt' | 'updatedAt'>;
export type InternUpdate = Partial<Omit<Intern, 'id' | 'createdAt'>>;

// ─── Time Record ─────────────────────────────────────────────────────────────

export interface TimeRecord {
  id: string;
  internId: string;
  internName: string;
  major: string;
  date: string;               // YYYY-MM-DD
  timeIn: Timestamp;
  timeOut: Timestamp | null;
  hoursRendered: number | null; // computed on clock-out
  isLate: boolean;
  minutesLate: number;
  penaltyHours: number;       // late-arrival penalty
  isEarlyOut: boolean;
  minutesEarlyOut: number;
  earlyOutPenaltyHours: number;
  notes: string;
  createdAt: Timestamp;
}

export type TimeRecordCreate = Omit<TimeRecord, 'id' | 'createdAt'>;

// ─── Guest ───────────────────────────────────────────────────────────────────

export type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';

export interface Guest {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  address: string;
  contactNumber: string;
  email: string;
  organization: string;
  department?: string;
  purpose: string;
  eventId: string | null;
  eventName: string;
  checkInTime: Timestamp;
  checkOutTime: Timestamp | null;
  hoursVisited: number | null;  // computed on check-out
  handledBy: string;            // staff/intern name who assisted
  createdAt: Timestamp;
}

export type GuestCreate = Omit<Guest, 'id' | 'createdAt'>;
export type GuestUpdate = Partial<Omit<Guest, 'id' | 'createdAt'>>;

// ─── Event ───────────────────────────────────────────────────────────────────

export type EventStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export interface Event {
  id: string;
  name: string;
  description: string;
  location: string;
  date: string;               // YYYY-MM-DD
  startTime: Timestamp;
  endTime: Timestamp | null;
  organizer: string;
  expectedGuests: number;
  actualGuestCount: number;
  status: EventStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type EventCreate = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
export type EventUpdate = Partial<Omit<Event, 'id' | 'createdAt'>>;

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface InternAnalyticsSummary {
  internId: string;
  internName: string;
  major: string;
  totalDaysPresent: number;
  totalDaysLate: number;
  completedHours: number;
  remainingHours: number;
  attendanceRate: number;     // percentage
  averageDailyHours: number;
  status: InternStatus;
}

export interface GuestAnalyticsSummary {
  totalGuests: number;
  uniqueOrganizations: number;
  averageVisitDuration: number; // hours
  genderBreakdown: Record<Gender, number>;
  ageGroupBreakdown: Record<string, number>; // e.g. "18-25": 10
  topPurposes: { purpose: string; count: number }[];
  guestsByEvent: { eventName: string; count: number }[];
  monthlyTrend: { month: string; count: number }[];
}
