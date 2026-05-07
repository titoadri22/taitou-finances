const express = require('express');
const router = express.Router();

module.exports = function(db) {

  // Middleware to ensure admin
  router.use((req, res, next) => {
    if (!req.session || !req.session.userId || !req.session.isAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
    }
    next();
  });

  // GET /users
  router.get('/users', (req, res) => {
    try {
      const users = db.prepare(`
        SELECT id, name, email, avatar_color, is_admin, created_at
        FROM users
        ORDER BY created_at DESC
      `).all();
      
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /users/:id
  router.delete('/users/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

      if (id === req.session.userId) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador.' });
      }

      const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
