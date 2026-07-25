-- Remove synthetic on-demand seed sessions so predictions use only live collector data.
DELETE FROM "sessions" WHERE "external_id" LIKE 'seed:%';
