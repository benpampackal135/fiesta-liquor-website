require('dotenv').config();

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const multer = require("multer");

// Multer — save product images into public/images/
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "public/images");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const base = path.basename(file.originalname, ext)
            .replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);
        cb(null, `${base}-${Date.now()}${ext}`);
    }
});
const uploadImage = multer({
    storage: imageStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error("Only image files are allowed"));
    }
});

const app = express();

function parseCsvEnv(value) {
    return String(value || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
}

const adminEmails = parseCsvEnv(process.env.ADMIN_EMAILS).map(email => email.toLowerCase());
const primaryAdminEmail = adminEmails[0] || "bensonpampackal456@gmail.com";

const configuredCorsOrigins = parseCsvEnv(process.env.CORS_ORIGINS);
const defaultCorsOrigins = [
    "http://localhost:4242",
    "http://127.0.0.1:4242",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    process.env.SITE_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
    "https://fiesta-liquor-website-production.up.railway.app",
    "https://fiesta-liquor-store.web.app",
    "https://fiesta-liquor-store.firebaseapp.com"
].filter(Boolean);

const allowedOrigins = [...new Set([...defaultCorsOrigins, ...configuredCorsOrigins])];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("CORS origin denied"));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ── V2 clean-URL routes (must come BEFORE static middleware) ──────────────────
app.get('/',        (req, res) => res.sendFile(path.join(__dirname, 'public/v2/index.html')));
app.get('/auth',    (req, res) => res.sendFile(path.join(__dirname, 'public/v2/auth.html')));
app.get('/checkout',(req, res) => res.sendFile(path.join(__dirname, 'public/v2/checkout.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public/v2/success.html')));
app.get('/account',        (req, res) => res.sendFile(path.join(__dirname, 'public/v2/account.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public/v2/reset-password.html')));
app.get('/admin',          (req, res) => res.sendFile(path.join(__dirname, 'public/admin-dashboard.html')));
// ─────────────────────────────────────────────────────────────────────────────

// ── Image upload (admin only) ─────────────────────────────────────────────────
app.post("/api/upload/image", authenticateToken, requireAdmin, uploadImage.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ url: `images/${req.file.filename}` });
});
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.static('public'));
app.get('/v2', (req, res) => {
    res.redirect('/v2/');
});
// Helper: site URL (override with SITE_URL)
function getSiteUrl(req) {
    const configured = process.env.SITE_URL;
    if (configured && configured.trim().length > 0) return configured.trim();
    return `${req.protocol}://${req.get("host")}`;
}

// Configure SMTP transporter (optional)
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
        mailer = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: (process.env.SMTP_SECURE || 'false') === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    } catch (e) {
        console.error('Failed to configure SMTP transporter:', e);
    }
}

// Configure Twilio (optional SMS notifications)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    try {
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } catch (e) {
        console.error('Failed to configure Twilio client:', e.message);
    }
}

async function sendOrderSms(order) {
    if (!twilioClient) return;
    const to = process.env.OWNER_PHONE;
    if (!to) {
        console.warn('OWNER_PHONE not set; skipping SMS notification');
        return;
    }
    const fmt = (num) => `$${(num || 0).toFixed(2)}`;
    const lines = [
        `New order #${order.id || 'N/A'} (${order.orderType || 'pickup'})`,
        `Total: ${fmt(order.total)}`,
        `Items: ${order.items?.length || 0}`
    ];
    if (order.orderType === 'delivery' && order.customer?.address) {
        lines.push(`Address: ${order.customer.address.street || order.customer.address}`);
    }
    if (order.customer?.firstName || order.customer?.lastName) {
        lines.push(`Customer: ${(order.customer.firstName || '')} ${(order.customer.lastName || '')}`.trim());
    }
    const body = lines.join('\n');
    try {
        await twilioClient.messages.create({
            body,
            from: process.env.TWILIO_FROM,
            to
        });
        console.log(`Twilio SMS queued to ${to} for order #${order.id}`);
    } catch (err) {
        const code = err.code || 'unknown';
        const more = err.moreInfo || '';
        console.error('Failed to send SMS notification:', err.message, `code=${code}`, more ? `moreInfo=${more}` : '');
    }
}

// Send order confirmation SMS to customer
async function sendCustomerOrderSms(order) {
    if (!twilioClient) return;
    const customerPhone = order.customer?.phone;
    if (!customerPhone) {
        console.warn('Customer phone not provided; skipping customer SMS');
        return;
    }
    
    const fmt = (num) => `$${(num || 0).toFixed(2)}`;
    const orderTypeCap = (order.orderType || 'pickup').charAt(0).toUpperCase() + (order.orderType || 'pickup').slice(1);
    
    const lines = [
        `✓ Order Confirmed! #${order.id}`,
        `Thank you for shopping with Fiesta Liquor!`,
        ``,
        `Order Type: ${orderTypeCap}`,
        `Items: ${order.items?.length || 0}`,
        `Subtotal: ${fmt(order.subtotal)}`
    ];
    
    if (order.deliveryFee > 0) {
        lines.push(`Delivery Fee: ${fmt(order.deliveryFee)}`);
    }
    
    lines.push(`Tax: ${fmt(order.tax)}`);
    lines.push(`Total: ${fmt(order.total)}`);
    lines.push(``);
    
    if (order.orderType === 'delivery') {
        lines.push(`Estimated Delivery: ${order.deliveryTimeEstimate || '45-60 min'}`);
        if (order.customer?.address) {
            lines.push(`Address: ${order.customer.address.street || order.customer.address}`);
        }
    } else {
        lines.push(`Pickup Location: Fiesta Liquor`);
        lines.push(`Estimated Ready: 20-30 min`);
    }
    
    lines.push(``);
    lines.push(`Questions? Reply to this message.`);
    
    const body = lines.join('\n');
    
    try {
        await twilioClient.messages.create({
            body,
            from: process.env.TWILIO_FROM,
            to: customerPhone
        });
        console.log(`Customer SMS confirmation sent to ${customerPhone} for order #${order.id}`);
    } catch (err) {
        console.error('Failed to send customer SMS:', err.message);
    }
}

// Send order confirmation email to customer
async function sendCustomerOrderEmail(order) {
    if (!mailer) return;
    const customerEmail = order.customer?.email;
    if (!customerEmail) {
        console.warn('Customer email not provided; skipping order confirmation email');
        return;
    }
    
    const fmt = (num) => `$${(num || 0).toFixed(2)}`;
    const customerName = `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 'Valued Customer';
    const orderTypeCap = (order.orderType || 'pickup').charAt(0).toUpperCase() + (order.orderType || 'pickup').slice(1);
    
    // Generate items list HTML
    const itemsHtml = order.items.map(item => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px 8px;">${item.name}${item.size ? ` (${item.size})` : ''}</td>
            <td style="padding: 12px 8px; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px 8px; text-align: right;">${fmt(item.price)}</td>
            <td style="padding: 12px 8px; text-align: right; font-weight: 600;">${fmt(item.price * item.quantity)}</td>
        </tr>
    `).join('');
    
    const deliveryInfo = order.orderType === 'delivery' 
        ? `<p style="margin: 10px 0;"><strong>Delivery Address:</strong><br>${order.customer.address?.street || order.customer.address || 'N/A'}<br>${order.customer.address?.city || ''} ${order.customer.address?.state || ''} ${order.customer.address?.zip || ''}</p>
           <p style="margin: 10px 0;"><strong>Estimated Delivery:</strong> ${order.deliveryTimeEstimate || '45-60 minutes'}</p>`
        : `<p style="margin: 10px 0;"><strong>Pickup Location:</strong><br>Fiesta Liquor<br>[Your Store Address]</p>
           <p style="margin: 10px 0;"><strong>Estimated Ready:</strong> 20-30 minutes</p>`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🍾 Fiesta Liquor</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Order Confirmation</p>
        </div>
        
        <!-- Success Message -->
        <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px 20px; margin: 20px;">
            <p style="margin: 0; color: #155724; font-size: 16px; font-weight: 600;">✓ Order Confirmed!</p>
            <p style="margin: 5px 0 0 0; color: #155724;">Thank you for your order, ${customerName}!</p>
        </div>
        
        <!-- Order Info -->
        <div style="padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px; color: #666;">Order Number</p>
                <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: #1a1a2e;">#${order.id}</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">${new Date(order.orderDate).toLocaleString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #1a1a2e;">Order Type: ${orderTypeCap}</h2>
                ${deliveryInfo}
            </div>
            
            <!-- Items Table -->
            <h2 style="margin: 20px 0 10px 0; font-size: 18px; color: #1a1a2e;">Order Details</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #eee;">
                <thead>
                    <tr style="background-color: #f8f9fa;">
                        <th style="padding: 12px 8px; text-align: left; font-size: 14px; color: #666;">Item</th>
                        <th style="padding: 12px 8px; text-align: center; font-size: 14px; color: #666;">Qty</th>
                        <th style="padding: 12px 8px; text-align: right; font-size: 14px; color: #666;">Price</th>
                        <th style="padding: 12px 8px; text-align: right; font-size: 14px; color: #666;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <!-- Order Summary -->
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #666;">Subtotal:</span>
                    <span style="font-weight: 600;">${fmt(order.subtotal)}</span>
                </div>
                ${order.deliveryFee > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #666;">Delivery Fee:</span>
                    <span style="font-weight: 600;">${fmt(order.deliveryFee)}</span>
                </div>` : ''}
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #666;">Tax:</span>
                    <span style="font-weight: 600;">${fmt(order.tax)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #666;">Processing Fee:</span>
                    <span style="font-weight: 600;">${fmt(order.stripeFee)}</span>
                </div>
                <div style="border-top: 2px solid #1a1a2e; margin-top: 10px; padding-top: 10px; display: flex; justify-content: space-between;">
                    <span style="font-size: 18px; font-weight: 700; color: #1a1a2e;">Total:</span>
                    <span style="font-size: 18px; font-weight: 700; color: #1a1a2e;">${fmt(order.stripeTotal || order.total)}</span>
                </div>
            </div>
            
            <!-- Contact Info -->
            <div style="margin-top: 30px; padding: 20px; background-color: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                <p style="margin: 0 0 10px 0; font-weight: 600; color: #856404;">Need Help?</p>
                <p style="margin: 0; color: #856404; font-size: 14px;">Questions about your order? Contact us:</p>
                <p style="margin: 5px 0 0 0; color: #856404; font-size: 14px;">
                    📞 Phone: [Your Phone Number]<br>
                    📧 Email: [Your Store Email]
                </p>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
            <p style="margin: 0; font-size: 14px; color: #666;">Thank you for shopping with Fiesta Liquor!</p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">
                This is an automated confirmation email. Please do not reply to this message.
            </p>
        </div>
        
    </div>
</body>
</html>
    `;
    
    try {
        await mailer.sendMail({
            from: `"Fiesta Liquor" <${process.env.SMTP_USER}>`,
            to: customerEmail,
            subject: `Order Confirmation #${order.id} - Fiesta Liquor`,
            html: htmlContent
        });
        console.log(`Order confirmation email sent to ${customerEmail} for order #${order.id}`);
    } catch (err) {
        console.error('Failed to send order confirmation email:', err.message);
    }
}


// Data directory (still used for Clover mapping file)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database tables and seed data
async function initDatabase() {
    await db.initTables();

    // Seed products if table is empty
    const productCount = await db.products.count();
    if (productCount === 0) {
        console.log('📦 Seeding default products...');
        const seedProducts = [
  {"id":3,"name":"Jack Daniel's","category":"whiskey","description":"The iconic, original Tennessee Whiskey, charcoal mellowed through sugar maple, creating a smooth character with vanilla, caramel, and a hint of fruit.","image":"images/jackdaniel.png","price":14.99,"inStock":true,"sizes":[{"size":"375ml","price":14.99,"inStock":true},{"size":"750ml","price":27.99,"inStock":true},{"size":"1L","price":36.99,"inStock":true},{"size":"1.75L","price":52.99,"inStock":true}]},
  {"id":5,"name":"Jameson Irish Whiskey","category":"whiskey","description":"Triple-distilled for smoothness, this classic Irish whiskey is perfect for any occasion. Light, crisp, and approachable.","image":"images/jameson.png","price":19.99,"inStock":true,"sizes":[{"size":"375ml","price":19.99,"inStock":true},{"size":"750ml","price":33.99,"inStock":true},{"size":"1L","price":45.99,"inStock":true},{"size":"1.75ml","price":63.99,"inStock":true}]},
  {"id":6,"name":"Don Julio 1942 Añejo","category":"tequila","description":"Ultra-premium añejo tequila aged for a minimum of 30 months in American white-oak barrels. Exceptionally smooth with notes of vanilla and caramel.","image":"images/donjulio1942.png","price":99.99,"inStock":true,"sizes":[{"size":"375ml","price":99.99,"inStock":true},{"size":"750ml","price":199.99,"inStock":true}]},
  {"id":7,"name":"Patrón Silver","category":"tequila","description":"100% Blue Weber agave tequila with a clean, crisp taste and smooth finish. The perfect premium tequila for any celebration.","image":"images/patron-silver.png","price":28.99,"inStock":true,"sizes":[{"size":"375ml","price":28.99,"inStock":true},{"size":"750ml","price":54.99,"inStock":true},{"size":"1.75ml","price":109.99,"inStock":true}]},
  {"id":8,"name":"Casa Noble Reposado","category":"tequila","description":"Aged for 364 days in French white oak barrels, offering complex vanilla and oak notes. Smooth and sophisticated.","image":"images/casa-noble-repo.png","price":35.99,"inStock":true,"sizes":[{"size":"375ml","price":35.99,"inStock":true},{"size":"750ml","price":59.99,"inStock":true},{"size":"1L","price":71.99,"inStock":true}]},
  {"id":9,"name":"Herradura Silver","category":"tequila","description":"100% blue agave tequila known for its crisp, fresh taste and exceptional smoothness, featuring bright notes of agave, citrus (like lime), herbal hints, and a spicy black pepper finish, making it ideal for sipping neat or in fresh cocktails like Margaritas","image":"images/herradura-silver.png","price":32.99,"inStock":true,"sizes":[{"size":"375ml","price":32.99,"inStock":true},{"size":"750ml","price":54.99,"inStock":true},{"size":"1L","price":65.99,"inStock":true}]},
  {"id":10,"name":"Grey Goose Vodka","category":"vodka","description":"Premium French vodka made from soft winter wheat and pure spring water. Exceptionally smooth and clean.","image":"images/greygoose.png","price":19.99,"inStock":true,"sizes":[{"size":"375ml","price":19.99,"inStock":true},{"size":"750ml","price":35.99,"inStock":true},{"size":"1L","price":43.99,"inStock":true},{"size":"1.75ml","price":67.99,"inStock":true}]},
  {"id":12,"name":"Tito's Handmade Vodka","category":"vodka","description":"Gluten-free vodka made from corn, distilled six times for exceptional smoothness. Crafted in Austin, Texas.","image":"images/titos.png","price":13.99,"inStock":true,"sizes":[{"size":"375ml","price":13.99,"inStock":true},{"size":"750ml","price":21.99,"inStock":true},{"size":"1L","price":28.99,"inStock":true},{"size":"1.75ml","price":35.99,"inStock":true}]},
  {"id":13,"name":"Ketel One Vodka","category":"vodka","description":"Dutch vodka made from 100% wheat, distilled in copper pot stills. Smooth, crisp, and perfectly balanced.","image":"images/kettle-one.png","price":17.99,"inStock":true,"sizes":[{"size":"375ml","price":17.99,"inStock":true},{"size":"750ml","price":29.99,"inStock":true},{"size":"1L","price":37.99,"inStock":true},{"size":"1.75ml","price":49.99,"inStock":true}]},
  {"id":14,"name":"Hendrick's Gin","category":"gin","description":"Scottish gin infused with rose petals and cucumber for a unique flavor profile. Uniquely refreshing and aromatic.","image":"images/hendricks.png","price":23.99,"inStock":true,"sizes":[{"size":"375ml","price":23.99,"inStock":true},{"size":"750ml","price":39.99,"inStock":true},{"size":"1L","price":47.99,"inStock":true}]},
  {"id":15,"name":"Bombay Sapphire","category":"gin","description":"Premium London dry gin with a distinctive blue bottle and complex botanical blend. Perfect for classic cocktails.","image":"images/bombay-saphire.png","price":9.99,"inStock":true,"sizes":[{"size":"375ml","price":9.99,"inStock":true},{"size":"750ml","price":29.99,"inStock":true},{"size":"1.75ml","price":49.99,"inStock":true},{"size":"1L","price":38.99,"inStock":true}]},
  {"id":16,"name":"Tanqueray No. Ten","category":"gin","description":"Premium gin made with whole citrus fruits for a fresh, vibrant taste. Exceptionally smooth and citrus-forward.","image":"images/tanqueray.png","price":20.99,"inStock":true,"sizes":[{"size":"375ml","price":20.99,"inStock":true},{"size":"750ml","price":34.99,"inStock":true},{"size":"1L","price":41.99,"inStock":true}]},
  {"id":17,"name":"Beefeater London Dry Gin","category":"gin","description":"Classic London dry gin with a perfect balance of juniper and citrus. The quintessential gin for any cocktail.","image":"images/beefeater.png","price":14.99,"inStock":true,"sizes":[{"size":"375ml","price":14.99,"inStock":true},{"size":"750ml","price":24.99,"inStock":true},{"size":"1L","price":29.99,"inStock":true}]},
  {"id":18,"name":"Bacardi Superior Rum","category":"rum","description":"White rum with a light, crisp taste perfect for mixing in cocktails. The world's most awarded rum.","image":"images/bacardi-silver.png","price":11.99,"inStock":true,"sizes":[{"size":"375ml","price":11.99,"inStock":true},{"size":"750ml","price":19.99,"inStock":true},{"size":"1L","price":23.99,"inStock":true}]},
  {"id":19,"name":"Captain Morgan Spiced Rum","category":"rum","description":"Smooth spiced rum with notes of vanilla, cinnamon, and nutmeg. Perfect for mixing or sipping.","image":"images/captain-morgan.png","price":13.79,"inStock":true,"sizes":[{"size":"375ml","price":13.79,"inStock":true},{"size":"750ml","price":22.99,"inStock":true},{"size":"1L","price":27.59,"inStock":true}]},
  {"id":20,"name":"Mount Gay Eclipse","category":"rum","description":"Barbados rum with a rich, full-bodied flavor and smooth finish. The oldest rum distillery in the world.","image":"images/mount-gay.png","price":16.79,"inStock":true,"sizes":[{"size":"375ml","price":16.79,"inStock":true},{"size":"750ml","price":27.99,"inStock":true},{"size":"1L","price":33.59,"inStock":true}]},
  {"id":21,"name":"Appleton Estate Reserve","category":"rum","description":"Jamaican rum with complex flavors of tropical fruit and spice. Aged to perfection for a smooth finish.","image":"images/appleton-estates.png","price":19.79,"inStock":true,"sizes":[{"size":"375ml","price":19.79,"inStock":true},{"size":"750ml","price":32.99,"inStock":true},{"size":"1L","price":39.59,"inStock":true}]},
  {"id":22,"name":"White Claw Hard Seltzer Variety Pack","category":"beer-seltzers","description":"Refreshing hard seltzer with natural fruit flavors and only 100 calories. Perfect for any occasion.","image":"images/white-claw.png","price":8.79,"inStock":true,"sizes":[{"size":"6-pack","price":8.79,"inStock":true},{"size":"12-pack","price":15.99,"inStock":true},{"size":"24-pack","price":30.38,"inStock":true}]},
  {"id":23,"name":"Truly Hard Seltzer Variety Pack","category":"beer-seltzers","description":"Hard seltzer with real fruit juice and no artificial sweeteners. Light, refreshing, and delicious.","image":"images/truly.png","price":8.24,"inStock":true,"sizes":[{"size":"6-pack","price":8.24,"inStock":true},{"size":"12-pack","price":14.99,"inStock":true},{"size":"24-pack","price":28.48,"inStock":true}]},
  {"id":24,"name":"Corona Extra","category":"beer-seltzers","description":"Classic Mexican lager with a crisp, refreshing taste. Perfect for any celebration or casual gathering.","image":"images/corona.png","price":7.14,"inStock":true,"sizes":[{"size":"6-pack","price":7.14,"inStock":true},{"size":"12-pack","price":12.99,"inStock":true},{"size":"24-pack","price":24.68,"inStock":true}]},
  {"id":25,"name":"Bud Light","category":"beer-seltzers","description":"Light American lager with a clean, crisp taste. America's favorite light beer.","image":"images/bud-light.png","price":6.59,"inStock":true,"sizes":[{"size":"6-pack","price":6.59,"inStock":true},{"size":"12-pack","price":11.99,"inStock":true},{"size":"24-pack","price":22.78,"inStock":true}]},
  {"id":26,"name":"Heineken","category":"beer-seltzers","description":"Premium Dutch lager with a distinctive taste and aroma. Brewed with the finest ingredients.","image":"images/heineken.png","price":7.69,"inStock":true,"sizes":[{"size":"6-pack","price":7.69,"inStock":true},{"size":"12-pack","price":13.99,"inStock":true},{"size":"24-pack","price":26.58,"inStock":true}]},
  {"id":27,"name":"Stella Artois","category":"beer-seltzers","description":"Belgian lager with a crisp, refreshing taste and golden color. A premium European beer experience.","image":"images/stella-artois.png","price":8.24,"inStock":true,"sizes":[{"size":"6-pack","price":8.24,"inStock":true},{"size":"12-pack","price":14.99,"inStock":true},{"size":"24-pack","price":28.48,"inStock":true}]},
  {"id":29,"name":"Milagro Silver","category":"tequila","description":"100% blue agave tequila known for its crisp, fresh taste and exceptional smoothness, featuring bright notes of agave, citrus (like lime), herbal hints, and a spicy black pepper finish, making it ideal for sipping neat or in fresh cocktails like Margaritas","image":"images/milagro.png","price":34.99,"inStock":true,"sizes":[{"size":"750ml","price":34.99,"inStock":true}]}
];
        for (const p of seedProducts) {
            await db.products.createWithId(p);
        }
        await db.pool.query("SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products))");
        console.log('✅ All 25 products seeded!');
    } else {
        console.log(`✅ Found ${productCount} existing products`);
    }

    // Seed default settings if empty
    const existingSettings = await db.settings.get();
    if (!existingSettings) {
        await db.settings.set({
            deliveryFee: 7.99, deliveryBaseFee: 3.00, deliveryPerMileRate: 1.50,
            maxDeliveryRadius: 10, minimumOrder: 25.00, taxRate: 0.0825,
            processingFeeRate: 0.029, processingFeeFixed: 0.30,
            businessHours: {
                monday: { open: "10:00", close: "20:30", enabled: true },
                tuesday: { open: "10:00", close: "20:30", enabled: true },
                wednesday: { open: "10:00", close: "20:30", enabled: true },
                thursday: { open: "10:00", close: "20:30", enabled: true },
                friday: { open: "10:00", close: "20:30", enabled: true },
                saturday: { open: "10:00", close: "20:30", enabled: true },
                sunday: { open: "00:00", close: "00:00", enabled: false }
            },
            deliveryZones: [
                { name: "Zone 1", zipCodes: ["78240", "78249", "78254"], deliveryFee: 7.99, enabled: true },
                { name: "Zone 2", zipCodes: ["78230", "78231", "78232"], deliveryFee: 9.99, enabled: true }
            ],
            autoCancel: { enabled: false, timeoutMinutes: 30 },
            notifications: { smsEnabled: true, emailEnabled: true }
        });
        console.log('✅ Default settings created');
    }

    // Ensure admin users exist
    for (const email of adminEmails) {
        const lower = email.toLowerCase();
        let user = await db.users.getByEmail(lower);
        if (!user) {
            await db.users.create({
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: "Admin", email: lower, phone: '',
                firebaseUid: null, isFirebaseUser: true,
                password: null, role: "admin", status: "active",
                joinDate: new Date().toISOString(), cart: []
            });
            console.log('✅ Added admin user:', lower);
        } else if (user.role !== 'admin') {
            await db.users.update(user.id, { role: 'admin', status: 'active' });
            console.log('✅ Confirmed admin privileges for:', lower);
        }
    }
}

// Cart helpers: sanitize and merge cart items
function sanitizeCartItems(items) {
    if (!Array.isArray(items)) return [];
    return items.reduce((acc, raw) => {
        const productId = parseInt(raw.productId);
        const quantity = parseInt(raw.quantity);
        const size = raw.size ?? null;
        if (!productId || !Number.isFinite(quantity) || quantity <= 0) return acc;
        const idx = acc.findIndex(i => i.productId === productId && i.size === size);
        if (idx !== -1) {
            acc[idx].quantity += quantity;
        } else {
            acc.push({ productId, quantity, size });
        }
        return acc;
    }, []);
}
function mergeCarts(existing, incoming) {
    return sanitizeCartItems([...(existing || []), ...(incoming || [])]);
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Admin middleware
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ==================== AUTHENTICATION ROUTES ====================

// Register
app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        const existing = await db.users.getByEmail(email);
        if (existing) {
            return res.status(400).json({ error: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const clientCart = Array.isArray(req.body.cart) ? req.body.cart : [];
        const newUser = await db.users.create({
            id: Date.now(),
            name,
            email,
            phone,
            password: hashedPassword,
            role: "customer",
            status: "active",
            joinDate: new Date().toISOString(),
            cart: sanitizeCartItems(clientCart)
        });

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );

        res.json({
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                role: newUser.role,
                cart: newUser.cart
            },
            token
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});

// Firebase user registration/sync
app.post("/api/auth/firebase-register", async (req, res) => {
    try {
        const { name, email, phone, firebaseUid, isFirebaseUser } = req.body;

        if (!email || !firebaseUid) {
            return res.status(400).json({ error: "Email and Firebase UID are required" });
        }

        let user = await db.users.getByEmail(email);

        if (user) {
            if (!user.firebaseUid) {
                user = await db.users.update(user.id, { firebaseUid, isFirebaseUser: true });
            }
        } else {
            user = await db.users.create({
                id: Date.now(),
                name: name || email.split('@')[0],
                email,
                phone: phone || '',
                firebaseUid,
                isFirebaseUser: true,
                password: null,
                role: "customer",
                status: "active",
                joinDate: new Date().toISOString(),
                cart: []
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                cart: user.cart || []
            },
            token
        });
    } catch (error) {
        console.error("Firebase registration error:", error);
        res.status(500).json({ error: "Firebase registration failed: " + error.message });
    }
});

// Login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await db.users.getByEmail(email);

        if (!user) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        if (!user.password) {
            return res.status(401).json({ error: "This account uses Google Sign-In. Please use the Google button to log in." });
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        if (user.status === 'disabled') {
            return res.status(403).json({ error: "Your account has been disabled. Please contact support." });
        }
        if (user.status === 'banned') {
            return res.status(403).json({ error: "Your account has been banned. Please contact support." });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                cart: user.cart || []
            },
            token
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
    }
});

// Request password reset (local accounts)
app.post("/api/auth/request-password-reset", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await db.users.getByEmail(email);

        // For security, always return success, but only generate token if user exists
        let resetUrl = null;
        if (user) {
            const token = crypto.randomBytes(32).toString("hex");
            const expiresAt = Date.now() + 1000 * 60 * 30; // 30 minutes
            await db.users.update(user.id, { resetToken: { token, expiresAt } });
            resetUrl = `${getSiteUrl(req)}/reset-password.html?token=${token}`;
            console.log(`Password reset requested for ${email}. Reset URL: ${resetUrl}`);

            // Send email via SMTP if configured
            if (mailer) {
                const from = process.env.SMTP_FROM || `Fiesta Liquor <${process.env.SMTP_USER}>`;
                const subject = 'Reset your Fiesta Liquor password';
                const html = `
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#222;">
                        <h2>Reset your password</h2>
                        <p>We received a request to reset your password. Click the button below to continue.</p>
                        <p style="margin:24px 0;">
                          <a href="${resetUrl}" style="background:#1a1a2e;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Reset Password</a>
                        </p>
                        <p>If the button doesn't work, copy and paste this link into your browser:</p>
                        <p><a href="${resetUrl}">${resetUrl}</a></p>
                        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
                        <p style="font-size:12px;color:#666;">This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
                    </div>
                `;
                try {
                    await mailer.sendMail({ from, to: email, subject, html });
                    console.log(`Reset email sent to ${email}`);
                } catch (sendErr) {
                    console.error('Failed to send reset email:', sendErr);
                }
            }
        }

        // In production, send email with resetUrl here
        return res.json({ success: true, resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined });
    } catch (error) {
        console.error("Request reset error:", error);
        res.status(500).json({ error: "Failed to request password reset" });
    }
});

// Perform password reset (local accounts)
app.post("/api/auth/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: "Token and new password are required" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        // Find user with this reset token
        const { rows } = await db.pool.query(
            "SELECT * FROM users WHERE reset_token->>'token' = $1", [token]
        );
        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        const user = rows[0];
        const expiresAt = user.reset_token.expiresAt;
        if (Date.now() > expiresAt) {
            await db.users.update(Number(user.id), { resetToken: null });
            return res.status(400).json({ error: "Reset token expired" });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await db.users.update(Number(user.id), { password: hashed, resetToken: null });

        return res.json({ success: true });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ error: "Failed to reset password" });
    }
});

// Get current user
app.get("/api/auth/me", authenticateToken, async (req, res) => {
    const user = await db.users.getById(req.user.id);

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        cart: user.cart || []
    });
});

// ==================== CART ROUTES (sync) ====================

// Sync cart to server
app.post("/api/cart/sync", authenticateToken, async (req, res) => {
    try {
        const { cart } = req.body;

        if (!Array.isArray(cart)) {
            return res.status(400).json({ error: "Cart must be an array" });
        }

        const sanitized = sanitizeCartItems(cart);
        const user = await db.users.update(req.user.id, { cart: sanitized });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            success: true,
            cart: user.cart,
            message: "Cart synced successfully"
        });
    } catch (error) {
        console.error("Cart sync error:", error);
        res.status(500).json({ error: "Failed to sync cart" });
    }
});

// ==================== PRODUCT ROUTES ====================

// Get all products
app.get("/api/products", async (req, res) => {
    try {
        const products = await db.products.getAll();
        res.json(products);
    } catch (error) {
        console.error("Get products error:", error);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

// Get product by ID
app.get("/api/products/:id", async (req, res) => {
    try {
        const product = await db.products.getById(parseInt(req.params.id));

        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        res.json(product);
    } catch (error) {
        console.error("Get product error:", error);
        res.status(500).json({ error: "Failed to fetch product" });
    }
});

// Create product (Admin only)
app.post("/api/products", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, category, description, image, price, sizes, inStock, barcode } = req.body;

        if (!name || !category || !description) {
            return res.status(400).json({ error: "Name, category, and description are required" });
        }

        const newProduct = await db.products.create({
            name, category, description,
            image: image || "images/product_placeholder.svg",
            price: price || 0,
            sizes: sizes || [],
            inStock: inStock !== undefined ? inStock : true,
            barcode: barcode || null
        });

        res.status(201).json(newProduct);
    } catch (error) {
        console.error("Create product error:", error);
        res.status(500).json({ error: "Failed to create product" });
    }
});

// Update product (Admin only)
app.put("/api/products/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const updated = await db.products.update(parseInt(req.params.id), req.body);

        if (!updated) {
            return res.status(404).json({ error: "Product not found" });
        }

        res.json(updated);
    } catch (error) {
        console.error("Update product error:", error);
        res.status(500).json({ error: "Failed to update product" });
    }
});

// Delete product (Admin only)
app.delete("/api/products/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const deleted = await db.products.delete(parseInt(req.params.id));

        if (!deleted) {
            return res.status(404).json({ error: "Product not found" });
        }

        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error("Delete product error:", error);
        res.status(500).json({ error: "Failed to delete product" });
    }
});

// ==================== ORDER ROUTES ====================

// Get all orders (Admin only) or user's orders
app.get("/api/orders", authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'admin') {
            const allOrders = await db.orders.getAll();
            res.json(allOrders);
        } else {
            // Look up orders by both email match AND user_orders join table
            const [byEmail, byLink] = await Promise.all([
                db.orders.getByEmail(req.user.email),
                db.orders.getByUserId(req.user.id)
            ]);
            // Merge and deduplicate by order ID
            const seen = new Set();
            const merged = [];
            for (const o of [...byEmail, ...byLink]) {
                if (!seen.has(o.id)) {
                    seen.add(o.id);
                    merged.push(o);
                }
            }
            merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            res.json(merged);
        }
    } catch (error) {
        console.error("Get orders error:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

// Get order by ID
app.get("/api/orders/:id", authenticateToken, async (req, res) => {
    try {
        const order = await db.orders.getById(parseInt(req.params.id));

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (req.user.role !== 'admin' && order.customer.email !== req.user.email) {
            return res.status(403).json({ error: "Access denied" });
        }

        res.json(order);
    } catch (error) {
        console.error("Get order error:", error);
        res.status(500).json({ error: "Failed to fetch order" });
    }
});

// Helper: check if store is currently open for orders
function isStoreOpen() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const hour = now.getHours();
    const minutes = now.getMinutes();
    
    // Closed on Sunday (0)
    if (dayOfWeek === 0) {
        return false;
    }
    
    // Monday-Saturday: open 10am to 8:30pm
    const openHour = 10;
    const closeHour = 20;
    const closeMinutes = 30;
    
    // Before 10am
    if (hour < openHour) {
        return false;
    }
    
    // After 8:30pm
    if (hour > closeHour || (hour === closeHour && minutes >= closeMinutes)) {
        return false;
    }
    
    return true;
}

// Create order
app.post("/api/orders", authenticateToken, async (req, res) => {
    try {
        const { items, customer, orderType, paymentMethod, deliveryTimeEstimate, stripeSessionId, stripeTotal } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "Order must contain at least one item" });
        }

        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const orderSettings = await db.settings.get() || {};
        const deliveryFee = orderType === 'delivery' ? (orderSettings.deliveryFee ?? 7.99) : 0;
        const subtotalWithFee = subtotal + deliveryFee;
        const orderTaxRate = orderSettings.taxRate ?? 0.0825;
        const tax = parseFloat((subtotalWithFee * orderTaxRate).toFixed(2));
        const amountBeforeFee = subtotalWithFee + tax;
        const stripeFee = calculateUpfrontProcessingFee(amountBeforeFee);
        const total = parseFloat((amountBeforeFee + stripeFee).toFixed(2));

        const newOrder = await db.orders.create({
            customer: { ...customer, email: req.user.email },
            items,
            subtotal,
            deliveryFee,
            tax,
            stripeFee,
            total: stripeTotal || total,
            stripeTotal: stripeTotal || null,
            stripeSessionId: stripeSessionId || null,
            orderType: orderType || 'pickup',
            storeLocation: req.body.storeLocation || null,
            paymentMethod: paymentMethod || 'card',
            deliveryTimeEstimate: orderType === 'delivery' ? deliveryTimeEstimate : null,
            orderDate: new Date().toISOString(),
            status: 'pending'
        });

        // Link order to user
        await db.userOrders.link(req.user.id, newOrder.id);

        res.status(201).json(newOrder);

        // Send notifications (non-blocking)
        sendOrderSms(newOrder).catch(err => console.error('Owner SMS notify error:', err));
        sendCustomerOrderEmail(newOrder).catch(err => console.error('Customer email notify error:', err));
        sendCustomerOrderSms(newOrder).catch(err => console.error('Customer SMS notify error:', err));
    } catch (error) {
        console.error("Create order error:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

// Update order status (Admin only)
app.put("/api/orders/:id/status", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, notes } = req.body;
        const validStatuses = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'needs_substitution'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status. Valid options: pending, accepted, preparing, ready, out_for_delivery, delivered, completed, cancelled, needs_substitution" });
        }

        const order = await db.orders.getById(parseInt(req.params.id));
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const previousStatus = order.status;
        const statusHistory = order.statusHistory || [];
        statusHistory.push({
            from: previousStatus, to: status,
            changedBy: req.user.email,
            changedAt: new Date().toISOString(),
            notes: notes || null
        });

        const adminNotes = order.adminNotes || [];
        if (notes) {
            adminNotes.push({
                note: notes, addedBy: req.user.email,
                addedAt: new Date().toISOString(), status
            });
        }

        const updated = await db.orders.update(order.id, {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email,
            statusHistory,
            adminNotes
        });

        if (status === 'out_for_delivery' || status === 'ready' || status === 'needs_substitution') {
            sendCustomerOrderSms({
                ...updated,
                statusMessage: status === 'out_for_delivery' ? 'Your order is out for delivery!' :
                    status === 'ready' ? 'Your order is ready for pickup!' :
                    'An item in your order needs a substitution. We will call you shortly.'
            }).catch(err => console.error('Customer SMS notify error:', err));
        }

        res.json(updated);
    } catch (error) {
        console.error("Update order status error:", error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

// Cancel order (User can cancel if not yet delivered)
app.post("/api/orders/:id/cancel", authenticateToken, async (req, res) => {
    try {
        const order = await db.orders.getById(parseInt(req.params.id));
        if (!order) return res.status(404).json({ error: "Order not found" });

        if (order.customer.email !== req.user.email) {
            return res.status(403).json({ error: "You can only cancel your own orders" });
        }
        if (order.status === 'delivered') return res.status(400).json({ error: "Cannot cancel delivered orders. No refunds or returns after delivery." });
        if (order.status === 'completed') return res.status(400).json({ error: "Order has been completed and cannot be cancelled." });
        if (order.status === 'cancelled') return res.status(400).json({ error: "This order has already been cancelled." });

        const cancellationFee = parseFloat((order.subtotal * 0.10).toFixed(2));
        const refundAmount = parseFloat((order.subtotal - cancellationFee).toFixed(2));

        const updated = await db.orders.update(order.id, {
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
            cancelledBy: 'customer',
            cancelledAt: new Date().toISOString(),
            cancellationFee,
            refundAmount
        });

        res.json({ success: true, message: "Order cancelled successfully", order: updated, cancellationFee, refundAmount });
    } catch (error) {
        console.error("Cancel order error:", error);
        res.status(500).json({ error: "Failed to cancel order: " + error.message });
    }
});

// Customer confirms they received the order (pickup or delivery)
app.post("/api/orders/:id/confirm-received", authenticateToken, async (req, res) => {
    try {
        const order = await db.orders.getById(parseInt(req.params.id));
        if (!order) return res.status(404).json({ error: "Order not found" });

        if (order.customer.email !== req.user.email) {
            return res.status(403).json({ error: "You can only confirm your own orders" });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: "Cannot confirm a cancelled order" });
        }

        const updated = await db.orders.update(order.id, {
            customerConfirmed: true,
            customerConfirmedAt: new Date().toISOString()
        });

        res.json({ success: true, message: "Order confirmed as received", order: updated });
    } catch (error) {
        console.error("Confirm received error:", error);
        res.status(500).json({ error: "Failed to confirm order as received: " + error.message });
    }
});

// Admin: Issue refund
app.post("/api/admin/orders/:id/refund", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { amount, reason, type } = req.body;

        const order = await db.orders.getById(parseInt(req.params.id));
        if (!order) return res.status(404).json({ error: "Order not found" });

        const maxRefund = order.total || 0;
        let refundAmount = type === 'full' ? maxRefund : parseFloat(amount);

        if (refundAmount > maxRefund) return res.status(400).json({ error: "Refund amount cannot exceed order total" });
        if (refundAmount <= 0) return res.status(400).json({ error: "Refund amount must be greater than 0" });

        const refund = {
            id: Date.now(),
            amount: parseFloat(refundAmount.toFixed(2)),
            type: type || 'partial',
            reason: reason || 'No reason provided',
            issuedBy: req.user.email,
            issuedAt: new Date().toISOString(),
            status: 'completed'
        };

        const refunds = [...(order.refunds || []), refund];
        const updated = await db.orders.update(order.id, {
            refunds,
            refundedAmount: (order.refundedAmount || 0) + refund.amount,
            status: type === 'full' ? 'cancelled' : order.status,
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `${type === 'full' ? 'Full' : 'Partial'} refund of $${refund.amount.toFixed(2)} issued successfully`,
            refund,
            order: updated
        });
    } catch (error) {
        console.error("Issue refund error:", error);
        res.status(500).json({ error: "Failed to issue refund" });
    }
});

// ==================== USER ROUTES ====================

// Get all users (Admin only)
app.get("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allUsers = await db.users.getAll();
        const usersWithOrders = [];
        for (const u of allUsers) {
            const orderIds = await db.userOrders.getOrderIds(u.id);
            usersWithOrders.push({
                id: u.id, name: u.name, email: u.email, phone: u.phone,
                role: u.role, status: u.status || 'active', joinDate: u.joinDate,
                orders: orderIds
            });
        }
        res.json(usersWithOrders);
    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Admin: Ban/Disable user
app.put("/api/admin/users/:id/status", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['active', 'disabled', 'banned'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status. Use: active, disabled, or banned" });
        }

        const userId = parseInt(req.params.id);
        if (userId === req.user.id) {
            return res.status(400).json({ error: "Cannot change your own status" });
        }

        const updated = await db.users.update(userId, {
            status,
            statusUpdatedAt: new Date().toISOString(),
            statusUpdatedBy: req.user.email
        });

        if (!updated) return res.status(404).json({ error: "User not found" });

        res.json({
            message: `User ${status} successfully`,
            user: { id: updated.id, name: updated.name, email: updated.email, status: updated.status }
        });
    } catch (error) {
        console.error("Update user status error:", error);
        res.status(500).json({ error: "Failed to update user status" });
    }
});

// Admin: Update user role
app.put("/api/admin/users/:id/role", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['admin', 'customer'].includes(role)) {
            return res.status(400).json({ error: "Invalid role. Use: admin or customer" });
        }

        const userId = parseInt(req.params.id);
        const user = await db.users.getById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        if (role === 'customer' && user.role === 'admin') {
            const adminCount = await db.users.countAdmins();
            if (adminCount <= 1) {
                return res.status(400).json({ error: "Cannot remove the last admin user" });
            }
        }

        const updated = await db.users.update(userId, {
            role,
            roleUpdatedAt: new Date().toISOString(),
            roleUpdatedBy: req.user.email
        });

        res.json({
            message: `User role updated to ${role} successfully`,
            user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role }
        });
    } catch (error) {
        console.error("Update user role error:", error);
        res.status(500).json({ error: "Failed to update user role" });
    }
});

// Admin: Get user details with order history
app.get("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const user = await db.users.getById(parseInt(req.params.id));
        if (!user) return res.status(404).json({ error: "User not found" });

        const userOrders = await db.orders.getByEmail(user.email);
        const totalSpent = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const cancelledOrders = userOrders.filter(o => o.status === 'cancelled').length;

        res.json({
            id: user.id, name: user.name, email: user.email, phone: user.phone,
            role: user.role, status: user.status || 'active', joinDate: user.joinDate,
            stats: {
                totalOrders: userOrders.length, totalSpent, cancelledOrders,
                averageOrderValue: userOrders.length > 0 ? totalSpent / userOrders.length : 0
            },
            recentOrders: userOrders.slice(-10).reverse()
        });
    } catch (error) {
        console.error("Get user details error:", error);
        res.status(500).json({ error: "Failed to fetch user details" });
    }
});

// Admin: Delete user account
app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (userId === req.user.id) {
            return res.status(400).json({ error: "Cannot delete your own account" });
        }

        const deleted = await db.users.delete(userId);
        if (!deleted) return res.status(404).json({ error: "User not found" });

        res.json({
            message: "User deleted successfully",
            deletedUser: { id: deleted.id, email: deleted.email, name: deleted.name }
        });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// Update user profile
app.put("/api/users/profile", authenticateToken, async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        const updates = {};

        if (name) updates.name = name;
        if (phone) updates.phone = phone;
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: "Password must be at least 6 characters" });
            }
            updates.password = await bcrypt.hash(password, 10);
        }

        const updated = await db.users.update(req.user.id, updates);
        if (!updated) return res.status(404).json({ error: "User not found" });

        res.json({
            id: updated.id, name: updated.name, email: updated.email,
            phone: updated.phone, role: updated.role
        });
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: "Failed to update profile" });
    }
});

// ==================== STRIPE PROCESSING FEES ====================

/**
 * Calculate Stripe processing fee based on card type and transaction details
 * Base rates:
 * - Domestic cards: 2.9% + $0.30
 * - Manually entered cards: +0.5% (3.4% + $0.30)
 * - International cards: +1.5% (4.4% + $0.30)
 * - Currency conversion: +1% (additional)
 * 
 * Since we can't determine card type before payment, we charge base domestic rate upfront
 * Actual fees are captured via webhook and can be adjusted if needed
 */
function calculateProcessingFee(amount, cardType = 'domestic', isManualEntry = false, requiresCurrencyConversion = false) {
    let baseRate = 0.029; // 2.9% for domestic cards
    
    // Add additional fees based on card type
    if (cardType === 'international') {
        baseRate += 0.015; // +1.5% for international cards (total 4.4%)
    }
    
    // Add fee for manually entered cards
    if (isManualEntry) {
        baseRate += 0.005; // +0.5% for manual entry
    }
    
    // Add fee for currency conversion
    if (requiresCurrencyConversion) {
        baseRate += 0.01; // +1% for currency conversion
    }
    
    // Calculate fee: (amount * rate) + $0.30
    const fee = parseFloat((amount * baseRate + 0.30).toFixed(2));
    return fee;
}

/**
 * Calculate processing fee for upfront charge (before we know card type)
 * We use domestic card rate as base, which covers most transactions
 * 
 * IMPORTANT: Stripe charges their fee on the TOTAL amount (including our fee),
 * so we need to calculate the fee in a way that accounts for this.
 * 
 * Formula: If Stripe charges (Total * 0.029 + 0.30), and Total = Amount + Fee,
 * then: Fee = ((Amount + 0.30) / (1 - 0.029)) - Amount
 */
function calculateUpfrontProcessingFee(amount) {
    // Stripe charges: (Total * 0.029) + 0.30
    // Where Total = Amount + Fee
    // Solving: Fee = ((Amount + 0.30) / (1 - 0.029)) - Amount
    const totalWithFee = (amount + 0.30) / (1 - 0.029);
    const fee = totalWithFee - amount;
    return parseFloat(fee.toFixed(2));
}

// ==================== STRIPE CHECKOUT ====================

// Get Stripe session details (for retrieving total after payment)
app.get('/get-stripe-session', authenticateToken, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({
      id: session.id,
      amount_total: session.amount_total,
      customer_email: session.customer_email,
      payment_status: session.payment_status
    });
  } catch (error) {
    console.error('Error retrieving Stripe session:', error);
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});

// Confirm order exists after payment — fallback if webhook is delayed/missing
app.post('/api/confirm-order', authenticateToken, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Check if order already exists (webhook may have created it)
    const existing = await db.orders.getByStripeSession(session_id);
    if (existing) {
      return res.json({ order: existing, created: false });
    }

    // Retrieve session from Stripe to verify payment
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const stripeTotal = session.amount_total / 100;
    const customerEmail = session.customer_email;
    const meta = session.metadata || {};

    // Reconstruct cart items from metadata
    let cartItems = [];
    if (meta.cartItems) {
      try { cartItems = JSON.parse(meta.cartItems); } catch (e) { /* ignore */ }
    } else {
      let combined = '';
      for (let i = 0; ; i++) {
        const chunk = meta['cartItems_' + i];
        if (!chunk) break;
        combined += chunk;
      }
      if (combined) {
        try { cartItems = JSON.parse(combined); } catch (e) { /* ignore */ }
      }
    }

    const items = cartItems.map(ci => ({
      id: ci.id, productId: ci.id, name: ci.n, price: ci.p,
      quantity: ci.q, category: ci.c || '', image: ci.img || '',
      selectedSize: ci.sz || null
    }));

    const orderType = meta.orderType || 'pickup';
    const customer = {
      firstName: meta.customerFirstName || '',
      lastName: meta.customerLastName || '',
      email: customerEmail || meta.customerEmail || '',
      phone: meta.customerPhone || '',
      address: orderType === 'delivery' ? {
        street: meta.deliveryStreet || '', apartment: meta.deliveryApt || null,
        city: meta.deliveryCity || '', state: meta.deliveryState || '',
        zipCode: meta.deliveryZip || '', fullAddress: meta.deliveryAddress || ''
      } : 'Store Pickup'
    };

    const currentSettings = await db.settings.get() || {};
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    let deliveryFee = 0;
    if (orderType === 'delivery') {
      const deliveryDistance = parseFloat(meta.deliveryDistance) || 0;
      const baseFee = currentSettings.deliveryBaseFee ?? 3.00;
      const perMile = currentSettings.deliveryPerMileRate ?? 1.50;
      deliveryFee = deliveryDistance > 0
        ? parseFloat((baseFee + deliveryDistance * perMile).toFixed(2))
        : (currentSettings.deliveryFee ?? 7.99);
    }

    const taxRate = currentSettings.taxRate ?? 0.0825;
    const promoDiscount = parseFloat(meta.promoDiscount) || 0;
    const discountedSubtotal = Math.max(0, subtotal - promoDiscount);
    const subtotalWithFee = discountedSubtotal + deliveryFee;
    const tax = parseFloat((subtotalWithFee * taxRate).toFixed(2));
    const amountBeforeFee = subtotalWithFee + tax;
    const stripeFee = calculateUpfrontProcessingFee(amountBeforeFee);

    const newOrder = await db.orders.create({
      customer, items, subtotal, deliveryFee, tax, stripeFee,
      total: stripeTotal, stripeTotal, stripeSessionId: session.id,
      orderType,
      storeLocation: { name: meta.storeName || '', address: meta.storeAddress || '' },
      paymentMethod: 'card',
      deliveryTimeEstimate: orderType === 'delivery' && meta.deliveryTimeEstimate
        ? parseInt(meta.deliveryTimeEstimate) : null,
      promo: meta.promoCode ? { code: meta.promoCode, discount: promoDiscount } : null,
      orderDate: new Date().toISOString(),
      status: 'pending',
      paymentConfirmed: true
    });

    console.log(`✅ Order #${newOrder.id} created via confirm-order fallback (session: ${session.id})`);

    // Link to user
    try {
      const user = await db.users.getByEmail(customerEmail || req.user.email);
      if (user) await db.userOrders.link(user.id, newOrder.id);
    } catch (userErr) {
      console.error('Error linking user to order:', userErr.message);
    }

    // Send notifications
    sendOrderSms(newOrder).catch(err => console.error('Owner SMS error:', err));
    sendCustomerOrderEmail(newOrder).catch(err => console.error('Customer email error:', err));
    sendCustomerOrderSms(newOrder).catch(err => console.error('Customer SMS error:', err));

    res.json({ order: newOrder, created: true });
  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({ error: 'Failed to confirm order' });
  }
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items, successUrl, cancelUrl, orderMetadata } = req.body || {};

    console.log('📦 create-checkout-session request body keys:', Object.keys(req.body || {}));
    console.log('  items count:', items ? items.length : 0);
    console.log('  has orderMetadata:', !!orderMetadata);
    if (orderMetadata) {
      console.log('  metadata keys:', Object.keys(orderMetadata));
      console.log('  customerEmail:', orderMetadata.customerEmail);
      console.log('  orderType:', orderMetadata.orderType);
    }

    // Use redirect URLs from frontend if provided, otherwise use SITE_URL env var
    const success_url = successUrl || `${process.env.SITE_URL || `${req.protocol}://${req.get('host')}`}/success.html`;
    const cancel_url = cancelUrl || `${process.env.SITE_URL || `${req.protocol}://${req.get('host')}`}/checkout.html`;

    // Build Stripe session config
    const sessionConfig = {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: items.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.name
                },
                unit_amount: Math.round(item.price * 100)
            },
            quantity: item.quantity
        })),
        success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url
    };

    // Attach order metadata so the webhook can create the order
    // after payment succeeds. Stripe metadata values must be strings.
    if (orderMetadata && typeof orderMetadata === 'object') {
        sessionConfig.metadata = {};
        for (const [key, val] of Object.entries(orderMetadata)) {
            // Stripe allows max 500 chars per metadata value
            sessionConfig.metadata[key] = String(val || '').slice(0, 500);
        }
        // Also set customer_email so the webhook can match the user
        if (orderMetadata.customerEmail) {
            sessionConfig.customer_email = orderMetadata.customerEmail;
        }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Stripe checkout failed' });
  }
});

// ==================== STRIPE WEBHOOK ====================
// This endpoint captures actual Stripe fees after payment is processed
// Allows us to see the real processing fees charged by Stripe

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('📥 Stripe webhook received at:', new Date().toISOString());
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!webhookSecret) {
      console.log('⚠️ Stripe webhook secret not configured. Skipping webhook verification.');
      // In development, you might want to parse without verification
      try {
        event = JSON.parse(req.body);
      } catch (parseError) {
        console.error('❌ Failed to parse webhook body:', parseError.message);
        // Return 200 to acknowledge receipt even if parsing fails
        return res.status(200).json({ received: true, error: 'Failed to parse webhook' });
      }
    } else {
      if (!sig) {
        console.error('❌ Missing stripe-signature header');
        return res.status(200).json({ received: true, error: 'Missing signature' });
      }
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        // Return 200 to acknowledge receipt (Stripe will retry if needed)
        // But log the error for debugging
        return res.status(200).json({ received: true, error: 'Signature verification failed', message: err.message });
      }
    }
  } catch (err) {
    console.error('❌ Unexpected webhook error:', err.message);
    // Always return 200 to acknowledge receipt
    return res.status(200).json({ received: true, error: 'Unexpected error', message: err.message });
  }

  // Handle the event - wrap in try-catch to ensure we always return 200
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        const stripeTotal = session.amount_total / 100; // Convert from cents to dollars
        const customerEmail = session.customer_email;
        const meta = session.metadata || {};

        console.log('✅ Payment successful:', {
          sessionId: session.id,
          amountTotal: stripeTotal,
          customerEmail: customerEmail,
          hasMetadata: Object.keys(meta).length > 0
        });

        // ── Create order from metadata (post-payment) ─────────
        try {
          // Idempotency check
          const existingOrder = await db.orders.getByStripeSession(session.id);
          if (existingOrder) {
            console.log(`⚠️ Order #${existingOrder.id} already exists for session ${session.id}, skipping.`);
            break;
          }

          // Reconstruct cart items from metadata
          let cartItems = [];
          if (meta.cartItems) {
            try { cartItems = JSON.parse(meta.cartItems); } catch (e) { /* ignore */ }
          } else {
            let combined = '';
            for (let i = 0; ; i++) {
              const chunk = meta['cartItems_' + i];
              if (!chunk) break;
              combined += chunk;
            }
            if (combined) {
              try { cartItems = JSON.parse(combined); } catch (e) { /* ignore */ }
            }
          }

          const items = cartItems.map(ci => ({
            id: ci.id, productId: ci.id, name: ci.n, price: ci.p,
            quantity: ci.q, category: ci.c || '', image: ci.img || '',
            selectedSize: ci.sz || null
          }));

          const orderType = meta.orderType || 'pickup';
          const customer = {
            firstName: meta.customerFirstName || '',
            lastName: meta.customerLastName || '',
            email: customerEmail || meta.customerEmail || '',
            phone: meta.customerPhone || '',
            address: orderType === 'delivery' ? {
              street: meta.deliveryStreet || '', apartment: meta.deliveryApt || null,
              city: meta.deliveryCity || '', state: meta.deliveryState || '',
              zipCode: meta.deliveryZip || '', fullAddress: meta.deliveryAddress || ''
            } : 'Store Pickup'
          };

          const currentSettings = await db.settings.get() || {};
          const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

          let deliveryFee = 0;
          if (orderType === 'delivery') {
            const deliveryDistance = parseFloat(meta.deliveryDistance) || 0;
            const baseFee = currentSettings.deliveryBaseFee ?? 3.00;
            const perMile = currentSettings.deliveryPerMileRate ?? 1.50;
            deliveryFee = deliveryDistance > 0
              ? parseFloat((baseFee + deliveryDistance * perMile).toFixed(2))
              : (currentSettings.deliveryFee ?? 7.99);
          }

          const taxRate = currentSettings.taxRate ?? 0.0825;
          const promoDiscount = parseFloat(meta.promoDiscount) || 0;
          const discountedSubtotal = Math.max(0, subtotal - promoDiscount);
          const subtotalWithFee = discountedSubtotal + deliveryFee;
          const tax = parseFloat((subtotalWithFee * taxRate).toFixed(2));
          const amountBeforeFee = subtotalWithFee + tax;
          const stripeFee = calculateUpfrontProcessingFee(amountBeforeFee);

          const newOrder = await db.orders.create({
            customer, items, subtotal, deliveryFee, tax, stripeFee,
            total: stripeTotal, stripeTotal, stripeSessionId: session.id,
            orderType,
            storeLocation: { name: meta.storeName || '', address: meta.storeAddress || '' },
            paymentMethod: 'card',
            deliveryTimeEstimate: orderType === 'delivery' && meta.deliveryTimeEstimate
              ? parseInt(meta.deliveryTimeEstimate) : null,
            promo: meta.promoCode ? { code: meta.promoCode, discount: promoDiscount } : null,
            orderDate: new Date().toISOString(),
            status: 'pending',
            paymentConfirmed: true
          });

          console.log(`✅ Order #${newOrder.id} created after payment confirmation (Stripe session: ${session.id})`);

          // Link to user
          try {
            const user = await db.users.getByEmail(customerEmail);
            if (user) await db.userOrders.link(user.id, newOrder.id);
          } catch (userErr) {
            console.error('Error linking user to order:', userErr.message);
          }

          // Send notifications (non-blocking)
          sendOrderSms(newOrder).catch(err => console.error('Owner SMS notify error:', err));
          sendCustomerOrderEmail(newOrder).catch(err => console.error('Customer email notify error:', err));
          sendCustomerOrderSms(newOrder).catch(err => console.error('Customer SMS notify error:', err));

        } catch (error) {
          console.error('Error creating order from webhook:', error);
        }
        
        // Retrieve payment intent to get actual Stripe fees
        if (session.payment_intent) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
            const charges = await stripe.charges.list({ payment_intent: session.payment_intent });
            
            if (charges.data.length > 0) {
              const charge = charges.data[0];
              const balanceTransaction = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
              
              // Log actual Stripe fees
              const stripeFee = balanceTransaction.fee / 100; // Convert from cents
              const netAmount = balanceTransaction.net / 100; // Convert from cents
              const cardType = charge.card?.country !== 'US' ? 'international' : 'domestic';
              const isManualEntry = charge.payment_method_details?.card?.three_d_secure?.authenticated === false;
              
              console.log('💰 Actual Stripe fees:', {
                grossAmount: stripeTotal,
                stripeFee: stripeFee,
                netAmount: netAmount,
                cardType: cardType,
                isManualEntry: isManualEntry,
                cardCountry: charge.card?.country,
                currency: charge.currency
              });
            }
          } catch (error) {
            console.error('Error retrieving payment details:', error);
            // Don't throw - continue processing
          }
        }
        break;
        
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('✅ Payment intent succeeded:', paymentIntent.id);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true, eventType: event.type });
  } catch (error) {
    // Log the error but still return 200 to acknowledge receipt
    // This prevents Stripe from retrying indefinitely
    console.error('❌ Error processing webhook event:', error);
    console.error('Event type:', event?.type);
    console.error('Error details:', error.message);
    res.status(200).json({ received: true, error: 'Error processing event', message: error.message });
  }
});

// Health check endpoint for webhook verification
app.get('/webhook/stripe', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Stripe webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

// ==================== BACKFILL: create orders from paid Stripe sessions ====================

app.post('/api/admin/backfill-stripe-orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get all paid checkout sessions from Stripe
    const sessions = await stripe.checkout.sessions.list({ limit: 100, status: 'complete' });
    const results = [];

    for (const session of sessions.data) {
      if (session.payment_status !== 'paid') continue;

      // Skip if order already exists for this session
      const existing = await db.orders.getByStripeSession(session.id);
      if (existing) {
        results.push({ session: session.id, status: 'exists', orderId: existing.id });
        continue;
      }

      // Get line items from Stripe
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const items = lineItems.data
        .filter(li => !li.description.includes('Tax') && !li.description.includes('Processing Fee') && !li.description.includes('Delivery Fee'))
        .map(li => ({
          name: li.description,
          price: li.amount_total / 100 / li.quantity,
          quantity: li.quantity,
          category: '',
          image: ''
        }));

      const stripeTotal = session.amount_total / 100;
      const meta = session.metadata || {};
      const customerEmail = session.customer_email || meta.customerEmail || req.body.defaultEmail || '';
      const orderType = meta.orderType || 'pickup';

      const customer = {
        firstName: meta.customerFirstName || '',
        lastName: meta.customerLastName || '',
        email: customerEmail,
        phone: meta.customerPhone || '',
        address: orderType === 'delivery' ? {
          street: meta.deliveryStreet || '', apartment: meta.deliveryApt || null,
          city: meta.deliveryCity || '', state: meta.deliveryState || '',
          zipCode: meta.deliveryZip || '', fullAddress: meta.deliveryAddress || ''
        } : 'Store Pickup'
      };

      const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const taxRate = 0.0825;
      const tax = parseFloat((subtotal * taxRate).toFixed(2));
      const stripeFee = parseFloat((stripeTotal - subtotal - tax).toFixed(2));

      const newOrder = await db.orders.create({
        customer, items, subtotal, deliveryFee: 0, tax,
        stripeFee: Math.max(0, stripeFee),
        total: stripeTotal, stripeTotal, stripeSessionId: session.id,
        orderType, storeLocation: { name: meta.storeName || '', address: meta.storeAddress || '' },
        paymentMethod: 'card', deliveryTimeEstimate: null, promo: null,
        orderDate: new Date(session.created * 1000).toISOString(),
        status: 'completed', paymentConfirmed: true
      });

      // Link to user by email
      if (customerEmail) {
        try {
          const user = await db.users.getByEmail(customerEmail);
          if (user) await db.userOrders.link(user.id, newOrder.id);
        } catch (e) { /* ignore */ }
      }

      results.push({ session: session.id, status: 'created', orderId: newOrder.id, total: stripeTotal });
    }

    res.json({ backfilled: results.filter(r => r.status === 'created').length, skipped: results.filter(r => r.status === 'exists').length, details: results });
  } catch (error) {
    console.error('Backfill error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== STATS ROUTES (Admin only) ====================

app.get("/api/stats", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allOrders = await db.orders.getAll();
        const allUsers = await db.users.getAll();
        const productCount = await db.products.count();

        const totalOrders = allOrders.length;
        const totalRevenue = allOrders.reduce((sum, o) => sum + (o.stripeTotal || o.total || 0), 0);
        const totalCustomers = allUsers.filter(u => !u.role || u.role === 'customer' || (u.role !== 'admin')).length;

        const salesByCategory = {};
        allOrders.forEach(order => {
            order.items.forEach(item => {
                if (!salesByCategory[item.category]) {
                    salesByCategory[item.category] = { revenue: 0, units: 0 };
                }
                salesByCategory[item.category].revenue += item.price * item.quantity;
                salesByCategory[item.category].units += item.quantity;
            });
        });

        res.json({ totalOrders, totalRevenue, totalCustomers, totalProducts: productCount, salesByCategory });
    } catch (error) {
        console.error("Get stats error:", error);
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// ==================== CLOVER INTEGRATION ====================

const cloverSync = require('./clover-sync');

// Manual sync endpoint (Admin only)
app.post("/api/clover/sync", authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log('Clover sync triggered by admin');
        await cloverSync.syncFromClover();
        res.json({ 
            success: true, 
            message: "Clover sync completed successfully. Check server logs for details." 
        });
    } catch (error) {
        console.error("Clover sync error:", error);
        res.status(500).json({ 
            error: "Clover sync failed", 
            message: error.message 
        });
    }
});

// Get sync status
app.get("/api/clover/status", authenticateToken, requireAdmin, (req, res) => {
    try {
        const hasToken = !!process.env.CLOVER_API_TOKEN;
        const hasMerchantId = !!process.env.CLOVER_MERCHANT_ID;
        const mappingFile = path.join(DATA_DIR, 'clover-mapping.json');
        const hasMapping = fs.existsSync(mappingFile);
        
        res.json({
            configured: hasToken && hasMerchantId,
            hasMapping: hasMapping,
            environment: process.env.CLOVER_ENVIRONMENT || 'prod'
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to get sync status" });
    }
});

const PORT = process.env.PORT || 4242;

// Initialize database then start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Database: PostgreSQL`);
        console.log(`Allowed CORS origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : 'all (no CORS_ORIGINS configured)'}`);

        if (process.env.CLOVER_AUTO_SYNC === 'true') {
            console.log('🔄 Auto-sync enabled, syncing with Clover...');
            setTimeout(() => {
                cloverSync.syncFromClover().catch(err => {
                    console.error('Auto-sync failed:', err.message);
                });
            }, 5000);
        }
    });
}).catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
});

// ==================== CART ROUTES ====================

// Helper: enrich cart items with product details
async function enrichCartItems(cartItems) {
    const allProducts = await db.products.getAll();
    return (cartItems || []).map(item => {
        const product = allProducts.find(p => p.id === item.productId);
        return {
            ...item,
            product: product ? {
                id: product.id, name: product.name, price: product.price,
                image: product.image, category: product.category, inStock: product.inStock
            } : null
        };
    });
}

// Get current user's cart
app.get("/api/cart", authenticateToken, async (req, res) => {
    try {
        const user = await db.users.getById(req.user.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(await enrichCartItems(user.cart || []));
    } catch (error) {
        console.error("Get cart error:", error);
        res.status(500).json({ error: "Failed to fetch cart" });
    }
});

// Add or update a cart item
app.post("/api/cart/item", authenticateToken, async (req, res) => {
    try {
        const { productId, quantity, size } = req.body;
        if (!productId || typeof quantity !== 'number') {
            return res.status(400).json({ error: "productId and quantity are required" });
        }

        const user = await db.users.getById(req.user.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const cart = user.cart || [];
        const matchIndex = cart.findIndex(i => i.productId === productId && i.size === size);
        if (quantity <= 0) {
            if (matchIndex !== -1) cart.splice(matchIndex, 1);
        } else if (matchIndex !== -1) {
            cart[matchIndex].quantity = quantity;
        } else {
            cart.push({ productId, quantity, size });
        }

        await db.users.update(user.id, { cart });
        res.json(await enrichCartItems(cart));
    } catch (error) {
        console.error("Update cart item error:", error);
        res.status(500).json({ error: "Failed to update cart item" });
    }
});

// Remove a cart item
app.delete("/api/cart/item", authenticateToken, async (req, res) => {
    try {
        const { productId, size } = req.body;
        if (!productId) return res.status(400).json({ error: "productId is required" });

        const user = await db.users.getById(req.user.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const cart = (user.cart || []).filter(i => !(i.productId === productId && i.size === size));
        await db.users.update(user.id, { cart });
        res.json(await enrichCartItems(cart));
    } catch (error) {
        console.error("Delete cart item error:", error);
        res.status(500).json({ error: "Failed to delete cart item" });
    }
});

// Clear cart
app.delete("/api/cart", authenticateToken, async (req, res) => {
    try {
        const updated = await db.users.update(req.user.id, { cart: [] });
        if (!updated) return res.status(404).json({ error: "User not found" });
        res.json([]);
    } catch (error) {
        console.error("Clear cart error:", error);
        res.status(500).json({ error: "Failed to clear cart" });
    }
});

// ==================== ADMIN SMS TEST ENDPOINTS ====================

function twilioConfigStatus() {
    return {
        accountSidPresent: !!process.env.TWILIO_ACCOUNT_SID,
        authTokenPresent: !!process.env.TWILIO_AUTH_TOKEN,
        fromPresent: !!process.env.TWILIO_FROM,
        ownerPhonePresent: !!process.env.OWNER_PHONE,
        clientInitialized: !!twilioClient
    };
}

// SMS status (Admin only)
app.get('/api/admin/sms/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        res.json({
            configured: !!twilioClient,
            ...twilioConfigStatus()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check SMS status' });
    }
});

// Send a test SMS (Admin only)
app.post('/api/admin/sms/test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!twilioClient) {
            return res.status(400).json({ error: 'Twilio is not configured', status: twilioConfigStatus() });
        }
        const to = (req.body && req.body.to) || process.env.OWNER_PHONE;
        const body = (req.body && req.body.message) || 'Fiesta Liquor: Test SMS notification';
        if (!to) {
            return res.status(400).json({ error: 'Destination number not provided and OWNER_PHONE not set' });
        }
        try {
            const msg = await twilioClient.messages.create({ to, from: process.env.TWILIO_FROM, body });
            return res.json({ success: true, sid: msg.sid, to });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message, code: err.code, moreInfo: err.moreInfo });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to send test SMS' });
    }
});

// ==================== NEWSLETTER ROUTES ====================

app.post("/api/newsletter/subscribe", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email format" });

        const existing = await db.newsletter.getByEmail(email);
        if (existing) return res.status(400).json({ error: "Email already subscribed" });

        await db.newsletter.create({ email });
        res.json({ success: true, message: "Successfully subscribed to newsletter" });
    } catch (error) {
        console.error("Newsletter subscribe error:", error);
        res.status(500).json({ error: "Failed to subscribe" });
    }
});

app.get("/api/newsletter/subscribers", authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(await db.newsletter.getAll());
    } catch (error) {
        console.error("Get newsletter subscribers error:", error);
        res.status(500).json({ error: "Failed to get subscribers" });
    }
});

app.get("/api/newsletter/export", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const subscribers = await db.newsletter.getAll();
        const csvHeader = "Email,Subscribed Date,Status\n";
        const csvRows = subscribers.map(s =>
            `${s.email},${new Date(s.subscribedAt).toLocaleDateString()},${s.active ? 'Active' : 'Inactive'}`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=newsletter-subscribers.csv');
        res.send(csvHeader + csvRows);
    } catch (error) {
        console.error("Export newsletter error:", error);
        res.status(500).json({ error: "Failed to export subscribers" });
    }
});

app.delete("/api/newsletter/unsubscribe", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const updated = await db.newsletter.update(email, { active: false, unsubscribedAt: new Date().toISOString() });
        if (!updated) return res.status(404).json({ error: "Email not found" });

        res.json({ success: true, message: "Successfully unsubscribed" });
    } catch (error) {
        console.error("Newsletter unsubscribe error:", error);
        res.status(500).json({ error: "Failed to unsubscribe" });
    }
});

// ==================== SYSTEM SETTINGS ROUTES ====================

// Public delivery settings (no auth required — needed by checkout page)
app.get("/api/delivery-settings", async (req, res) => {
    try {
        const s = await db.settings.get() || {};
        res.json({
            deliveryBaseFee: s.deliveryBaseFee ?? 3.00,
            deliveryPerMileRate: s.deliveryPerMileRate ?? 1.50,
            maxDeliveryRadius: s.maxDeliveryRadius ?? 10,
            taxRate: s.taxRate ?? 0.0825
        });
    } catch (error) {
        console.error("Get delivery settings error:", error);
        res.status(500).json({ error: "Failed to fetch delivery settings" });
    }
});

app.get("/api/admin/settings", authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(await db.settings.get() || {});
    } catch (error) {
        console.error("Get settings error:", error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

app.put("/api/admin/settings", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const current = await db.settings.get() || {};
        const updated = { ...current, ...req.body };

        if (updated.deliveryFee < 0) return res.status(400).json({ error: "Delivery fee cannot be negative" });
        if (updated.minimumOrder < 0) return res.status(400).json({ error: "Minimum order cannot be negative" });
        if (updated.taxRate < 0 || updated.taxRate > 1) return res.status(400).json({ error: "Tax rate must be between 0 and 1" });

        await db.settings.set(updated);
        res.json({ message: "Settings updated successfully", settings: updated });
    } catch (error) {
        console.error("Update settings error:", error);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

// ==================== PROMO CODES ROUTES ====================

app.get("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(await db.promoCodes.getAll());
    } catch (error) {
        console.error("Get promo codes error:", error);
        res.status(500).json({ error: "Failed to fetch promo codes" });
    }
});

app.post("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { code, type, value, minOrder, maxDiscount, expiresAt, usageLimit, active } = req.body;
        if (!code || !type || !value) return res.status(400).json({ error: "Code, type, and value are required" });
        if (!['percentage', 'fixed'].includes(type)) return res.status(400).json({ error: "Type must be 'percentage' or 'fixed'" });

        const existing = await db.promoCodes.getByCode(code);
        if (existing) return res.status(400).json({ error: "Promo code already exists" });

        const created = await db.promoCodes.create({
            code: code.toUpperCase(), type, value: parseFloat(value),
            minOrder: minOrder ? parseFloat(minOrder) : 0,
            maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
            expiresAt: expiresAt || null, usageLimit: usageLimit || null,
            active: active !== false, createdBy: req.user.email
        });
        res.status(201).json(created);
    } catch (error) {
        console.error("Create promo code error:", error);
        res.status(500).json({ error: "Failed to create promo code" });
    }
});

app.put("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const updated = await db.promoCodes.update(parseInt(req.params.id), {
            ...req.body,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        });
        if (!updated) return res.status(404).json({ error: "Promo code not found" });
        res.json(updated);
    } catch (error) {
        console.error("Update promo code error:", error);
        res.status(500).json({ error: "Failed to update promo code" });
    }
});

app.delete("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const deleted = await db.promoCodes.delete(parseInt(req.params.id));
        if (!deleted) return res.status(404).json({ error: "Promo code not found" });
        res.json({ message: "Promo code deleted successfully", deletedCode: deleted });
    } catch (error) {
        console.error("Delete promo code error:", error);
        res.status(500).json({ error: "Failed to delete promo code" });
    }
});

app.post("/api/promo-codes/validate", authenticateToken, async (req, res) => {
    try {
        const { code, orderTotal } = req.body;
        if (!code) return res.status(400).json({ error: "Promo code is required" });

        const promoCode = await db.promoCodes.getByCode(code);
        if (!promoCode) return res.status(404).json({ error: "Invalid promo code" });
        if (!promoCode.active) return res.status(400).json({ error: "This promo code is no longer active" });
        if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) return res.status(400).json({ error: "This promo code has expired" });
        if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) return res.status(400).json({ error: "This promo code has reached its usage limit" });

        const userIdentifier = req.user?.id || req.user?.email;
        if (userIdentifier && (promoCode.usedBy || []).includes(userIdentifier)) {
            return res.status(400).json({ error: "This promo code has already been used by your account" });
        }
        if (promoCode.minOrder && orderTotal < promoCode.minOrder) {
            return res.status(400).json({ error: `Minimum order of $${promoCode.minOrder.toFixed(2)} required for this promo code` });
        }

        let discount = promoCode.type === 'percentage'
            ? Math.min((orderTotal * promoCode.value) / 100, promoCode.maxDiscount || Infinity)
            : promoCode.value;

        res.json({
            valid: true, code: promoCode.code,
            discount: parseFloat(discount.toFixed(2)),
            type: promoCode.type,
            message: `Promo code applied! You save $${discount.toFixed(2)}`
        });
    } catch (error) {
        console.error("Validate promo code error:", error);
        res.status(500).json({ error: "Failed to validate promo code" });
    }
});

app.post("/api/promo-codes/redeem", authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Promo code is required" });

        const promoCode = await db.promoCodes.getByCode(code);
        if (!promoCode) return res.status(404).json({ error: "Invalid promo code" });
        if (!promoCode.active) return res.status(400).json({ error: "This promo code is no longer active" });
        if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) return res.status(400).json({ error: "This promo code has expired" });
        if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) return res.status(400).json({ error: "This promo code has reached its usage limit" });

        const userIdentifier = req.user?.id || req.user?.email;
        if (userIdentifier && (promoCode.usedBy || []).includes(userIdentifier)) {
            return res.status(400).json({ error: "This promo code has already been used by your account" });
        }

        await db.promoCodes.update(promoCode.id, {
            usageCount: (promoCode.usageCount || 0) + 1,
            usedBy: [...(promoCode.usedBy || []), userIdentifier]
        });

        res.json({ success: true, code: promoCode.code });
    } catch (error) {
        console.error("Redeem promo code error:", error);
        res.status(500).json({ error: "Failed to redeem promo code" });
    }
});

// ============================================================
// Reviews API
// ============================================================

// GET /api/reviews — public, returns all reviews (newest first)
app.get("/api/reviews", async (req, res) => {
    try {
        res.json(await db.reviews.getAll());
    } catch (error) {
        console.error("Get reviews error:", error);
        res.status(500).json({ error: "Failed to load reviews" });
    }
});

// POST /api/reviews — public, submit a new review
app.post("/api/reviews", async (req, res) => {
    try {
        const { name, rating, comment } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
        if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) return res.status(400).json({ error: "Rating must be an integer from 1 to 5" });
        if (!comment || !comment.trim()) return res.status(400).json({ error: "Comment is required" });
        if (comment.trim().length > 1000) return res.status(400).json({ error: "Comment must be under 1000 characters" });

        const newReview = await db.reviews.create({
            name: name.trim(), rating: parseInt(rating, 10), comment: comment.trim()
        });
        res.status(201).json(newReview);
    } catch (error) {
        console.error("Submit review error:", error);
        res.status(500).json({ error: "Failed to submit review" });
    }
});

// ============================================================
// Product Requests API
// ============================================================

// POST /api/product-requests — public, submit a product request
app.post("/api/product-requests", async (req, res) => {
    try {
        const { name, productName, message } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Your name is required" });
        if (!productName || !productName.trim()) return res.status(400).json({ error: "Product name is required" });
        if (message && message.length > 500) return res.status(400).json({ error: "Message must be under 500 characters" });

        const newRequest = await db.productRequests.create({
            name: name.trim(), productName: productName.trim(), message: (message || '').trim()
        });
        res.status(201).json({ success: true, request: newRequest });
    } catch (error) {
        console.error("Product request error:", error);
        res.status(500).json({ error: "Failed to submit product request" });
    }
});

// Health/version check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.1.0', deployed: new Date().toISOString() });
});

// GET /api/product-requests — admin only, list all requests
app.get("/api/product-requests", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
        res.json(await db.productRequests.getAll());
    } catch (error) {
        console.error("Get product requests error:", error);
        res.status(500).json({ error: "Failed to load product requests" });
    }
});
