-- Members
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  membership_number TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- Range visits
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  range_id TEXT NOT NULL,
  signed_in_at TEXT NOT NULL DEFAULT (datetime('now')),
  signed_out_at TEXT,
  source TEXT DEFAULT 'manual',
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- Hazard reports
CREATE TABLE IF NOT EXISTS hazard_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  range_id TEXT,
  description TEXT NOT NULL,
  photo_url TEXT,
  status TEXT DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- Admin accounts
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

-- Range status
CREATE TABLE IF NOT EXISTS range_status (
  range_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'open',
  note TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed range status
INSERT OR IGNORE INTO range_status (range_id, status, note) VALUES
  ('rifle', 'open', ''),
  ('outdoor-pistol', 'open', ''),
  ('indoor-pistol', 'open', ''),
  ('archery', 'open', ''),
  ('sporting-clays', 'open', ''),
  ('fishing', 'open', 'Catch and release');
