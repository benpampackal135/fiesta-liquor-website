// Product Data - loaded from API
let products = [];

// Cart Management
let cart = [];
let currentFilter = 'all';
let deliveryOption = 'pickup'; // 'pickup' or 'delivery'
let deliveryFee = 0;
let currentUser = getCurrentUser();
let isLoading = false;

// Cookie Helper Functions (made global for use in other scripts)
window.setCookie = function(name, value, days = 30) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

window.getCookie = function(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
    }
    return null;
};

window.deleteCookie = function(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

// Get user identifier for cookie name (made global)
window.getCartCookieName = function() {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    const userId = user?.id || user?.email || firebaseUser?.uid || firebaseUser?.email || 'guest';
    return `cart_${userId}`;
};

// Local references for convenience
const setCookie = window.setCookie;
const getCookie = window.getCookie;
const deleteCookie = window.deleteCookie;
const getCartCookieName = window.getCartCookieName;

// Initialize the website
document.addEventListener('DOMContentLoaded', async function() {
    // IMMEDIATE: Hide mobile checkout and ensure cart is closed on page load
    const cartSidebar = document.getElementById('cartSidebar');
    const mobileCheckoutFixed = document.getElementById('mobileCheckoutFixed');
    
    if (cartSidebar) {
        cartSidebar.classList.remove('open'); // Ensure cart is closed
    }
    
    if (mobileCheckoutFixed) {
        mobileCheckoutFixed.style.display = 'none';
        mobileCheckoutFixed.style.visibility = 'hidden';
        mobileCheckoutFixed.style.opacity = '0';
        mobileCheckoutFixed.style.pointerEvents = 'none';
    }
    
    // IMMEDIATE CHECK: Change Account button to Admin Dashboard if stored user is admin
    const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (storedUser && storedUser.role === 'admin') {
        const accountLink = document.getElementById('accountLink');
        if (accountLink) {
            accountLink.href = '/admin-dashboard.html';
            accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
            console.log('✅ IMMEDIATE: Account button changed to Admin Dashboard for stored admin');
        }
    }
    
    // Wait for Firebase auth to restore if using Firebase
    const firebaseUserCheck = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    if (firebaseUserCheck && typeof firebase !== 'undefined' && firebase.auth) {
        console.log('⏳ Waiting for Firebase auth state to restore...');
        await new Promise((resolve) => {
            const auth = firebase.auth();
            let resolved = false;
            const unsubscribe = auth.onAuthStateChanged((user) => {
                if (!resolved) {
                    resolved = true;
                    console.log('✅ Firebase auth state restored:', user ? user.email : 'null');
                    unsubscribe();
                    setTimeout(resolve, 500); // Small delay to ensure state is fully restored
                }
            });
            // Timeout after 3 seconds
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    unsubscribe();
                    console.log('⏰ Firebase auth restore timeout');
                    resolve();
                }
            }, 3000);
        });
    }
    
    // Check authentication after Firebase is ready
    await checkUserAuth();
    
    // Update UI after auth check (for account button display)
    if (typeof updateAuthUI === 'function') {
        updateAuthUI();
    }
    
    // Load cart from localStorage (server sync happens during login)
    loadCartFromStorage();
    
    await loadProducts();
    displayProducts();
    displayBestSellers();
    
    // Expand compressed cart if needed (after products are loaded)
    expandCompressedCart();
    
    updateCartCount();
    updateCartDisplay();
    setupSearch();
    setupDeliveryOptions();
    setupNavigation();
    setupStripeCheckout();
    
    // Final check: Ensure header name is always just first name
    setTimeout(() => {
        const userNameElement = document.getElementById('userName');
        if (userNameElement && currentUser) {
            const currentText = userNameElement.textContent;
            // If it contains a full name (has spaces after "Welcome,"), fix it
            if (currentText.includes('Welcome,')) {
                const namePart = currentText.replace('Welcome,', '').trim();
                if (namePart.includes(' ')) {
                    userNameElement.textContent = `Welcome, ${getFirstName(namePart)}`;
                }
            } else if (currentUser.name) {
                userNameElement.textContent = `Welcome, ${getFirstName(currentUser.name)}`;
            }
        }
    }, 100);
    
    // Watch for changes to userName element and ensure it's always first name only
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        const observer = new MutationObserver(() => {
            const currentText = userNameElement.textContent;
            if (currentText.includes('Welcome,')) {
                const namePart = currentText.replace('Welcome,', '').trim();
                // If name part has spaces (full name), fix it to first name only
                if (namePart.includes(' ')) {
                    const firstName = getFirstName(namePart);
                    if (namePart !== firstName) {
                        userNameElement.textContent = `Welcome, ${firstName}`;
                    }
                }
            }
        });
        observer.observe(userNameElement, { childList: true, characterData: true, subtree: true });
    }
});

// Merge two carts, combining quantities for duplicate items
function mergeCartItems(cart1, cart2) {
    const merged = [...cart1];
    
    cart2.forEach(item2 => {
        const existingIndex = merged.findIndex(item1 => 
            item1.productId === item2.productId && item1.size === item2.size
        );
        
        if (existingIndex >= 0) {
            merged[existingIndex].quantity += item2.quantity;
        } else {
            merged.push(item2);
        }
    });
    
    return merged;
}

// Load products from API
async function loadProducts() {
    try {
        isLoading = true;
        showLoadingState();
        console.log('🔄 Loading products from API...');
        products = await productsAPI.getAll();
        
        console.log(`✅ Loaded ${products.length} products from API`);
        console.log('First product:', products[0]);
        
        // Products are loaded from database
        if (products.length === 0) {
            console.log('No products found. Run: node setup-products.js');
            showError('No products found. Please run: node setup-products.js');
        }
    } catch (error) {
        console.error('❌ Failed to load products:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Check if server is running
        const errorMsg = error.message.includes('fetch') || error.message.includes('Failed to fetch')
            ? 'Cannot connect to server. Make sure the server is running (npm start)'
            : `Failed to load products: ${error.message}`;
        
        showError(errorMsg);
        // Fallback to empty array
        products = [];
    } finally {
        isLoading = false;
        hideLoadingState();
    }
}


// Show loading state
function showLoadingState() {
    const productsGrid = document.getElementById('productsGrid');
    if (productsGrid) {
        productsGrid.innerHTML = '<div style="text-align: center; padding: 3rem; color: #666;"><i class="fas fa-spinner fa-spin" style="font-size: 3rem;"></i><p>Loading products...</p></div>';
    }
}

// Hide loading state
function hideLoadingState() {
    // Loading state will be replaced by displayProducts()
}

// Show error message
function showError(message) {
    const productsGrid = document.getElementById('productsGrid');
    if (productsGrid) {
        productsGrid.innerHTML = `<div style="text-align: center; padding: 3rem; color: #ff6b6b;"><i class="fas fa-exclamation-triangle" style="font-size: 3rem;"></i><p>${message}</p></div>`;
    }
}

// Display best sellers (shows top 8 products, or products marked as bestSeller)
// IMPORTANT: Only shows products that have a 750ml size option
function displayBestSellers() {
    const bestSellersGrid = document.getElementById('bestSellersGrid');
    if (!bestSellersGrid) return;
    
    // Helper function to check if product has 750ml size
    const has750mlSize = (product) => {
        if (Array.isArray(product.sizes) && product.sizes.length > 0) {
            return product.sizes.some(size => size.size === '750ml' || size.size === '750 ml');
        }
        return false;
    };
    
    // Get best sellers - filter to only include products with 750ml size and in stock
    let bestSellers = products.filter(p => 
        p.inStock !== false && 
        has750mlSize(p)
    );
    
    // If products have a bestSeller flag, use that, otherwise show top 8 premium items
    if (bestSellers.some(p => p.bestSeller)) {
        bestSellers = bestSellers.filter(p => p.bestSeller).slice(0, 8);
    } else {
        // Show top 8 most expensive items (premium selection) that have 750ml
        bestSellers = bestSellers
            .sort((a, b) => {
                // Sort by 750ml price if available, otherwise by base price
                const aPrice = a.sizes?.find(s => s.size === '750ml' || s.size === '750 ml')?.price || a.price || 0;
                const bPrice = b.sizes?.find(s => s.size === '750ml' || s.size === '750 ml')?.price || b.price || 0;
                return bPrice - aPrice;
            })
            .slice(0, 8);
    }
    
    if (bestSellers.length === 0) {
        bestSellersGrid.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No best sellers available</p>';
        return;
    }
    
    bestSellersGrid.innerHTML = bestSellers.map(product => {
        const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
        // Find 750ml size for display price (all best sellers should have 750ml)
        const size750ml = hasSizes ? product.sizes.find(s => s.size === '750ml' || s.size === '750 ml') : null;
        const displayPrice = size750ml ? (size750ml.price || 0) : (hasSizes ? (product.sizes[0].price || 0) : (product.price || 0));
        const categoryIcon = {
            'whiskey': '🥃',
            'tequila': '🍸',
            'vodka': '🍶',
            'gin': '🍸',
            'rum': '🥥',
            'beer-seltzers': '🍺',
            'wine': '🍷'
        }[product.category] || '🍷';
        
        return `
        <div class="product-card" data-category="${product.category}">
            <div class="product-image">
                <img src="${product.image}" alt="${product.name}" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                     loading="lazy">
                <div class="product-placeholder" style="display: none; align-items: center; justify-content: center; height: 100%; font-size: 4rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    ${categoryIcon}
                </div>
                ${product.inStock === false ? '<div class="out-of-stock-badge">Out of Stock</div>' : ''}
            </div>
            <div class="product-info">
                <div class="product-category-badge">${product.category.charAt(0).toUpperCase() + product.category.slice(1).replace('-', ' & ')}</div>
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description || 'Premium quality spirit'}</p>
                <div class="product-price-container">
                    <div class="product-price">$${displayPrice.toFixed(2)}</div>
                    ${size750ml ? `<span class="size-hint">${size750ml.size}</span>` : (hasSizes ? `<span class="size-hint">${product.sizes[0].size}</span>` : '')}
                    ${displayPrice > 100 ? '<span class="premium-badge">Premium</span>' : ''}
                </div>
                <button class="add-to-cart" onclick="addToCart(${product.id})" ${product.inStock === false ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <i class="fas fa-shopping-cart"></i> ${product.inStock === false ? 'Out of Stock' : 'Add to Cart'}
                </button>
            </div>
        </div>
    `;
    }).join('');
}

// Display products
function displayProducts() {
    const productsGrid = document.getElementById('productsGrid');
    const filteredProducts = currentFilter === 'all' 
        ? products.filter(p => p.inStock !== false)
        : products.filter(product => product.category === currentFilter && product.inStock !== false);
    
    if (filteredProducts.length === 0) {
        productsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: #666;">
                <i class="fas fa-box-open" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <h3>No products found</h3>
                <p>Try selecting a different category or check back later.</p>
            </div>
        `;
        return;
    }
    
    productsGrid.innerHTML = filteredProducts.map(product => {
        const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
        // Default to 750ml for spirits, first size for beer/seltzers
        let defaultSizeIndex = 0;
        if (hasSizes && product.category !== 'beer-seltzers') {
            const size750Index = product.sizes.findIndex(s => s.size === '750ml');
            if (size750Index !== -1) {
                defaultSizeIndex = size750Index;
            }
        }
        const defaultPrice = hasSizes ? (product.sizes[defaultSizeIndex].price || 0) : (product.price || 0);
        const defaultSizeLabel = hasSizes ? product.sizes[defaultSizeIndex].size : '';
        const categoryIcon = {
            'whiskey': '🥃',
            'tequila': '🍸',
            'vodka': '🍶',
            'gin': '🍸',
            'rum': '🥥',
            'beer-seltzers': '🍺',
            'wine': '🍷'
        }[product.category] || '🍷';
        
        return `
        <div class="product-card" data-category="${product.category}">
            <div class="product-image">
                <img src="${product.image}" alt="${product.name}" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                     loading="lazy">
                <div class="product-placeholder" style="display: none; align-items: center; justify-content: center; height: 100%; font-size: 4rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    ${categoryIcon}
                </div>
                ${product.inStock === false ? '<div class="out-of-stock-badge">Out of Stock</div>' : ''}
            </div>
            <div class="product-info">
                <div class="product-category-badge">${product.category.charAt(0).toUpperCase() + product.category.slice(1).replace('-', ' & ')}</div>
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description || 'Premium quality spirit'}</p>
                ${hasSizes ? `
                <div class="size-selection">
                    <label for="size-${product.id}">Size</label>
                    <select class="size-select" id="size-${product.id}" onchange="updatePrice(${product.id})">
                        ${product.sizes.map((s, idx) => {
                            // Default to 750ml for spirits (not beer/seltzers)
                            const isDefault = product.category === 'beer-seltzers' ? idx === 0 : (s.size === '750ml' ? true : (idx === 0 && !product.sizes.some(sz => sz.size === '750ml')));
                            return `<option value="${idx}" ${isDefault ? 'selected' : ''}>${s.size} - $${(s.price || 0).toFixed(2)}</option>`;
                        }).join('')}
                    </select>
                </div>
                ` : ''}
                <div class="product-price-container">
                    <div class="product-price" id="price-${product.id}">$${defaultPrice.toFixed(2)}</div>
                    ${hasSizes ? `<span class="size-hint" id="size-hint-${product.id}">${defaultSizeLabel}</span>` : ''}
                    ${defaultPrice > 100 ? '<span class="premium-badge">Premium</span>' : ''}
                </div>
                <button class="add-to-cart" onclick="addToCart(${product.id})" ${product.inStock === false ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <i class="fas fa-shopping-cart"></i> ${product.inStock === false ? 'Out of Stock' : 'Add to Cart'}
                </button>
            </div>
        </div>
    `;
    }).join('');
}

// Update price when size changes
function updatePrice(productId) {
    const product = products.find(p => p.id === productId);
    if (product && Array.isArray(product.sizes) && product.sizes.length) {
        const sizeSelect = document.getElementById(`size-${productId}`);
        const priceElement = document.getElementById(`price-${productId}`);
        const sizeHint = document.getElementById(`size-hint-${productId}`);
        const selectedSizeIndex = sizeSelect ? sizeSelect.value : 0;
        const selectedSize = product.sizes[selectedSizeIndex] || product.sizes[0];

        if (priceElement && selectedSize) {
            priceElement.textContent = `$${(selectedSize.price || 0).toFixed(2)}`;
        }

        if (sizeHint && selectedSize) {
            sizeHint.textContent = selectedSize.size || '';
        }
    }
}

// Filter products
function filterProducts(category) {
    currentFilter = category;
    
    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(category.toLowerCase()) || 
            (category === 'all' && btn.textContent.toLowerCase().includes('all'))) {
            btn.classList.add('active');
        }
    });
    
    displayProducts();
}

// Add to cart
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    let selectedSize = null;
    let price = product.price || 0;
    
    // Get selected size if product has sizes
    if (Array.isArray(product.sizes) && product.sizes.length) {
        const sizeSelect = document.getElementById(`size-${productId}`);
        const selectedSizeIndex = sizeSelect ? sizeSelect.value : 0;
        selectedSize = product.sizes[selectedSizeIndex] || product.sizes[0];
        price = selectedSize.price || price;
    }
    
    // Create unique cart item ID that includes size
    const cartItemId = `${productId}-${selectedSize ? selectedSize.size : 'default'}`;
    const existingItem = cart.find(item => item.cartItemId === cartItemId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            ...product,
            cartItemId: cartItemId,
            selectedSize: selectedSize,
            price: price,
            quantity: 1
        });
    }
    
    // Save cart to localStorage
    saveCartToStorage();
    
    updateCartCount();
    updateCartDisplay();
    showCartNotification();
}

// Remove from cart
function removeFromCart(cartItemId) {
    cart = cart.filter(item => item.cartItemId !== cartItemId);
    saveCartToStorage();
    updateCartCount();
    updateCartDisplay();
}

// Update quantity
function updateQuantity(cartItemId, change) {
    const item = cart.find(item => item.cartItemId === cartItemId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(cartItemId);
        } else {
            saveCartToStorage();
            updateCartCount();
            updateCartDisplay();
        }
    }
}

// Debounce timer for cart sync
let cartSyncTimer = null;

// Save cart to localStorage, cookies, and sync with server if logged in
async function saveCartToStorage() {
    const cartJson = JSON.stringify(cart);
    
    // Get user identifier for cart key
    const currentUserForCart = getCurrentUser();
    const firebaseUserForCart = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    const userId = currentUserForCart?.id || currentUserForCart?.email || firebaseUserForCart?.uid || firebaseUserForCart?.email || 'guest';
    const cartKey = `cart_${userId}`;
    
    // Save to localStorage with user-specific key (for quick access)
    localStorage.setItem(cartKey, cartJson);
    localStorage.setItem('cart', cartJson); // Also keep generic key for compatibility
    console.log('💾 Cart saved to localStorage for user:', userId, '-', cart.length, 'items');
    
    // Save to cookie (for persistence across devices/browsers)
    // Cookies have 4KB limit, so we'll compress or split if needed
    const cartCookieName = getCartCookieName();
    try {
        // If cart is too large for a single cookie, compress it
        if (cartJson.length > 3500) { // Leave some room for cookie overhead
            // For large carts, we'll store a compressed version or just store essential data
            const compressedCart = cart.map(item => ({
                id: item.id,
                quantity: item.quantity,
                size: item.selectedSize?.size || null
            }));
            setCookie(cartCookieName, JSON.stringify(compressedCart), 30);
            console.log('💾 Cart saved to cookie (compressed):', compressedCart.length, 'items');
        } else {
            setCookie(cartCookieName, cartJson, 30);
            console.log('💾 Cart saved to cookie:', cart.length, 'items');
        }
    } catch (cookieError) {
        console.log('Cookie save failed (cart may be too large):', cookieError.message);
        // Fallback: just save essential data
        const essentialCart = cart.map(item => ({
            id: item.id,
            quantity: item.quantity,
            size: item.selectedSize?.size || null
        }));
        setCookie(cartCookieName, JSON.stringify(essentialCart), 30);
    }
    
    // Only sync if user is actually logged in
    const userForSync = getCurrentUser();
    const firebaseUserForSync = localStorage.getItem('firebaseUser');
    
    if (!userForSync && !firebaseUserForSync) {
        // Guest user - just save locally, no server sync needed
        return;
    }
    
    // Clear existing timer
    if (cartSyncTimer) {
        clearTimeout(cartSyncTimer);
    }
    
    // Set new timer to sync after 1 second of inactivity
    cartSyncTimer = setTimeout(async () => {
        try {
            await syncCartToServer(cart);
        } catch (error) {
            // Silently fail for guest users or invalid tokens
            if (error.message.includes('403') || error.message.includes('401')) {
                console.log('Cart not synced (not logged in)');
            } else {
                console.log('Cart sync failed, will retry on next save:', error.message);
            }
        }
    }, 1000);
}

// Load cart from cookies (preferred) or localStorage (fallback) - user-specific
function loadCartFromStorage() {
    console.log('🛒 Loading cart from storage...');
    
    // Get user identifier for cart key
    const user = getCurrentUser();
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    const userId = user?.id || user?.email || firebaseUser?.uid || firebaseUser?.email || 'guest';
    const cartKey = `cart_${userId}`;
    
    console.log('👤 User ID for cart:', userId);
    
    // Try to load from cookie first (for cross-device persistence)
    const cartCookieName = getCartCookieName();
    const cookieCart = getCookie(cartCookieName);
    
    if (cookieCart) {
        try {
            const parsedCart = JSON.parse(cookieCart);
            
            // If it's a compressed cart (just IDs), store it for expansion later
            if (parsedCart.length > 0 && parsedCart[0].id && !parsedCart[0].name) {
                localStorage.setItem('compressedCart', cookieCart);
                console.log('📦 Compressed cart loaded from cookie, will expand after products load');
                // Don't set cart yet, wait for expansion
                return;
            } else {
                // Full cart data from cookie
                cart = parsedCart;
                localStorage.setItem(cartKey, cookieCart); // Sync to localStorage with user key
                localStorage.setItem('cart', cookieCart); // Also keep generic key for compatibility
                console.log('✅ Cart loaded from cookie:', cart.length, 'items for user', userId);
                updateCartCount();
                updateCartDisplay();
                return;
            }
        } catch (error) {
            console.error('❌ Error loading cart from cookie:', error);
        }
    }
    
    // Try user-specific localStorage key
    let cartData = localStorage.getItem(cartKey);
    
    // If no user-specific cart found and user is logged in, check for guest cart to migrate
    if (!cartData && userId !== 'guest') {
        const guestCartData = localStorage.getItem('cart_guest');
        if (guestCartData) {
            console.log('🔄 Migrating guest cart to user cart...');
            cartData = guestCartData;
            // Migrate guest cart to user-specific key
            localStorage.setItem(cartKey, guestCartData);
            // Keep guest cart for now (will be cleared on next guest session)
        }
    }
    
    // Fallback to generic 'cart' key (for backward compatibility)
    if (!cartData) {
        cartData = localStorage.getItem('cart');
        // If we found a generic cart and user is logged in, migrate it to user-specific key
        if (cartData && userId !== 'guest') {
            console.log('🔄 Migrating generic cart to user-specific key...');
            localStorage.setItem(cartKey, cartData);
        }
    }
    
    if (cartData) {
        try {
            cart = JSON.parse(cartData);
            // Sync to cookie
            try {
                const cartJson = JSON.stringify(cart);
                if (cartJson.length > 3500) {
                    const compressedCart = cart.map(item => ({
                        id: item.id,
                        quantity: item.quantity,
                        size: item.selectedSize?.size || null
                    }));
                    setCookie(cartCookieName, JSON.stringify(compressedCart), 30);
                } else {
                    setCookie(cartCookieName, cartJson, 30);
                }
            } catch (cookieError) {
                console.log('Could not sync cart to cookie:', cookieError.message);
            }
            console.log('✅ Cart loaded from localStorage:', cart.length, 'items for user', userId);
            updateCartCount();
            updateCartDisplay();
        } catch (e) {
            console.error('❌ Error parsing cart data:', e);
            cart = [];
        }
    } else {
        cart = [];
        console.log('📭 No cart found in storage for user:', userId);
    }
}

// Expand compressed cart after products are loaded
function expandCompressedCart() {
    const compressedCartStr = localStorage.getItem('compressedCart');
    if (!compressedCartStr || products.length === 0) {
        return;
    }
    
    try {
        const compressedCart = JSON.parse(compressedCartStr);
        const expandedCart = [];
        
        compressedCart.forEach(compressedItem => {
            const product = products.find(p => p.id === compressedItem.id);
            if (product) {
                // Find the size if specified
                let selectedSize = null;
                if (compressedItem.size && product.sizes) {
                    selectedSize = product.sizes.find(s => s.size === compressedItem.size);
                }
                
                // Calculate price
                const price = selectedSize ? selectedSize.price : product.price;
                
                expandedCart.push({
                    cartItemId: `${product.id}-${Date.now()}-${Math.random()}`,
                    id: product.id,
                    name: product.name,
                    image: product.image,
                    price: price,
                    quantity: compressedItem.quantity || 1,
                    selectedSize: selectedSize,
                    category: product.category
                });
            }
        });
        
        if (expandedCart.length > 0) {
            cart = expandedCart;
            const cartJson = JSON.stringify(cart);
            
            // Save expanded cart to localStorage and cookie
            const user = getCurrentUser();
            const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
            const userId = user?.id || user?.email || firebaseUser?.uid || firebaseUser?.email || 'guest';
            const cartKey = `cart_${userId}`;
            localStorage.setItem(cartKey, cartJson);
            localStorage.setItem('cart', cartJson);
            localStorage.removeItem('compressedCart');
            
            // Save to cookie
            const cartCookieName = getCartCookieName();
            try {
                if (cartJson.length > 3500) {
                    const compressedCart = cart.map(item => ({
                        id: item.id,
                        quantity: item.quantity,
                        size: item.selectedSize?.size || null
                    }));
                    setCookie(cartCookieName, JSON.stringify(compressedCart), 30);
                } else {
                    setCookie(cartCookieName, cartJson, 30);
                }
            } catch (cookieError) {
                console.log('Could not save expanded cart to cookie');
            }
            
            console.log('✅ Compressed cart expanded:', expandedCart.length, 'items');
            updateCartCount();
            updateCartDisplay();
        }
    } catch (error) {
        console.error('❌ Error expanding compressed cart:', error);
        localStorage.removeItem('compressedCart');
    }
}

// Sync cart to server for logged-in users
async function syncCartToServer(cartItems) {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const firebaseToken = localStorage.getItem('firebaseToken');
    
    const authToken = token || firebaseToken;
    if (!authToken) {
        // No token - guest user, skip sync silently
        return;
    }
    
    try {
        // Use API_BASE_URL to ensure requests go to Railway, not Firebase Hosting
        const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
        const response = await fetch(`${apiUrl}/api/cart/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ cart: cartItems })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Cart saved to server');
            return data;
        } else if (response.status === 401 || response.status === 403) {
            // Token expired or invalid - clear auth and treat as guest
            console.log('Session expired, continuing as guest');
            localStorage.removeItem('authToken');
            localStorage.removeItem('token');
            localStorage.removeItem('firebaseToken');
            return;
        } else {
            const errorText = await response.text();
            throw new Error(`Failed to sync cart: ${response.status}`);
        }
    } catch (error) {
        // Network errors or other issues - fail silently for guest experience
        console.log('Cart sync skipped:', error.message);
        throw error;
    }
}

// Load cart from server for logged-in users
async function loadCartFromServer() {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const firebaseToken = localStorage.getItem('firebaseToken');
    
    const authToken = token || firebaseToken;
    if (!authToken) {
        console.log('🛒 No auth token, skipping server cart load');
        return null;
    }
    
    try {
        console.log('🛒 Fetching cart from server...');
        // Use API_BASE_URL to ensure requests go to Railway, not Firebase Hosting
        const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
        const response = await fetch(`${apiUrl}/api/cart`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('📡 Cart API response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            const serverCart = data.cart || [];
            console.log('✅ Cart loaded from server:', serverCart.length, 'items');
            return serverCart;
        } else {
            console.log('⚠️ Server cart load failed:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Failed to load cart from server:', error);
        return null;
    }
}

// Update cart count
function updateCartCount() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = totalItems;
}

// Update cart display
function updateCartDisplay() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    if (!cartItems) {
        console.warn('⚠️ cartItems element not found');
        return;
    }
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">Your cart is empty</p>';
        if (cartTotal) {
            cartTotal.textContent = '0.00';
        }
        return;
    }
    
    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-image">
                <img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="cart-item-placeholder" style="display: none; align-items: center; justify-content: center; height: 100%; font-size: 1.5rem; color: #ccc;">
                    🍷
                </div>
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                ${item.selectedSize ? `<div class="cart-item-size">Size: ${item.selectedSize.size}</div>` : ''}
                <div class="cart-item-price">$${item.price.toFixed(2)}</div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="updateQuantity('${item.cartItemId}', -1)">-</button>
                    <span class="quantity">${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity('${item.cartItemId}', 1)">+</button>
                    <button class="remove-item" onclick="removeFromCart('${item.cartItemId}')">Remove</button>
                </div>
            </div>
        </div>
    `).join('');
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Update cart total if element exists (may be hidden when cart is closed)
    if (cartTotal) {
        cartTotal.textContent = (total + deliveryFee).toFixed(2);
    }
    
    // Update mobile checkout total if it exists
    const cartTotalMobile = document.getElementById('cartTotalMobile');
    if (cartTotalMobile) {
        cartTotalMobile.textContent = (total + deliveryFee).toFixed(2);
    }
}

// Toggle cart sidebar
function toggleCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    const isOpening = !cartSidebar.classList.contains('open');
    cartSidebar.classList.toggle('open');
    
    // Prevent body scroll when cart is open on mobile
    if (window.innerWidth <= 768) {
        if (isOpening) {
            document.body.classList.add('cart-open');
            // Save scroll position
            document.body.style.top = `-${window.scrollY}px`;
        } else {
            document.body.classList.remove('cart-open');
            // Restore scroll position
            const scrollY = document.body.style.top;
            document.body.style.top = '';
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || '0') * -1);
            }
        }
    }
    
    // Hide mobile checkout fixed (we use cart footer instead)
    const mobileCheckoutFixed = document.getElementById('mobileCheckoutFixed');
    if (mobileCheckoutFixed) {
        mobileCheckoutFixed.style.display = 'none';
        mobileCheckoutFixed.style.visibility = 'hidden';
    }
    
    // Ensure cart footer visibility matches cart state
    updateCartFooterVisibility();
}

// Update cart footer visibility based on cart state (CSS handles most of it, just handle mobile checkout)
function updateCartFooterVisibility() {
    const cartSidebar = document.getElementById('cartSidebar');
    const mobileCheckoutFixed = document.getElementById('mobileCheckoutFixed');
    
    // Mobile checkout is handled by JavaScript since it's outside the cart sidebar
    // Only show on mobile devices (screen width <= 768px)
    if (mobileCheckoutFixed) {
        if (cartSidebar?.classList.contains('open') && window.innerWidth <= 768) {
            mobileCheckoutFixed.style.display = 'flex';
            mobileCheckoutFixed.style.visibility = 'visible';
            mobileCheckoutFixed.style.opacity = '1';
            mobileCheckoutFixed.style.pointerEvents = 'auto';
        } else {
            mobileCheckoutFixed.style.display = 'none';
            mobileCheckoutFixed.style.visibility = 'hidden';
            mobileCheckoutFixed.style.opacity = '0';
            mobileCheckoutFixed.style.pointerEvents = 'none';
        }
    }
}

// Adjust mobile checkout position for Safari's toolbar
function adjustMobileCheckoutForSafari() {
    const mobileCheckoutFixed = document.getElementById('mobileCheckoutFixed');
    if (!mobileCheckoutFixed || window.innerWidth > 768) return;
    
    // Detect if Safari on iOS
    const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (!isIOSSafari) return;
    
    // Use visual viewport API if available (better for Safari)
    if (window.visualViewport) {
        const viewport = window.visualViewport;
        const viewportHeight = viewport.height;
        const windowHeight = window.innerHeight;
        
        // Calculate toolbar height
        const toolbarHeight = Math.max(0, windowHeight - viewportHeight);
        
        // Position button well above toolbar (minimum 100px, add toolbar height)
        const bottomValue = Math.max(100, 100 + toolbarHeight);
        mobileCheckoutFixed.style.bottom = `${bottomValue}px`;
    }
}

// Listen for viewport changes (Safari toolbar show/hide)
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', adjustMobileCheckoutForSafari);
    window.visualViewport.addEventListener('scroll', adjustMobileCheckoutForSafari);
} else {
    // Fallback for older browsers
    let lastHeight = window.innerHeight;
    window.addEventListener('resize', () => {
        if (Math.abs(window.innerHeight - lastHeight) > 30) {
            lastHeight = window.innerHeight;
            setTimeout(adjustMobileCheckoutForSafari, 100);
        }
    });
}

// Show cart notification
function showCartNotification() {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1003;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = 'Item added to cart!';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const productCards = document.querySelectorAll('.product-card');
        
        productCards.forEach(card => {
            const productName = card.querySelector('.product-name').textContent.toLowerCase();
            const productDesc = card.querySelector('.product-description').textContent.toLowerCase();
            
            if (productName.includes(searchTerm) || productDesc.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// Setup navigation functionality
function setupNavigation() {
    // Navigation is now handled by onclick functions in HTML
}

// Scroll to home section
function scrollToSection(sectionId) {
    if (sectionId === 'home') {
        document.getElementById('home').scrollIntoView({ behavior: 'smooth' });
    } else {
        const targetElement = document.getElementById(sectionId);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

// Filter products and scroll to products section
function filterAndScroll(category) {
    filterProducts(category);
    setTimeout(() => {
        document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

// Setup delivery options
function setupDeliveryOptions() {
    const deliveryToggle = document.getElementById('deliveryToggle');
    if (deliveryToggle) {
        deliveryToggle.addEventListener('change', function() {
            deliveryOption = this.checked ? 'delivery' : 'pickup';
            deliveryFee = this.checked ? 7.99 : 0;
            updateCartDisplay();
            updateDeliveryInfo();
        });
        
        // Initialize delivery info on page load
        updateDeliveryInfo();
    }
}

// Update delivery information display
function updateDeliveryInfo() {
    const deliveryInfo = document.getElementById('deliveryInfo');
    if (deliveryInfo) {
        if (deliveryOption === 'delivery') {
            deliveryInfo.innerHTML = `
                <div class="delivery-info">
                    <i class="fas fa-truck"></i>
                    <span>Delivery Fee: $${deliveryFee.toFixed(2)}</span>
                    <span class="delivery-time">Estimated delivery: 30-45 minutes</span>
                </div>
            `;
        } else {
            deliveryInfo.innerHTML = `
                <div class="pickup-info">
                    <i class="fas fa-store"></i>
                    <span>Pickup at store</span>
                    <span class="pickup-time">Ready in 15-20 minutes</span>
                </div>
            `;
        }
    }
}

// Check if store is currently open for orders
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

// Get store hours message
function getStoreHoursMessage() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    if (dayOfWeek === 0) {
        return 'Store is closed on Sundays. We\'re open Monday-Saturday, 10am-8:30pm.';
    }
    
    const hour = now.getHours();
    if (hour < 10) {
        const timeUntilOpen = new Date();
        timeUntilOpen.setHours(10, 0, 0);
        const minutesUntilOpen = Math.ceil((timeUntilOpen - now) / 60000);
        return `Store opens at 10am. Opens in ${minutesUntilOpen} minutes.`;
    }
    
    if (hour >= 20 && (hour > 20 || now.getMinutes() >= 30)) {
        return 'Store is currently closed. We\'re open Monday-Saturday, 10am-8:30pm.';
    }
    
    return '';
}

// Proceed to checkout
function proceedToCheckout() {
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    
    // Check store hours
    if (!isStoreOpen()) {
        alert(getStoreHoursMessage());
        return;
    }
    
    const checkoutModal = document.getElementById('checkoutModal');
    checkoutModal.classList.add('open');
    
    // Update order summary
    updateOrderSummary();
}

// Update order summary
function updateOrderSummary() {
    const orderSummary = document.getElementById('orderSummary');
    const orderTotal = document.getElementById('orderTotal');
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const selectedOrderType = document.querySelector('input[name="orderType"]:checked');
    const orderType = selectedOrderType ? selectedOrderType.value : 'pickup';
    const orderDeliveryFee = orderType === 'delivery' ? 7.99 : 0;
    const subtotalWithFee = subtotal + orderDeliveryFee;
    const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
    // Calculate processing fee - Stripe charges on TOTAL, so we account for that
    // Formula: Fee = ((Amount + 0.30) / (1 - 0.029)) - Amount
    const amountBeforeFee = subtotalWithFee + tax;
    const totalWithFee = (amountBeforeFee + 0.30) / (1 - 0.029);
    const stripeFee = parseFloat((totalWithFee - amountBeforeFee).toFixed(2));
    const total = parseFloat(totalWithFee.toFixed(2));
    
    orderSummary.innerHTML = cart.map(item => `
        <div class="order-item">
            <span>${item.name} x${item.quantity}</span>
            <span>$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('') + `
        <div class="order-item">
            <span>Subtotal</span>
            <span>$${subtotal.toFixed(2)}</span>
        </div>
        ${orderDeliveryFee > 0 ? `<div class="order-item">
            <span>Delivery Fee</span>
            <span>$${orderDeliveryFee.toFixed(2)}</span>
        </div>` : ''}
        <div class="order-item">
            <span>Tax (8.25%)</span>
            <span>$${tax.toFixed(2)}</span>
        </div>
        <div class="order-item">
            <span>Payment Processing</span>
            <span>$${stripeFee.toFixed(2)}</span>
        </div>
    `;
    
    orderTotal.textContent = total.toFixed(2);
}

// Close checkout modal
function closeCheckout() {
    const checkoutModal = document.getElementById('checkoutModal');
    checkoutModal.classList.remove('open');
}

// Place order
async function placeOrder() {
    // Double-check store hours before submitting
    if (!isStoreOpen()) {
        alert(getStoreHoursMessage());
        return;
    }
    
    const form = document.getElementById('checkoutForm');
    const formData = new FormData(form);
    
    // Get order type from radio buttons
    const selectedOrderType = document.querySelector('input[name="orderType"]:checked');
    const orderType = selectedOrderType ? selectedOrderType.value : 'pickup';
    
    // Validate form
    const requiredFields = ['firstName', 'lastName', 'email', 'phone'];
    if (orderType === 'delivery') {
        requiredFields.push('streetAddress', 'city', 'state', 'zipCode');
    }
    requiredFields.push('paymentMethod');
    
    let isValid = true;
    
    requiredFields.forEach(field => {
        const input = document.getElementById(field);
        if (!input || !input.value.trim()) {
            if (input) input.style.borderColor = '#ff6b6b';
            isValid = false;
        } else {
            input.style.borderColor = '#e0e0e0';
        }
    });
    
    // Validate ZIP code format for delivery
    if (orderType === 'delivery') {
        const zipCode = document.getElementById('zipCode').value;
        if (!/^\d{5}$/.test(zipCode)) {
            document.getElementById('zipCode').style.borderColor = '#ff6b6b';
            alert('Please enter a valid 5-digit ZIP code.');
            isValid = false;
        }
    }
    
    if (!isValid) {
        alert('Please fill in all required fields.');
        return;
    }
    
    // Check if user is logged in (check both currentUser and token)
    const token = getAuthToken();
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    
    if (!currentUser && !firebaseUser) {
        alert('Please log in to place an order.');
        // Cache cart before redirecting to login
        const currentCart = JSON.parse(localStorage.getItem('cart') || '[]');
        if (currentCart && currentCart.length > 0) {
            localStorage.setItem('cartCache', JSON.stringify(currentCart));
            console.log('💾 Cart cached before login:', currentCart.length, 'items');
        }
        window.location.href = '/auth.html';
        return;
    }
    
    if (!token) {
        alert('Authentication error. Please log in again.');
        // Cache cart before redirecting to login
        const currentCart = JSON.parse(localStorage.getItem('cart') || '[]');
        if (currentCart && currentCart.length > 0) {
            localStorage.setItem('cartCache', JSON.stringify(currentCart));
            console.log('💾 Cart cached before login:', currentCart.length, 'items');
        }
        window.location.href = '/auth.html';
        return;
    }
    
    try {
        // Build address object for delivery orders
        let addressData = 'Store Pickup';
        if (orderType === 'delivery') {
            const apartment = document.getElementById('apartment').value.trim();
            addressData = {
                street: document.getElementById('streetAddress').value.trim(),
                apartment: apartment || null,
                city: document.getElementById('city').value.trim(),
                state: document.getElementById('state').value.trim().toUpperCase(),
                zipCode: document.getElementById('zipCode').value.trim(),
                fullAddress: formatFullAddress()
            };
        }
        
        // Create order data
        const orderData = {
            customer: {
                firstName: formData.get('firstName'),
                lastName: formData.get('lastName'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                address: addressData
            },
            items: cart.map(item => ({
                name: item.name,
                category: item.category,
                size: item.selectedSize ? item.selectedSize.size : null,
                quantity: item.quantity,
                price: item.price
            })),
            orderType: orderType,
            paymentMethod: formData.get('paymentMethod'),
            deliveryTimeEstimate: orderType === 'delivery' && window.deliveryTimeEstimate ? window.deliveryTimeEstimate : null
        };
        
        // Submit order to API
        const order = await ordersAPI.create(orderData);
        
        // Show success message
        const orderTypeText = orderType === 'delivery' ? 'delivery' : 'pickup';
        let estimatedTime = '15-20 minutes';
        if (orderType === 'delivery' && order.deliveryTimeEstimate) {
            if (order.deliveryTimeEstimate <= 30) {
                estimatedTime = '20-30 minutes';
            } else if (order.deliveryTimeEstimate <= 45) {
                estimatedTime = '30-45 minutes';
            } else if (order.deliveryTimeEstimate <= 60) {
                estimatedTime = '45-60 minutes';
            } else {
                estimatedTime = '60-90 minutes';
            }
        }
        alert(`Order placed successfully!\n\nOrder ID: #${order.id}\nOrder Type: ${orderTypeText}\nEstimated Time: ${estimatedTime}\nOrder Total: $${order.total.toFixed(2)}\n\nThank you for choosing Fiesta Liquor!`);
        
        // Clear cart and close modals
        cart = [];
        updateCartCount();
        updateCartDisplay();
        closeCheckout();
        toggleCart();
        form.reset();
    } catch (error) {
        console.error('Failed to place order:', error);
        alert('Failed to place order. Please try again or contact support.');
    }
}

// Format full address string
function formatFullAddress() {
    const street = document.getElementById('streetAddress').value.trim();
    const apartment = document.getElementById('apartment').value.trim();
    const city = document.getElementById('city').value.trim();
    const state = document.getElementById('state').value.trim().toUpperCase();
    const zipCode = document.getElementById('zipCode').value.trim();
    
    let address = street;
    if (apartment) {
        address += `, ${apartment}`;
    }
    address += `, ${city}, ${state} ${zipCode}`;
    
    return address;
}

// Toggle address field based on order type
function toggleAddressField() {
    const addressField = document.getElementById('addressField');
    const orderType = document.querySelector('input[name="orderType"]:checked').value;
    
    if (orderType === 'delivery') {
        addressField.style.display = 'block';
        // Make address fields required
        document.getElementById('streetAddress').required = true;
        document.getElementById('city').required = true;
        document.getElementById('state').required = true;
        document.getElementById('zipCode').required = true;
        
            // Add event listeners for delivery time calculation
        const zipInput = document.getElementById('zipCode');
        zipInput.addEventListener('input', calculateDeliveryTime);
        
        // Auto-uppercase state field
        const stateInput = document.getElementById('state');
        stateInput.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
        });
        
        // Calculate delivery time if zip is already filled
        if (zipInput.value) {
            calculateDeliveryTime();
        }
    } else {
        addressField.style.display = 'none';
        // Remove required attributes
        document.getElementById('streetAddress').required = false;
        document.getElementById('city').required = false;
        document.getElementById('state').required = false;
        document.getElementById('zipCode').required = false;
        document.getElementById('deliveryTimeEstimate').style.display = 'none';
    }
    
    // Update order summary when order type changes
    updateOrderSummary();
}

// Calculate delivery time based on ZIP code
function calculateDeliveryTime() {
    const zipCode = document.getElementById('zipCode').value;
    const deliveryTimeEstimate = document.getElementById('deliveryTimeEstimate');
    const estimatedTimeSpan = document.getElementById('estimatedTime');
    
    if (!zipCode || zipCode.length !== 5) {
        deliveryTimeEstimate.style.display = 'none';
        return;
    }
    
    // Store ZIP code for reference (San Antonio area: 78240 is near Babcock Road)
    const storeZip = '78240'; // Store location
    const customerZip = zipCode;
    
    // Simple distance estimation based on ZIP code difference
    // This is a simplified calculation - in production, you'd use a geocoding API
    const zipDiff = Math.abs(parseInt(customerZip) - parseInt(storeZip));
    
    let estimatedMinutes;
    let estimatedTimeText;
    
    if (zipDiff < 100) {
        // Very close (same area)
        estimatedMinutes = 20;
        estimatedTimeText = '20-30 minutes';
    } else if (zipDiff < 500) {
        // Close (within 5 miles)
        estimatedMinutes = 30;
        estimatedTimeText = '30-45 minutes';
    } else if (zipDiff < 1000) {
        // Medium distance (5-10 miles)
        estimatedMinutes = 45;
        estimatedTimeText = '45-60 minutes';
    } else {
        // Far (10+ miles)
        estimatedMinutes = 60;
        estimatedTimeText = '60-90 minutes';
    }
    
    estimatedTimeSpan.textContent = estimatedTimeText;
    deliveryTimeEstimate.style.display = 'block';
    
    // Store estimated time for order
    window.deliveryTimeEstimate = estimatedMinutes;
}

// Helper function to get first name from full name
function getFirstName(fullName) {
    if (!fullName) return 'User';
    const nameParts = fullName.trim().split(/\s+/);
    return nameParts[0] || 'User';
}

// Check user authentication
async function checkUserAuth() {
    const token = getAuthToken();
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    const firebaseToken = localStorage.getItem('firebaseToken');
    
    // Helper function to update header name display
    function updateHeaderName(fullName) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = `Welcome, ${getFirstName(fullName)}`;
        }
    }
    
    // Priority 1: Check if we have a backend token (from either regular login or Firebase)
    if (token) {
        // User has a valid backend token
        try {
            // Get user info from localStorage or Firebase
            const storedUser = getCurrentUser();
            const fullName = storedUser?.name || firebaseUser?.displayName || firebaseUser?.email || 'User';
            
            // For Firebase users, proactively refresh token if it might be expired
            // This prevents 403 errors before they happen
            if (firebaseUser && typeof firebase !== 'undefined' && firebase.auth) {
                const auth = firebase.auth();
                const currentFirebaseUser = auth.currentUser;
                if (currentFirebaseUser) {
                    // Check token age - if it's been more than 15 minutes, refresh proactively
                    const tokenAge = Date.now() - (parseInt(localStorage.getItem('tokenTimestamp') || '0'));
                    if (tokenAge > 15 * 60 * 1000) { // 15 minutes (more aggressive to prevent 403s)
                        console.log('🔄 Token might be expired, refreshing proactively...');
                        try {
                            const firebaseToken = await currentFirebaseUser.getIdToken(true);
                            const userData = {
                                name: firebaseUser.displayName || firebaseUser.email,
                                email: firebaseUser.email,
                                phone: firebaseUser.phone || '',
                                firebaseUid: firebaseUser.uid,
                                isFirebaseUser: true
                            };
                            
                            const response = await fetch(`${API_BASE_URL}/api/auth/firebase-register`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(userData)
                            });
                            
                            if (response.ok) {
                                const data = await response.json();
                                if (data.token) {
                                    setAuthToken(data.token);
                                    localStorage.setItem('tokenTimestamp', Date.now().toString());
                                    console.log('✅ Token refreshed proactively');
                                }
                            }
                        } catch (proactiveError) {
                            console.error('Proactive token refresh failed:', proactiveError);
                        }
                    }
                }
            }
            
            // Fetch fresh user info from backend to get current role
            try {
                let userInfo;
                try {
                    userInfo = await authAPI.getCurrentUser();
                } catch (tokenError) {
                    // Only log if it's not a token expiration (those are handled silently)
                    if (!tokenError.message.includes('Invalid or expired token')) {
                        console.log('🔄 Token error caught, error message:', tokenError.message);
                    }
                    // Token might be invalid - try to refresh it for Firebase users
                    if (firebaseUser && typeof firebase !== 'undefined' && firebase.auth) {
                        // Silent refresh - don't log unless there's an issue
                        const auth = firebase.auth();
                        
                        // Wait for Firebase auth state to restore if needed
                        let currentFirebaseUser = auth.currentUser;
                        if (!currentFirebaseUser) {
                            console.log('⏳ Waiting for Firebase auth state to restore for token refresh...');
                            await new Promise((resolve) => {
                                const unsubscribe = auth.onAuthStateChanged((user) => {
                                    console.log('👤 Firebase auth state restored for refresh:', user ? user.email : 'null');
                                    unsubscribe();
                                    resolve();
                                });
                                setTimeout(() => {
                                    unsubscribe();
                                    resolve();
                                }, 3000);
                            });
                            currentFirebaseUser = auth.currentUser;
                        }
                        
                        if (currentFirebaseUser) {
                            try {
                                const firebaseToken = await currentFirebaseUser.getIdToken(true); // Force refresh
                                
                                const userData = {
                                    name: firebaseUser.displayName || firebaseUser.email,
                                    email: firebaseUser.email,
                                    phone: firebaseUser.phone || '',
                                    firebaseUid: firebaseUser.uid,
                                    isFirebaseUser: true
                                };
                                
                                const response = await fetch(`${API_BASE_URL}/api/auth/firebase-register`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(userData)
                                });
                                
                                if (response.ok) {
                                    const data = await response.json();
                                    if (data.token) {
                                        setAuthToken(data.token);
                                        // Small delay to ensure token is stored
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                        // Try again with new token (silently)
                                        userInfo = await authAPI.getCurrentUser();
                                    } else {
                                        console.error('❌ No token in response');
                                        throw tokenError;
                                    }
                                } else {
                                    const errorText = await response.text();
                                    console.error('❌ Backend registration failed:', response.status, errorText);
                                    throw tokenError;
                                }
                            } catch (refreshError) {
                                console.error('❌ Failed to refresh token:', refreshError);
                                throw tokenError;
                            }
                        } else {
                            console.error('❌ No Firebase currentUser available for token refresh');
                            throw tokenError;
                        }
                    } else {
                        console.error('❌ Not a Firebase user or Firebase not available');
                        throw tokenError;
                    }
                }
                
                if (userInfo) {
                    currentUser = {
                        name: userInfo.name || fullName,
                        displayName: getFirstName(userInfo.name || fullName),
                        email: userInfo.email || storedUser?.email || firebaseUser?.email,
                        uid: firebaseUser?.uid,
                        id: userInfo.id || storedUser?.id,
                        role: userInfo.role || 'customer'
                    };
                    
                    // Load cart from server after successful authentication and merge with cached cart
                    console.log('🛒 Loading cart after authentication for user:', currentUser.email);
                    
                    // Check for any existing local carts (guest cart, generic cart, etc.)
                    const guestCartKey = 'cart_guest';
                    const genericCartKey = 'cart';
                    let localCart = [];
                    
                    // Try to get guest cart
                    const guestCartData = localStorage.getItem(guestCartKey);
                    if (guestCartData) {
                        try {
                            localCart = JSON.parse(guestCartData);
                            console.log('📦 Found guest cart:', localCart.length, 'items');
                        } catch (e) {
                            console.log('Could not parse guest cart');
                        }
                    }
                    
                    // If no guest cart, try generic cart
                    if (localCart.length === 0) {
                        const genericCartData = localStorage.getItem(genericCartKey);
                        if (genericCartData) {
                            try {
                                localCart = JSON.parse(genericCartData);
                                console.log('📦 Found generic cart:', localCart.length, 'items');
                            } catch (e) {
                                console.log('Could not parse generic cart');
                            }
                        }
                    }
                    
                    try {
                        const serverCart = await loadCartFromServer();
                        console.log('📦 Server cart received:', serverCart ? serverCart.length : 0, 'items');
                        
                        const cachedCartStr = localStorage.getItem('cartCache');
                        const cachedCart = cachedCartStr ? JSON.parse(cachedCartStr) : [];
                        console.log('📦 Cached guest cart (from login redirect):', cachedCart.length, 'items');
                        
                        // Combine all possible carts: server + cached + local
                        const allCarts = [];
                        if (serverCart && serverCart.length > 0) allCarts.push(...serverCart);
                        if (cachedCart.length > 0) allCarts.push(...cachedCart);
                        if (localCart.length > 0) allCarts.push(...localCart);
                        
                        if (allCarts.length > 0) {
                            // Merge all carts into one (deduplicate by product ID + size)
                            const cartMap = new Map();
                            allCarts.forEach(item => {
                                const key = `${item.id}-${item.selectedSize?.size || 'default'}`;
                                const existing = cartMap.get(key);
                                if (existing) {
                                    // Merge quantities (use max)
                                    existing.quantity = Math.max(existing.quantity, item.quantity || 1);
                                } else {
                                    cartMap.set(key, item);
                                }
                            });
                            
                            const mergedCart = Array.from(cartMap.values());
                            cart = mergedCart;
                            
                            // Save merged cart with user-specific key
                            const mergedCartJson = JSON.stringify(mergedCart);
                            const userId = currentUser.id || currentUser.email || firebaseUser?.uid || firebaseUser?.email || 'guest';
                            const cartKey = `cart_${userId}`;
                            localStorage.setItem(cartKey, mergedCartJson);
                            localStorage.setItem('cart', mergedCartJson); // Also keep generic key
                            
                            // Save to cookie
                            const cartCookieName = getCartCookieName();
                            try {
                                if (mergedCartJson.length > 3500) {
                                    const compressedCart = mergedCart.map(item => ({
                                        id: item.id,
                                        quantity: item.quantity,
                                        size: item.selectedSize?.size || null
                                    }));
                                    setCookie(cartCookieName, JSON.stringify(compressedCart), 30);
                                } else {
                                    setCookie(cartCookieName, mergedCartJson, 30);
                                }
                            } catch (cookieError) {
                                console.log('Could not save merged cart to cookie');
                            }
                            
                            // Clear guest cart and cache after migration
                            if (guestCartData) localStorage.removeItem(guestCartKey);
                            if (cachedCartStr) localStorage.removeItem('cartCache');
                            
                            const serverCount = serverCart ? serverCart.length : 0;
                            const cachedCount = cachedCart.length;
                            const localCount = localCart.length;
                            console.log(`✅ Cart merged: ${serverCount} server + ${cachedCount} cached + ${localCount} local = ${mergedCart.length} total items`);
                            
                            // Sync merged cart to server
                            try {
                                await syncCartToServer(mergedCart);
                                console.log('✅ Merged cart synced to server');
                            } catch (syncError) {
                                console.log('Cart sync skipped:', syncError.message);
                            }
                            
                            // Update UI
                            if (typeof updateCartCount === 'function') updateCartCount();
                            if (typeof updateCartDisplay === 'function') updateCartDisplay();
                        } else if (cachedCart.length > 0 || localCart.length > 0) {
                            // No server cart, use cached or local cart
                            const cartToUse = cachedCart.length > 0 ? cachedCart : localCart;
                            cart = cartToUse;
                            
                            // Save with user-specific key
                            const cartJson = JSON.stringify(cartToUse);
                            const userId = currentUser.id || currentUser.email || firebaseUser?.uid || firebaseUser?.email || 'guest';
                            const cartKey = `cart_${userId}`;
                            localStorage.setItem(cartKey, cartJson);
                            localStorage.setItem('cart', cartJson);
                            
                            // Clear guest cart and cache after migration
                            if (guestCartData) localStorage.removeItem(guestCartKey);
                            if (cachedCartStr) localStorage.removeItem('cartCache');
                            
                            // Save to cookie
                            const cartCookieName = getCartCookieName();
                            try {
                                setCookie(cartCookieName, cartJson, 30);
                            } catch (cookieError) {
                                console.log('Could not save cart to cookie');
                            }
                            
                            console.log('✅ Using local/cached cart:', cartToUse.length, 'items');
                            
                            // Sync cart to server
                            try {
                                await syncCartToServer(cartToUse);
                                console.log('✅ Local cart synced to server');
                            } catch (syncError) {
                                console.log('Cart sync skipped:', syncError.message);
                            }
                            
                            // Update UI
                            if (typeof updateCartCount === 'function') updateCartCount();
                            if (typeof updateCartDisplay === 'function') updateCartDisplay();
                        } else {
                            console.log('📭 No cart found (server, cached, or local)');
                            // Reload from storage as final fallback
                            loadCartFromStorage();
                        }
                    } catch (cartError) {
                        console.error('❌ Cart load error:', cartError.message);
                        // Try to load from localStorage as fallback
                        console.log('🔄 Falling back to localStorage/cookie load...');
                        loadCartFromStorage();
                    }
                    // Update stored user with fresh role
                    setCurrentUser(currentUser);
                    
                    // Simple: Change Account button to Admin Dashboard if role is admin
                    const accountLink = document.getElementById('accountLink');
                    if (accountLink && currentUser.role === 'admin') {
                        accountLink.href = '/admin-dashboard.html';
                        accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
                        console.log('✅ Account button changed to Admin Dashboard for:', currentUser.email);
                    } else if (accountLink) {
                        accountLink.href = '/account.html';
                        accountLink.innerHTML = '<i class="fas fa-user-circle"></i> Account';
                    }
                    
                } else {
                    // Fallback if API call fails - use stored role if available
                    const userEmail = storedUser?.email || firebaseUser?.email;
                    const isAdminByRole = (storedUser?.role === 'admin');
                    
                    currentUser = {
                        name: fullName,
                        displayName: getFirstName(fullName),
                        email: userEmail,
                        uid: firebaseUser?.uid,
                        id: storedUser?.id,
                        role: isAdminByRole ? 'admin' : (storedUser?.role || 'customer')
                    };
                    setCurrentUser(currentUser);
                    
                    // Change Account button if admin role
                    const accountLink = document.getElementById('accountLink');
                    if (accountLink && isAdminByRole) {
                        accountLink.href = '/admin-dashboard.html';
                        accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
                        console.log('✅ Account button changed to Admin Dashboard (fallback) for:', userEmail);
                    } else if (accountLink) {
                        accountLink.href = '/account.html';
                        accountLink.innerHTML = '<i class="fas fa-user-circle"></i> Account';
                    }
                }
            } catch (apiError) {
                console.error('❌ Error fetching user info from API:', apiError);
                console.error('Error details:', apiError.message, apiError.stack);
                
                // If this is a 403 and we have Firebase user, try one more time to refresh token
                if (apiError.message && apiError.message.includes('Invalid or expired token') && firebaseUser) {
                    console.log('🔄 Detected 403 error, attempting token refresh in outer catch...');
                    try {
                        if (typeof firebase !== 'undefined' && firebase.auth) {
                            const auth = firebase.auth();
                            let currentFirebaseUser = auth.currentUser;
                            
                            if (!currentFirebaseUser) {
                                await new Promise((resolve) => {
                                    const unsubscribe = auth.onAuthStateChanged((user) => {
                                        unsubscribe();
                                        resolve();
                                    });
                                    setTimeout(() => resolve(), 2000);
                                });
                                currentFirebaseUser = auth.currentUser;
                            }
                            
                            if (currentFirebaseUser) {
                                const firebaseToken = await currentFirebaseUser.getIdToken(true);
                                const userData = {
                                    name: firebaseUser.displayName || firebaseUser.email,
                                    email: firebaseUser.email,
                                    phone: firebaseUser.phone || '',
                                    firebaseUid: firebaseUser.uid,
                                    isFirebaseUser: true
                                };
                                
                                const response = await fetch(`${API_BASE_URL}/api/auth/firebase-register`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(userData)
                                });
                                
                                if (response.ok) {
                                    const data = await response.json();
                                    if (data.token) {
                                        setAuthToken(data.token);
                                        console.log('✅ Backend JWT token refreshed in outer catch');
                                        // Try to get user info one more time
                                        try {
                                            const refreshedUser = await authAPI.getCurrentUser();
                                            if (refreshedUser) {
                                                currentUser = {
                                                    name: refreshedUser.name || fullName,
                                                    displayName: getFirstName(refreshedUser.name || fullName),
                                                    email: refreshedUser.email || firebaseUser.email,
                                                    uid: firebaseUser?.uid,
                                                    id: refreshedUser.id,
                                                    role: refreshedUser.role || 'customer'
                                                };
                                                setCurrentUser(currentUser);
                                                
                                                // Update account button
                                                const accountLink = document.getElementById('accountLink');
                                                if (accountLink && currentUser.email && currentUser.email.toLowerCase() === 'admin@fiestaliquor.com') {
                                                    accountLink.href = '/admin-dashboard.html';
                                                    accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
                                                } else if (accountLink) {
                                                    accountLink.href = '/account.html';
                                                    accountLink.innerHTML = '<i class="fas fa-user-circle"></i> Account';
                                                }
                                                
                                                document.getElementById('userInfo').style.display = 'flex';
                                                document.getElementById('loginBtn').style.display = 'none';
                                                updateHeaderName(fullName);
                                                console.log('✅ User authenticated after token refresh:', currentUser.email);
                                                return; // Exit early, don't fall through to error handling
                                            }
                                        } catch (retryError) {
                                            console.error('Failed to get user after token refresh:', retryError);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (refreshError) {
                        console.error('Token refresh failed in outer catch:', refreshError);
                    }
                }
                
                // Fallback to stored user info
                const adminEmail = 'admin@fiestaliquor.com';
                const userEmail = storedUser?.email || firebaseUser?.email;
                const isAdminByEmail = userEmail && userEmail.toLowerCase() === adminEmail.toLowerCase();
                
                currentUser = {
                    name: fullName,
                    displayName: getFirstName(fullName),
                    email: userEmail,
                    uid: firebaseUser?.uid,
                    id: storedUser?.id,
                    role: storedUser?.role || 'customer'
                };
                setCurrentUser(currentUser);
                
                // Change Account button if admin email
                const accountLink = document.getElementById('accountLink');
                if (accountLink && isAdminByEmail) {
                    accountLink.href = '/admin-dashboard.html';
                    accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
                    console.log('✅ Account button changed to Admin Dashboard (error case) for:', userEmail);
                } else if (accountLink) {
                    accountLink.href = '/account.html';
                    accountLink.innerHTML = '<i class="fas fa-user-circle"></i> Account';
                }
                
                // Still show user info even if API failed
                document.getElementById('userInfo').style.display = 'flex';
                document.getElementById('loginBtn').style.display = 'none';
                updateHeaderName(fullName);
                console.log('✅ User info displayed from fallback data');
            }
            
            document.getElementById('userInfo').style.display = 'flex';
            document.getElementById('loginBtn').style.display = 'none';
            updateHeaderName(fullName);
            
            console.log('User authenticated:', currentUser.email, 'Role:', currentUser.role);
        } catch (error) {
            console.error('Error setting user info:', error);
            currentUser = null;
            document.getElementById('userInfo').style.display = 'none';
            document.getElementById('loginBtn').style.display = 'block';
        }
    } 
    // Priority 2: Check if we have Firebase user without backend token
    else if (firebaseUser && firebaseToken) {
        // Firebase user logged in, use firebaseToken as backend token
        localStorage.setItem('authToken', firebaseToken);
        localStorage.setItem('token', firebaseToken);
        const fullName = firebaseUser.displayName || firebaseUser.email || 'User';
        currentUser = {
            name: fullName,
            displayName: getFirstName(fullName), // Store first name separately for display
            email: firebaseUser.email,
            uid: firebaseUser.uid
        };
        setCurrentUser(currentUser);
        
        // Try to get user role from backend
        try {
            const userInfo = await authAPI.getCurrentUser();
            if (userInfo) {
                currentUser.role = userInfo.role || 'customer';
                currentUser.id = userInfo.id || currentUser.id;
                currentUser.name = userInfo.name || currentUser.name;
                setCurrentUser(currentUser);
            } else {
                currentUser.role = 'customer';
            }
            
            // Change Account button to Admin Dashboard if admin role
            const accountLink = document.getElementById('accountLink');
            if (accountLink && currentUser.role === 'admin') {
                accountLink.href = '/admin-dashboard.html';
                accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
                console.log('✅ Account button changed to Admin Dashboard (Firebase) for role admin:', currentUser.email);
            } else if (accountLink) {
                accountLink.href = '/account.html';
                accountLink.innerHTML = '<i class="fas fa-user-circle"></i> Account';
            }
        } catch (error) {
            console.log('Could not fetch user role, assuming customer');
            currentUser.role = 'customer';
        }
        
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('loginBtn').style.display = 'none';
        updateHeaderName(fullName);
        
        // Show admin dashboard link if user is admin (by role)
        const isAdminByRole = currentUser.role === 'admin';
        
        const adminLink = document.getElementById('adminDashboardLink');
        if (adminLink) {
            if (isAdminByRole) {
                adminLink.style.display = 'flex';
                adminLink.style.visibility = 'visible';
                adminLink.style.opacity = '1';
                adminLink.style.pointerEvents = 'auto';
                console.log('✅ Admin dashboard link shown for admin user, role:', currentUser.role, 'email:', currentUser.email);
            } else {
                adminLink.style.display = 'none';
                console.log('❌ Admin link hidden, user role:', currentUser.role, 'email:', currentUser.email);
            }
        } else {
            console.error('❌ Admin dashboard link element not found!');
        }
        
        console.log('User authenticated with Firebase:', currentUser.email, 'Role:', currentUser.role);
    } 
    // Priority 3: No authentication found
    else {
        currentUser = null;
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'block';
    }
    
    // Ensure header name is always just first name, even if stored user has full name
    if (currentUser) {
        const storedUser = getCurrentUser();
        if (storedUser && storedUser.name) {
            updateHeaderName(storedUser.name);
        }
        
        // Final check: Change Account button to Admin Dashboard if admin email
        const adminEmail = 'admin@fiestaliquor.com';
        if (currentUser && currentUser.email && currentUser.email.toLowerCase() === adminEmail.toLowerCase()) {
            const accountLink = document.getElementById('accountLink');
            if (accountLink) {
                accountLink.href = '/admin-dashboard.html';
                accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
                console.log('✅ Final check: Account button changed to Admin Dashboard for:', currentUser.email);
            }
        }
        
        // Continuous monitoring - ensure Account button stays as Admin Dashboard for admin
        if (currentUser && currentUser.email && currentUser.email.toLowerCase() === adminEmail.toLowerCase()) {
            const accountButtonMonitor = setInterval(() => {
                const accountLink = document.getElementById('accountLink');
                if (accountLink) {
                    if (accountLink.href !== window.location.origin + '/admin-dashboard.html') {
                        accountLink.href = '/admin-dashboard.html';
                        accountLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Admin Dashboard';
                        console.log('✅ Continuous monitor: Account button reverted to Admin Dashboard');
                    }
                } else {
                    clearInterval(accountButtonMonitor);
                }
            }, 2000);
            window.accountButtonMonitor = accountButtonMonitor;
        }
        
        // Ensure Account link is always clickable - add explicit click handler as fallback
        const accountLink = document.getElementById('accountLink');
        if (accountLink && !accountLink.dataset.clickHandlerAdded) {
            accountLink.dataset.clickHandlerAdded = 'true';
            accountLink.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                console.log('🔗 Account link clicked, href:', href);
                if (href) {
                    // Ensure navigation happens
                    if (href.startsWith('http') || href.startsWith('/')) {
                        window.location.href = href;
                    } else {
                        window.location.href = '/' + href;
                    }
                } else {
                    console.error('❌ Account link has no href attribute!');
                    // Fallback: go to account page
                    window.location.href = '/account.html';
                }
            });
            console.log('✅ Added explicit click handler to account link');
        }
    }
}

// Logout function
async function logout() {
    try {
        // Explicitly save cart to server BEFORE clearing auth
        try {
            await syncCartToServer(cart);
            console.log('Cart saved to server before logout');
        } catch (error) {
            console.error('Failed to save cart before logout:', error);
        }
        
        // Clear all auth tokens and user data from localStorage
        localStorage.removeItem('firebaseUser');
        localStorage.removeItem('firebaseToken');
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('user');
        
        // Sign out from Firebase
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            try {
                await firebase.auth().signOut();
            } catch (error) {
                console.error('Firebase sign-out error:', error);
            }
        }
        
        // Hard refresh page to clear all state and re-initialize
        window.location.href = '/index.html?t=' + Date.now();
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect even if error occurs
        window.location.href = '/index.html?t=' + Date.now();
    }
}

// Setup Stripe checkout button
function setupStripeCheckout() {
    const checkoutButton = document.getElementById('checkout-button');
    if (checkoutButton && !checkoutButton.onclick) {
        // Only add event listener if onclick is not already set
        checkoutButton.addEventListener('click', goToCheckout);
    }
}

// Go to checkout page
function goToCheckout() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }
    
    // Save cart to localStorage before redirecting
    saveCartToStorage();
    
    // Redirect to checkout page
    window.location.href = '/checkout.html';
}

// Scroll to products
function scrollToProducts() {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .product-image img {
        width: 75%;
        height: auto;
        object-fit: contain;
    }
    
    .cart-item-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    
    .delivery-info, .pickup-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: #f8f9fa;
        border-radius: 8px;
        margin: 1rem 0;
    }
    
    .delivery-time, .pickup-time {
        font-size: 0.9rem;
        color: #666;
    }
    
    #addressField h4 {
        margin-bottom: 1rem;
        color: #333;
        font-size: 1.1rem;
        font-weight: 600;
    }
    
    #addressField .form-group {
        margin-bottom: 1rem;
    }
    
    #addressField input[type="text"] {
        width: 100%;
        padding: 0.8rem;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.3s ease;
        box-sizing: border-box;
    }
    
    #addressField input[type="text"]:focus {
        outline: none;
        border-color: #e74c3c;
    }
    
    #deliveryTimeEstimate {
        display: none;
        margin-top: 1rem;
        padding: 1rem;
        background: #e8f5e9;
        border-radius: 8px;
        border-left: 4px solid #4CAF50;
        color: #2e7d32;
    }
    
    #deliveryTimeEstimate i {
        margin-right: 0.5rem;
    }
`;
document.head.appendChild(style);

// Handle Stripe checkout
async function handleStripeCheckout() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    if (!currentUser && !firebaseUser) {
        alert('Please log in to checkout.');
        // Cache cart before redirecting to login
        const currentCart = JSON.parse(localStorage.getItem('cart') || '[]');
        if (currentCart && currentCart.length > 0) {
            localStorage.setItem('cartCache', JSON.stringify(currentCart));
            console.log('💾 Cart cached before login:', currentCart.length, 'items');
        }
        window.location.href = '/auth.html';
        return;
    }

    try {
        // Format cart items for the backend
        const items = cart.map(item => ({
            name: item.name + (item.selectedSize ? ` (${item.selectedSize.size})` : ""),
            price: item.price,
            quantity: item.quantity
        }));

        // Call the backend endpoint
        const res = await fetch("/create-checkout-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: items })
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to create checkout session');
        }

        const data = await res.json();
        
        // Redirect to Stripe checkout URL
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('No checkout URL received from server');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        alert('Failed to process checkout. Please try again.');
    }
}

// Newsletter signup handler
async function handleNewsletterSignup(event) {
    event.preventDefault();
    const email = document.getElementById('newsletterEmail').value;
    
    try {
        // Use API_BASE_URL to ensure requests go to Railway, not Firebase Hosting
        const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
        const response = await fetch(`${apiUrl}/api/newsletter/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Thank you for subscribing! Check your email for exclusive deals.');
            document.getElementById('newsletterEmail').value = '';
        } else {
            if (data.error === 'Email already subscribed') {
                alert('You are already subscribed!');
            } else {
                alert(data.error || 'Failed to subscribe. Please try again.');
            }
        }
    } catch (error) {
        console.error('Newsletter signup error:', error);
        alert('Failed to subscribe. Please try again.');
    }
}
