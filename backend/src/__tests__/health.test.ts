import request from 'supertest';
import app from '../app';

describe('operational endpoints', () => {
  it('returns liveness without external services', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
