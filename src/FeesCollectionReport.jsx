import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PACKAGES,
  feeReportInDateRange,
  feeReportMatchesQuery,
  flattenFeePayments,
} from './memberShared';
import { usePackages } from './usePackages';
import './FeesCollectionReport.css';

export default function FeesCollectionReport() {
  const [members, setMembers] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const api = window.gymApp?.students;
  const { packages } = usePackages();
  const packageList = packages.length ? packages : DEFAULT_PACKAGES;

  const loadMembers = useCallback(async () => {
    if (!api?.list) {
      setLoading(false);
      setError('Local database is only available in the desktop app.');
      return;
    }
    try {
      setError('');
      const list = await api.list();
      setMembers(list);
    } catch (err) {
      setError(err.message ?? 'Failed to load fee records');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        loadMembers();
      }
    });
  }, [loadMembers]);

  const allRows = useMemo(
    () => flattenFeePayments(members, packageList),
    [members, packageList]
  );

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (!feeReportInDateRange(row, appliedFrom, appliedTo)) return false;
      return feeReportMatchesQuery(row, appliedSearch);
    });
  }, [allRows, appliedFrom, appliedTo, appliedSearch]);

  function handleFilter(event) {
    event.preventDefault();
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    setAppliedSearch(search);
  }

  return (
    <section className="fees-report card">
      <h2 className="fees-report__title">Fees Collection Report</h2>

      {error && (
        <p className="fees-report__message fees-report__message--error" role="alert">
          {error}
        </p>
      )}

      <form className="fees-report__filters" onSubmit={handleFilter}>
        <input
          type="date"
          className="fees-report__input"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
        />
        <input
          type="date"
          className="fees-report__input"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
        />
        <input
          type="search"
          className="fees-report__input fees-report__search"
          placeholder="Search by ID, Name, Contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="fees-report__filter-btn">
          Filter
        </button>
      </form>

      <div className="fees-report__table-wrap">
        <table className="fees-report__table">
          <thead>
            <tr>
              <th>Payment Date</th>
              <th>Member ID</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Gender</th>
              <th>Package</th>
              <th>Discount</th>
              <th>Paid Amount</th>
              <th>Mode</th>
              <th>Next Expiry</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="fees-report__empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="fees-report__empty">
                  No records found
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.paymentDate || '—'}</td>
                  <td>{row.memberId}</td>
                  <td>{row.name}</td>
                  <td>{row.contact}</td>
                  <td>{row.gender}</td>
                  <td>{row.package}</td>
                  <td>{row.discount}</td>
                  <td>{row.paidAmount}</td>
                  <td>{row.mode}</td>
                  <td>{row.nextExpiry || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
