# Fiesta Liquor Website

A simple, platform-like e-commerce website for Fiesta Liquor. **Manage everything through your web browser - no coding required!** 

Think of it like your own Shopify/Square - but simpler and customized for your liquor store.

## ✨ Features (Platform-Like Experience)

### **For You (Admin) - Manage Everything Online:**
- 📦 **Product Management** - Add, edit, delete products through web interface
- 📥 **CSV Import** - Bulk upload products from Excel/CSV files
- 💰 **Price Updates** - Change prices with one click
- 📊 **Inventory Control** - Mark items in/out of stock instantly
- 📋 **Order Management** - View, filter, and export all orders
- 📈 **Analytics Dashboard** - See sales, revenue, and customer stats
- 👥 **Customer Management** - View all customer accounts

### **For Customers:**
- 🛍️ **Browse Products** - Filter by category (Whiskey, Tequila, Vodka, etc.)
- 🛒 **Shopping Cart** - Add items, adjust quantities
- 📍 **Pickup/Delivery** - Choose order type
- 💳 **Payment** - Stripe integration for card payments
- 👤 **Account** - Track order history
- 📱 **Mobile Friendly** - Works on all devices

## 🚀 Quick Setup (5 Minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

### 3. Login as Admin
- Go to: http://localhost:4242/auth.html


### 4. Start Managing!
- **Customer Website:** http://localhost:4242
- **Admin Dashboard:** http://localhost:4242/admin-dashboard.html

**That's it!** You're ready to manage your store. See `QUICK_START.md` for detailed instructions.

---

## 📖 How to Use (No Coding Required!)

### **Add Products:**
1. Go to Admin Dashboard → Click **"Import Products"** or **"Add Product"**
2. Fill in product details (or upload CSV)
3. Save - Product appears on website immediately!

### **Update Prices:**
1. Go to Product Management
2. Click **"Edit"** on any product
3. Change price → Save
4. Price updates instantly on customer website!

### **Manage Inventory:**
- Edit product → Toggle "In Stock" checkbox
- Out of stock items won't show to customers

### **View Orders:**
- All orders appear in Admin Dashboard
- Filter by status, date, or type
- Export to CSV if needed

**See `QUICK_START.md` for complete guide!**

## Project Structure

```
fiesta-liquor-website/
├── public/                 # Frontend files
│   ├── index.html          # Main homepage
│   ├── auth.html           # Login/Register page
│   ├── account.html        # User account page
│   ├── script.js           # Main frontend JavaScript
│   ├── api.js              # API client utilities
│   ├── styles.css          # Stylesheet
│   └── images/             # Product images
├── data/                   # JSON data files (auto-created)
│   ├── products.json       # Product database
│   ├── users.json          # User database
│   └── orders.json         # Order database
├── server.js               # Express backend server
├── package.json            # Dependencies
└── README.md               # This file
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Orders
- `GET /api/orders` - Get orders (user's orders or all if admin)
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create new order (requires auth)
- `PUT /api/orders/:id/status` - Update order status (admin only)

### Users
- `GET /api/users` - Get all users (admin only)
- `PUT /api/users/profile` - Update user profile (requires auth)

### Statistics
- `GET /api/stats` - Get dashboard statistics (admin only)

### Stripe
- `POST /create-checkout-session` - Create Stripe checkout session

## Default Admin Account

- **Email:** admin@fiestaliquor.com
- **Password:** admin123

**Important:** Change the default admin password in production!

## 💾 Data Storage (Simple & Automatic)

All data is stored in JSON files (like a simple database):
- `data/products.json` - Your product catalog
- `data/users.json` - Customer accounts
- `data/orders.json` - All orders

**These files are created automatically** - you don't need to do anything!

**Backup Tip:** Just copy the `data/` folder to backup all your products, customers, and orders.

## 🎯 How It Works (Simple!)

- **You manage everything through your web browser** - no code editing needed
- Products, prices, and inventory sync automatically
- Orders are saved automatically
- Everything works like a simple platform (Shopify/Square style)

**You don't need to know coding!** Just:
1. Log in to admin dashboard
2. Click buttons to manage products
3. Upload CSV files to bulk import
4. Edit products to update prices/stock

That's it! 🎉

## Production Deployment

Before deploying to production:

1. Change `JWT_SECRET` to a strong, random secret
2. Update Stripe keys to production keys
3. Change default admin password
4. Consider using a proper database (PostgreSQL, MongoDB, etc.) instead of JSON files
5. Add environment-specific configurations
6. Set up proper error logging and monitoring
7. Enable HTTPS
8. Configure CORS properly for your domain

## License

This project is proprietary software for Fiesta Liquor.

