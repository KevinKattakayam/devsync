try {
  const path = process.env.DEPLOYMENT_MODE === 'local' ? '/api/health' : '/api/ready';
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || '5000'}${path}`, {
    signal: AbortSignal.timeout(2500),
  });
  process.exitCode = response.ok ? 0 : 1;
} catch {
  process.exitCode = 1;
}
