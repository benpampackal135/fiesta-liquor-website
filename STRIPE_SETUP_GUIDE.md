# 💳 Stripe Payment Setup Guide

This guide will help you set up Stripe for live payments on your Fiesta Liquor website.

## 📋 Prerequisites

- Stripe account (live mode enabled)
- Railway account with your backend deployed
- Access to Railway environment variables

## 🔑 Step 1: Get Your Stripe API Keys

1. **Log in to Stripe Dashboard**
   - Go to https://dashboard.stripe.com
   - Make sure you're in **Live mode** (toggle in top right)

2. **Get Your Secret Key**
   - Go to: **Developers** → **API keys**
   - Copy your **Secret key** (starts with `sk_live_...`)
   - ⚠️ **Keep this secret!** Never share it publicly.

3. **Get Your Publishable Key** (optional, for frontend)
   - Copy your **Publishable key** (starts with `pk_live_...`)
   - This is safe to use in frontend code

## 🌐 Step 2: Add Environment Variables to Railway

1. **Go to Railway Dashboard**
   - Navigate to your project: https://railway.app
   - Click on your **fiesta-liquor-website** service

2. **Add Environment Variables**
   - Go to the **Variables** tab
   - Click **+ New Variable**

3. **Add These Variables:**

   ```
   STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY_HERE
   SITE_URL=https://fiesta-liquor-store.web.app
   STRIPE_WEBHOOK_SECRET=we_xxx (you'll get this in Step 3)
   ```

   **Important:**
   - Replace `sk_live_YOUR_SECRET_KEY_HERE` with your actual Stripe secret key
   - `SITE_URL` should point to your Firebase Hosting domain
   - `STRIPE_WEBHOOK_SECRET` - leave empty for now, we'll add it in Step 3

4. **Save and Redeploy**
   - After adding variables, Railway will automatically redeploy
   - Or manually trigger a redeploy if needed

## 🔔 Step 3: Set Up Stripe Webhook

The webhook allows Stripe to notify your server when payments are completed.

### 3.1 Get Your Webhook Endpoint URL

Your webhook endpoint is:
```
https://fiesta-liquor-website-production.up.railway.app/webhook/stripe
```

### 3.2 Configure Webhook in Stripe Dashboard

1. **Go to Stripe Dashboard**
   - Navigate to: **Developers** → **Webhooks**
   - Click **+ Add endpoint**

2. **Enter Endpoint URL**
   - Paste: `https://fiesta-liquor-website-production.up.railway.app/webhook/stripe`
   - Make sure you're in **Live mode**

3. **Select Events to Listen To**
   - Click **Select events**
   - Select these events:
     - ✅ `checkout.session.completed`
     - ✅ `payment_intent.succeeded`
   - Click **Add events**

4. **Add Endpoint**
   - Click **Add endpoint**

5. **Copy Webhook Signing Secret**
   - After creating the endpoint, click on it
   - Under **Signing secret**, click **Reveal**
   - Copy the secret (starts with `whsec_...` or `we_...`)

6. **Add Webhook Secret to Railway**
   - Go back to Railway → Variables
   - Add or update: `STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE`
   - Replace with your actual webhook signing secret
   - Redeploy the service

## ✅ Step 4: Verify Setup

### Test the Connection

1. **Test API Key**
   ```bash
   curl https://fiesta-liquor-website-production.up.railway.app/api/products
   ```
   Should return your products (no Stripe needed for this)

2. **Test Stripe Checkout** (in production)
   - Go to your website: https://fiesta-liquor-store.web.app
   - Add items to cart
   - Go to checkout
   - Select "Credit/Debit Card" payment
   - Click "Proceed to Payment"
   - You should be redirected to Stripe checkout

3. **Test with Stripe Test Card**
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any 3-digit CVC
   - Any ZIP code

### Check Webhook Logs

1. **In Stripe Dashboard**
   - Go to **Developers** → **Webhooks**
   - Click on your endpoint
   - View **Recent events** to see if webhooks are being received

2. **In Railway Logs**
   - Go to Railway → Your service → **Deployments** → **View Logs**
   - Look for messages like:
     - `✅ Payment successful:`
     - `✅ Updated order #X with Stripe total:`

## 🎯 Step 5: Test a Real Payment (Optional)

Once everything is set up, you can test with a real card:

1. Use a real credit/debit card
2. Complete a small test order
3. Check that:
   - Payment appears in Stripe Dashboard → **Payments**
   - Order is created in your admin dashboard
   - Order total matches Stripe charge amount
   - Webhook events are received

## 🔒 Security Checklist

- [x] Using live Stripe keys (not test keys)
- [x] Webhook secret is set in Railway
- [x] `SITE_URL` points to Firebase Hosting domain
- [x] Webhook endpoint is configured in Stripe
- [x] Webhook events are selected correctly
- [x] HTTPS is enabled (Railway provides this automatically)

## 🐛 Troubleshooting

### Payment redirects but order not created
- Check Railway logs for errors
- Verify `SITE_URL` is set correctly
- Check that user is logged in (orders require authentication)

### Webhook not receiving events
- Verify webhook URL is correct
- Check that webhook secret is set in Railway
- Make sure you're testing in Live mode (not Test mode)
- Check Railway logs for webhook errors

### "Stripe checkout failed" error
- Verify `STRIPE_SECRET_KEY` is set correctly
- Check that key starts with `sk_live_` (not `sk_test_`)
- Verify Railway service is running
- Check Railway logs for detailed error messages

### Order total doesn't match Stripe charge
- This should be fixed with the latest code updates
- Check that webhook is updating orders correctly
- Verify `stripeTotal` is being stored in orders

## 📞 Need Help?

- **Stripe Support:** https://support.stripe.com
- **Railway Support:** https://railway.app/help
- **Check Logs:** Railway → Service → Deployments → View Logs

## 🎉 You're All Set!

Once configured, your customers can:
- Pay with credit/debit cards
- See accurate order totals
- Receive order confirmations
- Track their orders in their account

Your orders will automatically:
- Create in your admin dashboard
- Show correct Stripe totals
- Trigger webhooks for payment confirmations

