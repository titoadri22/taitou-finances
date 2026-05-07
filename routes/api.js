const express = require('express');
const router = express.Router();

module.exports = function (db) {

  // Auth middleware - all API routes require login
  router.use((req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    req.userId = req.session.userId;
    next();
  });

  // ─── DASHBOARD STATS ─────────────────────────────────
  router.get('/stats', (req, res) => {
    try {
      const uid = req.userId;
      const { month, year } = req.query;
      const now = new Date();
      const m = month || String(now.getMonth() + 1).padStart(2, '0');
      const y = year || now.getFullYear();
      const startDate = `${y}-${m}-01`;
      const endDate = `${y}-${m}-31`;

      const income = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions
        WHERE user_id = ? AND type = 'income' AND date BETWEEN ? AND ?
      `).get(uid, startDate, endDate);

      const expenses = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions
        WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ?
      `).get(uid, startDate, endDate);

      const byCategory = db.prepare(`
        SELECT c.name, c.icon, c.color, SUM(t.amount) as total
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.type = 'expense' AND t.date BETWEEN ? AND ?
        GROUP BY c.id ORDER BY total DESC
      `).all(uid, startDate, endDate);

      const recentTransactions = db.prepare(`
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
               a.name as account_name, a.icon as account_icon
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.user_id = ?
        ORDER BY t.date DESC, t.created_at DESC LIMIT 10
      `).all(uid);

      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(uid);
      const accountBalances = accounts.map(acc => {
        const incomeSum = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND account_id = ? AND type = 'income'`).get(uid, acc.id);
        const expenseSum = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND account_id = ? AND type = 'expense'`).get(uid, acc.id);
        const transfersIn = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND to_account_id = ? AND type = 'transfer'`).get(uid, acc.id);
        const transfersOut = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND account_id = ? AND type = 'transfer'`).get(uid, acc.id);
        return { ...acc, balance: acc.initial_balance + incomeSum.total - expenseSum.total + transfersIn.total - transfersOut.total };
      });

      const monthlyTrend = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(y, parseInt(m) - 1 - i, 1);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        const s = `${yy}-${mm}-01`;
        const e = `${yy}-${mm}-31`;
        const inc = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND type='income' AND date BETWEEN ? AND ?`).get(uid, s, e);
        const exp = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND type='expense' AND date BETWEEN ? AND ?`).get(uid, s, e);
        monthlyTrend.push({ month: `${yy}-${mm}`, income: inc.t, expense: exp.t });
      }

      const budgets = db.prepare(`
        SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
        FROM budgets b JOIN categories c ON b.category_id = c.id WHERE b.user_id = ?
      `).all(uid);
      const budgetProgress = budgets.map(b => {
        let spent = { t: 0 };
        if (b.period === 'monthly') {
          spent = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND category_id = ? AND type='expense' AND date BETWEEN ? AND ?`).get(uid, b.category_id, startDate, endDate);
        }
        return { ...b, spent: spent.t, percentage: b.amount > 0 ? Math.min((spent.t / b.amount) * 100, 100) : 0 };
      });

      res.json({
        income: income.total, expenses: expenses.total, balance: income.total - expenses.total,
        byCategory, recentTransactions, accountBalances, monthlyTrend, budgetProgress,
        totalBalance: accountBalances.reduce((s, a) => s + a.balance, 0)
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── TRANSACTIONS ─────────────────────────────────────
  router.get('/transactions', (req, res) => {
    try {
      const uid = req.userId;
      const { page = 1, limit = 50, type, category_id, account_id, from, to, search } = req.query;
      let where = ['t.user_id = ?'];
      let params = [uid];
      if (type) { where.push('t.type = ?'); params.push(type); }
      if (category_id) { where.push('t.category_id = ?'); params.push(category_id); }
      if (account_id) { where.push('t.account_id = ?'); params.push(account_id); }
      if (from) { where.push('t.date >= ?'); params.push(from); }
      if (to) { where.push('t.date <= ?'); params.push(to); }
      if (search) { where.push("(t.description LIKE ? OR t.notes LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }

      const total = db.prepare(`SELECT COUNT(*) as c FROM transactions t WHERE ${where.join(' AND ')}`).get(...params);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const rows = db.prepare(`
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
               a.name as account_name, a.icon as account_icon,
               a2.name as to_account_name, a2.icon as to_account_icon
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN accounts a2 ON t.to_account_id = a2.id
        WHERE ${where.join(' AND ')}
        ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?
      `).all(...params, parseInt(limit), offset);
      res.json({ data: rows, total: total.c, page: parseInt(page), pages: Math.ceil(total.c / parseInt(limit)) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/transactions', (req, res) => {
    try {
      const { type, amount, description, category_id, account_id, to_account_id, date, notes } = req.body;
      const result = db.prepare(`
        INSERT INTO transactions (user_id, type, amount, description, category_id, account_id, to_account_id, date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.userId, type, amount, description || null, category_id || null, account_id, to_account_id || null, date, notes || null);
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/transactions/:id', (req, res) => {
    try {
      const { type, amount, description, category_id, account_id, to_account_id, date, notes } = req.body;
      db.prepare(`UPDATE transactions SET type=?, amount=?, description=?, category_id=?, account_id=?, to_account_id=?, date=?, notes=? WHERE id=? AND user_id=?`)
        .run(type, amount, description || null, category_id || null, account_id, to_account_id || null, date, notes || null, req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/transactions/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── CATEGORIES ───────────────────────────────────────
  router.get('/categories', (req, res) => {
    try {
      const { type } = req.query;
      let rows;
      if (type) {
        rows = db.prepare('SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY name').all(req.userId, type);
      } else {
        rows = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, name').all(req.userId);
      }
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/categories', (req, res) => {
    try {
      const { name, type, icon, color } = req.body;
      const result = db.prepare('INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)').run(req.userId, name, type, icon || '💰', color || '#6366f1');
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/categories/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── ACCOUNTS ─────────────────────────────────────────
  router.get('/accounts', (req, res) => {
    try {
      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY name').all(req.userId);
      const result = accounts.map(acc => {
        const inc = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND account_id=? AND type='income'`).get(req.userId, acc.id);
        const exp = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND account_id=? AND type='expense'`).get(req.userId, acc.id);
        const tin = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND to_account_id=? AND type='transfer'`).get(req.userId, acc.id);
        const tout = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND account_id=? AND type='transfer'`).get(req.userId, acc.id);
        return { ...acc, balance: acc.initial_balance + inc.t - exp.t + tin.t - tout.t };
      });
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/accounts', (req, res) => {
    try {
      const { name, type, currency, initial_balance, color, icon } = req.body;
      const result = db.prepare('INSERT INTO accounts (user_id, name, type, currency, initial_balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(req.userId, name, type, currency || 'EUR', initial_balance || 0, color || '#6366f1', icon || '🏦');
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/accounts/:id', (req, res) => {
    try {
      const { name, type, currency, initial_balance, color, icon } = req.body;
      db.prepare('UPDATE accounts SET name=?, type=?, currency=?, initial_balance=?, color=?, icon=? WHERE id=? AND user_id=?')
        .run(name, type, currency, initial_balance, color, icon, req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/accounts/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── BUDGETS ──────────────────────────────────────────
  router.get('/budgets', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
        FROM budgets b JOIN categories c ON b.category_id = c.id WHERE b.user_id = ? ORDER BY c.name
      `).all(req.userId);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/budgets', (req, res) => {
    try {
      const { category_id, amount, period } = req.body;
      const result = db.prepare('INSERT INTO budgets (user_id, category_id, amount, period) VALUES (?, ?, ?, ?)').run(req.userId, category_id, amount, period || 'monthly');
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/budgets/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── ONBOARDING SETUP ─────────────────────────────────
  router.post('/onboard', (req, res) => {
    try {
      const uid = req.userId;
      const { currency, accounts: accs, monthlyIncome } = req.body;

      const cur = currency || 'EUR';

      // Update or create accounts from onboarding
      if (accs && Array.isArray(accs)) {
        // Delete default seeded accounts (only if user hasn't added transactions yet)
        const txCount = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE user_id = ?').get(uid);
        if (txCount.c === 0) {
          db.prepare('DELETE FROM accounts WHERE user_id = ?').run(uid);
        }

        const insertAcc = db.prepare('INSERT INTO accounts (user_id, name, type, currency, initial_balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)');

        const accIcons = { bank: '🏦', cash: '💵', credit_card: '💳', savings: '🐷', investment: '📈' };
        const accColors = { bank: '#6366f1', cash: '#10b981', credit_card: '#f97316', savings: '#06b6d4', investment: '#8b5cf6' };

        for (const acc of accs) {
          if (acc.name && acc.name.trim()) {
            insertAcc.run(
              uid,
              acc.name.trim(),
              acc.type || 'bank',
              cur,
              parseFloat(acc.initial_balance) || 0,
              accColors[acc.type] || '#6366f1',
              accIcons[acc.type] || '🏦'
            );
          }
        }
      }

      // Update all account currencies
      db.prepare('UPDATE accounts SET currency = ? WHERE user_id = ?').run(cur, uid);

      // If monthly income provided, we could create an initial income transaction
      // but we'll just store it for reference — the user will add their own

      // Mark user as onboarded
      db.prepare('UPDATE users SET is_onboarded = 1 WHERE id = ?').run(uid);

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── EXPORT CSV ───────────────────────────────────────
  router.get('/export', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT t.date, t.type, t.amount, t.description, c.name as category, a.name as account, t.notes
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.user_id = ? ORDER BY t.date DESC
      `).all(req.userId);
      let csv = 'Fecha,Tipo,Monto,Descripción,Categoría,Cuenta,Notas\n';
      rows.forEach(r => {
        csv += `${r.date},${r.type},${r.amount},"${r.description || ''}","${r.category || ''}","${r.account || ''}","${r.notes || ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=finanzas.csv');
      res.send('\ufeff' + csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── IMPORT TRANSACTIONS ────────────────────────────────
  router.post('/import', (req, res) => {
    try {
      const { rows } = req.body;
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No se recibieron transacciones' });
      }

      const uid = req.userId;
      const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(uid);
      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(uid);

      if (accounts.length === 0) {
        return res.status(400).json({ error: 'Necesitas al menos una cuenta para importar' });
      }

      const defaultAccount = accounts[0];
      let imported = 0;
      let skipped = 0;
      const errors = [];

      const insertTx = db.prepare(`
        INSERT INTO transactions (user_id, type, amount, description, category_id, account_id, date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const importAll = db.transaction((txRows) => {
        for (let i = 0; i < txRows.length; i++) {
          const r = txRows[i];
          try {
            // Parse amount first (needed for type auto-detection)
            let rawAmt = (r.amount || r.monto || r.cantidad || '0').toString();
            // Strip currency symbols and codes
            rawAmt = rawAmt.replace(/[€$£¥]/g, '').replace(/EUR|USD|GBP|MXN/gi, '').trim().replace(/\s/g, '');
            // Handle European decimal format (1.234,56 -> 1234.56)
            if (rawAmt.includes('.') && rawAmt.includes(',')) {
              rawAmt = rawAmt.replace(/\./g, '').replace(',', '.');
            } else {
              rawAmt = rawAmt.replace(',', '.');
            }
            let amount = parseFloat(rawAmt);
            if (isNaN(amount)) { skipped++; errors.push(`Fila ${i + 1}: monto inválido`); continue; }

            // Normalize type - auto-detect from sign if not provided
            let type = (r.type || r.tipo || '').toString().trim().toLowerCase();
            if (type === 'ingreso' || type === 'income') type = 'income';
            else if (type === 'gasto' || type === 'expense') type = 'expense';
            else if (!type || type === '') {
              // Auto-detect from sign of amount
              type = amount < 0 ? 'expense' : 'income';
            }
            else { skipped++; errors.push(`Fila ${i + 1}: tipo inválido "${r.type || r.tipo || ''}"`); continue; }

            // Use absolute value
            amount = Math.abs(amount);
            if (amount <= 0) { skipped++; errors.push(`Fila ${i + 1}: monto inválido`); continue; }

            // Parse date
            let date = (r.date || r.fecha || '').toString().trim();
            // Try to normalize common date formats
            if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(date)) {
              const parts = date.split(/[\/\-]/);
              date = parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
            } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(date)) {
              const parts = date.split(/[\/\-]/);
              date = '20' + parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; errors.push(`Fila ${i + 1}: fecha inválida "${r.date || r.fecha || ''}"`); continue; }

            // Match category by name (case insensitive)
            const catName = (r.category || r.categoria || r.categoría || '').toString().trim().toLowerCase();
            let categoryId = null;
            if (catName) {
              const match = categories.find(c => c.name.toLowerCase() === catName && c.type === type);
              if (match) categoryId = match.id;
              else {
                const anyMatch = categories.find(c => c.name.toLowerCase() === catName);
                if (anyMatch) categoryId = anyMatch.id;
              }
            }

            // Match account by name (case insensitive)
            const accName = (r.account || r.cuenta || '').toString().trim().toLowerCase();
            let accountId = defaultAccount.id;
            if (accName) {
              const match = accounts.find(a => a.name.toLowerCase() === accName);
              if (match) accountId = match.id;
            }

            const description = (r.description || r.descripcion || r.descripción || '').toString().trim() || null;
            const notes = (r.notes || r.notas || '').toString().trim() || null;

            insertTx.run(uid, type, amount, description, categoryId, accountId, date, notes);
            imported++;
          } catch (e) {
            skipped++;
            errors.push(`Fila ${i + 1}: ${e.message}`);
          }
        }
      });

      importAll(rows);

      res.json({ success: true, imported, skipped, errors: errors.slice(0, 10) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── SAVINGS PLAN ──────────────────────────────────────
  router.get('/savings-plan', (req, res) => {
    try {
      const plan = db.prepare('SELECT * FROM savings_plans WHERE user_id = ?').get(req.userId);
      res.json(plan || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/savings-plan', (req, res) => {
    try {
      const { name, target_percentage, goal_target, target_account_id, is_active } = req.body;
      const existing = db.prepare('SELECT id FROM savings_plans WHERE user_id = ?').get(req.userId);
      if (existing) {
        db.prepare('UPDATE savings_plans SET name=?, target_percentage=?, goal_target=?, target_account_id=?, is_active=? WHERE user_id=?')
          .run(name || 'Mi Plan de Ahorro', target_percentage || 20, goal_target || 0, target_account_id || null, is_active !== undefined ? is_active : 1, req.userId);
        res.json({ success: true, id: existing.id });
      } else {
        const result = db.prepare('INSERT INTO savings_plans (user_id, name, target_percentage, goal_target, target_account_id, is_active) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.userId, name || 'Mi Plan de Ahorro', target_percentage || 20, goal_target || 0, target_account_id || null, is_active !== undefined ? is_active : 1);
        res.json({ success: true, id: result.lastInsertRowid });
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Add funds to hucha (creates a transfer to savings account)
  router.post('/savings-plan/add-funds', (req, res) => {
    try {
      const { amount, from_account_id } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

      const plan = db.prepare('SELECT * FROM savings_plans WHERE user_id = ?').get(req.userId);

      // Try to get target account from plan, or find first savings account
      let targetAccountId = plan?.target_account_id;
      if (!targetAccountId) {
        const savingsAcc = db.prepare("SELECT id FROM accounts WHERE user_id = ? AND type = 'savings' LIMIT 1").get(req.userId);
        targetAccountId = savingsAcc?.id;
      }

      if (!targetAccountId) {
        return res.status(400).json({ error: 'Crea una cuenta de ahorro o configura tu hucha primero' });
      }

      // Create a transfer transaction from source to savings account
      const today = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO transactions (user_id, type, amount, description, account_id, to_account_id, date)
        VALUES (?, 'transfer', ?, 'Aportación a hucha', ?, ?, ?)
      `).run(req.userId, amount, from_account_id, targetAccountId, today);

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/savings-recommendation', (req, res) => {
    try {
      const uid = req.userId;
      const now = new Date();
      // Calculate average income/expenses - use actual months with data, not fixed 3
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const startDate = threeMonthsAgo.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      const income = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ?`).get(uid, startDate);
      const expenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ?`).get(uid, startDate);

      // Count actual months with transactions, not fixed 3
      const monthsWithData = db.prepare(`
        SELECT COUNT(DISTINCT strftime('%Y-%m', date)) as months 
        FROM transactions 
        WHERE user_id = ? AND date >= ?
      `).get(uid, startDate);
      const monthsDiff = Math.max(1, monthsWithData.months);

      const avgIncome = income.total / monthsDiff;
      const avgExpenses = expenses.total / monthsDiff;
      const avgBalance = avgIncome - avgExpenses;

      const plan = db.prepare('SELECT * FROM savings_plans WHERE user_id = ?').get(uid);
      const targetPct = plan?.target_percentage || 20;

      // Recommended savings: target % of income
      // Only reduce if balance is negative (spending more than earning)
      let recommended = avgIncome * (targetPct / 100);
      if (avgBalance < 0) {
        // User is spending more than they earn - recommend saving less
        recommended = 0;
      } else if (recommended > avgBalance) {
        // Target is higher than surplus - warn user but still show target
        // This is informational - user might have savings elsewhere
      }
      recommended = Math.max(0, recommended);

      // Get savings account balance if configured
      let savingsBalance = 0;
      if (plan?.target_account_id) {
        const acc = db.prepare('SELECT initial_balance FROM accounts WHERE id = ? AND user_id = ?').get(plan.target_account_id, uid);
        if (acc) {
          const inc = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND account_id=? AND type='income'`).get(uid, plan.target_account_id);
          const exp = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND account_id=? AND type='expense'`).get(uid, plan.target_account_id);
          const tin = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND to_account_id=? AND type='transfer'`).get(uid, plan.target_account_id);
          const tout = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE user_id = ? AND account_id=? AND type='transfer'`).get(uid, plan.target_account_id);
          savingsBalance = acc.initial_balance + inc.t - exp.t + tin.t - tout.t;
        }
      }

      res.json({
        avgIncome: Math.round(avgIncome * 100) / 100,
        avgExpenses: Math.round(avgExpenses * 100) / 100,
        avgBalance: Math.round(avgBalance * 100) / 100,
        targetPercentage: targetPct,
        recommendedSavings: Math.round(recommended * 100) / 100,
        savingsAccountBalance: Math.round(savingsBalance * 100) / 100,
        plan: plan || null
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── SAVINGS GOALS ─────────────────────────────────────
  router.get('/goals', (req, res) => {
    try {
      const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
      res.json(goals);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/goals', (req, res) => {
    try {
      const { name, icon, target_amount, current_amount, target_date, color } = req.body;
      const result = db.prepare('INSERT INTO savings_goals (user_id, name, icon, target_amount, current_amount, target_date, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(req.userId, name, icon || '🎯', target_amount, current_amount || 0, target_date || null, color || '#6366f1');
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/goals/:id', (req, res) => {
    try {
      const { name, icon, target_amount, current_amount, target_date, color } = req.body;
      db.prepare('UPDATE savings_goals SET name=?, icon=?, target_amount=?, current_amount=?, target_date=?, color=? WHERE id=? AND user_id=?')
        .run(name, icon, target_amount, current_amount, target_date || null, color, req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/goals/:id/add-funds', (req, res) => {
    try {
      const { amount, from_account_id } = req.body;

      const update = db.transaction(() => {
        const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        if (!goal) throw new Error('Meta no encontrada');

        if (from_account_id) {
          const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(from_account_id, req.userId);
          if (!account) throw new Error('Cuenta de origen no encontrada');

          // Create expense transaction for the goal
          db.prepare(`
            INSERT INTO transactions (user_id, type, amount, description, account_id, date, category_id)
            VALUES (?, 'expense', ?, ?, ?, DATE('now'), (SELECT id FROM categories WHERE user_id = ? AND name = 'Ahorro' AND type = 'expense'))
          `).run(req.userId, amount, `Ahorro para meta: ${goal.name}`, from_account_id, req.userId);
        }

        const newAmount = goal.current_amount + parseFloat(amount);
        db.prepare('UPDATE savings_goals SET current_amount = ? WHERE id = ?').run(newAmount, req.params.id);
        return newAmount;
      });

      const newAmount = update();
      res.json({ success: true, current_amount: newAmount });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.delete('/goals/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── TASKS ─────────────────────────────────────
  router.get('/tasks', (req, res) => {
    try {
      const tasks = db.prepare(`
        SELECT * FROM tasks WHERE user_id = ?
        ORDER BY is_completed ASC, 
          CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
          due_date IS NULL, due_date ASC,
          created_at DESC
      `).all(req.userId);

      const total = tasks.length;
      const completed = tasks.filter(t => t.is_completed).length;
      const pending = total - completed;

      res.json({ tasks, total, completed, pending });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/tasks', (req, res) => {
    try {
      const { title, description, priority, due_date } = req.body;
      if (!title || !title.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
      const result = db.prepare(`
        INSERT INTO tasks (user_id, title, description, priority, due_date)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.userId, title.trim(), description || null, priority || 'medium', due_date || null);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/tasks/:id', (req, res) => {
    try {
      const { title, description, priority, due_date, is_completed } = req.body;
      const completed_at = is_completed ? new Date().toISOString() : null;
      db.prepare(`
        UPDATE tasks SET title=?, description=?, priority=?, due_date=?, is_completed=?, completed_at=?
        WHERE id=? AND user_id=?
      `).run(title, description || null, priority || 'medium', due_date || null, is_completed ? 1 : 0, completed_at, req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/tasks/:id/toggle', (req, res) => {
    try {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
      if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
      const newStatus = task.is_completed ? 0 : 1;
      const completed_at = newStatus ? new Date().toISOString() : null;
      db.prepare('UPDATE tasks SET is_completed = ?, completed_at = ? WHERE id = ?').run(newStatus, completed_at, req.params.id);
      res.json({ success: true, is_completed: newStatus });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/tasks/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── DEBTS ─────────────────────────────────────
  router.get('/debts', (req, res) => {
    try {
      const debts = db.prepare('SELECT * FROM debts WHERE user_id = ? ORDER BY is_settled ASC, created_at DESC').all(req.userId);
      const totalOwed = debts.filter(d => d.type === 'owed' && !d.is_settled).reduce((s, d) => s + (d.amount - d.paid_amount), 0);
      const totalOwe = debts.filter(d => d.type === 'owe' && !d.is_settled).reduce((s, d) => s + (d.amount - d.paid_amount), 0);
      res.json({ debts, totalOwed, totalOwe });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/debts', (req, res) => {
    try {
      const { name, person, amount, type, due_date, notes } = req.body;
      const result = db.prepare(`
        INSERT INTO debts (user_id, name, person, amount, type, due_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.userId, name, person, amount, type, due_date || null, notes || null);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/debts/:id', (req, res) => {
    try {
      const { name, person, amount, paid_amount, type, due_date, notes, is_settled } = req.body;
      db.prepare(`
        UPDATE debts SET name=?, person=?, amount=?, paid_amount=?, type=?, due_date=?, notes=?, is_settled=?
        WHERE id=? AND user_id=?
      `).run(name, person, amount, paid_amount || 0, type, due_date || null, notes || null, is_settled || 0, req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/debts/:id/pay', (req, res) => {
    try {
      const { amount } = req.body;
      const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
      if (!debt) return res.status(404).json({ error: 'Deuda no encontrada' });

      const newPaid = (debt.paid_amount || 0) + amount;
      const isSettled = newPaid >= debt.amount ? 1 : 0;
      db.prepare('UPDATE debts SET paid_amount = ?, is_settled = ? WHERE id = ?').run(newPaid, isSettled, req.params.id);
      res.json({ success: true, paid_amount: newPaid, is_settled: isSettled });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/debts/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM debts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── MONTHLY RECAP ─────────────────────────────────────
  router.get('/recap/:year/:month', (req, res) => {
    try {
      const { year, month } = req.params;
      const startDate = `${year}-${month.padStart(2, '0')}-01`;
      const endDate = `${year}-${month.padStart(2, '0')}-31`;

      // Previous month for comparison
      const prevMonth = parseInt(month) === 1 ? 12 : parseInt(month) - 1;
      const prevYear = parseInt(month) === 1 ? parseInt(year) - 1 : parseInt(year);
      const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-31`;

      const income = db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE user_id = ? AND type = 'income' AND date BETWEEN ? AND ?`).get(req.userId, startDate, endDate);
      const expenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ?`).get(req.userId, startDate, endDate);

      const prevIncome = db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE user_id = ? AND type = 'income' AND date BETWEEN ? AND ?`).get(req.userId, prevStart, prevEnd);
      const prevExpenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ?`).get(req.userId, prevStart, prevEnd);

      const byCategory = db.prepare(`
        SELECT c.name, c.icon, COALESCE(SUM(t.amount), 0) as total
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.type = 'expense' AND t.date BETWEEN ? AND ?
        GROUP BY t.category_id
        ORDER BY total DESC
        LIMIT 5
      `).all(req.userId, startDate, endDate);

      const transactionCount = db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?`).get(req.userId, startDate, endDate);

      res.json({
        income: income.t,
        expenses: expenses.t,
        balance: income.t - expenses.t,
        prevIncome: prevIncome.t,
        prevExpenses: prevExpenses.t,
        incomeChange: prevIncome.t > 0 ? ((income.t - prevIncome.t) / prevIncome.t * 100) : 0,
        expenseChange: prevExpenses.t > 0 ? ((expenses.t - prevExpenses.t) / prevExpenses.t * 100) : 0,
        topCategories: byCategory,
        transactionCount: transactionCount.c
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── BUDGET ALERTS ─────────────────────────────────────
  router.get('/alerts', (req, res) => {
    try {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-31`;

      const budgets = db.prepare(`
        SELECT b.*, c.name as category_name, c.icon as category_icon,
        (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = b.user_id AND category_id = b.category_id AND type = 'expense' AND date BETWEEN ? AND ?) as spent
        FROM budgets b
        JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = ?
      `).all(startDate, endDate, req.userId);

      const alerts = budgets.filter(b => {
        const pct = (b.spent / b.amount) * 100;
        return pct >= 80; // Alert when 80%+ spent
      }).map(b => ({
        category: b.category_name,
        icon: b.category_icon,
        budget: b.amount,
        spent: b.spent,
        percentage: Math.round((b.spent / b.amount) * 100),
        exceeded: b.spent > b.amount
      }));

      res.json(alerts);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── API TOKENS (for iOS Shortcuts) ────────────────
  router.get('/tokens', (req, res) => {
    try {
      const tokens = db.prepare(`
        SELECT id, name, token, is_active, last_used, created_at
        FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC
      `).all(req.userId);
      // Mask tokens for display (show first 8 + last 4 chars)
      const masked = tokens.map(t => ({
        ...t,
        token_masked: t.token.slice(0, 8) + '••••••••' + t.token.slice(-4),
        token_full: t.token
      }));
      res.json(masked);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/tokens', (req, res) => {
    try {
      const { name } = req.body;
      const crypto = require('crypto');
      const token = 'taitou_' + crypto.randomBytes(32).toString('hex');
      const result = db.prepare(`
        INSERT INTO api_tokens (user_id, token, name) VALUES (?, ?, ?)
      `).run(req.userId, token, name || 'iOS Shortcut');
      res.json({ success: true, id: result.lastInsertRowid, token, name: name || 'iOS Shortcut' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/tokens/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/tokens/:id/toggle', (req, res) => {
    try {
      const token = db.prepare('SELECT is_active FROM api_tokens WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
      if (!token) return res.status(404).json({ error: 'Token no encontrado' });
      db.prepare('UPDATE api_tokens SET is_active = ? WHERE id = ? AND user_id = ?')
        .run(token.is_active ? 0 : 1, req.params.id, req.userId);
      res.json({ success: true, is_active: !token.is_active });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
