# Nexus Gaming Site

Vercel + Turso deployment. Login-based, admin panel, virtual-coin stake games.

## 1. Turso setup

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create gaming-site
turso db show gaming-site --url
turso db tokens create gaming-site
```

Copy the `libsql://…` URL and the token.

## 2. Local setup

```bash
git clone <your-repo> gaming-site
cd gaming-site
cp .env.example .env.local
# paste TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET
npm install
npm i -g vercel
vercel dev
```

Open http://localhost:3000/register.html

**First registered user becomes admin automatically.**

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 4. Deploy to Vercel

```bash
vercel link
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN
vercel env add JWT_SECRET
vercel --prod
```

Or import the repo in the Vercel dashboard → Settings → Environment Variables → paste all three.

## 5. After deploy

- Register first user → becomes admin
- Admin panel: `/admin.html` — balance adjust, promote, commission %, stake limits
- WebSocket at `/api/ws` — reconnects with exponential backoff

## Note

Coins are virtual only. No deposit/payout rail is wired in.
