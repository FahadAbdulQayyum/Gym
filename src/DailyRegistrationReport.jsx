import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PACKAGES,
  memberMatchesQuery,
  memberToRegistrationRow,
  registrationMatchesDate,
  todayInputValue,
} from './memberShared';
import { usePackages } from './usePackages';
import './DailyRegistrationReport.css';

export default function DailyRegistrationReport() {
  const [members, setMembers] = useState([]);
  const [reportDate, setReportDate] = useState(todayInputValue());
  const [search, setSearch] = useState('');
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

  const rows = useMemo(() => {
    const filtered = members.filter((member) => {
      if (!registrationMatchesDate(member, reportDate)) return false;
      return memberMatchesQuery(member, search);
    });

    return filtered
      .sort((a, b) => {
        const codeA = String(a.memberCode ?? '');
        const codeB = String(b.memberCode ?? '');
        const numA = Number(codeA);
        const numB = Number(codeB);
        if (!Number.isNaN(numA) && !Number.isNaN(numB) && codeA !== '' && codeB !== '') {
          return numA - numB;
        }
        return codeA.localeCompare(codeB, undefined, { numeric: true });
      })
      .map((member) => memberToRegistrationRow(member, packageList));
  }, [members, reportDate, search, packageList]);

  return (
    <section className="daily-reg card">
      <h2 className="daily-reg__title">Daily Registration Report</h2>

      {error && (
        <p className="daily-reg__message daily-reg__message--error" role="alert">
          {error}
        </p>
      )}

      <div className="daily-reg__filters">
        <input
          type="date"
          className="daily-reg__input"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          aria-label="Report date"
        />
        <input
          type="search"
          className="daily-reg__input daily-reg__search"
          placeholder="Search by ID, Name, Contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="daily-reg__table-wrap">
        <table className="daily-reg__table">
          <thead>
            <tr>
              <th>Member ID</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Gender</th>
              <th>Registration Date</th>
              <th>Package</th>
              <th>Discount</th>
              <th>Paid Amount</th>
              <th>Start Date</th>
              <th>End Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="daily-reg__empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="daily-reg__empty">
                  No records found
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.memberId}</td>
                  <td>{row.name}</td>
                  <td>{row.contact}</td>
                  <td>{row.gender}</td>
                  <td>{row.registrationDateDisplay}</td>
                  <td>{row.package}</td>
                  <td>{row.discount}</td>
                  <td>{row.paidAmount}</td>
                  <td>{row.startDateDisplay}</td>
                  <td>{row.endDateDisplay}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
