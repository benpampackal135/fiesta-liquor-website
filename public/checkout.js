// Checkout page functionality

let cart = [];
let currentUser = null;
let deliveryTimeEstimate = null;

// Initialize checkout page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🛒 Checkout page loading...');
    console.log('Firebase available:', typeof firebase !== 'undefined');
    console.log('Firebase apps:', typeof firebase !== 'undefined' ? firebase.apps.length : 0);
    
    // Load cart from localStorage
    const cartData = localStorage.getItem('cart');
    if (cartData) {
        cart = JSON.parse(cartData);
    }
    
    // Check if cart is empty
    if (cart.length === 0) {
        alert('Your cart is empty! Redirecting to home page...');
        window.location.href = '/index.html';
        return;
    }
    
    // Check user authentication
    await checkUserAuth();
    
    // Load order summary
    loadOrderSummary();
    
    // Setup address field toggle
    setupAddressField();
    
    // Pre-fill user info if logged in
    if (currentUser) {
        prefillUserInfo();
    }
});

// Get auth token
function getAuthToken() {
    return localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('firebaseToken');
}

// Get current user
function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

// Check user authentication with Firebase listener
async function checkUserAuth() {
    // Wait for Firebase to be ready and initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.log('⏳ Waiting for Firebase SDK to load...');
        return new Promise((resolve) => {
            setTimeout(() => checkUserAuth().then(resolve), 100);
        });
    }
    
    // Wait for auth to be available
    let auth;
    try {
        auth = firebase.auth();
    } catch (error) {
        console.log('⏳ Waiting for Firebase Auth to initialize...');
        return new Promise((resolve) => {
            setTimeout(() => checkUserAuth().then(resolve), 100);
        });
    }
    
    console.log('🔍 Firebase Auth ready, checking auth state...');
    console.log('Initial currentUser:', auth.currentUser);
    
    // Listen to Firebase auth state (waits for auth state to be restored)
    return new Promise((resolve) => {
        let hasResolved = false;
        
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            if (hasResolved) return; // Prevent multiple resolutions
            
            console.log('=== AUTH DEBUG ===');
            console.log('Firebase currentUser:', firebaseUser);
            console.log('User email:', firebaseUser?.email);
            console.log('localStorage.firebaseUser:', localStorage.getItem('firebaseUser'));
            console.log('localStorage.firebaseToken:', localStorage.getItem('firebaseToken'));
            console.log('localStorage.authToken:', localStorage.getItem('authToken'));
            console.log('localStorage.token:', localStorage.getItem('token'));
            console.log('=================');
    
            // Check if user is authenticated
            if (firebaseUser) {
                // User is logged in with Firebase
                const token = await firebaseUser.getIdToken();
                
                // Store user info and token
                localStorage.setItem('firebaseUser', JSON.stringify({
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    photoURL: firebaseUser.photoURL
                }));
                localStorage.setItem('firebaseToken', token);
                localStorage.setItem('authToken', token);
                localStorage.setItem('token', token);
                
                currentUser = {
                    name: firebaseUser.displayName || firebaseUser.email,
                    email: firebaseUser.email,
                    uid: firebaseUser.uid
                };
                
                console.log('✅ User authenticated with Firebase:', currentUser.email);
                hasResolved = true;
                unsubscribe(); // Stop listening once we have the user
                resolve();
            } else {
                // No Firebase user - check backend token
                const token = getAuthToken();
                if (token) {
                    try {
                        const storedUser = getCurrentUser();
                        if (storedUser) {
                            currentUser = storedUser;
                            console.log('✅ User authenticated with backend token:', currentUser.email);
                            hasResolved = true;
                            unsubscribe();
                            resolve();
                            return;
                        }
                    } catch (error) {
                        console.error('Error getting user:', error);
                    }
                }
                
                // No authentication found
                console.log('❌ No authentication found, redirecting to login');
                hasResolved = true;
                unsubscribe(); // Stop listening before redirect
                alert('Please log in to checkout.');
                window.location.href = '/auth.html?redirect=checkout.html';
            }
        });
    });
}

// Helper to split full name into first/last
function splitName(fullName = '') {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
}

// Pre-fill user information
function prefillUserInfo() {
    if (!currentUser) return;

    const emailInput = document.getElementById('email');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const phoneInput = document.getElementById('phone');

    if (emailInput) emailInput.value = currentUser.email || '';

    // Determine sources
    const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');

    const nameSource = currentUser.displayName || currentUser.name || storedUser?.name || firebaseUser?.displayName || '';
    const { first, last } = splitName(nameSource);

    const phoneSource = currentUser.phone || storedUser?.phone || '';

    // Identify Google sign-in (has firebaseUser with displayName)
    const isGoogleUser = !!firebaseUser && !!firebaseUser.displayName;

    // Email/password users: fill first, last, phone (if available)
    // Google users: fill first/last only
    if (firstNameInput && first) firstNameInput.value = first;
    if (lastNameInput && last) lastNameInput.value = last;
    if (!isGoogleUser && phoneInput && phoneSource) phoneInput.value = phoneSource;
}

// Setup address field toggle
function setupAddressField() {
    const zipInput = document.getElementById('zipCode');
    zipInput.addEventListener('input', calculateDeliveryTime);
    
    const stateInput = document.getElementById('state');
    stateInput.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });
}

// Toggle address field based on order type
function toggleAddressField() {
    const addressField = document.getElementById('addressField');
    const orderType = document.querySelector('input[name="orderType"]:checked').value;
    
    if (orderType === 'delivery') {
        addressField.style.display = 'block';
        document.getElementById('streetAddress').required = true;
        document.getElementById('city').required = true;
        document.getElementById('state').required = true;
        document.getElementById('zipCode').required = true;
        
        // Calculate delivery time if zip is already filled
        const zipInput = document.getElementById('zipCode');
        if (zipInput.value) {
            calculateDeliveryTime();
        }
    } else {
        addressField.style.display = 'none';
        document.getElementById('streetAddress').required = false;
        document.getElementById('city').required = false;
        document.getElementById('state').required = false;
        document.getElementById('zipCode').required = false;
        document.getElementById('deliveryTimeEstimate').style.display = 'none';
        deliveryTimeEstimate = null;
    }
    
    loadOrderSummary();
}

// Calculate delivery time based on ZIP code
function calculateDeliveryTime() {
    const zipCode = document.getElementById('zipCode').value;
    const deliveryTimeEstimateDiv = document.getElementById('deliveryTimeEstimate');
    const estimatedTimeSpan = document.getElementById('estimatedTime');
    
    if (!zipCode || zipCode.length !== 5) {
        deliveryTimeEstimateDiv.style.display = 'none';
        deliveryTimeEstimate = null;
        return;
    }
    
    const storeZip = '78240'; // Store location
    const customerZip = zipCode;
    const zipDiff = Math.abs(parseInt(customerZip) - parseInt(storeZip));
    
    let estimatedMinutes;
    let estimatedTimeText;
    
    if (zipDiff < 100) {
        estimatedMinutes = 20;
        estimatedTimeText = '20-30 minutes';
    } else if (zipDiff < 500) {
        estimatedMinutes = 30;
        estimatedTimeText = '30-45 minutes';
    } else if (zipDiff < 1000) {
        estimatedMinutes = 45;
        estimatedTimeText = '45-60 minutes';
    } else {
        estimatedMinutes = 60;
        estimatedTimeText = '60-90 minutes';
    }
    
    estimatedTimeSpan.textContent = estimatedTimeText;
    deliveryTimeEstimateDiv.style.display = 'block';
    deliveryTimeEstimate = estimatedMinutes;
}

let appliedPromo = null;
let appliedPromoRedeemed = false;

// Load order summary
function loadOrderSummary() {
    const orderSummaryItems = document.getElementById('orderSummaryItems');
    const orderTotal = document.getElementById('orderTotal');
    
    if (cart.length === 0) {
        orderSummaryItems.innerHTML = '<p>Your cart is empty</p>';
        orderTotal.textContent = '$0.00';
        return;
    }
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const selectedOrderType = document.querySelector('input[name="orderType"]:checked');
    const orderType = selectedOrderType ? selectedOrderType.value : 'pickup';
    const deliveryFee = orderType === 'delivery' ? 7.99 : 0;
    
    // Promo code discount (if applied)
    const promoDiscount = appliedPromo ? appliedPromo.discount || 0 : 0;
    const totalDiscount = promoDiscount;
    
    const discountedSubtotal = Math.max(0, subtotal - totalDiscount);
    const subtotalWithFee = discountedSubtotal + deliveryFee;
    const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
    // Calculate processing fee - Stripe charges on TOTAL, so we account for that
    // Formula: Fee = ((Amount + 0.30) / (1 - 0.029)) - Amount
    const amountBeforeFee = subtotalWithFee + tax;
    const totalWithFee = (amountBeforeFee + 0.30) / (1 - 0.029);
    const stripeFee = parseFloat((totalWithFee - amountBeforeFee).toFixed(2));
    const total = parseFloat(totalWithFee.toFixed(2));
    
    orderSummaryItems.innerHTML = cart.map(item => `
        <div class="order-item-summary">
            <div>
                <div style="font-weight: 600;">${item.name}</div>
                ${item.selectedSize ? `<div style="font-size: 0.9rem; color: #666;">Size: ${item.selectedSize.size}</div>` : ''}
                <div style="font-size: 0.9rem; color: #666;">Quantity: ${item.quantity}</div>
            </div>
            <div style="font-weight: 600;">$${(item.price * item.quantity).toFixed(2)}</div>
        </div>
    `).join('') + `
        <div class="order-item-summary">
            <span>Subtotal</span>
            <span>$${subtotal.toFixed(2)}</span>
        </div>
        ${promoDiscount > 0 && appliedPromo ? `<div class="order-item-summary">
            <span>Discount Code (${appliedPromo.code})</span>
            <span style="color:#28a745;">-$${promoDiscount.toFixed(2)}</span>
        </div>` : ''}
        ${deliveryFee > 0 ? `<div class="order-item-summary">
            <span>Delivery Fee</span>
            <span>$${deliveryFee.toFixed(2)}</span>
        </div>` : ''}
        <div class="order-item-summary">
            <span>Tax (8.25%)</span>
            <span>$${tax.toFixed(2)}</span>
        </div>
        <div class="order-item-summary">
            <span>Payment Processing</span>
            <span>$${stripeFee.toFixed(2)}</span>
        </div>
    `;
    
    orderTotal.textContent = `$${total.toFixed(2)}`;
}

// Proceed to payment
async function proceedToPayment() {
    const form = document.getElementById('checkoutForm');
    
    // Get order type
    const selectedOrderType = document.querySelector('input[name="orderType"]:checked');
    const orderType = selectedOrderType ? selectedOrderType.value : 'pickup';
    
    // Validate form
    const requiredFields = ['firstName', 'lastName', 'email', 'phone'];
    if (orderType === 'delivery') {
        requiredFields.push('streetAddress', 'city', 'state', 'zipCode');
    }
    
    let isValid = true;
    
    requiredFields.forEach(field => {
        const input = document.getElementById(field);
        if (!input || !input.value.trim()) {
            if (input) input.style.borderColor = '#ff6b6b';
            isValid = false;
        } else {
            if (input) input.style.borderColor = '#e0e0e0';
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
    
    // Store checkout data in localStorage for after payment
    const checkoutData = {
        customer: {
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            address: orderType === 'delivery' ? {
                street: document.getElementById('streetAddress').value.trim(),
                apartment: document.getElementById('apartment').value.trim() || null,
                city: document.getElementById('city').value.trim(),
                state: document.getElementById('state').value.trim().toUpperCase(),
                zipCode: document.getElementById('zipCode').value.trim(),
                fullAddress: formatFullAddress()
            } : 'Store Pickup'
        },
        orderType: orderType,
        deliveryTimeEstimate: orderType === 'delivery' ? deliveryTimeEstimate : null,
        promo: appliedPromo
    };
    
    localStorage.setItem('checkoutData', JSON.stringify(checkoutData));
    
    // Disable button
    const checkoutBtn = document.querySelector('.checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing...';
    
    try {
        // Calculate totals (must match loadOrderSummary)
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = orderType === 'delivery' ? 7.99 : 0;
        
        // Promo discount only (no separate first‑time reward logic)
        const promoDiscount = appliedPromo ? appliedPromo.discount || 0 : 0;
        const totalDiscount = promoDiscount;
        
        const discountedSubtotal = Math.max(0, subtotal - totalDiscount);
        const subtotalWithFee = discountedSubtotal + deliveryFee;
        const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
        // Calculate processing fee on total transaction amount
        // IMPORTANT: Stripe charges their fee on the TOTAL (including our fee),
        // so we need to account for this in our calculation
        // Formula: Fee = ((Amount + 0.30) / (1 - 0.029)) - Amount
        const amountBeforeFee = subtotalWithFee + tax;
        const totalWithFee = (amountBeforeFee + 0.30) / (1 - 0.029);
        const stripeFee = parseFloat((totalWithFee - amountBeforeFee).toFixed(2));
        const total = parseFloat(totalWithFee.toFixed(2));
        
        // Format cart items for Stripe - include all fees as line items
        const items = cart.map(item => ({
            name: item.name + (item.selectedSize ? ` (${item.selectedSize.size})` : ""),
            price: item.price,
            quantity: item.quantity
        }));
        
        // Apply discounts by reducing the first item's price (total discount = promo only)
        if (totalDiscount > 0 && items.length > 0) {
            let discount = totalDiscount;
            const firstItem = items[0];
            // Ensure price doesn't go negative
            firstItem.price = Math.max(0, firstItem.price - discount);
            console.log(`Applied discounts: -$${discount.toFixed(2)} on first item (promo)`);
        }
        
        // Add delivery fee as a line item if delivery
        if (orderType === 'delivery' && deliveryFee > 0) {
            items.push({
                name: 'Delivery Fee',
                price: deliveryFee,
                quantity: 1
            });
        }
        
        // Add tax as a line item
        if (tax > 0) {
            items.push({
                name: 'Tax (8.25%)',
                price: tax,
                quantity: 1
            });
        }
        
        // Add Stripe processing fee as a line item
        if (stripeFee > 0) {
            items.push({
                name: 'Payment Processing Fee',
                price: stripeFee,
                quantity: 1
            });
        }
        
        // Call the backend endpoint to create Stripe checkout session
        const apiBase = window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://fiesta-liquor-website-production.up.railway.app';
        
        // Pass the current origin (frontend domain) so backend redirects here after Stripe
        const res = await fetch(`${apiBase}/create-checkout-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                items: items,
                successUrl: `${window.location.origin}/success.html`,
                cancelUrl: `${window.location.origin}/checkout.html`
            })
        });
        
        console.log('Stripe checkout response status:', res.status);
        console.log('Stripe checkout response ok:', res.ok);
        
        if (!res.ok) {
            let errorData;
            try {
                errorData = await res.json();
            } catch (e) {
                const textError = await res.text();
                console.error('Response is not JSON:', textError);
                throw new Error(`Server error: ${res.status} - ${textError.substring(0, 100)}`);
            }
            console.error('Checkout error data:', errorData);
            throw new Error(errorData.error || 'Failed to create checkout session');
        }
        
        const data = await res.json();
        console.log('Checkout session created:', data);
        
        // Redirect to Stripe checkout URL
        if (data.url) {
            // Note: Console errors about "Cannot find module './en'" or "unsupported `as` value"
            // are from third-party scripts (Stripe's checkout page or analytics) and are harmless.
            // They don't affect functionality - the redirect works correctly.
            window.location.href = data.url;
        } else {
            throw new Error('No checkout URL received from server');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        alert('Failed to process checkout. Please try again.');
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<i class="fas fa-lock"></i> Proceed to Payment';
    }
}

// Apply promo code
async function applyPromoCode() {
    const input = document.getElementById('promoCodeInput');
    const messageEl = document.getElementById('promoCodeMessage');
    
    if (!input || !messageEl) return;
    
    const code = input.value.trim().toUpperCase();
    if (!code) {
        messageEl.textContent = 'Please enter a discount code.';
        messageEl.style.color = '#856404';
        return;
    }
    
    if (!cart || cart.length === 0) {
        messageEl.textContent = 'Add items to your cart before applying a discount code.';
        messageEl.style.color = '#856404';
        return;
    }
    
    // Recalculate current order total (before promo discount)
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const selectedOrderType = document.querySelector('input[name="orderType"]:checked');
    const orderType = selectedOrderType ? selectedOrderType.value : 'pickup';
    const deliveryFee = orderType === 'delivery' ? 7.99 : 0;
    
    const subtotalWithFee = subtotal + deliveryFee;
    const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
    
    // Order total before promo discount (no processing fee included in validation)
    const orderTotal = parseFloat((subtotalWithFee + tax).toFixed(2));
    
    messageEl.textContent = 'Applying code...';
    messageEl.style.color = '#666';
    
    try {
        const response = await apiRequest('/api/promo-codes/validate', {
            method: 'POST',
            body: JSON.stringify({ code, orderTotal })
        });
        
        if (response && response.valid) {
            appliedPromo = {
                code: response.code,
                discount: response.discount,
                type: response.type
            };
            messageEl.textContent = response.message || 'Discount code applied!';
            messageEl.style.color = '#28a745';
            loadOrderSummary();
        } else {
            appliedPromo = null;
            messageEl.textContent = response && response.error ? response.error : 'Unable to apply this code.';
            messageEl.style.color = '#dc3545';
            loadOrderSummary();
        }
    } catch (error) {
        console.error('Error applying promo code:', error);
        appliedPromo = null;
        messageEl.textContent = (error && error.message) ? error.message : 'Failed to apply discount code. Please try again.';
        messageEl.style.color = '#dc3545';
        loadOrderSummary();
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

