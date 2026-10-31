# Deployment

## Recommended setup

- Frontend: Vercel or Render
- Backend: Render
- Database: Neon, Supabase, or Render Postgres

## Free deployment setup

For a zero-cost setup, use:

- Frontend: Vercel free plan
- Backend: Oracle Cloud Always Free VM, or another free VM that supports long-lived connections
- Database: Neon free plan

This works better than trying to host the backend on a platform that sleeps or blocks WebSockets.

This app is split into two services:

- [frontend](frontend) — Next.js app
- [backend](backend) — Express API and Socket.io server

## Required environment variables

### Backend

Set these in the backend hosting service:

- `DATABASE_URL`
- `FRONTEND_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `GROQ_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### Frontend

Set these in the frontend hosting service:

- `NEXT_PUBLIC_API_URL` — backend API base URL, for example `https://api.example.com/api`
- `NEXT_PUBLIC_SOCKET_URL` — backend Socket.io URL, for example `https://api.example.com`
- `BACKEND_URL` — backend origin used by the Next.js rewrite, for example `https://api.example.com`

## Deploy backend

1. Create a Postgres database.
2. Create a backend host.
   - Best free option: Oracle Cloud Always Free VM
3. Deploy the [backend](backend) folder.
4. Use these commands:
   - Build: `npm install && npm run build`
   - Start: `npm start`
5. Add the backend environment variables listed above.
6. Run Prisma against the deployed database:
   - Use `npm run db:migrate` (`prisma migrate deploy`).
   - Existing databases require the verified baseline/backfill procedure in [backend/prisma/README.md](backend/prisma/README.md); do not use db push.

### Backend Docker deployment

If you use a free VM, you can deploy with Docker:

- Build: `docker build -t devsync-backend ./backend`
- Run: `docker run -d -p 5000:5000 --env-file ./backend/.env devsync-backend`

Make sure the VM security rules allow inbound traffic on port 5000, or place a reverse proxy in front of it.

## Deploy frontend

1. Create a project on Vercel from the [frontend](frontend) folder.
2. Use these commands:
   - Build: `npm install && npm run build`
   - Start: `npm start`
3. Add the frontend environment variables listed above.
4. Set `FRONTEND_URL` on the backend to the final frontend domain.

## Cheapest practical alternative

If you do not want to manage a VM, use the cheapest managed free tiers available in your region, but confirm they support:

- persistent Node.js processes
- Socket.io/WebSocket traffic
- environment variables
- PostgreSQL access

If any of those are missing, the app will not work correctly.

## Notes

- The backend uses Socket.io, so deploy it to a platform that supports long-lived connections.
- After deployment, verify these endpoints:
  - `https://your-backend/api/health`
  - frontend sign-in and workspace loading
