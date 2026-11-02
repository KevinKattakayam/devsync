/** Process liveness only; authentication and backend readiness are separate checks. */
export function GET() {
  return Response.json({ status: 'ok' });
}
