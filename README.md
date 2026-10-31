# DevSync — Collaborative Developer Workspace

DevSync is a high-performance, real-time collaborative workspace designed specifically for development teams. It brings together documents, task management, code snippets, and AI assistance into a single, unified platform.

![DevSync Dashboard Preview](https://res.cloudinary.com/dzvxsfvxr/image/upload/v1713890000/devsync_preview.png)

## 🚀 Features

- **Real-time Documents**: A powerful rich-text editor (TipTap) with slash commands, real-time collaboration via WebSockets, and nested document structures.
- **Kanban Boards**: Integrated task management with drag-and-drop functionality, priority levels, due dates, and member assignments.
- **Snippet Library**: A centralized place to store and share code snippets with syntax highlighting for over 50 languages.
- **AI-Powered Writing**: Inline AI assistant powered by Groq (Llama 3) to generate, improve, or summarize content on the fly.
- **Workspace Management**: Create multiple workspaces, invite team members, and manage roles (Owner, Editor, Viewer).
- **Live Presence**: See who is online in your workspace with live avatar indicators.
- **Premium UI**: A clean, professional, and fast interface built with Next.js 16 and Tailwind CSS v4.

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, TipTap.
- **Backend**: Node.js, Express, Socket.io.
- **Database**: PostgreSQL with Prisma ORM.
- **Authentication**: Clerk sessions (custom-cookie migration requested for Phase 1a is not yet implemented).
- **AI Integration**: Groq Cloud API.
- **State Management**: React Context API, Axios, Zustand and local Yjs state.

## 📦 Getting Started

### Prerequisites

- Node.js 22+
- Docker (for PostgreSQL)
- Groq API Key

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/devsync.git
   cd devsync
   ```

2. **Setup the Database**:
   ```bash
   cd backend
   docker run -d --name devsync-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=devsync -p 5432:5432 postgres:16-alpine
   ```

3. **Backend Setup**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Update .env with your GROQ_API_KEY
   npm run db:migrate
   npm run dev
   ```

4. **Frontend Setup**:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

The application will be available at `http://localhost:3000`.

## 📂 Project Structure

- `/frontend`: Next.js application, UI components, and state management.
- `/backend`: Express API server, WebSocket handlers, and Prisma models.

## 📄 License

This project is licensed under the MIT License.

Database baseline/adoption and seed instructions: [backend/prisma/README.md](backend/prisma/README.md). Never run baseline DDL against an existing database. Phase 1a progress and remaining security work: [docs/PROGRESS.md](docs/PROGRESS.md).
