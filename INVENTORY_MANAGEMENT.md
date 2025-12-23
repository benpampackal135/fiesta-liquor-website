# 📦 Inventory Management Guide

This guide shows you exactly where and how to manage your products, prices, and inventory.

## 🎯 Where to Manage Inventory

### **Admin Dashboard** - Your Main Control Panel

**Access:** `http://localhost:4242/admin-dashboard.html`

**Login Credentials:**
- Email: `admin@fiestaliquor.com`
- Password: `admin123`

---

## 📋 Managing Products

### **Option 1: Product Management Table (Recommended)**

1. **Log in to Admin Dashboard**
   - Go to `http://localhost:4242/admin-dashboard.html`
   - Log in with admin credentials

2. **Navigate to Product Management**
   - Scroll down to the **"Product Management"** section
   - You'll see a table with all your products

3. **Edit a Product**
   - Click the **"Edit"** button next to any product
   - A modal will open with all product fields
   - Change:
     - **Name** - Product name
     - **Category** - Whiskey, Tequila, Vodka, etc.
     - **Description** - Product description
     - **Price** - Update the price here
     - **Image URL** - Product image path
     - **In Stock** - Check/uncheck to mark in stock or out of stock
   - Click **"Save Product"**

4. **Add a New Product**
   - Click the **"Add Product"** button (top right of Product Management section)
   - Fill in all the fields:
     - Name (required)
     - Category (required)
     - Description (required)
     - Price
     - Image URL (optional - defaults to placeholder)
     - In Stock checkbox
   - Click **"Save Product"**

5. **Delete a Product**
   - Click the **"Delete"** button next to any product
   - Confirm deletion
   - Product will be removed from your inventory

6. **Refresh Products**
   - Click the **"Refresh"** button to reload the product list

---

### **Option 2: Import Products (Bulk Upload)**

1. **Go to Product Import Page**
   - Click **"Import Products"** button in Admin Dashboard
   - Or go directly to: `http://localhost:4242/product-import.html`

2. **Download CSV Template**
   - Click **"Download CSV Template"**
   - This gives you the correct format

3. **Fill in Your Products**
   - Open the CSV in Excel or Google Sheets
   - Add your products with:
     - Name
     - Category
     - Description
     - Price
     - Image path (optional)
     - In Stock (true/false)

4. **Upload CSV**
   - Click **"Choose File"**
   - Select your filled CSV
   - Click **"Import to Website"**
   - Products will be added automatically!

---

## 💰 Changing Prices

### **Quick Price Update:**

1. Go to **Admin Dashboard** → **Product Management**
2. Find the product in the table
3. Click **"Edit"**
4. Change the **Price** field
5. Click **"Save Product"**
6. Price updates immediately on the website!

---

## 📊 Stock Management

### **Mark Product as Out of Stock:**

1. Go to **Product Management** table
2. Click **"Edit"** on the product
3. **Uncheck** the **"In Stock"** checkbox
4. Click **"Save Product"**
5. Product will disappear from customer view (but stays in your database)

### **Mark Product as In Stock:**

1. Same process, but **check** the **"In Stock"** checkbox
2. Product will appear on the website again

---

## 🏷️ Setting Best Sellers

To show products in the "Best Sellers" section on the homepage:

1. Edit the product in **Product Management**
2. You can add a `bestSeller: true` flag to the product (this requires editing the JSON file directly, or we can add a checkbox in the admin panel)

**For now:** The Best Sellers section automatically shows your top 8 most expensive (premium) products.

---

## 📁 Direct File Editing (Advanced)

If you're comfortable with JSON files, you can edit directly:

**File Location:** `data/products.json`

**Example Product:**
```json
{
  "id": 1,
  "name": "Macallan 18 Year Old Single Malt",
  "category": "whiskey",
  "description": "Aged 18 years...",
  "image": "images/macallan18.png",
  "price": 299.99,
  "inStock": true,
  "bestSeller": true,
  "createdAt": "2025-12-18T23:47:09.186Z"
}
```

**Important:** After editing the JSON file directly, restart your server for changes to take effect.

---

## 🔄 Quick Actions Summary

| Action | Location | Steps |
|--------|----------|-------|
| **Add Product** | Admin Dashboard → Product Management → "Add Product" | Fill form → Save |
| **Edit Product** | Admin Dashboard → Product Management → "Edit" button | Modify fields → Save |
| **Change Price** | Admin Dashboard → Product Management → Edit → Price field | Update price → Save |
| **Mark Out of Stock** | Admin Dashboard → Product Management → Edit → Uncheck "In Stock" | Uncheck → Save |
| **Delete Product** | Admin Dashboard → Product Management → "Delete" button | Confirm deletion |
| **Bulk Import** | Admin Dashboard → "Import Products" | Upload CSV file |

---

## 💡 Tips

1. **Always refresh** the Product Management table after making changes to see updates
2. **Prices** update immediately on the website - no need to restart server
3. **Stock status** changes are instant - customers see changes right away
4. **Images** should be in the `public/images/` folder
5. **Categories** must match exactly: `whiskey`, `tequila`, `vodka`, `gin`, `rum`, `beer-seltzers`, `wine`

---

## 🆘 Troubleshooting

**Products not showing?**
- Check "In Stock" is checked
- Verify category matches filter options
- Refresh the page

**Price not updating?**
- Make sure you clicked "Save Product"
- Refresh the Product Management table
- Check browser console for errors

**Can't edit products?**
- Make sure you're logged in as admin
- Check that server is running
- Verify you have admin permissions

---

**That's it!** You now know exactly where to manage your inventory. The Admin Dashboard is your one-stop shop for all product management. 🎉

