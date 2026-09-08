import { RoleEnum } from '../enums/role.enum';
import { PermissionEnum } from '../enums/permission.enum';

export const RBAC_CONFIG = {
  [RoleEnum.SUPER_ADMIN]: [...Object.values(PermissionEnum)],

  [RoleEnum.HR]: [
    PermissionEnum.EMPLOYEE_CREATE,
    PermissionEnum.EMPLOYEE_READ,
    PermissionEnum.EMPLOYEE_UPDATE,

    PermissionEnum.DEPARTMENT_CREATE,
    PermissionEnum.DEPARTMENT_READ,
    PermissionEnum.DEPARTMENT_UPDATE,

    PermissionEnum.DESIGNATION_CREATE,
    PermissionEnum.DESIGNATION_READ,
    PermissionEnum.DESIGNATION_UPDATE,
    PermissionEnum.DESIGNATION_DELETE,

    PermissionEnum.ATTENDANCE_CREATE,
    PermissionEnum.ATTENDANCE_UPDATE,
    PermissionEnum.ATTENDANCE_READ,

    PermissionEnum.ATTENDANCE_CORRECTION_CREATE,
    PermissionEnum.ATTENDANCE_CORRECTION_READ,
    PermissionEnum.ATTENDANCE_CORRECTION_UPDATE,

    PermissionEnum.LEAVE_CREATE,
    PermissionEnum.LEAVE_READ,
    PermissionEnum.LEAVE_UPDATE,

    PermissionEnum.LEAVE_APPROVAL,

    PermissionEnum.WEEKEND_CREATE,
    PermissionEnum.WEEKEND_READ,
    PermissionEnum.WEEKEND_UPDATE,

    PermissionEnum.HOLIDAY_CREATE,
    PermissionEnum.HOLIDAY_READ,
    PermissionEnum.HOLIDAY_UPDATE,

    PermissionEnum.PAYROLL_CREATE,
    PermissionEnum.PAYROLL_ALL_READ,
    PermissionEnum.PAYROLL_READ,
    PermissionEnum.PAYROLL_UPDATE,

    PermissionEnum.HR_DASHBOARD_READ,

    PermissionEnum.EMPLOYEE_DASHBOARD_READ,

    PermissionEnum.SALARY_CREATE,
    PermissionEnum.SALARY_READ,
    PermissionEnum.SALARY_UPDATE,
    PermissionEnum.SALARY_DELETE,

    PermissionEnum.TRAINING_CREATE,
    PermissionEnum.TRAINING_READ,
    PermissionEnum.TRAINING_UPDATE,
    PermissionEnum.TRAINING_DELETE,

    PermissionEnum.INTERVIEW_CREATE,
    PermissionEnum.INTERVIEW_READ,
    PermissionEnum.INTERVIEW_UPDATE,
    PermissionEnum.INTERVIEW_DELETE,

    PermissionEnum.TEAM_CREATE,
    PermissionEnum.TEAM_READ,
    PermissionEnum.TEAM_UPDATE,
    PermissionEnum.TEAM_DELETE,

    PermissionEnum.ACTIVITY_LOG_READ,
    PermissionEnum.ACTIVITY_LOG_EXPORT,

    PermissionEnum.CAREER_MOVEMENT_CREATE,
    PermissionEnum.CAREER_MOVEMENT_READ,
    PermissionEnum.CAREER_MOVEMENT_APPROVE,
    PermissionEnum.CAREER_MOVEMENT_EXECUTE,

    PermissionEnum.RESIGNATION_CREATE,
    PermissionEnum.RESIGNATION_READ,
    PermissionEnum.RESIGNATION_APPROVE,
    PermissionEnum.RESIGNATION_EXECUTE,

    PermissionEnum.LEAVE_LEDGER_READ,

    PermissionEnum.LEAVE_POLICY_CREATE,
    PermissionEnum.LEAVE_POLICY_READ,
    PermissionEnum.LEAVE_POLICY_UPDATE,
    PermissionEnum.LEAVE_POLICY_DELETE,

    PermissionEnum.LEAVE_TYPE_CREATE,
    PermissionEnum.LEAVE_TYPE_READ,
    PermissionEnum.LEAVE_TYPE_UPDATE,
    PermissionEnum.LEAVE_TYPE_DELETE,

    PermissionEnum.NOTIFICATION_READ,
    PermissionEnum.NOTIFICATION_UPDATE,
    PermissionEnum.NOTIFICATION_DELETE,

    PermissionEnum.NOTIFICATION_SETTINGS_READ,
    PermissionEnum.NOTIFICATION_SETTINGS_UPDATE,

    PermissionEnum.SHIFT_CREATE,
    PermissionEnum.SHIFT_READ,
    PermissionEnum.SHIFT_UPDATE,
    PermissionEnum.SHIFT_DELETE,

    PermissionEnum.AUDIT_LOG_READ,
    PermissionEnum.AUTH_LOG_READ,
  ],

  //   [RoleEnum.MANAGER]: [PermissionEnum.EMPLOYEE_READ],

  [RoleEnum.EMPLOYEE]: [
    PermissionEnum.ATTENDANCE_CREATE,
    PermissionEnum.ATTENDANCE_READ,

    PermissionEnum.EMPLOYEE_READ,
    PermissionEnum.EMPLOYEE_UPDATE,

    PermissionEnum.ATTENDANCE_CORRECTION_CREATE,
    PermissionEnum.ATTENDANCE_CORRECTION_READ,

    PermissionEnum.LEAVE_CREATE,
    PermissionEnum.LEAVE_READ,
    PermissionEnum.LEAVE_UPDATE,

    PermissionEnum.EMPLOYEE_DASHBOARD_READ,

    PermissionEnum.PAYROLL_READ,

    PermissionEnum.SALARY_READ,

    PermissionEnum.TEAM_READ,

    PermissionEnum.TRAINING_READ,
    PermissionEnum.TRAINING_UPDATE,

    PermissionEnum.RESIGNATION_CREATE,
    PermissionEnum.RESIGNATION_READ,

    PermissionEnum.LEAVE_POLICY_READ,

    PermissionEnum.LEAVE_TYPE_READ,

    PermissionEnum.NOTIFICATION_READ,
    PermissionEnum.NOTIFICATION_UPDATE,

    PermissionEnum.NOTIFICATION_SETTINGS_READ,

    PermissionEnum.SHIFT_READ,
  ],
};
