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

// ── Supabase Init ──
const SUPABASE_URL = 'https://tsvdatwjupltejnmkflq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzdmRhdHdqdXBsdGVqbm1rZmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzYyODEsImV4cCI6MjA5Mzc1MjI4MX0.lNca6qrJ_yWkkISzXFGkM0Jle1OrSK-ka1U4wDNSRaI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let currentStep = 0;
let history = JSON.parse(localStorage.getItem('carbonlens_history') || '[]');
let currentUser = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      checkAuth();
    }
  });

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
  // Validate step is in range 0-3
  if (step < 0 || step > 3) {
    console.error(`Invalid step: ${step}. Must be 0-3.`);
    return;
  }
  currentStep = step;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-dot').forEach(d => d.classList.remove('active'));
  
  const panelEl = document.getElementById(`panel-${step}`);
  const dotEl = document.getElementById(`step-dot-${step}`);
  
  if (panelEl) panelEl.classList.add('active');
  if (dotEl) dotEl.classList.add('active');
}

// ── Calculation ──
function calculateFootprint() {
  const v = (id) => parseFloat(document.getElementById(id)?.value) || 0;
  const s = (id) => document.getElementById(id)?.value || '';

  // Transport
  const carKm = v('car-km');
  const carType = s('car-type') || 'petrol';
  const publicKm = v('public-km');
  const flights = v('flights');
  const transport = (carKm * (FACTORS.car[carType] || 0))
    + (publicKm * FACTORS.publicTransit)
    + (flights * FACTORS.flight / 12);

  // Energy
  const elecKwh = v('elec-kwh');
  const elecSource = s('elec-source') || 'grid';
  const gasKwh = v('gas-kwh');
  const householdSize = parseInt(s('household-size')) || 1;
  const energy = ((elecKwh * (FACTORS.electricity[elecSource] || 0)) + (gasKwh * FACTORS.gas)) / householdSize;

  // Food
  const dietType = s('diet-type') || 'medium-meat';
  const foodWaste = v('food-waste');
  const localFood = s('local-food') || 'sometimes';
  const food = (FACTORS.diet[dietType] || 0) * (1 + foodWaste / 100) * (FACTORS.localFood[localFood] || 1);

  // Shopping
  const clothing = v('clothing');
  const electronics = v('electronics');
  const recycling = s('recycling') || 'sometimes';
  const spending = v('spending');
  const shopping = ((clothing * FACTORS.clothing)
    + (electronics * FACTORS.electronics / 12)
    + (spending * FACTORS.spending))
    * (FACTORS.recycling[recycling] || 1);

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
    const el = document.getElementById(id);
    if (el) el.style.width = `${pct}%`;
  });
}

// ── Donut Chart (Canvas) ──
function drawDonut(values) {
  const canvas = document.getElementById('donut-chart');
  if (!canvas) {
    console.warn('donut-chart canvas element not found');
    return;
  }
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
    const centerLabel = document.getElementById('chart-center-label');
    if (centerLabel) centerLabel.textContent = 'No data';
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
    const centerLabel = document.getElementById('chart-center-label');
    if (centerLabel) centerLabel.textContent = `${bigPct}% ${labels[biggest]}`;
  }

  // Legend
  const legendEl = document.getElementById('chart-legend');
  if (legendEl) {
    legendEl.innerHTML = labels.map((l, i) => {
      const pct = total ? Math.round((values[i] / total) * 100) : 0;
      return `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l} ${pct}%</span>`;
    }).join('');
  }
}

// ── History ──
function renderHistory() {
  const list = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');
  
  if (!list || !countEl) return;

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
  
  const entriesEl = document.getElementById('hero-stat-entries');
  const totalEl = document.getElementById('hero-stat-total');
  
  if (entriesEl) entriesEl.textContent = entries;
  if (totalEl) totalEl.textContent = round(totalTracked);

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
  const btn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) {
    console.warn('Mobile menu elements not found');
    return;
  }
  btn.addEventListener('click', () => {
    menu.classList.toggle('open');
  });
}

function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
}

// ══════════════════════════════════════════
//  Authentication
// ══════════════════════════════════════════

async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;

  const authDiv = document.getElementById('nav-auth');
  const userDiv = document.getElementById('nav-user');
  const nameEl = document.getElementById('nav-user-name');

  if (currentUser) {
    if (authDiv) authDiv.style.display = 'none';
    if (userDiv) userDiv.style.display = 'flex';
    if (nameEl) nameEl.textContent = currentUser.user_metadata?.name || currentUser.email;
    
    closeAuthModal();
    document.body.style.overflow = '';
  } else {
    if (authDiv) authDiv.style.display = 'flex';
    if (userDiv) userDiv.style.display = 'none';
    
    forceAuthScreen();
  }
  updateFeedbackFormState();
}

function forceAuthScreen() {
  openAuthModal('login');
  const closeBtn = document.querySelector('.auth-close');
  const overlay = document.getElementById('auth-overlay');
  if (closeBtn) closeBtn.style.display = 'none';
  if (overlay) overlay.onclick = null;
  document.body.style.overflow = 'hidden';
}

function openAuthModal(tab) {
  const overlay = document.getElementById('auth-overlay');
  const modal = document.getElementById('auth-modal');
  if (overlay) overlay.classList.add('open');
  if (modal) modal.classList.add('open');
  switchAuthTab(tab || 'login');
}

function closeAuthModal() {
  // Only allow close if logged in
  if (!currentUser) return;
  const overlay = document.getElementById('auth-overlay');
  const modal = document.getElementById('auth-modal');
  if (overlay) overlay.classList.remove('open');
  if (modal) modal.classList.remove('open');
  const loginErr = document.getElementById('login-error');
  const signupErr = document.getElementById('signup-error');
  if (loginErr) loginErr.textContent = '';
  if (signupErr) signupErr.textContent = '';
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const formLogin = document.getElementById('login-form');
  const formSignup = document.getElementById('signup-form');
  
  if (tabLogin) tabLogin.classList.toggle('active', tab === 'login');
  if (tabSignup) tabSignup.classList.toggle('active', tab === 'signup');
  if (formLogin) formLogin.style.display = tab === 'login' ? 'flex' : 'none';
  if (formSignup) formSignup.style.display = tab === 'signup' ? 'flex' : 'none';
  
  const loginErr = document.getElementById('login-error');
  const signupErr = document.getElementById('signup-error');
  if (loginErr) loginErr.textContent = '';
  if (signupErr) signupErr.textContent = '';
}

async function signInWithGoogle() {
  const errEl = document.getElementById('login-error');
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
  if (error && errEl) {
    errEl.textContent = error.message;
  }
}

async function signup(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');

  if (!name || !email || !password) {
    if (errEl) errEl.textContent = 'All fields are required.';
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });

  if (error) {
    if (errEl) errEl.textContent = error.message;
  } else {
    if (data.session) {
      checkAuth();
    } else {
      if (errEl) {
        errEl.textContent = 'Check your email for a confirmation link.';
        errEl.style.color = '#16a34a';
      }
    }
  }
}

async function login(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  if (!email || !password) {
    if (errEl) errEl.textContent = 'Email and password are required.';
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    if (errEl) errEl.textContent = error.message;
  } else {
    checkAuth();
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
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
  const noteEl = document.getElementById('feedback-note');
  const btn = document.getElementById('submit-feedback-btn');
  if (!noteEl || !btn) return;

  if (!currentUser) {
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
  const noteEl = document.getElementById('feedback-note');
  if (!currentUser) {
    if (noteEl) {
      noteEl.textContent = 'Please log in to submit feedback.';
      noteEl.style.color = '#dc2626';
    }
    return;
  }

  const ratingEl = document.getElementById('feedback-rating');
  const textEl = document.getElementById('feedback-text');
  
  const rating = ratingEl ? parseInt(ratingEl.value) : 0;
  const text = textEl ? textEl.value.trim() : '';
  const carbonRadio = document.querySelector('input[name="carbon-level"]:checked');

  if (!rating || rating < 1) {
    if (noteEl) { noteEl.textContent = 'Please select a star rating.'; noteEl.style.color = '#dc2626'; }
    return;
  }
  if (!text) {
    if (noteEl) { noteEl.textContent = 'Please write your feedback.'; noteEl.style.color = '#dc2626'; }
    return;
  }
  if (!carbonRadio) {
    if (noteEl) { noteEl.textContent = 'Please select your carbon footprint level.'; noteEl.style.color = '#dc2626'; }
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('feedbacks')
      .insert([
        {
          name: currentUser.user_metadata?.name || currentUser.email,
          email: currentUser.email,
          rating,
          text,
          carbon_level: carbonRadio.value
        }
      ]);

    if (error) throw error;

    if (noteEl) {
      noteEl.textContent = '✅ Thank you for your feedback!';
      noteEl.style.color = '#16a34a';
    }
    
    const btn = document.getElementById('submit-feedback-btn');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
    
    // Reset form visually
    if (textEl) textEl.value = '';
    const stars = document.querySelectorAll('#star-selector .star');
    stars.forEach(s => s.classList.remove('selected'));
    if (ratingEl) ratingEl.value = '0';
    if (carbonRadio) carbonRadio.checked = false;

    loadTestimonials();
  } catch (error) {
    if (noteEl) {
      noteEl.textContent = 'An error occurred. Please try again.';
      noteEl.style.color = '#dc2626';
    }
  }
}

// ══════════════════════════════════════════
//  Testimonials
// ══════════════════════════════════════════

async function loadTestimonials() {
  const grid = document.getElementById('testimonials-grid');
  if (!grid) return;

  try {
    const { data: feedbacks, error } = await supabaseClient
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!feedbacks || feedbacks.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No testimonials yet. Be the first to share your experience!</p></div>';
      return;
    }

    grid.innerHTML = feedbacks.map(fb => {
      const initial = fb.name ? fb.name.charAt(0).toUpperCase() : '?';
      const starsHtml = renderStars(fb.rating);
      return `
        <div class="testimonial-card">
          <div class="testimonial-header">
            <div class="testimonial-avatar">${initial}</div>
            <div class="testimonial-info">
              <span class="testimonial-name">${escapeHtml(fb.name)}</span>
            </div>
          </div>
          <div class="testimonial-stars">${starsHtml}</div>
          <p class="testimonial-text">"${escapeHtml(fb.text)}"</p>
        </div>`;
    }).join('');
  } catch (error) {
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

