-- ============================================================
-- Auth Schema — Magic Link + Invite Code + Audit Log
-- ============================================================

-- ── 1. user_profiles ─────────────────────────────────────────
-- Extends auth.users (created by Supabase on first login)
CREATE TABLE user_profiles (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text        NOT NULL,
  full_name  text,
  role       text        NOT NULL CHECK (role IN ('admin', 'viewer')),
  company    text,                         -- viewer only: e.g. "Telesales Co. A"
  invited_by uuid        REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  last_seen  timestamptz                   -- updated on every login
);

CREATE INDEX idx_user_profiles_role    ON user_profiles (role);
CREATE INDEX idx_user_profiles_company ON user_profiles (company);

-- ── 2. invite_codes ──────────────────────────────────────────
-- Admin generates codes pre-assigned with role + company
CREATE TABLE invite_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        UNIQUE NOT NULL,  -- e.g. "ADMIN-2026-XK9F"
  role       text        NOT NULL CHECK (role IN ('admin', 'viewer')),
  company    text,                         -- pre-assigned for viewer role
  note       text,                         -- e.g. "สำหรับทีม Unilever"
  created_by uuid        REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,                  -- NULL = no expiry
  max_uses   integer     DEFAULT 1,        -- how many users can use this code
  use_count  integer     DEFAULT 0,
  is_active  boolean     DEFAULT true      -- admin can revoke
);

CREATE INDEX idx_invite_codes_code      ON invite_codes (code);
CREATE INDEX idx_invite_codes_created   ON invite_codes (created_by);

-- ── 3. audit_logs ────────────────────────────────────────────
-- Immutable log of every action in the system
CREATE TABLE audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id),
  action      text        NOT NULL,
  -- action values:
  --   'login'          user signed in via magic link
  --   'upload'         CSV uploaded and imported
  --   'invite_create'  admin created an invite code
  --   'invite_use'     user redeemed an invite code
  --   'invite_revoke'  admin deactivated an invite code
  entity_type text,                        -- 'upload_batch' | 'invite_code' | 'user'
  entity_id   text,                        -- UUID of the related record
  metadata    jsonb,                       -- { filename, row_count, table_name, ... }
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_user   ON audit_logs (user_id);
CREATE INDEX idx_audit_action ON audit_logs (action);
CREATE INDEX idx_audit_time   ON audit_logs (created_at DESC);

-- ── 4. Fix upload_batches.uploaded_by ────────────────────────
-- Change from text to uuid FK → auth.users
ALTER TABLE upload_batches
  DROP COLUMN IF EXISTS uploaded_by;

ALTER TABLE upload_batches
  ADD COLUMN uploaded_by uuid REFERENCES auth.users(id);

-- ── 5. Helper function: get current user's role ───────────────
-- Used by RLS policies (future)
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM user_profiles WHERE user_id = auth.uid()
$$;

-- ── 6. Helper function: get current user's company ───────────
CREATE OR REPLACE FUNCTION current_user_company()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company FROM user_profiles WHERE user_id = auth.uid()
$$;
