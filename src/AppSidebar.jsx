const NAV_PRIMARY = [  { id: 'dashboard', label: 'Dashboard' },
  { id: 'add-member', label: 'Add Member' },
  // { id: 'edit-members', label: 'Edit Members' },
  // { id: 'member-details', label: 'Complete Member Details' },
  // { id: 'packages', label: 'Add Packages' },
  // { id: 'fees', label: 'Collect Fees' },
  // { id: 'fees-report', label: 'Fees Collection Report' },
  // { id: 'pos', label: 'POS' },
  // { id: 'inventory', label: 'Inventory' },
  // { id: 'registration', label: 'Daily Registration Report' },
];

const NAV_SECONDARY = [
  // { id: 'reports', label: 'Reports' },
  // { id: 'fees-expire', label: 'Next 7 days member fees expire' },
  // { id: 'trainers', label: 'Add Trainers' },
  // { id: 'expenses', label: 'Expenses' },
  // { id: 'attendance', label: 'Daily Attendance' },
  // { id: 'zk50', label: 'Setup ZK50 Machine' },
  // { id: 'assets', label: 'Purchase Gym Assets' },
];

const NAV_UTILITY = [
  // { id: 'csv-sample', label: 'Download CSV Sample' },
  // { id: 'csv-import', label: 'Import CSV' },
  // { id: 'backup', label: 'Get Software Backup' },
  // { id: 'branding', label: 'Gym Branding' },
  // { id: 'roles', label: 'User Roles' },
  // { id: 'daily-sales', label: 'Daily Sales Report' },
];

function NavGroup({ items, activeId, onNavigate }) {
  if (!items.length) return null;

  return (
    <ul className="sidebar-nav">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`sidebar-nav__link${activeId === item.id ? ' is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-nav__dot" aria-hidden />
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function AppSidebar({ activeId, onNavigate, brandName = 'Gym' }) {
  const primary = NAV_PRIMARY;
  const secondary = NAV_SECONDARY;
  const utility = NAV_UTILITY;
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand__logo" aria-hidden>
          G
        </span>
        <div>
          <strong className="sidebar-brand__name">{brandName}</strong>
          <span className="sidebar-brand__tag">Gym Manager</span>
        </div>
      </div>

      <nav className="sidebar-nav-wrap" aria-label="Main">
        <NavGroup items={primary} activeId={activeId} onNavigate={onNavigate} />
        {secondary.length > 0 && (
          <>
            <hr className="sidebar-divider" />
            <NavGroup items={secondary} activeId={activeId} onNavigate={onNavigate} />
          </>
        )}
        {utility.length > 0 && (
          <>
            <hr className="sidebar-divider" />
            <NavGroup items={utility} activeId={activeId} onNavigate={onNavigate} />
          </>
        )}
      </nav>
    </aside>
  );
}
