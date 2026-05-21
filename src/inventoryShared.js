export function categoryMatchesQuery(category, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(category.name ?? '').toLowerCase().includes(q);
}

export function itemMatchesQuery(item, query, categoryName = '') {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const sku = String(item.sku ?? '').toLowerCase();
  const cat = String(categoryName ?? '').toLowerCase();
  return (
    String(item.name ?? '').toLowerCase().includes(q) ||
    sku.includes(q) ||
    cat.includes(q)
  );
}

export function formatRsPlain(amount) {
  return `Rs ${Math.max(0, Math.round(amount)).toLocaleString('en-PK')}`;
}
