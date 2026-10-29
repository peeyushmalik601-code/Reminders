const express = require("express");
const webpush = require("web-push");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "PASTE_PUBLIC_KEY_HERE";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "PASTE_PRIVATE_KEY_HERE";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:you@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const DB_FILE = path.join(__dirname, "data.json");
let db = { devices: {}, reminders: [] };
try { if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (e) {}

function persist() { try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {} }

app.get("/api/vapid-public-key", (req, res) => res.json({ key: VAPID_PUBLIC }));

app.post("/api/subscribe", (req, res) => {
  const { deviceId, subscription } = req.body;
  if (!deviceId || !subscription) return res.status(400).json({ error: "missing" });
  db.devices[deviceId] = { subscription, updatedAt: Date.now() };
  persist(); res.json({ ok: true });
});

app.post("/api/reminders", (req, res) => {
  const { deviceId, title, message, time, repeat, category } = req.body;
  if (!deviceId || !title || !time) return res.status(400).json({ error: "missing fields" });
  
  const reminder = {
    id: "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    deviceId, title, message: message || "", time: Number(time), 
    repeat: repeat === "daily" ? "daily" : "none",
    category: category || "other",
    fired: false, paused: false, createdAt: Date.now()
  };
  db.reminders.push(reminder);
  persist();
  res.json({ ok: true, reminder });
});

// Edit & Pause/Resume
app.put("/api/reminders/:id", (req, res) => {
  const { title, message, time, repeat, category, paused, fired } = req.body;
  const r = db.reminders.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });

  if (title !== undefined) r.title = title;
  if (message !== undefined) r.message = message;
  if (time !== undefined) r.time = Number(time);
  if (repeat !== undefined) r.repeat = repeat;
  if (category !== undefined) r.category = category;
  if (paused !== undefined) r.paused = paused;
  if (fired !== undefined) r.fired = fired;

  persist(); res.json({ ok: true, reminder: r });
});

// Snooze API (called from Service Worker)
app.post("/api/snooze/:id", (req, res) => {
  const r = db.reminders.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  
  r.time = Date.now() + 10 * 60000; // +10 mins
  r.fired = false;
  persist(); res.json({ ok: true });
});

app.get("/api/reminders", (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json([]);
  res.json(db.reminders.filter(r => r.deviceId === deviceId));
});

app.delete("/api/reminders/:id", (req, res) => {
  db.reminders = db.reminders.filter(r => r.id !== req.params.id);
  persist(); res.json({ ok: true });
});

// Cron: Har 5 sec check
setInterval(async () => {
  const now = Date.now();
  let changed = false;
  for (const r of db.reminders) {
    if (r.fired || r.paused || now < r.time) continue;

    const device = db.devices[r.deviceId];
    if (device) {
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify({
          title: r.title, 
          body: r.message || "Tap to open",
          id: r.id,
          category: r.category,
          actions: [
            { action: "snooze", title: "Snooze 10m" },
            { action: "done", title: "Mark Done" }
          ],
          vibrate: [200, 100, 200, 100, 200] // Custom Vibration Pattern
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
app.listen(PORT, () => console.log("Server running"));
