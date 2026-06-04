/**
 * Run: node setup_supabase.js
 * Writes new server.js (PostgreSQL/Supabase) and migrate_supabase.js
 */
const fs = require("fs");
const path = require("path");
const dir = __dirname;

// ─────────────────────────── server.js ────────────────────────────────────────
const serverJs = `const express = require("express");
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");
const { Pool } = require("pg");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("supabase")
    ? { rejectUnauthorized: false }
    : false
});

// -- USERS --
app.get("/api/users", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users ORDER BY name");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name, email, role = "EMPLOYEE", department, job_title } = req.body;
    if (!name || !email) return res.status(400).json({ error: "name and email required" });
    const { rows } = await pool.query(
      "INSERT INTO users (name,email,role,department,job_title) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, email.toLowerCase(), role, department || null, job_title || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: e.message });
  }
});

// -- PULSE CHECK-INS --
app.get("/api/pulse-checkins", async (req, res) => {
  try {
    const { rows } = await pool.query(\`
      SELECT c.*, u.name as user_name, u.department, u.role
      FROM pulse_checkins c LEFT JOIN users u ON u.id = c.user_id
      ORDER BY c.submitted_at DESC LIMIT 100
    \`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/pulse-checkins", async (req, res) => {
  try {
    const { user_id, mood_score, energy_score, stress_score, note } = req.body;
    if (!user_id || !mood_score || !energy_score || !stress_score)
      return res.status(400).json({ error: "user_id, mood_score, energy_score, stress_score required" });
    const { rows } = await pool.query(
      "INSERT INTO pulse_checkins (user_id,mood_score,energy_score,stress_score,note) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [+user_id, +mood_score, +energy_score, +stress_score, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- FEEDBACK FORMS --
app.get("/api/feedback-forms", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM feedback_forms ORDER BY id");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/feedback-forms/:id/responses", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM feedback_responses WHERE form_id=$1 ORDER BY submitted_at DESC",
      [+req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/feedback-forms/:id/responses", async (req, res) => {
  try {
    const { respondent_name, user_id, satisfaction_score, manager_support_score, workload_score, comments } = req.body;
    const { rows } = await pool.query(
      \`INSERT INTO feedback_responses
        (form_id,user_id,respondent_name,satisfaction_score,manager_support_score,workload_score,comments)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *\`,
      [+req.params.id, user_id ? +user_id : null, respondent_name || "Anonymous",
       +satisfaction_score, +manager_support_score, +workload_score, comments || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/feedback-responses", async (req, res) => {
  try {
    const { rows } = await pool.query(\`
      SELECT r.*, u.name as user_name, u.department, u.manager_id, f.title as form_title
      FROM feedback_responses r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN feedback_forms f ON f.id = r.form_id
      ORDER BY r.submitted_at DESC
    \`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- ACTION ITEMS --
app.get("/api/action-items", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM action_items ORDER BY priority, created_at");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/action-items", async (req, res) => {
  try {
    const { title, description, assignee, priority = 2, due_date } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const { rows } = await pool.query(
      "INSERT INTO action_items (title,description,assignee,priority,due_date) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [title, description || null, assignee || null, +priority, due_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/action-items/:id", async (req, res) => {
  try {
    const allowed = ["title","description","assignee","status","priority","due_date"];
    const sets = []; const vals = [];
    allowed.forEach(k => { if (req.body[k] !== undefined) { sets.push(k + "=$" + (vals.length+1)); vals.push(req.body[k]); } });
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    sets.push("updated_at=NOW()");
    vals.push(+req.params.id);
    const { rows } = await pool.query(
      "UPDATE action_items SET " + sets.join(",") + " WHERE id=$" + vals.length + " RETURNING *", vals
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/action-items/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM action_items WHERE id=$1", [+req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- STATS --
app.get("/api/stats", async (req, res) => {
  try {
    const [usersR, checkinsR, actionR] = await Promise.all([
      pool.query("SELECT * FROM users"),
      pool.query("SELECT * FROM pulse_checkins"),
      pool.query("SELECT * FROM action_items")
    ]);
    const users = usersR.rows; const checkins = checkinsR.rows; const actions = actionR.rows;
    const avg = (arr, key) => arr.length ? +(arr.reduce((s, x) => s + (+x[key] || 0), 0) / arr.length).toFixed(1) : null;
    const highStress = new Set(checkins.filter(c => +c.stress_score >= 4).map(c => c.user_id)).size;
    const days = {};
    checkins.forEach(c => {
      const day = (c.submitted_at || "").toString().slice(0, 10);
      if (!days[day]) days[day] = [];
      days[day].push(c);
    });
    const trend = Object.entries(days).sort(([a],[b]) => a.localeCompare(b)).slice(-7)
      .map(([day, arr]) => ({ day, mood: avg(arr, "mood_score"), stress: avg(arr, "stress_score") }));
    res.json({
      totalEmployees: users.filter(u => u.role === "EMPLOYEE").length,
      avgMood: avg(checkins, "mood_score"), avgEnergy: avg(checkins, "energy_score"),
      avgStress: avg(checkins, "stress_score"), highStress,
      openActions: actions.filter(a => a.status === "OPEN").length, trend
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- TEMPLATE DOWNLOAD --
app.get("/api/download-template", (req, res) => {
  const XLSX2 = require("xlsx");
  const wb = XLSX2.utils.book_new();
  const data = [
    ["Name *","Email *","Role *","Department","Job Title","Manager Email"],
    ["John Smith","john.smith@company.com","EMPLOYEE","Engineering","Software Engineer","jane.doe@company.com"],
    ["Jane Doe","jane.doe@company.com","MANAGER","Engineering","Engineering Manager",""],
    ["Sarah HR","sarah.hr@company.com","HR_MANAGER","Human Resources","HR Manager",""],
  ];
  const ws = XLSX2.utils.aoa_to_sheet(data);
  ws["!cols"] = [{wch:20},{wch:30},{wch:12},{wch:20},{wch:25},{wch:30}];
  XLSX2.utils.book_append_sheet(wb, ws, "Team Members");
  const buf = XLSX2.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition","attachment; filename=pulsecheck_team_template.xlsx");
  res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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
      if (!name || !email) { results.errors.push("Row " + (i+2) + ": Missing name or email"); continue; }
      if (!["EMPLOYEE","MANAGER","HR_MANAGER","ADMIN"].includes(role)) { results.errors.push("Row " + (i+2) + ": Invalid role " + role); continue; }
      try {
        const exists = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
        if (exists.rows.length) {
          await pool.query("UPDATE users SET name=$1,role=$2,department=$3,job_title=$4 WHERE email=$5",
            [name, role, department, job_title, email]);
          results.updated.push(name);
        } else {
          await pool.query("INSERT INTO users (name,email,role,department,job_title) VALUES ($1,$2,$3,$4,$5)",
            [name, email, role, department, job_title]);
          results.added.push(name);
        }
      } catch (rowErr) { results.errors.push("Row " + (i+2) + ": " + rowErr.message); }
    }
    for (const row of rows) {
      const email = String(row["Email *"] || row["Email"] || "").trim().toLowerCase();
      const managerEmail = String(row["Manager Email"] || "").trim().toLowerCase();
      if (!email || !managerEmail) continue;
      const mgr = await pool.query("SELECT id FROM users WHERE email=$1", [managerEmail]);
      if (mgr.rows.length) {
        await pool.query("UPDATE users SET manager_id=$1 WHERE email=$2", [mgr.rows[0].id, email]);
      }
    }
    res.json({ success: true, added: results.added.length, updated: results.updated.length, errors: results.errors });
  } catch (e) { res.status(500).json({ error: "Failed to parse file: " + e.message }); }
});

// -- ORG HIERARCHY --
app.get("/api/org-hierarchy", async (req, res) => {
  try {
    const [usersR, checkinsR] = await Promise.all([
      pool.query("SELECT * FROM users"),
      pool.query("SELECT DISTINCT ON (user_id) * FROM pulse_checkins ORDER BY user_id, submitted_at DESC")
    ]);
    const users = usersR.rows;
    const latestMap = Object.fromEntries(checkinsR.rows.map(c => [c.user_id, c]));
    function buildTree(managerId) {
      return users.filter(u => u.manager_id === managerId)
        .map(u => ({ ...u, latest_checkin: latestMap[u.id] || null, reports: buildTree(u.id) }));
    }
    res.json(buildTree(null));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -- START --
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("PulseCheck running on port " + PORT));
`;

// ─────────────────────────── migrate_supabase.js ──────────────────────────────
const migrateJs = `const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable not set");
  console.error("Example: set DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres");
  process.exit(1);
}

const DB_FILE = path.join(__dirname, "db.json");
if (!fs.existsSync(DB_FILE)) {
  console.log("No db.json found — nothing to migrate. Schema must already be set up via supabase_schema.sql");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
console.log("db.json found:");
console.log("  " + (data.users?.length || 0) + " users");
console.log("  " + (data.pulse_checkins?.length || 0) + " pulse checkins");
console.log("  " + (data.feedback_forms?.length || 0) + " feedback forms");
console.log("  " + (data.feedback_responses?.length || 0) + " feedback responses");
console.log("  " + (data.action_items?.length || 0) + " action items");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log("\\nConnecting to Supabase...");
  const client = await pool.connect();
  console.log("Connected!\\n");

  try {
    // --- Users (insert in order so manager_id refs resolve) ---
    if (data.users?.length) {
      console.log("Migrating users...");
      // First pass: insert without manager_id
      for (const u of data.users) {
        await client.query(
          \`INSERT INTO users (id, name, email, role, department, job_title, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role,
             department=EXCLUDED.department, job_title=EXCLUDED.job_title\`,
          [u.id, u.name, u.email?.toLowerCase(), u.role || "EMPLOYEE",
           u.department || null, u.job_title || null,
           u.created_at || new Date().toISOString()]
        );
      }
      // Second pass: set manager_id
      for (const u of data.users) {
        if (u.manager_id) {
          await client.query("UPDATE users SET manager_id=$1 WHERE id=$2", [u.manager_id, u.id]);
        }
      }
      // Reset sequence so new inserts don't collide
      const maxId = Math.max(...data.users.map(u => u.id || 0));
      await client.query("SELECT setval('users_id_seq', $1)", [maxId]);
      console.log("  " + data.users.length + " users migrated");
    }

    // --- Feedback forms ---
    if (data.feedback_forms?.length) {
      await client.query("DELETE FROM feedback_forms");
      for (const f of data.feedback_forms) {
        await client.query(
          "INSERT INTO feedback_forms (id, title, description, created_at) VALUES ($1,$2,$3,$4)",
          [f.id, f.title, f.description || null, f.created_at || new Date().toISOString()]
        );
      }
      const maxId = Math.max(...data.feedback_forms.map(f => f.id || 0));
      await client.query("SELECT setval('feedback_forms_id_seq', $1)", [maxId]);
      console.log("  " + data.feedback_forms.length + " feedback forms migrated");
    }

    // --- Feedback responses ---
    if (data.feedback_responses?.length) {
      for (const r of data.feedback_responses) {
        await client.query(
          \`INSERT INTO feedback_responses
             (id, form_id, user_id, respondent_name, satisfaction_score,
              manager_support_score, workload_score, comments, submitted_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT DO NOTHING\`,
          [r.id, r.form_id, r.user_id || null, r.respondent_name || "Anonymous",
           r.satisfaction_score, r.manager_support_score, r.workload_score,
           r.comments || null, r.submitted_at || new Date().toISOString()]
        );
      }
      const maxId = Math.max(...data.feedback_responses.map(r => r.id || 0));
      await client.query("SELECT setval('feedback_responses_id_seq', $1)", [maxId]);
      console.log("  " + data.feedback_responses.length + " feedback responses migrated");
    }

    // --- Pulse checkins ---
    if (data.pulse_checkins?.length) {
      for (const c of data.pulse_checkins) {
        await client.query(
          \`INSERT INTO pulse_checkins (id, user_id, mood_score, energy_score, stress_score, note, submitted_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING\`,
          [c.id, c.user_id, c.mood_score, c.energy_score, c.stress_score,
           c.note || null, c.submitted_at || new Date().toISOString()]
        );
      }
      const maxId = Math.max(...data.pulse_checkins.map(c => c.id || 0));
      await client.query("SELECT setval('pulse_checkins_id_seq', $1)", [maxId]);
      console.log("  " + data.pulse_checkins.length + " pulse checkins migrated");
    }

    // --- Action items ---
    if (data.action_items?.length) {
      for (const a of data.action_items) {
        await client.query(
          \`INSERT INTO action_items (id, title, description, assignee, status, priority, due_date, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING\`,
          [a.id, a.title, a.description || null, a.assignee || null, a.status || "OPEN",
           a.priority || 2, a.due_date || null,
           a.created_at || new Date().toISOString(), a.updated_at || new Date().toISOString()]
        );
      }
      const maxId = Math.max(...data.action_items.map(a => a.id || 0));
      await client.query("SELECT setval('action_items_id_seq', $1)", [maxId]);
      console.log("  " + data.action_items.length + " action items migrated");
    }

    console.log("\\n✅ Migration complete! All data is now in Supabase.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => { console.error("Migration failed:", err.message); process.exit(1); });
`;

// ─────────────────────────── Write files ──────────────────────────────────────
fs.writeFileSync(path.join(dir, "server.js"), serverJs);
console.log("  server.js written (PostgreSQL/Supabase)");

fs.writeFileSync(path.join(dir, "migrate_supabase.js"), migrateJs);
console.log("  migrate_supabase.js written");

// Update package.json
const pkgPath = path.join(dir, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.dependencies["pg"] = "^8.11.0";
delete pkg.dependencies["mongodb"]; // remove mongodb if present
pkg.scripts["migrate"] = "node migrate_supabase.js";
pkg.scripts["setup"] = "node setup_supabase.js";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log("  package.json updated (added pg, removed mongodb)");

console.log("\nDone! Follow these steps:");
console.log("");
console.log("STEP 1: Create Supabase tables");
console.log("  - Go to supabase.com > your project > SQL Editor > New Query");
console.log("  - Paste the contents of supabase_schema.sql and click Run");
console.log("");
console.log("STEP 2: Install dependencies");
console.log("  npm install");
console.log("");
console.log("STEP 3: Migrate your 75 users");
console.log("  set DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres");
console.log("  node migrate_supabase.js");
console.log("");
console.log("STEP 4: Run locally");
console.log("  node server.js");
