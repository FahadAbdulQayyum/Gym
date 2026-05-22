import {
  DEFAULT_PACKAGES,
  memberMatchesQuery,
  memberNextExpiry,
  memberPackageLabel,
  memberRegistrationDate,
  todayInputValue,
} from './memberShared';

export function isoDateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function resolveDateRange(preset, dateFrom, dateTo) {
  const today = todayInputValue();
  const now = new Date(`${today}T12:00:00`);

  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: start.toISOString().slice(0, 10),
      to: today,
    };
  }
  if (preset === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return {
      from: start.toISOString().slice(0, 10),
      to: today,
    };
  }
  if (preset === 'all') {
    return { from: '', to: '' };
  }
  return { from: dateFrom ?? '', to: dateTo ?? '' };
}

export function inDateRange(iso, from, to) {
  const date = isoDateOnly(iso);
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function formatMoney(amount) {
  return `Rs ${Math.max(0, Math.round(Number(amount) || 0)).toLocaleString('en-PK')}`;
}

export function computeProfitLoss({
  members = [],
  sales = [],
  expenses = [],
  assetPurchases = [],
  expenseHeads = [],
  from,
  to,
}) {
  let membership = 0;
  let admission = 0;
  let posSales = 0;
  let trainerCommission = 0;
  let newMembers = 0;
  let renewals = 0;

  for (const member of members) {
    const regDate = memberRegistrationDate(member);
    if (inDateRange(regDate, from, to)) {
      newMembers += 1;
      admission += Math.round(Number(member.admissionFee) || 0);
      trainerCommission += Math.round(Number(member.trainerCommissionAmount) || 0);
    }

    for (const payment of member.feePayments ?? []) {
      const payDate = isoDateOnly(payment.collectedAt);
      if (!inDateRange(payDate, from, to)) continue;
      membership += Math.round(Number(payment.amount) || 0);
      renewals += 1;
    }
  }

  for (const sale of sales) {
    if (inDateRange(sale.soldAt, from, to)) {
      posSales += Math.round(Number(sale.total) || 0);
    }
  }

  let expenseTotal = 0;
  for (const expense of expenses) {
    if (inDateRange(expense.date, from, to)) {
      expenseTotal += Math.round(Number(expense.amount) || 0);
    }
  }

  let assetsTotal = 0;
  for (const asset of assetPurchases) {
    const assetDate = asset.purchaseDate ?? asset.date;
    if (inDateRange(assetDate, from, to)) {
      assetsTotal += Math.round(Number(asset.total) || Number(asset.amount) || 0);
    }
  }

  const revenueTotal = membership + admission + posSales;
  const outflowsTotal = trainerCommission + expenseTotal + assetsTotal;
  const netProfit = revenueTotal - outflowsTotal;

  const today = todayInputValue();
  let expiredMembers = 0;
  let pendingAmount = 0;

  for (const member of members) {
    const expiry = memberNextExpiry(member, DEFAULT_PACKAGES);
    if (member.status === 'expired' || (expiry && expiry < today)) {
      expiredMembers += 1;
    }
    if (member.status === 'active' && expiry && expiry < today) {
      pendingAmount += Math.round(Number(member.totalAmount) || 0);
    }
  }

  return {
    revenue: {
      membership,
      admission,
      posSales,
      total: revenueTotal,
    },
    outflows: {
      trainerCommission,
      expenses: expenseTotal,
      assets: assetsTotal,
      total: outflowsTotal,
    },
    netProfit,
    kpis: {
      newMembers,
      renewals,
      expiredMembers,
      pendingAmount,
    },
    expenseHeads,
  };
}

export function daysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function getExpiringMembers(members, packages, days, search) {
  const today = todayInputValue();
  const end = new Date(`${today}T12:00:00`);
  end.setDate(end.getDate() + days);
  const endIso = end.toISOString().slice(0, 10);

  return members
    .filter((member) => {
      const expiry = memberNextExpiry(member, packages);
      if (!expiry || expiry < today || expiry > endIso) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const pkg = memberPackageLabel(member, packages);
      return (
        memberMatchesQuery(member, search) ||
        pkg.toLowerCase().includes(q) ||
        expiry.includes(q)
      );
    })
    .map((member) => {
      const endDate = memberNextExpiry(member, packages);
      return {
        id: member.id,
        memberCode: member.memberCode ?? '—',
        name: member.name ?? '—',
        phone: member.phone ?? '—',
        package: memberPackageLabel(member, packages),
        endDate,
        daysLeft: daysBetween(today, endDate),
      };
    })
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export function flattenAttendancePunches(members, date, genderFilter, packageFilter, search, packages) {
  const rows = [];

  for (const member of members) {
    if (genderFilter !== 'all' && (member.gender ?? '') !== genderFilter) continue;
    const pkgLabel = memberPackageLabel(member, packages);
    if (packageFilter !== 'all' && pkgLabel !== packageFilter) continue;
    if (search.trim() && !memberMatchesQuery(member, search)) {
      const q = search.trim().toLowerCase();
      if (!pkgLabel.toLowerCase().includes(q)) continue;
    }

    for (const record of member.attendance ?? []) {
      const punchDate = isoDateOnly(record.checkedInAt);
      if (punchDate !== date) continue;

      rows.push({
        id: record.id,
        studentId: member.id,
        time: new Date(record.checkedInAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        memberCode: member.memberCode ?? '—',
        name: member.name ?? '—',
        contact: member.phone ?? '—',
        gender: member.gender || '—',
        package: pkgLabel,
        nextExpiry: memberNextExpiry(member, packages) || '—',
        status: member.status ?? 'active',
        checkedInAt: record.checkedInAt,
      });
    }
  }

  return rows.sort(
    (a, b) => new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime()
  );
}

export function exportExpensesCsv(rows, headMap) {
  const headers = ['Date', 'Head', 'Amount', 'Note'];
  const escape = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [row.date, headMap.get(row.headId) ?? row.headId, row.amount, row.note]
        .map(escape)
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expenses-${todayInputValue()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
