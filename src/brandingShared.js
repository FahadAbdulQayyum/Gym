export const DEFAULT_BRANDING = {
  gymName: '',
  phone: '',
  email: '',
  address: '',
  logoUrl: '',
  footerNote: 'Thank you for your fitness journey with us!',
};

export function normalizeBranding(raw) {
  return { ...DEFAULT_BRANDING, ...(raw ?? {}) };
}

export function brandingDisplayName(branding) {
  const name = String(branding?.gymName ?? '').trim();
  return name || 'Your Gym';
}

export function brandingLogoLetter(branding) {
  const name = brandingDisplayName(branding);
  return name.charAt(0).toUpperCase() || 'G';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFeeReceiptHtml({ branding, member, amount, paymentMethod, collectedAt }) {
  const b = normalizeBranding(branding);
  const gymName = escapeHtml(brandingDisplayName(b));
  const footer = escapeHtml(b.footerNote || DEFAULT_BRANDING.footerNote);
  const logoLetter = escapeHtml(brandingLogoLetter(b));
  const logoImg = b.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="" style="width:36px;height:36px;object-fit:contain" />`
    : `<div class="logo">${logoLetter}</div>`;
  const contact = [b.phone, b.email, b.address].filter(Boolean).map(escapeHtml);
  const contactHtml = contact.length
    ? `<p class="contact">${contact.join(' · ')}</p>`
    : '';
  const when = collectedAt ? new Date(collectedAt).toLocaleString() : new Date().toLocaleString();

  return `<!DOCTYPE html><html><head><title>Fee Receipt</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;max-width:320px;margin:0 auto;color:#111}
.header{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.logo{width:36px;height:36px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:4px;font-size:1.1rem}
h1{font-size:1.05rem;margin:0}
.contact{margin:0 0 10px;font-size:0.8rem;color:#444}
hr{border:none;border-top:1px solid #ccc;margin:10px 0}
.row{display:flex;justify-content:space-between;font-size:0.9rem;margin:4px 0}
.total{font-weight:700;font-size:1rem;margin-top:8px}
.footer{margin-top:14px;font-size:0.85rem;text-align:center;color:#333}
</style></head><body>
<div class="header">${logoImg}<h1>${gymName}</h1></div>
${contactHtml}
<hr />
<div class="row"><span>Member</span><span>${escapeHtml(member?.name ?? '—')}</span></div>
<div class="row"><span>Member ID</span><span>${escapeHtml(member?.memberCode ?? '—')}</span></div>
<div class="row"><span>Date</span><span>${escapeHtml(when)}</span></div>
<div class="row"><span>Payment</span><span>${escapeHtml(paymentMethod ?? 'Cash')}</span></div>
<div class="row total"><span>Amount</span><span>Rs ${Math.max(0, Number(amount) || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
<hr />
<p class="footer">${footer}</p>
</body></html>`;
}

export function printFeeReceipt(options) {
  const html = buildFeeReceiptHtml(options);
  const win = window.open('', '_blank', 'width=400,height=640');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
