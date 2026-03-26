const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
        ? { rejectUnauthorized: false }
        : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
});

// ── Table creation ──────────────────────────────────────────────────────────

async function initTables() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                image TEXT DEFAULT 'images/product_placeholder.svg',
                price NUMERIC(10,2) DEFAULT 0,
                in_stock BOOLEAN DEFAULT true,
                barcode TEXT,
                sizes JSONB DEFAULT '[]',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS users (
                id BIGINT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT DEFAULT '',
                firebase_uid TEXT,
                is_firebase_user BOOLEAN DEFAULT false,
                password TEXT,
                role TEXT DEFAULT 'customer',
                status TEXT DEFAULT 'active',
                join_date TIMESTAMPTZ DEFAULT NOW(),
                cart JSONB DEFAULT '[]',
                reset_token JSONB,
                status_updated_at TIMESTAMPTZ,
                status_updated_by TEXT,
                role_updated_at TIMESTAMPTZ,
                role_updated_by TEXT
            );

            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer JSONB NOT NULL,
                items JSONB NOT NULL,
                subtotal NUMERIC(10,2),
                delivery_fee NUMERIC(10,2) DEFAULT 0,
                tax NUMERIC(10,2),
                stripe_fee NUMERIC(10,2),
                total NUMERIC(10,2),
                stripe_total NUMERIC(10,2),
                stripe_session_id TEXT,
                order_type TEXT DEFAULT 'pickup',
                store_location JSONB,
                payment_method TEXT DEFAULT 'card',
                delivery_time_estimate TEXT,
                promo JSONB,
                order_date TIMESTAMPTZ DEFAULT NOW(),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                status TEXT DEFAULT 'pending',
                payment_confirmed BOOLEAN DEFAULT false,
                updated_at TIMESTAMPTZ,
                updated_by TEXT,
                cancelled_by TEXT,
                cancelled_at TIMESTAMPTZ,
                cancellation_fee NUMERIC(10,2),
                refund_amount NUMERIC(10,2),
                customer_confirmed BOOLEAN DEFAULT false,
                customer_confirmed_at TIMESTAMPTZ,
                status_history JSONB DEFAULT '[]',
                admin_notes JSONB DEFAULT '[]',
                refunds JSONB DEFAULT '[]',
                refunded_amount NUMERIC(10,2) DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS newsletter (
                id BIGINT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                subscribed_at TIMESTAMPTZ DEFAULT NOW(),
                active BOOLEAN DEFAULT true,
                unsubscribed_at TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                data JSONB NOT NULL
            );

            CREATE TABLE IF NOT EXISTS promo_codes (
                id BIGINT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                type TEXT NOT NULL,
                value NUMERIC(10,2) NOT NULL,
                min_order NUMERIC(10,2) DEFAULT 0,
                max_discount NUMERIC(10,2),
                expires_at TIMESTAMPTZ,
                usage_limit INTEGER,
                usage_count INTEGER DEFAULT 0,
                used_by JSONB DEFAULT '[]',
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by TEXT,
                updated_at TIMESTAMPTZ,
                updated_by TEXT
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id BIGINT PRIMARY KEY,
                name TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS product_requests (
                id BIGINT PRIMARY KEY,
                name TEXT NOT NULL,
                product_name TEXT NOT NULL,
                message TEXT DEFAULT '',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                status TEXT DEFAULT 'pending'
            );

            CREATE TABLE IF NOT EXISTS user_orders (
                user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, order_id)
            );
        `);

        // Add missing columns to existing tables (safe to run multiple times)
        const migrations = [
            // products
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT true`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '[]'`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT DEFAULT 'images/product_placeholder.svg'`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0`,
            // users
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_firebase_user BOOLEAN DEFAULT false`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS cart JSONB DEFAULT '[]'`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token JSONB`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS status_updated_by TEXT`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS role_updated_at TIMESTAMPTZ`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS role_updated_by TEXT`,
            // orders
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_total NUMERIC(10,2)`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'pickup'`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_location JSONB`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card'`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time_estimate TEXT`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo JSONB`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT NOW()`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN DEFAULT false`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_by TEXT`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10,2)`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2)`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_confirmed BOOLEAN DEFAULT false`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]'`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunds JSONB DEFAULT '[]'`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) DEFAULT 0`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_fee NUMERIC(10,2)`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0`,
        ];

        for (const sql of migrations) {
            try { await client.query(sql); } catch (e) { /* column may already exist */ }
        }

        console.log('✅ PostgreSQL tables initialized');
    } finally {
        client.release();
    }
}

// ── Helper: convert DB row → JSON-compatible product ────────────────────────

function rowToProduct(row) {
    return {
        id: row.id,
        name: row.name,
        category: row.category,
        description: row.description,
        image: row.image,
        price: parseFloat(row.price),
        inStock: row.in_stock,
        barcode: row.barcode || undefined,
        sizes: row.sizes || [],
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined
    };
}

function rowToUser(row) {
    return {
        id: Number(row.id),
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        firebaseUid: row.firebase_uid || null,
        isFirebaseUser: row.is_firebase_user || false,
        password: row.password || null,
        role: row.role || 'customer',
        status: row.status || 'active',
        joinDate: row.join_date ? row.join_date.toISOString() : undefined,
        cart: row.cart || [],
        resetToken: row.reset_token || undefined,
        statusUpdatedAt: row.status_updated_at ? row.status_updated_at.toISOString() : undefined,
        statusUpdatedBy: row.status_updated_by || undefined,
        roleUpdatedAt: row.role_updated_at ? row.role_updated_at.toISOString() : undefined,
        roleUpdatedBy: row.role_updated_by || undefined
    };
}

function rowToOrder(row) {
    return {
        id: row.id,
        customer: row.customer,
        items: row.items,
        subtotal: parseFloat(row.subtotal || 0),
        deliveryFee: parseFloat(row.delivery_fee || 0),
        tax: parseFloat(row.tax || 0),
        stripeFee: parseFloat(row.stripe_fee || 0),
        total: parseFloat(row.total || 0),
        stripeTotal: row.stripe_total ? parseFloat(row.stripe_total) : null,
        stripeSessionId: row.stripe_session_id || null,
        orderType: row.order_type || 'pickup',
        storeLocation: row.store_location || null,
        paymentMethod: row.payment_method || 'card',
        deliveryTimeEstimate: row.delivery_time_estimate || null,
        promo: row.promo || null,
        orderDate: row.order_date ? row.order_date.toISOString() : undefined,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        status: row.status || 'pending',
        paymentConfirmed: row.payment_confirmed || false,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined,
        updatedBy: row.updated_by || undefined,
        cancelledBy: row.cancelled_by || undefined,
        cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : undefined,
        cancellationFee: row.cancellation_fee ? parseFloat(row.cancellation_fee) : undefined,
        refundAmount: row.refund_amount ? parseFloat(row.refund_amount) : undefined,
        customerConfirmed: row.customer_confirmed || false,
        customerConfirmedAt: row.customer_confirmed_at ? row.customer_confirmed_at.toISOString() : undefined,
        statusHistory: row.status_history || [],
        adminNotes: row.admin_notes || [],
        refunds: row.refunds || [],
        refundedAmount: parseFloat(row.refunded_amount || 0)
    };
}

function rowToNewsletter(row) {
    return {
        id: Number(row.id),
        email: row.email,
        subscribedAt: row.subscribed_at ? row.subscribed_at.toISOString() : undefined,
        active: row.active,
        unsubscribedAt: row.unsubscribed_at ? row.unsubscribed_at.toISOString() : undefined
    };
}

function rowToPromoCode(row) {
    return {
        id: Number(row.id),
        code: row.code,
        type: row.type,
        value: parseFloat(row.value),
        minOrder: parseFloat(row.min_order || 0),
        maxDiscount: row.max_discount ? parseFloat(row.max_discount) : null,
        expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
        usageLimit: row.usage_limit || null,
        usageCount: row.usage_count || 0,
        usedBy: row.used_by || [],
        active: row.active,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        createdBy: row.created_by || undefined,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined,
        updatedBy: row.updated_by || undefined
    };
}

function rowToReview(row) {
    return {
        id: Number(row.id),
        name: row.name,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined
    };
}

function rowToProductRequest(row) {
    return {
        id: Number(row.id),
        name: row.name,
        productName: row.product_name,
        message: row.message || '',
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        status: row.status || 'pending'
    };
}

// ── Products ────────────────────────────────────────────────────────────────

const products = {
    async getAll() {
        const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
        return rows.map(rowToProduct);
    },
    async getById(id) {
        const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        return rows[0] ? rowToProduct(rows[0]) : null;
    },
    async create(p) {
        const { rows } = await pool.query(
            `INSERT INTO products (name, category, description, image, price, in_stock, barcode, sizes, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [p.name, p.category, p.description || '', p.image || 'images/product_placeholder.svg',
             p.price || 0, p.inStock !== false, p.barcode || null,
             JSON.stringify(p.sizes || []), p.createdAt || new Date().toISOString()]
        );
        return rowToProduct(rows[0]);
    },
    async createWithId(p) {
        const { rows } = await pool.query(
            `INSERT INTO products (id, name, category, description, image, price, in_stock, barcode, sizes, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [p.id, p.name, p.category, p.description || '', p.image || 'images/product_placeholder.svg',
             p.price || 0, p.inStock !== false, p.barcode || null,
             JSON.stringify(p.sizes || []), p.createdAt || new Date().toISOString(),
             p.updatedAt || null]
        );
        return rowToProduct(rows[0]);
    },
    async update(id, data) {
        const current = await this.getById(id);
        if (!current) return null;
        const merged = { ...current, ...data, id, updatedAt: new Date().toISOString() };
        const { rows } = await pool.query(
            `UPDATE products SET name=$1, category=$2, description=$3, image=$4, price=$5,
             in_stock=$6, barcode=$7, sizes=$8, updated_at=$9 WHERE id=$10 RETURNING *`,
            [merged.name, merged.category, merged.description, merged.image, merged.price,
             merged.inStock, merged.barcode || null, JSON.stringify(merged.sizes || []),
             merged.updatedAt, id]
        );
        return rows[0] ? rowToProduct(rows[0]) : null;
    },
    async delete(id) {
        const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
        return rowCount > 0;
    },
    async count() {
        const { rows } = await pool.query('SELECT COUNT(*) FROM products');
        return parseInt(rows[0].count);
    },
    async getNextId() {
        const { rows } = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products');
        return rows[0].next_id;
    }
};

// ── Users ───────────────────────────────────────────────────────────────────

const users = {
    async getAll() {
        const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
        return rows.map(rowToUser);
    },
    async getById(id) {
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return rows[0] ? rowToUser(rows[0]) : null;
    },
    async getByEmail(email) {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return rows[0] ? rowToUser(rows[0]) : null;
    },
    async getByFirebaseUid(uid) {
        const { rows } = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [uid]);
        return rows[0] ? rowToUser(rows[0]) : null;
    },
    async create(u) {
        const { rows } = await pool.query(
            `INSERT INTO users (id, name, email, phone, firebase_uid, is_firebase_user, password, role, status, join_date, cart)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [u.id, u.name, u.email, u.phone || '', u.firebaseUid || null,
             u.isFirebaseUser || false, u.password || null, u.role || 'customer',
             u.status || 'active', u.joinDate || new Date().toISOString(),
             JSON.stringify(u.cart || [])]
        );
        return rowToUser(rows[0]);
    },
    async update(id, data) {
        // Build dynamic update
        const fields = [];
        const values = [];
        let idx = 1;

        const map = {
            name: 'name', email: 'email', phone: 'phone',
            firebaseUid: 'firebase_uid', isFirebaseUser: 'is_firebase_user',
            password: 'password', role: 'role', status: 'status',
            cart: 'cart', resetToken: 'reset_token',
            statusUpdatedAt: 'status_updated_at', statusUpdatedBy: 'status_updated_by',
            roleUpdatedAt: 'role_updated_at', roleUpdatedBy: 'role_updated_by'
        };

        for (const [jsKey, dbKey] of Object.entries(map)) {
            if (data[jsKey] !== undefined) {
                let val = data[jsKey];
                if (dbKey === 'cart' || dbKey === 'reset_token') val = JSON.stringify(val);
                fields.push(`${dbKey} = $${idx}`);
                values.push(val);
                idx++;
            }
        }

        if (fields.length === 0) return this.getById(id);

        values.push(id);
        const { rows } = await pool.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        return rows[0] ? rowToUser(rows[0]) : null;
    },
    async delete(id) {
        const { rows } = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);
        return rows[0] ? rowToUser(rows[0]) : null;
    },
    async countAdmins() {
        const { rows } = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
        return parseInt(rows[0].count);
    }
};

// ── Orders ──────────────────────────────────────────────────────────────────

const orders = {
    async getAll() {
        const { rows } = await pool.query('SELECT * FROM orders ORDER BY id');
        return rows.map(rowToOrder);
    },
    async getByEmail(email) {
        const { rows } = await pool.query(
            "SELECT * FROM orders WHERE LOWER(customer->>'email') = LOWER($1) ORDER BY id DESC", [email]
        );
        return rows.map(rowToOrder);
    },
    async getByUserId(userId) {
        const { rows } = await pool.query(
            `SELECT o.* FROM orders o
             JOIN user_orders uo ON o.id = uo.order_id
             WHERE uo.user_id = $1
             ORDER BY o.id DESC`, [userId]
        );
        return rows.map(rowToOrder);
    },
    async getById(id) {
        const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        return rows[0] ? rowToOrder(rows[0]) : null;
    },
    async getByStripeSession(sessionId) {
        const { rows } = await pool.query('SELECT * FROM orders WHERE stripe_session_id = $1', [sessionId]);
        return rows[0] ? rowToOrder(rows[0]) : null;
    },
    async create(o) {
        const { rows } = await pool.query(
            `INSERT INTO orders (customer, items, subtotal, delivery_fee, tax, stripe_fee, total,
             stripe_total, stripe_session_id, order_type, store_location, payment_method,
             delivery_time_estimate, promo, order_date, status, payment_confirmed)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
            [JSON.stringify(o.customer), JSON.stringify(o.items), o.subtotal, o.deliveryFee || 0,
             o.tax, o.stripeFee, o.total, o.stripeTotal || null, o.stripeSessionId || null,
             o.orderType || 'pickup', o.storeLocation ? JSON.stringify(o.storeLocation) : null,
             o.paymentMethod || 'card', o.deliveryTimeEstimate || null,
             o.promo ? JSON.stringify(o.promo) : null,
             o.orderDate || new Date().toISOString(), o.status || 'pending',
             o.paymentConfirmed || false]
        );
        return rowToOrder(rows[0]);
    },
    async createWithId(o) {
        const { rows } = await pool.query(
            `INSERT INTO orders (id, customer, items, subtotal, delivery_fee, tax, stripe_fee, total,
             stripe_total, stripe_session_id, order_type, store_location, payment_method,
             delivery_time_estimate, promo, order_date, created_at, status, payment_confirmed,
             updated_at, updated_by, cancelled_by, cancelled_at, cancellation_fee, refund_amount,
             customer_confirmed, customer_confirmed_at, status_history, admin_notes, refunds, refunded_amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) RETURNING *`,
            [o.id, JSON.stringify(o.customer), JSON.stringify(o.items), o.subtotal, o.deliveryFee || 0,
             o.tax, o.stripeFee, o.total, o.stripeTotal || null, o.stripeSessionId || null,
             o.orderType || 'pickup', o.storeLocation ? JSON.stringify(o.storeLocation) : null,
             o.paymentMethod || 'card', o.deliveryTimeEstimate || null,
             o.promo ? JSON.stringify(o.promo) : null,
             o.orderDate || new Date().toISOString(), o.createdAt || new Date().toISOString(),
             o.status || 'pending', o.paymentConfirmed || false,
             o.updatedAt || null, o.updatedBy || null, o.cancelledBy || null, o.cancelledAt || null,
             o.cancellationFee || null, o.refundAmount || null,
             o.customerConfirmed || false, o.customerConfirmedAt || null,
             JSON.stringify(o.statusHistory || []), JSON.stringify(o.adminNotes || []),
             JSON.stringify(o.refunds || []), o.refundedAmount || 0]
        );
        return rowToOrder(rows[0]);
    },
    async update(id, data) {
        const fields = [];
        const values = [];
        let idx = 1;

        const map = {
            customer: ['customer', true], items: ['items', true],
            subtotal: ['subtotal'], deliveryFee: ['delivery_fee'],
            tax: ['tax'], stripeFee: ['stripe_fee'], total: ['total'],
            stripeTotal: ['stripe_total'], stripeSessionId: ['stripe_session_id'],
            orderType: ['order_type'], storeLocation: ['store_location', true],
            paymentMethod: ['payment_method'], deliveryTimeEstimate: ['delivery_time_estimate'],
            promo: ['promo', true], status: ['status'], paymentConfirmed: ['payment_confirmed'],
            updatedAt: ['updated_at'], updatedBy: ['updated_by'],
            cancelledBy: ['cancelled_by'], cancelledAt: ['cancelled_at'],
            cancellationFee: ['cancellation_fee'], refundAmount: ['refund_amount'],
            customerConfirmed: ['customer_confirmed'], customerConfirmedAt: ['customer_confirmed_at'],
            statusHistory: ['status_history', true], adminNotes: ['admin_notes', true],
            refunds: ['refunds', true], refundedAmount: ['refunded_amount']
        };

        for (const [jsKey, [dbKey, isJson]] of Object.entries(map)) {
            if (data[jsKey] !== undefined) {
                fields.push(`${dbKey} = $${idx}`);
                values.push(isJson ? JSON.stringify(data[jsKey]) : data[jsKey]);
                idx++;
            }
        }

        if (fields.length === 0) return this.getById(id);

        values.push(id);
        const { rows } = await pool.query(
            `UPDATE orders SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        return rows[0] ? rowToOrder(rows[0]) : null;
    }
};

// ── User-Orders link ────────────────────────────────────────────────────────

const userOrders = {
    async link(userId, orderId) {
        await pool.query(
            'INSERT INTO user_orders (user_id, order_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, orderId]
        );
    },
    async getOrderIds(userId) {
        const { rows } = await pool.query(
            'SELECT order_id FROM user_orders WHERE user_id = $1 ORDER BY order_id',
            [userId]
        );
        return rows.map(r => r.order_id);
    }
};

// ── Newsletter ──────────────────────────────────────────────────────────────

const newsletter = {
    async getAll() {
        const { rows } = await pool.query('SELECT * FROM newsletter ORDER BY id');
        return rows.map(rowToNewsletter);
    },
    async getByEmail(email) {
        const { rows } = await pool.query('SELECT * FROM newsletter WHERE email = $1', [email]);
        return rows[0] ? rowToNewsletter(rows[0]) : null;
    },
    async create(s) {
        const { rows } = await pool.query(
            'INSERT INTO newsletter (id, email, subscribed_at, active) VALUES ($1,$2,$3,$4) RETURNING *',
            [s.id || Date.now(), s.email, s.subscribedAt || new Date().toISOString(), s.active !== false]
        );
        return rowToNewsletter(rows[0]);
    },
    async update(email, data) {
        const fields = [];
        const values = [];
        let idx = 1;
        if (data.active !== undefined) { fields.push(`active = $${idx}`); values.push(data.active); idx++; }
        if (data.unsubscribedAt !== undefined) { fields.push(`unsubscribed_at = $${idx}`); values.push(data.unsubscribedAt); idx++; }
        if (fields.length === 0) return;
        values.push(email);
        const { rows } = await pool.query(
            `UPDATE newsletter SET ${fields.join(', ')} WHERE email = $${idx} RETURNING *`, values
        );
        return rows[0] ? rowToNewsletter(rows[0]) : null;
    }
};

// ── Settings ────────────────────────────────────────────────────────────────

const settings = {
    async get() {
        const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
        return rows[0] ? rows[0].data : null;
    },
    async set(data) {
        await pool.query(
            `INSERT INTO settings (id, data) VALUES (1, $1)
             ON CONFLICT (id) DO UPDATE SET data = $1`,
            [JSON.stringify(data)]
        );
    }
};

// ── Promo Codes ─────────────────────────────────────────────────────────────

const promoCodes = {
    async getAll() {
        const { rows } = await pool.query('SELECT * FROM promo_codes ORDER BY id');
        return rows.map(rowToPromoCode);
    },
    async getById(id) {
        const { rows } = await pool.query('SELECT * FROM promo_codes WHERE id = $1', [id]);
        return rows[0] ? rowToPromoCode(rows[0]) : null;
    },
    async getByCode(code) {
        const { rows } = await pool.query('SELECT * FROM promo_codes WHERE LOWER(code) = LOWER($1)', [code]);
        return rows[0] ? rowToPromoCode(rows[0]) : null;
    },
    async create(p) {
        const { rows } = await pool.query(
            `INSERT INTO promo_codes (id, code, type, value, min_order, max_discount, expires_at,
             usage_limit, usage_count, used_by, active, created_at, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [p.id || Date.now(), p.code, p.type, p.value, p.minOrder || 0, p.maxDiscount || null,
             p.expiresAt || null, p.usageLimit || null, p.usageCount || 0,
             JSON.stringify(p.usedBy || []), p.active !== false,
             p.createdAt || new Date().toISOString(), p.createdBy || null]
        );
        return rowToPromoCode(rows[0]);
    },
    async update(id, data) {
        const fields = [];
        const values = [];
        let idx = 1;
        const map = {
            code: 'code', type: 'type', value: 'value', minOrder: 'min_order',
            maxDiscount: 'max_discount', expiresAt: 'expires_at', usageLimit: 'usage_limit',
            usageCount: 'usage_count', active: 'active',
            updatedAt: 'updated_at', updatedBy: 'updated_by'
        };
        for (const [jsKey, dbKey] of Object.entries(map)) {
            if (data[jsKey] !== undefined) {
                fields.push(`${dbKey} = $${idx}`); values.push(data[jsKey]); idx++;
            }
        }
        if (data.usedBy !== undefined) {
            fields.push(`used_by = $${idx}`); values.push(JSON.stringify(data.usedBy)); idx++;
        }
        if (fields.length === 0) return this.getById(id);
        values.push(id);
        const { rows } = await pool.query(
            `UPDATE promo_codes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
        );
        return rows[0] ? rowToPromoCode(rows[0]) : null;
    },
    async delete(id) {
        const { rows } = await pool.query('DELETE FROM promo_codes WHERE id = $1 RETURNING *', [id]);
        return rows[0] ? rowToPromoCode(rows[0]) : null;
    }
};

// ── Reviews ─────────────────────────────────────────────────────────────────

const reviews = {
    async getAll() {
        const { rows } = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC');
        return rows.map(rowToReview);
    },
    async create(r) {
        const { rows } = await pool.query(
            'INSERT INTO reviews (id, name, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [r.id || Date.now(), r.name, r.rating, r.comment, r.createdAt || new Date().toISOString()]
        );
        return rowToReview(rows[0]);
    }
};

// ── Product Requests ────────────────────────────────────────────────────────

const productRequests = {
    async getAll() {
        const { rows } = await pool.query('SELECT * FROM product_requests ORDER BY created_at DESC');
        return rows.map(rowToProductRequest);
    },
    async create(r) {
        const { rows } = await pool.query(
            'INSERT INTO product_requests (id, name, product_name, message, created_at, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [r.id || Date.now(), r.name, r.productName, r.message || '', r.createdAt || new Date().toISOString(), r.status || 'pending']
        );
        return rowToProductRequest(rows[0]);
    }
};

module.exports = {
    pool,
    initTables,
    products,
    users,
    userOrders,
    orders,
    newsletter,
    settings,
    promoCodes,
    reviews,
    productRequests
};
