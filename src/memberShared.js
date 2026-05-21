export const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'inactive' },
  { value: 'expired', label: 'expired' },
  { value: 'frozen', label: 'frozen' },
];

export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'UPI', 'Online'];

export const DEFAULT_PACKAGES = [
  { id: 'silver', label: 'silver', days: 30, price: 3500, active: true },
  { id: 'gold', label: 'gold', days: 30, price: 5000, active: true },
  { id: 'platinum', label: 'platinum', days: 30, price: 7000, active: true },
];

export function normalizePackage(pkg) {
  if (!pkg) return null;
  return {
    id: pkg.id,
    label: pkg.label ?? pkg.name ?? '',
    days: pkg.days ?? 0,
    price: pkg.price ?? 0,
    active: pkg.active !== false,
  };
}

export function activePackagesOnly(packages) {
  return packages.filter((p) => p.active !== false);
}

export function packageMatchesQuery(pkg, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = String(pkg.label ?? '').toLowerCase();
  const days = String(pkg.days ?? '');
  return name.includes(q) || days.includes(q);
}

export function formatPackagePrice(price) {
  return `PKR ${Math.max(0, Math.round(price)).toLocaleString('en-PK')}`;
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function parseAmount(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatRs(amount) {
  return `Rs ${Math.max(0, Math.round(amount)).toLocaleString('en-PK')}`;
}

export function packageOptionLabel(pkg) {
  return `${pkg.label} • ${pkg.days} days • Rs ${pkg.price}`;
}

export function resolvePackageId(student, packages = DEFAULT_PACKAGES) {
  if (student.packageId && packages.some((p) => p.id === student.packageId)) {
    return student.packageId;
  }
  if (student.packagePrice != null) {
    const byPrice = packages.find((p) => p.price === student.packagePrice);
    if (byPrice) return byPrice.id;
  }
  if (student.packageLabel) {
    const lower = student.packageLabel.toLowerCase();
    const byLabel = packages.find((p) => lower.includes(p.label));
    if (byLabel) return byLabel.id;
  }
  return packages[0]?.id ?? '';
}

export function memberDisplayLabel(member) {
  const code = member.memberCode ?? '—';
  return `#${code} — ${member.name ?? '—'}`;
}

export function memberMatchesQuery(member, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const code = String(member.memberCode ?? '').toLowerCase();
  const name = String(member.name ?? '').toLowerCase();
  const phone = String(member.phone ?? '').replace(/\s/g, '').toLowerCase();
  const phoneQ = q.replace(/\s/g, '');
  return code.includes(q) || name.includes(q) || phone.includes(phoneQ);
}

export function memberRegistrationDate(member) {
  return member.registrationDate ?? member.entryDate ?? '';
}

export function memberPackageLabel(member, packages = DEFAULT_PACKAGES) {
  const id = resolvePackageId(member, packages);
  const pkg = packages.find((p) => p.id === id);
  return pkg?.label ?? member.packageId ?? '—';
}

export function memberPaidAmount(member, packages = DEFAULT_PACKAGES) {
  if (member.totalAmount != null && Number.isFinite(member.totalAmount)) {
    return member.totalAmount;
  }
  const id = resolvePackageId(member, packages);
  const pkg = packages.find((p) => p.id === id);
  const price = member.packagePrice ?? pkg?.price ?? 0;
  const discount = parseAmount(member.discount);
  return Math.max(0, price - discount);
}

export function memberNextExpiry(member, packages = DEFAULT_PACKAGES) {
  const startRaw = member.packageStartDate ?? member.entryDate;
  if (!startRaw) return '';

  const id = resolvePackageId(member, packages);
  const pkg = packages.find((p) => p.id === id);
  const days = member.packageDays ?? pkg?.days ?? 0;
  if (!days) return '';

  const start = new Date(`${String(startRaw).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return '';

  const expiry = new Date(start);
  expiry.setDate(expiry.getDate() + days);
  return expiry.toISOString().slice(0, 10);
}

export function expiryFromStartDate(startRaw, packageId, packages = DEFAULT_PACKAGES) {
  if (!startRaw) return '';
  const pkg = packages.find((p) => p.id === packageId);
  const days = pkg?.days ?? 0;
  if (!days) return '';

  const start = new Date(`${String(startRaw).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return '';

  const expiry = new Date(start);
  expiry.setDate(expiry.getDate() + days);
  return expiry.toISOString().slice(0, 10);
}

export function packageLabelFromPayment(payment, packages = DEFAULT_PACKAGES) {
  if (payment.packageLabel) {
    const part = payment.packageLabel.split(' • ')[0];
    if (part) return part.trim();
  }
  const pkg = packages.find((p) => p.id === payment.packageId);
  return pkg?.label ?? payment.packageId ?? '—';
}

export function flattenFeePayments(members, packages = DEFAULT_PACKAGES) {
  const rows = [];

  for (const member of members) {
    for (const payment of member.feePayments ?? []) {
      const paymentDate = payment.collectedAt?.slice(0, 10) ?? '';
      rows.push({
        id: payment.id,
        paymentDate,
        memberId: member.memberCode ?? '—',
        name: member.name ?? '—',
        contact: member.phone ?? '—',
        gender: member.gender || '—',
        package: packageLabelFromPayment(payment, packages),
        discount: payment.discount ?? 0,
        paidAmount: payment.amount ?? 0,
        mode: payment.paymentMethod ?? '—',
        nextExpiry: expiryFromStartDate(payment.startDate, payment.packageId, packages),
      });
    }
  }

  return rows.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

export function feeReportMatchesQuery(row, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const phoneQ = q.replace(/\s/g, '');
  const contact = String(row.contact ?? '').replace(/\s/g, '').toLowerCase();
  return (
    String(row.memberId ?? '').toLowerCase().includes(q) ||
    String(row.name ?? '').toLowerCase().includes(q) ||
    contact.includes(phoneQ) ||
    String(row.gender ?? '').toLowerCase().includes(q) ||
    String(row.package ?? '').toLowerCase().includes(q) ||
    String(row.mode ?? '').toLowerCase().includes(q)
  );
}

export function feeReportInDateRange(row, dateFrom, dateTo) {
  const date = row.paymentDate;
  if (!date) return false;
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

export function memberToDetailsRow(member, index, packages = DEFAULT_PACKAGES) {
  return {
    srNo: index + 1,
    memberId: member.memberCode ?? '—',
    regDate: memberRegistrationDate(member),
    name: member.name ?? '—',
    contact: member.phone ?? '—',
    package: memberPackageLabel(member, packages),
    discount: parseAmount(member.discount),
    paidAmount: memberPaidAmount(member, packages),
    nextExpiry: memberNextExpiry(member, packages),
    status: member.status ?? 'active',
    gender: member.gender ?? '',
  };
}

export function exportMembersCsv(rows) {
  const headers = [
    'SR.NO',
    'Member ID',
    'Reg Date',
    'Name',
    'Contact',
    'Package',
    'Discount',
    'Paid Amount',
    'Next Expiry',
  ];
  const escape = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.srNo,
        row.memberId,
        row.regDate,
        row.name,
        row.contact,
        row.package,
        row.discount,
        row.paidAmount,
        row.nextExpiry,
      ]
        .map(escape)
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `member-details-${todayInputValue()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildCollectFeePayload(member, form, selectedPackage, totalAmount) {
  return buildMemberPayload(
    {
      fullName: member.name ?? '',
      registrationDate: member.registrationDate ?? member.entryDate ?? todayInputValue(),
      phone: member.phone ?? '',
      gender: member.gender ?? '',
      address: member.address ?? '',
      notes: member.notes ?? '',
      status: 'active',
      packageId: form.packageId,
      packageStartDate: form.startFrom,
      discount: form.discount,
    },
    selectedPackage,
    { totalAmount }
  );
}

export function buildMemberPayload(form, selectedPackage, options = {}) {
  const { includeFees = false, totalAmount } = options;
  const payload = {
    name: form.fullName.trim(),
    entryDate: form.registrationDate,
    phone: form.phone.trim(),
    gender: form.gender,
    address: form.address.trim(),
    notes: form.notes?.trim() ?? '',
    status: form.status || 'active',
    registrationDate: form.registrationDate,
    packageId: form.packageId,
    packageLabel: selectedPackage ? packageOptionLabel(selectedPackage) : '',
    packageStartDate: form.packageStartDate,
    packageDays: selectedPackage?.days,
    packagePrice: selectedPackage?.price,
    discount: parseAmount(form.discount),
    totalAmount,
  };

  if (includeFees) {
    payload.admissionFee = parseAmount(form.admissionFee);
    payload.admissionPaymentMethod = form.admissionPaymentMethod;
    payload.trainerId = form.trainerId || null;
    payload.trainerFee = parseAmount(form.trainerFee);
    payload.trainerCommissionPercent = parseAmount(form.commissionPercent);
    payload.trainerCommissionAmount = parseAmount(form.commissionAmount);
  }

  return payload;
}
