# Deploying to Vercel

## Flow: Lovable → GitHub → Vercel

### Prerequisites
- Project synced to GitHub via Lovable Connectors
- Vercel account connected to the same GitHub repo

---

### Step 1: Install nitro (in your local clone)

```bash
npm install nitro
```

### Step 2: Replace config files

In your **local GitHub clone** (NOT in Lovable), apply these changes:

1. **Replace `vite.config.ts`** with the contents of `vercel-deploy/vite.config.ts`
2. **Replace `vercel.json`** with the contents of `vercel-deploy/vercel.json`
3. **Delete `wrangler.jsonc`** (Cloudflare-specific, not needed for Vercel)

### Step 3: Set environment variables in Vercel

In your Vercel project settings → Environment Variables, add:

| Variable | Value | Where to find |
|----------|-------|---------------|
| `VITE_SUPABASE_URL` | `https://ifzyyehyybvynjctrvlo.supabase.co` | `.env` file |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | *(your anon key)* | `.env` file |
| `VITE_SUPABASE_PROJECT_ID` | `ifzyyehyybvynjctrvlo` | `.env` file |
| `SUPABASE_URL` | `https://ifzyyehyybvynjctrvlo.supabase.co` | `.env` file |
| `SUPABASE_PUBLISHABLE_KEY` | *(your anon key)* | `.env` file |
| `SUPABASE_SERVICE_ROLE_KEY` | *(your service role key)* | Lovable Cloud secrets |

### Step 4: Configure Vercel project settings

- **Build Command**: `npm run build`
- **Output Directory**: `.vercel/output` (auto-detected)
- **Node.js Version**: 22
- **Framework Preset**: Other

### Step 5: Deploy

Push to GitHub → Vercel auto-deploys.

### Step 6: Update OAuth redirect URLs

If using Google sign-in, add your new Vercel domain to the allowed redirect URLs in your auth provider settings.

---

### Important Notes

- **Do NOT apply these changes inside Lovable** — they will break the sandbox preview
- Your **backend** (database, edge functions, auth) stays on Lovable Cloud regardless
- The `vercel-deploy/` folder is just a reference — delete it after applying changes
