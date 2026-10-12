# Auto Download Hub

A serverless download hub built for Vercel. Submit a download job via the API, process it in the background, and retrieve the result — all powered by Vercel serverless functions, Upstash Redis (rate limiting + job state), and Vercel Blob storage.

## Features

- Single-page frontend (`frontend/index.html`)
- Serverless API routes (`api/`)
- Background job processing with status tracking
- Rate limiting via Upstash Redis
- File storage via Vercel Blob
- One-click deploy to Vercel

## Tech Stack

- **Runtime:** Node.js (Vercel Serverless Functions)
- **Storage:** Vercel Blob
- **Cache / Rate Limiting:** Upstash Redis
- **Hosting:** Vercel

## Project Structure

```
.
├── api/
│   ├── health.js            # Health check endpoint
│   ├── downloads/
│   │   ├── index.js         # Create / list download jobs
│   │   ├── [id].js          # Get job status / result
│   │   └── process.js       # Background job processor
│   └── health/
├── frontend/
│   └── index.html           # Single-page frontend
├── .env.example             # Environment variable template
├── vercel.json              # Vercel build & route config
└── package.json
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [Vercel](https://vercel.com/) account
- An [Upstash](https://upstash.com/) Redis database

### Local Development

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/auto-download-hub.git
   cd auto-download-hub
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

   Fill in your Upstash Redis credentials.

4. Run the dev server:

   ```bash
   npm run dev
   ```

### Deployment

1. Push your code to GitHub.
2. Import the repo on [Vercel](https://vercel.com/new).
3. Add the environment variables in the Vercel dashboard.
4. Deploy — Vercel will pick up `vercel.json` automatically.

Or deploy from the CLI:

```bash
npm run deploy
```

## Environment Variables

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/downloads` | Create a new download job |
| `GET` | `/api/downloads` | List all download jobs |
| `GET` | `/api/downloads/[id]` | Get a specific job's status/result |

## License

MIT
