# 🔧 Troubleshooting: "No Products Found"

## Quick Fixes

### ✅ **Most Common Issue: Server Not Running**

The website needs the backend server to be running to load products.

**Solution:**
```bash
npm start
```

Then refresh your browser at: http://localhost:4242

---

### ✅ **Check if Products Exist**

Run this to verify products are in the database:
```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('data/products.json')); console.log('Products:', p.length);"
```

If it shows 0, run:
```bash
node setup-products.js
```

---

### ✅ **Check Server is Running**

1. Open terminal
2. Run: `npm start`
3. You should see: `Server running on http://localhost:4242`
4. If you see errors, check:
   - Are you in the correct directory?
   - Did you run `npm install`?
   - Are ports 4242 available?

---

### ✅ **Check Browser Console**

1. Open browser (Chrome/Firefox)
2. Press F12 (or right-click → Inspect)
3. Go to "Console" tab
4. Look for error messages

**Common errors:**
- `Failed to fetch` → Server not running
- `Cannot connect` → Server not running
- `404 Not Found` → Wrong URL or server not running

---

### ✅ **Verify API Endpoint**

Test if the API is working:
1. Make sure server is running: `npm start`
2. Open browser to: http://localhost:4242/api/products
3. You should see JSON data with products

If you see "Cannot GET /api/products", the server isn't running correctly.

---

### ✅ **Clear Browser Cache**

Sometimes old cached data causes issues:
1. Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Or clear browser cache in settings

---

## Step-by-Step Fix

1. **Stop any running server** (Ctrl+C in terminal)

2. **Start fresh:**
   ```bash
   npm start
   ```

3. **Wait for:** `Server running on http://localhost:4242`

4. **Open browser:** http://localhost:4242

5. **Check console** (F12) for any errors

6. **If still no products:**
   ```bash
   node setup-products.js
   ```
   Then refresh browser

---

## Still Not Working?

Check:
- ✅ Server is running (`npm start`)
- ✅ Products exist (`data/products.json` has content)
- ✅ No errors in browser console (F12)
- ✅ Using correct URL: http://localhost:4242
- ✅ Port 4242 is not blocked by firewall

If all above are correct, the products should load! 🎉

