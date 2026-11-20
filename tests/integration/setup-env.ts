try {
  process.loadEnvFile('.env.local');
} catch {
  // Environment provided by the shell (CI).
}

// Tests never call a model (docs/integration-points.md): without keys, the stand-ins answer.
delete process.env.KIMI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
