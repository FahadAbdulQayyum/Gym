import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PACKAGES,
  GENDER_OPTIONS,
  STATUS_OPTIONS,
  exportMembersCsv,
  memberMatchesQuery,
  memberToDetailsRow,
} from './memberShared';
import './CompleteMemberDetails.css';

const FILTER_GENDERS = GENDER_OPTIONS.filter((opt) => opt.value);

export default function CompleteMemberDetails() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const api = window.gymApp?.students;

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
      setError(err.message ?? 'Failed to load members');
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

  const filtered = useMemo(() => {
    const sorted = [...members].sort((a, b) => {
      const codeA = String(a.memberCode ?? '');
      const codeB = String(b.memberCode ?? '');
      const numA = Number(codeA);
      const numB = Number(codeB);
      if (!Number.isNaN(numA) && !Number.isNaN(numB) && codeA !== '' && codeB !== '') {
        return numA - numB;
      }
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });

    return sorted.filter((member) => {
      if (!memberMatchesQuery(member, search)) return false;
      const status = member.status ?? 'active';
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      const gender = member.gender ?? '';
      if (genderFilter !== 'all' && gender !== genderFilter) return false;
      return true;
    });
  }, [members, search, statusFilter, genderFilter]);

  const rows = useMemo(
    () => filtered.map((member, index) => memberToDetailsRow(member, index, DEFAULT_PACKAGES)),
    [filtered]
  );

  function handleExportCsv() {
    if (rows.length === 0) return;
    exportMembersCsv(rows);
  }

  return (
    <section className="member-details card">
      <header className="member-details__header">
        <h2 className="member-details__title">Complete Member Details</h2>
        <button
          type="button"
          className="member-details__export"
          onClick={handleExportCsv}
          disabled={loading || rows.length === 0}
        >
          Export CSV
        </button>
      </header>

      {error && (
        <p className="member-details__message member-details__message--error" role="alert">
          {error}
        </p>
      )}

      <div className="member-details__filters">
        <input
          type="search"
          className="member-details__search"
          placeholder="Search by ID, Name, Contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="member-details__select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All Status</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="member-details__select"
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
          aria-label="Filter by gender"
        >
          <option value="all">All Genders</option>
          {FILTER_GENDERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="member-details__table-wrap">
        <table className="member-details__table">
          <thead>
            <tr>
              <th>SR.NO</th>
              <th>Member ID</th>
              <th>Reg Date</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Package</th>
              <th>Discount</th>
              <th>Paid Amount</th>
              <th>Next Expiry</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="member-details__empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="member-details__empty">
                  No members found.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={`${row.memberId}-${row.srNo}`}>
                  <td>{row.srNo}</td>
                  <td>{row.memberId}</td>
                  <td>{row.regDate || '—'}</td>
                  <td>{row.name}</td>
                  <td>{row.contact}</td>
                  <td>{row.package}</td>
                  <td>{row.discount}</td>
                  <td>{row.paidAmount}</td>
                  <td>{row.nextExpiry || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
