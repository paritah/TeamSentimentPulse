const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const DB_FILE = path.join(__dirname, "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── JSON DB helpers ───────────────────────────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], pulse_checkins: [], feedback_forms: [], feedback_responses: [], action_items: [] };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(arr) {
  return arr.length === 0 ? 1 : Math.max(...arr.map(x => x.id)) + 1;
}

// ── Initialise empty db.json if it doesn't exist ─────────────────────────────
if (!fs.existsSync(DB_FILE)) {
  writeDB({ users: [], pulse_checkins: [], feedback_forms: [], feedback_responses: [], action_items: [] });
  console.log("✅ Created empty db.json");
}

// ── API Routes ────────────────────────────────────────────────────────────────

// Users
app.get("/api/users", (req, res) => {
  const db = readDB();
  res.json(db.users.sort((a, b) => a.name.localeCompare(b.name)));
});

app.post("/api/users", (req, res) => {
  const db = readDB();
  const { name, email, role = "EMPLOYEE", department, job_title } = req.body;
  if (!name || !email) return res.status(400).json({ error: "name and email required" });
  if (db.users.find(u => u.email === email)) return res.status(409).json({ error: "Email already exists" });
  const user = { id: nextId(db.users), name, email, role, department: department || null, job_title: job_title || null, created_at: new Date().toISOString() };
  db.users.push(user);
  writeDB(db);
  res.status(201).json(user);
});

// Pulse Check-ins
app.get("/api/pulse-checkins", (req, res) => {
  const db = readDB();
  const enriched = db.pulse_checkins
    .map(c => { const u = db.users.find(u => u.id === c.user_id); return { ...c, user_name: u?.name, department: u?.department, role: u?.role }; })
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 100);
  res.json(enriched);
});

app.post("/api/pulse-checkins", (req, res) => {
  const db = readDB();
  const { user_id, mood_score, energy_score, stress_score, note } = req.body;
  if (!user_id || !mood_score || !energy_score || !stress_score)
    return res.status(400).json({ error: "user_id, mood_score, energy_score, stress_score required" });
  const checkin = { id: nextId(db.pulse_checkins), user_id: +user_id, mood_score: +mood_score, energy_score: +energy_score, stress_score: +stress_score, note: note || null, submitted_at: new Date().toISOString() };
  db.pulse_checkins.push(checkin);
  writeDB(db);
  res.status(201).json(checkin);
});

// Feedback Forms
app.get("/api/feedback-forms", (req, res) => {
  const db = readDB();
  res.json(db.feedback_forms);
});

app.get("/api/feedback-forms/:id/responses", (req, res) => {
  const db = readDB();
  res.json(db.feedback_responses.filter(r => r.form_id === +req.params.id));
});

app.post("/api/feedback-forms/:id/responses", (req, res) => {
  const db = readDB();
  const { respondent_name, user_id, satisfaction_score, manager_support_score, workload_score, comments } = req.body;
  const response = { id: nextId(db.feedback_responses), form_id: +req.params.id, user_id: user_id ? +user_id : null, respondent_name: respondent_name || "Anonymous", satisfaction_score: +satisfaction_score, manager_support_score: +manager_support_score, workload_score: +workload_score, comments: comments || null, submitted_at: new Date().toISOString() };
  db.feedback_responses.push(response);
  writeDB(db);
  res.status(201).json(response);
});

app.get("/api/feedback-responses", (req, res) => {
  const db = readDB();
  const enriched = db.feedback_responses.map(r => {
    const user = r.user_id ? db.users.find(u => u.id === r.user_id) : null;
    const form = db.feedback_forms.find(f => f.id === r.form_id);
    return { ...r, user_name: user?.name || r.respondent_name, department: user?.department || null, manager_id: user?.manager_id || null, form_title: form?.title || "Unknown survey" };
  }).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  res.json(enriched);
});

// Action Items
app.get("/api/action-items", (req, res) => {
  const db = readDB();
  res.json(db.action_items.sort((a, b) => a.priority - b.priority));
});

app.post("/api/action-items", (req, res) => {
  const db = readDB();
  const { title, description, assignee, priority = 2, due_date } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  const item = { id: nextId(db.action_items), title, description: description || null, assignee: assignee || null, status: "OPEN", priority: +priority, due_date: due_date || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  db.action_items.push(item);
  writeDB(db);
  res.status(201).json(item);
});

app.patch("/api/action-items/:id", (req, res) => {
  const db = readDB();
  const idx = db.action_items.findIndex(a => a.id === +req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.action_items[idx] = { ...db.action_items[idx], ...req.body, updated_at: new Date().toISOString() };
  writeDB(db);
  res.json(db.action_items[idx]);
});

app.delete("/api/action-items/:id", (req, res) => {
  const db = readDB();
  db.action_items = db.action_items.filter(a => a.id !== +req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// Dashboard stats
app.get("/api/stats", (req, res) => {
  const db = readDB();
  const employees = db.users.filter(u => u.role === "EMPLOYEE");
  const checkins = db.pulse_checkins;
  const avg = (arr, key) => arr.length ? +(arr.reduce((s, x) => s + x[key], 0) / arr.length).toFixed(1) : null;
  const highStress = new Set(checkins.filter(c => c.stress_score >= 4).map(c => c.user_id)).size;
  const openActions = db.action_items.filter(a => a.status === "OPEN").length;

  // Last 7 days trend
  const days = {};
  checkins.forEach(c => {
    const day = c.submitted_at.slice(0, 10);
    if (!days[day]) days[day] = [];
    days[day].push(c);
  });
  const trend = Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([day, arr]) => ({ day, mood: avg(arr, "mood_score"), stress: avg(arr, "stress_score") }));

  res.json({
    totalEmployees: employees.length,
    avgMood: avg(checkins, "mood_score"),
    avgEnergy: avg(checkins, "energy_score"),
    avgStress: avg(checkins, "stress_score"),
    highStress,
    openActions,
    trend,
  });
});

// ── Excel Template Download ───────────────────────────────────────────────────
app.get("/api/download-template", (req, res) => {
  const wb = XLSX.utils.book_new();
  const data = [
    ["Name *", "Email *", "Role *", "Department", "Job Title", "Manager Email"],
    ["John Smith", "john.smith@company.com", "EMPLOYEE", "Engineering", "Software Engineer", "jane.doe@company.com"],
    ["Jane Doe", "jane.doe@company.com", "MANAGER", "Engineering", "Engineering Manager", ""],
    ["Sarah HR", "sarah.hr@company.com", "HR_MANAGER", "Human Resources", "HR Manager", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, "Team Members");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=pulsecheck_team_template.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ── Excel / CSV Import ────────────────────────────────────────────────────────
app.post("/api/import-users", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const db = readDB();
    const results = { added: [], updated: [], errors: [] };

    // First pass: add/update all users (without manager links)
    const emailToId = {};
    db.users.forEach(u => { emailToId[u.email.toLowerCase()] = u.id; });

    rows.forEach((row, i) => {
      const name = String(row["Name *"] || row["Name"] || "").trim();
      const email = String(row["Email *"] || row["Email"] || "").trim().toLowerCase();
      const role = String(row["Role *"] || row["Role"] || "EMPLOYEE").trim().toUpperCase();
      const department = String(row["Department"] || "").trim() || null;
      const job_title = String(row["Job Title"] || "").trim() || null;

      if (!name || !email) { results.errors.push(`Row ${i + 2}: Missing name or email`); return; }
      if (!["EMPLOYEE", "MANAGER", "HR_MANAGER", "ADMIN"].includes(role)) {
        results.errors.push(`Row ${i + 2}: Invalid role "${role}". Use EMPLOYEE, MANAGER, HR_MANAGER, or ADMIN`);
        return;
      }

      const existing = db.users.find(u => u.email.toLowerCase() === email);
      if (existing) {
        existing.name = name;
        existing.role = role;
        existing.department = department;
        existing.job_title = job_title;
        emailToId[email] = existing.id;
        results.updated.push(name);
      } else {
        const user = { id: nextId(db.users), name, email, role, department, job_title, manager_id: null, created_at: new Date().toISOString() };
        db.users.push(user);
        emailToId[email] = user.id;
        results.added.push(name);
      }
    });

    // Second pass: set manager relationships
    rows.forEach(row => {
      const email = String(row["Email *"] || row["Email"] || "").trim().toLowerCase();
      const managerEmail = String(row["Manager Email"] || "").trim().toLowerCase();
      if (!email || !managerEmail) return;
      const user = db.users.find(u => u.email.toLowerCase() === email);
      const manager = db.users.find(u => u.email.toLowerCase() === managerEmail);
      if (user && manager) user.manager_id = manager.id;
    });

    writeDB(db);
    res.json({ success: true, added: results.added.length, updated: results.updated.length, errors: results.errors, details: results });
  } catch (e) {
    res.status(500).json({ error: "Failed to parse file: " + e.message });
  }
});

// ── Org Hierarchy ─────────────────────────────────────────────────────────────
app.get("/api/org-hierarchy", (req, res) => {
  const db = readDB();
  const checkins = db.pulse_checkins;
  const latest = {};
  checkins.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .forEach(c => { if (!latest[c.user_id]) latest[c.user_id] = c; });

  function buildTree(managerId) {
    return db.users
      .filter(u => u.manager_id === managerId)
      .map(u => ({
        ...u,
        latest_checkin: latest[u.id] || null,
        reports: buildTree(u.id),
      }));
  }

  const roots = buildTree(null);
  res.json(roots);
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n✅ PulseCheck running at http://localhost:${PORT}\n`);
});
