-- 0017 · Low stock alerts: when the alert went out, so each drop is announced once.
-- Cleared when stock goes back above the threshold (src/server/notifications/stock-alerts.ts).
ALTER TABLE inventory ADD COLUMN low_alerted_at timestamptz;
