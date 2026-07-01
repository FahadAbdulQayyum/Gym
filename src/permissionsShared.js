export const APP_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'add-member', label: 'Add Member' },
  { id: 'edit-members', label: 'Edit Members' },
  { id: 'member-details', label: 'Member Details' },
  { id: 'packages', label: 'Add Packages' },
  { id: 'fees', label: 'Collect Fees' },
  { id: 'fees-report', label: 'Fees Collection Report' },
  { id: 'pos', label: 'POS' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'registration', label: 'Daily Registration Report' },
  { id: 'reports', label: 'Reports' },
  { id: 'fees-expire', label: 'Next 7 days member fees expire' },
  { id: 'trainers', label: 'Add Trainers' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'attendance', label: 'Daily Attendance' },
  { id: 'zk50', label: 'Setup ZK50 Machine' },
  { id: 'assets', label: 'Purchase Gym Assets' },
  { id: 'csv-sample', label: 'Download CSV Sample' },
  { id: 'csv-import', label: 'Import CSV' },
  { id: 'backup', label: 'Get Software Backup' },
  { id: 'branding', label: 'Gym Branding' },
  { id: 'roles', label: 'User Roles' },
  { id: 'daily-sales', label: 'Daily Sales Report' },
];

export const DEFAULT_STAFF_PERMISSIONS = ['dashboard', 'add-member'];

function isAdminRole(role) {
  return String(role ?? '').trim().toLowerCase() === 'admin';
}

export function effectivePermissions(session) {
  if (!session) return [];
  if (isAdminRole(session.role)) return null;
  const permissions = session.permissions ?? [];
  return permissions.length > 0 ? permissions : DEFAULT_STAFF_PERMISSIONS;
}

export function userCanAccess(session, pageId) {
  if (!session) return false;
  if (isAdminRole(session.role)) return true;
  return effectivePermissions(session).includes(pageId);
}

export function filterNavItems(items, session) {
  if (!session || isAdminRole(session.role)) return items;
  return items.filter((item) => userCanAccess(session, item.id));
}

export function formatPermissionLabels(permissions) {
  if (!permissions?.length) return '—';
  const labels = new Map(APP_PERMISSIONS.map((p) => [p.id, p.label]));
  return permissions.map((id) => labels.get(id) ?? id).join(', ');
}
