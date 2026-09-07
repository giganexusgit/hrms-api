import { dayjsIST } from '../../../utils/time.util';

import { AttendanceStatus } from '../../../common/enums/AttendanceStatus.enum';

export function calculateAttendanceStatus(checkIn: Date): AttendanceStatus {
  const time = dayjsIST(checkIn);

  // 11:00 AM
  const presentEnd = time
    .startOf('day')
    .hour(11)
    .minute(0)
    .second(0)
    .millisecond(0);

  // 12:30 PM
  const lateEnd = time
    .startOf('day')
    .hour(12)
    .minute(30)
    .second(0)
    .millisecond(0);

  // <= 11:00 AM
  if (time.isBefore(presentEnd) || time.isSame(presentEnd)) {
    return AttendanceStatus.PRESENT;
  }

  // 11:01 → 12:30
  if (time.isBefore(lateEnd) || time.isSame(lateEnd)) {
    return AttendanceStatus.LATE;
  }

  // > 12:30
  return AttendanceStatus.HALF_DAY;
}
