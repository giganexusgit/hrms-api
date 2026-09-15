import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isBetween from 'dayjs/plugin/isBetween';

// Initialize plugins (required once globally)
dayjs.extend(utc);
dayjs.extend(timezone);

// ✅ Single source of truth for timezone
export const IST = 'Asia/Kolkata';

/**
 * Get current time in IST (dayjs instance)
 */
export const nowIST = () => {
  return dayjs().tz(IST);
};

/**
 * Get today's date in IST (YYYY-MM-DD)
 * Use this for DB "date" column
 */
export const todayIST = () => {
  return nowIST().format('YYYY-MM-DD');
};

/**
 * Format any date into IST string for API response
 */
export const formatIST = (date?: Date | string | null) => {
  if (!date) return null;

  return dayjs(date).tz(IST).format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Convert any date or date-time string to IST Date object (for DB storage)
 */
export const parseISTDate = (
  date?: Date | string | null,
  baseDate?: string,
): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;

  let str = String(date).trim();
  if (!str) return null;

  // If only time is provided (e.g., "12:00" or "12:00:00"), prepend baseDate or today
  const timeOnlyMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnlyMatch) {
    const d = baseDate || todayIST();
    const hh = timeOnlyMatch[1].padStart(2, '0');
    const mm = timeOnlyMatch[2];
    const ss = timeOnlyMatch[3] || '00';
    str = `${d} ${hh}:${mm}:${ss}`;
  }

  // If string contains explicit timezone offset (e.g. Z or +05:30)
  if (/Z|[+-]\d{2}:?\d{2}$/i.test(str)) {
    return dayjs(str).toDate();
  }

  // Otherwise, treat string as IST local time
  const normalizedStr = str.replace('T', ' ');
  return dayjs.tz(normalizedStr, IST).toDate();
};

/**
 * Convert any date to IST Date object (for DB storage)
 */
export const toISTDate = (date?: Date | string) => {
  return date ? parseISTDate(date) || nowIST().toDate() : nowIST().toDate();
};

/**
 * Create a dayjs instance localized to IST
 */
export const dayjsIST = (date?: Date | string | dayjs.Dayjs | null) => {
  if (!date) return dayjs().tz(IST);
  if (typeof date === 'string' && !/Z|[+-]\d{2}:?\d{2}$/i.test(date)) {
    return dayjs.tz(date.replace('T', ' '), IST);
  }
  return dayjs(date).tz(IST);
};

/**
 * (Backward compatibility)
 * If used elsewhere in your codebase
 */
export const getCurrentISTTime = nowIST;

dayjs.extend(isBetween);
