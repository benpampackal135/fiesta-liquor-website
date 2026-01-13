# 🚀 Deployment Checklist

## Pre-Deployment Checklist

### ✅ Code Updates
- [x] Stripe webhook fix implemented
- [x] Barcode scanning feature added
- [x] Google Sheets import enhanced
- [x] All files updated and tested locally

### ⚠️ Environment Variables (Railway)
Check that these are set in Railway:

- [ ] `STRIPE_SECRET_KEY` - Your Stripe secret key
- [ ] `STRIPE_WEBHOOK_SECRET` - **NEW!** Stripe webhook signing secret (required for webhooks)
- [ ] `SITE_URL` - Frontend URL (https://fiesta-liquor-store.web.app)
- [ ] `JWT_SECRET` - Authentication secret
- [ ] `SMTP_HOST` - (Optional) Email server
- [ ] `SMTP_PORT` - (Optional) Email port (587)
- [ ] `SMTP_USER` - (Optional) Email username
- [ ] `SMTP_PASS` - (Optional) Email password
- [ ] `TWILIO_ACCOUNT_SID` - (Optional) Twilio SID
- [ ] `TWILIO_AUTH_TOKEN` - (Optional) Twilio token
- [ ] `TWILIO_PHONE_NUMBER` - (Optional) Twilio phone

### 🔔 Stripe Webhook Configuration
- [ ] Webhook endpoint created in Stripe Dashboard
- [ ] Webhook URL: `https://fiesta-liquor-website-production.up.railway.app/webhook/stripe`
- [ ] Events selected: `checkout.session.completed`
- [ ] Webhook signing secret copied to Railway as `STRIPE_WEBHOOK_SECRET`

---

## Deployment Steps

### Step 1: Deploy Backend (Railway)

```bash
# Make sure you're in the project directory
cd /Users/bensonpampackal/fiesta-liquor-website

# Deploy to Railway
railway up --detach

# Or if using Railway CLI directly:
railway deploy
```

**Verify:**
- [ ] Check Railway logs: `railway logs`
- [ ] Verify server started without errors
- [ ] Test API endpoint: `curl https://fiesta-liquor-website-production.up.railway.app/api/products`

### Step 2: Deploy Frontend (Firebase)

```bash
# Deploy to Firebase Hosting
firebase deploy --only hosting
```

**Verify:**
- [ ] Check Firebase console for deployment status
- [ ] Visit https://fiesta-liquor-store.web.app
- [ ] Verify site loads correctly

### Step 3: Test Webhook (CRITICAL)

1. **Check Stripe Dashboard:**
   - Go to: https://dashboard.stripe.com/webhooks
   - Find your webhook endpoint
   - Check "Recent events" - should show successful deliveries

2. **Make a test payment:**
   - Add item to cart
   - Complete checkout with Stripe test card: `4242 4242 4242 4242`
   - Check if webhook is received

3. **Verify in logs:**
   - Check Railway logs for: "📥 Stripe webhook received"
   - Should see: "✅ Payment successful"
   - Order should update automatically

---

## Post-Deployment Testing

### Admin Features
- [ ] Can login to admin dashboard
- [ ] Can access barcode scanner
- [ ] Can configure Google Sheets URL
- [ ] Can scan barcode and auto-fill form
- [ ] Can import products from Google Sheets

### Customer Features
- [ ] Can browse products
- [ ] Can add items to cart
- [ ] Can checkout with Stripe
- [ ] Receives order confirmation email

### Webhook Verification
- [ ] Webhook receives events from Stripe
- [ ] Orders update with Stripe totals
- [ ] Order confirmation emails are sent
- [ ] No webhook errors in Stripe Dashboard

---

## Troubleshooting

### Webhook Still Failing?
1. Verify `STRIPE_WEBHOOK_SECRET` is set in Railway
2. Check Railway logs for webhook errors
3. Verify webhook URL is correct in Stripe Dashboard
4. Test webhook endpoint: `curl https://fiesta-liquor-website-production.up.railway.app/webhook/stripe`

### Barcode Scanner Not Working?
1. Make sure Google Sheets URL is configured
2. Verify Google Sheet is published as CSV
3. Check browser console for errors
4. See `BARCODE_SCANNING_TEST.md` for troubleshooting

### Google Sheets Import Failing?
1. Verify sheet is published to web
2. Check URL format (should include `/export?format=csv`)
3. Verify columns: barcode, name, size, price
4. See `product-import.html` for format details

---

## Quick Commands Reference

```bash
# Start local server
npm start

# Deploy backend to Railway
railway up --detach

# Deploy frontend to Firebase
firebase deploy --only hosting

# Check Railway logs
railway logs

# Make user admin locally
node make-admin.js your-email@example.com

# Test webhook locally (requires Stripe CLI)
stripe listen --forward-to localhost:4242/webhook/stripe
```

---

## Success Criteria

✅ **Webhook is working:**
- Stripe Dashboard shows successful webhook deliveries
- No error emails from Stripe
- Orders update automatically after payment

✅ **Barcode scanner is working:**
- Can configure Google Sheets URL
- Can scan/type barcodes
- Form auto-fills with product information

✅ **Site is accessible:**
- Frontend loads at https://fiesta-liquor-store.web.app
- Backend API responds at https://fiesta-liquor-website-production.up.railway.app
- All features work as expected

---

## Next Steps After Deployment

1. **Monitor webhook logs** for 24 hours
2. **Test complete checkout flow** with real payment
3. **Set up Google Sheets** with your actual product inventory
4. **Train team** on using barcode scanner
5. **Configure email/SMS** notifications if needed

---

**Last Updated:** December 23, 2024
**Status:** Ready for deployment ✅

