/**
 * One-time migration: JSON files → PostgreSQL
 *
 * Usage:
 *   DATABASE_URL=postgres://... node migrate.js
 *
 * Safe to run multiple times — checks for existing data before inserting.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

function readJSON(filename) {
    const file = path.join(DATA_DIR, filename);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

async function migrate() {
    console.log('🚀 Starting migration from JSON files to PostgreSQL...');
    console.log(`   Data directory: ${DATA_DIR}`);

    // Create tables
    await db.initTables();

    // ── Products ──
    const products = readJSON('products.json');
    if (products && products.length > 0) {
        const existing = await db.products.count();
        if (existing === 0) {
            console.log(`📦 Migrating ${products.length} products...`);
            for (const p of products) {
                await db.products.createWithId(p);
            }
            // Reset sequence to max id
            await db.pool.query("SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products))");
            console.log(`   ✅ ${products.length} products migrated`);
        } else {
            console.log(`   ⏭️  Products table already has ${existing} rows, skipping`);
        }
    }

    // ── Users ──
    const usersData = readJSON('users.json');
    if (usersData && usersData.length > 0) {
        const existingUsers = await db.users.getAll();
        if (existingUsers.length === 0) {
            console.log(`👤 Migrating ${usersData.length} users...`);
            for (const u of usersData) {
                await db.users.create(u);
            }
            console.log(`   ✅ ${usersData.length} users migrated`);
        } else {
            console.log(`   ⏭️  Users table already has ${existingUsers.length} rows, skipping`);
        }
    }

    // ── Orders ──
    const ordersData = readJSON('orders.json');
    if (ordersData && ordersData.length > 0) {
        const { rows } = await db.pool.query('SELECT COUNT(*) FROM orders');
        const existingOrders = parseInt(rows[0].count);
        if (existingOrders === 0) {
            console.log(`📋 Migrating ${ordersData.length} orders...`);
            for (const o of ordersData) {
                await db.orders.createWithId(o);
            }
            // Reset sequence
            await db.pool.query("SELECT setval('orders_id_seq', (SELECT COALESCE(MAX(id), 1) FROM orders))");
            console.log(`   ✅ ${ordersData.length} orders migrated`);

            // Link users to orders
            if (usersData) {
                for (const u of usersData) {
                    if (u.orders && u.orders.length > 0) {
                        for (const orderId of u.orders) {
                            await db.userOrders.link(u.id, orderId);
                        }
                    }
                }
                console.log('   ✅ User-order links created');
            }
        } else {
            console.log(`   ⏭️  Orders table already has ${existingOrders} rows, skipping`);
        }
    }

    // ── Newsletter ──
    const newsletterData = readJSON('newsletter.json');
    if (newsletterData && newsletterData.length > 0) {
        const existing = await db.newsletter.getAll();
        if (existing.length === 0) {
            console.log(`📧 Migrating ${newsletterData.length} newsletter subscribers...`);
            for (const s of newsletterData) {
                await db.newsletter.create(s);
            }
            console.log(`   ✅ ${newsletterData.length} subscribers migrated`);
        } else {
            console.log(`   ⏭️  Newsletter table already has ${existing.length} rows, skipping`);
        }
    }

    // ── Settings ──
    const settingsData = readJSON('settings.json');
    if (settingsData) {
        const existing = await db.settings.get();
        if (!existing) {
            console.log('⚙️  Migrating settings...');
            await db.settings.set(settingsData);
            console.log('   ✅ Settings migrated');
        } else {
            console.log('   ⏭️  Settings already exist, skipping');
        }
    }

    // ── Promo Codes ──
    const promoData = readJSON('promo-codes.json');
    if (promoData && promoData.length > 0) {
        const existing = await db.promoCodes.getAll();
        if (existing.length === 0) {
            console.log(`🎟️  Migrating ${promoData.length} promo codes...`);
            for (const p of promoData) {
                await db.promoCodes.create(p);
            }
            console.log(`   ✅ ${promoData.length} promo codes migrated`);
        } else {
            console.log(`   ⏭️  Promo codes table already has ${existing.length} rows, skipping`);
        }
    }

    // ── Reviews ──
    const reviewsData = readJSON('reviews.json');
    if (reviewsData && reviewsData.length > 0) {
        const existing = await db.reviews.getAll();
        if (existing.length === 0) {
            console.log(`⭐ Migrating ${reviewsData.length} reviews...`);
            for (const r of reviewsData) {
                await db.reviews.create(r);
            }
            console.log(`   ✅ ${reviewsData.length} reviews migrated`);
        } else {
            console.log(`   ⏭️  Reviews table already has ${existing.length} rows, skipping`);
        }
    }

    // ── Product Requests ──
    const requestsData = readJSON('product-requests.json');
    if (requestsData && requestsData.length > 0) {
        const existing = await db.productRequests.getAll();
        if (existing.length === 0) {
            console.log(`📝 Migrating ${requestsData.length} product requests...`);
            for (const r of requestsData) {
                await db.productRequests.create(r);
            }
            console.log(`   ✅ ${requestsData.length} product requests migrated`);
        } else {
            console.log(`   ⏭️  Product requests table already has ${existing.length} rows, skipping`);
        }
    }

    console.log('\n🎉 Migration complete!');
    await db.pool.end();
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
