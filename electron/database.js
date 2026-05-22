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
    this.data = {
      students: [],
      packages: [],
      products: [],
      sales: [],
      categories: [],
      trainers: [],
      expenseHeads: [],
      expenses: [],
      assetPurchases: [],
      assetHeads: [],
      zk50Config: null,
      zk50Scans: [],
    };
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
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        trainers: Array.isArray(parsed.trainers) ? parsed.trainers : [],
        expenseHeads: Array.isArray(parsed.expenseHeads) ? parsed.expenseHeads : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        assetPurchases: Array.isArray(parsed.assetPurchases) ? parsed.assetPurchases : [],
        assetHeads: Array.isArray(parsed.assetHeads) ? parsed.assetHeads : [],
        zk50Config: parsed.zk50Config ?? null,
        zk50Scans: Array.isArray(parsed.zk50Scans) ? parsed.zk50Scans : [],
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

  categoriesForOwner(ownerId) {
    return this.data.categories.filter((c) => c.ownerId === ownerId);
  }

  getCategoryRecord(id, ownerId) {
    return this.data.categories.find((c) => c.id === id && c.ownerId === ownerId) ?? null;
  }

  normalizeCategory(category) {
    return {
      id: category.id,
      name: category.name,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  async listCategories(ownerId) {
    return this.categoriesForOwner(ownerId)
      .map((c) => this.normalizeCategory(c))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createCategory(payload, ownerId) {
    const name = String(payload.name ?? '').trim();
    if (!name) {
      throw new Error('Category name is required');
    }

    const duplicate = this.categoriesForOwner(ownerId).find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      throw new Error('Category already exists');
    }

    const timestamp = nowIso();
    const category = {
      id: newId(),
      ownerId,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.data.categories.push(category);
    await this.save();
    return this.normalizeCategory(category);
  }

  async deleteCategory(id, ownerId) {
    const category = this.getCategoryRecord(id, ownerId);
    if (!category) {
      throw new Error('Category not found');
    }

    const inUse = this.productsForOwner(ownerId).some((p) => p.categoryId === id);
    if (inUse) {
      throw new Error('Cannot delete: items use this category');
    }

    const index = this.data.categories.findIndex((c) => c.id === id && c.ownerId === ownerId);
    this.data.categories.splice(index, 1);
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
      categoryId: product.categoryId ?? null,
      unitCost: product.unitCost ?? 0,
      unitPrice: product.unitPrice ?? 0,
      minStock: product.minStock ?? 0,
      stockQty: product.stockQty ?? 0,
      active: product.active !== false,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  validateProductInput(payload, ownerId) {
    const name = String(payload.name ?? '').trim();
    if (!name) {
      throw new Error('Product name is required');
    }

    const unitPrice = Number(payload.unitPrice ?? payload.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Unit price must be zero or greater');
    }

    const unitCost = Number(payload.unitCost ?? 0);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error('Unit cost must be zero or greater');
    }

    const minStock = Number(payload.minStock ?? 0);
    if (!Number.isFinite(minStock) || minStock < 0) {
      throw new Error('Min stock must be zero or greater');
    }

    const stockQty =
      payload.stockQty !== undefined || payload.stock !== undefined
        ? Number(payload.stockQty ?? payload.stock ?? 0)
        : undefined;
    if (stockQty !== undefined && (!Number.isFinite(stockQty) || stockQty < 0)) {
      throw new Error('Stock must be zero or greater');
    }

    const result = {
      name,
      sku: String(payload.sku ?? '').trim(),
      unit: String(payload.unit ?? 'pcs').trim() || 'pcs',
      unitCost: Math.round(unitCost),
      unitPrice: Math.round(unitPrice),
      minStock: Math.floor(minStock),
    };

    if (stockQty !== undefined) {
      result.stockQty = Math.floor(stockQty);
    }

    if (payload.categoryId !== undefined && payload.categoryId !== null && payload.categoryId !== '') {
      const categoryId = String(payload.categoryId).trim();
      if (categoryId && ownerId) {
        const cat = this.getCategoryRecord(categoryId, ownerId);
        if (!cat) {
          throw new Error('Category not found');
        }
        result.categoryId = categoryId;
      } else {
        result.categoryId = null;
      }
    }

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

  async listProducts(ownerId, { inStockOnly = false, includeInactive = false, categoryId } = {}) {
    let list = this.productsForOwner(ownerId);
    if (!includeInactive) {
      list = list.filter((p) => p.active !== false);
    }
    if (inStockOnly) {
      list = list.filter((p) => (p.stockQty ?? 0) > 0);
    }
    if (categoryId) {
      list = list.filter((p) => p.categoryId === categoryId);
    }
    return list
      .map((p) => this.normalizeProduct(p))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createProduct(payload, ownerId) {
    const fields = this.validateProductInput(payload, ownerId);
    const timestamp = nowIso();
    const active = fields.active !== undefined ? fields.active : true;

    const product = {
      id: newId(),
      ownerId,
      ...fields,
      stockQty: fields.stockQty ?? 0,
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

    const fields = this.validateProductInput(
      { ...product, ...payload, stockQty: payload.stockQty ?? payload.stock ?? product.stockQty },
      ownerId
    );
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

  async listSales(ownerId) {
    return this.salesForOwner(ownerId)
      .map((sale) => ({ ...sale }))
      .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }

  trainersForOwner(ownerId) {
    return this.data.trainers.filter((t) => t.ownerId === ownerId);
  }

  getTrainerRecord(id, ownerId) {
    return this.data.trainers.find((t) => t.id === id && t.ownerId === ownerId) ?? null;
  }

  normalizeTrainer(trainer) {
    return {
      id: trainer.id,
      fullName: trainer.fullName,
      phone: trainer.phone ?? '',
      email: trainer.email ?? '',
      monthlySalary: trainer.monthlySalary ?? 0,
      active: trainer.active !== false,
      createdAt: trainer.createdAt,
      updatedAt: trainer.updatedAt,
    };
  }

  validateTrainerInput(payload) {
    const fullName = String(payload.fullName ?? payload.name ?? '').trim();
    if (!fullName) throw new Error('Full name is required');

    const salary = Number(payload.monthlySalary ?? 0);
    if (!Number.isFinite(salary) || salary < 0) {
      throw new Error('Monthly salary must be zero or greater');
    }

    const result = {
      fullName,
      phone: String(payload.phone ?? '').trim(),
      email: String(payload.email ?? '').trim(),
      monthlySalary: Math.round(salary),
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

  async listTrainers(ownerId, { includeInactive = false } = {}) {
    let list = this.trainersForOwner(ownerId);
    if (!includeInactive) list = list.filter((t) => t.active !== false);
    return list
      .map((t) => this.normalizeTrainer(t))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));
  }

  async createTrainer(payload, ownerId) {
    const fields = this.validateTrainerInput(payload);
    const timestamp = nowIso();
    const trainer = {
      id: newId(),
      ownerId,
      ...fields,
      active: fields.active !== undefined ? fields.active : true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.data.trainers.push(trainer);
    await this.save();
    return this.normalizeTrainer(trainer);
  }

  async updateTrainer(id, payload, ownerId) {
    const trainer = this.getTrainerRecord(id, ownerId);
    if (!trainer) throw new Error('Trainer not found');
    const fields = this.validateTrainerInput({ ...trainer, ...payload });
    if (fields.active !== undefined) trainer.active = fields.active;
    Object.assign(trainer, fields, { updatedAt: nowIso() });
    await this.save();
    return this.normalizeTrainer(trainer);
  }

  async deleteTrainer(id, ownerId) {
    const index = this.data.trainers.findIndex((t) => t.id === id && t.ownerId === ownerId);
    if (index === -1) throw new Error('Trainer not found');
    this.data.trainers.splice(index, 1);
    await this.save();
    return { id };
  }

  expenseHeadsForOwner(ownerId) {
    return this.data.expenseHeads.filter((h) => h.ownerId === ownerId);
  }

  getExpenseHeadRecord(id, ownerId) {
    return this.data.expenseHeads.find((h) => h.id === id && h.ownerId === ownerId) ?? null;
  }

  async listExpenseHeads(ownerId) {
    return this.expenseHeadsForOwner(ownerId)
      .map((h) => ({ id: h.id, name: h.name, createdAt: h.createdAt }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createExpenseHead(payload, ownerId) {
    const name = String(payload.name ?? '').trim();
    if (!name) throw new Error('Head name is required');
    const dup = this.expenseHeadsForOwner(ownerId).find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    );
    if (dup) throw new Error('Head already exists');

    const head = {
      id: newId(),
      ownerId,
      name,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.data.expenseHeads.push(head);
    await this.save();
    return { id: head.id, name: head.name, createdAt: head.createdAt };
  }

  async updateExpenseHead(id, payload, ownerId) {
    const head = this.getExpenseHeadRecord(id, ownerId);
    if (!head) throw new Error('Head not found');
    const name = String(payload.name ?? '').trim();
    if (!name) throw new Error('Head name is required');
    head.name = name;
    head.updatedAt = nowIso();
    await this.save();
    return { id: head.id, name: head.name };
  }

  async deleteExpenseHead(id, ownerId) {
    const head = this.getExpenseHeadRecord(id, ownerId);
    if (!head) throw new Error('Head not found');
    const inUse = this.data.expenses.some((e) => e.headId === id && e.ownerId === ownerId);
    if (inUse) throw new Error('Cannot delete: expenses use this head');
    const index = this.data.expenseHeads.findIndex((h) => h.id === id && h.ownerId === ownerId);
    this.data.expenseHeads.splice(index, 1);
    await this.save();
    return { id };
  }

  expensesForOwner(ownerId) {
    return this.data.expenses.filter((e) => e.ownerId === ownerId);
  }

  async listExpenses(ownerId) {
    return this.expensesForOwner(ownerId)
      .map((e) => ({
        id: e.id,
        headId: e.headId,
        amount: e.amount,
        date: e.date,
        note: e.note ?? '',
        createdAt: e.createdAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async createExpense(payload, ownerId) {
    const headId = String(payload.headId ?? '').trim();
    if (!headId || !this.getExpenseHeadRecord(headId, ownerId)) {
      throw new Error('Expense head is required');
    }
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be zero or greater');
    const dateRaw = payload.date ?? nowIso().slice(0, 10);
    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) throw new Error('Date is invalid');

    const expense = {
      id: newId(),
      ownerId,
      headId,
      amount: Math.round(amount),
      date: date.toISOString().slice(0, 10),
      note: String(payload.note ?? '').trim(),
      createdAt: nowIso(),
    };
    this.data.expenses.push(expense);
    await this.save();
    return expense;
  }

  async deleteExpense(id, ownerId) {
    const index = this.data.expenses.findIndex((e) => e.id === id && e.ownerId === ownerId);
    if (index === -1) throw new Error('Expense not found');
    const [removed] = this.data.expenses.splice(index, 1);
    await this.save();
    return removed;
  }

  assetHeadsForOwner(ownerId) {
    return this.data.assetHeads.filter((h) => h.ownerId === ownerId);
  }

  getAssetHeadRecord(id, ownerId) {
    return this.data.assetHeads.find((h) => h.id === id && h.ownerId === ownerId) ?? null;
  }

  async listAssetHeads(ownerId) {
    return this.assetHeadsForOwner(ownerId)
      .map((h) => ({ id: h.id, name: h.name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async createAssetHead(payload, ownerId) {
    const name = String(payload.name ?? '').trim();
    if (!name) throw new Error('Head name is required');
    const dup = this.assetHeadsForOwner(ownerId).find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    );
    if (dup) throw new Error('Head already exists');
    const head = { id: newId(), ownerId, name, createdAt: nowIso(), updatedAt: nowIso() };
    this.data.assetHeads.push(head);
    await this.save();
    return { id: head.id, name: head.name };
  }

  async updateAssetHead(id, payload, ownerId) {
    const head = this.getAssetHeadRecord(id, ownerId);
    if (!head) throw new Error('Head not found');
    const name = String(payload.name ?? '').trim();
    if (!name) throw new Error('Head name is required');
    head.name = name;
    head.updatedAt = nowIso();
    await this.save();
    return { id: head.id, name: head.name };
  }

  async deleteAssetHead(id, ownerId) {
    const head = this.getAssetHeadRecord(id, ownerId);
    if (!head) throw new Error('Head not found');
    const inUse = this.data.assetPurchases.some((p) => p.headId === id && p.ownerId === ownerId);
    if (inUse) throw new Error('Cannot delete: purchases use this head');
    const index = this.data.assetHeads.findIndex((h) => h.id === id && h.ownerId === ownerId);
    this.data.assetHeads.splice(index, 1);
    await this.save();
    return { id };
  }

  assetPurchasesForOwner(ownerId) {
    return this.data.assetPurchases.filter((a) => a.ownerId === ownerId);
  }

  normalizeAssetPurchase(record) {
    const qty = Math.max(1, Math.floor(Number(record.qty) || 1));
    const unitCost = Math.round(Number(record.unitCost ?? record.amount) || 0);
    const total = record.total != null ? Math.round(record.total) : qty * unitCost;
    return {
      id: record.id,
      headId: record.headId ?? null,
      itemName: record.itemName ?? record.description ?? '',
      vendor: record.vendor ?? '',
      qty,
      unitCost,
      total,
      purchaseDate: record.purchaseDate ?? record.date ?? '',
      warrantyTill: record.warrantyTill ?? '',
      note: record.note ?? '',
      createdAt: record.createdAt,
    };
  }

  async listAssetPurchases(ownerId) {
    return this.assetPurchasesForOwner(ownerId)
      .map((a) => this.normalizeAssetPurchase(a))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }

  async createAssetPurchase(payload, ownerId) {
    const headId = String(payload.headId ?? '').trim();
    if (!headId || !this.getAssetHeadRecord(headId, ownerId)) {
      throw new Error('Asset head is required');
    }
    const itemName = String(payload.itemName ?? '').trim();
    if (!itemName) throw new Error('Item name is required');

    const qty = Math.max(1, Math.floor(Number(payload.qty) || 1));
    const unitCost = Number(payload.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error('Unit cost must be zero or greater');
    }

    const purchaseRaw = payload.purchaseDate ?? payload.date ?? nowIso().slice(0, 10);
    const purchaseDate = new Date(purchaseRaw);
    if (Number.isNaN(purchaseDate.getTime())) throw new Error('Purchase date is invalid');

    let warrantyTill = '';
    if (payload.warrantyTill) {
      const w = new Date(payload.warrantyTill);
      if (!Number.isNaN(w.getTime())) warrantyTill = w.toISOString().slice(0, 10);
    }

    const unitRounded = Math.round(unitCost);
    const record = {
      id: newId(),
      ownerId,
      headId,
      itemName,
      vendor: String(payload.vendor ?? '').trim(),
      qty,
      unitCost: unitRounded,
      total: qty * unitRounded,
      purchaseDate: purchaseDate.toISOString().slice(0, 10),
      warrantyTill,
      note: String(payload.note ?? '').trim(),
      createdAt: nowIso(),
    };
    this.data.assetPurchases.push(record);
    await this.save();
    return this.normalizeAssetPurchase(record);
  }

  async deleteAssetPurchase(id, ownerId) {
    const index = this.data.assetPurchases.findIndex((p) => p.id === id && p.ownerId === ownerId);
    if (index === -1) throw new Error('Purchase not found');
    const [removed] = this.data.assetPurchases.splice(index, 1);
    await this.save();
    return this.normalizeAssetPurchase(removed);
  }

  getZk50Config(ownerId) {
    const cfg = this.data.zk50Config;
    if (!cfg || cfg.ownerId !== ownerId) {
      return {
        mode: 'manual',
        ip: '192.168.10.21',
        port: 4370,
        connected: false,
        realtimeOn: false,
      };
    }
    return {
      mode: cfg.mode ?? 'manual',
      ip: cfg.ip ?? '192.168.10.21',
      port: cfg.port ?? 4370,
      connected: !!cfg.connected,
      realtimeOn: !!cfg.realtimeOn,
    };
  }

  async saveZk50Config(payload, ownerId) {
    this.data.zk50Config = {
      ownerId,
      mode: payload.mode === 'auto' ? 'auto' : 'manual',
      ip: String(payload.ip ?? '').trim() || '192.168.10.21',
      port: Math.max(1, Math.min(65535, Math.floor(Number(payload.port) || 4370))),
      connected: !!payload.connected,
      realtimeOn: !!payload.realtimeOn,
      updatedAt: nowIso(),
    };
    await this.save({ skipSync: true });
    return this.getZk50Config(ownerId);
  }

  async connectZk50(ownerId) {
    const cfg = this.getZk50Config(ownerId);
    const ip = String(cfg.ip ?? '').trim();
    if (!ip) throw new Error('Device IP is required');

    this.data.zk50Config = {
      ownerId,
      mode: cfg.mode,
      ip,
      port: cfg.port,
      connected: true,
      realtimeOn: true,
      updatedAt: nowIso(),
    };
    await this.save({ skipSync: true });
    return this.getZk50Config(ownerId);
  }

  async disconnectZk50(ownerId) {
    const cfg = this.getZk50Config(ownerId);
    this.data.zk50Config = {
      ownerId,
      mode: cfg.mode,
      ip: cfg.ip,
      port: cfg.port,
      connected: false,
      realtimeOn: false,
      updatedAt: nowIso(),
    };
    await this.save({ skipSync: true });
    return this.getZk50Config(ownerId);
  }

  zk50ScansForOwner(ownerId) {
    return (this.data.zk50Scans ?? []).filter((s) => s.ownerId === ownerId);
  }

  async listZk50Scans(ownerId, limit = 100) {
    return this.zk50ScansForOwner(ownerId)
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
      .slice(0, limit);
  }

  async addZk50Scan(payload, ownerId) {
    const scan = {
      id: newId(),
      ownerId,
      memberCode: payload.memberCode ?? null,
      name: payload.name ?? 'Unknown',
      allowed: payload.allowed !== false,
      scannedAt: nowIso(),
      method: 'zk50',
    };
    if (!Array.isArray(this.data.zk50Scans)) this.data.zk50Scans = [];
    this.data.zk50Scans.unshift(scan);
    if (this.data.zk50Scans.length > 500) {
      this.data.zk50Scans = this.data.zk50Scans.slice(0, 500);
    }
    await this.save({ skipSync: true });

    if (scan.allowed && payload.memberCode) {
      try {
        await this.checkInByMemberCode(payload.memberCode, ownerId);
      } catch {
        /* member not found — scan still logged */
      }
    }

    return scan;
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
    'db:categories:list',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listCategories(session.id);
    })
  );

  ipcMain.handle(
    'db:categories:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createCategory(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:categories:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteCategory(id, session.id);
    })
  );

  ipcMain.handle(
    'db:sales:list',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listSales(session.id);
    })
  );

  ipcMain.handle(
    'db:trainers:list',
    guarded(async (session, _event, options = {}) => {
      const database = await getDatabase();
      return database.listTrainers(session.id, options);
    })
  );

  ipcMain.handle(
    'db:trainers:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createTrainer(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:trainers:update',
    guarded(async (session, _event, { id, ...payload }) => {
      const database = await getDatabase();
      return database.updateTrainer(id, payload, session.id);
    })
  );

  ipcMain.handle(
    'db:trainers:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteTrainer(id, session.id);
    })
  );

  ipcMain.handle(
    'db:expense-heads:list',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listExpenseHeads(session.id);
    })
  );

  ipcMain.handle(
    'db:expense-heads:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createExpenseHead(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:expense-heads:update',
    guarded(async (session, _event, { id, ...payload }) => {
      const database = await getDatabase();
      return database.updateExpenseHead(id, payload, session.id);
    })
  );

  ipcMain.handle(
    'db:expense-heads:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteExpenseHead(id, session.id);
    })
  );

  ipcMain.handle(
    'db:expenses:list',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listExpenses(session.id);
    })
  );

  ipcMain.handle(
    'db:expenses:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createExpense(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:expenses:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteExpense(id, session.id);
    })
  );

  ipcMain.handle(
    'db:asset-heads:list',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listAssetHeads(session.id);
    })
  );

  ipcMain.handle(
    'db:asset-heads:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createAssetHead(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:asset-heads:update',
    guarded(async (session, _event, { id, ...payload }) => {
      const database = await getDatabase();
      return database.updateAssetHead(id, payload, session.id);
    })
  );

  ipcMain.handle(
    'db:asset-heads:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteAssetHead(id, session.id);
    })
  );

  ipcMain.handle(
    'db:assets:list',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listAssetPurchases(session.id);
    })
  );

  ipcMain.handle(
    'db:assets:create',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.createAssetPurchase(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:assets:delete',
    guarded(async (session, _event, { id }) => {
      const database = await getDatabase();
      return database.deleteAssetPurchase(id, session.id);
    })
  );

  ipcMain.handle(
    'db:zk50:get-config',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.getZk50Config(session.id);
    })
  );

  ipcMain.handle(
    'db:zk50:save-config',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      return database.saveZk50Config(payload, session.id);
    })
  );

  ipcMain.handle(
    'db:zk50:connect',
    guarded(async (session, _event, payload) => {
      const database = await getDatabase();
      await database.saveZk50Config(payload, session.id);
      return database.connectZk50(session.id);
    })
  );

  ipcMain.handle(
    'db:zk50:disconnect',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.disconnectZk50(session.id);
    })
  );

  ipcMain.handle(
    'db:zk50:list-scans',
    guarded(async (session) => {
      const database = await getDatabase();
      return database.listZk50Scans(session.id);
    })
  );

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
