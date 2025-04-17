// Configuration constants for the server

// Re-export API_TIMEOUT_MS from utils/timeout
export {API_TIMEOUT_MS} from '../utils/timeout';

// Server-specific configuration
export const HEARTBEAT_INTERVAL_MS = 10000; // 10 second heartbeat interval
export const SHUTDOWN_GRACE_PERIOD_MS = 5000; // 5 second grace period for shutdown
export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_DELAY_MS = 2000;
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL
export const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes cache cleanup interval