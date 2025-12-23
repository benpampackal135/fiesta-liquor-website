# 🌐 Custom Domain Setup Guide

This guide will help you set up a custom domain (like `fiestaliquor.com`) for your Firebase-hosted website.

## 📋 Prerequisites

1. **Purchase a domain** from a registrar (e.g., Google Domains, Namecheap, GoDaddy, etc.)
2. **Access to Firebase Console** - https://console.firebase.google.com
3. **Access to your domain registrar's DNS settings**

## 🚀 Step-by-Step Setup

### Step 1: Add Custom Domain in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **fiesta-liquor-store**
3. Click **Hosting** in the left sidebar
4. Click **Add custom domain**
5. Enter your domain (e.g., `fiestaliquor.com` or `www.fiestaliquor.com`)
6. Firebase will provide you with DNS records to add

### Step 2: Configure DNS Records

You'll need to add these DNS records at your domain registrar:

#### Option A: A Records (Recommended)
```
Type: A
Name: @ (or leave blank for root domain)
Value: [IP addresses provided by Firebase - usually 4 addresses]
TTL: 3600
```

#### Option B: CNAME Record (For subdomain like www)
```
Type: CNAME
Name: www
Value: [CNAME value provided by Firebase]
TTL: 3600
```

**Note:** Firebase will show you the exact values to use. Copy them exactly.

### Step 3: Wait for DNS Propagation

- DNS changes can take **15 minutes to 48 hours** to propagate
- Firebase will automatically verify your domain
- You'll see a green checkmark when it's ready

### Step 4: Update Your Code

Once your custom domain is verified and active, you'll need to update:

1. **Firebase Configuration** (`public/firebase.js`)
   - Update `authDomain` to your custom domain

2. **Railway Environment Variables**
   - Update `SITE_URL` to your new custom domain

3. **Documentation** (optional)
   - Update `DEPLOYMENT_INFO.md` with new URL

## ⚙️ After Domain is Active

Once Firebase shows your domain as "Connected", run these commands:

```bash
# Update the code files (see below)
# Then redeploy
firebase deploy --only hosting
```

## 🔄 What Gets Updated

When your custom domain is ready, you'll need to update:

1. ✅ `public/firebase.js` - Change `authDomain`
2. ✅ Railway `SITE_URL` environment variable
3. ✅ `DEPLOYMENT_INFO.md` - Update documentation

## 📝 Example

**Before:**
- URL: `https://fiesta-liquor-store.web.app`
- authDomain: `fiesta-liquor-store.firebaseapp.com`

**After (with custom domain `fiestaliquor.com`):**
- URL: `https://fiestaliquor.com`
- authDomain: `fiestaliquor.com`

## ⚠️ Important Notes

1. **SSL Certificate**: Firebase automatically provides SSL certificates for custom domains (free!)
2. **Both domains work**: Your old `.web.app` domain will continue to work and redirect to your custom domain
3. **authDomain**: Must match your custom domain exactly for Firebase Auth to work properly
4. **Railway SITE_URL**: Update this so Stripe redirects work correctly

## 🆘 Troubleshooting

**Domain not verifying?**
- Double-check DNS records are correct
- Wait longer (can take up to 48 hours)
- Use a DNS checker tool to verify propagation

**Auth not working?**
- Make sure `authDomain` in `firebase.js` matches your custom domain
- Check Firebase Console → Authentication → Settings → Authorized domains

**Stripe redirects broken?**
- Update `SITE_URL` in Railway environment variables
- Redeploy backend: `railway up --detach`

## 📞 Need Help?

If you get stuck:
1. Check Firebase Console for error messages
2. Verify DNS records are correct
3. Wait for DNS propagation to complete
4. Contact your domain registrar if DNS issues persist

