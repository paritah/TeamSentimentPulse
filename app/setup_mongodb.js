/**
 * Run: node setup_mongodb.js
 * Writes new server.js (MongoDB), migrate.js, .env.example, railway.toml
 */
const fs = require("fs");
const path = require("path");
const dir = __dirname;

// ─────────────────────────── server.js ────────────────────────────────────────
const serverJs = `const express = require("express");
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");
const { MongoClient } = require("mongodb");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/pulsecheck";
let db;

async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db("pulsecheck");
  console.log("Connected to MongoDB");
  const count = await db.collection("feedback_forms").countDocuments();
  if (count === 0) {
    await db.collection("feedback_forms").insertOne({
      id: 1, title: "May 2026 Pulse Survey", description: "Monthly pulse check",
      questions: [], created_at: new Date().toISOString()
    });
    await db.collection("counters").updateOne(
      { _id: "feedback_forms" }, { $set: { seq: 1 } }, { upsert: true }
    );
  }
}

async function nextId(collectionName) {
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: collectionName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result.seq;
}

// -- USERS --
app.get("/api/users", async (req, res) => {
  try {
    const users = await db.collection("users").find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name, email, role = "EMPLOYEE", department, job_title } = req.body;
    if (!name || !email) return res.status(400).json({ error: "name and email required" });
    const existing = await db.collection("users").findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already exists" });
    const id = await nextId("users");
    const user = { id, name, email: email.toLowerCase(), role, department: department || null, job_title: job_title || null, manager_id: null, created_at: new Date().toISOString() };
    await db.collection("users").insertOne(user);
    res.status(201).json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- PULSE CHECK-INS --
app.get("/api/pulse-checkins", async (req, res) => {
  try {
    const checkins = await db.collection("pulse_checkins").find({}, { projection: { _id: 0 } }).sort({ submitted_at: -1 }).limit(100).toArray();
    const users = await db.collection("users").find({}).toArray();
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const enriched = checkins.map(c => ({
      ...c, user_name: userMap[c.user_id]?.name,
      department: userMap[c.user_id]?.department, role: userMap[c.user_id]?.role
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/pulse-checkins", async (req, res) => {
  try {
    const { user_id, mood_score, energy_score, stress_score, note } = req.body;
    if (!user_id || !mood_score || !energy_score || !stress_score)
      return res.status(400).json({ error: "user_id, mood_score, energy_score, stress_score required" });
    const id = await nextId("pulse_checkins");
    const checkin = { id, user_id: +user_id, mood_score: +mood_score, energy_score: +energy_score, stress_score: +stress_score, note: note || null, submitted_at: new Date().toISOString() };
    await db.collection("pulse_checkins").insertOne(checkin);
    res.status(201).json(checkin);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- FEEDBACK FORMS --
app.get("/api/feedback-forms", async (req, res) => {
  try {
    const forms = await db.collection("feedback_forms").find({}, { projection: { _id: 0 } }).toArray();
    res.json(forms);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/feedback-forms/:id/responses", async (req, res) => {
  try {
    const responses = await db.collection("feedback_responses").find({ form_id: +req.params.id }, { projection: { _id: 0 } }).toArray();
    res.json(responses);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/feedback-forms/:id/responses", async (req, res) => {
  try {
    const { respondent_name, user_id, satisfaction_score, manager_support_score, workload_score, comments } = req.body;
    const id = await nextId("feedback_responses");
    const response = {
      id, form_id: +req.params.id, user_id: user_id ? +user_id : null,
      respondent_name: respondent_name || "Anonymous",
      satisfaction_score: +satisfaction_score, manager_support_score: +manager_support_score,
      workload_score: +workload_score, comments: comments || null, submitted_at: new Date().toISOString()
    };
    await db.collection("feedback_responses").insertOne(response);
    res.status(201).json(response);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/feedback-responses", async (req, res) => {
  try {
    const responses = await db.collection("feedback_responses").find({}, { projection: { _id: 0 } }).sort({ submitted_at: -1 }).toArray();
    const [users, forms] = await Promise.all([
      db.collection("users").find({}).toArray(),
      db.collection("feedback_forms").find({}).toArray()
    ]);
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const formMap = Object.fromEntries(forms.map(f => [f.id, f]));
    const enriched = responses.map(r => ({
      ...r,
      user_name: (r.user_id ? userMap[r.user_id]?.name : null) || r.respondent_name,
      department: r.user_id ? userMap[r.user_id]?.department : null,
      manager_id: r.user_id ? userMap[r.user_id]?.manager_id : null,
      form_title: formMap[r.form_id]?.title || "Unknown survey"
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- ACTION ITEMS --
app.get("/api/action-items", async (req, res) => {
  try {
    const items = await db.collection("action_items").find({}, { projection: { _id: 0 } }).sort({ priority: 1 }).toArray();
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/action-items", async (req, res) => {
  try {
    const { title, description, assignee, priority = 2, due_date } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const id = await nextId("action_items");
    const item = { id, title, description: description || null, assignee: assignee || null, status: "OPEN", priority: +priority, due_date: due_date || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await db.collection("action_items").insertOne(item);
    res.status(201).json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/action-items/:id", async (req, res) => {
  try {
    const id = +req.params.id;
    const { _id, ...updates } = req.body;
    await db.collection("action_items").updateOne({ id }, { $set: { ...updates, updated_at: new Date().toISOString() } });
    const updated = await db.collection("action_items").findOne({ id }, { projection: { _id: 0 } });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/action-items/:id", async (req, res) => {
  try {
    await db.collection("action_items").deleteOne({ id: +req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- STATS --
app.get("/api/stats", async (req, res) => {
  try {
    const [users, checkins, actionItems] = await Promise.all([
      db.collection("users").find({}).toArray(),
      db.collection("pulse_checkins").find({}).toArray(),
      db.collection("action_items").find({}).toArray()
    ]);
    const employees = users.filter(u => u.role === "EMPLOYEE");
    const avg = (arr, key) => arr.length ? +(arr.reduce((s, x) => s + x[key], 0) / arr.length).toFixed(1) : null;
    const highStress = new Set(checkins.filter(c => c.stress_score >= 4).map(c => c.user_id)).size;
    const openActions = actionItems.filter(a => a.status === "OPEN").length;
    const days = {};
    checkins.forEach(c => { const day = c.submitted_at.slice(0, 10); if (!days[day]) days[day] = []; days[day].push(c); });
    const trend = Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-7)
      .map(([day, arr]) => ({ day, mood: avg(arr, "mood_score"), stress: avg(arr, "stress_score") }));
    res.json({ totalEmployees: employees.length, avgMood: avg(checkins, "mood_score"), avgEnergy: avg(checkins, "energy_score"), avgStress: avg(checkins, "stress_score"), highStress, openActions, trend });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- TEMPLATE DOWNLOAD --
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

// -- IMPORT USERS --
app.post("/api/import-users", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const results = { added: [], updated: [], errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row["Name *"] || row["Name"] || "").trim();
      const email = String(row["Email *"] || row["Email"] || "").trim().toLowerCase();
      const role = String(row["Role *"] || row["Role"] || "EMPLOYEE").trim().toUpperCase();
      const department = String(row["Department"] || "").trim() || null;
      const job_title = String(row["Job Title"] || "").trim() || null;
      if (!name || !email) { results.errors.push("Row " + (i + 2) + ": Missing name or email"); continue; }
      if (!["EMPLOYEE", "MANAGER", "HR_MANAGER", "ADMIN"].includes(role)) { results.errors.push("Row " + (i + 2) + ": Invalid role " + role); continue; }
      const existing = await db.collection("users").findOne({ email });
      if (existing) {
        await db.collection("users").updateOne({ email }, { $set: { name, role, department, job_title } });
        results.updated.push(name);
      } else {
        const id = await nextId("users");
        await db.collection("users").insertOne({ id, name, email, role, department, job_title, manager_id: null, created_at: new Date().toISOString() });
        results.added.push(name);
      }
    }
    for (const row of rows) {
      const email = String(row["Email *"] || row["Email"] || "").trim().toLowerCase();
      const managerEmail = String(row["Manager Email"] || "").trim().toLowerCase();
      if (!email || !managerEmail) continue;
      const manager = await db.collection("users").findOne({ email: managerEmail });
      if (manager) await db.collection("users").updateOne({ email }, { $set: { manager_id: manager.id } });
    }
    res.json({ success: true, added: results.added.length, updated: results.updated.length, errors: results.errors, details: results });
  } catch (e) { res.status(500).json({ error: "Failed to parse file: " + e.message }); }
});

// -- ORG HIERARCHY --
app.get("/api/org-hierarchy", async (req, res) => {
  try {
    const [users, checkins] = await Promise.all([
      db.collection("users").find({}, { projection: { _id: 0 } }).toArray(),
      db.collection("pulse_checkins").find({}).sort({ submitted_at: -1 }).toArray()
    ]);
    const latest = {};
    checkins.forEach(c => { if (!latest[c.user_id]) latest[c.user_id] = c; });
    function buildTree(managerId) {
      return users.filter(u => u.manager_id === managerId)
        .map(u => ({ ...u, latest_checkin: latest[u.id] || null, reports: buildTree(u.id) }));
    }
    res.json(buildTree(null));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- START --
const PORT = process.env.PORT || 3001;
connectDB().then(() => {
  app.listen(PORT, () => console.log("PulseCheck running on port " + PORT));
}).catch(err => { console.error("MongoDB connection failed:", err.message); process.exit(1); });
`;

// ─────────────────────────── migrate.js ───────────────────────────────────────
const migrateJs = `const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI environment variable not set");
  console.error("Set it first: set MONGODB_URI=mongodb+srv://...");
  process.exit(1);
}

const DB_FILE = path.join(__dirname, "db.json");

async function migrate() {
  if (!fs.existsSync(DB_FILE)) {
    console.log("No db.json found - nothing to migrate");
    return;
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  console.log("Found db.json:");
  console.log("  " + (data.users?.length || 0) + " users");
  console.log("  " + (data.pulse_checkins?.length || 0) + " checkins");
  console.log("  " + (data.feedback_forms?.length || 0) + " feedback forms");
  console.log("  " + (data.feedback_responses?.length || 0) + " responses");
  console.log("  " + (data.action_items?.length || 0) + " action items");
  console.log("Connecting to MongoDB Atlas...");

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db("pulsecheck");
  console.log("Connected!");

  // Clear and re-import (safe to re-run)
  for (const col of ["users","pulse_checkins","feedback_forms","feedback_responses","action_items","counters"]) {
    await db.collection(col).deleteMany({});
  }

  if (data.users?.length)              await db.collection("users").insertMany(data.users);
  if (data.pulse_checkins?.length)     await db.collection("pulse_checkins").insertMany(data.pulse_checkins);
  if (data.feedback_forms?.length)     await db.collection("feedback_forms").insertMany(data.feedback_forms);
  if (data.feedback_responses?.length) await db.collection("feedback_responses").insertMany(data.feedback_responses);
  if (data.action_items?.length)       await db.collection("action_items").insertMany(data.action_items);

  const getMax = arr => arr?.length ? Math.max(...arr.map(x => x.id || 0)) : 0;
  await db.collection("counters").insertMany([
    { _id: "users",              seq: getMax(data.users) },
    { _id: "pulse_checkins",     seq: getMax(data.pulse_checkins) },
    { _id: "feedback_forms",     seq: getMax(data.feedback_forms) },
    { _id: "feedback_responses", seq: getMax(data.feedback_responses) },
    { _id: "action_items",       seq: getMax(data.action_items) },
  ]);

  console.log("Migration complete! " + (data.users?.length || 0) + " users migrated to MongoDB.");
  await client.close();
}

migrate().catch(err => { console.error("Migration failed:", err.message); process.exit(1); });
`;

// ─────────────────────────── .env.example ─────────────────────────────────────
const envExample = `# Copy this to .env and fill in your values
# Get MONGODB_URI from: https://cloud.mongodb.com (free cluster -> Connect -> Drivers)
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/pulsecheck?retryWrites=true&w=majority

# Port (Railway sets this automatically)
PORT=3001
`;

// ─────────────────────────── railway.toml ─────────────────────────────────────
const railwayToml = `[build]
builder = "nixpacks"

[deploy]
startCommand = "node server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
`;

// ─────────────────────────── Write files ──────────────────────────────────────
fs.writeFileSync(path.join(dir, "server.js"), serverJs);
console.log("  server.js updated (MongoDB)");

fs.writeFileSync(path.join(dir, "migrate.js"), migrateJs);
console.log("  migrate.js created");

if (!fs.existsSync(path.join(dir, ".env.example"))) {
  fs.writeFileSync(path.join(dir, ".env.example"), envExample);
  console.log("  .env.example created");
}

if (!fs.existsSync(path.join(dir, "railway.toml"))) {
  fs.writeFileSync(path.join(dir, "railway.toml"), railwayToml);
  console.log("  railway.toml created");
}

console.log("\nDone! Next steps:");
console.log("  1. npm install mongodb");
console.log("  2. Set MONGODB_URI environment variable");
console.log("  3. node migrate.js       (migrate your 75 users to MongoDB)");
console.log("  4. node server.js        (test locally)");
