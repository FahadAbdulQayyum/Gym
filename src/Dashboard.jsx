import { useCallback, useEffect, useMemo, useState } from 'react';
import './Dashboard.css';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isThisMonth(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isToday(iso) {
  return iso.slice(0, 10) === todayKey();
}

function computeStats(students) {
  const total = students.length;
  const newThisMonth = students.filter((s) => isThisMonth(s.entryDate)).length;

  let attendanceToday = 0;
  for (const student of students) {
    for (const record of student.attendance ?? []) {
      if (isToday(record.checkedInAt)) {
        attendanceToday += 1;
      }
    }
  }

  return {
    totalMembers: total,
    activeMembers: total,
    newThisMonth,
    attendanceToday,
    paidToday: 0,
    unpaidToday: 0,
    revenueToday: '—',
    expensesToday: '—',
    feesDueNext7: 0,
    activePackages: '—',
    trainers: 0,
  };
}

function StatCard({ label, value, children }) {
  return (
    <article className="dash-stat-card">
      <span className="dash-stat-card__label">{label}</span>
      <span className="dash-stat-card__value">{value}</span>
      {children}
    </article>
  );
}

export default function Dashboard() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const api = window.gymApp?.students;

  const loadStudents = useCallback(async () => {
    if (!api?.list) {
      setLoading(false);
      return;
    }
    try {
      const list = await api.list();
      setStudents(list);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        loadStudents();
      }
    });
  }, [loadStudents]);

  const stats = useMemo(() => computeStats(students), [students]);

  const display = (n) => (loading ? '…' : String(n));

  return (
    <div className="dashboard">
      <div className="dash-stats-grid">
        <StatCard label="Total Members" value={display(stats.totalMembers)} />
        <StatCard label="Active Members" value={display(stats.activeMembers)} />
        <StatCard label="New This Month" value={display(stats.newThisMonth)} />

        <StatCard label="Attendance (Today)" value={display(stats.attendanceToday)}>
          <div className="dash-stat-badges">
            <span className="dash-badge dash-badge--paid">Paid: {display(stats.paidToday)}</span>
            <span className="dash-badge dash-badge--unpaid">Unpaid: {display(stats.unpaidToday)}</span>
          </div>
        </StatCard>
        <StatCard label="Revenue (Today)" value={stats.revenueToday} />
        <StatCard label="Expenses (Today)" value={stats.expensesToday} />

        <StatCard label="Fees Due (Next 7 days)" value={display(stats.feesDueNext7)} />
        <StatCard label="Active Packages" value={stats.activePackages} />
        <StatCard label="Trainers" value={display(stats.trainers)} />
      </div>

      <section className="dash-panel card">
        <h2 className="dash-panel__title">Fees Expiring — Next 7 Days</h2>
        <div className="dash-panel__empty">No upcoming expiries.</div>
      </section>
    </div>
  );
}
