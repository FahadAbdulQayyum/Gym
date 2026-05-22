import { inDateRange } from './reportsShared';

export function exportAssetPurchasesCsv(rows, headMap) {
  const headers = [
    'Date',
    'Head',
    'Item',
    'Vendor',
    'Qty',
    'Unit',
    'Total',
    'Warranty',
    'Note',
  ];
  const escape = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.purchaseDate,
        headMap.get(row.headId) ?? '',
        row.itemName,
        row.vendor,
        row.qty,
        row.unitCost,
        row.total,
        row.warrantyTill,
        row.note,
      ]
        .map(escape)
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `asset-purchases-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function filterAssetPurchases(purchases, { from, to, search }) {
  const q = search.trim().toLowerCase();
  return purchases.filter((p) => {
    if (!inDateRange(p.purchaseDate, from, to)) return false;
    if (!q) return true;
    return (
      (p.itemName ?? '').toLowerCase().includes(q) ||
      (p.vendor ?? '').toLowerCase().includes(q) ||
      (p.note ?? '').toLowerCase().includes(q)
    );
  });
}
