import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportExpensesCsv, formatMoney, inDateRange } from './reportsShared';
import { todayInputValue } from './memberShared';
import './ModulePage.css';
import './Expenses.css';

export default function Expenses() {
  const [heads, setHeads] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [headSearch, setHeadSearch] = useState('');
  const [newHead, setNewHead] = useState('');
  const [renameHead, setRenameHead] = useState('');
  const [selectedHeadId, setSelectedHeadId] = useState('');
  const [form, setForm] = useState({ headId: '', amount: '', date: todayInputValue(), note: '' });
  const [listFrom, setListFrom] = useState('');
  const [listTo, setListTo] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const headsApi = window.gymApp?.expenseHeads;
  const expensesApi = window.gymApp?.expenses;

  const headMap = useMemo(() => new Map(heads.map((h) => [h.id, h.name])), [heads]);

  const load = useCallback(async () => {
    if (!expensesApi?.list) {
      setLoading(false);
      return;
    }
    const [h, e] = await Promise.all([headsApi?.list?.() ?? [], expensesApi.list()]);
    setHeads(h);
    setExpenses(e);
    setForm((f) => ({ ...f, headId: f.headId || h[0]?.id || '' }));
    setLoading(false);
  }, [expensesApi, headsApi]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleHeads = heads.filter((h) =>
    h.name.toLowerCase().includes(headSearch.trim().toLowerCase())
  );

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!inDateRange(e.date, listFrom, listTo)) return false;
      const q = noteSearch.trim().toLowerCase();
      if (q && !(e.note ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, listFrom, listTo, noteSearch]);

  const reportTotal = filteredExpenses.reduce((s, e) => s + (e.amount ?? 0), 0);

  const reportByHead = useMemo(() => {
    const map = new Map();
    for (const e of filteredExpenses) {
      const name = headMap.get(e.headId) ?? 'Other';
      map.set(name, (map.get(name) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses, headMap]);

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

  async function handleRenameHead() {
    if (!selectedHeadId || !renameHead.trim() || !headsApi?.update) return;
    setSaving(true);
    try {
      await headsApi.update(selectedHeadId, { name: renameHead.trim() });
      setRenameHead('');
      await load();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteHead(id) {
    if (!headsApi?.delete || !window.confirm('Delete this head?')) return;
    try {
      await headsApi.delete(id);
      await load();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed');
    }
  }

  async function handleSaveExpense(event) {
    event.preventDefault();
    if (!form.headId || !expensesApi?.create) return;
    setSaving(true);
    try {
      await expensesApi.create(form);
      setForm({ headId: form.headId, amount: '', date: todayInputValue(), note: '' });
      await load();
      setMessageType('success');
      setMessage('Expense saved.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page expenses-page">
      {message && <p className={`module-page__message module-page__message--${messageType}`}>{message}</p>}

      <div className="expenses-page__top">
        <section className="module-card card expenses-page__heads">
          <h2 className="module-card__title">Expense Heads</h2>
          <input type="search" className="module-input" placeholder="Search heads…" value={headSearch} onChange={(e) => setHeadSearch(e.target.value)} />
          <ul className="expenses-page__head-list">
            {visibleHeads.map((h) => (
              <li key={h.id}>
                <span>{h.name}</span>
                <button type="button" onClick={() => { setSelectedHeadId(h.id); setRenameHead(h.name); }}>
                  Rename
                </button>
                <button type="button" className="expenses-page__del" onClick={() => handleDeleteHead(h.id)}>
                  Del
                </button>
              </li>
            ))}
          </ul>
          {selectedHeadId && (
            <div className="expenses-page__rename">
              <input className="module-input" value={renameHead} onChange={(e) => setRenameHead(e.target.value)} />
              <button type="button" className="module-btn-outline" onClick={handleRenameHead}>
                Save name
              </button>
            </div>
          )}
          <form className="expenses-page__add-head" onSubmit={handleAddHead}>
            <input className="module-input" placeholder="New head" value={newHead} onChange={(e) => setNewHead(e.target.value)} />
            <button type="submit" className="module-btn-gold" disabled={saving}>
              Add
            </button>
          </form>
        </section>

        <section className="module-card card expenses-page__add">
          <h2 className="module-card__title">Add Expense</h2>
          <form onSubmit={handleSaveExpense} className="expenses-page__add-form">
            <label>
              Head
              <select value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })} required>
                <option value="">-- select --</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount (Rs)
              <input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </label>
            <label>
              Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </label>
            <label className="expenses-page__note">
              Note
              <textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <button type="submit" className="module-btn-gold" disabled={saving || !heads.length}>
              Save
            </button>
          </form>
        </section>
      </div>

      <section className="module-card card">
        <header className="expenses-page__list-header">
          <h2 className="module-card__title">Expenses List</h2>
          <button type="button" className="module-btn-outline" onClick={() => exportExpensesCsv(filteredExpenses, headMap)}>
            Export CSV
          </button>
        </header>
        <div className="expenses-page__list-filters">
          <input type="date" className="module-input" value={listFrom} onChange={(e) => setListFrom(e.target.value)} />
          <span>to</span>
          <input type="date" className="module-input" value={listTo} onChange={(e) => setListTo(e.target.value)} />
          <input type="search" className="module-input" placeholder="Search note" value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} />
        </div>
        <div className="module-table-wrap">
          <table className="module-table module-table--dark-head">
            <thead>
              <tr>
                <th>Date</th>
                <th>Head</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="module-table__empty">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={4} className="module-table__empty">
                    No expenses.
                  </td>
                </tr>
              )}
              {!loading &&
                filteredExpenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{headMap.get(e.headId) ?? '—'}</td>
                    <td>{e.amount}</td>
                    <td>{e.note || '—'}</td>
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
