import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PACKAGES, GENDER_OPTIONS, todayInputValue } from './memberShared';
import { flattenAttendancePunches } from './reportsShared';
import { usePackages } from './usePackages';
import './ModulePage.css';
import './DailyAttendance.css';

export default function DailyAttendance() {
  const [members, setMembers] = useState([]);
  const [reportDate, setReportDate] = useState(todayInputValue());
  const [genderFilter, setGenderFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({
    date: todayInputValue(),
    gender: 'all',
    package: 'all',
    search: '',
  });
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState('');

  const { packages } = usePackages();
  const packageList = packages.length ? packages : DEFAULT_PACKAGES;

  const load = useCallback(async () => {
    if (!window.gymApp?.students?.list) {
      setLoading(false);
      return;
    }
    setMembers(await window.gymApp.students.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const packageOptions = useMemo(() => {
    const labels = new Set(
      members
        .map((m) => {
          const pkg = packageList.find((p) => p.id === m.packageId);
          return pkg?.label ?? m.packageId ?? '';
        })
        .filter(Boolean)
    );
    return [...labels].sort();
  }, [members, packageList]);

  const rows = useMemo(
    () =>
      flattenAttendancePunches(
        members,
        applied.date,
        applied.gender,
        applied.package,
        applied.search,
        packageList
      ),
    [members, applied, packageList]
  );

  function handleApply(event) {
    event.preventDefault();
    setApplied({ date: reportDate, gender: genderFilter, package: packageFilter, search });
  }

  function handleSyncDevice() {
    setSyncMsg('ZK50 device sync is not configured on this machine. Use manual check-in from member records.');
    setTimeout(() => setSyncMsg(''), 5000);
  }

  return (
    <div className="module-page daily-attendance">
      {syncMsg && <p className="module-page__message module-page__message--success">{syncMsg}</p>}

      <section className="module-card card">
        <h2 className="module-card__title">Daily Attendance</h2>

        <form className="daily-attendance__toolbar" onSubmit={handleApply}>
          <input type="date" className="module-input" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          <select className="module-input" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
            <option value="all">All</option>
            {GENDER_OPTIONS.filter((g) => g.value).map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <select className="module-input" value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
            <option value="all">All</option>
            {packageOptions.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="module-btn-gold">
            Apply
          </button>
          <button type="button" className="daily-attendance__sync module-btn-gold" onClick={handleSyncDevice}>
            Sync from Device
          </button>
          <input
            type="search"
            className="module-input daily-attendance__search"
            placeholder="Search (name/phone/id/zk_uid)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="module-table-wrap">
          <table className="module-table module-table--dark-head">
            <thead>
              <tr>
                <th>SR.NO</th>
                <th>Time</th>
                <th>Member ID</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Gender</th>
                <th>Package</th>
                <th>Next Expiry</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="module-table__empty">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="module-table__empty">
                    No punches.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td>{row.time}</td>
                    <td>{row.memberCode}</td>
                    <td>{row.name}</td>
                    <td>{row.contact}</td>
                    <td>{row.gender}</td>
                    <td>{row.package}</td>
                    <td>{row.nextExpiry}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
