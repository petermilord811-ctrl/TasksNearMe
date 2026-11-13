try {
  process.loadEnvFile('.env.local');
} catch {
  // Environment provided by the shell (CI).
}

// Tests never call Claude (docs/integration-points.md): without a key, the stand-ins answer.
delete process.env.ANTHROPIC_API_KEY;
