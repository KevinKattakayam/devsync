import { defineRailway, project, preserve, service } from 'railway/iac';

// Manage only the two application services; existing databases/resources are outside this partial.
export const partial = 'devsync-runtime';
export default defineRailway((context) => {
  const projectName = context.projectName;
  if (!projectName) throw new Error('Link the existing Railway project before planning');
  const build = { builder: 'DOCKERFILE' as const, dockerfilePath: 'Dockerfile' };
  const deploy = {
    sleepApplication: false,
    restartPolicyType: 'ON_FAILURE' as const,
    restartPolicyMaxRetries: 5,
    drainingSeconds: 30,
  };
  const env = {
    NODE_ENV: 'production',
    DEPLOYMENT_MODE: 'production',
    DATABASE_URL: preserve(),
    REDIS_URL: preserve(),
    FRONTEND_URL: preserve(),
    CLERK_SECRET_KEY: preserve(),
    CLERK_PUBLISHABLE_KEY: preserve(),
    ENCRYPTION_KEY: preserve(),
    GROQ_API_KEY: preserve(),
    OPENAI_API_KEY: preserve(),
  };
  const backend = service(process.env.RAILWAY_API_SERVICE_NAME || 'backend', {
    rootDirectory: 'backend',
    build,
    deploy,
    start: 'node docker/entrypoint.mjs node dist/server.js',
    preDeploy: 'node node_modules/prisma/build/index.js migrate status',
    healthcheck: '/api/ready',
    healthcheckTimeout: 120,
    replicas: 1,
    env: { ...env, PROCESS_ROLE: 'api' },
  });
  const worker = service(process.env.RAILWAY_WORKER_SERVICE_NAME || 'worker', {
    rootDirectory: 'backend',
    build,
    deploy,
    start: 'node docker/entrypoint.mjs node dist/worker.js',
    replicas: 1,
    env: { ...env, PROCESS_ROLE: 'worker' },
  });
  // Source/root-directory and other existing settings are imported/reviewed in the actual account.
  return project(projectName, { resources: [backend, worker] });
});
