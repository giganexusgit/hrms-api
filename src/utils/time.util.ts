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
 * Convert any date to IST Date object (for DB storage)
 */
export const toISTDate = (date?: Date | string) => {
  return date ? dayjs(date).tz(IST).toDate() : nowIST().toDate();
};

/**
 * Create a dayjs instance localized to IST
 */
export const dayjsIST = (date?: Date | string | dayjs.Dayjs | null) => {
  if (!date) return dayjs().tz(IST);
  return dayjs(date).tz(IST);
};

/**
 * (Backward compatibility)
 * If used elsewhere in your codebase
 */
export const getCurrentISTTime = nowIST;

dayjs.extend(isBetween);
