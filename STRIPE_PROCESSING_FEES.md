# Stripe Processing Fees Implementation

## Fee Structure

The processing fees are calculated based on card type and transaction details:

### Base Rates:
- **Domestic Cards**: 2.9% + $0.30 per transaction
- **Manually Entered Cards**: +0.5% additional (3.4% + $0.30 total)
- **International Cards**: +1.5% additional (4.4% + $0.30 total)
- **Currency Conversion**: +1% additional (if required)

### Examples:
- **Domestic card, card-present**: 2.9% + $0.30
- **Domestic card, manually entered**: 3.4% + $0.30
- **International card**: 4.4% + $0.30
- **International card with currency conversion**: 5.4% + $0.30

## Implementation

### Upfront Fee Calculation
Since we cannot determine card type before payment, we charge the **base domestic rate** upfront:
- **Rate**: 2.9% + $0.30
- **Applied to**: Subtotal + Delivery Fee + Tax

### Actual Fee Tracking
A Stripe webhook endpoint (`/webhook/stripe`) captures the actual fees charged by Stripe after payment:
- Logs actual Stripe fees
- Identifies card type (domestic/international)
- Detects manual entry
- Tracks currency conversion fees

This allows you to:
- Track real processing costs vs. what was charged to customers
- Adjust pricing if needed
- Monitor fee trends

## Code Locations

### Backend (`server.js`):
- `calculateProcessingFee()` - Calculates fee based on card type
- `calculateUpfrontProcessingFee()` - Base rate for upfront charge
- `/webhook/stripe` - Webhook endpoint to capture actual fees

### Frontend:
- `public/checkout.js` - Checkout page fee calculation
- `public/script.js` - Cart summary fee display

## Webhook Setup

To enable webhook tracking:

1. **Get Webhook Secret from Stripe**:
   - Go to Stripe Dashboard → Developers → Webhooks
   - Create endpoint: `https://your-domain.com/webhook/stripe`
   - Copy the webhook signing secret

2. **Add to Environment Variables**:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```

3. **Webhook Events to Listen For**:
   - `checkout.session.completed` - Payment successful
   - `payment_intent.succeeded` - Payment intent completed

## Fee Calculation Formula

```javascript
// Base domestic rate
fee = (amount * 0.029) + 0.30

// With additional fees
if (international) fee = (amount * 0.044) + 0.30
if (manualEntry) fee = (amount * 0.034) + 0.30
if (currencyConversion) fee += (amount * 0.01)
```

## Current Implementation

- ✅ Base fee (2.9% + $0.30) charged upfront
- ✅ Fee calculated on total transaction amount (including tax)
- ✅ Webhook endpoint to capture actual Stripe fees
- ✅ Fee displayed in checkout and order summary
- ✅ Fee stored in order records

## Notes

- The base domestic rate covers most transactions
- Stripe charges their actual fees regardless of what we charge customers
- The webhook helps track the difference between charged fees and actual Stripe costs
- For international/manual entry cards, Stripe charges more but we've already collected the base fee
- This approach ensures customers pay processing fees while protecting your margins

## Testing

To test the webhook locally:
1. Use Stripe CLI: `stripe listen --forward-to localhost:4242/webhook/stripe`
2. Trigger test events: `stripe trigger checkout.session.completed`
3. Check server logs for fee details

