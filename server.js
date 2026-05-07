/* ════════════════════════════════════════════
   CarbonLens — Express Server (Prototype)
   ════════════════════════════════════════════ */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// ── Helpers ──
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { users: [], feedbacks: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ── API: Sign Up ──
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const data = readData();
  const exists = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  data.users.push({ name: name.trim(), email: email.trim().toLowerCase(), password });
  writeData(data);

  res.json({ success: true, user: { name: name.trim(), email: email.trim().toLowerCase() } });
});

// ── API: Log In ──
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const data = readData();
  const user = data.users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({ success: true, user: { name: user.name, email: user.email } });
});

// ── API: Get Feedbacks ──
app.get('/api/feedbacks', (req, res) => {
  const data = readData();
  res.json({ feedbacks: data.feedbacks });
});

// ── API: Submit Feedback ──
app.post('/api/feedback', (req, res) => {
  const { email, rating, text, carbonLevel } = req.body;

  if (!email || !rating || !text || !carbonLevel) {
    return res.status(400).json({ error: 'All feedback fields are required.' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  const data = readData();

  // Check if user already submitted feedback
  const alreadySubmitted = data.feedbacks.find(
    f => f.email.toLowerCase() === email.toLowerCase()
  );
  if (alreadySubmitted) {
    return res.status(409).json({ error: 'You have already submitted feedback.' });
  }

  // Find user name from users array
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'User not found. Please log in again.' });
  }

  const feedback = {
    name: user.name,
    email: user.email,
    rating: parseInt(rating),
    text: text.trim(),
    carbonLevel,
    date: new Date().toISOString()
  };

  data.feedbacks.push(feedback);
  writeData(data);

  res.json({ success: true, feedback });
});

// ── Start Server ──
app.listen(PORT, () => {
  console.log(`🌿 CarbonLens server running at http://localhost:${PORT}`);
});
