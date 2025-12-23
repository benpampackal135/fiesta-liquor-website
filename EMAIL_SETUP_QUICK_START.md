# 📧 Quick Setup: Email Notifications

## Current Status
✅ **SMS Notifications:** READY (Twilio configured)
❌ **Email Notifications:** NOT CONFIGURED YET

---

## 5-Minute Email Setup (Use Gmail)

### Step 1: Get Gmail App Password

1. Go to: https://myaccount.google.com
2. Click **"Security"** in left sidebar
3. Enable **"2-Step Verification"** (if not already on)
4. Go back to Security page
5. Scroll to **"App passwords"** and click
6. Select app: **"Mail"**
7. Select device: **"Other"** → Type "Fiesta Liquor"
8. Click **"Generate"**
9. **COPY the 16-character password** (looks like: `abcd efgh ijkl mnop`)

### Step 2: Add to .env File

Open `/Users/bensonpampackal/fiesta-liquor-website/.env` and add these lines:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop
```

Replace:
- `your-email@gmail.com` with your Gmail address
- `abcdefghijklmnop` with your 16-character app password (no spaces)

### Step 3: Restart Server

```bash
npm start
```

### Step 4: Test It!

Place a test order with your email address and check your inbox!

---

## What Customers Receive Now

### SMS Text Message (Already Working)
```
✓ Order Confirmed! #123
Thank you for shopping with Fiesta Liquor!

Order Type: Delivery
Items: 3
Subtotal: $112.99
Delivery Fee: $7.99
Tax: $9.98
Total: $134.55

Estimated Delivery: 45-60 min
Address: 123 Main St

Questions? Reply to this message.
```

### Email Receipt (After Setup)
- Professional HTML email
- Complete order details with itemized list
- Subtotal, tax, fees, total
- Delivery/pickup information
- Your contact information
- Looks like receipts from Amazon/Uber Eats

---

## What You (Owner) Receive

### SMS Alert (Already Working)
```
New order #123 (delivery)
Total: $134.55
Items: 3
Address: 123 Main St
Customer: John Smith
```

---

## Need Help?

See full guide: [ORDER_CONFIRMATION_SETUP.md](ORDER_CONFIRMATION_SETUP.md)

### Common Issues:

**Gmail not working?**
- Make sure 2-Factor Authentication is ON first
- Use App Password, not your regular Gmail password
- Remove any spaces from the 16-character code

**Test email endpoint:**
Add your email to this URL and visit in browser:
```
http://localhost:4242/api/test-email?email=your@email.com
```

If you see `{"success":true}`, email is working!

---

## Alternative: Skip Gmail, Use SendGrid

If Gmail setup is confusing:

1. Go to: https://sendgrid.com
2. Sign up (FREE - 100 emails/day)
3. Create API Key in dashboard
4. Add to .env:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key-here
```

SendGrid is more reliable for business emails!
