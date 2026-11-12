export type LoadFailureStage =
  | 'fixture_configuration'
  | 'k6_runtime'
  | 'postgres_start'
  | 'redis_start'
  | 'migration'
  | 'seed'
  | 'runtime_role'
  | 'fixture_validation'
  | 'fixture_server_start'
  | 'fixture_server_readiness'
  | 'fixture_preflight'
  | 'owner_authentication'
  | 'k6_launch'
  | 'cleanup'
  | 'fixture_setup'
  | 'cancelled';

/** Safe to report: it contains a fixed stage code and never stores an underlying exception. */
export class FixtureSetupError extends Error {
  constructor(
    readonly stage: LoadFailureStage,
    readonly cleanupFailed = false,
  ) {
    super('Isolated fixture setup failed');
    this.name = 'FixtureSetupError';
  }
}
