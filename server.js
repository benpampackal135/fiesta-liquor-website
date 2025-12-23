require('dotenv').config();

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();

// Configure CORS to allow all origins (will restrict later)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('public'));
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


// Serve root-level HTML files
app.get('/account.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'account.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/product-import.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'product-import.html'));
});

app.get('/checkout.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// Redirect cart.html to index.html (for backward compatibility)
app.get('/cart.html', (req, res) => {
    res.redirect('/index.html');
});

// Data storage files
// Use DATA_DIR env var if set (for Railway volumes), otherwise use local 'data' directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const NEWSLETTER_FILE = path.join(DATA_DIR, 'newsletter.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PROMO_CODES_FILE = path.join(DATA_DIR, 'promo-codes.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files if they don't exist
function initDataFiles() {
    // Seed products ONLY if file doesn't exist AND is empty
    // NEVER overwrite existing products to preserve user changes
    const productsExist = fs.existsSync(PRODUCTS_FILE);
    let shouldSeedProducts = false;
    
    if (!productsExist) {
        shouldSeedProducts = true;
        console.log('📦 Products file not found, will seed default products...');
    } else {
        // Check if file is empty or invalid
        try {
            const existingProducts = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
            if (!Array.isArray(existingProducts) || existingProducts.length === 0) {
                shouldSeedProducts = true;
                console.log('📦 Products file is empty, will seed default products...');
            } else {
                console.log(`✅ Found ${existingProducts.length} existing products, preserving them`);
            }
        } catch (error) {
            // File exists but is corrupted, backup and reseed
            console.log('⚠️ Products file corrupted, backing up and reseeding...');
            const backupPath = PRODUCTS_FILE + '.backup.' + Date.now();
            try {
                fs.copyFileSync(PRODUCTS_FILE, backupPath);
                console.log('✅ Backed up corrupted file to:', backupPath);
            } catch (backupError) {
                console.error('Failed to backup:', backupError);
            }
            shouldSeedProducts = true;
        }
    }
    
    if (shouldSeedProducts) {
        console.log('📦 Seeding all 25 products on startup...');
        const seedProducts = JSON.parse(`[
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
]`);
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(seedProducts, null, 2));
        console.log('✅ All 25 products seeded!');
    }
    if (!fs.existsSync(USERS_FILE)) {
        const defaultAdmin = {
            id: 1,
            name: "Admin",
            email: "bensonpampackal456@gmail.com",
            firebaseUid: null,
            isFirebaseUser: true,
            password: null,
            role: "admin",
            status: "active",
            joinDate: new Date().toISOString(),
            orders: [],
            cart: []
        };
        const testCustomer = {
            id: 2,
            name: "Test Customer",
            email: "customer@test.com",
            password: bcrypt.hashSync("password123", 10),
            role: "customer",
            status: "active",
            joinDate: new Date().toISOString(),
            orders: [],
            cart: []
        };
        fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin, testCustomer], null, 2));
        console.log('✅ Created default admin user: bensonpampackal456@gmail.com (Firebase user)');
        console.log('✅ Created test customer: customer@test.com / password123');
    } else {
        // Ensure the correct admin exists and old admin is removed
        try {
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            const oldAdminEmail = 'admin@fiestaliquor.com';
            const correctAdminEmail = 'bensonpampackal456@gmail.com';
            
            // Remove old admin if exists
            const filtered = users.filter(u => u.email !== oldAdminEmail);
            
            // Ensure correct admin exists and is admin
            let adminExists = filtered.find(u => u.email === correctAdminEmail);
            if (!adminExists) {
                adminExists = {
                    id: Date.now(),
                    name: "Admin",
                    email: correctAdminEmail,
                    firebaseUid: null,
                    isFirebaseUser: true,
                    password: null,
                    role: "admin",
                    status: "active",
                    joinDate: new Date().toISOString(),
                    orders: [],
                    cart: []
                };
                filtered.push(adminExists);
                console.log('✅ Added admin user:', correctAdminEmail);
            } else {
                // Ensure it's admin
                adminExists.role = 'admin';
                adminExists.status = 'active';
                adminExists.isFirebaseUser = true;
                adminExists.password = null;
                console.log('✅ Confirmed admin privileges for:', correctAdminEmail);
            }
            
            // Only write if changes were made
            if (filtered.length !== users.length || !adminExists.role || adminExists.role !== 'admin') {
                fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2));
            }
        } catch (error) {
            console.error('Error ensuring admin user:', error);
        }
    }
    if (!fs.existsSync(ORDERS_FILE)) {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(SETTINGS_FILE)) {
        const defaultSettings = {
            deliveryFee: 7.99,
            minimumOrder: 25.00,
            taxRate: 0.0825,
            processingFeeRate: 0.029,
            processingFeeFixed: 0.30,
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
            autoCancel: {
                enabled: false,
                timeoutMinutes: 30
            },
            notifications: {
                smsEnabled: true,
                emailEnabled: true
            }
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
    }
    if (!fs.existsSync(PROMO_CODES_FILE)) {
        fs.writeFileSync(PROMO_CODES_FILE, JSON.stringify([], null, 2));
    }
}

initDataFiles();

// Helper functions to read/write data
function readData(file) {
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
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

        const users = readData(USERS_FILE);
        
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const clientCart = Array.isArray(req.body.cart) ? req.body.cart : [];
        const newUser = {
            id: Date.now(),
            name,
            email,
            phone,
            password: hashedPassword,
            role: "customer",
            status: "active",
            joinDate: new Date().toISOString(),
            orders: [],
            cart: sanitizeCartItems(clientCart) // use sanitized client cart if provided
        };

        users.push(newUser);
        writeData(USERS_FILE, users);

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

        const users = readData(USERS_FILE);
        let user = users.find(u => u.email === email);

        if (user) {
            // User already exists, update Firebase UID if not set
            // IMPORTANT: Preserve existing role (don't overwrite admin role)
            if (!user.firebaseUid) {
                user.firebaseUid = firebaseUid;
                user.isFirebaseUser = true;
                writeData(USERS_FILE, users);
            }
            // Role is preserved from existing user
        } else {
            // Create new Firebase user (no password needed)
            const newUser = {
                id: Date.now(),
                name: name || email.split('@')[0],
                email,
                phone: phone || '',
                firebaseUid: firebaseUid,
                isFirebaseUser: true,
                password: null, // Firebase users don't have password
                role: "customer",
                status: "active",
                joinDate: new Date().toISOString(),
                orders: [],
                cart: []
            };

            users.push(newUser);
            writeData(USERS_FILE, users);
            user = newUser;
        }

        // Generate backend token for this user
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

        const users = readData(USERS_FILE);
        const user = users.find(u => u.email === email);

        if (!user) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // Check if user account is disabled or banned
        if (user.status === 'disabled') {
            return res.status(403).json({ error: "Your account has been disabled. Please contact support." });
        }
        if (user.status === 'banned') {
            return res.status(403).json({ error: "Your account has been banned. Please contact support." });
        }

        // Return saved cart from server (don't merge with any guest cart)
        // This ensures users get their saved cart back when logging in

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

        const users = readData(USERS_FILE);
        const idx = users.findIndex(u => u.email === email);

        // For security, always return success, but only generate token if user exists
        let resetUrl = null;
        if (idx !== -1) {
            const token = crypto.randomBytes(32).toString("hex");
            const expiresAt = Date.now() + 1000 * 60 * 30; // 30 minutes
            users[idx].resetToken = { token, expiresAt };
            writeData(USERS_FILE, users);
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

        const users = readData(USERS_FILE);
        const idx = users.findIndex(u => u.resetToken && u.resetToken.token === token);
        if (idx === -1) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        const { expiresAt } = users[idx].resetToken;
        if (Date.now() > expiresAt) {
            // Expired
            delete users[idx].resetToken;
            writeData(USERS_FILE, users);
            return res.status(400).json({ error: "Reset token expired" });
        }

        // Update password
        const hashed = await bcrypt.hash(newPassword, 10);
        users[idx].password = hashed;
        delete users[idx].resetToken;
        writeData(USERS_FILE, users);

        return res.json({ success: true });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ error: "Failed to reset password" });
    }
});

// Get current user
app.get("/api/auth/me", authenticateToken, (req, res) => {
    const users = readData(USERS_FILE);
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        cart: user.cart || [] // include cart
    });
});

// ==================== CART ROUTES ====================

// Get user's cart
app.get("/api/cart", authenticateToken, (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        res.json({ cart: user.cart || [] });
    } catch (error) {
        console.error("Get cart error:", error);
        res.status(500).json({ error: "Failed to get cart" });
    }
});

// Sync cart to server
app.post("/api/cart/sync", authenticateToken, (req, res) => {
    try {
        const { cart } = req.body;
        
        if (!Array.isArray(cart)) {
            return res.status(400).json({ error: "Cart must be an array" });
        }
        
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // Update user's cart
        users[userIndex].cart = sanitizeCartItems(cart);
        writeData(USERS_FILE, users);
        
        res.json({ 
            success: true, 
            cart: users[userIndex].cart,
            message: "Cart synced successfully"
        });
    } catch (error) {
        console.error("Cart sync error:", error);
        res.status(500).json({ error: "Failed to sync cart" });
    }
});

// ==================== PRODUCT ROUTES ====================

// Get all products
app.get("/api/products", (req, res) => {
    try {
        const products = readData(PRODUCTS_FILE);
        res.json(products);
    } catch (error) {
        console.error("Get products error:", error);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

// Get product by ID
app.get("/api/products/:id", (req, res) => {
    try {
        const products = readData(PRODUCTS_FILE);
        const product = products.find(p => p.id === parseInt(req.params.id));
        
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
app.post("/api/products", authenticateToken, requireAdmin, (req, res) => {
    try {
        const { name, category, description, image, price, sizes, inStock } = req.body;

        if (!name || !category || !description) {
            return res.status(400).json({ error: "Name, category, and description are required" });
        }

        const products = readData(PRODUCTS_FILE);
        const newProduct = {
            id: products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1,
            name,
            category,
            description,
            image: image || "images/product_placeholder.svg",
            price: price || 0,
            sizes: sizes || [],
            inStock: inStock !== undefined ? inStock : true,
            createdAt: new Date().toISOString()
        };

        products.push(newProduct);
        writeData(PRODUCTS_FILE, products);

        res.status(201).json(newProduct);
    } catch (error) {
        console.error("Create product error:", error);
        res.status(500).json({ error: "Failed to create product" });
    }
});

// Update product (Admin only)
app.put("/api/products/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
        const products = readData(PRODUCTS_FILE);
        const index = products.findIndex(p => p.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: "Product not found" });
        }

        products[index] = {
            ...products[index],
            ...req.body,
            id: products[index].id,
            updatedAt: new Date().toISOString()
        };

        writeData(PRODUCTS_FILE, products);
        res.json(products[index]);
    } catch (error) {
        console.error("Update product error:", error);
        res.status(500).json({ error: "Failed to update product" });
    }
});

// Delete product (Admin only)
app.delete("/api/products/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
        const products = readData(PRODUCTS_FILE);
        const filtered = products.filter(p => p.id !== parseInt(req.params.id));

        if (products.length === filtered.length) {
            return res.status(404).json({ error: "Product not found" });
        }

        writeData(PRODUCTS_FILE, filtered);
        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error("Delete product error:", error);
        res.status(500).json({ error: "Failed to delete product" });
    }
});

// ==================== ORDER ROUTES ====================

// Get all orders (Admin only) or user's orders
app.get("/api/orders", authenticateToken, (req, res) => {
    try {
        const orders = readData(ORDERS_FILE);
        
        if (req.user.role === 'admin') {
            res.json(orders);
        } else {
            const userOrders = orders.filter(o => o.customer.email === req.user.email);
            res.json(userOrders);
        }
    } catch (error) {
        console.error("Get orders error:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

// Get order by ID
app.get("/api/orders/:id", authenticateToken, (req, res) => {
    try {
        const orders = readData(ORDERS_FILE);
        const order = orders.find(o => o.id === parseInt(req.params.id));

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        // Check if user has access to this order
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
app.post("/api/orders", authenticateToken, (req, res) => {
    try {
        // Store hours check removed - orders can be placed anytime
        
        const { items, customer, orderType, paymentMethod, deliveryTimeEstimate, stripeSessionId, stripeTotal } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "Order must contain at least one item" });
        }

        const orders = readData(ORDERS_FILE);
        const orderId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;

        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = orderType === 'delivery' ? 7.99 : 0;
        const subtotalWithFee = subtotal + deliveryFee;
        const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
        // Calculate processing fee on amount before fee (subtotal + delivery + tax)
        const amountBeforeFee = subtotalWithFee + tax;
        const stripeFee = calculateUpfrontProcessingFee(amountBeforeFee);
        const total = parseFloat((amountBeforeFee + stripeFee).toFixed(2));

        const newOrder = {
            id: orderId,
            customer: {
                ...customer,
                email: req.user.email
            },
            items,
            subtotal,
            deliveryFee,
            tax,
            stripeFee,
            total: stripeTotal || total, // Use Stripe total if provided, otherwise use calculated
            stripeTotal: stripeTotal || null, // Store Stripe total separately
            stripeSessionId: stripeSessionId || null,
            orderType: orderType || 'pickup',
            paymentMethod: paymentMethod || 'card',
            deliveryTimeEstimate: orderType === 'delivery' ? deliveryTimeEstimate : null,
            orderDate: new Date().toISOString(),
            status: 'pending'
        };

        orders.push(newOrder);
        writeData(ORDERS_FILE, orders);

        // Update user's order history
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            users[userIndex].orders = users[userIndex].orders || [];
            users[userIndex].orders.push(orderId);
            writeData(USERS_FILE, users);
        }

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
app.put("/api/orders/:id/status", authenticateToken, requireAdmin, (req, res) => {
    try {
        const { status, notes } = req.body;
        const validStatuses = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status. Valid options: pending, accepted, preparing, ready, out_for_delivery, delivered, completed, cancelled" });
        }

        const orders = readData(ORDERS_FILE);
        const index = orders.findIndex(o => o.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: "Order not found" });
        }

        const previousStatus = orders[index].status;
        orders[index].status = status;
        orders[index].updatedAt = new Date().toISOString();
        orders[index].updatedBy = req.user.email;
        
        // Track status history
        if (!orders[index].statusHistory) {
            orders[index].statusHistory = [];
        }
        orders[index].statusHistory.push({
            from: previousStatus,
            to: status,
            changedBy: req.user.email,
            changedAt: new Date().toISOString(),
            notes: notes || null
        });
        
        // Send customer notification when order is out for delivery or ready
        if (status === 'out_for_delivery' || status === 'ready') {
            sendCustomerOrderSms({
                ...orders[index],
                statusMessage: status === 'out_for_delivery' ? 
                    'Your order is out for delivery!' : 
                    'Your order is ready for pickup!'
            }).catch(err => console.error('Customer SMS notify error:', err));
        }

        writeData(ORDERS_FILE, orders);
        res.json(orders[index]);
    } catch (error) {
        console.error("Update order status error:", error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

// Cancel order (User can cancel if not yet delivered)
app.post("/api/orders/:id/cancel", authenticateToken, (req, res) => {
    try {
        const orders = readData(ORDERS_FILE);
        const index = orders.findIndex(o => o.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: "Order not found" });
        }

        const order = orders[index];

        // Check ownership
        if (order.customer.email !== req.user.email) {
            return res.status(403).json({ error: "You can only cancel your own orders" });
        }

        // Check if already delivered
        if (order.status === 'delivered') {
            return res.status(400).json({ error: "Cannot cancel delivered orders. No refunds or returns after delivery." });
        }

        // Cannot cancel if already completed
        if (order.status === 'completed') {
            return res.status(400).json({ error: "Order has been completed and cannot be cancelled." });
        }

        // Cannot cancel if already cancelled
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: "This order has already been cancelled." });
        }

        // Calculate cancellation fee (10% of subtotal)
        const cancellationFeePercent = 0.10;
        const cancellationFee = parseFloat((order.subtotal * cancellationFeePercent).toFixed(2));
        const refundAmount = parseFloat((order.subtotal - cancellationFee).toFixed(2));

        // Update status to cancelled
        orders[index].status = 'cancelled';
        orders[index].updatedAt = new Date().toISOString();
        orders[index].cancelledBy = 'customer';
        orders[index].cancelledAt = new Date().toISOString();
        orders[index].cancellationFee = cancellationFee;
        orders[index].refundAmount = refundAmount;

        writeData(ORDERS_FILE, orders);
        res.json({ 
            success: true, 
            message: "Order cancelled successfully", 
            order: orders[index],
            cancellationFee: cancellationFee,
            refundAmount: refundAmount
        });
    } catch (error) {
        console.error("Cancel order error:", error);
        res.status(500).json({ error: "Failed to cancel order: " + error.message });
    }
});

// Customer confirms they received the order (pickup or delivery)
app.post("/api/orders/:id/confirm-received", authenticateToken, (req, res) => {
    try {
        const orders = readData(ORDERS_FILE);
        const index = orders.findIndex(o => o.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: "Order not found" });
        }

        const order = orders[index];

        // Check ownership
        if (order.customer.email !== req.user.email) {
            return res.status(403).json({ error: "You can only confirm your own orders" });
        }

        // Do not allow confirming cancelled orders
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: "Cannot confirm a cancelled order" });
        }

        // Mark as confirmed by customer
        orders[index].customerConfirmed = true;
        orders[index].customerConfirmedAt = new Date().toISOString();

        writeData(ORDERS_FILE, orders);

        res.json({
            success: true,
            message: "Order confirmed as received",
            order: orders[index]
        });
    } catch (error) {
        console.error("Confirm received error:", error);
        res.status(500).json({ error: "Failed to confirm order as received: " + error.message });
    }
});

// Admin: Issue refund
app.post("/api/admin/orders/:id/refund", authenticateToken, requireAdmin, (req, res) => {
    try {
        const { amount, reason, type } = req.body; // type: 'full' or 'partial'
        
        const orders = readData(ORDERS_FILE);
        const index = orders.findIndex(o => o.id === parseInt(req.params.id));
        
        if (index === -1) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        const order = orders[index];
        
        // Validate refund amount
        const maxRefund = order.total || 0;
        let refundAmount = type === 'full' ? maxRefund : parseFloat(amount);
        
        if (refundAmount > maxRefund) {
            return res.status(400).json({ error: "Refund amount cannot exceed order total" });
        }
        
        if (refundAmount <= 0) {
            return res.status(400).json({ error: "Refund amount must be greater than 0" });
        }
        
        // Record refund
        if (!orders[index].refunds) {
            orders[index].refunds = [];
        }
        
        const refund = {
            id: Date.now(),
            amount: parseFloat(refundAmount.toFixed(2)),
            type: type || 'partial',
            reason: reason || 'No reason provided',
            issuedBy: req.user.email,
            issuedAt: new Date().toISOString(),
            status: 'completed' // In real app, would integrate with payment gateway
        };
        
        orders[index].refunds.push(refund);
        orders[index].refundedAmount = (orders[index].refundedAmount || 0) + refund.amount;
        orders[index].status = type === 'full' ? 'cancelled' : orders[index].status;
        orders[index].updatedAt = new Date().toISOString();
        
        writeData(ORDERS_FILE, orders);
        
        res.json({
            success: true,
            message: `${type === 'full' ? 'Full' : 'Partial'} refund of $${refund.amount.toFixed(2)} issued successfully`,
            refund,
            order: orders[index]
        });
    } catch (error) {
        console.error("Issue refund error:", error);
        res.status(500).json({ error: "Failed to issue refund" });
    }
});

// ==================== USER ROUTES ====================

// Get all users (Admin only)
app.get("/api/users", authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const usersWithoutPasswords = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            role: u.role,
            status: u.status || 'active',
            joinDate: u.joinDate,
            orders: u.orders || []
        }));
        res.json(usersWithoutPasswords);
    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Admin: Ban/Disable user
app.put("/api/admin/users/:id/status", authenticateToken, requireAdmin, (req, res) => {
    try {
        const { status } = req.body; // 'active', 'disabled', 'banned'
        const validStatuses = ['active', 'disabled', 'banned'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status. Use: active, disabled, or banned" });
        }
        
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === parseInt(req.params.id));
        
        if (userIndex === -1) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // Prevent admin from disabling themselves
        if (users[userIndex].id === req.user.id) {
            return res.status(400).json({ error: "Cannot change your own status" });
        }
        
        users[userIndex].status = status;
        users[userIndex].statusUpdatedAt = new Date().toISOString();
        users[userIndex].statusUpdatedBy = req.user.email;
        
        writeData(USERS_FILE, users);
        
        res.json({ 
            message: `User ${status} successfully`,
            user: {
                id: users[userIndex].id,
                name: users[userIndex].name,
                email: users[userIndex].email,
                status: users[userIndex].status
            }
        });
    } catch (error) {
        console.error("Update user status error:", error);
        res.status(500).json({ error: "Failed to update user status" });
    }
});

// Admin: Update user role
app.put("/api/admin/users/:id/role", authenticateToken, requireAdmin, (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['admin', 'customer'];
        
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: "Invalid role. Use: admin or customer" });
        }
        
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === parseInt(req.params.id));
        
        if (userIndex === -1) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // Prevent removing last admin
        if (role === 'customer' && users[userIndex].role === 'admin') {
            const adminCount = users.filter(u => u.role === 'admin').length;
            if (adminCount <= 1) {
                return res.status(400).json({ error: "Cannot remove the last admin user" });
            }
        }
        
        users[userIndex].role = role;
        users[userIndex].roleUpdatedAt = new Date().toISOString();
        users[userIndex].roleUpdatedBy = req.user.email;
        
        writeData(USERS_FILE, users);
        
        res.json({ 
            message: `User role updated to ${role} successfully`,
            user: {
                id: users[userIndex].id,
                name: users[userIndex].name,
                email: users[userIndex].email,
                role: users[userIndex].role
            }
        });
    } catch (error) {
        console.error("Update user role error:", error);
        res.status(500).json({ error: "Failed to update user role" });
    }
});

// Admin: Get user details with order history
app.get("/api/admin/users/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const user = users.find(u => u.id === parseInt(req.params.id));
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // Get user's orders
        const orders = readData(ORDERS_FILE);
        const userOrders = orders.filter(o => o.customer?.email === user.email);
        
        // Calculate stats
        const totalSpent = userOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        const totalOrders = userOrders.length;
        const cancelledOrders = userOrders.filter(o => o.status === 'cancelled').length;
        
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            status: user.status || 'active',
            joinDate: user.joinDate,
            stats: {
                totalOrders,
                totalSpent,
                cancelledOrders,
                averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0
            },
            recentOrders: userOrders.slice(-10).reverse()
        });
    } catch (error) {
        console.error("Get user details error:", error);
        res.status(500).json({ error: "Failed to fetch user details" });
    }
});

// Admin: Delete user account
app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === parseInt(req.params.id));
        
        if (userIndex === -1) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // Prevent admin from deleting themselves
        if (users[userIndex].id === req.user.id) {
            return res.status(400).json({ error: "Cannot delete your own account" });
        }
        
        const deletedUser = users.splice(userIndex, 1)[0];
        writeData(USERS_FILE, users);
        
        res.json({ 
            message: "User deleted successfully",
            deletedUser: {
                id: deletedUser.id,
                email: deletedUser.email,
                name: deletedUser.name
            }
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
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === req.user.id);

        if (userIndex === -1) {
            return res.status(404).json({ error: "User not found" });
        }

        if (name) users[userIndex].name = name;
        if (phone) users[userIndex].phone = phone;
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: "Password must be at least 6 characters" });
            }
            users[userIndex].password = await bcrypt.hash(password, 10);
        }

        writeData(USERS_FILE, users);

        res.json({
            id: users[userIndex].id,
            name: users[userIndex].name,
            email: users[userIndex].email,
            phone: users[userIndex].phone,
            role: users[userIndex].role
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

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items, successUrl, cancelUrl } = req.body;

    // Use redirect URLs from frontend if provided, otherwise use SITE_URL env var
    const success_url = successUrl || `${process.env.SITE_URL || `${req.protocol}://${req.get('host')}`}/success.html`;
    const cancel_url = cancelUrl || `${process.env.SITE_URL || `${req.protocol}://${req.get('host')}`}/checkout.html`;

    console.log('Creating Stripe session with redirects:');
    console.log('  Success:', success_url);
    console.log('  Cancel:', cancel_url);

    const session = await stripe.checkout.sessions.create({
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
    });

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
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!webhookSecret) {
      console.log('⚠️ Stripe webhook secret not configured. Skipping webhook verification.');
      // In development, you might want to parse without verification
      event = JSON.parse(req.body);
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const stripeTotal = session.amount_total / 100; // Convert from cents to dollars
      
      console.log('✅ Payment successful:', {
        sessionId: session.id,
        amountTotal: stripeTotal,
        customerEmail: session.customer_email
      });
      
      // Update the order with the actual Stripe total
      // Find the most recent pending order for this customer email
      try {
        const orders = readData(ORDERS_FILE);
        const customerEmail = session.customer_email;
        
        // Find order by session ID first, then by email and status
        let recentOrder = orders.find(order => order.stripeSessionId === session.id);
        
        // If not found by session ID, find by email and status
        if (!recentOrder) {
          recentOrder = orders
            .filter(order => 
              (order.customer?.email === customerEmail || order.customerEmail === customerEmail) &&
              (order.status === 'pending' || order.status === 'processing') &&
              !order.stripeTotal // Only update if not already set
            )
            .sort((a, b) => new Date(b.orderDate || b.createdAt) - new Date(a.orderDate || a.createdAt))[0];
        }
        
        if (recentOrder) {
          const orderIndex = orders.findIndex(o => o.id === recentOrder.id);
          if (orderIndex !== -1) {
            // Update order with actual Stripe total
            orders[orderIndex].stripeTotal = stripeTotal;
            orders[orderIndex].stripeSessionId = session.id;
            // Also update the total field to match Stripe's total
            orders[orderIndex].total = stripeTotal;
            writeData(ORDERS_FILE, orders);
            console.log(`✅ Updated order #${recentOrder.id} with Stripe total: $${stripeTotal}`);
            
            // Send order confirmation email immediately after payment
            const updatedOrder = orders[orderIndex];
            if (updatedOrder && customerEmail) {
              console.log(`📧 Sending order confirmation email to ${customerEmail} for order #${updatedOrder.id}...`);
              sendCustomerOrderEmail(updatedOrder).catch(err => {
                console.error('❌ Failed to send order confirmation email:', err.message);
              });
            }
          }
        } else {
          console.log('⚠️ No matching pending order found for customer:', customerEmail);
        }
      } catch (error) {
        console.error('Error updating order with Stripe total:', error);
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

  res.json({ received: true });
});

// ==================== STATS ROUTES (Admin only) ====================

app.get("/api/stats", authenticateToken, requireAdmin, (req, res) => {
    try {
        const orders = readData(ORDERS_FILE);
        const users = readData(USERS_FILE);
        const products = readData(PRODUCTS_FILE);

        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + (order.stripeTotal || order.total || 0), 0);
        // Count all users that are not admins (including those without a role set, which default to customer)
        const totalCustomers = users.filter(u => !u.role || u.role === 'customer' || (u.role !== 'admin' && u.role !== 'Admin')).length;
        const totalProducts = products.length;

        // Calculate sales by category
        const salesByCategory = {};
        orders.forEach(order => {
            order.items.forEach(item => {
                if (!salesByCategory[item.category]) {
                    salesByCategory[item.category] = { revenue: 0, units: 0 };
                }
                salesByCategory[item.category].revenue += item.price * item.quantity;
                salesByCategory[item.category].units += item.quantity;
            });
        });

        res.json({
            totalOrders,
            totalRevenue,
            totalCustomers,
            totalProducts,
            salesByCategory
        });
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
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    
    // Auto-sync on startup if enabled
    if (process.env.CLOVER_AUTO_SYNC === 'true') {
        console.log('🔄 Auto-sync enabled, syncing with Clover...');
        setTimeout(() => {
            cloverSync.syncFromClover().catch(err => {
                console.error('Auto-sync failed:', err.message);
            });
        }, 5000); // Wait 5 seconds for server to fully start
    }
});

// ==================== CART ROUTES ====================

// Helper: enrich cart items with product details
function enrichCartItems(cartItems) {
    const products = readData(PRODUCTS_FILE);
    return (cartItems || []).map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
            ...item,
            product: product ? {
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
                category: product.category,
                inStock: product.inStock
            } : null
        };
    });
}

// Get current user's cart
app.get("/api/cart", authenticateToken, (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const user = users.find(u => u.id === req.user.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const cart = user.cart || [];
        res.json(enrichCartItems(cart));
    } catch (error) {
        console.error("Get cart error:", error);
        res.status(500).json({ error: "Failed to fetch cart" });
    }
});

// Add or update a cart item
app.post("/api/cart/item", authenticateToken, (req, res) => {
    try {
        const { productId, quantity, size } = req.body;
        if (!productId || typeof quantity !== 'number') {
            return res.status(400).json({ error: "productId and quantity are required" });
        }

        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) return res.status(404).json({ error: "User not found" });

        const cart = users[userIndex].cart || [];
        const matchIndex = cart.findIndex(i => i.productId === productId && i.size === size);
        if (quantity <= 0) {
            // remove if quantity <= 0
            if (matchIndex !== -1) cart.splice(matchIndex, 1);
        } else if (matchIndex !== -1) {
            cart[matchIndex].quantity = quantity;
        } else {
            cart.push({ productId, quantity, size });
        }

        users[userIndex].cart = cart;
        writeData(USERS_FILE, users);

        res.json(enrichCartItems(cart));
    } catch (error) {
        console.error("Update cart item error:", error);
        res.status(500).json({ error: "Failed to update cart item" });
    }
});

// Remove a cart item
app.delete("/api/cart/item", authenticateToken, (req, res) => {
    try {
        const { productId, size } = req.body;
        if (!productId) {
            return res.status(400).json({ error: "productId is required" });
        }

        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) return res.status(404).json({ error: "User not found" });

        const cart = users[userIndex].cart || [];
        users[userIndex].cart = cart.filter(i => !(i.productId === productId && i.size === size));
        writeData(USERS_FILE, users);

        res.json(enrichCartItems(users[userIndex].cart));
    } catch (error) {
        console.error("Delete cart item error:", error);
        res.status(500).json({ error: "Failed to delete cart item" });
    }
});

// Clear cart
app.delete("/api/cart", authenticateToken, (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) return res.status(404).json({ error: "User not found" });

        users[userIndex].cart = [];
        writeData(USERS_FILE, users);

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

// Subscribe to newsletter
app.post("/api/newsletter/subscribe", (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Invalid email format" });
        }
        
        const subscribers = readData(NEWSLETTER_FILE);
        
        // Check if already subscribed
        if (subscribers.find(s => s.email === email)) {
            return res.status(400).json({ error: "Email already subscribed" });
        }
        
        // Add new subscriber
        const newSubscriber = {
            id: Date.now(),
            email: email,
            subscribedAt: new Date().toISOString(),
            active: true
        };
        
        subscribers.push(newSubscriber);
        writeData(NEWSLETTER_FILE, subscribers);
        
        res.json({ success: true, message: "Successfully subscribed to newsletter" });
    } catch (error) {
        console.error("Newsletter subscribe error:", error);
        res.status(500).json({ error: "Failed to subscribe" });
    }
});

// Get all newsletter subscribers (Admin only)
app.get("/api/newsletter/subscribers", authenticateToken, requireAdmin, (req, res) => {
    try {
        const subscribers = readData(NEWSLETTER_FILE);
        res.json(subscribers);
    } catch (error) {
        console.error("Get newsletter subscribers error:", error);
        res.status(500).json({ error: "Failed to get subscribers" });
    }
});

// Export newsletter subscribers as CSV (Admin only)
app.get("/api/newsletter/export", authenticateToken, requireAdmin, (req, res) => {
    try {
        const subscribers = readData(NEWSLETTER_FILE);
        
        // Create CSV content
        const csvHeader = "Email,Subscribed Date,Status\n";
        const csvRows = subscribers.map(s => 
            `${s.email},${new Date(s.subscribedAt).toLocaleDateString()},${s.active ? 'Active' : 'Inactive'}`
        ).join('\n');
        const csv = csvHeader + csvRows;
        
        // Send as downloadable file
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=newsletter-subscribers.csv');
        res.send(csv);
    } catch (error) {
        console.error("Export newsletter error:", error);
        res.status(500).json({ error: "Failed to export subscribers" });
    }
});

// Unsubscribe from newsletter
app.delete("/api/newsletter/unsubscribe", (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }
        
        const subscribers = readData(NEWSLETTER_FILE);
        const index = subscribers.findIndex(s => s.email === email);
        
        if (index === -1) {
            return res.status(404).json({ error: "Email not found" });
        }
        
        // Mark as inactive instead of deleting
        subscribers[index].active = false;
        subscribers[index].unsubscribedAt = new Date().toISOString();
        
        writeData(NEWSLETTER_FILE, subscribers);
        
        res.json({ success: true, message: "Successfully unsubscribed" });
    } catch (error) {
        console.error("Newsletter unsubscribe error:", error);
        res.status(500).json({ error: "Failed to unsubscribe" });
    }
});

// ==================== SYSTEM SETTINGS ROUTES ====================

// Get system settings
app.get("/api/admin/settings", authenticateToken, requireAdmin, (req, res) => {
    try {
        const settings = readData(SETTINGS_FILE);
        res.json(settings);
    } catch (error) {
        console.error("Get settings error:", error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

// Update system settings
app.put("/api/admin/settings", authenticateToken, requireAdmin, (req, res) => {
    try {
        const currentSettings = readData(SETTINGS_FILE);
        const updatedSettings = { ...currentSettings, ...req.body };
        
        // Validate critical fields
        if (updatedSettings.deliveryFee < 0) {
            return res.status(400).json({ error: "Delivery fee cannot be negative" });
        }
        if (updatedSettings.minimumOrder < 0) {
            return res.status(400).json({ error: "Minimum order cannot be negative" });
        }
        if (updatedSettings.taxRate < 0 || updatedSettings.taxRate > 1) {
            return res.status(400).json({ error: "Tax rate must be between 0 and 1" });
        }
        
        writeData(SETTINGS_FILE, updatedSettings);
        res.json({ message: "Settings updated successfully", settings: updatedSettings });
    } catch (error) {
        console.error("Update settings error:", error);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

// ==================== PROMO CODES ROUTES ====================

// Get all promo codes
app.get("/api/admin/promo-codes", authenticateToken, requireAdmin, (req, res) => {
    try {
        const promoCodes = readData(PROMO_CODES_FILE);
        res.json(promoCodes);
    } catch (error) {
        console.error("Get promo codes error:", error);
        res.status(500).json({ error: "Failed to fetch promo codes" });
    }
});

// Create promo code
app.post("/api/admin/promo-codes", authenticateToken, requireAdmin, (req, res) => {
    try {
        const { code, type, value, minOrder, maxDiscount, expiresAt, usageLimit, active } = req.body;
        
        if (!code || !type || !value) {
            return res.status(400).json({ error: "Code, type, and value are required" });
        }
        
        if (!['percentage', 'fixed'].includes(type)) {
            return res.status(400).json({ error: "Type must be 'percentage' or 'fixed'" });
        }
        
        const promoCodes = readData(PROMO_CODES_FILE);
        
        // Check if code already exists
        if (promoCodes.find(p => p.code.toLowerCase() === code.toLowerCase())) {
            return res.status(400).json({ error: "Promo code already exists" });
        }
        
        const newPromoCode = {
            id: Date.now(),
            code: code.toUpperCase(),
            type,
            value: parseFloat(value),
            minOrder: minOrder ? parseFloat(minOrder) : 0,
            maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
            expiresAt: expiresAt || null,
            usageLimit: usageLimit || null,
            usageCount: 0,
            usedBy: [], // track per-user redemption
            active: active !== false,
            createdAt: new Date().toISOString(),
            createdBy: req.user.email
        };
        
        promoCodes.push(newPromoCode);
        writeData(PROMO_CODES_FILE, promoCodes);
        
        res.status(201).json(newPromoCode);
    } catch (error) {
        console.error("Create promo code error:", error);
        res.status(500).json({ error: "Failed to create promo code" });
    }
});

// Update promo code
app.put("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
        const promoCodes = readData(PROMO_CODES_FILE);
        const index = promoCodes.findIndex(p => p.id === parseInt(req.params.id));
        
        if (index === -1) {
            return res.status(404).json({ error: "Promo code not found" });
        }
        
        promoCodes[index] = {
            ...promoCodes[index],
            ...req.body,
            // preserve usedBy and usageCount unless explicitly provided
            usedBy: req.body.usedBy ?? promoCodes[index].usedBy ?? [],
            usageCount: req.body.usageCount ?? promoCodes[index].usageCount ?? 0,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        };
        
        writeData(PROMO_CODES_FILE, promoCodes);
        res.json(promoCodes[index]);
    } catch (error) {
        console.error("Update promo code error:", error);
        res.status(500).json({ error: "Failed to update promo code" });
    }
});

// Delete promo code
app.delete("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
        const promoCodes = readData(PROMO_CODES_FILE);
        const index = promoCodes.findIndex(p => p.id === parseInt(req.params.id));
        
        if (index === -1) {
            return res.status(404).json({ error: "Promo code not found" });
        }
        
        const deleted = promoCodes.splice(index, 1)[0];
        writeData(PROMO_CODES_FILE, promoCodes);
        
        res.json({ message: "Promo code deleted successfully", deletedCode: deleted });
    } catch (error) {
        console.error("Delete promo code error:", error);
        res.status(500).json({ error: "Failed to delete promo code" });
    }
});

// Validate promo code (public endpoint for customers)
app.post("/api/promo-codes/validate", authenticateToken, (req, res) => {
    try {
        const { code, orderTotal } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: "Promo code is required" });
        }
        
        const promoCodes = readData(PROMO_CODES_FILE);
        const promoCode = promoCodes.find(p => p.code.toLowerCase() === code.toLowerCase());
        
        if (!promoCode) {
            return res.status(404).json({ error: "Invalid promo code" });
        }
        
        if (!promoCode.active) {
            return res.status(400).json({ error: "This promo code is no longer active" });
        }
        
        if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) {
            return res.status(400).json({ error: "This promo code has expired" });
        }
        
        if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
            return res.status(400).json({ error: "This promo code has reached its usage limit" });
        }

        // Enforce single use per user
        const userIdentifier = req.user?.id || req.user?.email;
        const usedBy = promoCode.usedBy || [];
        if (userIdentifier && usedBy.includes(userIdentifier)) {
            return res.status(400).json({ error: "This promo code has already been used by your account" });
        }
        
        if (promoCode.minOrder && orderTotal < promoCode.minOrder) {
            return res.status(400).json({ 
                error: `Minimum order of $${promoCode.minOrder.toFixed(2)} required for this promo code` 
            });
        }
        
        // Calculate discount
        let discount = 0;
        if (promoCode.type === 'percentage') {
            discount = (orderTotal * promoCode.value) / 100;
            if (promoCode.maxDiscount && discount > promoCode.maxDiscount) {
                discount = promoCode.maxDiscount;
            }
        } else {
            discount = promoCode.value;
        }
        
        res.json({
            valid: true,
            code: promoCode.code,
            discount: parseFloat(discount.toFixed(2)),
            type: promoCode.type,
            message: `Promo code applied! You save $${discount.toFixed(2)}`
        });
    } catch (error) {
        console.error("Validate promo code error:", error);
        res.status(500).json({ error: "Failed to validate promo code" });
    }
});

// Redeem promo code (marks as used by the current user)
app.post("/api/promo-codes/redeem", authenticateToken, (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: "Promo code is required" });
        }
        
        const promoCodes = readData(PROMO_CODES_FILE);
        const promoCode = promoCodes.find(p => p.code.toLowerCase() === code.toLowerCase());
        
        if (!promoCode) {
            return res.status(404).json({ error: "Invalid promo code" });
        }
        
        if (!promoCode.active) {
            return res.status(400).json({ error: "This promo code is no longer active" });
        }
        
        if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) {
            return res.status(400).json({ error: "This promo code has expired" });
        }
        
        if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
            return res.status(400).json({ error: "This promo code has reached its usage limit" });
        }
        
        const userIdentifier = req.user?.id || req.user?.email;
        const usedBy = promoCode.usedBy || [];
        if (userIdentifier && usedBy.includes(userIdentifier)) {
            return res.status(400).json({ error: "This promo code has already been used by your account" });
        }
        
        // Mark as used
        promoCode.usageCount = (promoCode.usageCount || 0) + 1;
        promoCode.usedBy = [...usedBy, userIdentifier];
        writeData(PROMO_CODES_FILE, promoCodes);
        
        res.json({ success: true, code: promoCode.code });
    } catch (error) {
        console.error("Redeem promo code error:", error);
        res.status(500).json({ error: "Failed to redeem promo code" });
    }
});
