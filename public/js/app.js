// ═══════════════════════════════════════════════════
// Taitou Finances — Client-side Application with Auth
// ═══════════════════════════════════════════════════

var currentPage = 1;
var txType = 'expense';
var chartTrend = null;
var chartDonut = null;
var allCategories = [];
var allAccounts = [];
var searchTimeout = null;
var currentUser = null;

// ─── INIT: CHECK AUTH ─────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  checkAuth();

  // Enter key on login/register forms
  document.getElementById('loginPassword').addEventListener('keypress', function (e) { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('loginEmail').addEventListener('keypress', function (e) { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('regPassword2').addEventListener('keypress', function (e) { if (e.key === 'Enter') handleRegister(); });
});

async function checkAuth() {
  try {
    var res = await fetch('/auth/me');
    var data = await res.json();
    if (data.authenticated) {
      currentUser = data.user;
      if (!currentUser.is_onboarded) {
        showOnboarding();
      } else {
        showApp();
      }
    } else {
      showAuth();
    }
  } catch (e) {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('authScreen').style.display = '';
  document.getElementById('appScreen').style.display = 'none';
  var fab = document.getElementById('fab');
  if (fab) fab.style.display = 'none';
}

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = '';
  var fab = document.getElementById('fab');
  if (fab) fab.style.display = '';

  // Set user info in sidebar
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userEmail').textContent = currentUser.email;
  var avatar = document.getElementById('userAvatar');
  avatar.textContent = currentUser.name.charAt(0).toUpperCase();
  avatar.style.background = currentUser.avatar_color || '#818cf8';

  document.getElementById('dashGreeting').textContent = '¡Hola, ' + currentUser.name.split(' ')[0] + '! Aquí tienes tu resumen.';

  var adminNavSection = document.getElementById('adminNavSection');
  var exportBtn = document.getElementById('exportBtn');
  var importBtn = document.getElementById('importBtn');
  var chatWidget = document.getElementById('chatWidget');
  var userNavSections = document.querySelectorAll('.nav-section:not(#adminNavSection)');

  if (currentUser.is_admin) {
    if (fab) fab.style.display = 'none';
    if (exportBtn) exportBtn.style.display = 'none';
    if (importBtn) importBtn.style.display = 'none';
    if (chatWidget) chatWidget.style.display = 'none';
    userNavSections.forEach(function(el) { el.style.display = 'none'; });
    if (adminNavSection) adminNavSection.style.display = '';
    
    navigate('admin', document.getElementById('adminNavBtn'));
  } else {
    if (fab) fab.style.display = '';
    if (exportBtn) exportBtn.style.display = '';
    if (importBtn) importBtn.style.display = '';
    if (chatWidget) chatWidget.style.display = '';
    userNavSections.forEach(function(el) { el.style.display = ''; });
    if (adminNavSection) adminNavSection.style.display = 'none';
    
    // Init app
    var now = new Date();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('dashMonth').value = now.getFullYear() + '-' + m;
    document.getElementById('txDate').value = now.toISOString().split('T')[0];
    loadAllData();
  }
}

function showLogin() {
  document.getElementById('loginForm').style.display = '';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('loginError').textContent = '';
}
function showRegister() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = '';
  document.getElementById('registerError').textContent = '';
}

// ─── LOGIN ────────────────────────────────────────
async function handleLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  var errEl = document.getElementById('loginError');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Completa todos los campos'; return; }

  var btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Entrando...';

  try {
    var res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (data.success) {
      currentUser = data.user;
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      showApp();
    } else {
      errEl.textContent = data.error || 'Error al iniciar sesión';
    }
  } catch (e) {
    errEl.textContent = 'Error de conexión';
  }
  btn.disabled = false; btn.textContent = 'Entrar';
}

// ─── REGISTER ─────────────────────────────────────
async function handleRegister() {
  var name = document.getElementById('regName').value.trim();
  var email = document.getElementById('regEmail').value.trim();
  var pw = document.getElementById('regPassword').value;
  var pw2 = document.getElementById('regPassword2').value;
  var errEl = document.getElementById('registerError');
  errEl.textContent = '';

  if (!name || !email || !pw || !pw2) { errEl.textContent = 'Completa todos los campos'; return; }
  if (pw.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }
  if (pw !== pw2) { errEl.textContent = 'Las contraseñas no coinciden'; return; }

  var btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = 'Creando cuenta...';

  try {
    var res = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, password: pw })
    });
    var data = await res.json();
    if (data.success) {
      currentUser = data.user;
      document.getElementById('regName').value = '';
      document.getElementById('regEmail').value = '';
      document.getElementById('regPassword').value = '';
      document.getElementById('regPassword2').value = '';
      showOnboarding();
    } else {
      errEl.textContent = data.error || 'Error al crear cuenta';
    }
  } catch (e) {
    errEl.textContent = 'Error de conexión';
  }
  btn.disabled = false; btn.textContent = 'Crear cuenta';
}

// ─── LOGOUT ───────────────────────────────────────
async function handleLogout() {
  await fetch('/auth/logout', { method: 'POST' });
  currentUser = null;
  closeModal('profileModal');
  showAuth();
}

// ─── PROFILE ──────────────────────────────────────
function openProfileModal() {
  document.getElementById('profileName').value = currentUser.name;
  document.getElementById('profileEmail').value = currentUser.email;
  document.getElementById('profileCurrentPw').value = '';
  document.getElementById('profileNewPw').value = '';
  document.getElementById('profileError').textContent = '';
  openModal('profileModal');
}

async function saveProfile() {
  var name = document.getElementById('profileName').value.trim();
  var email = document.getElementById('profileEmail').value.trim();
  var currentPw = document.getElementById('profileCurrentPw').value;
  var newPw = document.getElementById('profileNewPw').value;
  var errEl = document.getElementById('profileError');
  errEl.textContent = '';

  if (!name || !email) { errEl.textContent = 'Nombre y correo son obligatorios'; return; }

  var body = { name: name, email: email };
  if (currentPw && newPw) {
    body.current_password = currentPw;
    body.new_password = newPw;
  }

  try {
    var res = await fetch('/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (data.success) {
      currentUser.name = name;
      currentUser.email = email;
      document.getElementById('userName').textContent = name;
      document.getElementById('userEmail').textContent = email;
      document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
      closeModal('profileModal');
      toast('Perfil actualizado');
    } else {
      errEl.textContent = data.error || 'Error al guardar';
    }
  } catch (e) {
    errEl.textContent = 'Error de conexión';
  }
}

// ─── NAVIGATION ───────────────────────────────────
function navigate(page, el) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
  document.getElementById('page-' + page).classList.add('active');
  if (el) el.classList.add('active');
  if (page === 'transactions') loadTransactions();
  if (page === 'accounts') loadAccountsPage();
  if (page === 'budgets') loadBudgetsPage();
  if (page === 'categories') loadCategoriesPage();
  if (page === 'dashboard') loadDashboard();
  if (page === 'savings') loadSavingsPage();
  if (page === 'goals') loadGoalsPage();
  if (page === 'tasks') loadTasksPage();
  if (page === 'debts') loadDebtsPage();
  if (page === 'recap') loadRecap();
  if (page === 'shortcuts') loadShortcutsPage();
  if (page === 'admin') loadAdminPage();
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

// ─── API HELPERS ──────────────────────────────────
async function api(url, method, body) {
  var opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch('/api' + url, opts);
  if (res.status === 401) { showAuth(); return null; }
  return res.json();
}
function formatMoney(amount) {
  var n = parseFloat(amount) || 0;
  return '€' + Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toast(message, type) {
  var container = document.getElementById('toastContainer');
  var t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'success');
  t.textContent = message;
  container.appendChild(t);
  setTimeout(function () { t.remove(); }, 3000);
}
function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(function () { currentPage = 1; loadTransactions(); }, 400);
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ─── LOAD DATA ────────────────────────────────────
async function loadAllData() {
  await Promise.all([loadCategories(), loadAccounts()]);
  loadDashboard();
}
async function loadCategories() {
  allCategories = await api('/categories') || [];
  window.categoriesCache = allCategories;
  populateCategorySelects();
}
async function loadAccounts() {
  allAccounts = await api('/accounts') || [];
  populateAccountSelects();
}
function populateCategorySelects() {
  var txCat = document.getElementById('txCategory');
  var filterCat = document.getElementById('filterCategory');
  var budgetCat = document.getElementById('budgetCategory');
  var incCats = allCategories.filter(function (c) { return c.type === 'income'; });
  var expCats = allCategories.filter(function (c) { return c.type === 'expense'; });
  var filtered = txType === 'income' ? incCats : expCats;
  txCat.innerHTML = '<option value="">Sin categoría</option>' + filtered.map(function (c) { return '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>'; }).join('');
  if (filterCat) filterCat.innerHTML = '<option value="">Todas las categorías</option>' + allCategories.map(function (c) { return '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>'; }).join('');
  if (budgetCat) budgetCat.innerHTML = expCats.map(function (c) { return '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>'; }).join('');
}
function populateAccountSelects() {
  var opts = allAccounts.map(function (a) { return '<option value="' + a.id + '">' + (a.icon || '🏦') + ' ' + a.name + '</option>'; }).join('');
  document.getElementById('txAccount').innerHTML = opts;
  document.getElementById('txToAccount').innerHTML = opts;
  var f = document.getElementById('filterAccount');
  if (f) f.innerHTML = '<option value="">Todas las cuentas</option>' + opts;
}

// ─── TRANSACTION TYPE ─────────────────────────────
function setTxType(type) {
  txType = type;
  document.querySelectorAll('.type-tab').forEach(function (t) {
    t.className = 'type-tab';
    if (t.dataset.type === type) t.className = 'type-tab active-' + type;
  });
  document.getElementById('txCategoryGroup').style.display = type === 'transfer' ? 'none' : 'block';
  document.getElementById('txToAccountGroup').style.display = type === 'transfer' ? 'block' : 'none';
  document.getElementById('txAccountLabel').textContent = type === 'transfer' ? 'Cuenta origen' : 'Cuenta';
  populateCategorySelects();
}
function openNewTransaction() {
  document.getElementById('txId').value = '';
  document.getElementById('txModalTitle').textContent = 'Nueva transacción';
  document.getElementById('txAmount').value = '';
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('txDescription').value = '';
  document.getElementById('txNotes').value = '';
  document.getElementById('txScanBanner').style.display = '';
  setTxType('expense');
  openModal('transactionModal');
}
function openEditTransaction(t) {
  document.getElementById('txId').value = t.id;
  document.getElementById('txModalTitle').textContent = 'Editar transacción';
  document.getElementById('txScanBanner').style.display = 'none';
  setTxType(t.type);
  document.getElementById('txAmount').value = t.amount;
  document.getElementById('txDate').value = t.date;
  document.getElementById('txDescription').value = t.description || '';
  document.getElementById('txCategory').value = t.category_id || '';
  document.getElementById('txAccount').value = t.account_id;
  if (t.to_account_id) document.getElementById('txToAccount').value = t.to_account_id;
  document.getElementById('txNotes').value = t.notes || '';
  openModal('transactionModal');
}
async function saveTransaction() {
  var amount = parseFloat(document.getElementById('txAmount').value);
  var date = document.getElementById('txDate').value;
  if (!amount || !date) { toast('Completa monto y fecha', 'error'); return; }
  var body = {
    type: txType, amount: amount,
    description: document.getElementById('txDescription').value,
    category_id: document.getElementById('txCategory').value || null,
    account_id: document.getElementById('txAccount').value,
    to_account_id: txType === 'transfer' ? document.getElementById('txToAccount').value : null,
    date: date, notes: document.getElementById('txNotes').value
  };
  var id = document.getElementById('txId').value;
  if (id) { await api('/transactions/' + id, 'PUT', body); toast('Transacción actualizada'); }
  else { await api('/transactions', 'POST', body); toast('Transacción creada'); }
  closeModal('transactionModal');
  await loadAccounts();
  loadDashboard();
  if (document.getElementById('page-transactions').classList.contains('active')) loadTransactions();
}
async function deleteTransaction(id) {
  if (!confirm('¿Eliminar esta transacción?')) return;
  await api('/transactions/' + id, 'DELETE');
  toast('Transacción eliminada');
  await loadAccounts();
  loadTransactions();
}

// ─── DASHBOARD ────────────────────────────────────
async function loadDashboard() {
  var monthVal = document.getElementById('dashMonth').value;
  var parts = monthVal.split('-');
  var data = await api('/stats?month=' + parts[1] + '&year=' + parts[0]);
  if (!data) return;
  document.getElementById('statIncome').textContent = formatMoney(data.income);
  document.getElementById('statExpense').textContent = formatMoney(data.expenses);
  document.getElementById('statBalance').textContent = formatMoney(data.balance);
  document.getElementById('statTotal').textContent = formatMoney(data.totalBalance);

  var tbody = document.getElementById('recentTable');
  if (data.recentTransactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📭</div><p>No hay transacciones aún. ¡Añade tu primera!</p></div></td></tr>';
  } else {
    var html = '';
    data.recentTransactions.forEach(function (t) {
      var sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
      html += '<tr><td style="white-space:nowrap;color:var(--text-muted);font-size:0.82rem;">' + formatDate(t.date) + '</td>' +
        '<td>' + (t.description || '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '<td>' + (t.category_icon ? '<span class="category-tag">' + t.category_icon + ' ' + t.category_name + '</span>' : '—') + '</td>' +
        '<td class="amount-' + t.type + '">' + sign + '€' + Math.abs(t.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</td></tr>';
    });
    tbody.innerHTML = html;
  }

  var accDiv = document.getElementById('dashAccounts');
  if (data.accountBalances.length === 0) { accDiv.innerHTML = '<div class="empty-state"><p>No hay cuentas</p></div>'; }
  else {
    accDiv.innerHTML = data.accountBalances.map(function (a) {
      return '<div class="account-card"><div class="account-icon" style="background:' + a.color + '22;">' + a.icon + '</div>' +
        '<div class="account-info"><div class="account-name">' + a.name + '</div><div class="account-type">' + a.type + '</div></div>' +
        '<div class="account-balance" style="color:' + (a.balance >= 0 ? 'var(--green)' : 'var(--red)') + '">€' + Math.abs(a.balance).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</div></div>';
    }).join('');
  }

  var budDiv = document.getElementById('dashBudgets');
  if (data.budgetProgress.length === 0) { budDiv.innerHTML = '<div class="empty-state" style="padding:20px;"><p>Sin presupuestos</p></div>'; }
  else {
    budDiv.innerHTML = data.budgetProgress.map(function (b) {
      var pct = b.percentage;
      var color = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : b.category_color;
      return '<div class="budget-item"><div class="budget-icon">' + b.category_icon + '</div><div class="budget-info">' +
        '<div class="budget-name">' + b.category_name + '</div>' +
        '<div class="budget-bar"><div class="budget-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
        '<div class="budget-values"><span class="spent">€' + b.spent.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</span>' +
        '<span class="total">€' + b.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</span></div></div></div>';
    }).join('');
  }

  renderTrendChart(data.monthlyTrend);
  renderDonutChart(data.byCategory, data.expenses);
}

function renderTrendChart(trend) {
  var ctx = document.getElementById('chartTrend').getContext('2d');
  if (chartTrend) chartTrend.destroy();
  var labels = trend.map(function (t) { var p = t.month.split('-'); return new Date(p[0], p[1] - 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }); });
  chartTrend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Ingresos', data: trend.map(function (t) { return t.income; }), backgroundColor: 'rgba(52,211,153,0.7)', borderColor: '#34d399', borderWidth: 1, borderRadius: 6, barPercentage: 0.4 },
        { label: 'Gastos', data: trend.map(function (t) { return t.expense; }), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: '#f87171', borderWidth: 1, borderRadius: 6, barPercentage: 0.4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: '#8888a0', font: { family: 'DM Sans', size: 12 }, boxWidth: 12, padding: 16 } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#55556a', font: { family: 'DM Sans', size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#55556a', font: { family: 'JetBrains Mono', size: 11 }, callback: function (v) { return '€' + v.toLocaleString('es-ES'); } } }
      }
    }
  });
}

function renderDonutChart(byCategory, totalExpenses) {
  var ctx = document.getElementById('chartDonut').getContext('2d');
  if (chartDonut) chartDonut.destroy();
  var legend = document.getElementById('categoryLegend');
  if (byCategory.length === 0) { legend.innerHTML = '<div class="empty-state" style="padding:16px;"><p>Sin gastos este mes</p></div>'; return; }
  chartDonut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: byCategory.map(function (c) { return c.name; }), datasets: [{ data: byCategory.map(function (c) { return c.total; }), backgroundColor: byCategory.map(function (c) { return c.color; }), borderColor: '#16161f', borderWidth: 3, hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e1e2a', titleColor: '#f0f0f5', bodyColor: '#8888a0', borderColor: '#2a2a3a', borderWidth: 1, padding: 12 } } }
  });
  legend.innerHTML = byCategory.slice(0, 8).map(function (c) {
    var pct = totalExpenses > 0 ? ((c.total / totalExpenses) * 100).toFixed(1) : 0;
    return '<div class="legend-item"><div class="legend-color" style="background:' + c.color + '"></div><span class="legend-name">' + c.icon + ' ' + c.name + '</span><span class="legend-value">€' + c.total.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</span><span class="legend-pct">' + pct + '%</span></div>';
  }).join('');
}

// ─── TRANSACTIONS PAGE ────────────────────────────
async function loadTransactions() {
  var params = new URLSearchParams();
  params.set('page', currentPage); params.set('limit', 25);
  var type = document.getElementById('filterType').value;
  var cat = document.getElementById('filterCategory').value;
  var acc = document.getElementById('filterAccount').value;
  var from = document.getElementById('filterFrom').value;
  var to = document.getElementById('filterTo').value;
  var search = document.getElementById('searchInput').value;
  if (type) params.set('type', type);
  if (cat) params.set('category_id', cat);
  if (acc) params.set('account_id', acc);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (search) params.set('search', search);

  var data = await api('/transactions?' + params.toString());
  if (!data) return;
  var tbody = document.getElementById('transactionsTable');
  if (data.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📭</div><p>No se encontraron transacciones</p></div></td></tr>';
  } else {
    var html = '';
    data.data.forEach(function (t) {
      var typeLabel = t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Gasto' : 'Transferencia';
      var sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
      html += '<tr onclick=\'showTransactionDetail(' + JSON.stringify(t).replace(/'/g, "\\'") + ')\'><td style="white-space:nowrap;color:var(--text-muted);font-size:0.82rem;">' + formatDate(t.date) + '</td>' +
        '<td><span class="badge badge-' + t.type + '">' + typeLabel + '</span></td>' +
        '<td>' + (t.description || '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '<td>' + (t.category_icon ? '<span class="category-tag">' + t.category_icon + ' ' + t.category_name + '</span>' : '—') + '</td>' +
        '<td style="font-size:0.82rem;color:var(--text-secondary);">' + (t.account_icon || '') + ' ' + (t.account_name || '') + (t.to_account_name ? ' → ' + (t.to_account_icon || '') + ' ' + t.to_account_name : '') + '</td>' +
        '<td class="amount-' + t.type + '">' + sign + '€' + Math.abs(t.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</td>' +
        '<td><div style="display:flex;gap:4px;" onclick="event.stopPropagation()">' +
        '<button class="btn-icon" onclick=\'openEditTransaction(' + JSON.stringify(t).replace(/'/g, "\\'") + ')\' title="Editar">✏️</button>' +
        '<button class="btn-icon" onclick="deleteTransaction(' + t.id + ')" title="Eliminar">🗑️</button></div></td></tr>';
    });
    tbody.innerHTML = html;
  }
  var pagDiv = document.getElementById('pagination');
  if (data.pages > 1) {
    pagDiv.innerHTML = '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="currentPage--;loadTransactions();">← Anterior</button>' +
      '<span class="page-info">Página ' + data.page + ' de ' + data.pages + '</span>' +
      '<button ' + (currentPage >= data.pages ? 'disabled' : '') + ' onclick="currentPage++;loadTransactions();">Siguiente →</button>';
  } else { pagDiv.innerHTML = data.total > 0 ? '<span class="page-info">' + data.total + ' registros</span>' : ''; }
}

// ─── ACCOUNTS PAGE ────────────────────────────────
async function loadAccountsPage() {
  var accounts = await api('/accounts');
  if (!accounts) return;
  var div = document.getElementById('accountsList');
  if (accounts.length === 0) { div.innerHTML = '<div class="empty-state"><div class="empty-icon">🏦</div><p>No hay cuentas.</p></div>'; return; }
  var typeNames = { bank: 'Banco', cash: 'Efectivo', credit_card: 'Tarjeta Crédito', savings: 'Ahorro', investment: 'Inversión' };
  div.innerHTML = accounts.map(function (a) {
    return '<div class="stat-card" style="cursor:default;"><div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">' +
      '<div style="width:48px;height:48px;background:' + a.color + '22;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">' + (a.icon || '🏦') + '</div>' +
      '<div><div style="font-weight:600;">' + a.name + '</div><div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">' + (typeNames[a.type] || a.type) + ' · ' + a.currency + '</div></div></div>' +
      '<div style="font-family:var(--mono);font-size:1.5rem;font-weight:700;color:' + (a.balance >= 0 ? 'var(--green)' : 'var(--red)') + ';">€' + Math.abs(a.balance).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</div>' +
      '<div style="margin-top:12px;"><button class="btn btn-danger btn-sm" onclick="deleteAccount(' + a.id + ')">Eliminar</button></div></div>';
  }).join('');
}
function openAccountModal() {
  document.getElementById('accName').value = '';
  document.getElementById('accType').value = 'bank';
  document.getElementById('accBalance').value = '0';
  document.getElementById('accCurrency').value = 'EUR';
  document.getElementById('accColor').value = '#6366f1';
  openModal('accountModal');
}
async function saveAccount() {
  var name = document.getElementById('accName').value;
  if (!name) { toast('Escribe un nombre', 'error'); return; }
  var typeIcons = { bank: '🏦', cash: '💵', credit_card: '💳', savings: '🐷', investment: '📈' };
  var type = document.getElementById('accType').value;
  await api('/accounts', 'POST', { name: name, type: type, currency: document.getElementById('accCurrency').value, initial_balance: parseFloat(document.getElementById('accBalance').value) || 0, color: document.getElementById('accColor').value, icon: typeIcons[type] || '🏦' });
  closeModal('accountModal'); toast('Cuenta creada'); await loadAccounts(); loadAccountsPage();
}
async function deleteAccount(id) {
  if (!confirm('¿Eliminar esta cuenta y sus transacciones?')) return;
  await api('/accounts/' + id, 'DELETE'); toast('Cuenta eliminada'); await loadAccounts(); loadAccountsPage();
}

// ─── BUDGETS PAGE ─────────────────────────────────
async function loadBudgetsPage() {
  var budgets = await api('/budgets');
  if (!budgets) return;
  var div = document.getElementById('budgetsList');
  if (budgets.length === 0) { div.innerHTML = '<div class="empty-state"><div class="empty-icon">🎯</div><p>No hay presupuestos.</p></div>'; return; }
  var periodNames = { monthly: 'Mensual', weekly: 'Semanal', yearly: 'Anual' };
  div.innerHTML = budgets.map(function (b) {
    return '<div class="budget-item"><div class="budget-icon">' + b.category_icon + '</div><div class="budget-info">' +
      '<div class="budget-name">' + b.category_name + ' — <span style="color:var(--text-muted);font-size:0.8rem;">' + (periodNames[b.period] || b.period) + '</span></div>' +
      '<div style="font-family:var(--mono);font-size:1.1rem;font-weight:600;margin-top:4px;">€' + b.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</div></div>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteBudget(' + b.id + ')">Eliminar</button></div>';
  }).join('');
}
function openBudgetModal() { document.getElementById('budgetAmount').value = ''; document.getElementById('budgetPeriod').value = 'monthly'; populateCategorySelects(); openModal('budgetModal'); }
async function saveBudget() {
  var amount = parseFloat(document.getElementById('budgetAmount').value);
  var catId = document.getElementById('budgetCategory').value;
  if (!amount || !catId) { toast('Completa todos los campos', 'error'); return; }
  await api('/budgets', 'POST', { category_id: catId, amount: amount, period: document.getElementById('budgetPeriod').value });
  closeModal('budgetModal'); toast('Presupuesto creado'); loadBudgetsPage();
}
async function deleteBudget(id) { if (!confirm('¿Eliminar?')) return; await api('/budgets/' + id, 'DELETE'); toast('Eliminado'); loadBudgetsPage(); }

// ─── CATEGORIES PAGE ──────────────────────────────
async function loadCategoriesPage() {
  var cats = await api('/categories');
  if (!cats) return;
  function render(arr) {
    if (arr.length === 0) return '<div class="empty-state"><p>Sin categorías</p></div>';
    return arr.map(function (c) {
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">' +
        '<div style="width:36px;height:36px;background:' + c.color + '22;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">' + c.icon + '</div>' +
        '<div style="flex:1;"><div style="font-weight:500;">' + c.name + '</div></div>' +
        '<button class="btn-icon" onclick="deleteCategory(' + c.id + ')" title="Eliminar">🗑️</button></div>';
    }).join('');
  }
  document.getElementById('incomeCats').innerHTML = render(cats.filter(function (c) { return c.type === 'income'; }));
  document.getElementById('expenseCats').innerHTML = render(cats.filter(function (c) { return c.type === 'expense'; }));
}
function openCategoryModal() { document.getElementById('catName').value = ''; document.getElementById('catType').value = 'expense'; document.getElementById('catIcon').value = '💰'; document.getElementById('catColor').value = '#6366f1'; openModal('categoryModal'); }
async function saveCategory() {
  var name = document.getElementById('catName').value;
  if (!name) { toast('Escribe un nombre', 'error'); return; }
  await api('/categories', 'POST', { name: name, type: document.getElementById('catType').value, icon: document.getElementById('catIcon').value || '💰', color: document.getElementById('catColor').value });
  closeModal('categoryModal'); toast('Categoría creada'); await loadCategories(); loadCategoriesPage();
}
async function deleteCategory(id) { if (!confirm('¿Eliminar?')) return; await api('/categories/' + id, 'DELETE'); toast('Eliminada'); await loadCategories(); loadCategoriesPage(); }

// ─── SAVINGS PAGE ─────────────────────────────────
async function loadSavingsPage() {
  var data = await api('/savings-recommendation');
  if (!data) return;

  document.getElementById('savingsBalance').textContent = formatMoney(data.savingsAccountBalance);
  document.getElementById('avgIncome').textContent = formatMoney(data.avgIncome);
  document.getElementById('avgExpenses').textContent = formatMoney(data.avgExpenses);
  document.getElementById('recommendedSavings').textContent = formatMoney(data.recommendedSavings);

  // Show goal progress
  var goalTarget = data.plan?.goal_target || 0;
  var current = data.savingsAccountBalance || 0;
  var goalPct = goalTarget > 0 ? Math.min((current / goalTarget) * 100, 100) : 0;
  var remaining = Math.max(0, goalTarget - current);

  document.getElementById('savingsGoalTarget').textContent = goalTarget > 0 ? formatMoney(goalTarget) : 'Sin meta';
  document.getElementById('savingsProgressBar').style.width = goalPct + '%';
  document.getElementById('savingsProgressPct').textContent = Math.round(goalPct) + '%';
  document.getElementById('savingsProgressRemaining').textContent = goalTarget > 0 ?
    (goalPct >= 100 ? '✅ ¡Meta alcanzada!' : 'Faltan ' + formatMoney(remaining)) : 'Configura una meta';

  var recDiv = document.getElementById('savingsRecommendation');
  var pct = data.targetPercentage;
  var canSave = data.avgBalance > 0;
  var currentSavingsRate = data.avgIncome > 0 ? ((data.recommendedSavings / data.avgIncome) * 100).toFixed(1) : 0;

  if (data.avgIncome === 0) {
    recDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Añade transacciones de ingresos para ver recomendaciones</p></div>';
  } else {
    recDiv.innerHTML =
      '<div style="padding:8px 0;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span>Tu objetivo</span><strong>' + pct + '% de ingresos</strong></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span>Ahorro recomendado</span><strong style="color:var(--green);">€' + data.recommendedSavings.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '/mes</strong></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span>Balance promedio disponible</span><strong style="color:' + (canSave ? 'var(--green)' : 'var(--red)') + ';">€' + data.avgBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</strong></div>' +
      '<div style="margin-top:20px;padding:16px;background:var(--glass);border-radius:var(--radius-sm);border-left:4px solid var(--primary);">' +
      '<strong>💡 Recomendación:</strong><br>' +
      (canSave
        ? 'Transfiere <strong>€' + data.recommendedSavings.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</strong> al mes a tu hucha. Esto es el ' + currentSavingsRate + '% de tus ingresos.'
        : 'Tu balance es negativo. Intenta reducir gastos antes de ahorrar.') +
      '</div></div>';
  }
}

function openSavingsPlanModal() {
  var planAccount = document.getElementById('planAccount');
  var savingsAccounts = allAccounts.filter(function (a) { return a.type === 'savings' || a.type === 'bank'; });
  planAccount.innerHTML = '<option value="">Sin cuenta específica</option>' +
    savingsAccounts.map(function (a) { return '<option value="' + a.id + '">' + (a.icon || '🏦') + ' ' + a.name + '</option>'; }).join('');

  api('/savings-plan').then(function (plan) {
    if (plan) {
      document.getElementById('planName').value = plan.name || 'Mi Plan de Ahorro';
      document.getElementById('planPercentage').value = plan.target_percentage || 20;
      document.getElementById('planAccount').value = plan.target_account_id || '';
      document.getElementById('planGoalTarget').value = plan.goal_target || 0;
    }
  });
  openModal('savingsPlanModal');
}

async function saveSavingsPlan() {
  var name = document.getElementById('planName').value;
  var pct = parseFloat(document.getElementById('planPercentage').value) || 20;
  var accId = document.getElementById('planAccount').value || null;
  var goalTarget = parseFloat(document.getElementById('planGoalTarget').value) || 0;

  await api('/savings-plan', 'POST', {
    name: name,
    target_percentage: pct,
    goal_target: goalTarget,
    target_account_id: accId,
    is_active: 1
  });
  closeModal('savingsPlanModal');
  toast('Plan de ahorro configurado');
  loadSavingsPage();
}

// Add funds to hucha
function openAddToHuchaModal() {
  var select = document.getElementById('huchaFromAccount');
  select.innerHTML = allAccounts.filter(function (a) { return a.type !== 'savings'; }).map(function (a) {
    return '<option value="' + a.id + '">' + (a.icon || '🏦') + ' ' + a.name + '</option>';
  }).join('');
  document.getElementById('huchaAmount').value = '';
  openModal('addToHuchaModal');
}

async function confirmAddToHucha() {
  var amount = parseFloat(document.getElementById('huchaAmount').value);
  if (!amount || amount <= 0) { toast('Introduce una cantidad válida', 'error'); return; }
  var fromAccountId = document.getElementById('huchaFromAccount').value;

  var result = await api('/savings-plan/add-funds', 'POST', { amount: amount, from_account_id: fromAccountId });
  if (result && result.error) {
    toast(result.error, 'error');
    return;
  }
  closeModal('addToHuchaModal');
  toast('Añadido €' + amount.toFixed(2) + ' a la hucha');
  loadSavingsPage();
  await loadAccounts(); // Refresh account balances
}

// ─── GOALS PAGE ───────────────────────────────────
var allGoals = [];

async function loadGoalsPage() {
  allGoals = await api('/goals') || [];
  var div = document.getElementById('goalsList');

  if (allGoals.length === 0) {
    div.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:60px;"><div class="empty-icon">✈️</div><p>No tienes metas de ahorro.<br>¡Crea una para empezar a ahorrar para tus sueños!</p></div>';
    return;
  }

  div.innerHTML = allGoals.map(function (g) {
    var pct = g.target_amount > 0 ? Math.min((g.current_amount / g.target_amount) * 100, 100) : 0;
    var remaining = Math.max(0, g.target_amount - g.current_amount);
    var dateStr = g.target_date ? formatDate(g.target_date) : 'Sin fecha';
    var completed = pct >= 100;

    return '<div class="goal-card" style="--goal-color:' + g.color + '">' +
      '<div class="goal-header">' +
      '<div class="goal-icon">' + g.icon + '</div>' +
      '<div class="goal-actions">' +
      '<button class="btn-icon" onclick="openAddFundsModal(' + g.id + ')" title="Añadir fondos">💰</button>' +
      '<button class="btn-icon" onclick="openEditGoal(' + g.id + ')" title="Editar">✏️</button>' +
      '<button class="btn-icon" onclick="deleteGoal(' + g.id + ')" title="Eliminar">🗑️</button>' +
      '</div></div>' +
      '<div class="goal-name">' + g.name + '</div>' +
      '<div class="goal-progress-ring">' +
      '<svg viewBox="0 0 100 100">' +
      '<circle class="goal-ring-bg" cx="50" cy="50" r="42"></circle>' +
      '<circle class="goal-ring-fill" cx="50" cy="50" r="42" style="stroke-dashoffset:' + (264 - (264 * pct / 100)) + ';stroke:' + g.color + ';"></circle>' +
      '</svg>' +
      '<div class="goal-pct">' + Math.round(pct) + '%</div>' +
      '</div>' +
      '<div class="goal-amounts">' +
      '<span class="goal-current">€' + g.current_amount.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</span>' +
      '<span class="goal-target">de €' + g.target_amount.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '</span>' +
      '</div>' +
      '<div class="goal-footer">' +
      '<span>📅 ' + dateStr + '</span>' +
      '<span>' + (completed ? '✅ ¡Completada!' : 'Faltan €' + remaining.toLocaleString('es-ES', { minimumFractionDigits: 2 })) + '</span>' +
      '</div></div>';
  }).join('');
}

function openGoalModal() {
  document.getElementById('goalId').value = '';
  document.getElementById('goalModalTitle').textContent = 'Nueva meta';
  document.getElementById('goalName').value = '';
  document.getElementById('goalTarget').value = '';
  document.getElementById('goalCurrent').value = '0';
  document.getElementById('goalDate').value = '';
  document.getElementById('goalColor').value = '#6366f1';
  document.getElementById('goalIcon').value = '✈️';
  openModal('goalModal');
}

function openEditGoal(id) {
  var goal = allGoals.find(function (g) { return g.id === id; });
  if (!goal) return;
  document.getElementById('goalId').value = goal.id;
  document.getElementById('goalModalTitle').textContent = 'Editar meta';
  document.getElementById('goalName').value = goal.name;
  document.getElementById('goalTarget').value = goal.target_amount;
  document.getElementById('goalCurrent').value = goal.current_amount;
  document.getElementById('goalDate').value = goal.target_date || '';
  document.getElementById('goalColor').value = goal.color || '#6366f1';
  document.getElementById('goalIcon').value = goal.icon || '🎯';
  openModal('goalModal');
}

async function saveGoal() {
  var name = document.getElementById('goalName').value;
  var target = parseFloat(document.getElementById('goalTarget').value);
  if (!name || !target) { toast('Completa nombre y objetivo', 'error'); return; }

  var body = {
    name: name,
    icon: document.getElementById('goalIcon').value || '🎯',
    target_amount: target,
    current_amount: parseFloat(document.getElementById('goalCurrent').value) || 0,
    target_date: document.getElementById('goalDate').value || null,
    color: document.getElementById('goalColor').value || '#6366f1'
  };

  var id = document.getElementById('goalId').value;
  if (id) {
    await api('/goals/' + id, 'PUT', body);
    toast('Meta actualizada');
  } else {
    await api('/goals', 'POST', body);
    toast('Meta creada');
  }
  closeModal('goalModal');
  loadGoalsPage();
}

function openAddFundsModal(id) {
  var goal = allGoals.find(function (g) { return g.id === id; });
  if (!goal) return;
  document.getElementById('addFundsGoalId').value = id;
  document.getElementById('addFundsGoalName').textContent = goal.name;

  var select = document.getElementById('addFundsAccount');
  select.innerHTML = '<option value="">Selecciona cuenta</option>' + allAccounts.map(function (a) {
    return '<option value="' + a.id + '">' + (a.icon || '🏦') + ' ' + a.name + '</option>';
  }).join('');

  document.getElementById('addFundsAmount').value = '';
  openModal('addFundsModal');
}

async function confirmAddFunds() {
  var id = document.getElementById('addFundsGoalId').value;
  var amount = parseFloat(document.getElementById('addFundsAmount').value);
  var accountId = document.getElementById('addFundsAccount').value;

  if (!amount || amount <= 0) { toast('Introduce una cantidad válida', 'error'); return; }
  if (!accountId) { toast('Selecciona una cuenta de origen', 'error'); return; }

  var result = await api('/goals/' + id + '/add-funds', 'POST', { amount: amount, from_account_id: accountId });
  if (result.error) { toast(result.error, 'error'); return; }

  closeModal('addFundsModal');
  toast('Fondos añadidos');
  loadGoalsPage();
  loadAccounts(); // Refresh accounts because balance changed
}

async function deleteGoal(id) {
  if (!confirm('¿Eliminar esta meta?')) return;
  await api('/goals/' + id, 'DELETE');
  toast('Meta eliminada');
  loadGoalsPage();
}

// ─── RECURRING EXPENSES ───────────────────────────────
// ─── TASKS ─────────────────────────────
var allTasks = [];
var currentTaskFilter = 'pending';

async function loadTasksPage() {
  var data = await api('/tasks');
  if (!data) return;

  allTasks = data.tasks || [];
  document.getElementById('tasksPending').textContent = data.pending;
  document.getElementById('tasksCompleted').textContent = data.completed;
  document.getElementById('tasksTotal').textContent = data.total;

  renderTasks();
}

function filterTasks(filter, el) {
  currentTaskFilter = filter;
  document.querySelectorAll('.task-filter-tab').forEach(function (t) {
    t.classList.remove('active');
    t.classList.remove('btn-primary');
    t.classList.add('btn-secondary');
  });
  if (el) {
    el.classList.add('active');
    el.classList.remove('btn-secondary');
    el.classList.add('btn-primary');
  }
  renderTasks();
}

function renderTasks() {
  var div = document.getElementById('tasksList');
  var filtered = allTasks;

  if (currentTaskFilter === 'pending') {
    filtered = allTasks.filter(function (t) { return !t.is_completed; });
  } else if (currentTaskFilter === 'completed') {
    filtered = allTasks.filter(function (t) { return t.is_completed; });
  }

  if (filtered.length === 0) {
    var msg = currentTaskFilter === 'completed'
      ? 'No has completado ninguna tarea aún.'
      : currentTaskFilter === 'pending'
        ? '¡No tienes tareas pendientes! 🎉'
        : 'No tienes tareas. Añade una para empezar.';
    div.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>' + msg + '</p></div>';
    return;
  }

  var priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' };
  var priorityLabel = { high: 'Alta', medium: 'Media', low: 'Baja' };

  div.innerHTML = filtered.map(function (t) {
    var checked = t.is_completed ? 'checked' : '';
    var strikeStyle = t.is_completed ? 'text-decoration:line-through;opacity:0.6;' : '';
    var dueStr = '';
    if (t.due_date) {
      var today = new Date().toISOString().split('T')[0];
      var isOverdue = !t.is_completed && t.due_date < today;
      var isToday = t.due_date === today;
      var color = isOverdue ? 'var(--red)' : isToday ? 'var(--amber, #f59e0b)' : 'var(--text-muted)';
      var label = isOverdue ? '⚠️ Vencida' : isToday ? '📅 Hoy' : '📅 ' + formatDate(t.due_date);
      dueStr = '<span style="color:' + color + ';font-size:0.8rem;font-weight:500;">' + label + '</span>';
    }
    var descHtml = t.description ? '<div style="color:var(--text-muted);font-size:0.85rem;margin-top:2px;">' + escapeHtml(t.description) + '</div>' : '';

    return '<div class="list-item" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);gap:12px;">' +
      '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0;">' +
      '<label style="cursor:pointer;flex-shrink:0;margin-top:2px;">' +
      '<input type="checkbox" ' + checked + ' onchange="toggleTask(' + t.id + ')" style="width:20px;height:20px;accent-color:var(--primary);cursor:pointer;">' +
      '</label>' +
      '<div style="min-width:0;flex:1;' + strikeStyle + '">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<strong style="font-size:0.95rem;">' + escapeHtml(t.title) + '</strong>' +
      '<span style="font-size:0.75rem;padding:2px 8px;border-radius:99px;background:var(--bg-secondary);">' + priorityIcon[t.priority] + ' ' + priorityLabel[t.priority] + '</span>' +
      (dueStr ? dueStr : '') +
      '</div>' +
      descHtml +
      '</div>' +
      '</div>' +
      '<div style="display:flex;gap:4px;flex-shrink:0;">' +
      '<button class="btn btn-sm" onclick="editTask(' + t.id + ')" title="Editar">✏️</button>' +
      '<button class="btn btn-sm" onclick="deleteTask(' + t.id + ')" title="Eliminar">🗑️</button>' +
      '</div></div>';
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openTaskModal(t) {
  document.getElementById('taskId').value = t ? t.id : '';
  document.getElementById('taskTitle').value = t ? t.title : '';
  document.getElementById('taskDescription').value = t ? (t.description || '') : '';
  document.getElementById('taskPriority').value = t ? t.priority : 'medium';
  document.getElementById('taskDueDate').value = t ? (t.due_date || '') : '';
  document.getElementById('taskModalTitle').textContent = t ? 'Editar tarea' : 'Nueva tarea';
  openModal('taskModal');
  setTimeout(function () { document.getElementById('taskTitle').focus(); }, 200);
}

function editTask(id) {
  var t = allTasks.find(function (x) { return x.id === id; });
  if (t) openTaskModal(t);
}

async function saveTask() {
  var id = document.getElementById('taskId').value;
  var title = document.getElementById('taskTitle').value.trim();
  if (!title) {
    toast('Escribe un título para la tarea', 'error');
    return;
  }
  var data = {
    title: title,
    description: document.getElementById('taskDescription').value.trim() || null,
    priority: document.getElementById('taskPriority').value,
    due_date: document.getElementById('taskDueDate').value || null
  };

  if (id) {
    var existing = allTasks.find(function (x) { return x.id === parseInt(id); });
    data.is_completed = existing ? existing.is_completed : 0;
    await api('/tasks/' + id, 'PUT', data);
    toast('Tarea actualizada ✏️');
  } else {
    await api('/tasks', 'POST', data);
    toast('Tarea creada ✅');
  }
  closeModal('taskModal');
  loadTasksPage();
}

async function toggleTask(id) {
  await api('/tasks/' + id + '/toggle', 'PATCH');
  loadTasksPage();
}

async function deleteTask(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  await api('/tasks/' + id, 'DELETE');
  toast('Tarea eliminada');
  loadTasksPage();
}

// ─── DEBTS ───────────────────────────────
var allDebts = [];

async function loadDebtsPage() {
  var data = await api('/debts');
  if (!data) return;

  allDebts = data.debts || [];
  document.getElementById('totalOwed').textContent = formatMoney(data.totalOwed);
  document.getElementById('totalOwe').textContent = formatMoney(data.totalOwe);

  var owed = allDebts.filter(function (d) { return d.type === 'owed'; });
  var owe = allDebts.filter(function (d) { return d.type === 'owe'; });

  document.getElementById('debtsOwedList').innerHTML = owed.length === 0 ?
    '<div class="empty-state" style="padding:20px;"><p>Nadie te debe dinero</p></div>' :
    owed.map(renderDebt).join('');

  document.getElementById('debtsOweList').innerHTML = owe.length === 0 ?
    '<div class="empty-state" style="padding:20px;"><p>No debes dinero a nadie</p></div>' :
    owe.map(renderDebt).join('');
}

function renderDebt(d) {
  var remaining = d.amount - (d.paid_amount || 0);
  var pct = d.amount > 0 ? ((d.paid_amount || 0) / d.amount) * 100 : 0;
  var opacity = d.is_settled ? 'opacity:0.5;' : '';
  var icon = d.type === 'owed' ? '📥' : '📤';

  return '<div class="list-item" style="padding:16px;border-bottom:1px solid var(--border);' + opacity + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
    '<div><strong>' + d.name + '</strong><br><small style="color:var(--text-secondary);">' + icon + ' ' + d.person + (d.due_date ? ' · Vence: ' + formatDate(d.due_date) : '') + '</small></div>' +
    '<div style="text-align:right;"><strong>' + formatMoney(remaining) + '</strong>' + (d.is_settled ? ' ✅' : '') + '</div></div>' +
    '<div class="budget-bar" style="margin-top:8px;height:6px;"><div class="budget-bar-fill" style="width:' + pct + '%;background:var(--primary);"></div></div>' +
    '<div style="display:flex;gap:8px;margin-top:8px;">' +
    (d.is_settled ? '' : '<button class="btn btn-sm btn-primary" onclick="openPayDebt(' + d.id + ')">💰 Pagar</button>') +
    '<button class="btn btn-sm" onclick="deleteDebt(' + d.id + ')">🗑️</button></div></div>';
}

function openDebtModal(d) {
  document.getElementById('debtId').value = d ? d.id : '';
  document.getElementById('debtName').value = d ? d.name : '';
  document.getElementById('debtPerson').value = d ? d.person : '';
  document.getElementById('debtAmount').value = d ? d.amount : '';
  document.getElementById('debtType').value = d ? d.type : 'owed';
  document.getElementById('debtDueDate').value = d ? d.due_date : '';
  document.getElementById('debtNotes').value = d ? d.notes : '';
  document.getElementById('debtModalTitle').textContent = d ? 'Editar deuda' : 'Nueva deuda';
  openModal('debtModal');
}

async function saveDebt() {
  var id = document.getElementById('debtId').value;
  var data = {
    name: document.getElementById('debtName').value,
    person: document.getElementById('debtPerson').value,
    amount: parseFloat(document.getElementById('debtAmount').value),
    type: document.getElementById('debtType').value,
    due_date: document.getElementById('debtDueDate').value || null,
    notes: document.getElementById('debtNotes').value || null
  };

  if (id) {
    await api('/debts/' + id, 'PUT', data);
    toast('Deuda actualizada');
  } else {
    await api('/debts', 'POST', data);
    toast('Deuda creada');
  }
  closeModal('debtModal');
  loadDebtsPage();
}

function openPayDebt(id) {
  var d = allDebts.find(function (x) { return x.id === id; });
  if (!d) return;

  var remaining = d.amount - (d.paid_amount || 0);
  document.getElementById('payDebtId').value = id;
  document.getElementById('payDebtInfo').innerHTML = '<strong>' + d.name + '</strong> - ' + d.person + '<br>Pendiente: ' + formatMoney(remaining);
  document.getElementById('payDebtAmount').value = remaining;
  openModal('payDebtModal');
}

async function confirmPayDebt() {
  var id = document.getElementById('payDebtId').value;
  var amount = parseFloat(document.getElementById('payDebtAmount').value);

  await api('/debts/' + id + '/pay', 'POST', { amount: amount });
  toast('Pago registrado');
  closeModal('payDebtModal');
  loadDebtsPage();
}

async function deleteDebt(id) {
  if (!confirm('¿Eliminar esta deuda?')) return;
  await api('/debts/' + id, 'DELETE');
  toast('Deuda eliminada');
  loadDebtsPage();
}

// ─── MONTHLY RECAP ───────────────────────────────
async function loadRecap() {
  var monthInput = document.getElementById('recapMonth');
  if (!monthInput.value) {
    var now = new Date();
    monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  var parts = monthInput.value.split('-');
  var year = parts[0];
  var month = parts[1];

  var data = await api('/recap/' + year + '/' + month);
  if (!data) return;

  document.getElementById('recapIncome').textContent = formatMoney(data.income);
  document.getElementById('recapExpenses').textContent = formatMoney(data.expenses);
  document.getElementById('recapBalance').textContent = formatMoney(data.balance);
  document.getElementById('recapCount').textContent = data.transactionCount;

  var incChange = document.getElementById('recapIncomeChange');
  var expChange = document.getElementById('recapExpenseChange');

  if (data.incomeChange !== 0) {
    incChange.textContent = (data.incomeChange > 0 ? '↑' : '↓') + ' ' + Math.abs(data.incomeChange).toFixed(1) + '%';
    incChange.style.color = data.incomeChange > 0 ? 'var(--green)' : 'var(--red)';
  } else { incChange.textContent = ''; }

  if (data.expenseChange !== 0) {
    expChange.textContent = (data.expenseChange > 0 ? '↑' : '↓') + ' ' + Math.abs(data.expenseChange).toFixed(1) + '%';
    expChange.style.color = data.expenseChange < 0 ? 'var(--green)' : 'var(--red)';
  } else { expChange.textContent = ''; }

  // Top categories
  var catDiv = document.getElementById('recapCategories');
  if (data.topCategories.length === 0) {
    catDiv.innerHTML = '<div class="empty-state"><p>Sin gastos este mes</p></div>';
  } else {
    catDiv.innerHTML = data.topCategories.map(function (c, i) {
      return '<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">' +
        '<div><span style="margin-right:8px;">' + (c.icon || '📦') + '</span>' + (c.name || 'Sin categoría') + '</div>' +
        '<strong>' + formatMoney(c.total) + '</strong></div>';
    }).join('');
  }

  // Budget alerts
  var alerts = await api('/alerts');
  var alertDiv = document.getElementById('recapAlerts');

  if (!alerts || alerts.length === 0) {
    alertDiv.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-icon">✅</div><p>Todo bajo control.<br>No hay alertas de presupuesto.</p></div>';
  } else {
    alertDiv.innerHTML = alerts.map(function (a) {
      var color = a.exceeded ? 'var(--red)' : 'var(--yellow)';
      var icon = a.exceeded ? '🚨' : '⚠️';
      return '<div style="padding:12px;margin-bottom:8px;background:var(--glass);border-radius:var(--radius-sm);border-left:4px solid ' + color + ';">' +
        '<div style="display:flex;justify-content:space-between;">' +
        '<span>' + icon + ' ' + (a.icon || '') + ' ' + a.category + '</span>' +
        '<strong style="color:' + color + ';">' + a.percentage + '%</strong></div>' +
        '<small style="color:var(--text-secondary);">' + formatMoney(a.spent) + ' de ' + formatMoney(a.budget) + '</small></div>';
    }).join('');
  }
}

// ─── IMPORT CSV / EXCEL ─────────────────────────────
var importParsedRows = [];
var xlsxLoaded = false;

function openImportModal() {
  try {
    var fileEl = document.getElementById('importFile');
    var previewEl = document.getElementById('importPreview');
    var btnEl = document.getElementById('importBtn');
    if (fileEl) fileEl.value = '';
    if (previewEl) previewEl.style.display = 'none';
    if (btnEl) btnEl.disabled = true;
    importParsedRows = [];
    openModal('importModal');
  } catch (e) {
    alert('Error abriendo importar: ' + e.message);
  }
}

function loadXLSXLibrary(callback) {
  if (xlsxLoaded && typeof XLSX !== 'undefined') { callback(); return; }
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  script.onload = function () { xlsxLoaded = true; callback(); };
  script.onerror = function () { toast('No se pudo cargar la librería de Excel. Prueba con CSV.', 'error'); };
  document.head.appendChild(script);
}

function previewImportFile() {
  var file = document.getElementById('importFile').files[0];
  if (!file) return;

  var ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      var rows = parseCSV(text);
      handleParsedRows(rows);
    };
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    loadXLSXLibrary(function () {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          var sheet = workbook.Sheets[workbook.SheetNames[0]];
          var jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          var rows = jsonData.map(function (row) {
            var normalized = {};
            Object.keys(row).forEach(function (key) {
              normalized[key.trim().toLowerCase()] = row[key];
            });
            return normalized;
          });
          handleParsedRows(rows);
        } catch (err) {
          toast('Error al leer el archivo Excel: ' + err.message, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    });
  } else {
    toast('Formato no soportado. Usa CSV o Excel (.xlsx)', 'error');
  }
}

function parseCSV(text) {
  var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  if (lines.length < 2) return [];

  var sep = ',';
  if (lines[0].split(';').length > lines[0].split(',').length) sep = ';';
  if (lines[0].split('\t').length > lines[0].split(sep).length) sep = '\t';

  var headers = parseCSVLine(lines[0], sep).map(function (h) {
    return h.trim().toLowerCase()
      .replace(/^\ufeff/, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  });

  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var vals = parseCSVLine(lines[i], sep);
    if (vals.length === 0) continue;
    var obj = {};
    headers.forEach(function (h, idx) {
      obj[h] = (vals[idx] || '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line, sep) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === sep) { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function handleParsedRows(rows) {
  if (!rows || rows.length === 0) {
    toast('No se encontraron datos en el archivo', 'error');
    return;
  }

  var colMap = {
    'fecha': 'date', 'date': 'date',
    'tipo': 'type', 'type': 'type',
    'monto': 'amount', 'amount': 'amount', 'cantidad': 'amount', 'importe': 'amount',
    'descripcion': 'description', 'description': 'description', 'concepto': 'description',
    'categoria': 'category', 'category': 'category',
    'cuenta': 'account', 'account': 'account',
    'notas': 'notes', 'notes': 'notes', 'nota': 'notes'
  };

  importParsedRows = rows.map(function (row) {
    var mapped = {};
    Object.keys(row).forEach(function (key) {
      var clean = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      var target = colMap[clean];
      if (target) mapped[target] = row[key];
    });
    if (mapped.date instanceof Date) {
      var d = mapped.date;
      mapped.date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // Clean amount: strip currency symbols (€, EUR, USD, $, etc.) and whitespace
    if (mapped.amount !== undefined) {
      var rawAmt = mapped.amount.toString().replace(/[€$£¥]/g, '').replace(/EUR|USD|GBP|MXN/gi, '').trim();
      rawAmt = rawAmt.replace(/\s/g, '');
      // Handle comma as decimal separator (but not thousands separator)
      // If has both . and , -> comma is decimal (European format like 1.234,56)
      if (rawAmt.indexOf('.') !== -1 && rawAmt.indexOf(',') !== -1) {
        rawAmt = rawAmt.replace(/\./g, '').replace(',', '.');
      } else {
        rawAmt = rawAmt.replace(',', '.');
      }
      var numAmt = parseFloat(rawAmt);

      // Auto-detect type from sign of amount if no valid type is set
      var type = (mapped.type || '').toLowerCase().trim();
      if (type !== 'income' && type !== 'expense' && type !== 'ingreso' && type !== 'gasto') {
        if (!isNaN(numAmt)) {
          if (numAmt < 0) {
            mapped.type = 'expense';
          } else {
            mapped.type = 'income';
          }
        }
      }

      // Store clean absolute amount
      if (!isNaN(numAmt)) {
        mapped.amount = Math.abs(numAmt).toString();
      }
    }

    return mapped;
  });

  var preview = document.getElementById('importPreview');
  preview.style.display = '';

  var warnings = 0;
  importParsedRows.forEach(function (r) {
    var type = (r.type || '').toLowerCase();
    if (type !== 'income' && type !== 'expense' && type !== 'ingreso' && type !== 'gasto') warnings++;
    var amt = parseFloat((r.amount || '0').toString().replace(',', '.'));
    if (isNaN(amt) || amt <= 0) warnings++;
  });

  document.getElementById('importPreviewCount').textContent = importParsedRows.length + ' transacciones encontradas';
  document.getElementById('importPreviewWarnings').textContent = warnings > 0 ? '⚠️ ' + warnings + ' posibles errores' : '✅ Todo correcto';

  var thead = '<tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th></tr>';
  document.getElementById('importPreviewHead').innerHTML = thead;

  var maxPreview = Math.min(importParsedRows.length, 50);
  var tbody = '';
  for (var i = 0; i < maxPreview; i++) {
    var r = importParsedRows[i];
    var type = (r.type || '').toLowerCase();
    var isValid = (type === 'income' || type === 'expense' || type === 'ingreso' || type === 'gasto');
    tbody += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + (r.date || '-') + '</td>' +
      '<td><span class="' + (isValid ? 'import-badge-ok' : 'import-badge-err') + '">' + (r.type || '-') + '</span></td>' +
      '<td style="text-align:right;font-family:var(--mono);">€' + (r.amount || '0') + '</td>' +
      '<td>' + (r.description || '-') + '</td>' +
      '<td>' + (r.category || '-') + '</td>' +
      '<td>' + (r.account || '-') + '</td>' +
      '</tr>';
  }
  if (importParsedRows.length > 50) {
    tbody += '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:12px;">... y ' + (importParsedRows.length - 50) + ' más</td></tr>';
  }
  document.getElementById('importPreviewBody').innerHTML = tbody;
  document.getElementById('importBtn').disabled = false;
}

async function executeImport() {
  if (importParsedRows.length === 0) return;

  var btn = document.getElementById('importBtn');
  btn.disabled = true;
  btn.textContent = 'Importando...';

  try {
    var res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: importParsedRows })
    });
    var data = await res.json();
    if (data.success) {
      var msg = '✅ ' + data.imported + ' transacciones importadas';
      if (data.skipped > 0) msg += ' (' + data.skipped + ' omitidas)';
      toast(msg, 'success');
      closeModal('importModal');
      loadDashboard();
      var activePage = document.querySelector('.page.active');
      if (activePage && activePage.id === 'page-transactions') loadTransactions();
    } else {
      toast('Error: ' + (data.error || 'Error desconocido'), 'error');
    }
  } catch (e) {
    toast('Error al importar: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Importar transacciones';
}

// ─── ONBOARDING WIZARD ─────────────────────────────
var onboardCurrentStep = 1;
var onboardCurrency = 'EUR';

var currencySymbols = { EUR: '€', USD: '$', GBP: '£', MXN: '$', ARS: '$', COP: '$' };

function showOnboarding() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('onboardingScreen').style.display = '';

  // Setup currency selection listeners
  document.querySelectorAll('.onboard-currency-option').forEach(function (opt) {
    opt.addEventListener('click', function () {
      document.querySelectorAll('.onboard-currency-option').forEach(function (o) { o.classList.remove('selected'); });
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
      onboardCurrency = opt.dataset.currency;
      updateCurrencySymbols();
    });
  });

  onboardCurrentStep = 1;
  showOnboardStep(1);
}

function updateCurrencySymbols() {
  var sym = currencySymbols[onboardCurrency] || onboardCurrency;
  var els = document.querySelectorAll('.onboard-currency-symbol');
  els.forEach(function (el) { el.textContent = sym; });
}

function showOnboardStep(step) {
  document.querySelectorAll('.onboard-step').forEach(function (s) { s.classList.remove('active'); });
  document.getElementById('onboardStep' + step).classList.add('active');
  document.getElementById('onboardProgressBar').style.width = (step * 25) + '%';
  onboardCurrentStep = step;

  if (step === 4) buildOnboardSummary();
}

function onboardNext(step) {
  // Validate current step before moving forward
  if (step > onboardCurrentStep) {
    if (onboardCurrentStep === 2) {
      var name = document.getElementById('onboardAccName1').value.trim();
      if (!name) {
        document.getElementById('onboardAccName1').focus();
        return;
      }
    }
  }
  showOnboardStep(step);
}

var extraAccountsShown = 0;
function showExtraAccount() {
  if (extraAccountsShown === 0) {
    document.getElementById('onboardExtra2').style.display = '';
    extraAccountsShown = 1;
    document.getElementById('addExtraAccBtn').style.display = 'none';
  }
}

function getOnboardAccounts() {
  var accounts = [];

  // Main account (always)
  var name1 = document.getElementById('onboardAccName1').value.trim();
  if (name1) {
    accounts.push({
      name: name1,
      type: document.getElementById('onboardAccType1').value,
      initial_balance: parseFloat(document.getElementById('onboardAccBalance1').value) || 0
    });
  }

  // Extra account 1
  var name2 = document.getElementById('onboardAccName2').value.trim();
  if (name2) {
    accounts.push({
      name: name2,
      type: document.getElementById('onboardAccType2').value,
      initial_balance: parseFloat(document.getElementById('onboardAccBalance2').value) || 0
    });
  }

  // Extra account 2
  var name3El = document.getElementById('onboardAccName3');
  if (name3El) {
    var name3 = name3El.value.trim();
    if (name3) {
      accounts.push({
        name: name3,
        type: document.getElementById('onboardAccType3').value,
        initial_balance: parseFloat(document.getElementById('onboardAccBalance3').value) || 0
      });
    }
  }

  return accounts;
}

function buildOnboardSummary() {
  var sym = currencySymbols[onboardCurrency] || onboardCurrency;
  var accounts = getOnboardAccounts();
  var total = 0;

  var accIcons = { bank: '🏦', cash: '💵', credit_card: '💳', savings: '🐷', investment: '📈' };

  var html = '<div class="onboard-summary-row"><div class="label">🌐 Moneda</div><div class="value">' + onboardCurrency + '</div></div>';

  accounts.forEach(function (acc) {
    total += acc.initial_balance;
    html += '<div class="onboard-summary-row">' +
      '<div class="label">' + (accIcons[acc.type] || '🏦') + ' ' + acc.name + '</div>' +
      '<div class="value">' + sym + formatNum(acc.initial_balance) + '</div>' +
      '</div>';
  });

  if (accounts.length === 0) {
    html += '<div class="onboard-summary-row"><div class="label" style="color:var(--text-muted);">No has configurado ninguna cuenta</div></div>';
  }

  html += '<div class="onboard-summary-total">' +
    '<div class="label">Patrimonio total</div>' +
    '<div class="value">' + sym + formatNum(total) + '</div>' +
    '</div>';

  document.getElementById('onboardSummary').innerHTML = html;
}

function formatNum(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function finishOnboarding() {
  var btn = document.getElementById('onboardFinishBtn');
  btn.disabled = true;
  btn.textContent = 'Configurando...';

  var accounts = getOnboardAccounts();

  // Ensure at least one account
  if (accounts.length === 0) {
    accounts.push({ name: 'Cuenta principal', type: 'bank', initial_balance: 0 });
  }

  try {
    var res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currency: onboardCurrency,
        accounts: accounts
      })
    });
    var data = await res.json();
    if (data.success) {
      currentUser.is_onboarded = 1;
      document.getElementById('onboardingScreen').style.display = 'none';
      showApp();
      toast('🎉 ¡Todo configurado! Bienvenido/a, ' + currentUser.name.split(' ')[0] + '.');
    } else {
      toast('Error: ' + (data.error || 'Error desconocido'), 'error');
    }
  } catch (e) {
    toast('Error de conexión', 'error');
  }

  btn.disabled = false;
  btn.textContent = '🎉 Empezar a usar Taitou';
}

// ─── iOS SHORTCUTS / API TOKENS ────────────────────

async function loadShortcutsPage() {
  // Set the API URL
  var baseUrl = window.location.origin;
  var urlEl = document.getElementById('shortcutApiUrl');
  if (urlEl) urlEl.textContent = baseUrl + '/shortcuts/transaction';

  // Load tokens
  try {
    var data = await api('/tokens');
    if (!data) return;
    var container = document.getElementById('tokensList');
    if (!data.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔐</div><p>No tienes tokens creados</p><p style="color:var(--dim);font-size:0.85rem;">Crea uno para empezar a usar los atajos</p></div>';
      return;
    }
    container.innerHTML = data.map(function (t) {
      var lastUsed = t.last_used ? formatDate(t.last_used.split(' ')[0] || t.last_used.split('T')[0]) : 'Nunca';
      var statusClass = t.is_active ? 'green' : 'red';
      var statusText = t.is_active ? 'Activo' : 'Desactivado';
      return '<div class="list-row" style="display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid var(--border);">' +
        '<div style="flex:1;">' +
        '<div style="font-weight:600;margin-bottom:4px;">' + (t.name || 'Token') + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<code style="background:var(--elevated);padding:2px 8px;border-radius:4px;font-size:0.8rem;color:var(--muted);" id="token-display-' + t.id + '">' + t.token_masked + '</code>' +
        '<button class="btn-icon" onclick="toggleTokenVisibility(' + t.id + ', \'' + t.token_full + '\', \'' + t.token_masked + '\')" title="Mostrar/ocultar" style="font-size:0.8rem;cursor:pointer;background:none;border:none;color:var(--muted);">👁️</button>' +
        '<button class="btn-icon" onclick="copyToken(\'' + t.token_full + '\')" title="Copiar" style="font-size:0.8rem;cursor:pointer;background:none;border:none;color:var(--muted);">📋</button>' +
        '</div>' +
        '<div style="font-size:0.8rem;color:var(--dim);margin-top:6px;">Último uso: ' + lastUsed + ' · Creado: ' + formatDate(t.created_at.split(' ')[0] || t.created_at.split('T')[0]) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
        '<span style="background:var(--' + statusClass + '-dim);color:var(--' + statusClass + ');padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;">' + statusText + '</span>' +
        '<button class="btn btn-sm" style="font-size:0.8rem;padding:6px 12px;" onclick="toggleToken(' + t.id + ')">' + (t.is_active ? '⏸ Pausar' : '▶ Activar') + '</button>' +
        '<button class="btn btn-sm" style="font-size:0.8rem;padding:6px 12px;color:var(--red);" onclick="deleteToken(' + t.id + ')">🗑️</button>' +
        '</div>' +
        '</div>';
    }).join('');
  } catch (e) {
    toast('Error cargando tokens', 'error');
  }
}

async function createToken() {
  var name = prompt('Nombre del token (ej: Mi iPhone, iPad de trabajo...)');
  if (name === null) return;
  name = name || 'iOS Shortcut';
  try {
    var data = await api('/tokens', 'POST', { name: name });
    if (data && data.success) {
      toast('Token creado. ¡Cópialo ya!');
      loadShortcutsPage();
      // Show the token in a prompt so user can copy it
      setTimeout(function () {
        var copyMsg = 'Tu nuevo token:\n\n' + data.token + '\n\nGuárdalo ahora, no podrás verlo completo después fácilmente.';
        if (confirm(copyMsg + '\n\n¿Copiar al portapapeles?')) {
          navigator.clipboard.writeText(data.token).then(function () {
            toast('Token copiado al portapapeles');
          }).catch(function () {
            prompt('Copia este token:', data.token);
          });
        }
      }, 300);
    } else {
      toast('Error creando token', 'error');
    }
  } catch (e) {
    toast('Error de conexión', 'error');
  }
}

async function deleteToken(id) {
  if (!confirm('¿Eliminar este token? Los atajos que lo usen dejarán de funcionar.')) return;
  try {
    var data = await api('/tokens/' + id, 'DELETE');
    if (data && data.success) {
      toast('Token eliminado');
      loadShortcutsPage();
    }
  } catch (e) {
    toast('Error eliminando token', 'error');
  }
}

async function toggleToken(id) {
  try {
    var data = await api('/tokens/' + id + '/toggle', 'PUT');
    if (data && data.success) {
      toast(data.is_active ? 'Token activado' : 'Token desactivado');
      loadShortcutsPage();
    }
  } catch (e) {
    toast('Error', 'error');
  }
}

function toggleTokenVisibility(id, full, masked) {
  var el = document.getElementById('token-display-' + id);
  if (el.textContent === masked) {
    el.textContent = full;
  } else {
    el.textContent = masked;
  }
}

function copyToken(token) {
  navigator.clipboard.writeText(token).then(function () {
    toast('Token copiado al portapapeles');
  }).catch(function () {
    prompt('Copia este token:', token);
  });
}

function copyApiUrl() {
  var url = document.getElementById('shortcutApiUrl').textContent;
  navigator.clipboard.writeText(url).then(function () {
    toast('URL copiada');
  }).catch(function () {
    prompt('Copia esta URL:', url);
  });
}

// ─── TRANSACTION DETAIL ─────────────────────────────

function showTransactionDetail(t) {
  var sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
  var amountEl = document.getElementById('txDetailAmount');
  amountEl.textContent = sign + '€' + Math.abs(t.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 });
  amountEl.className = 'tx-detail-amount type-' + t.type;

  var typeLabels = { income: '💚 Ingreso', expense: '🔴 Gasto', transfer: '🔄 Transferencia' };
  document.getElementById('txDetailType').textContent = typeLabels[t.type] || t.type;
  document.getElementById('txDetailDate').textContent = formatDate(t.date);
  document.getElementById('txDetailDesc').textContent = t.description || '—';
  document.getElementById('txDetailCategory').textContent = t.category_icon
    ? t.category_icon + ' ' + t.category_name : '—';

  var accountText = (t.account_icon || '') + ' ' + (t.account_name || '');
  if (t.to_account_name) {
    accountText += ' → ' + (t.to_account_icon || '') + ' ' + t.to_account_name;
  }
  document.getElementById('txDetailAccount').textContent = accountText;

  var notesRow = document.getElementById('txDetailNotesRow');
  if (t.notes) {
    notesRow.style.display = '';
    document.getElementById('txDetailNotes').textContent = t.notes;
  } else {
    notesRow.style.display = 'none';
  }

  document.getElementById('txDetailEditBtn').onclick = function () {
    closeModal('txDetailModal');
    setTimeout(function () { openEditTransaction(t); }, 200);
  };

  document.getElementById('txDetailDeleteBtn').onclick = function () {
    closeModal('txDetailModal');
    setTimeout(function () { deleteTransaction(t.id); }, 200);
  };

  openModal('txDetailModal');
}

// ─── RECEIPT SCANNER ────────────────────────────────
var scannerCurrentFile = null;

function openScannerModal() {
  resetScanner();
  openModal('scannerModal');
}

function scanFromTransaction() {
  closeModal('transactionModal');
  setTimeout(function () {
    openScannerModal();
  }, 250);
}

function closeScannerModal() {
  closeModal('scannerModal');
  resetScanner();
}

function resetScanner() {
  scannerCurrentFile = null;
  document.getElementById('scannerUploadStep').style.display = '';
  document.getElementById('scannerProcessingStep').style.display = 'none';
  document.getElementById('scannerResultsStep').style.display = 'none';
  document.getElementById('scannerErrorStep').style.display = 'none';
  document.getElementById('scannerCreateBtn').style.display = 'none';
  document.getElementById('scannerProgressFill').style.width = '0%';
  document.getElementById('scannerProgressPct').textContent = '0%';
  document.getElementById('scannerProgressText').textContent = 'Preparando OCR...';
  var fileInput = document.getElementById('scannerFileInput');
  if (fileInput) fileInput.value = '';
}

// Setup drag-and-drop + click on dropzone
document.addEventListener('DOMContentLoaded', function () {
  var dropzone = document.getElementById('scannerDropzone');
  if (!dropzone) return;

  dropzone.addEventListener('click', function () {
    document.getElementById('scannerFileInput').click();
  });

  dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
    var files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleScannerFile(files[0]);
    }
  });
});

function handleScannerFile(file) {
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    toast('Por favor selecciona una imagen', 'error');
    return;
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    toast('La imagen es demasiado grande (máx. 10MB)', 'error');
    return;
  }

  scannerCurrentFile = file;

  // Show processing step
  document.getElementById('scannerUploadStep').style.display = 'none';
  document.getElementById('scannerProcessingStep').style.display = '';
  document.getElementById('scannerProcessingStep').classList.add('scanner-processing-active');

  // Show image preview
  var reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById('scannerPreviewImg').src = e.target.result;
    processReceiptOCR(e.target.result);
  };
  reader.readAsDataURL(file);
}

// ─── IMAGE PREPROCESSING (Advanced) ─────────────────
function preprocessImage(imageData) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      // Upscale small images (target ~2200px wide for sharper OCR)
      var scale = 1;
      if (img.width < 1400) scale = 2200 / img.width;
      if (scale > 3.5) scale = 3.5;

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      var w = canvas.width, h = canvas.height;

      ctx.drawImage(img, 0, 0, w, h);
      var imgData = ctx.getImageData(0, 0, w, h);
      var d = imgData.data;

      // 1) Grayscale conversion (luminance)
      var gray = new Float32Array(w * h);
      for (var i = 0; i < d.length; i += 4) {
        gray[i / 4] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }

      // 2) Noise reduction — 3×3 median-ish (average of middle 5 in 9)
      var denoised = new Float32Array(w * h);
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = y * w + x;
          if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) { denoised[idx] = gray[idx]; continue; }
          var vals = [];
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) vals.push(gray[(y + dy) * w + (x + dx)]);
          vals.sort(function (a, b) { return a - b; });
          denoised[idx] = (vals[2] + vals[3] + vals[4] + vals[5] + vals[6]) / 5;
        }
      }

      // 3) Sharpening — unsharp mask (original + k*(original - blurred))
      var sharpened = new Float32Array(w * h);
      var k = 1.2; // sharpening strength
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = y * w + x;
          if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) { sharpened[idx] = denoised[idx]; continue; }
          // Simple 3×3 blur for unsharp mask
          var blur = (denoised[(y - 1) * w + x - 1] + denoised[(y - 1) * w + x] * 2 + denoised[(y - 1) * w + x + 1] +
            denoised[y * w + x - 1] * 2 + denoised[y * w + x] * 4 + denoised[y * w + x + 1] * 2 +
            denoised[(y + 1) * w + x - 1] + denoised[(y + 1) * w + x] * 2 + denoised[(y + 1) * w + x + 1]) / 16;
          var val = denoised[idx] + k * (denoised[idx] - blur);
          sharpened[idx] = Math.max(0, Math.min(255, val));
        }
      }

      // 4) Contrast stretch (2nd/98th percentile normalization)
      var sorted = Array.from(sharpened).sort(function (a, b) { return a - b; });
      var lo = sorted[Math.floor(sorted.length * 0.02)];
      var hi = sorted[Math.floor(sorted.length * 0.98)];
      var range = hi - lo || 1;
      for (var i = 0; i < sharpened.length; i++) {
        sharpened[i] = Math.max(0, Math.min(255, ((sharpened[i] - lo) / range) * 255));
      }

      // 5) Otsu binarization
      var histogram = new Array(256).fill(0);
      for (var i = 0; i < sharpened.length; i++) histogram[Math.round(sharpened[i])]++;
      var totalPx = sharpened.length, gSum = 0;
      for (var t = 0; t < 256; t++) gSum += t * histogram[t];
      var sB = 0, wB = 0, wF, maxV = 0, thr = 128;
      for (var t = 0; t < 256; t++) {
        wB += histogram[t]; if (wB === 0) continue;
        wF = totalPx - wB; if (wF === 0) break;
        sB += t * histogram[t];
        var diff = sB / wB - (gSum - sB) / wF;
        var btwn = wB * wF * diff * diff;
        if (btwn > maxV) { maxV = btwn; thr = t; }
      }

      // Apply to canvas
      for (var i = 0; i < sharpened.length; i++) {
        var v = sharpened[i] > thr ? 255 : 0;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageData;
  });
}

async function processReceiptOCR(imageData) {
  try {
    var progressFill = document.getElementById('scannerProgressFill');
    var progressText = document.getElementById('scannerProgressText');
    var progressPct = document.getElementById('scannerProgressPct');

    progressText.textContent = 'Mejorando imagen...';
    progressFill.style.width = '5%';
    progressPct.textContent = '5%';

    // Preprocess image for better OCR
    var processedImage = await preprocessImage(imageData);

    progressText.textContent = 'Cargando motor OCR...';
    progressFill.style.width = '10%';
    progressPct.textContent = '10%';

    var result = await Tesseract.recognize(processedImage, 'spa+eng', {
      tessedit_pageseg_mode: '6', // uniform block of text (good for receipts)
      logger: function (m) {
        if (m.status === 'recognizing text') {
          var pct = 10 + Math.round((m.progress || 0) * 85); // 10-95%
          progressFill.style.width = pct + '%';
          progressPct.textContent = pct + '%';
          progressText.textContent = 'Leyendo texto...';
        } else if (m.status === 'loading language traineddata') {
          progressText.textContent = 'Cargando idioma...';
          progressFill.style.width = '15%';
          progressPct.textContent = '15%';
        } else if (m.status === 'initializing api') {
          progressText.textContent = 'Inicializando...';
          progressFill.style.width = '12%';
          progressPct.textContent = '12%';
        }
      }
    });

    progressFill.style.width = '100%';
    progressPct.textContent = '100%';
    progressText.textContent = '¡Completado!';

    var ocrText = result.data.text;

    if (!ocrText || ocrText.trim().length < 3) {
      showScannerError('No se pudo leer texto de la imagen. Intenta con una foto más clara.');
      return;
    }

    // Parse the OCR text
    var parsed = parseReceiptText(ocrText);

    // Debug: log OCR output for troubleshooting
    console.log('=== OCR RAW TEXT ===');
    console.log(ocrText);
    console.log('=== PARSED RESULT ===');
    console.log('Amount:', parsed.amount, '| Description:', parsed.description, '| Date:', parsed.date);

    // Show results
    setTimeout(function () {
      showScannerResults(parsed, ocrText);
    }, 500);

  } catch (err) {
    console.error('OCR Error:', err);
    showScannerError('Error al procesar la imagen: ' + (err.message || 'Error desconocido'));
  }
}

function parseReceiptText(text) {
  var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
  var fullText = text.toUpperCase();

  var result = {
    amount: null,
    description: null,
    date: null,
    category: null,
    confidence: { amount: 0, description: 0, date: 0 }
  };

  // ─── Known Spanish stores → category mapping ──────
  var storeDB = [
    // Supermercados
    { patterns: ['MERCADONA', 'HACENDADO'], name: 'Mercadona', cat: 'Supermercado' },
    { patterns: ['LIDL'], name: 'Lidl', cat: 'Supermercado' },
    { patterns: ['CARREFOUR'], name: 'Carrefour', cat: 'Supermercado' },
    { patterns: ['ALDI'], name: 'Aldi', cat: 'Supermercado' },
    { patterns: ['DIA ', ' DIA', 'MAXI DIA'], name: 'Dia', cat: 'Supermercado' },
    { patterns: ['CONSUM'], name: 'Consum', cat: 'Supermercado' },
    { patterns: ['EROSKI'], name: 'Eroski', cat: 'Supermercado' },
    { patterns: ['ALCAMPO'], name: 'Alcampo', cat: 'Supermercado' },
    { patterns: ['HIPERCOR'], name: 'Hipercor', cat: 'Supermercado' },
    { patterns: ['EL CORTE INGL', 'CORTE INGLES'], name: 'El Corte Inglés', cat: 'Compras' },
    { patterns: ['BONPREU', 'BON PREU'], name: 'BonPreu', cat: 'Supermercado' },
    { patterns: ['AHORRAMAS'], name: 'Ahorramas', cat: 'Supermercado' },
    { patterns: ['BM SUPERMERCADO', 'BM SUPER'], name: 'BM', cat: 'Supermercado' },
    { patterns: ['SIMPLY', 'SUPERCOR'], name: 'Simply', cat: 'Supermercado' },
    { patterns: ['CONDIS'], name: 'Condis', cat: 'Supermercado' },
    { patterns: ['SPAR '], name: 'Spar', cat: 'Supermercado' },
    // Gasolineras
    { patterns: ['REPSOL'], name: 'Repsol', cat: 'Transporte' },
    { patterns: ['CEPSA'], name: 'Cepsa', cat: 'Transporte' },
    { patterns: ['BP ', 'BRITISH PETROLEUM'], name: 'BP', cat: 'Transporte' },
    { patterns: ['SHELL'], name: 'Shell', cat: 'Transporte' },
    { patterns: ['GALP'], name: 'Galp', cat: 'Transporte' },
    { patterns: ['GASOLINERA', 'ESTACION DE SERVICIO', 'E.S.', 'E.S '], name: null, cat: 'Transporte' },
    // Restauración
    { patterns: ['MCDONALD', 'MC DONALD'], name: "McDonald's", cat: 'Restaurante' },
    { patterns: ['BURGER KING', 'BK '], name: 'Burger King', cat: 'Restaurante' },
    { patterns: ['TELEPIZZA'], name: 'Telepizza', cat: 'Restaurante' },
    { patterns: ['DOMINOS', "DOMINO'S"], name: "Domino's", cat: 'Restaurante' },
    { patterns: ['KFC '], name: 'KFC', cat: 'Restaurante' },
    { patterns: ['STARBUCKS'], name: 'Starbucks', cat: 'Cafetería' },
    { patterns: ['RESTAURANTE', 'CAFETERIA', 'BAR ', 'CERVECERIA', 'TABERNA', 'MESÓN', 'MESON'], name: null, cat: 'Restaurante' },
    // Farmacia / salud
    { patterns: ['FARMACIA'], name: null, cat: 'Salud' },
    { patterns: ['PARAFARMACIA'], name: null, cat: 'Salud' },
    // Ropa / moda
    { patterns: ['ZARA ', 'INDITEX'], name: 'Zara', cat: 'Ropa' },
    { patterns: ['PULL AND BEAR', 'PULL&BEAR'], name: 'Pull&Bear', cat: 'Ropa' },
    { patterns: ['BERSHKA'], name: 'Bershka', cat: 'Ropa' },
    { patterns: ['PRIMARK'], name: 'Primark', cat: 'Ropa' },
    { patterns: ['H&M', 'H & M', 'HENNES'], name: 'H&M', cat: 'Ropa' },
    { patterns: ['DECATHLON'], name: 'Decathlon', cat: 'Deporte' },
    // Tecnología
    { patterns: ['MEDIAMARKT', 'MEDIA MARKT'], name: 'MediaMarkt', cat: 'Tecnología' },
    { patterns: ['PCCOMPONENTES', 'PC COMPONENTES'], name: 'PcComponentes', cat: 'Tecnología' },
    { patterns: ['APPLE STORE', 'APPLE,'], name: 'Apple', cat: 'Tecnología' },
    { patterns: ['FNAC'], name: 'Fnac', cat: 'Tecnología' },
    // Hogar
    { patterns: ['IKEA'], name: 'IKEA', cat: 'Hogar' },
    { patterns: ['LEROY MERLIN'], name: 'Leroy Merlin', cat: 'Hogar' },
    { patterns: ['BRICOMART', 'BRICO MART'], name: 'Bricomart', cat: 'Hogar' },
    // Transporte
    { patterns: ['RENFE'], name: 'Renfe', cat: 'Transporte' },
    { patterns: ['CABIFY'], name: 'Cabify', cat: 'Transporte' },
    { patterns: ['PARKING', 'APARCAMIENTO', 'GARAJE'], name: null, cat: 'Transporte' },
    // Ocio
    { patterns: ['CINES', 'CINE ', 'YELMO', 'KINEPOLIS', 'CINESA'], name: null, cat: 'Ocio' },
    { patterns: ['SPOTIFY'], name: 'Spotify', cat: 'Suscripciones' },
    { patterns: ['NETFLIX'], name: 'Netflix', cat: 'Suscripciones' },
    { patterns: ['AMAZON'], name: 'Amazon', cat: 'Compras' },
  ];

  // Try to match a known store
  for (var s = 0; s < storeDB.length; s++) {
    var store = storeDB[s];
    for (var p = 0; p < store.patterns.length; p++) {
      if (fullText.indexOf(store.patterns[p]) !== -1) {
        result.category = store.cat;
        if (store.name && !result.description) result.description = store.name;
        result.confidence.description = 90;
        break;
      }
    }
    if (result.category) break;
  }

  // ─── Helpers ────────────────────────────────────

  // Normalize common OCR artifacts
  function cleanOCRLine(line) {
    var s = line;
    // Replace pipe / excl between digits → 1  (e.g. "2|,50" → "21,50")
    s = s.replace(/(\d)[|!](\d)/g, '$11$2');
    // Replace lowercase L between digits → 1
    s = s.replace(/(\d)l(\d)/g, '$11$2');
    // Replace O between digits → 0
    s = s.replace(/(\d)[oO](\d)/g, '$10$2');
    // Replace S between digits → 5  (common OCR misread)
    s = s.replace(/(\d)[sS](\d)/g, '$15$2');
    // Normalize various euro signs
    s = s.replace(/[€ɛ∈]/g, '€');
    // Collapse multiple spaces
    s = s.replace(/\s{2,}/g, ' ');
    return s;
  }

  // Extract the best amount from a string
  function extractAmount(str) {
    if (!str) return null;

    // Clean OCR artifacts consistently
    var clean = cleanOCRLine(str);

    var amounts = [];

    // Pattern 1: Spanish format with thousands separator "1.234,56" or "1 234,56"
    var p1a = clean.match(/(\d{1,3})[\.\s](\d{3})[,](\d{1,2})/g);
    if (p1a) {
      p1a.forEach(function (m) {
        var parts = m.match(/(\d{1,3})[\.\s](\d{3})[,](\d{1,2})/);
        if (parts) {
          var val = parseFloat(parts[1] + parts[2] + '.' + parts[3]);
          if (!isNaN(val) && val > 0) amounts.push(val);
        }
      });
    }

    // Pattern 2: Standard decimal "23,52" or "23.52" (with optional spaces around comma)
    var p1 = clean.match(/(\d+)\s*[.,]\s*(\d{1,2})(?!\d)/g);
    if (p1) {
      p1.forEach(function (m) {
        var parts = m.match(/(\d+)\s*[.,]\s*(\d{1,2})/);
        if (parts) {
          // Skip if this looks like a thousands-separated number already handled
          if (parts[1].length > 3) return;
          var val = parseFloat(parts[1] + '.' + parts[2]);
          if (!isNaN(val) && val > 0) amounts.push(val);
        }
      });
    }

    // Pattern 3: Amount with € sign  "€23,52" or "23,52 €" or "€ 23.52"
    var p2 = clean.match(/€\s*(\d+)\s*[.,]?\s*(\d{0,2})/g);
    if (p2) {
      p2.forEach(function (m) {
        var parts = m.match(/€\s*(\d+)\s*[.,]?\s*(\d{0,2})/);
        if (parts) {
          var val = parseFloat(parts[1] + '.' + (parts[2] || '00'));
          if (!isNaN(val) && val > 0) amounts.push(val);
        }
      });
    }
    var p2b = clean.match(/(\d+)\s*[.,]\s*(\d{1,2})\s*€/g);
    if (p2b) {
      p2b.forEach(function (m) {
        var parts = m.match(/(\d+)\s*[.,]\s*(\d{1,2})\s*€/);
        if (parts) {
          var val = parseFloat(parts[1] + '.' + parts[2]);
          if (!isNaN(val) && val > 0) amounts.push(val);
        }
      });
    }

    // Pattern 4: Whole number with no decimals — OCR dropped the separator
    if (amounts.length === 0) {
      var p3 = clean.match(/(?:^|\s)(\d{3,6})(?:\s|$|€)/g);
      if (p3) {
        p3.forEach(function (m) {
          var digits = m.trim().replace('€', '');
          var val = parseFloat(digits) / 100;
          if (!isNaN(val) && val > 0.5 && val < 100000) amounts.push(val);
        });
      }
    }

    // Return the largest amount found (most likely the total)
    if (amounts.length > 0) {
      return Math.max.apply(null, amounts);
    }
    return null;
  }

  // ─── 1. Find TOTAL amount ─────────────────────
  var totalPatterns = [
    /\bTOTAL\b/i,
    /\bIMPORTE\b/i,
    /\bA\s*PAGAR\b/i,
    /\bA\s*COBRAR\b/i,
    /\bSUMA\b/i,
    /\bT[O0]T[A4]L\b/i,        // OCR misreads: T0TAL, TOT4L
    /\bTOTALE?\b/i,
    /\bIMPORTE\s*TOTAL\b/i,
    /\bTOTAL\s*[€(]/i,         // TOTAL €, TOTAL (
    /\bEFECTIVO\b/i,
    /\bENTREGADO\b/i,
    /\bIMPORT\b/i              // truncated IMPORTE
  ];

  // Lines to skip even if they have a total keyword
  var skipTotalLine = /\b(IVA|I\.?V\.?A\.?|TAX|BASE|SUBTOTAL|SUB\s*TOTAL|DTO|DESC|DESCUENTO|CAMBIO|DEVOL|DEVOLUCI[OÓ]N|AHORRO)\b/i;

  // Search from bottom to top (totals are usually at the bottom)
  var totalFound = false;
  for (var i = lines.length - 1; i >= 0; i--) {
    var line = cleanOCRLine(lines[i]);

    var isTotalLine = false;
    for (var p = 0; p < totalPatterns.length; p++) {
      if (totalPatterns[p].test(line)) { isTotalLine = true; break; }
    }
    if (!isTotalLine) continue;
    if (skipTotalLine.test(line)) continue;

    // Remove keywords to isolate amount portion
    var amountPart = line
      .replace(/\b(TOTAL|IMPORTE|SUMA|EFECTIVO|ENTREGADO|IMPORT)\b/gi, '')
      .replace(/\b(EUR|USD|GBP|MXN)\b/gi, '')
      .replace(/\bA\s*(PAGAR|COBRAR)\b/gi, '')
      .replace(/[:=()]/g, '')
      .trim();

    var amt = extractAmount(amountPart);

    // If no amount on same line, check next line(s)
    if (!amt && i < lines.length - 1) amt = extractAmount(cleanOCRLine(lines[i + 1]));
    if (!amt && i < lines.length - 2) amt = extractAmount(cleanOCRLine(lines[i + 2]));
    // Try combined current + next (OCR sometimes wraps)
    if (!amt && i < lines.length - 1) amt = extractAmount(line + ' ' + cleanOCRLine(lines[i + 1]));

    if (amt && amt > 0) {
      result.amount = amt;
      result.confidence.amount = 95;
      totalFound = true;
      break;
    }
  }

  // Fallback 1: lines containing € from bottom
  if (!totalFound) {
    for (var i = lines.length - 1; i >= 0; i--) {
      var cl = cleanOCRLine(lines[i]);
      if (cl.indexOf('€') !== -1 || /\bEUR\b/i.test(cl)) {
        if (skipTotalLine.test(cl)) continue;
        var amt = extractAmount(cl);
        if (amt && amt > 0) {
          result.amount = amt;
          result.confidence.amount = 70;
          totalFound = true;
          break;
        }
      }
    }
  }

  // Fallback 2: largest amount in bottom third of receipt
  if (!totalFound) {
    var allAmounts = [];
    var startLine = Math.floor(lines.length * 0.5);
    for (var i = startLine; i < lines.length; i++) {
      var cl = cleanOCRLine(lines[i]);
      if (skipTotalLine.test(cl)) continue;
      var matches = cl.match(/(\d+)\s*[.,]\s*(\d{1,2})/g);
      if (matches) {
        matches.forEach(function (m) {
          var parts = m.match(/(\d+)\s*[.,]\s*(\d{1,2})/);
          if (parts) {
            var val = parseFloat(parts[1] + '.' + parts[2]);
            if (!isNaN(val) && val > 0 && val < 100000) allAmounts.push(val);
          }
        });
      }
    }
    if (allAmounts.length === 0) {
      for (var i = 0; i < lines.length; i++) {
        var cl = cleanOCRLine(lines[i]);
        var matches = cl.match(/(\d+)\s*[.,]\s*(\d{1,2})/g);
        if (matches) {
          matches.forEach(function (m) {
            var parts = m.match(/(\d+)\s*[.,]\s*(\d{1,2})/);
            if (parts) {
              var val = parseFloat(parts[1] + '.' + parts[2]);
              if (!isNaN(val) && val > 0 && val < 100000) allAmounts.push(val);
            }
          });
        }
      }
    }
    if (allAmounts.length > 0) {
      result.amount = Math.max.apply(null, allAmounts);
      result.confidence.amount = 40;
    }
  }

  // ─── 2. Find store/description ─────────────────
  var skipDesc = /^(copia|duplicado|factura\s*simplificada|ticket|recibo|nif|cif|n\.?i\.?f|c\.?i\.?f|tel[eé]fono|telf?\.?\s|c\/?\s|calle|avda?\.?\s|pza?\.?\s|plaza|paseo|cp\s|c\.?p\.?\s|\d{5}\s|www\.|http|email|e-?mail|iva|base\s*imp|dto|desc\.|imp(uesto)?|nº?\s*ticket|hora|fecha|operaci[oó]n|tarjeta|visa|master|debit|client|cajero|caja|turno|op\.?\s*n|le\s*atendi[oó]|reg\.?\s*merc|reg\.?\s*sanitario|---|\*\*\*|===|___)/i;
  var dateLinePattern = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/;

  for (var i = 0; i < Math.min(lines.length, 10); i++) {
    var line = lines[i];
    if (line.length < 3) continue;
    if (/^[\d\s.,€$%:;\-\/]+$/.test(line)) continue;
    if (dateLinePattern.test(line)) continue;
    if (skipDesc.test(line)) continue;

    // This is likely the store name (only if not set by storeDB)
    if (!result.description) {
      result.description = line.replace(/[*_=\-]{2,}/g, '').replace(/\s+/g, ' ').trim();
      if (result.description.length > 60) {
        result.description = result.description.substring(0, 60);
      }
      if (!result.confidence.description) result.confidence.description = 60;
    }
    break;
  }

  // ─── 3. Find date ─────────────────────────────
  var monthNames = {
    'ene': '01', 'enero': '01', 'jan': '01',
    'feb': '02', 'febrero': '02',
    'mar': '03', 'marzo': '03',
    'abr': '04', 'abril': '04', 'apr': '04',
    'may': '05', 'mayo': '05',
    'jun': '06', 'junio': '06',
    'jul': '07', 'julio': '07',
    'ago': '08', 'agosto': '08', 'aug': '08',
    'sep': '09', 'sept': '09', 'septiembre': '09',
    'oct': '10', 'octubre': '10',
    'nov': '11', 'noviembre': '11',
    'dic': '12', 'diciembre': '12', 'dec': '12'
  };

  for (var i = 0; i < lines.length; i++) {
    var line = cleanOCRLine(lines[i]);

    // Pattern 1: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    var m1 = line.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    if (m1) {
      var day = m1[1].padStart(2, '0');
      var month = m1[2].padStart(2, '0');
      var year = m1[3];
      if (+month >= 1 && +month <= 12 && +day >= 1 && +day <= 31 && +year >= 2000) {
        result.date = year + '-' + month + '-' + day;
        result.confidence.date = 90;
        break;
      }
    }

    // Pattern 2: DD/MM/YY
    var m2 = line.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})(?!\d)/);
    if (m2) {
      var day = m2[1].padStart(2, '0');
      var month = m2[2].padStart(2, '0');
      var year = '20' + m2[3];
      if (+month >= 1 && +month <= 12 && +day >= 1 && +day <= 31) {
        result.date = year + '-' + month + '-' + day;
        result.confidence.date = 85;
        break;
      }
    }

    // Pattern 3: "04 MAR 2026", "4 marzo 2026", "04-Mar-26"
    var m3 = line.match(/(\d{1,2})[\s\/\-]+([a-zA-ZáéíóúñÑ]{3,10})[\s\/\-]+(\d{2,4})/i);
    if (m3) {
      var day = m3[1].padStart(2, '0');
      var mName = m3[2].toLowerCase().replace(/\.$/, '');
      var year = m3[3];
      if (year.length === 2) year = '20' + year;
      var month = monthNames[mName];
      if (month && +day >= 1 && +day <= 31 && +year >= 2000) {
        result.date = year + '-' + month + '-' + day;
        result.confidence.date = 80;
        break;
      }
    }
  }

  return result;
}

function parseAmount(str) {
  if (!str) return 0;
  // Normalize: replace comma with dot for decimal
  var clean = str.replace(',', '.');
  var val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.abs(val);
}

function showScannerResults(parsed, rawText) {
  document.getElementById('scannerProcessingStep').style.display = 'none';
  document.getElementById('scannerProcessingStep').classList.remove('scanner-processing-active');
  document.getElementById('scannerResultsStep').style.display = '';
  document.getElementById('scannerCreateBtn').style.display = '';

  document.getElementById('scannerResultImg').src = document.getElementById('scannerPreviewImg').src;

  // Fill parsed data
  document.getElementById('scannerDescription').value = parsed.description || '';
  document.getElementById('scannerAmount').value = parsed.amount ? parsed.amount.toFixed(2) : '';
  document.getElementById('scannerDate').value = parsed.date || new Date().toISOString().split('T')[0];
  document.getElementById('scannerRawText').textContent = rawText;

  // ─── Populate category dropdown from user's categories ───
  var catSelect = document.getElementById('scannerCategory');
  catSelect.innerHTML = '<option value="">— Sin categoría —</option>';
  if (window.categoriesCache) {
    var expenseCats = window.categoriesCache.filter(function (c) { return c.type === 'expense'; });
    expenseCats.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = (c.icon || '') + ' ' + c.name;
      catSelect.appendChild(opt);
    });
    // Auto-select matching category
    if (parsed.category) {
      var matchCat = expenseCats.find(function (c) {
        return c.name.toLowerCase().indexOf(parsed.category.toLowerCase()) !== -1 ||
          parsed.category.toLowerCase().indexOf(c.name.toLowerCase()) !== -1;
      });
      if (matchCat) catSelect.value = matchCat.id;
    }
  }

  // ─── Confidence badges ───
  var confBar = document.getElementById('scannerConfidenceBar');
  function badge(label, pct) {
    var color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
    var bg = pct >= 80 ? 'var(--green-dim)' : pct >= 50 ? 'rgba(245,158,11,0.15)' : 'var(--red-dim)';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;background:' + bg + ';color:' + color + ';">' + label + ' ' + pct + '%</span>';
  }
  var badges = '';
  badges += badge('💰 Monto', parsed.confidence.amount);
  badges += badge('📝 Tienda', parsed.confidence.description);
  badges += badge('📅 Fecha', parsed.confidence.date);
  if (parsed.category) badges += '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;background:rgba(99,102,241,0.15);color:var(--accent-light);">🏷️ ' + parsed.category + '</span>';
  confBar.innerHTML = badges;

  // Visual cues for missing fields
  var descInput = document.getElementById('scannerDescription');
  var amtInput = document.getElementById('scannerAmount');
  descInput.style.borderColor = parsed.description ? '' : 'var(--yellow)';
  if (!parsed.description) descInput.placeholder = 'No detectado — escríbelo manualmente';
  amtInput.style.borderColor = parsed.amount ? '' : 'var(--yellow)';
  if (!parsed.amount) amtInput.placeholder = 'No detectado';
}

function showScannerError(msg) {
  document.getElementById('scannerProcessingStep').style.display = 'none';
  document.getElementById('scannerProcessingStep').classList.remove('scanner-processing-active');
  document.getElementById('scannerErrorStep').style.display = '';
  document.getElementById('scannerErrorMsg').textContent = msg;
}

function toggleScannerRawText() {
  var el = document.getElementById('scannerRawText');
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

function applyScannedData() {
  var description = document.getElementById('scannerDescription').value;
  var amount = document.getElementById('scannerAmount').value;
  var date = document.getElementById('scannerDate').value;
  var catId = document.getElementById('scannerCategory').value;

  closeScannerModal();

  // Open transaction modal with pre-filled data
  document.getElementById('txId').value = '';
  document.getElementById('txModalTitle').textContent = 'Nueva transacción (desde ticket)';
  document.getElementById('txAmount').value = amount || '';
  document.getElementById('txDate').value = date || new Date().toISOString().split('T')[0];
  document.getElementById('txDescription').value = description || '';
  document.getElementById('txNotes').value = 'Creado desde escaneo de ticket';
  setTxType('expense');
  openModal('transactionModal');

  // Auto-select category if detected
  if (catId) {
    setTimeout(function () {
      var txCat = document.getElementById('txCategory');
      if (txCat) txCat.value = catId;
    }, 100);
  }

  if (amount) {
    toast('📸 Datos del ticket aplicados — revisa y guarda', 'success');
  } else {
    toast('📸 No se detectó monto — revísalo manualmente', 'error');
  }
}

// ─── ADMIN ────────────────────────────────────────
async function loadAdminPage() {
  if (!currentUser.is_admin) return;
  var users = await api('/admin/users');
  if (!users) return;
  var tbody = document.getElementById('adminUsersTable');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No hay usuarios</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = users.map(function(u) {
    var isSelf = u.id === currentUser.id;
    var actions = isSelf ? '<span style="color:var(--text-muted)">Tú</span>' : '<button class="btn-icon" style="color:var(--red);" onclick="deleteAdminUser(' + u.id + ')" title="Eliminar usuario">🗑️</button>';
    var role = u.is_admin ? '<span class="badge badge-income">Admin</span>' : '<span class="badge badge-expense">User</span>';
    return '<tr>' +
      '<td style="color:var(--text-muted);font-size:0.85rem;">#' + u.id + '</td>' +
      '<td>' + u.name + '</td>' +
      '<td>' + u.email + '</td>' +
      '<td>' + role + '</td>' +
      '<td style="color:var(--text-muted);font-size:0.85rem;">' + formatDate(u.created_at.split(' ')[0]) + '</td>' +
      '<td>' + actions + '</td>' +
    '</tr>';
  }).join('');
}

async function deleteAdminUser(id) {
  if (!confirm('¿Estás seguro de que quieres eliminar a este usuario de forma permanente? Se borrarán todos sus datos.')) return;
  var res = await fetch('/api/admin/users/' + id, { method: 'DELETE' });
  var data = await res.json();
  if (data.success) {
    toast('Usuario eliminado correctamente');
    loadAdminPage();
  } else {
    toast(data.error || 'Error al eliminar usuario', 'error');
  }
}

// ─── CHATBOT ────────────────────────────────────────
var chatHistory = [];
var isChatOpen = false;

function toggleChat() {
  var window = document.getElementById('chatWindow');
  isChatOpen = !isChatOpen;
  window.style.display = isChatOpen ? 'flex' : 'none';
  if (isChatOpen) {
    document.getElementById('chatInput').focus();
    scrollToChatBottom();
  }
}

function handleChatKeypress(e) {
  if (e.key === 'Enter') sendChatMessage();
}

function scrollToChatBottom() {
  var body = document.getElementById('chatBody');
  body.scrollTop = body.scrollHeight;
}

function addChatMessage(content, isUser) {
  var body = document.getElementById('chatBody');
  var div = document.createElement('div');
  div.className = 'chat-message ' + (isUser ? 'user-message' : 'bot-message');
  div.innerHTML = '<div class="message-content"></div>';
  
  if (isUser) {
    div.querySelector('.message-content').textContent = content;
  } else {
    var html = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n- /g, '<br>• ')
      .replace(/\n/g, '<br>');
    div.querySelector('.message-content').innerHTML = html;
  }
  
  body.appendChild(div);
  scrollToChatBottom();
}

function showChatLoading() {
  var body = document.getElementById('chatBody');
  var div = document.createElement('div');
  div.className = 'chat-message bot-message chat-loading-indicator';
  div.innerHTML = '<div class="chat-loading"><div class="chat-dot"></div><div class="chat-dot"></div><div class="chat-dot"></div></div>';
  body.appendChild(div);
  scrollToChatBottom();
}

function hideChatLoading() {
  var loading = document.querySelector('.chat-loading-indicator');
  if (loading) loading.remove();
}

async function sendChatMessage() {
  var input = document.getElementById('chatInput');
  var text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.disabled = true;
  
  addChatMessage(text, true);
  showChatLoading();

  try {
    var res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory })
    });
    
    var data = await res.json();
    hideChatLoading();
    
    if (data.success) {
      addChatMessage(data.reply, false);
      chatHistory.push({ role: 'user', content: text });
      chatHistory.push({ role: 'assistant', content: data.reply });
      if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
    } else {
      addChatMessage('Error: ' + (data.error || 'No se pudo contactar con la IA.'), false);
    }
  } catch (err) {
    hideChatLoading();
    addChatMessage('Error de conexión.', false);
  }
  
  input.disabled = false;
  input.focus();
}
