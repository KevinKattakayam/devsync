module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/__tests__/**'],
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 40, branches: 21, functions: 30, lines: 42 },
    './src/services/collaboration-server.ts': {
      statements: 70,
      branches: 60,
      functions: 80,
      lines: 80,
    },
    './src/services/crdt-journal.ts': { statements: 85, branches: 60, functions: 100, lines: 90 },
    './src/services/crdt-migration.ts': { statements: 85, branches: 70, functions: 100, lines: 95 },
  },
};
