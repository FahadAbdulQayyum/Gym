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

const CHECK_IN_METHODS = new Set(['manual', 'fingerprint', 'pin', 'memberId']);

function generateMemberCode(students) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!students.some((s) => s.memberCode === code)) {
      return code;
    }
  }
  throw new Error('Could not generate a unique member ID');
}

function resolveOrphanOwnerId(users = []) {
  if (users.length === 1) {
    return users[0].id;
  }

  const admin = users.find((user) => user.username === 'admin');
  if (admin?.id) {
    return admin.id;
  }

  const sorted = [...users].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return sorted[0]?.id ?? null;
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256');
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  };
}

function verifyPin(pin, saltBase64, hashBase64) {
  const salt = Buffer.from(saltBase64, 'base64');
  const expected = Buffer.from(hashBase64, 'base64');
  const actual = crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function validatePin(pin) {
  const digits = String(pin ?? '').trim();
  if (!/^\d{4,6}$/.test(digits)) {
    throw new Error('PIN must be 4–6 digits');
  }
  return digits;
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
      await this.ensureMemberCodes();
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save();
        return;
      }
      throw error;
    }
  }

  async save({ skipSync = false } = {}) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    if (!skipSync) {
      persistHook?.();
    }
  }

  studentsForOwner(ownerId) {
    return this.data.students.filter((student) => student.ownerId === ownerId);
  }

  async migrateOrphanStudents(users = []) {
    const orphans = this.data.students.filter((student) => !student.ownerId);
    if (orphans.length === 0) {
      return;
    }

    const defaultOwnerId = resolveOrphanOwnerId(users);
    if (!defaultOwnerId) {
      return;
    }

    for (const student of orphans) {
      student.ownerId = defaultOwnerId;
    }
    await this.save({ skipSync: true });
  }

  exportStudentsForSync(ownerId) {
    return this.studentsForOwner(ownerId).map((student) => structuredClone(student));
  }

  applySyncMerge(incomingStudents = [], incomingDeletions = [], ownerId) {
    let changed = false;

    for (const remote of incomingStudents) {
      if (!remote?.id || remote.deletedAt) {
        continue;
      }

      if (remote.ownerId && remote.ownerId !== ownerId) {
        continue;
      }

      const remoteCopy = structuredClone(remote);
      remoteCopy.ownerId = ownerId;

      const local = this.getStudentRecord(remote.id, ownerId);
      if (!local) {
        this.data.students.push(remoteCopy);
        changed = true;
        continue;
      }

      if (new Date(remoteCopy.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
        Object.assign(local, remoteCopy);
        changed = true;
      }
    }

    for (const deletion of incomingDeletions) {
      const id = deletion?.id;
      const deletedAt = deletion?.deletedAt;
      if (!id || !deletedAt) {
        continue;
      }

      const index = this.data.students.findIndex(
        (student) => student.id === id && student.ownerId === ownerId
      );
      if (index === -1) {
        continue;
      }

      const local = this.data.students[index];
      if (new Date(deletedAt).getTime() >= new Date(local.updatedAt).getTime()) {
        this.data.students.splice(index, 1);
        changed = true;
      }
    }

    if (changed) {
      return this.save({ skipSync: true }).then(() => true);
    }

    return Promise.resolve(false);
  }

  async ensureMemberCodes() {
    let changed = false;
    const byOwner = new Map();
    for (const student of this.data.students) {
      if (!student.ownerId) {
        continue;
      }
      if (!byOwner.has(student.ownerId)) {
        byOwner.set(student.ownerId, []);
      }
      byOwner.get(student.ownerId).push(student);
    }

    for (const owned of byOwner.values()) {
      for (const student of owned) {
        if (!student.memberCode) {
          student.memberCode = generateMemberCode(owned);
          changed = true;
        }
      }
    }
    if (changed) {
      await this.save();
    }
  }

  listStudents(ownerId) {
    return this.studentsForOwner(ownerId)
      .map((student) => this.normalizeStudent(student))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getStudentRecord(id, ownerId) {
    return this.data.students.find((s) => s.id === id && s.ownerId === ownerId) ?? null;
  }

  getStudent(id, ownerId) {
    const student = this.getStudentRecord(id, ownerId);
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

  async createStudent(payload, ownerId) {
    const fields = this.validateStudentInput(payload);
    const timestamp = nowIso();
    const owned = this.studentsForOwner(ownerId);

    const student = {
      id: newId(),
      ownerId,
      ...fields,
      memberCode: generateMemberCode(owned),
      createdAt: timestamp,
      updatedAt: timestamp,
      fingerprint: null,
      pinHash: null,
      pinSalt: null,
      attendance: [],
    };

    this.data.students.push(student);
    await this.save();
    return this.normalizeStudent(student);
  }

  async updateStudent(id, payload, ownerId) {
    const student = this.getStudentRecord(id, ownerId);
    if (!student) {
      throw new Error('Student not found');
    }

    const fields = this.validateStudentInput(payload);
    Object.assign(student, fields, { updatedAt: nowIso() });
    await this.save();
    return this.normalizeStudent(student);
  }

  async deleteStudent(id, ownerId) {
    const index = this.data.students.findIndex((s) => s.id === id && s.ownerId === ownerId);
    if (index === -1) {
      throw new Error('Student not found');
    }

    const [removed] = this.data.students.splice(index, 1);
    deleteHook?.(id);
    await this.save();
    return removed;
  }

  normalizeStudent(student) {
    if (!student.fingerprint) {
      student.fingerprint = null;
    }
    if (!student.memberCode && student.ownerId) {
      student.memberCode = generateMemberCode(this.studentsForOwner(student.ownerId));
    }
    for (const record of student.attendance) {
      if (!record.method) {
        record.method = 'manual';
      }
    }
    const { pinHash, pinSalt, ...safe } = student;
    return {
      ...safe,
      hasPin: Boolean(pinHash && pinSalt),
    };
  }

  findStudentByMemberCode(memberCode, ownerId) {
    const code = String(memberCode ?? '').trim();
    const match = this.studentsForOwner(ownerId).find((s) => s.memberCode === code);
    return match ? this.normalizeStudent(match) : null;
  }

  findStudentByPin(pin, ownerId) {
    const digits = validatePin(pin);
    const match = this.studentsForOwner(ownerId).find(
      (s) => s.pinHash && s.pinSalt && verifyPin(digits, s.pinSalt, s.pinHash)
    );
    return match ? this.normalizeStudent(match) : null;
  }

  async setPin(studentId, pin, ownerId) {
    const student = this.getStudentRecord(studentId, ownerId);
    if (!student) {
      throw new Error('Student not found');
    }

    const digits = validatePin(pin);
    const duplicate = this.studentsForOwner(ownerId).find(
      (entry) => entry.id !== studentId && entry.pinHash && verifyPin(digits, entry.pinSalt, entry.pinHash)
    );
    if (duplicate) {
      throw new Error(`This PIN is already used by ${duplicate.name}`);
    }

    const { salt, hash } = hashPin(digits);
    student.pinSalt = salt;
    student.pinHash = hash;
    student.updatedAt = nowIso();
    await this.save();
    return this.normalizeStudent(student);
  }

  async clearPin(studentId, ownerId) {
    const student = this.getStudentRecord(studentId, ownerId);
    if (!student) {
      throw new Error('Student not found');
    }

    student.pinHash = null;
    student.pinSalt = null;
    student.updatedAt = nowIso();
    await this.save();
    return this.normalizeStudent(student);
  }

  async checkIn(studentId, method = 'manual', ownerId) {
    const student = this.getStudentRecord(studentId, ownerId);
    if (!student) {
      throw new Error('Student not found');
    }

    const normalizedMethod = CHECK_IN_METHODS.has(method) ? method : 'manual';

    const record = {
      id: newId(),
      checkedInAt: nowIso(),
      method: normalizedMethod,
    };

    student.attendance.unshift(record);
    student.updatedAt = nowIso();
    await this.save();
    return { student: this.normalizeStudent(student), record };
  }

  findStudentByCredentialId(credentialId, ownerId) {
    const match = this.studentsForOwner(ownerId).find(
      (student) => student.fingerprint?.credentialId === credentialId
    );
    return match ? this.normalizeStudent(match) : null;
  }

  async registerFingerprint(studentId, credentialId, userHandle, ownerId) {
    const student = this.getStudentRecord(studentId, ownerId);
    if (!student) {
      throw new Error('Student not found');
    }

    const trimmed = String(credentialId ?? '').trim();
    if (!trimmed) {
      throw new Error('Invalid fingerprint credential');
    }

    const duplicate = this.studentsForOwner(ownerId).find(
      (entry) => entry.id !== studentId && entry.fingerprint?.credentialId === trimmed
    );
    if (duplicate) {
      throw new Error(`This fingerprint is already enrolled for ${duplicate.name}`);
    }

    const fingerprint = {
      credentialId: trimmed,
      enrolledAt: nowIso(),
    };
    const handle = String(userHandle ?? '').trim();
    if (handle) {
      fingerprint.userHandle = handle;
    }

    student.fingerprint = fingerprint;
    student.updatedAt = nowIso();
    await this.save();
    return this.normalizeStudent(student);
  }

  async clearFingerprint(studentId, ownerId) {
    const student = this.getStudentRecord(studentId, ownerId);
    if (!student) {
      throw new Error('Student not found');
    }

    student.fingerprint = null;
    student.updatedAt = nowIso();
    await this.save();
    return this.normalizeStudent(student);
  }

  async checkInByFingerprint(credentialId, ownerId) {
    const student = this.findStudentByCredentialId(credentialId, ownerId);
    if (!student) {
      throw new Error('Fingerprint is not enrolled for any student');
    }

    return this.checkIn(student.id, 'fingerprint', ownerId);
  }

  async checkInByMemberCode(memberCode, ownerId) {
    const student = this.findStudentByMemberCode(memberCode, ownerId);
    if (!student) {
      throw new Error('Member ID not found');
    }
    return this.checkIn(student.id, 'memberId', ownerId);
  }

  async checkInByPin(pin, ownerId) {
    const student = this.findStudentByPin(pin, ownerId);
    if (!student) {
      throw new Error('PIN not recognized');
    }
    return this.checkIn(student.id, 'pin', ownerId);
  }

  async deleteAttendance(studentId, attendanceId, ownerId) {
    const student = this.getStudentRecord(studentId, ownerId);
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

let persistHook = null;
let deleteHook = null;

function setDatabaseHooks({ onPersist, onDelete } = {}) {
  persistHook = onPersist ?? null;
  deleteHook = onDelete ?? null;
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
  const { requireAuthSession } = require('./auth');

  function guarded(handler) {
    return async (...args) => {
      const session = await requireAuthSession();
      return handler(session, ...args);
    };
  }

  ipcMain.handle(
    'db:students:list',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listStudents(session.id);
    })
  );

  ipcMain.handle(
    'db:students:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createStudent(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:students:update',
    guarded(async (session, _event, { id, ...payload }) => {
      const database = await getDatabase();
      return database.updateStudent(id, payload, session.id);
    })
  );

  ipcMain.handle(
    'db:students:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteStudent(id, session.id);
    })
  );

  ipcMain.handle(
    'db:attendance:check-in',
    guarded(async (session, _event, { studentId, method }) => {
      const database = await getDatabase();
      return database.checkIn(studentId, method, session.id);
    })
  );

  ipcMain.handle(
    'db:fingerprint:register',
    guarded(async (session, _event, { studentId, credentialId, userHandle }) => {
      const database = await getDatabase();
      return database.registerFingerprint(studentId, credentialId, userHandle, session.id);
    })
  );

  ipcMain.handle(
    'db:fingerprint:clear',
    guarded(async (session, _event, { studentId }) => {
      const database = await getDatabase();
      return database.clearFingerprint(studentId, session.id);
    })
  );

  ipcMain.handle(
    'db:attendance:check-in-fingerprint',
    guarded(async (session, _event, { credentialId }) => {
      const database = await getDatabase();
      return database.checkInByFingerprint(credentialId, session.id);
    })
  );

  ipcMain.handle(
    'db:attendance:delete',
    guarded(async (session, _event, { studentId, attendanceId }) => {
      const database = await getDatabase();
      return database.deleteAttendance(studentId, attendanceId, session.id);
    })
  );

  ipcMain.handle(
    'db:pin:set',
    guarded(async (session, _event, { studentId, pin }) => {
      const database = await getDatabase();
      return database.setPin(studentId, pin, session.id);
    })
  );

  ipcMain.handle(
    'db:pin:clear',
    guarded(async (session, _event, { studentId }) => {
      const database = await getDatabase();
      return database.clearPin(studentId, session.id);
    })
  );

  ipcMain.handle(
    'db:attendance:check-in-member-code',
    guarded(async (session, _event, { memberCode }) => {
      const database = await getDatabase();
      return database.checkInByMemberCode(memberCode, session.id);
    })
  );

  ipcMain.handle(
    'db:attendance:check-in-pin',
    guarded(async (session, _event, { pin }) => {
      const database = await getDatabase();
      return database.checkInByPin(pin, session.id);
    })
  );
}

module.exports = { registerDatabaseHandlers, getDatabase, setDatabaseHooks };
