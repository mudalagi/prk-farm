-- Mark expenses that are inter-member settlements (not farm expenditure).
-- Settlements affect group_balances correctly through expense_splits,
-- but are excluded from "Total Spent" displays.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_settlement BOOLEAN NOT NULL DEFAULT FALSE;
