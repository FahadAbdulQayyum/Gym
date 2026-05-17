import { useCallback, useEffect, useState } from 'react';
import './StudentsDashboard.css';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const emptyForm = () => ({
  name: '',
  age: '',
  entryDate: todayInputValue(),
});

export default function StudentsDashboard() {
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const api = window.gymApp?.students;

  const loadStudents = useCallback(async () => {
    if (!api?.list) {
      setLoading(false);
      setError('Local database is only available in the desktop app.');
      return;
    }

    try {
      setError('');
      const list = await api.list();
      setStudents(list);
      setSelectedId((current) => {
        if (current && list.some((s) => s.id === current)) return current;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err.message ?? 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const selected = students.find((s) => s.id === selectedId) ?? null;

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  function startEdit(student) {
    setEditingId(student.id);
    setSelectedId(student.id);
    setForm({
      name: student.name,
      age: String(student.age),
      entryDate: student.entryDate,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!api) return;

    setSaving(true);
    setError('');

    try {
      const payload = {
        name: form.name,
        age: form.age,
        entryDate: form.entryDate,
      };

      if (editingId) {
        await api.update(editingId, payload);
      } else {
        const created = await api.create(payload);
        setSelectedId(created.id);
      }

      resetForm();
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to save student');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(student) {
    if (!api) return;
    const confirmed = window.confirm(`Remove ${student.name} and all attendance records?`);
    if (!confirmed) return;

    setError('');
    try {
      await api.delete(student.id);
      if (editingId === student.id) resetForm();
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to delete student');
    }
  }

  async function handleCheckIn() {
    if (!api || !selected) return;

    setSaving(true);
    setError('');
    try {
      await api.checkIn(selected.id);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to record attendance');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAttendance(attendanceId) {
    if (!api || !selected) return;

    setError('');
    try {
      await api.deleteAttendance(selected.id, attendanceId);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to remove attendance');
    }
  }

  return (
    <div className="students-dashboard">
      {error && (
        <div className="students-error" role="alert">
          {error}
        </div>
      )}

      <div className="students-layout">
        <section className="card students-form-card">
          <div className="card-header">
            <h2>{editingId ? 'Edit student' : 'Register student'}</h2>
            {editingId && (
              <button type="button" className="btn-ghost" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <label>
              Full name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ali Khan"
                required
              />
            </label>
            <div className="form-row">
              <label>
                Age
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.age}
                  onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                  placeholder="25"
                  required
                />
              </label>
              <label>
                Entry date
                <input
                  type="date"
                  value={form.entryDate}
                  onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                  required
                />
              </label>
            </div>
            <button type="submit" className="btn-primary" disabled={saving || !api}>
              {saving ? 'Saving…' : editingId ? 'Update student' : 'Add student'}
            </button>
          </form>
        </section>

        <section className="card students-list-card">
          <div className="card-header">
            <h2>Students</h2>
            <span className="card-count">
              {students.length} {students.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          {loading ? (
            <p className="empty">Loading from local database…</p>
          ) : students.length === 0 ? (
            <p className="empty">No students yet. Register the first member above.</p>
          ) : (
            <ul className="students-list">
              {students.map((student) => (
                <li
                  key={student.id}
                  className={student.id === selectedId ? 'is-selected' : ''}
                >
                  <button
                    type="button"
                    className="students-list__select"
                    onClick={() => setSelectedId(student.id)}
                  >
                    <strong>{student.name}</strong>
                    <span>
                      Age {student.age} · Joined {formatDate(student.entryDate)}
                    </span>
                    <span className="students-list__meta">
                      {student.attendance.length} check-in
                      {student.attendance.length === 1 ? '' : 's'}
                    </span>
                  </button>
                  <div className="students-list__actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => startEdit(student)}
                      aria-label={`Edit ${student.name}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => handleDelete(student)}
                      aria-label={`Delete ${student.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card students-detail-card">
          <div className="card-header">
            <h2>Attendance</h2>
            {selected && (
              <button
                type="button"
                className="btn-primary btn-primary--compact"
                onClick={handleCheckIn}
                disabled={saving || !api}
              >
                Check in now
              </button>
            )}
          </div>

          {!selected ? (
            <p className="empty">Select a student to view attendance history.</p>
          ) : (
            <>
              <div className="student-profile">
                <h3>{selected.name}</h3>
                <p>
                  Age <strong>{selected.age}</strong> · Entry{' '}
                  <strong>{formatDate(selected.entryDate)}</strong>
                </p>
                <p className="student-profile__timestamps">
                  Created {formatTimestamp(selected.createdAt)}
                  {selected.updatedAt !== selected.createdAt && (
                    <> · Updated {formatTimestamp(selected.updatedAt)}</>
                  )}
                </p>
              </div>

              {selected.attendance.length === 0 ? (
                <p className="empty">No check-ins yet. Use “Check in now” to record attendance.</p>
              ) : (
                <ul className="attendance-list">
                  {selected.attendance.map((record, index) => (
                    <li key={record.id}>
                      <div className="attendance-list__index">#{selected.attendance.length - index}</div>
                      <div className="attendance-list__body">
                        <strong>{formatTimestamp(record.checkedInAt)}</strong>
                        <span>ID {record.id.slice(0, 8)}…</span>
                      </div>
                      <button
                        type="button"
                        className="remove"
                        onClick={() => handleDeleteAttendance(record.id)}
                        aria-label="Remove attendance record"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
