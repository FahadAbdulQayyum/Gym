import { useCallback, useEffect, useMemo, useState } from 'react';
import { categoryMatchesQuery, formatRsPlain, itemMatchesQuery } from './inventoryShared';
import './Inventory.css';

function emptyItemForm() {
  return {
    name: '',
    sku: '',
    categoryId: '',
    minStock: '0',
    unitCost: '0',
    unitPrice: '0',
    stockQty: '0',
    active: 'yes',
  };
}

function itemToForm(item) {
  return {
    name: item.name ?? '',
    sku: item.sku ?? '',
    categoryId: item.categoryId ?? '',
    minStock: String(item.minStock ?? 0),
    unitCost: String(item.unitCost ?? 0),
    unitPrice: String(item.unitPrice ?? 0),
    stockQty: String(item.stockQty ?? 0),
    active: item.active !== false ? 'yes' : 'no',
  };
}

export default function Inventory() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [itemSearch, setItemSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [form, setForm] = useState(emptyItemForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const categoriesApi = window.gymApp?.categories;
  const productsApi = window.gymApp?.products;
  const editing = selectedItemId != null;

  const categoryById = useMemo(() => {
    const map = new Map();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  const loadData = useCallback(async () => {
    if (!productsApi?.list) {
      setLoading(false);
      setMessageType('error');
      setMessage('Local database is only available in the desktop app.');
      return;
    }
    try {
      setMessage('');
      const [cats, products] = await Promise.all([
        categoriesApi?.list?.() ?? [],
        productsApi.list({ includeInactive: true }),
      ]);
      setCategories(cats);
      setItems(products);
      setSelectedItemId((current) =>
        current && products.some((p) => p.id === current) ? current : null
      );
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [categoriesApi, productsApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        loadData();
      }
    });
  }, [loadData]);

  useEffect(() => {
    const item = items.find((p) => p.id === selectedItemId);
    if (!item) {
      setForm(emptyItemForm());
      return;
    }
    setForm(itemToForm(item));
  }, [selectedItemId, items]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => categoryMatchesQuery(c, categorySearch)),
    [categories, categorySearch]
  );

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (!showInactive && item.active === false) return false;
      if (selectedCategoryId && item.categoryId !== selectedCategoryId) return false;
      const catName = item.categoryId ? categoryById.get(item.categoryId) : '';
      return itemMatchesQuery(item, itemSearch, catName);
    });
  }, [items, showInactive, selectedCategoryId, itemSearch, categoryById]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setMessage('');
  }

  async function handleAddCategory(event) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name || !categoriesApi?.create) return;

    setSaving(true);
    setMessage('');
    try {
      await categoriesApi.create({ name });
      setNewCategory('');
      setMessageType('success');
      setMessage(`Category “${name}” added.`);
      await loadData();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to add category');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(cat) {
    if (!categoriesApi?.delete) return;
    const ok = window.confirm(`Delete category “${cat.name}”?`);
    if (!ok) return;

    setSaving(true);
    try {
      await categoriesApi.delete(cat.id);
      if (selectedCategoryId === cat.id) setSelectedCategoryId(null);
      setMessageType('success');
      setMessage(`Deleted category “${cat.name}”.`);
      await loadData();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to delete category');
    } finally {
      setSaving(false);
    }
  }

  function handleSelectItem(item) {
    setSelectedItemId(item.id);
    setMessage('');
  }

  function handleClearForm() {
    setSelectedItemId(null);
    setForm(emptyItemForm());
    setMessage('');
  }

  async function handleSubmitItem(event) {
    event.preventDefault();
    if (!productsApi?.create && !productsApi?.update) return;

    const name = form.name.trim();
    if (!name) {
      setMessageType('error');
      setMessage('Item name is required.');
      return;
    }

    const payload = {
      name,
      sku: form.sku.trim(),
      categoryId: form.categoryId || null,
      minStock: Number(form.minStock),
      unitCost: Number(form.unitCost),
      unitPrice: Number(form.unitPrice),
      stockQty: Number(form.stockQty),
      active: form.active === 'yes',
    };

    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        await productsApi.update(selectedItemId, payload);
        setMessageType('success');
        setMessage(`Updated “${name}”.`);
      } else {
        const created = await productsApi.create(payload);
        setMessageType('success');
        setMessage(`Created “${created.name}”.`);
        setSelectedItemId(created.id);
      }
      await loadData();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item) {
    if (!productsApi?.update) return;
    setSaving(true);
    try {
      await productsApi.update(item.id, {
        name: item.name,
        sku: item.sku,
        categoryId: item.categoryId,
        minStock: item.minStock,
        unitCost: item.unitCost,
        unitPrice: item.unitPrice,
        stockQty: item.stockQty,
        active: item.active === false,
      });
      setMessageType('success');
      setMessage(item.active === false ? `Activated “${item.name}”.` : `Deactivated “${item.name}”.`);
      await loadData();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to update item');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(item) {
    if (!productsApi?.delete) return;
    const ok = window.confirm(`Delete item “${item.name}”?`);
    if (!ok) return;

    setSaving(true);
    try {
      await productsApi.delete(item.id);
      if (selectedItemId === item.id) handleClearForm();
      setMessageType('success');
      setMessage(`Deleted “${item.name}”.`);
      await loadData();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to delete item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inventory">
      {message && (
        <p
          className={`inventory__message inventory__message--${messageType}`}
          role={messageType === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}

      <div className="inventory__top">
        <section className="inventory__categories card">
          <h2 className="inventory__panel-title">Categories</h2>
          <input
            type="search"
            className="inventory__input"
            placeholder="Search categories…"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
          />
          <form className="inventory__add-category" onSubmit={handleAddCategory}>
            <input
              type="text"
              className="inventory__input"
              placeholder="New category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button type="submit" className="inventory__add-btn" disabled={saving}>
              Add
            </button>
          </form>
          <ul className="inventory__category-list">
            <li>
              <button
                type="button"
                className={`inventory__category-btn${selectedCategoryId === null ? ' is-active' : ''}`}
                onClick={() => setSelectedCategoryId(null)}
              >
                All categories
              </button>
            </li>
            {visibleCategories.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  className={`inventory__category-btn${selectedCategoryId === cat.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  {cat.name}
                </button>
                <button
                  type="button"
                  className="inventory__category-delete"
                  onClick={() => handleDeleteCategory(cat)}
                  disabled={saving}
                  aria-label={`Delete ${cat.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="inventory__items card">
          <header className="inventory__items-header">
            <h2 className="inventory__panel-title">Items</h2>
            <label className="inventory__checkbox">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>
          </header>
          <input
            type="search"
            className="inventory__input"
            placeholder="Search items…"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
          />
          <ul className="inventory__item-list">
            {loading && <li className="inventory__empty">Loading…</li>}
            {!loading && visibleItems.length === 0 && (
              <li className="inventory__empty">No items.</li>
            )}
            {!loading &&
              visibleItems.map((item) => {
                const isSelected = item.id === selectedItemId;
                const catName = item.categoryId ? categoryById.get(item.categoryId) : '—';
                const lowStock = (item.stockQty ?? 0) <= (item.minStock ?? 0);
                return (
                  <li key={item.id}>
                    <article
                      className={`inventory__item-card${isSelected ? ' is-selected' : ''}${item.active === false ? ' is-inactive' : ''}`}
                    >
                      <button
                        type="button"
                        className="inventory__item-main"
                        onClick={() => handleSelectItem(item)}
                      >
                        <strong>{item.name}</strong>
                        <span>
                          {item.sku ? `${item.sku} · ` : ''}
                          {catName} · Stock {item.stockQty}
                          {lowStock && item.active !== false ? ' · Low' : ''}
                        </span>
                        <span>
                          {formatRsPlain(item.unitPrice)}
                          {item.unitCost > 0 ? ` (cost ${formatRsPlain(item.unitCost)})` : ''}
                        </span>
                        {item.active === false && (
                          <span className="inventory__inactive-tag">Inactive</span>
                        )}
                      </button>
                      <div className="inventory__item-actions">
                        <button type="button" onClick={() => handleSelectItem(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          disabled={saving}
                        >
                          {item.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                        <button
                          type="button"
                          className="inventory__item-delete"
                          onClick={() => handleDeleteItem(item)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
          </ul>
        </section>
      </div>

      <section className="inventory__form card">
        <form onSubmit={handleSubmitItem}>
          <h2 className="inventory__panel-title">{editing ? 'Edit Item' : 'Add Item'}</h2>

          <div className="inventory__form-grid">
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                required
              />
            </label>
            <label>
              SKU
              <input type="text" value={form.sku} onChange={(e) => setField('sku', e.target.value)} />
            </label>
            <label>
              Category
              <select
                value={form.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
              >
                <option value="">-- select --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Min Stock
              <input
                type="number"
                min={0}
                step={1}
                value={form.minStock}
                onChange={(e) => setField('minStock', e.target.value)}
              />
            </label>
            <label>
              Stock Qty
              <input
                type="number"
                min={0}
                step={1}
                value={form.stockQty}
                onChange={(e) => setField('stockQty', e.target.value)}
              />
            </label>
            <label>
              Unit Cost (Rs)
              <input
                type="number"
                min={0}
                step={1}
                value={form.unitCost}
                onChange={(e) => setField('unitCost', e.target.value)}
              />
            </label>
            <label>
              Unit Price (Rs)
              <input
                type="number"
                min={0}
                step={1}
                value={form.unitPrice}
                onChange={(e) => setField('unitPrice', e.target.value)}
              />
            </label>
            <label>
              Active
              <select value={form.active} onChange={(e) => setField('active', e.target.value)}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>

          <footer className="inventory__form-footer">
            <button
              type="button"
              className="inventory__btn-clear"
              onClick={handleClearForm}
              disabled={saving}
            >
              Clear
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
