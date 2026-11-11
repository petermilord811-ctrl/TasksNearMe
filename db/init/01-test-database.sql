-- Runs once when the container's data volume is first created.
-- A separate database for integration tests (TEST_DATABASE_URL), so tests never touch dev data.
CREATE DATABASE tasksnearme_test;
