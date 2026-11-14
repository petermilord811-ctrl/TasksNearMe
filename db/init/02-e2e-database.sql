-- Runs once when the container's data volume is first created.
-- The e2e suite's own database (scripts/e2e-db.mjs prepares it, and creates it when an older volume lacks it),
-- so e2e runs never reseed the dev data people browse on the dev server.
CREATE DATABASE tasksnearme_e2e;
