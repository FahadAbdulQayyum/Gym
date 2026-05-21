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

const SEED_PACKAGES = [
  { id: 'silver', label: 'silver', days: 30, price: 3500, active: true },
  { id: 'gold', label: 'gold', days: 30, price: 5000, active: true },
  { id: 'platinum', label: 'platinum', days: 30, price: 7000, active: true },
];

function slugFromPackageName(name) {
  const base = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'package';
}

function generatePackageId(label, owned) {
  const base = slugFromPackageName(label);
  if (!owned.some((p) => p.id === base)) {
    return base;
  }
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!owned.some((p) => p.id === candidate)) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique package id');
}

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
    this.data = { students: [], packages: [], products: [], sales: [] };
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
        packages: Array.isArray(parsed.packages) ? parsed.packages : [],
        products: Array.isArray(parsed.products) ? parsed.products : [],
        sales: Array.isArray(parsed.sales) ? parsed.sales : [],
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

  packagesForOwner(ownerId) {
    return this.data.packages.filter((pkg) => pkg.ownerId === ownerId);
  }

  normalizePackage(pkg) {
    return {
      id: pkg.id,
      label: pkg.label,
      days: pkg.days,
      price: pkg.price,
      active: pkg.active !== false,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    };
  }

  async ensureDefaultPackages(ownerId) {
    const owned = this.packagesForOwner(ownerId);
    if (owned.length > 0) {
      return;
    }

    const timestamp = nowIso();
    for (const seed of SEED_PACKAGES) {
      this.data.packages.push({
        id: seed.id,
        ownerId,
        label: seed.label,
        days: seed.days,
        price: seed.price,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    await this.save();
  }

  getPackageRecord(id, ownerId) {
    return this.data.packages.find((p) => p.id === id && p.ownerId === ownerId) ?? null;
  }

  validatePackageInput(payload, { isCreate, ownerId, existingId } = {}) {
    const label = String(payload.label ?? payload.name ?? '').trim();
    if (!label) {
      throw new Error('Package name is required');
    }

    const days = Number(payload.days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      throw new Error('Duration must be between 1 and 3650 days');
    }

    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error('Price must be zero or greater');
    }

    const result = {
      label,
      days: Math.floor(days),
      price: Math.round(price),
    };

    if (payload.active !== undefined) {
      const activeRaw = payload.active;
      result.active =
        activeRaw === true ||
        activeRaw === 'true' ||
        activeRaw === 'yes' ||
        activeRaw === 'Yes' ||
        activeRaw === 1 ||
        activeRaw === '1';
    }

    if (isCreate) {
      const owned = this.packagesForOwner(ownerId);
      result.id = generatePackageId(label, owned);
    } else if (existingId) {
      const owned = this.packagesForOwner(ownerId);
      const slug = slugFromPackageName(label);
      const conflict = owned.find((p) => p.id !== existingId && p.label.toLowerCase() === label.toLowerCase());
      if (conflict) {
        throw new Error('A package with this name already exists');
      }
      if (slug !== existingId && owned.some((p) => p.id === slug)) {
        throw new Error('Package id conflict; choose a different name');
      }
    }

    return result;
  }

  async listPackages(ownerId, { includeInactive = false } = {}) {
    await this.ensureDefaultPackages(ownerId);
    let list = this.packagesForOwner(ownerId);
    if (!includeInactive) {
      list = list.filter((p) => p.active !== false);
    }
    return list
      .map((pkg) => this.normalizePackage(pkg))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }

  async createPackage(payload, ownerId) {
    const fields = this.validatePackageInput(payload, { isCreate: true, ownerId });
    const timestamp = nowIso();
    const active = fields.active !== undefined ? fields.active : true;

    const pkg = {
      id: fields.id,
      ownerId,
      label: fields.label,
      days: fields.days,
      price: fields.price,
      active,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.data.packages.push(pkg);
    await this.save();
    return this.normalizePackage(pkg);
  }

  async updatePackage(id, payload, ownerId) {
    const pkg = this.getPackageRecord(id, ownerId);
    if (!pkg) {
      throw new Error('Package not found');
    }

    const fields = this.validatePackageInput(payload, {
      isCreate: false,
      ownerId,
      existingId: id,
    });

    if (fields.active !== undefined) {
      pkg.active = fields.active;
    }
    pkg.label = fields.label;
    pkg.days = fields.days;
    pkg.price = fields.price;
    pkg.updatedAt = nowIso();

    await this.save();
    return this.normalizePackage(pkg);
  }

  async deletePackage(id, ownerId) {
    const pkg = this.getPackageRecord(id, ownerId);
    if (!pkg) {
      throw new Error('Package not found');
    }

    const inUse = this.studentsForOwner(ownerId).some((s) => s.packageId === id);
    if (inUse) {
      throw new Error('Cannot delete: members are assigned to this package. Deactivate instead.');
    }

    const index = this.data.packages.findIndex((p) => p.id === id && p.ownerId === ownerId);
    this.data.packages.splice(index, 1);
    await this.save();
    return { id };
  }

  productsForOwner(ownerId) {
    return this.data.products.filter((p) => p.ownerId === ownerId);
  }

  salesForOwner(ownerId) {
    return this.data.sales.filter((s) => s.ownerId === ownerId);
  }

  getProductRecord(id, ownerId) {
    return this.data.products.find((p) => p.id === id && p.ownerId === ownerId) ?? null;
  }

  normalizeProduct(product) {
    return {
      id: product.id,
      name: product.name,
      sku: product.sku ?? '',
      unit: product.unit ?? 'pcs',
      unitPrice: product.unitPrice ?? 0,
      stockQty: product.stockQty ?? 0,
      active: product.active !== false,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  validateProductInput(payload) {
    const name = String(payload.name ?? '').trim();
    if (!name) {
      throw new Error('Product name is required');
    }

    const unitPrice = Number(payload.unitPrice ?? payload.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Unit price must be zero or greater');
    }

    const stockQty = Number(payload.stockQty ?? payload.stock ?? 0);
    if (!Number.isFinite(stockQty) || stockQty < 0) {
      throw new Error('Stock must be zero or greater');
    }

    const result = {
      name,
      sku: String(payload.sku ?? '').trim(),
      unit: String(payload.unit ?? 'pcs').trim() || 'pcs',
      unitPrice: Math.round(unitPrice),
      stockQty: Math.floor(stockQty),
    };

    if (payload.active !== undefined) {
      const activeRaw = payload.active;
      result.active =
        activeRaw === true ||
        activeRaw === 'true' ||
        activeRaw === 'yes' ||
        activeRaw === 'Yes' ||
        activeRaw === 1 ||
        activeRaw === '1';
    }

    return result;
  }

  async listProducts(ownerId, { inStockOnly = false, includeInactive = false } = {}) {
    let list = this.productsForOwner(ownerId);
    if (!includeInactive) {
      list = list.filter((p) => p.active !== false);
    }
    if (inStockOnly) {
      list = list.filter((p) => (p.stockQty ?? 0) > 0);
    }
    return list
      .map((p) => this.normalizeProduct(p))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createProduct(payload, ownerId) {
    const fields = this.validateProductInput(payload);
    const timestamp = nowIso();
    const active = fields.active !== undefined ? fields.active : true;

    const product = {
      id: newId(),
      ownerId,
      ...fields,
      active,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.data.products.push(product);
    await this.save();
    return this.normalizeProduct(product);
  }

  async updateProduct(id, payload, ownerId) {
    const product = this.getProductRecord(id, ownerId);
    if (!product) {
      throw new Error('Product not found');
    }

    const fields = this.validateProductInput(payload);
    if (fields.active !== undefined) {
      product.active = fields.active;
    }
    Object.assign(product, fields, { updatedAt: nowIso() });
    await this.save();
    return this.normalizeProduct(product);
  }

  async deleteProduct(id, ownerId) {
    const index = this.data.products.findIndex((p) => p.id === id && p.ownerId === ownerId);
    if (index === -1) {
      throw new Error('Product not found');
    }
    this.data.products.splice(index, 1);
    await this.save();
    return { id };
  }

  async completePosSale(payload, ownerId) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      throw new Error('Cart is empty');
    }

    const discount = Math.max(0, Math.round(Number(payload.discount) || 0));
    const tax = Math.max(0, Math.round(Number(payload.tax) || 0));
    const paymentMethod = String(payload.paymentMethod ?? 'Cash').trim() || 'Cash';
    const note = String(payload.note ?? '').trim();

    const saleItems = [];
    let subtotal = 0;

    for (const line of items) {
      const productId = line.productId;
      const qty = Math.floor(Number(line.qty));
      if (!productId || !Number.isFinite(qty) || qty < 1) {
        throw new Error('Invalid cart item');
      }

      const product = this.getProductRecord(productId, ownerId);
      if (!product || product.active === false) {
        throw new Error(`Product not available: ${line.name ?? productId}`);
      }
      if ((product.stockQty ?? 0) < qty) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      const unitPrice = product.unitPrice ?? 0;
      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;

      saleItems.push({
        productId: product.id,
        name: product.name,
        sku: product.sku ?? '',
        unit: product.unit ?? 'pcs',
        unitPrice,
        qty,
        lineTotal,
      });

      product.stockQty = (product.stockQty ?? 0) - qty;
      product.updatedAt = nowIso();
    }

    const total = Math.max(0, subtotal - discount + tax);
    let paidAmount = payload.paidAmount;
    if (paidAmount === '' || paidAmount === null || paidAmount === undefined) {
      paidAmount = total;
    } else {
      paidAmount = Math.round(Number(paidAmount));
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        throw new Error('Paid amount is invalid');
      }
    }

    const sale = {
      id: newId(),
      ownerId,
      items: saleItems,
      subtotal,
      discount,
      tax,
      total,
      paymentMethod,
      paidAmount,
      changeAmount: Math.max(0, paidAmount - total),
      note,
      soldAt: nowIso(),
    };

    if (!Array.isArray(this.data.sales)) {
      this.data.sales = [];
    }
    this.data.sales.push(sale);
    await this.save();
    return sale;
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

  validateStudentInput(payload) {
    const trimmedName = String(payload.name ?? '').trim();
    if (!trimmedName) {
      throw new Error('Name is required');
    }

    const entryRaw = payload.entryDate ?? payload.registrationDate;
    const date = new Date(entryRaw);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Entry date is invalid');
    }

    const result = {
      name: trimmedName,
      entryDate: date.toISOString().slice(0, 10),
    };

    if (payload.age !== undefined && payload.age !== null && payload.age !== '') {
      const parsedAge = Number(payload.age);
      if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        throw new Error('Age must be between 1 and 120');
      }
      result.age = Math.floor(parsedAge);
    }

    const optionalStrings = [
      'phone',
      'gender',
      'address',
      'notes',
      'status',
      'packageId',
      'packageLabel',
      'packageStartDate',
      'admissionPaymentMethod',
      'lastPaymentMethod',
      'trainerId',
    ];
    for (const key of optionalStrings) {
      if (payload[key] !== undefined && payload[key] !== null) {
        result[key] = String(payload[key]).trim();
      }
    }

    const optionalNumbers = [
      'packageDays',
      'packagePrice',
      'discount',
      'admissionFee',
      'trainerFee',
      'trainerCommissionPercent',
      'trainerCommissionAmount',
      'totalAmount',
    ];
    for (const key of optionalNumbers) {
      if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
        continue;
      }
      const n = Number(payload[key]);
      if (Number.isFinite(n) && n >= 0) {
        result[key] = n;
      }
    }

    if (payload.packageStartDate) {
      const start = new Date(payload.packageStartDate);
      if (!Number.isNaN(start.getTime())) {
        result.packageStartDate = start.toISOString().slice(0, 10);
      }
    }

    if (payload.registrationDate) {
      const reg = new Date(payload.registrationDate);
      if (!Number.isNaN(reg.getTime())) {
        result.registrationDate = reg.toISOString().slice(0, 10);
      }
    }

    return result;
  }

  async createStudent(payload, ownerId) {
    const fields = this.validateStudentInput(payload);
    const timestamp = nowIso();
    const owned = this.studentsForOwner(ownerId);

    const student = {
      id: newId(),
      ownerId,
      ...fields,
      status: fields.status ?? 'active',
      memberCode: generateMemberCode(owned),
      createdAt: timestamp,
      updatedAt: timestamp,
      fingerprint: null,
      pinHash: null,
      pinSalt: null,
      attendance: [],
      feePayments: [],
    };

    if (fields.admissionPaymentMethod) {
      student.lastPaymentMethod = fields.admissionPaymentMethod;
    }

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

  async collectFeeAndRenew(studentId, payload, ownerId) {
    const student = this.getStudentRecord(studentId, ownerId);
    if (!student) {
      throw new Error('Student not found');
    }

    const startRaw = payload.packageStartDate;
    if (!startRaw) {
      throw new Error('Start date is required');
    }
    const startDate = new Date(startRaw);
    if (Number.isNaN(startDate.getTime())) {
      throw new Error('Start date is invalid');
    }

    const fields = this.validateStudentInput({
      ...payload,
      name: payload.name ?? student.name,
      entryDate: payload.entryDate ?? student.entryDate ?? student.registrationDate,
    });

    const paymentMethod = String(payload.paymentMethod ?? 'Cash').trim() || 'Cash';
    const totalAmount =
      fields.totalAmount ??
      Math.max(0, (fields.packagePrice ?? 0) - (fields.discount ?? 0));

    if (!Array.isArray(student.feePayments)) {
      student.feePayments = [];
    }

    student.feePayments.push({
      id: newId(),
      amount: totalAmount,
      discount: fields.discount ?? 0,
      packagePrice: fields.packagePrice ?? student.packagePrice,
      packageId: fields.packageId ?? student.packageId,
      packageLabel: fields.packageLabel ?? student.packageLabel,
      paymentMethod,
      startDate: fields.packageStartDate,
      collectedAt: nowIso(),
    });

    Object.assign(student, fields, {
      totalAmount,
      lastPaymentMethod: paymentMethod,
      status: 'active',
      updatedAt: nowIso(),
    });

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
      status: safe.status ?? 'active',
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
    'db:products:list',
    guarded(async (session, _event, options = {}) => {
      const database = await getDatabase();
      return database.listProducts(session.id, options);
    })
  );

  ipcMain.handle(
    'db:products:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createProduct(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:products:update',
    guarded(async (session, _event, { id, ...payload }) => {
      const database = await getDatabase();
      return database.updateProduct(id, payload, session.id);
    })
  );

  ipcMain.handle(
    'db:products:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteProduct(id, session.id);
    })
  );

  ipcMain.handle(
    'db:pos:complete-sale',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.completePosSale(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:packages:list',
    guarded(async (session, _event, { includeInactive } = {}) => {
      const database = await getDatabase();
      return database.listPackages(session.id, { includeInactive: !!includeInactive });
    })
  );

  ipcMain.handle(
    'db:packages:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createPackage(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:packages:update',
    guarded(async (session, _event, { id, ...payload }) => {
      const database = await getDatabase();
      return database.updatePackage(id, payload, session.id);
    })
  );

  ipcMain.handle(
    'db:packages:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deletePackage(id, session.id);
    })
  );

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
    'db:fees:collect-renew',
    guarded(async (session, _event, { studentId, ...payload }) => {
      const database = await getDatabase();
      return database.collectFeeAndRenew(studentId, payload, session.id);
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
