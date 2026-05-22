import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney } from './reportsShared';
import { todayInputValue } from './memberShared';
import { exportAssetPurchasesCsv, filterAssetPurchases } from './assetsShared';
import './ModulePage.css';
import './Expenses.css';
import './PurchaseGymAssets.css';

function emptyForm() {
  return {
    headId: '',
    itemName: '',
    vendor: '',
    qty: '1',
    unitCost: '',
    purchaseDate: todayInputValue(),
    warrantyTill: '',
    note: '',
  };
}

export default function PurchaseGymAssets() {
  const [heads, setHeads] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [headSearch, setHeadSearch] = useState('');
  const [newHead, setNewHead] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [listFrom, setListFrom] = useState('');
  const [listTo, setListTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const headsApi = window.gymApp?.assetHeads;
  const assetsApi = window.gymApp?.assets;
  const headMap = useMemo(() => new Map(heads.map((h) => [h.id, h.name])), [heads]);

  const load = useCallback(async () => {
    if (!assetsApi?.list) {
      setLoading(false);
      return;
    }
    const [h, p] = await Promise.all([headsApi?.list?.() ?? [], assetsApi.list()]);
    setHeads(h);
    setPurchases(p);
    setForm((f) => ({ ...f, headId: f.headId || h[0]?.id || '' }));
    setLoading(false);
  }, [assetsApi, headsApi]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleHeads = heads.filter((h) =>
    h.name.toLowerCase().includes(headSearch.trim().toLowerCase())
  );

  const filtered = useMemo(
    () => filterAssetPurchases(purchases, { from: listFrom, to: listTo, search }),
    [purchases, listFrom, listTo, search]
  );

  const reportTotal = filtered.reduce((s, p) => s + (p.total ?? 0), 0);
  const reportByHead = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const name = headMap.get(p.headId) ?? 'Other';
      map.set(name, (map.get(name) ?? 0) + p.total);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered, headMap]);

  async function handleAddHead(event) {
    event.preventDefault();
    if (!newHead.trim() || !headsApi?.create) return;
    setSaving(true);
    try {
      await headsApi.create({ name: newHead.trim() });
      setNewHead('');
      await load();
      setMessageType('success');
      setMessage('Head added.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePurchase(event) {
    event.preventDefault();
    if (!assetsApi?.create) return;
    setSaving(true);
    try {
      await assetsApi.create({
        ...form,
        qty: Number(form.qty) || 1,
        unitCost: Number(form.unitCost) || 0,
      });
      setForm({ ...emptyForm(), headId: form.headId });
      await load();
      setMessageType('success');
      setMessage('Purchase saved.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page assets-page">
      {message && (
        <p className={`module-page__message module-page__message--${messageType}`}>{message}</p>
      )}

      <div className="assets-page__top">
        <section className="module-card card expenses-page__heads">
          <h2 className="module-card__title">Asset Heads</h2>
          <input
            type="search"
            className="module-input"
            placeholder="Search heads"
            value={headSearch}
            onChange={(e) => setHeadSearch(e.target.value)}
          />
          <ul className="expenses-page__head-list">
            {visibleHeads.map((h) => (
              <li key={h.id}>
                <span>{h.name}</span>
              </li>
            ))}
          </ul>
          <form className="expenses-page__add-head" onSubmit={handleAddHead}>
            <input
              className="module-input"
              placeholder="New head"
              value={newHead}
              onChange={(e) => setNewHead(e.target.value)}
            />
            <button type="submit" className="module-btn-gold" disabled={saving}>
              Add
            </button>
          </form>
        </section>

        <section className="module-card card assets-page__form">
          <h2 className="module-card__title">Add Purchase</h2>
          <form onSubmit={handleSavePurchase} className="assets-page__add-form">
            <label>
              Head
              <select
                value={form.headId}
                onChange={(e) => setForm({ ...form, headId: e.target.value })}
                required
              >
                <option value="">— select —</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Item Name
              <input
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                required
              />
            </label>
            <label>
              Vendor
              <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            </label>
            <label>
              Qty
              <input
                type="number"
                min={1}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
              />
            </label>
            <label>
              Unit Cost (Rs)
              <input
                type="number"
                min={0}
                value={form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                required
              />
            </label>
            <label>
              Purchase Date
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                required
              />
            </label>
            <label>
              Warranty till
              <input
                type="date"
                value={form.warrantyTill}
                onChange={(e) => setForm({ ...form, warrantyTill: e.target.value })}
              />
            </label>
            <label className="assets-page__note">
              Note
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <button type="submit" className="module-btn-gold" disabled={saving || !heads.length}>
              Save
            </button>
          </form>
        </section>
      </div>

      <section className="module-card card">
        <header className="expenses-page__list-header">
          <h2 className="module-card__title">Purchases</h2>
          <button
            type="button"
            className="module-btn-outline"
            onClick={() => exportAssetPurchasesCsv(filtered, headMap)}
          >
            Export CSV
          </button>
        </header>
        <div className="expenses-page__list-filters">
          <input type="date" className="module-input" value={listFrom} onChange={(e) => setListFrom(e.target.value)} />
          <span>to</span>
          <input type="date" className="module-input" value={listTo} onChange={(e) => setListTo(e.target.value)} />
          <input
            type="search"
            className="module-input"
            placeholder="Search item/vendor/note"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="module-table-wrap">
          <table className="module-table module-table--dark-head">
            <thead>
              <tr>
                <th>Date</th>
                <th>Head</th>
                <th>Item</th>
                <th>Vendor</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Total</th>
                <th>Warranty</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="module-table__empty">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="module-table__empty">
                    No purchases.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{p.purchaseDate}</td>
                    <td>{headMap.get(p.headId) ?? '—'}</td>
                    <td>{p.itemName}</td>
                    <td>{p.vendor || '—'}</td>
                    <td>{p.qty}</td>
                    <td>{p.unitCost}</td>
                    <td>{p.total}</td>
                    <td>{p.warrantyTill || '—'}</td>
                    <td>{p.note || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="module-card card expenses-page__report">
        <h2 className="module-card__title">Report (Total: {formatMoney(reportTotal)})</h2>
        {reportByHead.length === 0 ? (
          <p className="expenses-page__no-data">No data in range.</p>
        ) : (
          <ul className="expenses-page__report-list">
            {reportByHead.map(([name, amount]) => (
              <li key={name}>
                <span>{name}</span>
                <span>{formatMoney(amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
