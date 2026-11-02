import { validateEnvironment } from '../config-environment';
const production = {
  NODE_ENV: 'production',
  DEPLOYMENT_MODE: 'production',
  DATABASE_URL: 'postgresql://runtime:synthetic@db/devsync',
  REDIS_URL: 'redis://cache:6379',
  FRONTEND_URL: 'https://app.example.invalid',
  ENCRYPTION_KEY: 'a'.repeat(64),
  CLERK_SECRET_KEY: 'sk_test_synthetic',
  CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic',
};
it('accepts explicit production settings and rejects unconfigured/unsafe settings without values', () => {
  expect(() => validateEnvironment(production)).not.toThrow();
  for (const [key, value] of [
    ['DATABASE_URL', 'postgresql://postgres:private-value@db/devsync'],
    ['REDIS_URL', 'http://private-value'],
    ['FRONTEND_URL', 'http://private-value'],
    ['ENCRYPTION_KEY', 'private-value'],
    ['CLERK_SECRET_KEY', ''],
  ]) {
    expect(() => validateEnvironment({ ...production, [key]: value })).toThrow();
    try {
      validateEnvironment({ ...production, [key]: value });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('private-value');
    }
  }
});
it('allows only explicit local mode to omit identity configuration in a production container', () => {
  const local = {
    ...production,
    DEPLOYMENT_MODE: 'local',
    FRONTEND_URL: 'http://localhost:3000',
    CLERK_SECRET_KEY: '',
    CLERK_PUBLISHABLE_KEY: '',
  };
  expect(() => validateEnvironment(local)).not.toThrow();
  expect(() => validateEnvironment({ ...local, DEPLOYMENT_MODE: 'production' })).toThrow();
  expect(() => validateEnvironment({ ...production, DEPLOYMENT_MODE: 'typo' })).toThrow();
});
it('rejects missing service URLs and non-origin frontend destinations', () => {
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'FRONTEND_URL']) {
    expect(() => validateEnvironment({ ...production, [key]: '' })).toThrow(key);
  }
  for (const path of ['/private', '/?token=private', '/#private'])
    expect(() =>
      validateEnvironment({ ...production, FRONTEND_URL: 'https://app.example.invalid' + path }),
    ).toThrow('FRONTEND_URL');
});
