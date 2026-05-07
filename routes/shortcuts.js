const express = require('express');
const crypto = require('crypto');
const router = express.Router();

module.exports = function (db) {

  // ─── TOKEN AUTH MIDDLEWARE ─────────────────────────
  // iOS Shortcuts sends: Authorization: Bearer <token>
  function tokenAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido. Usa: Authorization: Bearer <tu_token>' });
    }
    const token = authHeader.slice(7);
    const row = db.prepare(`
      SELECT t.user_id, t.id as token_id, u.name as user_name 
      FROM api_tokens t 
      JOIN users u ON t.user_id = u.id 
      WHERE t.token = ? AND t.is_active = 1
    `).get(token);

    if (!row) {
      return res.status(401).json({ error: 'Token inválido o desactivado' });
    }

    // Update last_used
    db.prepare('UPDATE api_tokens SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(row.token_id);

    req.userId = row.user_id;
    req.userName = row.user_name;
    next();
  }

  router.use(tokenAuth);

  // ─── GET USER INFO ─────────────────────────────────
  router.get('/me', (req, res) => {
    res.json({ success: true, user: req.userName, user_id: req.userId });
  });

  // ─── GET CATEGORIES ────────────────────────────────
  // Used by Shortcuts to show category menu
  router.get('/categories', (req, res) => {
    try {
      const { type } = req.query; // 'expense' or 'income'
      let rows;
      if (type) {
        rows = db.prepare('SELECT id, name, icon, type FROM categories WHERE user_id = ? AND type = ? ORDER BY name')
          .all(req.userId, type);
      } else {
        rows = db.prepare('SELECT id, name, icon, type FROM categories WHERE user_id = ? ORDER BY type, name')
          .all(req.userId);
      }
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET ACCOUNTS ──────────────────────────────────
  // Used by Shortcuts to show account menu
  router.get('/accounts', (req, res) => {
    try {
      const accounts = db.prepare('SELECT id, name, icon, type, currency FROM accounts WHERE user_id = ? ORDER BY name')
        .all(req.userId);
      res.json(accounts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET RECURRING EXPENSES ────────────────────────
  // ─── QUICK ADD TRANSACTION ─────────────────────────
  // Main endpoint for iOS Shortcuts
  router.post('/transaction', (req, res) => {
    try {
      const { type, amount, description, category_id, category_name, account_id, account_name, date, notes } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Monto inválido' });
      }
      if (!type || !['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'Tipo debe ser "income" o "expense"' });
      }

      // Resolve category by name if no ID provided
      let catId = category_id || null;
      if (!catId && category_name) {
        const cat = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?')
          .get(req.userId, category_name, type);
        if (cat) catId = cat.id;
      }

      // Resolve account by name if no ID provided
      let accId = account_id || null;
      if (!accId && account_name) {
        const acc = db.prepare('SELECT id FROM accounts WHERE user_id = ? AND name = ?')
          .get(req.userId, account_name);
        if (acc) accId = acc.id;
      }

      // Fallback: use first account
      if (!accId) {
        const firstAcc = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(req.userId);
        if (firstAcc) accId = firstAcc.id;
        else return res.status(400).json({ error: 'No tienes cuentas configuradas' });
      }

      const txDate = date || new Date().toISOString().split('T')[0];

      const result = db.prepare(`
        INSERT INTO transactions (user_id, type, amount, description, category_id, account_id, date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.userId, type, amount, description || null, catId, accId, txDate, notes || null);

      res.json({
        success: true,
        id: result.lastInsertRowid,
        message: `${type === 'expense' ? 'Gasto' : 'Ingreso'} de ${amount} registrado`
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET BALANCE SUMMARY ───────────────────────────
  // Quick summary for Shortcuts notifications
  router.get('/balance', (req, res) => {
    try {
      const now = new Date();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();
      const startDate = `${y}-${m}-01`;
      const endDate = `${y}-${m}-31`;

      const income = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions
        WHERE user_id = ? AND type = 'income' AND date BETWEEN ? AND ?
      `).get(req.userId, startDate, endDate);

      const expenses = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions
        WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ?
      `).get(req.userId, startDate, endDate);

      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(req.userId);
      const accountBalances = accounts.map(acc => {
        const inc = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id=? AND account_id=? AND type='income'`).get(req.userId, acc.id);
        const exp = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id=? AND account_id=? AND type='expense'`).get(req.userId, acc.id);
        const tIn = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id=? AND to_account_id=? AND type='transfer'`).get(req.userId, acc.id);
        const tOut = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id=? AND account_id=? AND type='transfer'`).get(req.userId, acc.id);
        return { name: acc.name, icon: acc.icon, balance: acc.initial_balance + inc.t - exp.t + tIn.t - tOut.t, currency: acc.currency };
      });

      res.json({
        month: `${y}-${m}`,
        income: income.total,
        expenses: expenses.total,
        balance: income.total - expenses.total,
        accounts: accountBalances
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
