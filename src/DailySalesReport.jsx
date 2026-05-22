import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeBranding, brandingDisplayName, brandingLogoLetter } from './brandingShared';
import {
  computeDailySales,
  formatSalesMoney,
  printDailySalesReport,
  openDailySalesReport,
} from './salesShared';
import { todayInputValue } from './memberShared';
import './ModulePage.css';
import './DailySalesReport.css';

export default function DailySalesReport() {
  const [members, setMembers] = useState([]);
  const [sales, setSales] = useState([]);
  const [branding, setBranding] = useState(null);
  const [reportDate, setReportDate] = useState(todayInputValue());
  const [appliedDate, setAppliedDate] = useState(todayInputValue());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const studentsApi = window.gymApp?.students;
  const salesApi = window.gymApp?.sales;
  const brandingApi = window.gymApp?.branding;

  const load = useCallback(async () => {
    if (!studentsApi?.list) {
      setLoading(false);
      setError('Local database is only available in the desktop app.');
      return;
    }
    try {
      setError('');
      const [memberList, saleList, brand] = await Promise.all([
        studentsApi.list(),
        salesApi?.list?.() ?? [],
        brandingApi?.get?.() ?? null,
      ]);
      setMembers(memberList);
      setSales(saleList);
      setBranding(normalizeBranding(brand));
    } catch (err) {
      setError(err.message ?? 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [brandingApi, salesApi, studentsApi]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        load();
      }
    });
  }, [load]);

  const summary = useMemo(
    () => computeDailySales({ members, sales, date: appliedDate }),
    [members, sales, appliedDate]
  );

  const gymName = brandingDisplayName(branding);
  const logoLetter = brandingLogoLetter(branding);

  function handleApply() {
    setAppliedDate(reportDate);
  }

  function handlePrint() {
    printDailySalesReport(summary, branding, appliedDate);
  }

  function handleSavePdf() {
    const win = openDailySalesReport(summary, branding, appliedDate);
    if (win) {
      win.print();
    }
  }

  return (
    <section className="daily-sales module-page card module-card">
      <div className="daily-sales__toolbar">
        <h2 className="module-card__title daily-sales__title">Daily Sales Report</h2>
        <div className="daily-sales__controls">
          <input
            type="date"
            className="module-input daily-sales__date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            aria-label="Report date"
          />
          <button type="button" className="btn-secondary" onClick={handleApply}>
            Apply
          </button>
          <button type="button" className="btn-primary" onClick={handlePrint} disabled={loading}>
            Print
          </button>
          <button type="button" className="btn-primary" onClick={handleSavePdf} disabled={loading}>
            Save PDF
          </button>
        </div>
      </div>

      {error && (
        <p className="module-page__message module-page__message--error" role="alert">
          {error}
        </p>
      )}

      <div className="daily-sales__brand">
        <span className="daily-sales__logo" aria-hidden>
          {logoLetter}
        </span>
        <div>
          <strong className="daily-sales__gym">{gymName}</strong>
          <p className="daily-sales__subtitle">Gym Manager — Sales Summary</p>
        </div>
        <span className="daily-sales__meta">Date: {appliedDate}</span>
      </div>

      <div className="daily-sales__cards">
        <div className="daily-sales__card">
          <span className="daily-sales__card-label">New Registration Fees</span>
          <strong>{formatSalesMoney(summary.registrationFees)}</strong>
        </div>
        <div className="daily-sales__card">
          <span className="daily-sales__card-label">Fees Collection</span>
          <strong>{formatSalesMoney(summary.feesCollection)}</strong>
        </div>
        <div className="daily-sales__card">
          <span className="daily-sales__card-label">POS Sales</span>
          <strong>{formatSalesMoney(summary.posSales)}</strong>
        </div>
        <div className="daily-sales__card daily-sales__card--total">
          <span className="daily-sales__card-label">Total</span>
          <strong>{formatSalesMoney(summary.total)}</strong>
        </div>
      </div>

      <h3 className="daily-sales__section-title">Payment Methods</h3>
      <div className="daily-sales__table-wrap">
        <table className="daily-sales__table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Amount (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {summary.methodRows.map((row) => (
              <tr key={row.method}>
                <td>{row.method}</td>
                <td>
                  {Math.max(0, row.amount).toLocaleString('en-PK', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="daily-sales__footer">
        © {new Date().getFullYear()} {gymName}
      </p>
    </section>
  );
}
