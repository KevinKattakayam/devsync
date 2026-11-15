console.error(
  'DevSync CI scan-only image cannot serve traffic. Build the production runner with genuine deployment settings.',
);
process.exitCode = 1;
