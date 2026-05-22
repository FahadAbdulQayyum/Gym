import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeProfitLoss, formatMoney, resolveDateRange } from './reportsShared';
import './ModulePage.css';
import './Reports.css';

export default function Reports() {
  const [members, setMembers] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [assets, setAssets] = useState([]);
  const [preset, setPreset] = useState('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [applied, setApplied] = useState(() => resolveDateRange('month', '', ''));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const studentsApi = window.gymApp?.students;
    if (!studentsApi?.list) {
      setLoading(false);
      return;
    }
    const [m, s, e, a] = await Promise.all([
      studentsApi.list(),
      window.gymApp?.sales?.list?.() ?? [],
      window.gymApp?.expenses?.list?.() ?? [],
      window.gymApp?.assets?.list?.() ?? [],
    ]);
    setMembers(m);
    setSales(s);
    setExpenses(e);
    setAssets(a);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const report = useMemo(
    () =>
      computeProfitLoss({
        members,
        sales,
        expenses,
        assetPurchases: assets,
        from: applied.from,
        to: applied.to,
      }),
    [members, sales, expenses, assets, applied]
  );

  function applyPreset(next) {
    setPreset(next);
    setApplied(resolveDateRange(next, dateFrom, dateTo));
  }

  function handleApplyCustom(event) {
    event.preventDefault();
    setPreset('custom');
    setApplied(resolveDateRange('custom', dateFrom, dateTo));
  }

  return (
    <div className="module-page reports-page">
      <section className="module-card card">
        <h2 className="module-card__title">Reports — Profit &amp; Loss</h2>

        <div className="reports-page__filters">
          <button
            type="button"
            className={`module-btn-filter${preset === 'month' ? ' is-active' : ''}`}
            onClick={() => applyPreset('month')}
          >
            This Month
          </button>
          <button
            type="button"
            className={`module-btn-filter${preset === 'year' ? ' is-active' : ''}`}
            onClick={() => applyPreset('year')}
          >
            This Year
          </button>
          <button
            type="button"
            className={`module-btn-filter${preset === 'all' ? ' is-active' : ''}`}
            onClick={() => applyPreset('all')}
          >
            All
          </button>
          <form className="reports-page__range" onSubmit={handleApplyCustom}>
            <input type="date" className="module-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span>to</span>
            <input type="date" className="module-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <button type="submit" className="module-btn-gold">
              Apply
            </button>
          </form>
        </div>

        {loading ? (
          <p className="reports-page__loading">Loading…</p>
        ) : (
          <>
            <div className="reports-page__summary">
              <article className="reports-page__stat">
                <span>Revenue (Total)</span>
                <strong>{formatMoney(report.revenue.total)}</strong>
              </article>
              <article className="reports-page__stat">
                <span>Outflows (Total)</span>
                <strong>{formatMoney(report.outflows.total)}</strong>
              </article>
              <article className="reports-page__stat reports-page__stat--profit">
                <span>Net Profit</span>
                <strong>{formatMoney(report.netProfit)}</strong>
              </article>
            </div>

            <div className="reports-page__grid">
              <div className="reports-page__box">
                <h3>Revenue Breakdown</h3>
                <ul>
                  <li>
                    <span>Membership</span>
                    <span>{formatMoney(report.revenue.membership)}</span>
                  </li>
                  <li>
                    <span>Admission</span>
                    <span>{formatMoney(report.revenue.admission)}</span>
                  </li>
                  <li>
                    <span>POS Sales</span>
                    <span>{formatMoney(report.revenue.posSales)}</span>
                  </li>
                  <li className="reports-page__total">
                    <span>Total</span>
                    <span>{formatMoney(report.revenue.total)}</span>
                  </li>
                </ul>
              </div>
              <div className="reports-page__box">
                <h3>Outflows Breakdown</h3>
                <ul>
                  <li>
                    <span>Trainer Commission</span>
                    <span>{formatMoney(report.outflows.trainerCommission)}</span>
                  </li>
                  <li>
                    <span>Expenses</span>
                    <span>{formatMoney(report.outflows.expenses)}</span>
                  </li>
                  <li>
                    <span>Assets Purchases</span>
                    <span>{formatMoney(report.outflows.assets)}</span>
                  </li>
                  <li className="reports-page__total">
                    <span>Total</span>
                    <span>{formatMoney(report.outflows.total)}</span>
                  </li>
                </ul>
              </div>
              <div className="reports-page__box">
                <h3>KPIs</h3>
                <ul>
                  <li>
                    <span>New Members</span>
                    <span>{report.kpis.newMembers}</span>
                  </li>
                  <li>
                    <span>Renewals</span>
                    <span>{report.kpis.renewals}</span>
                  </li>
                  <li>
                    <span>Expired Members</span>
                    <span>{report.kpis.expiredMembers}</span>
                  </li>
                  <li>
                    <span>Pending Amount (est.)</span>
                    <span>{formatMoney(report.kpis.pendingAmount)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
