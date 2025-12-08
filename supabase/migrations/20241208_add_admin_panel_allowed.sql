-- Migration: Add is_admin_panel_allowed column to profiles
-- This enables the "Admin Coach" role - coaches who can access the admin panel

-- Step 1: Add the new column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_admin_panel_allowed BOOLEAN DEFAULT false;

-- Step 2: Set existing admins to have admin panel access by default
UPDATE profiles 
SET is_admin_panel_allowed = true 
WHERE role = 'admin';

-- Step 3: Add a comment for documentation
COMMENT ON COLUMN profiles.is_admin_panel_allowed IS 
  'When true, allows non-admin users (e.g., coaches) to access the admin web panel. Admins always have access regardless of this flag.';

-- Step 4: Create an index for efficient querying
CREATE INDEX IF NOT EXISTS idx_profiles_admin_panel_allowed 
ON profiles(is_admin_panel_allowed) 
WHERE is_admin_panel_allowed = true;

-- Optional: Create a view for easy querying of admin panel users
CREATE OR REPLACE VIEW v_admin_panel_users AS
SELECT 
  id,
  email,
  full_name,
  role,
  status,
  is_admin_panel_allowed,
  CASE 
    WHEN role = 'admin' THEN 'Full Admin'
    WHEN role = 'coach' AND is_admin_panel_allowed = true THEN 'Admin Coach'
    ELSE 'No Admin Access'
  END AS admin_type
FROM profiles
WHERE role = 'admin' OR is_admin_panel_allowed = true;

