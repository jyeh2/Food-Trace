-- org_snapshot is already part of 0001_init.sql. Older databases also receive it from the
-- application's guarded startup migration, so this historical migration only needs to advance
-- Wrangler's migration ledger without attempting to add the column a second time.
SELECT 1;
