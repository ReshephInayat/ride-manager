# Deploying to Cloudflare Pages

## Flow: Lovable → GitHub → Cloudflare Pages

### Step 1: Connect GitHub repo to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select your GitHub repo

### Step 2: Configure build settings

| Setting | Value |
|---------|-------|
| **Framework preset** | None |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Node.js version** | 22 (set via Environment Variable: `NODE_VERSION` = `22`) |

### Step 3: Set environment variables

In Cloudflare Pages → **Settings → Environment variables**, add:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://ifzyyehyybvynjctrvlo.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | *(your anon key from .env)* |
| `VITE_SUPABASE_PROJECT_ID` | `ifzyyehyybvynjctrvlo` |
| `NODE_VERSION` | `22` |

### Step 4: Deploy

Push to GitHub → Cloudflare Pages auto-builds and deploys.

### Step 5: Custom domain (optional)

In Cloudflare Pages → **Custom domains** → Add your domain.

### Important Notes

- The project already uses Cloudflare Workers runtime via `wrangler.jsonc` — no config swap needed
- Your **backend** (database, edge functions, auth) stays on Lovable Cloud
- If using Google sign-in, add your Cloudflare Pages domain to allowed redirect URLs in auth settings
- The `vercel-deploy/` folder can be deleted — it's no longer needed
