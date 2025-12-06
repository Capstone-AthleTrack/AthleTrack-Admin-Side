-- ============================================================================
-- Migration: Sync account_requests.status with profiles.status
-- ============================================================================
-- Problem: Mobile app auto-approves users (sets profiles.status = 'active'),
-- but admin panel reads from account_requests which may still show 'pending'.
-- Solution: Database trigger to automatically sync the two tables.
-- ============================================================================

-- 1. Create the trigger function
-- This function updates account_requests when profiles.status or is_active changes
CREATE OR REPLACE FUNCTION sync_account_request_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When profile status becomes 'active' or is_active becomes true,
  -- update corresponding account_request to 'approved'
  IF (NEW.status = 'active' OR NEW.is_active = true) THEN
    UPDATE account_requests
    SET status = 'approved',
        updated_at = NOW()
    WHERE user_id = NEW.id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create trigger for UPDATE operations on profiles
-- Fires when status or is_active columns are updated
DROP TRIGGER IF EXISTS trg_sync_account_request_status ON profiles;
CREATE TRIGGER trg_sync_account_request_status
  AFTER UPDATE OF status, is_active ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_account_request_status();

-- 3. Create trigger for INSERT operations on profiles
-- Fires when new profiles are created with active status (auto-approved signups)
DROP TRIGGER IF EXISTS trg_sync_account_request_status_insert ON profiles;
CREATE TRIGGER trg_sync_account_request_status_insert
  AFTER INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.status = 'active' OR NEW.is_active = true)
  EXECUTE FUNCTION sync_account_request_status();

-- 4. One-time fix: Sync any existing mismatched records
-- This updates account_requests for profiles that are already active
UPDATE account_requests ar
SET status = 'approved',
    updated_at = NOW()
FROM profiles p
WHERE ar.user_id = p.id
  AND ar.status = 'pending'
  AND (p.status = 'active' OR p.is_active = true);

-- ============================================================================
-- Verification queries (run these to check the migration worked):
-- ============================================================================
-- 
-- Check for any remaining mismatches:
-- SELECT ar.id, ar.user_id, ar.status as request_status, p.status as profile_status, p.is_active
-- FROM account_requests ar
-- JOIN profiles p ON ar.user_id = p.id
-- WHERE ar.status = 'pending' AND (p.status = 'active' OR p.is_active = true);
--
-- Should return 0 rows if sync is working correctly.
-- ============================================================================



