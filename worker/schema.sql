CREATE TABLE IF NOT EXISTS subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  tz TEXT NOT NULL,
  items TEXT NOT NULL,   -- JSON: [{ "t": "21:00", "d": [0..6, 0 = lunes], "title": "Leer" }]
  sent INTEGER NOT NULL  -- ms: reminders up to this moment were already handled
);
