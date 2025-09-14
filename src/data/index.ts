import * as auth from './auth.repository';
import * as staff from './staff.repository';

/**
 * The ONLY thing pages/components should import.
 * This keeps Supabase and table details hidden behind repositories.
 */
export const api = { auth, staff };
export type Api = typeof api;
