const Database = require('better-sqlite3');
const path = require('path');

const bcrypt = require('bcryptjs');
const DB_PATH = path.join(__dirname, '..', 'data', 'finance.db');

function initDB() {
  const fs = require('fs');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#818cf8',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      icon TEXT DEFAULT '💰',
      color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name, type)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank', 'cash', 'credit_card', 'savings', 'investment')),
      currency TEXT DEFAULT 'EUR',
      initial_balance REAL DEFAULT 0,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT '🏦',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
      amount REAL NOT NULL,
      description TEXT,
      category_id INTEGER,
      account_id INTEGER NOT NULL,
      to_account_id INTEGER,
      date DATE NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('monthly', 'weekly', 'yearly')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS savings_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      name TEXT DEFAULT 'Mi Plan de Ahorro',
      target_percentage REAL DEFAULT 20,
      goal_target REAL DEFAULT 0,
      target_account_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🎯',
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      target_date DATE,
      color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id INTEGER,
      account_id INTEGER,
      frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'weekly', 'yearly')),
      day_of_month INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      last_generated DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      is_completed INTEGER DEFAULT 0,
      due_date DATE,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      person TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      type TEXT NOT NULL CHECK(type IN ('owe', 'owed')),
      due_date DATE,
      notes TEXT,
      is_settled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Onboarding flag
    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      name TEXT DEFAULT 'iOS Shortcut',
      is_active INTEGER DEFAULT 1,
      last_used DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);

    CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
  `);

  // Migration: add is_onboarded to users
  const migDone = db.prepare("SELECT 1 FROM _migrations WHERE name = 'add_is_onboarded'").get();
  if (!migDone) {
    try {
      db.exec("ALTER TABLE users ADD COLUMN is_onboarded INTEGER DEFAULT 0");
    } catch(e) { /* column may already exist */ }
    // Mark existing users (with transactions or non-default accounts) as onboarded
    db.exec("UPDATE users SET is_onboarded = 1 WHERE id IN (SELECT DISTINCT user_id FROM transactions)");
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES ('add_is_onboarded')").run();
  }

  // Migration: add is_admin to users
  const migAdminDone = db.prepare("SELECT 1 FROM _migrations WHERE name = 'add_is_admin'").get();
  if (!migAdminDone) {
    try {
      db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0");
    } catch(e) { /* column may already exist */ }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES ('add_is_admin')").run();
  }

  // Ensure admin user exists
  const adminExists = db.prepare("SELECT id FROM users WHERE name = 'admin' OR email = 'admin@admin.com'").get();
  if (!adminExists) {
    const salt = bcrypt.genSaltSync(12);
    const hash = bcrypt.hashSync('Nick1bimba2!', salt);
    db.prepare("INSERT INTO users (name, email, password, avatar_color, is_onboarded, is_admin) VALUES (?, ?, ?, ?, ?, ?)").run(
      'admin', 'admin@admin.com', hash, '#ef4444', 1, 1
    );
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
    CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);
  `);

  return db;
}

// Seed default categories and accounts for a new user
function seedUserDefaults(db, userId) {
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)');
  const defaultCategories = [
    ['Salario', 'income', '💼', '#10b981'],
    ['Freelance', 'income', '💻', '#06b6d4'],
    ['Inversiones', 'income', '📈', '#8b5cf6'],
    ['Regalos', 'income', '🎁', '#f59e0b'],
    ['Otros ingresos', 'income', '💵', '#84cc16'],
    ['Alimentación', 'expense', '🛒', '#ef4444'],
    ['Transporte', 'expense', '🚗', '#f97316'],
    ['Vivienda', 'expense', '🏠', '#8b5cf6'],
    ['Servicios', 'expense', '💡', '#06b6d4'],
    ['Salud', 'expense', '🏥', '#ec4899'],
    ['Entretenimiento', 'expense', '🎬', '#a855f7'],
    ['Ropa', 'expense', '👕', '#14b8a6'],
    ['Educación', 'expense', '📚', '#3b82f6'],
    ['Restaurantes', 'expense', '🍽️', '#f43f5e'],
    ['Suscripciones', 'expense', '📱', '#6366f1'],
    ['Ahorro', 'expense', '🐷', '#10b981'],
    ['Otros gastos', 'expense', '📦', '#94a3b8'],
  ];
  const insertManyCats = db.transaction((cats) => {
    for (const c of cats) insertCat.run(userId, ...c);
  });
  insertManyCats(defaultCategories);

  db.prepare('INSERT INTO accounts (user_id, name, type, currency, initial_balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'Cuenta principal', 'bank', 'EUR', 0, '#6366f1', '🏦');
  db.prepare('INSERT INTO accounts (user_id, name, type, currency, initial_balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'Efectivo', 'cash', 'EUR', 0, '#10b981', '💵');
}

module.exports = { initDB, seedUserDefaults };
