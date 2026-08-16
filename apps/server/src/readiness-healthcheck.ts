const readinessUrl = "http://127.0.0.1:3000/readyz";

try {
  const response = await fetch(readinessUrl, {
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
