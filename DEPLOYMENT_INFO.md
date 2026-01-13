# 🚀 Fiesta Liquor Website - Production Deployment

## ✅ Deployment Status: LIVE

### 🌐 Live URLs

- **Frontend (Firebase):** https://fiesta-liquor-store.web.app
- **Backend API (Railway):** https://fiesta-liquor-website-production.up.railway.app

### 👥 Test Accounts

#### Admin Account
- **Email:** `admin@fiestaliquor.com`
- **Password:** `admin123`
- **Role:** Administrator (full access to admin dashboard)

#### Customer Account
- **Email:** `customer@test.com`
- **Password:** `password123`
- **Role:** Regular customer (can browse and place orders)

### 📦 Products

- **Total Products:** 25 items (automatically seeded on Railway startup)
- **Categories:** Whiskey, Tequila, Vodka, Gin, Rum, Beer & Seltzers

### 🛠️ How It Works

1. **Frontend** hosted on Firebase Hosting (static files)
2. **Backend** hosted on Railway (Node.js server with API endpoints)
3. **API Communication:** Frontend automatically detects environment:
   - Local development → uses `localhost`
   - Production → uses Railway URL

4. **Data Storage:** JSON files in Railway's `/app/data` folder:
   - `products.json` - All 25 products (auto-seeded)
   - `users.json` - User accounts (default admin + test customer created on startup)
   - `orders.json` - Customer orders
   - `settings.json` - Store settings
   - `promo-codes.json` - Promotional codes
   - `newsletter.json` - Newsletter subscribers

### 🔄 Redeploying

#### Frontend (Firebase)
```bash
cd /Users/bensonpampackal/fiesta-liquor-website
firebase deploy --only hosting
```

#### Backend (Railway)
```bash
cd /Users/bensonpampackal/fiesta-liquor-website
railway up --detach
```

### ⚙️ Environment Variables Needed on Railway

To enable email/SMS features, add these to Railway:

```
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-email-password
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone
```

#### Stripe Configuration

Set these additional variables to enable Stripe payments and webhooks:

```
STRIPE_SECRET_KEY=sk_live_or_test_key_here
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
SITE_URL=https://fiesta-liquor-store.web.app
```

**Important Notes:**
- `SITE_URL` controls the `success_url` and `cancel_url` used when creating Stripe Checkout Sessions. Point this to the Firebase Hosting domain so the success page runs with the same origin that holds your login tokens and cart.
- `STRIPE_WEBHOOK_SECRET` is required for webhook signature verification. Get this from Stripe Dashboard → Webhooks → Your endpoint → Signing secret.
- Webhook endpoint: `https://fiesta-liquor-website-production.up.railway.app/webhook/stripe`
- Make sure to configure the webhook in Stripe Dashboard to send `checkout.session.completed` events.

### 📱 PWA Features

- **Install as App:** Users can install the website as a PWA on their phones
- **Offline Support:** Service worker caches pages for offline browsing
- **iOS Optimized:** Safe areas, touch targets, and iOS-specific styling

### 🧪 Testing the Site

1. Go to https://fiesta-liquor-store.web.app
2. Browse products (should see all 25 items)
3. Add items to cart
4. Checkout as guest OR login with test account
5. Admin features: Login with admin account to access dashboard

### 🎯 Next Steps

- [ ] Configure email/SMS credentials on Railway for order notifications
- [ ] Add real product images
- [ ] Set up Stripe payment processing (add STRIPE_SECRET_KEY to Railway)
- [ ] Test full checkout flow
- [ ] Update business hours in admin settings
- [ ] Configure delivery zones

### 📞 Support

If you encounter any issues:
1. Check browser console for errors (F12)
2. Verify Railway backend is running: `railway logs`
3. Test API directly: `curl https://fiesta-liquor-website-production.up.railway.app/api/products`
