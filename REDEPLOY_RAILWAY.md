# 🚂 Redeploy Railway - Quick Guide

## Option 1: Git Push (Auto-Deploy) ⚡ RECOMMENDED

If Railway is connected to your GitHub repo, just push your changes:

```bash
cd /Users/bensonpampackal/fiesta-liquor-website

# Stage all changes
git add .

# Commit
git commit -m "Redeploy: Stripe webhook fix and barcode scanning updates"

# Push to trigger Railway auto-deploy
git push origin main
```

Railway will automatically detect the push and redeploy! ✅

---

## Option 2: Railway Dashboard (Manual) 🖥️

1. **Go to Railway Dashboard:**
   - https://railway.app/dashboard

2. **Select Your Project:**
   - Click on **"fiesta-liquor-website"**

3. **Select Your Service:**
   - Click on your backend service (usually named something like "fiesta-liquor-website" or "api")

4. **Redeploy:**
   - Click the **"Deployments"** tab
   - Click **"Redeploy"** button on the latest deployment
   - OR click **"Settings"** → **"Deploy"** → **"Redeploy"**

5. **Wait for Deployment:**
   - Watch the logs to see deployment progress
   - Should take 1-2 minutes

---

## Option 3: Railway CLI (Interactive) 💻

Run this in your terminal (you'll need to select options):

```bash
cd /Users/bensonpampackal/fiesta-liquor-website

# This will prompt you to select service
railway up
```

When prompted:
1. Select your workspace
2. Select your project: **fiesta-liquor-website**
3. Select your service
4. Deployment will start

---

## What's Being Deployed

✅ **server.js** - Stripe webhook fix
- Always returns HTTP 200
- Better error handling
- Health check endpoint

✅ **All other files** - Latest updates

---

## Verify Deployment

After deployment, check:

1. **Railway Logs:**
   ```bash
   railway logs
   ```
   Should see: "Server running on port..."

2. **Test API:**
   ```bash
   curl https://fiesta-liquor-website-production.up.railway.app/api/products
   ```

3. **Test Webhook Health:**
   ```bash
   curl https://fiesta-liquor-website-production.up.railway.app/webhook/stripe
   ```
   Should return: `{"status":"ok","message":"Stripe webhook endpoint is active"}`

4. **Check Stripe Dashboard:**
   - Go to: https://dashboard.stripe.com/webhooks
   - Recent events should show successful deliveries
   - No more error emails!

---

## Quick Command Reference

```bash
# Check Railway status
railway status

# View logs
railway logs

# Deploy (interactive)
railway up

# Git push (if auto-deploy enabled)
git add . && git commit -m "Redeploy" && git push
```

---

**Recommended:** Use **Option 1 (Git Push)** if Railway is connected to GitHub - it's the fastest and most reliable! 🚀

