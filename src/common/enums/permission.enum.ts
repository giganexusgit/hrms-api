export enum PermissionEnum {
  // ORGANIZATION
  ORGANIZATION_READ = 'organization.read',
  ORGANIZATION_UPDATE = 'organization.update',
  ORGANIZATION_CREATE = 'organization.create',
  ORGANIZATION_DELETE = 'organization.delete',

  // EMPLOYEE
  EMPLOYEE_CREATE = 'employee.create',
  EMPLOYEE_READ = 'employee.read',
  EMPLOYEE_UPDATE = 'employee.update',
  EMPLOYEE_DELETE = 'employee.delete',
  EMPLOYEE_RESTORE = 'employee.restore',

  // DEPARTMENT
  DEPARTMENT_CREATE = 'department.create',
  DEPARTMENT_READ = 'department.read',
  DEPARTMENT_UPDATE = 'department.update',
  DEPARTMENT_DELETE = 'department.delete',

  // DESIGNATION
  DESIGNATION_CREATE = 'designation.create',
  DESIGNATION_READ = 'designation.read',
  DESIGNATION_UPDATE = 'designation.update',
  DESIGNATION_DELETE = 'designation.delete',

  //Attendance

  ATTENDANCE_CREATE = 'attendance.create',
  ATTENDANCE_READ = 'attendance.read',
  ATTENDANCE_UPDATE = 'attendance.update',
  ATTENDANCE_DELETE = 'attendance.delete',

  EMPLOYEE_DASHBOARD_READ = 'dashboard.read',
  ADMIN_DASHBOARD_READ = 'admin_dashboard.read',

  HR_DASHBOARD_READ = 'hr_dashboard.read',

  ATTENDANCE_CORRECTION_CREATE = 'attendance_correction.create',
  ATTENDANCE_CORRECTION_READ = 'attendance_correction.read',
  ATTENDANCE_CORRECTION_UPDATE = 'attendance_correction.update',
  ATTENDANCE_CORRECTION_DELETE = 'attendance_correction.delete',

  LEAVE_CREATE = 'leave.create',
  LEAVE_READ = 'leave.read',
  LEAVE_UPDATE = 'leave.update',
  LEAVE_DELETE = 'leave.delete',
  LEAVE_APPROVAL = 'leave.approval',

  WEEKEND_CREATE = 'weekend.create',
  WEEKEND_READ = 'weekend.read',
  WEEKEND_UPDATE = 'weekend.update',
  WEEKEND_DELETE = 'weekend.delete',

  HOLIDAY_CREATE = 'holiday.create',
  HOLIDAY_READ = 'holiday.read',
  HOLIDAY_UPDATE = 'holiday.update',
  HOLIDAY_DELETE = 'holiday.delete',

  PAYROLL_CREATE = 'payroll.create',
  PAYROLL_READ = 'payroll.read',
  PAYROLL_ALL_READ = 'payroll_all.read',
  PAYROLL_UPDATE = 'payroll.update',
  PAYROLL_DELETE = 'payroll.delete',

  SALARY_CREATE = 'salary.create',
  SALARY_READ = 'salary.read',
  SALARY_UPDATE = 'salary.update',
  SALARY_DELETE = 'salary.delete',

  TRAINING_CREATE = 'training.create',
  TRAINING_READ = 'training.read',
  TRAINING_UPDATE = 'training.update',
  TRAINING_DELETE = 'training.delete',

  INTERVIEW_CREATE = 'interview.create',
  INTERVIEW_READ = 'interview.read',
  INTERVIEW_UPDATE = 'interview.update',
  INTERVIEW_DELETE = 'interview.delete',

  TEAM_CREATE = 'team.create',
  TEAM_READ = 'team.read',
  TEAM_UPDATE = 'team.update',
  TEAM_DELETE = 'team.delete',

  BRANCH_CREATE = 'branch.create',
  BRANCH_READ = 'branch.read',
  BRANCH_UPDATE = 'branch.update',
  BRANCH_DELETE = 'branch.delete',

  ROLE_CREATE = 'role.create',
  ROLE_READ = 'role.read',
  ROLE_UPDATE = 'role.update',
  ROLE_DELETE = 'role.delete',

  ASSIGNMENT_CREATE = 'assignment.create',
  ASSIGNMENT_READ = 'assignment.read',
  ASSIGNMENT_UPDATE = 'assignment.update',
  ASSIGNMENT_DELETE = 'assignment.delete',

  ASSIGN_ROLE_CREATE = 'assign_role.create',
  ASSIGN_ROLE_READ = 'assign_role.read',
  ASSIGN_ROLE_UPDATE = 'assign_role.update',
  ASSIGN_ROLE_DELETE = 'assign_role.delete',

  ACTIVITY_LOG_READ = 'activity_log.read',
  ACTIVITY_LOG_EXPORT = 'activity_log.export',
  ACTIVITY_LOG_DELETE = 'activity_log.delete',

  CAREER_MOVEMENT_CREATE = 'career_movement.create',
  CAREER_MOVEMENT_READ = 'career_movement.read',
  CAREER_MOVEMENT_APPROVE = 'career_movement.approve',
  CAREER_MOVEMENT_EXECUTE = 'career_movement.execute',
  // Resignations
  RESIGNATION_READ = 'resignation.read',
  RESIGNATION_CREATE = 'resignation.create',
  RESIGNATION_APPROVE = 'resignation.approve',
  RESIGNATION_EXECUTE = 'resignation.execute',

  LEAVE_LEDGER_READ = 'leave_ledger.read',

  LEAVE_POLICY_CREATE = 'leave_policy.create',
  LEAVE_POLICY_READ = 'leave_policy.read',
  LEAVE_POLICY_UPDATE = 'leave_policy.update',
  LEAVE_POLICY_DELETE = 'leave_policy.delete',

  LEAVE_TYPE_CREATE = 'leave_type.create',
  LEAVE_TYPE_READ = 'leave_type.read',
  LEAVE_TYPE_UPDATE = 'leave_type.update',
  LEAVE_TYPE_DELETE = 'leave_type.delete',

  NOTIFICATION_READ = 'notification.read',
  NOTIFICATION_UPDATE = 'notification.update',
  NOTIFICATION_DELETE = 'notification.delete',

  NOTIFICATION_SETTINGS_UPDATE = 'notification_settings.update',
  NOTIFICATION_SETTINGS_READ = 'notification_settings.read',

  SHIFT_CREATE = 'shift.create',
  SHIFT_READ = 'shift.read',
  SHIFT_UPDATE = 'shift.update',
  SHIFT_DELETE = 'shift.delete',

  AUDIT_LOG_READ = 'audit_log.read',
  
  AUTH_LOG_READ = 'auth_log.read',

  // REPORTS
  REPORT_READ = 'report.read',
  REPORT_ALL_READ = 'report_all.read',
}
