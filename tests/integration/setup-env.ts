try {
  process.loadEnvFile('.env.local');
} catch {
  // Environment provided by the shell (CI).
}

// Tests never call a model (docs/integration-points.md): without keys, the stand-ins answer.
for (const key of ['GEMINI_API_KEY', 'KIMI_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[key];
