/* ════════════════════════════════════════════
   CarbonLens — Logic
   ════════════════════════════════════════════ */

// ── Emission Factors (kg CO₂ per unit) ──
const FACTORS = {
  car: { petrol: 0.192, diesel: 0.171, electric: 0.05, hybrid: 0.11 }, // per km
  publicTransit: 0.089, // per km
  flight: 255,          // per short-haul flight (round trip)
  electricity: { grid: 0.42, renewable: 0.05, coal: 0.95 }, // per kWh
  gas: 0.2,             // per kWh natural gas
  diet: {
    'heavy-meat': 310,
    'medium-meat': 230,
    'light-meat': 170,
    'pescatarian': 140,
    'vegetarian': 120,
    'vegan': 85
  }, // monthly kg CO₂
  localFood: { rarely: 1.0, sometimes: 0.9, mostly: 0.8, always: 0.7 },
  clothing: 15,         // per item
  electronics: 200,     // per device
  recycling: { never: 1.0, sometimes: 0.85, mostly: 0.7, always: 0.55 },
  spending: 0.005       // per ₹
};

const WORLD_AVG_MONTHLY = 370; // ~4.4 t/year global avg

// ── State ──
let currentStep = 0;
let history = JSON.parse(localStorage.getItem('carbonlens_history') || '[]');

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  updateHeroStats();
  renderHistory();
  setupScrollEffects();
  setupMobileMenu();
  setupStarSelector();
  loadTestimonials();
  drawDonut([0, 0, 0, 0]);
});

// ── Navigation helpers ──
function scrollToEl(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-dot').forEach(d => d.classList.remove('active'));
  document.getElementById(`panel-${step}`).classList.add('active');
  document.getElementById(`step-dot-${step}`).classList.add('active');
}

// ── Calculation ──
function calculateFootprint() {
  const v = (id) => parseFloat(document.getElementById(id)?.value) || 0;
  const s = (id) => document.getElementById(id)?.value || '';

  // Transport
  const carKm = v('car-km');
  const carType = s('car-type');
  const publicKm = v('public-km');
  const flights = v('flights');
  const transport = (carKm * FACTORS.car[carType])
    + (publicKm * FACTORS.publicTransit)
    + (flights * FACTORS.flight / 12);

  // Energy
  const elecKwh = v('elec-kwh');
  const elecSource = s('elec-source');
  const gasKwh = v('gas-kwh');
  const householdSize = parseInt(s('household-size')) || 1;
  const energy = ((elecKwh * FACTORS.electricity[elecSource]) + (gasKwh * FACTORS.gas)) / householdSize;

  // Food
  const dietType = s('diet-type');
  const foodWaste = v('food-waste');
  const localFood = s('local-food');
  const food = FACTORS.diet[dietType] * (1 + foodWaste / 100) * FACTORS.localFood[localFood];

  // Shopping
  const clothing = v('clothing');
  const electronics = v('electronics');
  const recycling = s('recycling');
  const spending = v('spending');
  const shopping = ((clothing * FACTORS.clothing)
    + (electronics * FACTORS.electronics / 12)
    + (spending * FACTORS.spending))
    * FACTORS.recycling[recycling];

  const total = transport + energy + food + shopping;

  // Save entry
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    total: round(total),
    transport: round(transport),
    energy: round(energy),
    food: round(food),
    shopping: round(shopping)
  };

  history.unshift(entry);
  localStorage.setItem('carbonlens_history', JSON.stringify(history));

  // Update UI
  updateDashboard(entry);
  updateHeroStats();
  renderHistory();
  scrollToEl('dashboard');
}

function round(n) { return Math.round(n * 10) / 10; }

// ── Dashboard Update ──
function updateDashboard(entry) {
  const { total, transport, energy, food, shopping } = entry;
  const annual = round(total * 12);

  document.getElementById('dash-total').textContent = `${total} kg`;
  document.getElementById('dash-annual').textContent = `${annual} kg CO₂ / year`;

  document.getElementById('dash-transport').textContent = `${transport}`;
  document.getElementById('dash-energy').textContent = `${energy}`;
  document.getElementById('dash-food').textContent = `${food}`;
  document.getElementById('dash-shopping').textContent = `${shopping}`;

  // Bars (relative to total)
  const max = Math.max(transport, energy, food, shopping, 1);
  animateBar('bar-transport', (transport / max) * 100);
  animateBar('bar-energy', (energy / max) * 100);
  animateBar('bar-food', (food / max) * 100);
  animateBar('bar-shopping', (shopping / max) * 100);

  // Total bar (relative to world avg)
  const pct = Math.min((total / WORLD_AVG_MONTHLY) * 100, 100);
  animateBar('dash-bar-total', pct);

  // Comparison text
  const diff = total - WORLD_AVG_MONTHLY;
  const comp = document.getElementById('dash-comparison');
  if (diff < 0) {
    comp.textContent = `🎉 ${Math.abs(round(diff))} kg below global average (${WORLD_AVG_MONTHLY} kg/mo)`;
    comp.style.color = '#16a34a';
  } else if (diff === 0) {
    comp.textContent = `📊 Exactly at global average`;
    comp.style.color = '#64748b';
  } else {
    comp.textContent = `⚠️ ${round(diff)} kg above global average (${WORLD_AVG_MONTHLY} kg/mo)`;
    comp.style.color = '#dc2626';
  }

  // Donut
  drawDonut([transport, energy, food, shopping]);
}

function animateBar(id, pct) {
  requestAnimationFrame(() => {
    document.getElementById(id).style.width = `${pct}%`;
  });
}

// ── Donut Chart (Canvas) ──
function drawDonut(values) {
  const canvas = document.getElementById('donut-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 220;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const cx = size / 2, cy = size / 2, r = 85, lineWidth = 22;
  const total = values.reduce((a, b) => a + b, 0);
  const colors = ['#3b82f6', '#eab308', '#ef4444', '#8b5cf6'];
  const labels = ['Transport', 'Energy', 'Food', 'Shopping'];

  ctx.clearRect(0, 0, size, size);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    document.getElementById('chart-center-label').textContent = 'No data';
  } else {
    let startAngle = -Math.PI / 2;
    values.forEach((val, i) => {
      const slice = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
      startAngle += slice + 0.04; // tiny gap
    });

    const biggest = values.indexOf(Math.max(...values));
    const bigPct = Math.round((values[biggest] / total) * 100);
    document.getElementById('chart-center-label').textContent = `${bigPct}% ${labels[biggest]}`;
  }

  // Legend
  const legendEl = document.getElementById('chart-legend');
  legendEl.innerHTML = labels.map((l, i) => {
    const pct = total ? Math.round((values[i] / total) * 100) : 0;
    return `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l} ${pct}%</span>`;
  }).join('');
}

// ── History ──
function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const countEl = document.getElementById('history-count');

  countEl.textContent = `${history.length} entr${history.length === 1 ? 'y' : 'ies'}`;

  if (history.length === 0) {
    list.innerHTML = '';
    list.appendChild(createEmptyState());
    return;
  }

  list.innerHTML = history.map(e => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const badge = getBadge(e.total);
    return `
      <div class="history-entry" data-id="${e.id}">
        <div class="history-entry-left">
          <span class="history-date">${dateStr} · ${timeStr}</span>
          <span class="history-total">${e.total} kg CO₂/month</span>
          <div class="history-cats">
            <span>🚗 ${e.transport}</span>
            <span>⚡ ${e.energy}</span>
            <span>🍽️ ${e.food}</span>
            <span>🛍️ ${e.shopping}</span>
          </div>
        </div>
        <div class="history-entry-right">
          <span class="history-badge ${badge.cls}">${badge.text}</span>
          <button class="history-delete-btn" onclick="deleteEntry(${e.id})" aria-label="Delete entry">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function createEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.id = 'history-empty';
  div.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
    <p>No entries yet. Use the calculator above to log your first footprint.</p>`;
  return div;
}

function getBadge(total) {
  if (total < 200) return { cls: 'badge-low', text: 'Low' };
  if (total < 400) return { cls: 'badge-medium', text: 'Medium' };
  return { cls: 'badge-high', text: 'High' };
}

function deleteEntry(id) {
  history = history.filter(e => e.id !== id);
  localStorage.setItem('carbonlens_history', JSON.stringify(history));
  renderHistory();
  updateHeroStats();
}

function clearHistory() {
  if (!confirm('Clear all history entries?')) return;
  history = [];
  localStorage.setItem('carbonlens_history', JSON.stringify(history));
  renderHistory();
  updateHeroStats();
  updateDashboard({ total: 0, transport: 0, energy: 0, food: 0, shopping: 0 });
}

// ── Hero Stats ──
function updateHeroStats() {
  const entries = history.length;
  const totalTracked = history.reduce((sum, e) => sum + e.total, 0);
  document.getElementById('hero-stat-entries').textContent = entries;
  document.getElementById('hero-stat-total').textContent = round(totalTracked);

  // If there's a latest entry, update dashboard too
  if (history.length > 0) {
    updateDashboard(history[0]);
  }
}

// ── Scroll Effects ──
function setupScrollEffects() {
  // Navbar shadow
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
  });

  // Fade-in sections
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.section, .dash-card, .tip-card').forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
  });
}

// ── Mobile Menu ──
function setupMobileMenu() {
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('mobile-menu').classList.toggle('open');
  });
}

function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
}

// ══════════════════════════════════════════
//  Authentication
// ══════════════════════════════════════════

function getLoggedInUser() {
  const raw = localStorage.getItem('carbonlens_user');
  return raw ? JSON.parse(raw) : null;
}

function checkAuth() {
  const user = getLoggedInUser();
  const authDiv = document.getElementById('nav-auth');
  const userDiv = document.getElementById('nav-user');
  const nameEl = document.getElementById('nav-user-name');

  if (user) {
    authDiv.style.display = 'none';
    userDiv.style.display = 'flex';
    nameEl.textContent = user.name;
  } else {
    authDiv.style.display = 'flex';
    userDiv.style.display = 'none';
  }
  updateFeedbackFormState();
}

function openAuthModal(tab) {
  document.getElementById('auth-overlay').classList.add('open');
  document.getElementById('auth-modal').classList.add('open');
  switchAuthTab(tab || 'login');
}

function closeAuthModal() {
  document.getElementById('auth-overlay').classList.remove('open');
  document.getElementById('auth-modal').classList.remove('open');
  document.getElementById('login-error').textContent = '';
  document.getElementById('signup-error').textContent = '';
}

function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('login-form').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'flex' : 'none';
  document.getElementById('login-error').textContent = '';
  document.getElementById('signup-error').textContent = '';
}

async function signup(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    localStorage.setItem('carbonlens_user', JSON.stringify(data.user));
    closeAuthModal();
    checkAuth();
  } catch { errEl.textContent = 'Network error. Please try again.'; }
}

async function login(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    localStorage.setItem('carbonlens_user', JSON.stringify(data.user));
    closeAuthModal();
    checkAuth();
  } catch { errEl.textContent = 'Network error. Please try again.'; }
}

function logout() {
  localStorage.removeItem('carbonlens_user');
  checkAuth();
}

// ══════════════════════════════════════════
//  Star Rating Selector
// ══════════════════════════════════════════

function setupStarSelector() {
  const container = document.getElementById('star-selector');
  if (!container) return;
  const stars = container.querySelectorAll('.star');

  container.addEventListener('mouseover', (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    const val = parseInt(star.dataset.value);
    stars.forEach(s => s.classList.toggle('hovered', parseInt(s.dataset.value) <= val));
  });

  container.addEventListener('mouseout', () => {
    stars.forEach(s => s.classList.remove('hovered'));
  });

  container.addEventListener('click', (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    const val = parseInt(star.dataset.value);
    document.getElementById('feedback-rating').value = val;
    stars.forEach(s => s.classList.toggle('selected', parseInt(s.dataset.value) <= val));
  });
}

// ══════════════════════════════════════════
//  Feedback
// ══════════════════════════════════════════

function updateFeedbackFormState() {
  const user = getLoggedInUser();
  const noteEl = document.getElementById('feedback-note');
  const btn = document.getElementById('submit-feedback-btn');
  if (!noteEl || !btn) return;

  if (!user) {
    noteEl.textContent = 'Please log in to submit feedback.';
    noteEl.style.color = '#64748b';
    btn.disabled = true;
    btn.style.opacity = '0.5';
  } else {
    noteEl.textContent = '';
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

async function submitFeedback() {
  const user = getLoggedInUser();
  const noteEl = document.getElementById('feedback-note');
  if (!user) {
    noteEl.textContent = 'Please log in to submit feedback.';
    noteEl.style.color = '#dc2626';
    return;
  }

  const rating = parseInt(document.getElementById('feedback-rating').value);
  const text = document.getElementById('feedback-text').value.trim();
  const carbonRadio = document.querySelector('input[name="carbon-level"]:checked');

  if (!rating || rating < 1) {
    noteEl.textContent = 'Please select a star rating.';
    noteEl.style.color = '#dc2626';
    return;
  }
  if (!text) {
    noteEl.textContent = 'Please write your feedback.';
    noteEl.style.color = '#dc2626';
    return;
  }
  if (!carbonRadio) {
    noteEl.textContent = 'Please select your carbon footprint level.';
    noteEl.style.color = '#dc2626';
    return;
  }

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, rating, text, carbonLevel: carbonRadio.value })
    });
    const data = await res.json();
    if (!res.ok) {
      noteEl.textContent = data.error;
      noteEl.style.color = '#dc2626';
      return;
    }
    noteEl.textContent = '✅ Thank you for your feedback!';
    noteEl.style.color = '#16a34a';
    document.getElementById('submit-feedback-btn').disabled = true;
    document.getElementById('submit-feedback-btn').style.opacity = '0.5';
    loadTestimonials();
  } catch {
    noteEl.textContent = 'Network error. Please try again.';
    noteEl.style.color = '#dc2626';
  }
}

// ══════════════════════════════════════════
//  Testimonials
// ══════════════════════════════════════════

async function loadTestimonials() {
  const grid = document.getElementById('testimonials-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/feedbacks');
    const data = await res.json();
    const feedbacks = data.feedbacks || [];

    if (feedbacks.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No testimonials yet. Be the first to share your experience!</p></div>';
      return;
    }

    // Only show the first 5 feedbacks as cards
    const displayFeedbacks = feedbacks.slice(0, 5);
    grid.innerHTML = displayFeedbacks.map(fb => {
      const initial = fb.name ? fb.name.charAt(0).toUpperCase() : '?';
      const starsHtml = renderStars(fb.rating);
      return `
        <div class="testimonial-card">
          <div class="testimonial-header">
            <div class="testimonial-avatar">${initial}</div>
            <div class="testimonial-info">
              <span class="testimonial-name">${escapeHtml(fb.name)}</span>
              <span class="testimonial-email">${escapeHtml(fb.email)}</span>
            </div>
          </div>
          <div class="testimonial-stars">${starsHtml}</div>
          <p class="testimonial-text">"${escapeHtml(fb.text)}"</p>
        </div>`;
    }).join('');
  } catch {
    grid.innerHTML = '<div class="empty-state"><p>Could not load testimonials.</p></div>';
  }
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += i <= rating
      ? '<span class="star-filled">★</span>'
      : '<span class="star-empty">★</span>';
  }
  return html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
