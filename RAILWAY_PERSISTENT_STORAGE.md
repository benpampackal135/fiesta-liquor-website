# Railway Persistent Storage Setup

## Problem
Railway uses ephemeral storage by default, which means the `data/` directory gets wiped on every redeploy. This causes:
- Product changes to be lost
- Price updates to reset
- New products to disappear
- User data to be lost (though users can re-register)

## Solution: Set Up Railway Volume

### Step 1: Create a Volume in Railway Dashboard

1. Go to your Railway project: https://railway.app
2. Click on your `fiesta-liquor-website` service
3. Go to the **"Volumes"** tab
4. Click **"New Volume"**
5. Name it: `fiesta-data`
6. Set mount path: `/app/data` (or `/data` - check your Railway service path)
7. Set size: 1GB (or more if needed)
8. Click **"Create"**

### Step 2: Set Environment Variable

1. In your Railway service, go to **"Variables"** tab
2. Add a new variable:
   - **Key**: `DATA_DIR`
   - **Value**: `/app/data` (must match the volume mount path)
3. Click **"Add"**

### Step 3: Redeploy

After creating the volume and setting the env var, Railway will automatically redeploy. Your data will now persist across deployments.

## Alternative: Manual Backup Before Deploy

If you can't set up volumes right now, you can manually backup your data:

1. **Export products** from admin dashboard (if export feature exists)
2. **Or** SSH into Railway and copy `data/products.json`:
   ```bash
   railway run cat data/products.json > products-backup.json
   ```
3. After redeploy, restore the backup

## Important Notes

- **Always backup before major changes** if volumes aren't set up
- The code now **never overwrites existing products** - it only seeds if the file is missing or empty
- User changes are preserved as long as the volume persists

## Verify It's Working

After setting up the volume:
1. Make a product change in admin dashboard
2. Redeploy the service
3. Check if your change is still there

If changes persist after redeploy, the volume is working correctly!


