import { isoDateOnly } from './reportsShared';
import { memberRegistrationDate } from './memberShared';

export function formatSalesMoney(amount) {
  return `Rs ${Math.max(0, Number(amount) || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function normalizeSalesPaymentBucket(method) {
  const value = String(method ?? 'Cash').toLowerCase();
  if (value.includes('card')) return 'Card';
  if (value.includes('bank')) return 'Bank';
  if (value.includes('wallet') || value.includes('upi') || value.includes('online')) return 'Wallet';
  return 'Cash';
}

const PAYMENT_BUCKETS = ['Cash', 'Card', 'Bank', 'Wallet'];

export function computeDailySales({ members = [], sales = [], date }) {
  const day = isoDateOnly(date);
  let registrationFees = 0;
  let feesCollection = 0;
  let posSales = 0;
  const methods = { Cash: 0, Card: 0, Bank: 0, Wallet: 0 };

  function addPayment(method, amount) {
    const bucket = normalizeSalesPaymentBucket(method);
    methods[bucket] += amount;
  }

  for (const member of members) {
    const regDate = isoDateOnly(memberRegistrationDate(member));
    if (regDate === day) {
      const admission = Math.round(Number(member.admissionFee) || 0);
      registrationFees += admission;
      addPayment(member.admissionPaymentMethod ?? member.lastPaymentMethod, admission);
    }

    for (const payment of member.feePayments ?? []) {
      if (isoDateOnly(payment.collectedAt) !== day) continue;
      const amount = Math.round(Number(payment.amount) || 0);
      feesCollection += amount;
      addPayment(payment.paymentMethod, amount);
    }
  }

  for (const sale of sales) {
    if (isoDateOnly(sale.soldAt) !== day) continue;
    const amount = Math.round(Number(sale.total) || 0);
    posSales += amount;
    addPayment(sale.paymentMethod, amount);
  }

  const total = registrationFees + feesCollection + posSales;

  return {
    date: day,
    registrationFees,
    feesCollection,
    posSales,
    total,
    methods,
    methodRows: PAYMENT_BUCKETS.map((method) => ({
      method,
      amount: methods[method],
    })),
  };
}

export function buildDailySalesReportHtml(summary, branding, reportDate) {
  const gymName = branding?.gymName?.trim() || 'Zyntra Technologies';
  const logoLetter = (gymName.charAt(0) || 'Z').toUpperCase();
  const cards = [
    ['New Registration Fees', summary.registrationFees],
    ['Fees Collection', summary.feesCollection],
    ['POS Sales', summary.posSales],
    ['Total', summary.total],
  ];

  const cardHtml = cards
    .map(
      ([label, amount], index) =>
        `<div class="card${index === 3 ? ' card--total' : ''}"><div class="card-label">${label}</div><div class="card-value">${formatSalesMoney(amount)}</div></div>`
    )
    .join('');

  const methodRows = summary.methodRows
    .map(
      (row) =>
        `<tr><td>${row.method}</td><td>${formatSalesMoney(row.amount).replace('Rs ', '')}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><title>Daily Sales Report</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:900px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
.brand{display:flex;align-items:center;gap:10px}
.logo{width:32px;height:32px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:4px}
h1{margin:0;font-size:1.25rem}
.sub{margin:4px 0 0;font-size:0.9rem;color:#555}
.date{font-size:0.9rem;color:#333}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
.card{border:1px solid #ddd;border-radius:8px;padding:14px}
.card--total{border:2px solid #c9a227}
.card-label{font-size:0.8rem;color:#555;margin-bottom:6px}
.card-value{font-size:1.05rem;font-weight:700}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{padding:8px 0;text-align:left;border-bottom:1px solid #eee}
th{font-size:0.85rem;color:#555}
.footer{margin-top:32px;text-align:center;font-size:0.8rem;color:#666}
</style></head><body>
<div class="header">
  <div>
    <h2 style="margin:0">Daily Sales Report</h2>
  </div>
  <div class="date">Date: ${reportDate}</div>
</div>
<div class="brand" style="justify-content:center;margin-bottom:20px">
  <div class="logo">${logoLetter}</div>
  <div style="text-align:center">
    <h1>${gymName}</h1>
    <p class="sub">Gym Manager — Sales Summary</p>
  </div>
</div>
<div class="cards">${cardHtml}</div>
<h3>Payment Methods</h3>
<table><thead><tr><th>Method</th><th>Amount (Rs)</th></tr></thead><tbody>${methodRows}</tbody></table>
<p class="footer">© ${new Date().getFullYear()} ${gymName}</p>
</body></html>`;
}

export function openDailySalesReport(summary, branding, reportDate) {
  const html = buildDailySalesReportHtml(summary, branding, reportDate);
  const win = window.open('', '_blank', 'width=960,height=800');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  return win;
}

export function printDailySalesReport(summary, branding, reportDate) {
  const win = openDailySalesReport(summary, branding, reportDate);
  if (!win) return false;
  win.print();
  return true;
}
