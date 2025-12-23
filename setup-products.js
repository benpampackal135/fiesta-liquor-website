const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Sample products with appealing descriptions and prices
const products = [
    // Whiskey (5 products)
    {
        id: 1,
        name: "Macallan 18 Year Old Single Malt",
        category: "whiskey",
        description: "Aged 18 years in sherry-seasoned oak casks, this exceptional single malt offers rich dried fruit flavors with spice and oak. A true connoisseur's choice.",
        image: "images/macallan18.png",
        price: 299.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 2,
        name: "Johnnie Walker Blue Label",
        category: "whiskey",
        description: "The pinnacle of the Johnnie Walker range, blended from the rarest whiskies. Smooth, complex, and incredibly refined.",
        image: "images/product_2.svg",
        price: 199.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 3,
        name: "Jack Daniel's Single Barrel Select",
        category: "whiskey",
        description: "Hand-selected from the highest floors of our barrel houses for exceptional character. Rich, smooth, and full-bodied.",
        image: "images/product_3.svg",
        price: 54.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 4,
        name: "Woodford Reserve Bourbon",
        category: "whiskey",
        description: "Small batch bourbon with rich, full flavor and smooth, clean finish. Perfect for sipping or mixing.",
        image: "images/product_4.svg",
        price: 39.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 5,
        name: "Jameson Irish Whiskey",
        category: "whiskey",
        description: "Triple-distilled for smoothness, this classic Irish whiskey is perfect for any occasion. Light, crisp, and approachable.",
        image: "images/product_1.svg",
        price: 28.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    
    // Tequila (4 products)
    {
        id: 6,
        name: "Don Julio 1942 Añejo",
        category: "tequila",
        description: "Ultra-premium añejo tequila aged for a minimum of 30 months in American white-oak barrels. Exceptionally smooth with notes of vanilla and caramel.",
        image: "images/product_5.svg",
        price: 149.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 7,
        name: "Patrón Silver",
        category: "tequila",
        description: "100% Blue Weber agave tequila with a clean, crisp taste and smooth finish. The perfect premium tequila for any celebration.",
        image: "images/product_6.svg",
        price: 44.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 8,
        name: "Casa Noble Reposado",
        category: "tequila",
        description: "Aged for 364 days in French white oak barrels, offering complex vanilla and oak notes. Smooth and sophisticated.",
        image: "images/product_7.svg",
        price: 59.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 9,
        name: "Herradura Añejo",
        category: "tequila",
        description: "Aged for 25 months in American white oak barrels, delivering rich caramel and vanilla flavors. A premium sipping tequila.",
        image: "images/product_8.svg",
        price: 54.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    
    // Vodka (4 products)
    {
        id: 10,
        name: "Grey Goose Vodka",
        category: "vodka",
        description: "Premium French vodka made from soft winter wheat and pure spring water. Exceptionally smooth and clean.",
        image: "images/product_9.svg",
        price: 34.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 11,
        name: "Beluga Gold Line",
        category: "vodka",
        description: "Ultra-premium Russian vodka with exceptional smoothness and purity. A luxurious choice for discerning palates.",
        image: "images/product_10.svg",
        price: 89.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 12,
        name: "Tito's Handmade Vodka",
        category: "vodka",
        description: "Gluten-free vodka made from corn, distilled six times for exceptional smoothness. Crafted in Austin, Texas.",
        image: "images/product_11.svg",
        price: 24.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 13,
        name: "Ketel One Vodka",
        category: "vodka",
        description: "Dutch vodka made from 100% wheat, distilled in copper pot stills. Smooth, crisp, and perfectly balanced.",
        image: "images/product_12.svg",
        price: 29.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    
    // Gin (4 products)
    {
        id: 14,
        name: "Hendrick's Gin",
        category: "gin",
        description: "Scottish gin infused with rose petals and cucumber for a unique flavor profile. Uniquely refreshing and aromatic.",
        image: "images/product_13.svg",
        price: 39.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 15,
        name: "Bombay Sapphire",
        category: "gin",
        description: "Premium London dry gin with a distinctive blue bottle and complex botanical blend. Perfect for classic cocktails.",
        image: "images/product_14.svg",
        price: 29.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 16,
        name: "Tanqueray No. Ten",
        category: "gin",
        description: "Premium gin made with whole citrus fruits for a fresh, vibrant taste. Exceptionally smooth and citrus-forward.",
        image: "images/product_15.svg",
        price: 34.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 17,
        name: "Beefeater London Dry Gin",
        category: "gin",
        description: "Classic London dry gin with a perfect balance of juniper and citrus. The quintessential gin for any cocktail.",
        image: "images/product_16.svg",
        price: 24.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    
    // Rum (4 products)
    {
        id: 18,
        name: "Bacardi Superior Rum",
        category: "rum",
        description: "White rum with a light, crisp taste perfect for mixing in cocktails. The world's most awarded rum.",
        image: "images/product_17.svg",
        price: 19.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 19,
        name: "Captain Morgan Spiced Rum",
        category: "rum",
        description: "Smooth spiced rum with notes of vanilla, cinnamon, and nutmeg. Perfect for mixing or sipping.",
        image: "images/product_18.svg",
        price: 22.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 20,
        name: "Mount Gay Eclipse",
        category: "rum",
        description: "Barbados rum with a rich, full-bodied flavor and smooth finish. The oldest rum distillery in the world.",
        image: "images/product_19.svg",
        price: 27.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 21,
        name: "Appleton Estate Reserve",
        category: "rum",
        description: "Jamaican rum with complex flavors of tropical fruit and spice. Aged to perfection for a smooth finish.",
        image: "images/product_20.svg",
        price: 32.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    
    // Beer & Seltzers (6 products)
    {
        id: 22,
        name: "White Claw Hard Seltzer Variety Pack",
        category: "beer-seltzers",
        description: "Refreshing hard seltzer with natural fruit flavors and only 100 calories. Perfect for any occasion.",
        image: "images/product_21.svg",
        price: 15.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 23,
        name: "Truly Hard Seltzer Variety Pack",
        category: "beer-seltzers",
        description: "Hard seltzer with real fruit juice and no artificial sweeteners. Light, refreshing, and delicious.",
        image: "images/product_22.svg",
        price: 14.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 24,
        name: "Corona Extra 12-Pack",
        category: "beer-seltzers",
        description: "Classic Mexican lager with a crisp, refreshing taste. Perfect for any celebration or casual gathering.",
        image: "images/product_23.svg",
        price: 12.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 25,
        name: "Bud Light 12-Pack",
        category: "beer-seltzers",
        description: "Light American lager with a clean, crisp taste. America's favorite light beer.",
        image: "images/product_24.svg",
        price: 11.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 26,
        name: "Heineken 12-Pack",
        category: "beer-seltzers",
        description: "Premium Dutch lager with a distinctive taste and aroma. Brewed with the finest ingredients.",
        image: "images/product_25.svg",
        price: 13.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 27,
        name: "Stella Artois 12-Pack",
        category: "beer-seltzers",
        description: "Belgian lager with a crisp, refreshing taste and golden color. A premium European beer experience.",
        image: "images/product_26.svg",
        price: 14.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    
    // Wine (4 products)
    {
        id: 28,
        name: "Dom Pérignon Vintage Champagne",
        category: "wine",
        description: "Prestigious champagne with fine bubbles and complex aromas of white flowers and citrus. The ultimate celebration wine.",
        image: "images/product_27.svg",
        price: 199.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 29,
        name: "Caymus Cabernet Sauvignon",
        category: "wine",
        description: "Full-bodied Napa Valley cabernet with rich dark fruit flavors and velvety tannins. A world-class wine.",
        image: "images/product_28.svg",
        price: 79.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 30,
        name: "Kendall-Jackson Chardonnay",
        category: "wine",
        description: "Crisp California chardonnay with notes of tropical fruit and vanilla oak. Perfect for any occasion.",
        image: "images/product_29.svg",
        price: 19.99,
        inStock: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 31,
        name: "Moët & Chandon Impérial",
        category: "wine",
        description: "Elegant champagne with bright fruit flavors and a long, refined finish. The perfect toast to any celebration.",
        image: "images/product_30.svg",
        price: 49.99,
        inStock: true,
        createdAt: new Date().toISOString()
    }
];

// Write products to file
fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));

console.log(`✅ Successfully added ${products.length} products to the database!`);
console.log(`📦 Products file: ${PRODUCTS_FILE}`);
console.log('\n📋 Products by category:');
const categories = {};
products.forEach(p => {
    categories[p.category] = (categories[p.category] || 0) + 1;
});
Object.entries(categories).forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count} products`);
});
console.log('\n🚀 Your products are ready! Start the server with: npm start');

