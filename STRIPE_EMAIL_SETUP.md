# 📧 Stripe Payment Email Setup

## ✅ What's Implemented

When a customer completes payment through Stripe, they **automatically receive an order confirmation email** immediately after payment is processed.

## 🔄 How It Works

1. Customer completes Stripe checkout
2. Stripe sends webhook to your server (`checkout.session.completed`)
3. Server finds the order and updates it with Stripe total
4. **Email is sent immediately** to the customer
5. Customer receives order confirmation with all details

## 📋 Email Requirements

The email is sent using your SMTP configuration. Make sure you have these set in Railway:

```
SMTP_HOST=smtp.gmail.com (or your email provider)
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## 📧 What's in the Email

The order confirmation email includes:
- ✅ Order number and date/time
- ✅ All items ordered with prices and quantities
- ✅ Subtotal, delivery fee, tax, processing fee
- ✅ **Total amount (matches Stripe charge)**
- ✅ Delivery/pickup information
- ✅ Estimated delivery/pickup time
- ✅ Contact information

## 🧪 Testing

1. Place a test order through Stripe
2. Complete payment with test card: `4242 4242 4242 4242`
3. Check customer's email inbox
4. Email should arrive within seconds

## 🔍 Troubleshooting

### Email not sending?

1. **Check Railway logs:**
   ```bash
   railway logs
   ```
   Look for:
   - `📧 Sending order confirmation email...`
   - `Order confirmation email sent to...`
   - Or error messages

2. **Verify SMTP settings:**
   - Check Railway environment variables
   - Make sure SMTP credentials are correct
   - Test with a simple email first

3. **Check webhook:**
   - Go to Stripe Dashboard → Webhooks
   - Check if `checkout.session.completed` events are being received
   - Look for any webhook errors

### Email going to spam?

- Make sure `SMTP_USER` is a real email address
- Use a professional email (not a free Gmail if possible)
- Consider using SendGrid or Mailgun for better deliverability

## 📝 Email Template

The email uses a professional HTML template with:
- Fiesta Liquor branding
- Order details table
- Clear pricing breakdown
- Delivery/pickup information
- Contact information

## 🎯 Next Steps

1. ✅ Webhook is configured to send emails
2. ✅ Email function is ready
3. ⚠️ Make sure SMTP is configured in Railway
4. ⚠️ Test with a real order

Once SMTP is configured, emails will be sent automatically!

