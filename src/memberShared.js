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
  { id: 'silver', label: 'silver', days: 30, price: 3500 },
  { id: 'gold', label: 'gold', days: 30, price: 5000 },
  { id: 'platinum', label: 'platinum', days: 30, price: 7000 },
];

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

export function memberMatchesQuery(member, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const code = String(member.memberCode ?? '').toLowerCase();
  const name = String(member.name ?? '').toLowerCase();
  const phone = String(member.phone ?? '').replace(/\s/g, '').toLowerCase();
  const phoneQ = q.replace(/\s/g, '');
  return code.includes(q) || name.includes(q) || phone.includes(phoneQ);
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
