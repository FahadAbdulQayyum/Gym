import { useCallback, useEffect, useMemo, useState } from 'react';
import { PAYMENT_METHODS, parseAmount } from './memberShared';
import {
  calcPosTotals,
  formatMoney,
  printSaleReceipt,
  productMatchesQuery,
} from './posShared';
import './POS.css';

function cartLineKey(productId) {
  return productId;
}

export default function POS() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const productsApi = window.gymApp?.products;
  const posApi = window.gymApp?.pos;

  const loadProducts = useCallback(async () => {
    if (!productsApi?.list) {
      setLoading(false);
      setError('Local database is only available in the desktop app.');
      return;
    }
    try {
      setError('');
      const list = await productsApi.list({ inStockOnly: true });
      setProducts(list);
    } catch (err) {
      setError(err.message ?? 'Failed to load products');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [productsApi]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        loadProducts();
      }
    });
  }, [loadProducts]);

  const visibleProducts = useMemo(
    () => products.filter((p) => productMatchesQuery(p, search)),
    [products, search]
  );

  const totals = useMemo(() => calcPosTotals(cart, discount, tax), [cart, discount, tax]);

  function addToCart(product) {
    setCart((current) => {
      const key = cartLineKey(product.id);
      const existing = current.find((line) => line.productId === key);
      if (existing) {
        const nextQty = existing.qty + 1;
        if (nextQty > product.stockQty) return current;
        return current.map((line) =>
          line.productId === key
            ? {
                ...line,
                qty: nextQty,
                lineTotal: line.unitPrice * nextQty,
              }
            : line
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit ?? 'pcs',
          unitPrice: product.unitPrice,
          qty: 1,
          lineTotal: product.unitPrice,
          maxQty: product.stockQty,
        },
      ];
    });
    setSuccess('');
  }

  function updateQty(productId, delta) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const nextQty = line.qty + delta;
          if (nextQty < 1) return null;
          if (nextQty > line.maxQty) return line;
          return { ...line, qty: nextQty, lineTotal: line.unitPrice * nextQty };
        })
        .filter(Boolean)
    );
  }

  function removeLine(productId) {
    setCart((current) => current.filter((line) => line.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    setDiscount('0');
    setTax('0');
    setPaidAmount('');
    setNote('');
    setSuccess('');
    setError('');
  }

  async function handleCompleteSale(event) {
    event.preventDefault();
    if (!posApi?.completeSale) {
      setError('Local database is only available in the desktop app.');
      return;
    }
    if (cart.length === 0) {
      setError('Add at least one item to the cart.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const sale = await posApi.completeSale({
        items: cart.map((line) => ({ productId: line.productId, name: line.name, qty: line.qty })),
        discount: parseAmount(discount),
        tax: parseAmount(tax),
        paymentMethod,
        paidAmount: paidAmount.trim() === '' ? undefined : parseAmount(paidAmount),
        note,
      });

      printSaleReceipt(sale);
      setSuccess(`Sale completed — ${formatMoney(sale.total)}`);
      clearCart();
      await loadProducts();
    } catch (err) {
      setError(err.message ?? 'Failed to complete sale');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pos">
      {error && (
        <p className="pos__message pos__message--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="pos__message pos__message--success" role="status">
          {success}
        </p>
      )}

      <div className="pos__layout">
        <aside className="pos__products card">
          <h2 className="pos__panel-title">Products</h2>
          <input
            type="search"
            className="pos__search-input"
            placeholder="Search by name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="pos__product-list">
            {loading && <li className="pos__empty">Loading…</li>}
            {!loading && visibleProducts.length === 0 && (
              <li className="pos__empty">No items in stock.</li>
            )}
            {!loading &&
              visibleProducts.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className="pos__product-btn"
                    onClick={() => addToCart(product)}
                  >
                    <strong>{product.name}</strong>
                    <span>
                      {product.sku ? `${product.sku} · ` : ''}
                      {formatMoney(product.unitPrice)} / {product.unit} · Stock {product.stockQty}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </aside>

        <section className="pos__cart card">
          <header className="pos__cart-header">
            <h2 className="pos__panel-title">Cart</h2>
            <button
              type="button"
              className="pos__clear-btn"
              onClick={clearCart}
              disabled={cart.length === 0 || saving}
            >
              Clear Cart
            </button>
          </header>

          <form className="pos__cart-form" onSubmit={handleCompleteSale}>
            <div className="pos__table-wrap">
              <table className="pos__table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>Line</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 && (
                    <tr>
                      <td colSpan={5} className="pos__empty">
                        No items.
                      </td>
                    </tr>
                  )}
                  {cart.map((line) => (
                    <tr key={line.productId}>
                      <td>{line.name}</td>
                      <td>{line.unit}</td>
                      <td>
                        <div className="pos__qty-controls">
                          <button
                            type="button"
                            className="pos__qty-btn"
                            onClick={() => updateQty(line.productId, -1)}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span>{line.qty}</span>
                          <button
                            type="button"
                            className="pos__qty-btn"
                            onClick={() => updateQty(line.productId, 1)}
                            disabled={line.qty >= line.maxQty}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>{formatMoney(line.lineTotal)}</td>
                      <td>
                        <button
                          type="button"
                          className="pos__remove-btn"
                          onClick={() => removeLine(line.productId)}
                          aria-label={`Remove ${line.name}`}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pos__summary">
              <div className="pos__summary-row">
                <span>Subtotal</span>
                <strong>{formatMoney(totals.subtotal)}</strong>
              </div>
              <label className="pos__summary-row pos__summary-input">
                <span>Discount</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
              <label className="pos__summary-row pos__summary-input">
                <span>Tax</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </label>
              <div className="pos__summary-row pos__summary-total">
                <span>Total</span>
                <strong>{formatMoney(totals.total)}</strong>
              </div>
            </div>

            <div className="pos__payment">
              <label>
                Payment Method
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Paid Amount
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Paid (leave blank = exact)"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </label>
              <label className="pos__note-field">
                Note
                <textarea
                  rows={2}
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>

            <footer className="pos__footer">
              <button type="submit" className="btn-primary" disabled={saving || cart.length === 0}>
                {saving ? 'Processing…' : 'Complete Sale & Print'}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </div>
  );
}
