require('dotenv').config();
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { initDB, seedUserDefaults } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const db = initDB();

// Persistent session secret: use env var, or read/create from file so sessions survive restarts
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretPath = path.join(__dirname, 'data', '.session-secret');
  try {
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch (e) {
    const newSecret = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(secretPath, newSecret, { mode: 0o600 }); } catch (e2) {}
    return newSecret;
  }
}

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d' // Cache de 7 días para archivos estáticos
}));

const authRoutes = require('./routes/auth')(db, seedUserDefaults);
app.use('/auth', authRoutes);

const apiRoutes = require('./routes/api')(db);
app.use('/api', apiRoutes);

const shortcutRoutes = require('./routes/shortcuts')(db);
app.use('/shortcuts', shortcutRoutes);

const adminRoutes = require('./routes/admin')(db);
app.use('/api/admin', adminRoutes);

const chatRoutes = require('./routes/chat')(db);
app.use('/api/chat', chatRoutes);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path.startsWith('/shortcuts/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🏦 Taitou Finances corriendo en http://localhost:${PORT}\n`);
});
