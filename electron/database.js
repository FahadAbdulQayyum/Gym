const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

class StudentDatabase {
  constructor() {
    this.filePath = null;
    this.data = { students: [] };
  }

  async init() {
    this.filePath = path.join(app.getPath('userData'), 'gym-students.json');
    await this.load();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        students: Array.isArray(parsed.students) ? parsed.students : [],
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save();
        return;
      }
      throw error;
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  listStudents() {
    return [...this.data.students]
      .map((student) => this.normalizeStudent(student))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getStudent(id) {
    const student = this.data.students.find((s) => s.id === id);
    return student ? this.normalizeStudent(student) : null;
  }

  validateStudentInput({ name, age, entryDate }) {
    const trimmedName = String(name ?? '').trim();
    if (!trimmedName) {
      throw new Error('Name is required');
    }

    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      throw new Error('Age must be between 1 and 120');
    }

    const date = new Date(entryDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Entry date is invalid');
    }

    return {
      name: trimmedName,
      age: Math.floor(parsedAge),
      entryDate: date.toISOString().slice(0, 10),
    };
  }

  async createStudent(payload) {
    const fields = this.validateStudentInput(payload);
    const timestamp = nowIso();

    const student = {
      id: newId(),
      ...fields,
      createdAt: timestamp,
      updatedAt: timestamp,
      fingerprint: null,
      attendance: [],
    };

    this.data.students.push(student);
    await this.save();
    return student;
  }

  async updateStudent(id, payload) {
    const student = this.getStudent(id);
    if (!student) {
      throw new Error('Student not found');
    }

    const fields = this.validateStudentInput(payload);
    Object.assign(student, fields, { updatedAt: nowIso() });
    await this.save();
    return student;
  }

  async deleteStudent(id) {
    const index = this.data.students.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error('Student not found');
    }

    const [removed] = this.data.students.splice(index, 1);
    await this.save();
    return removed;
  }

  normalizeStudent(student) {
    if (!student.fingerprint) {
      student.fingerprint = null;
    }
    for (const record of student.attendance) {
      if (!record.method) {
        record.method = 'manual';
      }
    }
    return student;
  }

  async checkIn(studentId, method = 'manual') {
    const student = this.getStudent(studentId);
    if (!student) {
      throw new Error('Student not found');
    }

    const record = {
      id: newId(),
      checkedInAt: nowIso(),
      method: method === 'fingerprint' ? 'fingerprint' : 'manual',
    };

    student.attendance.unshift(record);
    student.updatedAt = nowIso();
    await this.save();
    return { student: this.normalizeStudent(student), record };
  }

  findStudentByCredentialId(credentialId) {
    const match = this.data.students.find(
      (student) => student.fingerprint?.credentialId === credentialId
    );
    return match ? this.normalizeStudent(match) : null;
  }

  async registerFingerprint(studentId, credentialId) {
    const student = this.getStudent(studentId);
    if (!student) {
      throw new Error('Student not found');
    }

    const trimmed = String(credentialId ?? '').trim();
    if (!trimmed) {
      throw new Error('Invalid fingerprint credential');
    }

    const duplicate = this.data.students.find(
      (entry) => entry.id !== studentId && entry.fingerprint?.credentialId === trimmed
    );
    if (duplicate) {
      throw new Error(`This fingerprint is already enrolled for ${duplicate.name}`);
    }

    student.fingerprint = {
      credentialId: trimmed,
      enrolledAt: nowIso(),
    };
    student.updatedAt = nowIso();
    await this.save();
    return this.normalizeStudent(student);
  }

  async clearFingerprint(studentId) {
    const student = this.getStudent(studentId);
    if (!student) {
      throw new Error('Student not found');
    }

    student.fingerprint = null;
    student.updatedAt = nowIso();
    await this.save();
    return this.normalizeStudent(student);
  }

  async checkInByFingerprint(credentialId) {
    const student = this.findStudentByCredentialId(credentialId);
    if (!student) {
      throw new Error('Fingerprint is not enrolled for any student');
    }

    return this.checkIn(student.id, 'fingerprint');
  }

  async deleteAttendance(studentId, attendanceId) {
    const student = this.getStudent(studentId);
    if (!student) {
      throw new Error('Student not found');
    }

    const index = student.attendance.findIndex((a) => a.id === attendanceId);
    if (index === -1) {
      throw new Error('Attendance record not found');
    }

    const [removed] = student.attendance.splice(index, 1);
    student.updatedAt = nowIso();
    await this.save();
    return { student, record: removed };
  }
}

let db;

async function getDatabase() {
  if (!db) {
    db = new StudentDatabase();
    await db.init();
  }
  return db;
}

function registerDatabaseHandlers(ipcMain) {
  ipcMain.handle('db:students:list', async () => {
    const database = await getDatabase();
    return database.listStudents();
  });

  ipcMain.handle('db:students:create', async (_event, payload) => {
    const database = await getDatabase();
    return database.createStudent(payload);
  });

  ipcMain.handle('db:students:update', async (_event, { id, ...payload }) => {
    const database = await getDatabase();
    return database.updateStudent(id, payload);
  });

  ipcMain.handle('db:students:delete', async (_event, { id }) => {
    const database = await getDatabase();
    return database.deleteStudent(id);
  });

  ipcMain.handle('db:attendance:check-in', async (_event, { studentId, method }) => {
    const database = await getDatabase();
    return database.checkIn(studentId, method);
  });

  ipcMain.handle('db:fingerprint:register', async (_event, { studentId, credentialId }) => {
    const database = await getDatabase();
    return database.registerFingerprint(studentId, credentialId);
  });

  ipcMain.handle('db:fingerprint:clear', async (_event, { studentId }) => {
    const database = await getDatabase();
    return database.clearFingerprint(studentId);
  });

  ipcMain.handle('db:attendance:check-in-fingerprint', async (_event, { credentialId }) => {
    const database = await getDatabase();
    return database.checkInByFingerprint(credentialId);
  });

  ipcMain.handle('db:attendance:delete', async (_event, { studentId, attendanceId }) => {
    const database = await getDatabase();
    return database.deleteAttendance(studentId, attendanceId);
  });
}

module.exports = { registerDatabaseHandlers, getDatabase };
