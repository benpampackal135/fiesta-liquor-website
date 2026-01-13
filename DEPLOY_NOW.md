# 🚀 Quick Deployment Guide

## ✅ Frontend Deployed!
**Firebase Hosting:** https://fiesta-liquor-store.web.app
- ✅ All files uploaded (152 files)
- ✅ New version released
- ✅ Barcode scanning feature live
- ✅ Google Sheets import live

## ⚠️ Backend Deployment (Railway)

Railway CLI needs interactive selection. Choose one of these options:

### Option 1: Deploy via Railway Dashboard (Easiest)
1. Go to: https://railway.app/dashboard
2. Select your project: **fiesta-liquor-website**
3. Click on your service
4. Go to **Settings** → **Deploy**
5. Click **"Redeploy"** or push to connected GitHub repo

### Option 2: Deploy via Railway CLI (Interactive)
Run this command in your terminal:
```bash
cd /Users/bensonpampackal/fiesta-liquor-website
railway up
```
Then select your service when prompted.

### Option 3: Deploy via Git Push
If Railway is connected to GitHub:
```bash
git add .
git commit -m "Update: Webhook fix, barcode scanning, Google Sheets import"
git push
```
Railway will auto-deploy on push.

## 📋 What Was Deployed

### Frontend (Firebase) ✅
- ✅ Updated `admin-dashboard.html` with barcode scanner
- ✅ Updated `product-import.html` with Google Sheets import
- ✅ All static files and images

### Backend (Railway) - Needs Deployment
- ✅ Updated `server.js` with webhook fix
- ✅ Improved error handling
- ✅ Health check endpoint added

## 🔍 Verify Deployment

### Frontend
- Visit: https://fiesta-liquor-store.web.app
- Test admin dashboard: https://fiesta-liquor-store.web.app/admin-dashboard.html
- Check barcode scanner is visible

### Backend (After Railway Deployment)
- Test API: `curl https://fiesta-liquor-website-production.up.railway.app/api/products`
- Test webhook health: `curl https://fiesta-liquor-website-production.up.railway.app/webhook/stripe`
- Check Railway logs for webhook activity

## ⚙️ Environment Variables Check

Make sure these are set in Railway:
- ✅ `STRIPE_SECRET_KEY`
- ✅ `STRIPE_WEBHOOK_SECRET` (IMPORTANT for webhook fix!)
- ✅ `SITE_URL`
- ✅ `JWT_SECRET`

## 🧪 Post-Deployment Testing

1. **Test Barcode Scanner:**
   - Login to admin dashboard
   - Click "Add Product"
   - Click "Setup" to configure Google Sheets
   - Test scanning a barcode

2. **Test Webhook:**
   - Make a test payment
   - Check Stripe Dashboard → Webhooks → Recent events
   - Should see successful deliveries (no more errors!)

3. **Test Google Sheets Import:**
   - Go to product import page
   - Paste Google Sheets URL
   - Import products

## 📞 Need Help?

- Check `DEPLOY_CHECKLIST.md` for detailed steps
- Check `STRIPE_WEBHOOK_FIX.md` for webhook troubleshooting
- Check Railway logs: `railway logs`

---

**Status:** Frontend ✅ | Backend ⏳ (Needs Railway deployment)

