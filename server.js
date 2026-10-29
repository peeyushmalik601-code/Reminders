const express = require("express");
const webpush = require("web-push");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// === VAPID KEYS ===
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "PASTE_PUBLIC_KEY_HERE";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "PASTE_PRIVATE_KEY_HERE";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:you@example.com";

if (!VAPID_PUBLIC || !VAPID_PRIVATE || VAPID_PUBLIC.includes("PASTE_")) {
  console.error("❌ VAPID keys missing.");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// === STORAGE ===
const DB_FILE = path.join(__dirname, "data.json");
let db = { devices: {}, reminders: [] };
try {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
} catch (e) { console.error("DB load failed:", e.message); }

function persist() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}

// === ROUTES ===
app.get("/api/vapid-public-key", (req, res) => res.json({ key: VAPID_PUBLIC }));

app.post("/api/subscribe", (req, res) => {
  const { deviceId, subscription } = req.body;
  if (!deviceId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "deviceId & subscription required" });
  }
  db.devices[deviceId] = { subscription, updatedAt: Date.now() };
  persist();
  res.json({ ok: true });
});

app.post("/api/reminders", (req, res) => {
  const { deviceId, title, message, time, repeat } = req.body;
  if (!deviceId || !title || !time) return res.status(400).json({ error: "missing fields" });
  
  const reminder = {
    id: "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    deviceId, title: String(title).slice(0, 100),
    message: String(message || "").slice(0, 300),
    time: Number(time), repeat: repeat === "daily" ? "daily" : "none",
    fired: false, createdAt: Date.now()
  };
  db.reminders.push(reminder);
  persist();
  res.json({ ok: true, reminder });
});

// NEW: Edit/Update Reminder Route
app.put("/api/reminders/:id", (req, res) => {
  const { title, message, time, repeat } = req.body;
  const reminder = db.reminders.find(r => r.id === req.params.id);
  if (!reminder) return res.status(404).json({ error: "Not found" });

  if (title) reminder.title = String(title).slice(0, 100);
  if (message !== undefined) reminder.message = String(message || "").slice(0, 300);
  if (time) reminder.time = Number(time);
  if (repeat) reminder.repeat = repeat === "daily" ? "daily" : "none";
  reminder.fired = false; // Reset fired status on edit

  persist();
  res.json({ ok: true, reminder });
});

app.get("/api/reminders", (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json([]);
  res.json(db.reminders.filter(r => r.deviceId === deviceId));
});

app.delete("/api/reminders/:id", (req, res) => {
  const before = db.reminders.length;
  db.reminders = db.reminders.filter(r => r.id !== req.params.id);
  persist();
  res.json({ ok: true, deleted: before - db.reminders.length });
});

app.post("/api/test-push", async (req, res) => {
  const { deviceId } = req.body;
  const device = db.devices[deviceId];
  if (!device) return res.status(404).json({ error: "device not subscribed" });
  try {
    await webpush.sendNotification(device.subscription, JSON.stringify({
      title: "✅ Test Push",
      body: "Tab band karke dekho — phir bhi notification aayegi!"
    }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message, statusCode: e.statusCode });
  }
});

// === CRON ===
setInterval(async () => {
  const now = Date.now();
  let changed = false;
  for (const r of db.reminders) {
    if (r.fired || now < r.time) continue;

    const device = db.devices[r.deviceId];
    if (device) {
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify({
          title: r.title, body: r.message || "", id: r.id
        }));
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) delete db.devices[r.deviceId];
      }
    }
    if (r.repeat === "daily") {
      r.time += 86400000;
      while (r.time <= now) r.time += 86400000;
    } else {
      r.fired = true;
    }
    changed = true;
  }
  if (changed) persist();
}, 5000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Server running on port " + PORT));
