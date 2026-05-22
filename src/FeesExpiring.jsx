import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PACKAGES } from './memberShared';
import { getExpiringMembers } from './reportsShared';
import { usePackages } from './usePackages';
import './ModulePage.css';
import './FeesExpiring.css';

export default function FeesExpiring() {
  const [members, setMembers] = useState([]);
  const [days, setDays] = useState('7');
  const [appliedDays, setAppliedDays] = useState(7);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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

  const rows = useMemo(
    () => getExpiringMembers(members, packageList, appliedDays, search),
    [members, packageList, appliedDays, search]
  );

  function handleApply(event) {
    event.preventDefault();
    const n = Math.max(1, Math.min(365, Math.floor(Number(days) || 7)));
    setAppliedDays(n);
  }

  return (
    <div className="module-page fees-expiring">
      <section className="module-card card">
        <h2 className="module-card__title">Expiring in next N days</h2>

        <div className="fees-expiring__toolbar">
          <form className="fees-expiring__days-form" onSubmit={handleApply}>
            <label>
              Days
              <input
                type="number"
                min={1}
                max={365}
                className="module-input fees-expiring__days-input"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <button type="submit" className="module-btn-gold">
              Apply
            </button>
          </form>
          <input
            type="search"
            className="module-input fees-expiring__search"
            placeholder="Search (name/phone/code/package)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="module-table-wrap">
          <table className="module-table module-table--dark-head">
            <thead>
              <tr>
                <th>Member Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Package</th>
                <th>End Date</th>
                <th>Days Left</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="module-table__empty">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="module-table__empty">
                    No members found.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.memberCode}</td>
                    <td>{row.name}</td>
                    <td>{row.phone}</td>
                    <td>{row.package}</td>
                    <td>{row.endDate}</td>
                    <td>{row.daysLeft}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <p className="fees-expiring__tip">
          Tip: &apos;Days&apos; box me 10 likho to next 10 din ke expiring members dikh jayenge.
        </p>
      </section>
    </div>
  );
}
