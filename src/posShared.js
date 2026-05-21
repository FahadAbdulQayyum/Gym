import { parseAmount } from './memberShared';

export function formatMoney(amount) {
  return `Rs ${Math.max(0, Number(amount) || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function productMatchesQuery(product, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = String(product.name ?? '').toLowerCase();
  const sku = String(product.sku ?? '').toLowerCase();
  return name.includes(q) || sku.includes(q);
}

export function calcPosTotals(cartLines, discountRaw, taxRaw) {
  const subtotal = cartLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discount = parseAmount(discountRaw);
  const tax = parseAmount(taxRaw);
  const total = Math.max(0, subtotal - discount + tax);
  return { subtotal, discount, tax, total };
}

export function buildReceiptHtml(sale) {
  const rows = sale.items
    .map(
      (item) =>
        `<tr><td>${item.name}</td><td>${item.qty}</td><td>${formatMoney(item.lineTotal)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><title>Receipt</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;max-width:320px;margin:0 auto;color:#111}
h1{font-size:1.1rem;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:0.9rem}
td,th{padding:4px 0;text-align:left}th{border-bottom:1px solid #ccc}
.summary{margin-top:12px;font-size:0.9rem}.summary div{display:flex;justify-content:space-between}
.total{font-weight:700;font-size:1rem;margin-top:8px}
</style></head><body>
<h1>Gym — Sale Receipt</h1>
<p style="margin:0 0 12px;font-size:0.85rem">${new Date(sale.soldAt).toLocaleString()}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Line</th></tr></thead><tbody>${rows}</tbody></table>
<div class="summary">
<div><span>Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div>
<div><span>Discount</span><span>${formatMoney(sale.discount)}</span></div>
<div><span>Tax</span><span>${formatMoney(sale.tax)}</span></div>
<div class="total"><span>Total</span><span>${formatMoney(sale.total)}</span></div>
<div><span>Paid</span><span>${formatMoney(sale.paidAmount)}</span></div>
${sale.changeAmount > 0 ? `<div><span>Change</span><span>${formatMoney(sale.changeAmount)}</span></div>` : ''}
<div><span>Payment</span><span>${sale.paymentMethod}</span></div>
</div>
${sale.note ? `<p style="margin-top:12px;font-size:0.85rem">Note: ${sale.note}</p>` : ''}
</body></html>`;
}

export function printSaleReceipt(sale) {
  const html = buildReceiptHtml(sale);
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) {
    return false;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
