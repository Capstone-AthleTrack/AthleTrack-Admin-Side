// src/services/offline/index.ts
// Export all offline-enabled service wrappers

// Sports
export {
  listSportsOffline,
  loadSportBundleOffline,
  loadAthleteBundleOffline,
  prefetchSportBundle,
  prefetchAthleteBundle,
} from './sports.offline';

// Profile
export {
  getMyProfileOffline,
  updateMyProfileOffline,
  clearProfileCache,
} from './profile.offline';

// Metrics
export {
  fetchDailyReportsOffline,
  fetchLoginFrequencyOffline,
  logSessionOffline,
  logLoginOffline,
} from './metrics.offline';

// Dashboard
export {
  fetchKPIOffline,
  fetchUsageSeriesOffline,
  fetchLoginSeriesOffline,
  fetchDashboardDataOffline,
  type UsagePoint,
  type LoginPoint,
  type KPIData,
} from './dashboard.offline';

// Admin: User Management
export {
  fetchUsersOffline,
  addUserOffline,
  updateUserOffline,
  deleteUserOffline,
  clearUsersCache,
  type UserProfile,
  type UserProfileInsert,
  type UserProfileUpdate,
  type DBRole,
  type DBStatus,
} from './users.offline';

// Admin: Request Management
export {
  fetchRequestsOffline,
  decideRequestOffline,
  clearRequestsCache,
  type RequestItem,
  type AccountRequest,
  type DecisionPayload,
  type ReqStatus,
  type FinalRole,
} from './requests.offline';

// Prefetch (auto-cache all data for offline use)
export {
  prefetchAllData,
  prefetchAllDataBackground,
  prefetchAllDataWithProgressive,
  prefetchAllDataBackgroundWithProgressive,
  prefetchSportBundles,
  prefetchProgressiveData,
  prefetchUserAvatars,
  trackRecentAthlete,
  trackRecentSport,
} from './prefetch';

