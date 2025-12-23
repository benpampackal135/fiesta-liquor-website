# 🛒 Clover POS Integration Guide

This guide will help you connect your Clover POS system to automatically sync product prices and inventory with your website.

## 📋 Prerequisites

1. **Clover Developer Account**: Sign up at https://www.clover.com/developers
2. **Clover API Access**: You'll need API credentials from your Clover account
3. **Node.js**: Already installed (you're using it!)

## 🔑 Step 1: Get Clover API Credentials

1. Log in to your Clover account
2. Go to **Apps** → **Developers** → **API Tokens**
3. Create a new API token with the following permissions:
   - `READ_ITEMS` - To read product information
   - `READ_INVENTORY` - To check stock levels
4. Copy your:
   - **API Token**
   - **Merchant ID** (found in your Clover dashboard)

## ⚙️ Step 2: Configure Environment Variables

Add these to your `.env` file:

```env
# Clover API Configuration
CLOVER_API_TOKEN=your_api_token_here
CLOVER_MERCHANT_ID=your_merchant_id_here
CLOVER_ENVIRONMENT=prod
# Use 'sandbox' for testing, 'prod' for production

# Optional: Auto-sync on server startup
CLOVER_AUTO_SYNC=false
# Set to 'true' to automatically sync when server starts
```

## 🚀 Step 3: Initial Product Mapping

The sync script will try to automatically match products by name, but you may need to create manual mappings for products that don't match exactly.

### Option A: Automatic Matching (Recommended First)

1. Run the sync script:
   ```bash
   node clover-sync.js
   ```

2. The script will:
   - Find products with matching names
   - Create automatic mappings
   - Update prices and inventory

3. Check the output for any products that were skipped

### Option B: Manual Mapping

If products don't match automatically, you can manually map them:

1. Find the Clover Item ID (from Clover dashboard or API)
2. Find the Website Product ID (from admin dashboard)
3. Edit `data/clover-mapping.json`:
   ```json
   {
     "CLOVER_ITEM_ID": WEBSITE_PRODUCT_ID
   }
   ```

## 🔄 Step 4: Sync Methods

### Method 1: Manual Sync (Command Line)

Run the sync script anytime:
```bash
node clover-sync.js
```

### Method 2: Manual Sync (Admin Dashboard)

1. Log in to Admin Dashboard
2. Go to **Settings** or **Integrations** section
3. Click **"Sync with Clover"** button
4. Wait for confirmation message

### Method 3: Automatic Sync (Scheduled)

Set up a cron job or scheduled task to run sync periodically:

**Linux/Mac (crontab):**
```bash
# Sync every hour
0 * * * * cd /path/to/fiesta-liquor-website && node clover-sync.js

# Sync every 15 minutes
*/15 * * * * cd /path/to/fiesta-liquor-website && node clover-sync.js
```

**Windows (Task Scheduler):**
- Create a task that runs `node clover-sync.js` on a schedule

### Method 4: Auto-Sync on Server Start

Add to `.env`:
```env
CLOVER_AUTO_SYNC=true
```

The server will automatically sync when it starts.

## 📊 What Gets Synced?

- ✅ **Product Prices** - Updated from Clover
- ✅ **Inventory Status** - In Stock / Out of Stock
- ✅ **Product Availability** - Based on Clover stock levels

## ⚠️ Important Notes

1. **Product Names Must Match**: The sync uses product names to match items. Make sure product names in Clover match (or are similar to) names on your website.

2. **New Products**: If a product exists in Clover but not on your website, it will be skipped. You need to add it manually first, then run sync.

3. **Product Categories**: Categories are NOT synced from Clover. You'll need to set categories manually on your website.

4. **Product Images**: Images are NOT synced. Keep your website images separate.

5. **Product Descriptions**: Descriptions are NOT synced. Keep your website descriptions.

## 🔍 Troubleshooting

### "Authentication failed" Error

- Check that your `CLOVER_API_TOKEN` is correct
- Make sure the token hasn't expired
- Verify you have the correct permissions

### "Merchant not found" Error

- Verify your `CLOVER_MERCHANT_ID` is correct
- Check that you're using the right environment (prod vs sandbox)

### Products Not Syncing

1. Check if products exist in Clover
2. Verify product names match (or create manual mapping)
3. Check `data/clover-mapping.json` for mappings
4. Look at server logs for specific errors

### Prices Not Updating

1. Make sure products are mapped correctly
2. Verify Clover items have prices set
3. Check that items are marked as "available" in Clover

## 📝 Example Workflow

1. **Change price in Clover POS** → Update item price
2. **Run sync** → `node clover-sync.js` or use admin dashboard
3. **Check website** → Price should be updated automatically
4. **Verify** → Check admin dashboard to confirm changes

## 🔐 Security

- Never commit your `.env` file to git
- Keep your Clover API token secure
- Rotate tokens periodically
- Use sandbox environment for testing

## 📞 Support

If you need help:
1. Check Clover API documentation: https://docs.clover.com/
2. Review server logs for error messages
3. Verify your API credentials are correct

---

**Happy Syncing! 🎉**

