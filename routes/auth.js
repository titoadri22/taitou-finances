const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = function(db, seedUserDefaults) {

  // ─── REGISTER ─────────────────────────────────────
  router.post('/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }

      // Check if email exists
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (existing) {
        return res.status(400).json({ error: 'Ya existe una cuenta con ese correo' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Random avatar color
      const colors = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#06b6d4', '#a78bfa', '#fb923c'];
      const avatarColor = colors[Math.floor(Math.random() * colors.length)];

      // Create user
      const result = db.prepare('INSERT INTO users (name, email, password, avatar_color) VALUES (?, ?, ?, ?)')
        .run(name.trim(), email.toLowerCase().trim(), hashedPassword, avatarColor);

      const userId = result.lastInsertRowid;

      // Seed default categories and accounts
      seedUserDefaults(db, userId);

      // Set session
      req.session.userId = userId;
      req.session.userName = name.trim();
      req.session.userEmail = email.toLowerCase().trim();
      req.session.avatarColor = avatarColor;

      res.json({
        success: true,
        user: { id: userId, name: name.trim(), email: email.toLowerCase().trim(), avatar_color: avatarColor, is_onboarded: 0 }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── LOGIN ────────────────────────────────────────
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ? OR name = ?').get(email.toLowerCase().trim(), email.trim());
      if (!user) {
        return res.status(401).json({ error: 'Correo/Usuario o contraseña incorrectos' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Correo/Usuario o contraseña incorrectos' });
      }

      // Set session
      req.session.userId = user.id;
      req.session.userName = user.name;
      req.session.userEmail = user.email;
      req.session.avatarColor = user.avatar_color;
      req.session.isAdmin = user.is_admin === 1;

      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, avatar_color: user.avatar_color, avatar_emoji: user.avatar_emoji || '', currency: user.currency || 'EUR', is_onboarded: user.is_onboarded || 0, is_admin: user.is_admin === 1 }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── LOGOUT ───────────────────────────────────────
  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // ─── CHECK SESSION ────────────────────────────────
  router.get('/me', (req, res) => {
    if (req.session && req.session.userId) {
      const user = db.prepare('SELECT name, email, avatar_color, avatar_emoji, currency, is_onboarded, is_admin FROM users WHERE id = ?').get(req.session.userId);
      if (!user) return res.json({ authenticated: false });
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          name: user.name,
          email: user.email,
          avatar_color: user.avatar_color || '#818cf8',
          avatar_emoji: user.avatar_emoji || '',
          currency: user.currency || 'EUR',
          is_onboarded: user.is_onboarded || 0,
          is_admin: user.is_admin === 1
        }
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  // ─── UPDATE PROFILE ───────────────────────────────
  router.put('/profile', async (req, res) => {
    try {
      if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const { name, email, avatar_color, avatar_emoji, currency, current_password, new_password } = req.body;
      const userId = req.session.userId;

      // Build dynamic update
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name.trim()); }
      if (email) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), userId);
        if (existing) {
          return res.status(400).json({ error: 'Ese correo ya está en uso' });
        }
        updates.push('email = ?');
        params.push(email.toLowerCase().trim());
      }
      if (avatar_color) { updates.push('avatar_color = ?'); params.push(avatar_color); }
      if (avatar_emoji !== undefined) { updates.push('avatar_emoji = ?'); params.push(avatar_emoji); }
      if (currency) { updates.push('currency = ?'); params.push(currency); }

      if (updates.length > 0) {
        params.push(userId);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (name) req.session.userName = name.trim();
        if (email) req.session.userEmail = email.toLowerCase().trim();
        if (avatar_color) req.session.avatarColor = avatar_color;
      }

      // Change password
      if (current_password && new_password) {
        const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
        const valid = await bcrypt.compare(current_password, user.password);
        if (!valid) {
          return res.status(400).json({ error: 'Contraseña actual incorrecta' });
        }
        if (new_password.length < 6) {
          return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }
        const salt = await bcrypt.genSalt(12);
        const hashed = await bcrypt.hash(new_password, salt);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, userId);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
