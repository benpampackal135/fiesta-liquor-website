# Order Confirmation Setup Guide

## What's Implemented

When customers place an order, they automatically receive:

### 1. Email Receipt (with full order details)
- Order number and date/time
- All items ordered with prices
- Subtotal, delivery fee, tax, and total
- Delivery/pickup information
- Estimated time
- Professional HTML email template

### 2. SMS Text Message (quick confirmation)
- Order number
- Order type (delivery/pickup)
- Total amount
- Estimated delivery/pickup time
- Address confirmation (for delivery)

### 3. Owner Notification
- You (the owner) also get SMS when orders come in
- Helps you track orders in real-time

---

## Email Setup (Required for Email Receipts)

You need to configure SMTP email settings in your `.env` file.

### Option 1: Gmail (Easiest)

1. **Enable 2-Factor Authentication** on your Gmail account
   - Go to myaccount.google.com
   - Security → 2-Step Verification → Turn on

2. **Create App Password**
   - Go to myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "Fiesta Liquor Website"
   - Copy the 16-character password

3. **Add to `.env` file:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password-here
```

### Option 2: Outlook/Hotmail

Add to `.env` file:
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

### Option 3: SendGrid (Professional)

1. Sign up at sendgrid.com (free tier: 100 emails/day)
2. Create API Key in Settings → API Keys
3. Add to `.env` file:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### Option 4: Mailgun (Professional)

1. Sign up at mailgun.com
2. Get SMTP credentials from dashboard
3. Add to `.env` file:

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
```

---

## SMS Setup (Already Configured)

Your Twilio is already set up! SMS notifications will work if you have:

```env
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM=your-twilio-phone-number
OWNER_PHONE=your-phone-number
```

**Customer SMS** will be sent to the phone number they provide during checkout.
**Owner SMS** will be sent to OWNER_PHONE when any order is placed.

---

## Testing the Notifications

### Test Email Receipt

1. Make sure SMTP settings are in `.env`
2. Restart your server: `npm start`
3. Place a test order with a real email address
4. Check your inbox for the confirmation email

### Test SMS Confirmation

1. Place a test order with a real phone number
2. Use format: +1234567890 (with country code)
3. You should receive SMS within seconds

### Check Server Logs

Watch the terminal for confirmation messages:
```
Order confirmation email sent to customer@example.com for order #123
Customer SMS confirmation sent to +1234567890 for order #123
Twilio SMS queued to owner-phone for order #123
```

---

## What Customers See

### Email Receipt Example

**Subject:** Order Confirmation #123 - Fiesta Liquor

```
🍾 Fiesta Liquor
Order Confirmation

✓ Order Confirmed!
Thank you for your order, John Smith!

Order Number: #123
Monday, December 19, 2025 at 2:30 PM

Order Type: Delivery
Delivery Address:
123 Main St
Austin, TX 78701
Estimated Delivery: 45-60 minutes

Order Details
─────────────────────────────
Jack Daniel's (750ml)  x2  $50.00  $100.00
Corona Extra (6-pack)  x1  $12.99   $12.99
─────────────────────────────

Subtotal:          $112.99
Delivery Fee:        $7.99
Tax:                 $9.98
Processing Fee:      $3.59
─────────────────────────────
Total:             $134.55

Need Help?
Questions about your order? Contact us:
📞 Phone: [Your Phone Number]
📧 Email: [Your Store Email]
```

### SMS Text Example

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

---

## Customization

### Update Store Information

Edit the email template in `server.js` (around line 150):

```javascript
// Change pickup location
Pickup Location: Fiesta Liquor<br>[Your Store Address]

// Change contact info in "Need Help" section
📞 Phone: [Your Phone Number]<br>
📧 Email: [Your Store Email]
```

### Customize Email Design

The email uses HTML with inline CSS. You can modify:
- Colors (change hex codes like `#1a1a2e`)
- Logo (add `<img src="your-logo-url">` in header)
- Footer text
- Font styles

### Customize SMS Message

Edit the `sendCustomerOrderSms` function in `server.js`:
- Change greeting text
- Add/remove information
- Modify formatting

---

## Troubleshooting

### Email Not Sending

**Check 1: SMTP Settings**
```bash
# View your .env file
cat .env | grep SMTP
```

Make sure all 5 SMTP variables are set correctly.

**Check 2: Gmail App Password**
- Must use App Password, not regular password
- Must have 2FA enabled first
- Password is 16 characters with no spaces

**Check 3: Server Logs**
Look for errors in terminal:
```
Failed to send order confirmation email: [error message]
```

**Check 4: Test SMTP Connection**
Add this test endpoint to server.js:
```javascript
app.get('/api/test-email', async (req, res) => {
    try {
        await mailer.sendMail({
            from: process.env.SMTP_USER,
            to: req.query.email,
            subject: 'Test Email',
            text: 'If you got this, email is working!'
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

Then test: `http://localhost:4242/api/test-email?email=your@email.com`

### SMS Not Sending

**Check 1: Phone Number Format**
Must include country code: `+1234567890` not `234-567-8900`

**Check 2: Twilio Balance**
- Log into twilio.com
- Check account balance
- Add credits if needed

**Check 3: Verified Numbers**
If using Twilio trial account, you can only send to verified phone numbers.

**Check 4: Server Logs**
```
Failed to send customer SMS: [error message]
```

### Customer Not Receiving Notifications

**Check 1: Customer Provided Email/Phone**
- Email must be valid format
- Phone must include country code
- Check orders.json to see what was saved

**Check 2: Spam Folder**
Emails might be in spam. Ask customer to:
- Check spam/junk folder
- Add your SMTP_USER email to contacts
- Mark as "Not Spam"

**Check 3: Server Restart**
After changing .env file, always restart:
```bash
npm start
```

---

## Email Deliverability Tips

### Avoid Spam Folder

1. **Use Your Domain Email** (not Gmail)
   - Instead of: your-email@gmail.com
   - Use: orders@fiestaliquor.com
   - Requires domain email hosting

2. **Add SPF Record** to your domain DNS
   ```
   v=spf1 include:_spf.google.com ~all
   ```

3. **Don't Send Too Many Emails**
   - Gmail free: 500/day max
   - SendGrid free: 100/day
   - Upgrade for higher volume

4. **Keep Clean Email List**
   - Remove bounced emails
   - Honor unsubscribe requests

---

## Upgrade Options

### For Higher Volume (100+ orders/day)

**SendGrid** - Best for transactional emails
- Pay as you go: $0.00085 per email
- 40,000 emails/month = $34/month
- Built-in templates and analytics

**AWS SES** - Cheapest option
- $0.10 per 1,000 emails
- Requires technical setup
- Very reliable

**Postmark** - Best deliverability
- $1.25 per 1,000 emails
- 99%+ inbox rate
- Great support

---

## Advanced Features

### Add Order Tracking

Update email template to include:
```html
<a href="https://yoursite.com/track-order?id=${order.id}" 
   style="background: #1a1a2e; color: white; padding: 12px 24px; 
          text-decoration: none; border-radius: 5px; display: inline-block;">
    Track Your Order
</a>
```

### Add Logo to Email

```html
<div style="background: #1a1a2e; padding: 30px; text-align: center;">
    <img src="https://yoursite.com/logo.png" 
         alt="Fiesta Liquor" 
         style="max-width: 200px; height: auto;">
</div>
```

### Send Status Updates

Add notifications when order status changes:
- Order confirmed → Customer
- Order ready → Customer
- Out for delivery → Customer
- Delivered → Customer

(Would need to add notification calls to the status update endpoint)

---

## Privacy & Legal

### CAN-SPAM Compliance

Order confirmation emails are exempt from CAN-SPAM, but:
- ✓ Use accurate "From" name
- ✓ Include physical address in footer
- ✓ Don't send marketing without permission

### SMS Consent

- ✓ Get permission during checkout
- ✓ Add checkbox: "Send order updates via SMS"
- ✓ Honor opt-out requests
- ✓ Follow TCPA regulations

### Data Storage

Customer emails and phone numbers are stored in:
- `/data/users.json`
- `/data/orders.json`

Keep these files secure and backed up.

---

## Current Configuration Status

Run this command to check what's configured:

```bash
node -e "
require('dotenv').config();
console.log('Email:', process.env.SMTP_HOST ? '✓ Configured' : '✗ Not Set');
console.log('SMS:', process.env.TWILIO_ACCOUNT_SID ? '✓ Configured' : '✗ Not Set');
"
```

Expected output:
```
Email: ✓ Configured
SMS: ✓ Configured
```

---

## Quick Start Checklist

- [ ] Add SMTP settings to `.env` file
- [ ] Restart server: `npm start`
- [ ] Place test order with your email
- [ ] Check inbox for confirmation email
- [ ] Place test order with your phone number
- [ ] Check for SMS confirmation
- [ ] Update store address/phone in email template
- [ ] Test with real customer

Once configured, notifications are automatic for every order!
