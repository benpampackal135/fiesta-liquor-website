# 🚀 Quick Start Guide - Fiesta Liquor Website

## ✅ You're All Set! Here's How to Use It

This website is now set up like a **simple platform** - you manage everything through your web browser, no coding needed!

---

## 📋 First Time Setup (5 minutes)

### 1. Start the Server
```bash
npm start
```

The website will be available at: **http://localhost:4242**

### 2. Login as Admin
- Go to: http://localhost:4242/auth.html
- **Email:** `admin@fiestaliquor.com`
- **Password:** `admin123`

### 3. You're In! 🎉

---

## 🛠️ Daily Management (Super Easy!)

### **Manage Products** (Like Shopify!)

#### Option A: Import from CSV (Bulk Upload)
1. Go to **Admin Dashboard** → Click **"Import Products"**
2. Download the CSV template
3. Fill in your products (name, category, price, etc.)
4. Upload the CSV file
5. Click **"Import to Website"** - Done! ✅

#### Option B: Add Products One by One
1. Go to **Admin Dashboard** → Scroll to **"Product Management"**
2. Click **"Add Product"**
3. Fill in the form (name, category, price, stock status)
4. Click **"Save Product"** - Done! ✅

#### Edit Products
- Click **"Edit"** next to any product
- Change price, stock status, description, etc.
- Click **"Save Product"** - Changes appear immediately!

#### Mark Out of Stock
- Click **"Edit"** on any product
- Uncheck **"In Stock"**
- Save - Product disappears from customer view!

---

## 📦 Manage Orders

1. Go to **Admin Dashboard**
2. See all orders in the **"Recent Orders"** section
3. Filter by status, type, or date
4. Export orders to CSV if needed

---

## 💰 Update Prices

**Super Easy:**
1. Go to **Product Management**
2. Click **"Edit"** on any product
3. Change the price
4. Save - Price updates immediately on the website!

---

## 📊 View Statistics

The dashboard shows:
- Total orders
- Total revenue
- Number of customers
- Products in stock
- Sales charts

---

## 🎨 What Customers See

- **Homepage:** http://localhost:4242
- Browse products by category
- Add to cart
- Checkout (pickup or delivery)
- Create account to track orders

---

## 🔑 Important Notes

### Changing Admin Password
1. Login as admin
2. Go to account page (if you add this feature)
3. Or edit `data/users.json` directly (find admin user, change password hash)

### Adding More Products
- Use CSV import for bulk products
- Or add one-by-one through the dashboard
- Products appear on website immediately!

### Inventory Management
- Just edit products and toggle "In Stock"
- Out of stock items won't show to customers
- No need to delete products - just mark them out of stock

---

## 📁 File Structure (Simple!)

```
fiesta-liquor-website/
├── public/              # Customer-facing website
├── data/               # Your database (auto-created)
│   ├── products.json   # All your products
│   ├── users.json      # Customer accounts
│   └── orders.json     # All orders
├── server.js           # Backend (runs automatically)
└── admin-dashboard.html # Your control panel
```

**You don't need to edit any code files!** Everything is managed through the web interface.

---

## 🆘 Troubleshooting

### Products Not Showing?
- Make sure products are marked "In Stock"
- Check the category filter on the homepage

### Can't Login?
- Default admin: `admin@fiestaliquor.com` / `admin123`
- Make sure server is running (`npm start`)

### Orders Not Saving?
- Check that `data/` folder exists
- Make sure server has write permissions

---

## 🎯 That's It!

You now have a **simple, platform-like** website where you:
- ✅ Manage products through a web interface
- ✅ Update prices with one click
- ✅ Import products from CSV
- ✅ View all orders
- ✅ See statistics and analytics

**No coding required!** Just log in and manage everything through your browser. 🚀

