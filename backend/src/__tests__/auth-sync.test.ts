jest.mock('../security/provider-sessions', () => ({
  providerSessions: { assertActive: jest.fn(async () => undefined) },
}));
jest.mock('../security/authentication', () => ({ requestSubject: jest.fn() }));
jest.mock('../middleware/auth.middleware', () => ({ syncClerkUser: jest.fn() }));
jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));
import express from 'express';
import request from 'supertest';
import { verifyToken } from '@clerk/backend';
import { TokenVerificationError, TokenVerificationErrorReason } from '@clerk/backend/errors';
import { requestSubject } from '../security/authentication';
import { syncClerkUser } from '../middleware/auth.middleware';
import { syncMe } from '../controllers/auth.controller';
import { errorEnvelope, errorMiddleware } from '../middleware/error.middleware';
import { requestContext, createRequestLogging } from '../middleware/request-context.middleware';
const app = express();
app.use(requestContext, createRequestLogging(), errorEnvelope);
app.post('/sync', syncMe);
app.use(errorMiddleware);
beforeEach(() => {
  jest.mocked(requestSubject).mockResolvedValue(null);
  jest.mocked(verifyToken).mockReset();
  jest.mocked(syncClerkUser).mockReset();
});
it.each([
  TokenVerificationErrorReason.TokenExpired,
  TokenVerificationErrorReason.TokenNotActiveYet,
  TokenVerificationErrorReason.TokenIatInTheFuture,
  TokenVerificationErrorReason.TokenInvalidSignature,
  TokenVerificationErrorReason.TokenInvalid,
])('denies %s without sync or SDK error disclosure', async (reason) => {
  jest
    .mocked(verifyToken)
    .mockRejectedValue(new TokenVerificationError({ reason, message: 'PRIVATE_SDK_DETAIL' }));
  const response = await request(app).post('/sync').set('Authorization', 'Bearer fixture-token');
  expect(response.status).toBe(401);
  expect(response.body.code).toBe('UNAUTHENTICATED');
  expect(JSON.stringify(response.body)).not.toContain('PRIVATE_SDK_DETAIL');
  expect(syncClerkUser).not.toHaveBeenCalled();
});
it('fails closed as unavailable for key resolution failures', async () => {
  jest.mocked(verifyToken).mockRejectedValue(
    new TokenVerificationError({
      reason: TokenVerificationErrorReason.RemoteJWKFailedToLoad,
      message: 'PRIVATE_SDK_DETAIL',
    }),
  );
  const response = await request(app).post('/sync').set('Authorization', 'Bearer fixture-token');
  expect(response.status).toBe(503);
  expect(response.body.code).toBe('UNAVAILABLE');
  expect(JSON.stringify(response.body)).not.toContain('PRIVATE_SDK_DETAIL');
  expect(syncClerkUser).not.toHaveBeenCalled();
});
it.each([undefined, 'Basic fixture', 'Bearer', 'Bearer one two'])(
  'rejects malformed authorization %s before verification',
  async (authorization) => {
    let pending = request(app).post('/sync');
    if (authorization) pending = pending.set('Authorization', authorization);
    expect((await pending).status).toBe(401);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(syncClerkUser).not.toHaveBeenCalled();
  },
);
it('preserves verified middleware identity and does not hide profile persistence errors', async () => {
  jest.mocked(requestSubject).mockResolvedValue('user_verified');
  jest.mocked(syncClerkUser).mockRejectedValue(new Error('PRIVATE_DATABASE_DETAIL'));
  const response = await request(app).post('/sync');
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DATABASE_DETAIL');
  expect(syncClerkUser).toHaveBeenCalledWith('user_verified');
  expect(verifyToken).not.toHaveBeenCalled();
});

it('synchronizes only the verified bearer subject on fallback success', async () => {
  const claims = { sub: 'user_verified', sid: 'sess_verified' } as Awaited<
    ReturnType<typeof verifyToken>
  >;
  jest.mocked(verifyToken).mockResolvedValue(claims);
  jest.mocked(syncClerkUser).mockResolvedValue({
    id: 'local',
    clerkId: 'user_verified',
    email: 'fixture@example.test',
    name: null,
    avatar: null,
    isActive: true,
    systemRole: 'USER',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  const response = await request(app).post('/sync').set('Authorization', 'Bearer fixture-token');
  expect(response.status).toBe(200);
  expect(response.body.id).toBe('local');
  expect(syncClerkUser).toHaveBeenCalledWith('user_verified');
});
