# Fiesta Liquor Website – Codex Context & Improvement Prompt

**Use this prompt in Codex when working on the Fiesta Liquor website.** It gives Codex full context so it can make better, more consistent improvements.

---

## What This Project Is

**Fiesta Liquor** is a local liquor store e-commerce site. It’s a custom “platform-like” solution (similar to Shopify/Square but tailored for liquor retail).

### Business Model
- **Pickup & delivery** – customers order online, choose pickup or delivery
- **Age verification** – 21+ gate before browsing
- **Stripe payments** – card processing
- **Admin-managed** – products, inventory, and orders managed via web dashboard (no coding required)

### Tech Stack
- **Frontend:** Static HTML/CSS/JS, Firebase Hosting, PWA (service worker, manifest)
- **Auth:** Firebase Auth (Google Sign-In, email/password) + JWT for API
- **Backend:** Node.js/Express on Railway
- **Data:** JSON files (`data/products.json`, `orders.json`, `users.json`) – no real database
- **Integrations:** Stripe, Twilio (SMS), Nodemailer (email), optional Clover POS sync

### Main Features
- Product catalog with category filters (Whiskey, Tequila, Vodka, Gin, Rum, Beer, Wine)
- Shopping cart, checkout, order confirmation
- Admin: product CRUD, CSV/Google Sheets import, barcode scanner, order management, analytics
- Order notifications: owner SMS, customer SMS, order confirmation emails
- PWA: installable, offline-capable

---

## Current Inefficiencies & Pain Points

### 1. Data & Scalability
- **JSON file storage** – not suitable for production at scale; no transactions, concurrency, or backups
- **No real database** – should move to PostgreSQL, MongoDB, or Supabase
- **Railway ephemeral storage** – `data/` can be lost on redeploy; needs persistent volume or external DB

### 2. Architecture & Deployment
- **Split frontend/backend** – Firebase (frontend) + Railway (backend) with different URLs; CORS set to `*` (insecure)
- **Hardcoded admin emails** – e.g. `adminEmails = ['bensonpampackal456@gmail.com']` in `script.js`; should use roles from backend
- **Many env vars** – SMTP, Twilio, Stripe, Clover, SITE_URL; easy to misconfigure

### 3. Code Quality & Maintainability
- **Large monolithic server.js** – 2300+ lines; should be split into routes, services, middleware
- **Duplicate logic** – `public/api.js` and `public/checkout.js` vs `public/js/`; inconsistent structure
- **Inline styles** – age modal and other UI use inline styles; should use CSS classes
- **Mixed auth** – Firebase + JWT; flow is complex and error-prone

### 4. UX & Performance
- **Best Sellers** – currently “top 8 most expensive”; should be based on sales or explicit flags
- **No search** – search box exists but behavior is unclear; needs real product search
- **Mobile UX** – cart sidebar and checkout flow could be smoother
- **No loading states** – some actions lack clear feedback

### 5. Security & Compliance
- **CORS `origin: '*'`** – should restrict to known frontend domains
- **Default admin credentials** – `admin@fiestaliquor.com` / `admin123`; must be changed in production
- **Age verification** – client-side only; easy to bypass; consider server-side checks for sensitive flows

### 6. Operations
- **Clover sync** – manual or cron; no admin-triggered sync in UI
- **No order status workflow** – e.g. “Preparing” → “Ready” → “Completed”
- **Delivery zones/fees** – logic exists but may not be configurable
- **Store address** – hardcoded in emails (“[Your Store Address]”)

---

## Changes Needed to Make It Better

### High Priority
1. **Database migration** – Replace JSON with PostgreSQL (e.g. Supabase) or MongoDB; add migrations
2. **Restrict CORS** – Use `SITE_URL` or allowlist; remove `origin: '*'`
3. **Refactor server.js** – Split into `routes/`, `services/`, `middleware/`; keep server.js thin
4. **Admin roles from backend** – Remove hardcoded admin emails; use `role` from user/DB
5. **Persistent storage** – Use Railway volumes or external DB so data survives deploys

### Medium Priority
6. **Real product search** – Implement search (name, category, description)
7. **Best Sellers logic** – Use sales data or explicit `bestSeller` flag in admin
8. **Order status workflow** – Add statuses and transitions (e.g. Preparing → Ready → Completed)
9. **Store config** – Store address, delivery zones, fees in DB or env
10. **Error handling** – Centralized error handler and user-friendly messages

### Lower Priority
11. **Clover sync in admin** – “Sync with Clover” button in dashboard
12. **Image optimization** – Resize/compress uploads; consider CDN
13. **SEO** – Meta tags, structured data, sitemap
14. **Analytics** – Basic events (page views, add-to-cart, checkout)
15. **Tests** – Unit tests for critical paths (auth, checkout, product APIs)

---

## Project Structure Reference

```
fiesta-liquor-website/
├── public/           # Frontend (served by Express, deployed to Firebase)
│   ├── index.html    # Homepage
│   ├── auth.html     # Login/register
│   ├── account.html  # User account
│   ├── admin-dashboard.html
│   ├── product-import.html
│   ├── script.js     # Main customer JS
│   ├── api.js        # API client
│   ├── checkout.js   # Checkout flow
│   ├── firebase.js, firebase-auth.js
│   ├── styles.css
│   └── images/       # Product images
├── data/             # JSON "database" (products, orders, users)
├── server.js         # Express backend (monolithic)
├── clover-sync.js    # Clover POS sync script
├── setup-products.js # Seed products
└── *.md              # Many docs (deployment, Stripe, email, etc.)
```

---

## Conventions to Follow

- **API base URL** – Use relative paths (`/api/...`) or `SITE_URL` for redirects
- **Auth** – Bearer token in `Authorization` header; Firebase ID token for some endpoints
- **Product categories** – `whiskey`, `tequila`, `vodka`, `gin`, `rum`, `beer-seltzers`, `wine`
- **Order types** – `pickup` or `delivery`
- **Admin routes** – Most require `role: 'admin'`; check JWT or Firebase custom claims

---

## When Making Changes

1. **Preserve existing behavior** – Don’t break checkout, auth, or admin flows
2. **Check env vars** – See `.env.example` for required variables
3. **Test both flows** – Guest cart vs logged-in user
4. **Mobile-first** – Site is used on phones; keep touch targets and layout responsive
5. **Document** – Update README or relevant .md when adding features or changing setup
