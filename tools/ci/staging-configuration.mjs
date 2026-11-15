// A local precondition check; it does not establish provider ownership or release identity.
export function validateStagingConfiguration(env) {
  const pairs = [
    ['STAGING_RAILWAY_PROJECT_ID', 'PRODUCTION_RAILWAY_PROJECT_ID'],
    ['STAGING_RAILWAY_ENVIRONMENT_ID', 'PRODUCTION_RAILWAY_ENVIRONMENT_ID'],
    ['STAGING_RAILWAY_API_SERVICE_ID', 'PRODUCTION_RAILWAY_API_SERVICE_ID'],
    ['STAGING_RAILWAY_WORKER_SERVICE_ID', 'PRODUCTION_RAILWAY_WORKER_SERVICE_ID'],
    ['STAGING_VERCEL_PROJECT_ID', 'PRODUCTION_VERCEL_PROJECT_ID'],
  ];
  const fail = () => {
    throw new Error('Invalid staging configuration');
  };
  if (!/^[a-f0-9]{40}$/.test(env.REVIEWED_SHA || '')) fail();
  for (const [stage, production] of pairs) {
    if (
      !/^[A-Za-z0-9_-]{1,191}$/.test(env[stage] || '') ||
      !/^[A-Za-z0-9_-]{1,191}$/.test(env[production] || '') ||
      env[stage] === env[production]
    )
      fail();
  }
  const stageServices = [env.STAGING_RAILWAY_API_SERVICE_ID, env.STAGING_RAILWAY_WORKER_SERVICE_ID];
  const productionServices = [
    env.PRODUCTION_RAILWAY_API_SERVICE_ID,
    env.PRODUCTION_RAILWAY_WORKER_SERVICE_ID,
  ];
  if (
    stageServices[0] === stageServices[1] ||
    stageServices.some((value) => productionServices.includes(value))
  )
    fail();
  for (const name of ['STAGING_RAILWAY_TOKEN', 'STAGING_VERCEL_TOKEN']) {
    if (typeof env[name] !== 'string' || !env[name].trim()) fail();
  }
  for (const name of ['STAGING_API_ORIGIN', 'STAGING_FRONTEND_ORIGIN']) {
    let url;
    try {
      url = new URL(env[name] || '');
    } catch {
      fail();
    }
    if (
      !url ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      fail();
  }
}
