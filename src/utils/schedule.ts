import { PromotionItem, PromotionSchedule } from '../types';

export type ScheduleStatus = 'live' | 'paused' | 'scheduled' | 'expired' | 'off-hours';

export interface ScheduleEvaluation {
  isEligible: boolean;
  status: ScheduleStatus;
  statusLabel: string;
  windowSummary: string;
}

export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toLocalTimeString(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatShortDate(ymd?: string): string {
  if (!ymd) return '';
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ymd;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatShortTime(hhmm?: string): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatScheduleSummary(schedule?: PromotionSchedule): string {
  if (!schedule || schedule.mode !== 'scheduled') {
    return 'Always active';
  }

  const parts: string[] = [];

  if (schedule.startDate && schedule.endDate) {
    parts.push(`${formatShortDate(schedule.startDate)} – ${formatShortDate(schedule.endDate)}`);
  } else if (schedule.startDate) {
    parts.push(`From ${formatShortDate(schedule.startDate)}`);
  } else if (schedule.endDate) {
    parts.push(`Until ${formatShortDate(schedule.endDate)}`);
  }

  if (schedule.startTime && schedule.endTime) {
    parts.push(`${formatShortTime(schedule.startTime)} – ${formatShortTime(schedule.endTime)}`);
  } else if (schedule.startTime) {
    parts.push(`After ${formatShortTime(schedule.startTime)}`);
  } else if (schedule.endTime) {
    parts.push(`Before ${formatShortTime(schedule.endTime)}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Always active';
}

export function evaluatePromotionSchedule(
  promo: PromotionItem,
  now: Date = new Date()
): ScheduleEvaluation {
  const windowSummary = formatScheduleSummary(promo.schedule);

  if (!promo.active) {
    return {
      isEligible: false,
      status: 'paused',
      statusLabel: 'Paused',
      windowSummary,
    };
  }

  const sched = promo.schedule;
  if (!sched || sched.mode !== 'scheduled') {
    return {
      isEligible: true,
      status: 'live',
      statusLabel: 'Live',
      windowSummary,
    };
  }

  const today = toLocalDateString(now);
  if (sched.startDate && today < sched.startDate) {
    return {
      isEligible: false,
      status: 'scheduled',
      statusLabel: `Scheduled · Starts ${formatShortDate(sched.startDate)}`,
      windowSummary,
    };
  }

  if (sched.endDate && today > sched.endDate) {
    return {
      isEligible: false,
      status: 'expired',
      statusLabel: `Ended ${formatShortDate(sched.endDate)}`,
      windowSummary,
    };
  }

  const currentTime = toLocalTimeString(now);
  const hasStart = Boolean(sched.startTime);
  const hasEnd = Boolean(sched.endTime);

  if (hasStart && hasEnd && sched.startTime && sched.endTime) {
    const inWindow =
      sched.startTime <= sched.endTime
        ? currentTime >= sched.startTime && currentTime <= sched.endTime
        : currentTime >= sched.startTime || currentTime <= sched.endTime;

    if (!inWindow) {
      return {
        isEligible: false,
        status: 'off-hours',
        statusLabel: `Off-Hours · ${formatShortTime(sched.startTime)}–${formatShortTime(sched.endTime)}`,
        windowSummary,
      };
    }
  } else if (hasStart && sched.startTime && currentTime < sched.startTime) {
    return {
      isEligible: false,
      status: 'off-hours',
      statusLabel: `Off-Hours · Starts ${formatShortTime(sched.startTime)}`,
      windowSummary,
    };
  } else if (hasEnd && sched.endTime && currentTime > sched.endTime) {
    return {
      isEligible: false,
      status: 'off-hours',
      statusLabel: `Off-Hours · Ended ${formatShortTime(sched.endTime)}`,
      windowSummary,
    };
  }

  return {
    isEligible: true,
    status: 'live',
    statusLabel: 'Live',
    windowSummary,
  };
}

/**
 * Returns a Date inside the given promotion's scheduled window for dashboard previewing.
 */
export function getPreviewTimestampForSchedule(
  schedule?: PromotionSchedule,
  fallback: Date = new Date()
): Date {
  if (!schedule || schedule.mode !== 'scheduled') return fallback;

  let year = fallback.getFullYear();
  let month = fallback.getMonth();
  let day = fallback.getDate();

  const today = toLocalDateString(fallback);
  if (schedule.startDate && today < schedule.startDate) {
    const [y, m, d] = schedule.startDate.split('-').map(Number);
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      year = y;
      month = m - 1;
      day = d;
    }
  } else if (schedule.endDate && today > schedule.endDate) {
    const [y, m, d] = schedule.endDate.split('-').map(Number);
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      year = y;
      month = m - 1;
      day = d;
    }
  }

  let hours = fallback.getHours();
  let minutes = fallback.getMinutes();

  if (schedule.startTime) {
    const [h, m] = schedule.startTime.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      hours = h;
      minutes = m;
    }
  } else if (schedule.endTime) {
    const [h, m] = schedule.endTime.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      hours = h;
      minutes = m;
    }
  }

  return new Date(year, month, day, hours, minutes, 0);
}
