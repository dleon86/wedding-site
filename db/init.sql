-- Guestbook entries table
-- Run this SQL in Neon SQL Editor if the table doesn't exist

CREATE TABLE IF NOT EXISTS guestbook_entries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  note TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  approved BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries on approved entries
CREATE INDEX IF NOT EXISTS idx_guestbook_approved ON guestbook_entries(approved, created_at DESC);
