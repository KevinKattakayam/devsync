/** Configuration errors contain field names only, never configured values. */
export class ConfigurationError extends Error {
  constructor(fields: string[]) {
    super(`Invalid or missing deployment settings: ${fields.join(', ')}`);
    this.name = 'ConfigurationError';
  }
}
export function validateEnvironment(env: NodeJS.ProcessEnv) {
  const invalid: string[] = [];
  const local =
    env.DEPLOYMENT_MODE === 'local' ||
    (env.DEPLOYMENT_MODE === undefined && env.NODE_ENV !== 'production');
  const url = (name: string, protocols: string[]) => {
    try {
      const value = new URL(env[name] || '');
      if (!protocols.includes(value.protocol)) invalid.push(name);
      return value;
    } catch {
      invalid.push(name);
      return undefined;
    }
  };
  const database = url('DATABASE_URL', ['postgres:', 'postgresql:']);
  url('REDIS_URL', ['redis:', 'rediss:']);
  const frontend = url('FRONTEND_URL', local ? ['http:', 'https:'] : ['https:']);
  if (
    frontend &&
    (frontend.pathname !== '/' ||
      frontend.search ||
      frontend.hash ||
      frontend.username ||
      frontend.password)
  )
    invalid.push('FRONTEND_URL');
  if (!/^[a-f0-9]{64}$/i.test(env.ENCRYPTION_KEY || '')) invalid.push('ENCRYPTION_KEY');
  if (
    !local &&
    (!env.CLERK_SECRET_KEY?.startsWith('sk_') || !env.CLERK_PUBLISHABLE_KEY?.startsWith('pk_'))
  )
    invalid.push('CLERK_SECRET_KEY/CLERK_PUBLISHABLE_KEY');
  if (!local && ['postgres', 'root', 'admin'].includes(database?.username || ''))
    invalid.push('DATABASE_URL runtime role');
  if (env.DEPLOYMENT_MODE && !['local', 'production'].includes(env.DEPLOYMENT_MODE))
    invalid.push('DEPLOYMENT_MODE');
  if (invalid.length) throw new ConfigurationError([...new Set(invalid)]);
}
