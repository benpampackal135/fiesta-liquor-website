/**
 * Clover POS Integration - Sync Products, Prices, and Inventory
 * 
 * This script syncs products from your Clover POS system to the website.
 * It updates prices and inventory status automatically.
 * 
 * Setup:
 * 1. Get your Clover API credentials from: https://docs.clover.com/
 * 2. Add to .env file:
 *    CLOVER_API_TOKEN=your_api_token
 *    CLOVER_MERCHANT_ID=your_merchant_id
 *    CLOVER_ENVIRONMENT=prod (or sandbox for testing)
 * 3. Run: node clover-sync.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CLOVER_MAPPING_FILE = path.join(DATA_DIR, 'clover-mapping.json');

// Clover API Configuration
const CLOVER_API_TOKEN = process.env.CLOVER_API_TOKEN;
const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
const CLOVER_ENV = process.env.CLOVER_ENVIRONMENT || 'prod';
const CLOVER_BASE_URL = CLOVER_ENV === 'sandbox' 
    ? 'https://sandbox.dev.clover.com'
    : 'https://api.clover.com';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper function to make Clover API requests
function cloverRequest(endpoint, method = 'GET') {
    return new Promise((resolve, reject) => {
        const url = new URL(`${CLOVER_BASE_URL}/v3/merchants/${CLOVER_MERCHANT_ID}${endpoint}`);
        
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Authorization': `Bearer ${CLOVER_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

// Read products from file
function readProducts() {
    try {
        if (fs.existsSync(PRODUCTS_FILE)) {
            const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error reading products:', error);
        return [];
    }
}

// Write products to file
function writeProducts(products) {
    try {
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
        console.log(`✓ Updated ${products.length} products`);
    } catch (error) {
        console.error('Error writing products:', error);
    }
}

// Read Clover mapping (maps Clover item IDs to website product IDs)
function readMapping() {
    try {
        if (fs.existsSync(CLOVER_MAPPING_FILE)) {
            const data = fs.readFileSync(CLOVER_MAPPING_FILE, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        return {};
    }
}

// Write Clover mapping
function writeMapping(mapping) {
    try {
        fs.writeFileSync(CLOVER_MAPPING_FILE, JSON.stringify(mapping, null, 2));
    } catch (error) {
        console.error('Error writing mapping:', error);
    }
}

// Find product by name (fuzzy matching)
function findProductByName(products, name) {
    // Exact match first
    let product = products.find(p => 
        p.name.toLowerCase() === name.toLowerCase()
    );
    
    if (product) return product;
    
    // Partial match
    product = products.find(p => 
        name.toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(name.toLowerCase())
    );
    
    return product;
}

// Sync products from Clover
async function syncFromClover() {
    console.log('🔄 Starting Clover sync...\n');
    
    if (!CLOVER_API_TOKEN || !CLOVER_MERCHANT_ID) {
        console.error('❌ Error: Clover API credentials not found!');
        console.error('Please add to .env file:');
        console.error('  CLOVER_API_TOKEN=your_token');
        console.error('  CLOVER_MERCHANT_ID=your_merchant_id');
        console.error('  CLOVER_ENVIRONMENT=prod (or sandbox)');
        process.exit(1);
    }

    try {
        // Get items from Clover
        console.log('📦 Fetching items from Clover...');
        const cloverItems = await cloverRequest('/items?limit=1000');
        
        if (!cloverItems.elements || cloverItems.elements.length === 0) {
            console.log('⚠️  No items found in Clover');
            return;
        }

        console.log(`✓ Found ${cloverItems.elements.length} items in Clover\n`);

        // Read current products and mapping
        const websiteProducts = readProducts();
        const mapping = readMapping();
        
        let updatedCount = 0;
        let createdCount = 0;
        let skippedCount = 0;

        // Process each Clover item
        for (const cloverItem of cloverItems.elements) {
            // Skip if item is not available or has no price
            if (!cloverItem.available || !cloverItem.price) {
                skippedCount++;
                continue;
            }

            const cloverPrice = cloverItem.price / 100; // Clover stores prices in cents
            const cloverName = cloverItem.name;
            const cloverId = cloverItem.id;
            const inStock = cloverItem.available && (cloverItem.stockCount === null || cloverItem.stockCount > 0);

            // Check if we have a mapping for this Clover item
            let websiteProduct = null;
            if (mapping[cloverId]) {
                websiteProduct = websiteProducts.find(p => p.id === mapping[cloverId]);
            }

            // If no mapping, try to find by name
            if (!websiteProduct) {
                websiteProduct = findProductByName(websiteProducts, cloverName);
                
                // Create mapping if found
                if (websiteProduct) {
                    mapping[cloverId] = websiteProduct.id;
                }
            }

            if (websiteProduct) {
                // Update existing product
                const priceChanged = websiteProduct.price !== cloverPrice;
                const stockChanged = websiteProduct.inStock !== inStock;
                
                websiteProduct.price = cloverPrice;
                websiteProduct.inStock = inStock;
                websiteProduct.updatedAt = new Date().toISOString();
                websiteProduct.cloverId = cloverId; // Store Clover ID for future syncs
                
                if (priceChanged || stockChanged) {
                    updatedCount++;
                    console.log(`✓ Updated: ${cloverName} - $${cloverPrice.toFixed(2)} ${inStock ? '(In Stock)' : '(Out of Stock)'}`);
                }
            } else {
                // Product not found - you can choose to create new products or skip
                // For now, we'll skip and log it
                skippedCount++;
                console.log(`⚠️  Skipped (not in website): ${cloverName} - $${cloverPrice.toFixed(2)}`);
                console.log(`   Tip: Add this product manually or update mapping.json`);
            }
        }

        // Save updated products and mapping
        writeProducts(websiteProducts);
        writeMapping(mapping);

        console.log('\n📊 Sync Summary:');
        console.log(`   ✓ Updated: ${updatedCount} products`);
        console.log(`   ⚠️  Skipped: ${skippedCount} items (not found in website)`);
        console.log(`   📦 Total products: ${websiteProducts.length}`);
        console.log('\n✅ Sync completed successfully!');

    } catch (error) {
        console.error('❌ Error syncing from Clover:', error.message);
        if (error.message.includes('401') || error.message.includes('403')) {
            console.error('   Authentication failed. Please check your API token.');
        } else if (error.message.includes('404')) {
            console.error('   Merchant not found. Please check your merchant ID.');
        }
        process.exit(1);
    }
}

// Manual mapping function - helps create mappings for products
function createMapping(cloverItemId, websiteProductId) {
    const mapping = readMapping();
    mapping[cloverItemId] = websiteProductId;
    writeMapping(mapping);
    console.log(`✓ Created mapping: Clover ${cloverItemId} -> Website ${websiteProductId}`);
}

// Run sync
if (require.main === module) {
    syncFromClover();
}

module.exports = { syncFromClover, createMapping };

