// ============================================================
// Checkout page functionality
//
// Flow:
//   1. User selects Delivery or Pickup (required first step)
//   2. Store location shown based on selection:
//      - Delivery: auto-selects nearest store (locked)
//      - Pickup: user picks any store
//   3. User fills contact info + address (delivery only)
//   4. "Proceed to Payment" → Stripe checkout session
//   5. Order is ONLY created after Stripe confirms payment
//      (via webhook on the backend)
// ============================================================

let cart = [];
let currentUser = null;
let deliveryTimeEstimate = null;

// Delivery eligibility state (set by location-service.js check)
// null = not checked yet, true = within radius, false = outside radius
let deliveryEligible = null;
let deliveryCheckError = null;

// ── Initialize checkout page ────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Checkout page loading...');

    // Load cart from localStorage
    const cartData = localStorage.getItem('cart');
    if (cartData) {
        cart = JSON.parse(cartData);
    }

    // Check if cart is empty
    if (cart.length === 0) {
        alert('Your cart is empty! Redirecting to home page...');
        window.location.href = '/';
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

// ── Auth helpers ────────────────────────────────────────────
function getAuthToken() {
    return localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('firebaseToken');
}

function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

// Check user authentication with Firebase listener
async function checkUserAuth() {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        return new Promise((resolve) => {
            setTimeout(() => checkUserAuth().then(resolve), 100);
        });
    }

    let auth;
    try {
        auth = firebase.auth();
    } catch (error) {
        return new Promise((resolve) => {
            setTimeout(() => checkUserAuth().then(resolve), 100);
        });
    }

    return new Promise((resolve) => {
        let hasResolved = false;

        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            if (hasResolved) return;

            if (firebaseUser) {
                const token = await firebaseUser.getIdToken();
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

                hasResolved = true;
                unsubscribe();
                resolve();
            } else {
                const token = getAuthToken();
                if (token) {
                    const storedUser = getCurrentUser();
                    if (storedUser) {
                        currentUser = storedUser;
                        hasResolved = true;
                        unsubscribe();
                        resolve();
                        return;
                    }
                }
                hasResolved = true;
                unsubscribe();
                alert('Please log in to checkout.');
                window.location.href = '/auth?redirect=checkout';
            }
        });
    });
}

// ── Name / prefill helpers ──────────────────────────────────
function splitName(fullName = '') {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
}

function prefillUserInfo() {
    if (!currentUser) return;
    const emailInput = document.getElementById('email');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const phoneInput = document.getElementById('phone');

    if (emailInput) emailInput.value = currentUser.email || '';

    const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    const nameSource = currentUser.displayName || currentUser.name || storedUser?.name || firebaseUser?.displayName || '';
    const { first, last } = splitName(nameSource);
    const phoneSource = currentUser.phone || storedUser?.phone || '';
    const isGoogleUser = !!firebaseUser && !!firebaseUser.displayName;

    if (firstNameInput && first) firstNameInput.value = first;
    if (lastNameInput && last) lastNameInput.value = last;
    if (!isGoogleUser && phoneInput && phoneSource) phoneInput.value = phoneSource;
}

// ── Address field setup ─────────────────────────────────────
function setupAddressField() {
    const zipInput = document.getElementById('zipCode');
    zipInput.addEventListener('input', calculateDeliveryTime);

    const stateInput = document.getElementById('state');
    stateInput.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });
}

// ── Toggle order type (Delivery vs Pickup) ──────────────────
// This is the main entry point called when the user picks an order type.
// It controls which sections are visible and triggers delivery checks.
function toggleAddressField() {
    const addressField = document.getElementById('addressField');
    const orderTypeEl = document.querySelector('input[name="orderType"]:checked');
    if (!orderTypeEl) return;
    const orderType = orderTypeEl.value;

    const statusContainer = document.getElementById('deliveryLocationStatus');
    const storeCard = document.getElementById('storeLocationCard');
    const contactCard = document.getElementById('contactInfoCard');
    const promoCard = document.getElementById('promoCard');
    const locationGrid = document.getElementById('locationPickerGrid');
    const storeHeading = document.getElementById('storeLocationHeading');
    const storeHint = document.getElementById('storeLocationHint');
    const orderTypeHint = document.getElementById('orderTypeHint');

    // Hide the "please select" hint once a choice is made
    if (orderTypeHint) orderTypeHint.style.display = 'none';

    // Show the remaining checkout sections
    if (storeCard) storeCard.style.display = 'block';
    if (contactCard) contactCard.style.display = 'block';
    if (promoCard) promoCard.style.display = 'block';

    if (orderType === 'delivery') {
        // ── DELIVERY MODE ───────────────────────────────────
        addressField.style.display = 'block';
        document.getElementById('streetAddress').required = true;
        document.getElementById('city').required = true;
        document.getElementById('state').required = true;
        document.getElementById('zipCode').required = true;

        // Update store card UI for delivery
        storeHeading.textContent = 'Assigned Store';
        storeHint.textContent = 'Your nearest store has been automatically selected for delivery.';

        // Disable manual store selection — delivery locks to nearest store
        var radios = locationGrid.querySelectorAll('input[name="storeLocation"]');
        radios.forEach(function(r) { r.disabled = true; });
        locationGrid.style.opacity = '0.6';
        locationGrid.style.pointerEvents = 'none';

        // Calculate delivery time if zip is already filled
        const zipInput = document.getElementById('zipCode');
        if (zipInput.value) {
            calculateDeliveryTime();
        }

        // Run geolocation-based delivery eligibility check
        runDeliveryCheck();
    } else {
        // ── PICKUP MODE ─────────────────────────────────────
        addressField.style.display = 'none';
        document.getElementById('streetAddress').required = false;
        document.getElementById('city').required = false;
        document.getElementById('state').required = false;
        document.getElementById('zipCode').required = false;
        document.getElementById('deliveryTimeEstimate').style.display = 'none';
        deliveryTimeEstimate = null;
        deliveryEligible = null;
        deliveryCheckError = null;

        // Hide delivery status and map
        if (statusContainer) statusContainer.style.display = 'none';
        if (typeof hideDeliveryMap === 'function') hideDeliveryMap();

        // Update store card UI for pickup — allow any store
        storeHeading.textContent = 'Choose a store location';
        storeHint.textContent = 'Pick up your order from any of our locations.';

        // Enable manual store selection for pickup
        var radios = locationGrid.querySelectorAll('input[name="storeLocation"]');
        radios.forEach(function(r) { r.disabled = false; });
        locationGrid.style.opacity = '1';
        locationGrid.style.pointerEvents = 'auto';

        // If no store is selected yet, select the first one
        var anyChecked = locationGrid.querySelector('input[name="storeLocation"]:checked');
        if (!anyChecked) {
            var first = locationGrid.querySelector('input[name="storeLocation"]');
            if (first) { first.checked = true; updateLocationLabels(); }
        }
    }

    loadOrderSummary();
}

// ── Run the geolocation delivery check ──────────────────────
function runDeliveryCheck() {
    var statusContainer = document.getElementById('deliveryLocationStatus');
    var checkingEl = document.getElementById('deliveryLocationChecking');
    var okEl = document.getElementById('deliveryLocationOk');
    var blockedEl = document.getElementById('deliveryLocationBlocked');
    var errorEl = document.getElementById('deliveryLocationError');

    if (!statusContainer) return;

    // Reset all status elements
    statusContainer.style.display = 'block';
    checkingEl.style.display = 'block';
    okEl.style.display = 'none';
    blockedEl.style.display = 'none';
    errorEl.style.display = 'none';

    // checkDeliveryEligibility is defined in location-service.js
    if (typeof checkDeliveryEligibility !== 'function') {
        checkingEl.style.display = 'none';
        deliveryEligible = true; // fail open if script missing
        return;
    }

    checkDeliveryEligibility().then(function (result) {
        checkingEl.style.display = 'none';

        if (result.error) {
            // Geolocation failed — show warning, block delivery
            deliveryEligible = false;
            deliveryCheckError = result.error;
            errorEl.style.display = 'block';
            document.getElementById('deliveryLocationErrorMsg').textContent = result.error;
            // Show map without user marker (stores + radii only)
            if (typeof renderDeliveryMap === 'function') {
                renderDeliveryMap(null, null);
            }
            return;
        }

        if (result.eligible) {
            // User is within delivery radius of at least one store
            deliveryEligible = true;
            deliveryCheckError = null;
            okEl.style.display = 'block';
            document.getElementById('deliveryStoreName').textContent = result.nearestStore.store.name;
            document.getElementById('deliveryStoreDistance').textContent = result.nearestStore.distanceMiles;

            // Auto-select the nearest store for delivery (locked — user cannot change)
            selectStoreByName(result.nearestStore.store.name);
        } else {
            // User is outside delivery radius of all stores
            deliveryEligible = false;
            deliveryCheckError = null;
            blockedEl.style.display = 'block';
        }

        // Render the map
        if (typeof renderDeliveryMap === 'function') {
            renderDeliveryMap(result.userCoords, result.allDistances);
        }
    });
}

// ── Calculate delivery time based on ZIP code ───────────────
function calculateDeliveryTime() {
    const zipCode = document.getElementById('zipCode').value;
    const deliveryTimeEstimateDiv = document.getElementById('deliveryTimeEstimate');
    const estimatedTimeSpan = document.getElementById('estimatedTime');

    if (!zipCode || zipCode.length !== 5) {
        deliveryTimeEstimateDiv.style.display = 'none';
        deliveryTimeEstimate = null;
        return;
    }

    const storeZip = '78240';
    const zipDiff = Math.abs(parseInt(zipCode) - parseInt(storeZip));

    let estimatedTimeText;
    if (zipDiff < 100) {
        deliveryTimeEstimate = 20;
        estimatedTimeText = '20-30 minutes';
    } else if (zipDiff < 500) {
        deliveryTimeEstimate = 30;
        estimatedTimeText = '30-45 minutes';
    } else if (zipDiff < 1000) {
        deliveryTimeEstimate = 45;
        estimatedTimeText = '45-60 minutes';
    } else {
        deliveryTimeEstimate = 60;
        estimatedTimeText = '60-90 minutes';
    }

    estimatedTimeSpan.textContent = estimatedTimeText;
    deliveryTimeEstimateDiv.style.display = 'block';
}

let appliedPromo = null;
let appliedPromoRedeemed = false;

// ── Load order summary ──────────────────────────────────────
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

    const promoDiscount = appliedPromo ? appliedPromo.discount || 0 : 0;
    const discountedSubtotal = Math.max(0, subtotal - promoDiscount);
    const subtotalWithFee = discountedSubtotal + deliveryFee;
    const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
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

// ── Store hours check ───────────────────────────────────────
function getStoreStatus() {
    const now = new Date();
    const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const day = ct.getDay();
    const mins = ct.getHours() * 60 + ct.getMinutes();
    if (day === 0)    return { open: false, msg: "We're closed on Sundays. Online orders are available Mon–Sat, 10 AM – 8:30 PM." };
    if (mins < 600)   return { open: false, msg: "We're not open yet. Online orders start at 10 AM Mon–Sat." };
    if (mins >= 1230) return { open: false, msg: "Online orders have closed for today (cutoff: 8:30 PM). Our store is open until 9 PM — please call or visit us in person." };
    return { open: true };
}

// ============================================================
// Proceed to Payment
//
// IMPORTANT: This function does NOT create an order in the
// database. It only creates a Stripe checkout session.
// The order is created by the Stripe webhook AFTER the
// customer successfully completes payment. This prevents
// fake/abandoned orders from appearing in the system.
// ============================================================
async function proceedToPayment() {
    // Block if store is outside operating hours
    const storeStatus = getStoreStatus();
    if (!storeStatus.open) {
        alert(storeStatus.msg);
        return;
    }

    // Must select order type first
    const selectedOrderType = document.querySelector('input[name="orderType"]:checked');
    if (!selectedOrderType) {
        alert('Please select Delivery or Pickup before continuing.');
        return;
    }
    const orderType = selectedOrderType.value;

    // Block delivery if user is outside delivery radius
    if (orderType === 'delivery' && deliveryEligible === false) {
        alert(deliveryCheckError || 'Delivery is unavailable in your area. Please choose pickup instead.');
        return;
    }

    // Validate required fields
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

    // Validate store location selection
    const selectedLocationEl = document.querySelector('input[name="storeLocation"]:checked');
    if (!selectedLocationEl) {
        alert('Please select a store location.');
        return;
    }
    const selectedLocation = {
        name: selectedLocationEl.value,
        address: selectedLocationEl.dataset.address
    };

    // Build checkout data object (saved to localStorage for the success page)
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
        storeLocation: selectedLocation,
        deliveryTimeEstimate: orderType === 'delivery' ? deliveryTimeEstimate : null,
        promo: appliedPromo
    };

    localStorage.setItem('checkoutData', JSON.stringify(checkoutData));

    // Disable button to prevent double-clicks
    const checkoutBtn = document.querySelector('.checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing...';

    try {
        // Calculate totals (must match loadOrderSummary exactly)
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = orderType === 'delivery' ? 7.99 : 0;
        const promoDiscount = appliedPromo ? appliedPromo.discount || 0 : 0;
        const discountedSubtotal = Math.max(0, subtotal - promoDiscount);
        const subtotalWithFee = discountedSubtotal + deliveryFee;
        const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
        const amountBeforeFee = subtotalWithFee + tax;
        const totalWithFee = (amountBeforeFee + 0.30) / (1 - 0.029);
        const stripeFee = parseFloat((totalWithFee - amountBeforeFee).toFixed(2));

        // Build Stripe line items
        const items = cart.map(item => ({
            name: item.name + (item.selectedSize ? ` (${item.selectedSize.size})` : ""),
            price: item.price,
            quantity: item.quantity
        }));

        // Apply promo discount by reducing first item price
        if (promoDiscount > 0 && items.length > 0) {
            items[0].price = Math.max(0, items[0].price - promoDiscount);
        }

        // Add delivery fee line item
        if (orderType === 'delivery' && deliveryFee > 0) {
            items.push({ name: 'Delivery Fee', price: deliveryFee, quantity: 1 });
        }

        // Add tax line item
        if (tax > 0) {
            items.push({ name: 'Tax (8.25%)', price: tax, quantity: 1 });
        }

        // Add processing fee line item
        if (stripeFee > 0) {
            items.push({ name: 'Payment Processing Fee', price: stripeFee, quantity: 1 });
        }

        // ── Build order metadata ────────────────────────────
        // This data is passed to Stripe as session metadata.
        // The backend webhook reads it to create the order
        // ONLY after payment succeeds.
        const orderMetadata = {
            customerFirstName: checkoutData.customer.firstName,
            customerLastName: checkoutData.customer.lastName,
            customerEmail: checkoutData.customer.email,
            customerPhone: checkoutData.customer.phone,
            orderType: orderType,
            storeName: selectedLocation.name,
            storeAddress: selectedLocation.address,
            promoCode: appliedPromo ? appliedPromo.code : '',
            promoDiscount: appliedPromo ? String(appliedPromo.discount) : '0',
            deliveryTimeEstimate: deliveryTimeEstimate ? String(deliveryTimeEstimate) : ''
        };

        // Stripe metadata values must be strings ≤ 500 chars
        // Store the delivery address as a single string
        if (orderType === 'delivery' && checkoutData.customer.address !== 'Store Pickup') {
            orderMetadata.deliveryAddress = checkoutData.customer.address.fullAddress || '';
            orderMetadata.deliveryStreet = checkoutData.customer.address.street || '';
            orderMetadata.deliveryApt = checkoutData.customer.address.apartment || '';
            orderMetadata.deliveryCity = checkoutData.customer.address.city || '';
            orderMetadata.deliveryState = checkoutData.customer.address.state || '';
            orderMetadata.deliveryZip = checkoutData.customer.address.zipCode || '';
        }

        // Cart items as compact JSON (Stripe metadata max 500 chars per value)
        // Store essential item data only
        const compactItems = cart.map(item => ({
            id: item.id,
            n: item.name,
            p: item.price,
            q: item.quantity,
            c: item.category || '',
            img: item.image || '',
            sz: item.selectedSize || null
        }));
        // Split into chunks if needed (500 char limit per metadata value)
        const itemsJson = JSON.stringify(compactItems);
        if (itemsJson.length <= 500) {
            orderMetadata.cartItems = itemsJson;
        } else {
            // Split across multiple metadata keys
            for (let i = 0; i < itemsJson.length; i += 500) {
                orderMetadata['cartItems_' + Math.floor(i / 500)] = itemsJson.slice(i, i + 500);
            }
        }

        const apiBase = window.location.origin;
        const authToken = getAuthToken();

        // ── NO order is saved here ──────────────────────────
        // The order will be created by the Stripe webhook
        // after payment is confirmed. This prevents abandoned
        // or cancelled orders from cluttering the database.

        // Create Stripe checkout session with order metadata
        const res = await fetch(`${apiBase}/create-checkout-session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                items: items,
                successUrl: `${window.location.origin}/success`,
                cancelUrl: `${window.location.origin}/checkout`,
                orderMetadata: orderMetadata
            })
        });

        if (!res.ok) {
            let errorData;
            try {
                errorData = await res.json();
            } catch (e) {
                const textError = await res.text();
                throw new Error(`Server error: ${res.status} - ${textError.substring(0, 100)}`);
            }
            throw new Error(errorData.error || 'Failed to create checkout session');
        }

        const data = await res.json();

        // Redirect to Stripe checkout
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('No checkout URL received from server');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        alert('Failed to process checkout. Please try again.');
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Proceed to Payment';
    }
}

// ── Apply promo code ────────────────────────────────────────
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

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const selectedOrderType = document.querySelector('input[name="orderType"]:checked');
    const orderType = selectedOrderType ? selectedOrderType.value : 'pickup';
    const deliveryFee = orderType === 'delivery' ? 7.99 : 0;
    const subtotalWithFee = subtotal + deliveryFee;
    const tax = parseFloat((subtotalWithFee * 0.0825).toFixed(2));
    const orderTotal = parseFloat((subtotalWithFee + tax).toFixed(2));

    messageEl.textContent = 'Applying code...';
    messageEl.style.color = '#666';

    try {
        const response = await apiRequest('/api/promo-codes/validate', {
            method: 'POST',
            body: JSON.stringify({ code, orderTotal })
        });

        if (response && response.valid) {
            appliedPromo = { code: response.code, discount: response.discount, type: response.type };
            messageEl.textContent = response.message || 'Discount code applied!';
            messageEl.style.color = '#28a745';
        } else {
            appliedPromo = null;
            messageEl.textContent = response?.error || 'Unable to apply this code.';
            messageEl.style.color = '#dc3545';
        }
        loadOrderSummary();
    } catch (error) {
        appliedPromo = null;
        messageEl.textContent = error?.message || 'Failed to apply discount code. Please try again.';
        messageEl.style.color = '#dc3545';
        loadOrderSummary();
    }
}

// ── Format full address string ──────────────────────────────
function formatFullAddress() {
    const street = document.getElementById('streetAddress').value.trim();
    const apartment = document.getElementById('apartment').value.trim();
    const city = document.getElementById('city').value.trim();
    const state = document.getElementById('state').value.trim().toUpperCase();
    const zipCode = document.getElementById('zipCode').value.trim();

    let address = street;
    if (apartment) address += `, ${apartment}`;
    address += `, ${city}, ${state} ${zipCode}`;
    return address;
}
