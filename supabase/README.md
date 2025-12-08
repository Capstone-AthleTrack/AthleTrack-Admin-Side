# Supabase Database Migrations

## Sync Account Requests with Profiles

### Problem
Users who sign up on the mobile app with valid sport/team combinations are **auto-approved** in the `profiles` table (`status='active'`, `is_active=true`), but the admin panel reads from the `account_requests` table which may still show these users as `pending`.

### Solution
A PostgreSQL trigger automatically syncs `account_requests.status` when `profiles.status` changes.

### How to Apply

1. **Go to Supabase Dashboard** → SQL Editor
2. **Copy and paste** the contents of `migrations/20241205_sync_account_requests_trigger.sql`
3. **Run the query**

### What the Migration Does

| Component | Purpose |
|-----------|---------|
| `sync_account_request_status()` | Function that updates `account_requests` when profiles become active |
| `trg_sync_account_request_status` | Trigger on UPDATE of `profiles.status` or `is_active` |
| `trg_sync_account_request_status_insert` | Trigger on INSERT of new active profiles |
| One-time UPDATE | Fixes any existing mismatched records |

### Verification

After running the migration, execute this query to check for mismatches:

```sql
SELECT ar.id, ar.user_id, ar.status as request_status, 
       p.status as profile_status, p.is_active
FROM account_requests ar
JOIN profiles p ON ar.user_id = p.id
WHERE ar.status = 'pending' 
  AND (p.status = 'active' OR p.is_active = true);
```

**Expected result:** 0 rows (no mismatches)

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BEFORE (Problem)                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Mobile App → profiles.status = 'active'                            │
│  Admin Panel reads account_requests.status = 'pending' ❌            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    AFTER (Solution)                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Mobile App → profiles.status = 'active'                            │
│            ↓ (trigger fires automatically)                          │
│  Trigger → account_requests.status = 'approved' ✅                  │
│  Admin Panel reads account_requests.status = 'approved' ✅          │
└─────────────────────────────────────────────────────────────────────┘
```




