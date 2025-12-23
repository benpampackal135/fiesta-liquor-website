// API Configuration
// Use Railway backend in production, local server in development
// Note: Firebase Hosting cannot proxy to external URLs, so we call Railway directly
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin  // Local development
    : 'https://fiesta-liquor-website-production.up.railway.app';  // Production (Railway)

// Expose globally for use in other scripts
window.API_BASE_URL = API_BASE_URL;

console.log('🔗 API Base URL:', API_BASE_URL);
console.log('📍 Hostname:', window.location.hostname);

// Proactively refresh token on page load if needed (before any API calls)
// This ensures Firebase tokens are fresh before the first API call
(function() {
    async function initTokenRefresh() {
        // Wait for Firebase to be ready
        if (typeof firebase !== 'undefined' && firebase.auth) {
            const auth = firebase.auth();
            // Wait for auth state to restore
            await new Promise((resolve) => {
                let resolved = false;
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (!resolved) {
                        resolved = true;
                        unsubscribe();
                        // Small delay to ensure Firebase is fully ready
                        setTimeout(resolve, 300);
                    }
                });
                // Timeout after 3 seconds
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        unsubscribe();
                        resolve();
                    }
                }, 3000);
            });
        } else {
            // Wait a bit for Firebase to load
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Now refresh token if needed
        await checkAndRefreshTokenIfNeeded();
    }
    
    // Start token refresh as soon as possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTokenRefresh);
    } else {
        initTokenRefresh();
    }
})();

// Get auth token from localStorage (supports legacy key)
function getAuthToken() {
    return localStorage.getItem('authToken') || localStorage.getItem('token');
}

// Set auth token in localStorage (write both keys for compatibility)
function setAuthToken(token) {
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('tokenTimestamp', Date.now().toString()); // Track when token was set
}

// Remove auth token from localStorage
function removeAuthToken() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
}

// Get current user from localStorage (supports legacy key)
function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Set current user in localStorage (write both keys for compatibility)
function setCurrentUser(user) {
    const serialized = JSON.stringify(user);
    localStorage.setItem('currentUser', serialized);
    localStorage.setItem('user', serialized);
}

// Remove current user from localStorage
function removeCurrentUser() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('user');
}

// Refresh Firebase token and exchange for backend JWT
async function refreshFirebaseToken() {
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    if (!firebaseUser || typeof firebase === 'undefined' || !firebase.auth) {
        return false;
    }
    
    try {
        const auth = firebase.auth();
        
        // Wait for Firebase auth to be ready (with timeout)
        let currentFirebaseUser = auth.currentUser;
        if (!currentFirebaseUser) {
            await new Promise((resolve) => {
                let resolved = false;
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (!resolved) {
                        resolved = true;
                        unsubscribe();
                        resolve();
                    }
                });
                // Timeout after 2 seconds
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        unsubscribe();
                        resolve();
                    }
                }, 2000);
            });
            currentFirebaseUser = auth.currentUser;
        }
        
        if (!currentFirebaseUser) {
            return false;
        }
        
        // Force refresh Firebase token using getIdToken(true)
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
                return true; // Token was refreshed
            }
        }
    } catch (error) {
        // Silent fail - will try with existing token
        console.error('Token refresh error:', error);
    }
    return false;
}

// Check if token needs refresh before making request
async function checkAndRefreshTokenIfNeeded() {
    const token = getAuthToken();
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    
    // If Firebase user, always refresh token before API calls to ensure it's valid
    if (firebaseUser && typeof firebase !== 'undefined' && firebase.auth) {
        // Always refresh for Firebase users to prevent 403 errors
        return await refreshFirebaseToken();
    }
    
    // For non-Firebase users, check token age
    if (!token) return false;
    
    const tokenTimestamp = parseInt(localStorage.getItem('tokenTimestamp') || '0');
    const tokenAge = Date.now() - tokenTimestamp;
    const twentyMinutes = 20 * 60 * 1000;
    
    // Refresh if token is old or timestamp is missing
    if (tokenAge > twentyMinutes || tokenTimestamp === 0) {
        return await refreshFirebaseToken();
    }
    
    return false;
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    // Always refresh Firebase token before making request to prevent 403 errors
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    if (firebaseUser && typeof firebase !== 'undefined' && firebase.auth) {
        // For Firebase users, always ensure we have a fresh token
        await refreshFirebaseToken();
    } else {
        // For non-Firebase users, check if refresh is needed
        await checkAndRefreshTokenIfNeeded();
    }
    
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const fullUrl = `${API_BASE_URL}${endpoint}`;
    console.log(`🌐 Fetching: ${fullUrl}`);
    
    try {
        const response = await fetch(fullUrl, {
            ...options,
            headers
        });

        console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
        console.log(`📋 Content-Type: ${response.headers.get('content-type')}`);

        // Check if response is ok before parsing JSON
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
            }
            
            // If 403 and Firebase user, try refreshing token once more and retry
            if (response.status === 403 && firebaseUser && typeof firebase !== 'undefined' && firebase.auth) {
                console.log(`🔄 Got 403, refreshing token and retrying...`);
                const refreshed = await refreshFirebaseToken();
                if (refreshed) {
                    // Retry the request with new token
                    headers['Authorization'] = `Bearer ${getAuthToken()}`;
                    const retryResponse = await fetch(fullUrl, {
                        ...options,
                        headers
                    });
                    
                    if (retryResponse.ok) {
                        const contentType = retryResponse.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            return await retryResponse.json();
                        }
                    }
                }
            }
            
            // Only log non-403 errors or if retry failed
            if (response.status !== 403) {
                console.error(`❌ API Error (${response.status}):`, errorText.substring(0, 300));
            }
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error(`❌ Expected JSON but got ${contentType}. Response preview:`, text.substring(0, 300));
            throw new Error(`Expected JSON but got ${contentType}`);
        }

        const data = await response.json();
        // Only log success for non-auth endpoints to reduce noise
        if (!endpoint.includes('/auth/me')) {
            console.log(`✅ Success: Got ${data.length || Object.keys(data).length} items`);
        }
        return data;
    } catch (error) {
        // Don't log 403 token errors - they're handled automatically
        if (!error.message.includes('Invalid or expired token') && !error.message.includes('403')) {
            console.error('❌ API request error:', error);
            console.error('   URL attempted:', fullUrl);
        }
        // Re-throw with more context
        if (error.message.includes('fetch')) {
            throw new Error('Cannot connect to server. Make sure the server is running: npm start');
        }
        throw error;
    }
}

// Authentication API
const authAPI = {
    async register(userData) {
        // Include current cart in registration (first time only)
        const currentCart = JSON.parse(localStorage.getItem('cart') || '[]');
        const dataWithCart = { ...userData, cart: currentCart };
        
        const response = await apiRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(dataWithCart)
        });
        
        if (response.token && response.user) {
            setAuthToken(response.token);
            setCurrentUser(response.user);
            // Set cart from server response (includes items from registration)
            if (response.user.cart) {
                localStorage.setItem('cart', JSON.stringify(response.user.cart));
                console.log('Cart saved with new account:', response.user.cart.length, 'items');
            }
        }
        
        return response;
    },

    async login(email, password) {
        // Don't send guest cart - we want to restore the saved cart from server
        const response = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        if (response.token && response.user) {
            setAuthToken(response.token);
            setCurrentUser(response.user);
            // Replace local cart with saved server cart
            if (response.user.cart && response.user.cart.length > 0) {
                localStorage.setItem('cart', JSON.stringify(response.user.cart));
                console.log('✅ Cart restored from server:', response.user.cart.length, 'items');
                console.log('Cart contents:', response.user.cart);
            } else {
                localStorage.setItem('cart', JSON.stringify([]));
                console.log('⚠️ No saved cart found on server');
            }
        }
        
        return response;
    },

    async getCurrentUser() {
        return await apiRequest('/api/auth/me');
    },

    logout() {
        removeAuthToken();
        removeCurrentUser();
    },

    async requestPasswordReset(email) {
        return await apiRequest('/api/auth/request-password-reset', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    async resetPassword(token, newPassword) {
        return await apiRequest('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, newPassword })
        });
    }
};

// Products API
const productsAPI = {
    async getAll() {
        return await apiRequest('/api/products');
    },

    async getById(id) {
        return await apiRequest(`/api/products/${id}`);
    },

    async create(productData) {
        return await apiRequest('/api/products', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    },

    async update(id, productData) {
        return await apiRequest(`/api/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(productData)
        });
    },

    async delete(id) {
        return await apiRequest(`/api/products/${id}`, {
            method: 'DELETE'
        });
    }
};

// Orders API
const ordersAPI = {
    async getAll() {
        return await apiRequest('/api/orders');
    },

    async getById(id) {
        return await apiRequest(`/api/orders/${id}`);
    },

    async create(orderData) {
        return await apiRequest('/api/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    },

    async updateStatus(id, status) {
        return await apiRequest(`/api/orders/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    },

    async cancel(id) {
        return await apiRequest(`/api/orders/${id}/cancel`, {
            method: 'POST',
            body: JSON.stringify({})
        });
    }
};

// Users API
const usersAPI = {
    async getAll() {
        return await apiRequest('/api/users');
    },

    async updateProfile(profileData) {
        return await apiRequest('/api/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }
};

// Stats API
const statsAPI = {
    async getStats() {
        return await apiRequest('/api/stats');
    }
};

// Stripe Checkout API
const checkoutAPI = {
    async createSession(lineItems) {
        return await apiRequest('/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ line_items: lineItems })
        });
    }
};

