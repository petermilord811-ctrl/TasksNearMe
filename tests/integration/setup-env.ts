try {
  process.loadEnvFile('.env.local');
} catch {
  // Environment provided by the shell (CI).
}
