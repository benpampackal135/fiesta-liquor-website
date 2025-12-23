// Firebase Authentication Handler - Using Compat SDK

// Initialize Firebase references (wait for Firebase to be ready)
// Use window object to prevent duplicate declarations
if (typeof window.firebaseAuthInitialized === 'undefined') {
  window.firebaseAuthInitialized = false;
}

let auth;
let googleProvider;
let isFirstAuthCheck = true; // Track if this is the first auth state callback

// Wait for Firebase to be ready
function initializeFirebaseAuth() {
  // Prevent multiple initializations
  if (window.firebaseAuthInitialized) {
    return;
  }
  
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    setTimeout(initializeFirebaseAuth, 100);
    return;
  }
  
  // Mark as initialized before proceeding
  window.firebaseAuthInitialized = true;
  
  auth = firebase.auth();
  googleProvider = new firebase.auth.GoogleAuthProvider();
  // Add scopes for better iOS Safari compatibility
  googleProvider.addScope('profile');
  googleProvider.addScope('email');
  // Set custom parameters for better mobile experience
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
  
  // CRITICAL: Set persistence to LOCAL before any auth operations
  // This ensures auth state persists across page navigations
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
      console.log('✅ Firebase Auth persistence set to LOCAL');
      console.log('Current user after persistence set:', auth.currentUser);
    })
    .catch((error) => {
      console.error('❌ Error setting persistence:', error);
    });
  
  // Global auth state listener - logs all auth changes
  auth.onAuthStateChanged((user) => {
    // Skip logging the initial null state (happens before persistence restore)
    if (isFirstAuthCheck && !user) {
      isFirstAuthCheck = false;
      return;
    }
    if (user) {
      console.log('🔑 Firebase Auth: Logged in -', user.email);
    }
    // Don't log "logged out" - it's confusing for backend-auth users
  });
  
  // Handle redirect result after Google sign-in redirect
  // This is critical for iOS Safari which uses redirect flow
  // Add a small delay to ensure page is fully loaded (especially important for iOS Safari)
  setTimeout(() => {
    auth.getRedirectResult().then((result) => {
      if (result.user) {
        console.log('✅ Google sign-in via redirect successful, user:', result.user.email);
        // Handle the sign-in success asynchronously
        handleGoogleSignInSuccess(result.user).catch((error) => {
          console.error('Error handling redirect sign-in success:', error);
        });
      } else {
        // Check if there's an error in the result
        if (result.error) {
          console.error('Redirect sign-in error:', result.error);
          // Only show alert for actual errors, not user cancellation
          if (result.error.code !== 'auth/popup-closed-by-user' && result.error.code !== 'auth/cancelled-popup-request') {
            alert('Failed to sign in with Google: ' + result.error.message);
          }
        }
      }
    }).catch((error) => {
      // Only log/show errors that aren't user cancellations
      if (error.code !== 'auth/popup-blocked' && 
          error.code !== 'auth/popup-closed-by-user' && 
          error.code !== 'auth/cancelled-popup-request') {
        console.error('Redirect sign-in error:', error);
        // Don't show alert for redirect errors - they're usually handled by getRedirectResult
      }
    });
  }, 100); // Small delay to ensure page is ready (especially important for iOS Safari)
  
  console.log('Firebase Auth initialized');
}

// Shared function to handle Google sign-in success (used by both popup and redirect)
async function handleGoogleSignInSuccess(user) {
  try {
    // Get Firebase token
    const token = await user.getIdToken();
    
    // Store Firebase user info
    localStorage.setItem('firebaseUser', JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    }));
    
    localStorage.setItem('firebaseToken', token);
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token);
    
    console.log('Stored Firebase token in localStorage');
    
    // Create or update user in backend database
    try {
      console.log('Attempting to register/sync user with backend...');
      const userData = {
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        phone: '',
        firebaseUid: user.uid,
        isFirebaseUser: true
      };
      
      // Use fetch directly (don't use apiRequest) so we don't send Firebase token in Authorization header
      const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
      const response = await fetch(`${apiUrl}/api/auth/firebase-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data) {
        console.log('Backend registration successful:', data);
        
        // Store the BACKEND auth token (overwrite Firebase token)
        if (data.token) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('token', data.token);
          console.log('✅ Backend JWT stored in authToken');
        }
        
        // Store current user info
        if (data.user) {
          localStorage.setItem('currentUser', JSON.stringify(data.user));
        }
      }
    } catch (backendError) {
      console.error('Backend registration error:', backendError);
      // Don't fail the login - user is authenticated with Firebase
    }
    
    // Restore cart from server
    await syncCartOnLogin(token);
    
    updateAuthUI();
    
    // Redirect based on page
    // On iOS Safari, use href instead of reload for better reliability
    if (window.location.pathname.includes('auth.html')) {
      console.log('Redirecting from auth.html to index.html');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 500);
    } else {
      console.log('Redirecting to update UI');
      // Use href instead of reload for better iOS Safari compatibility
      // This ensures the page fully reloads and processes the auth state
      setTimeout(() => {
        window.location.href = window.location.pathname + window.location.search;
      }, 300);
    }
  } catch (error) {
    console.error('Error handling Google sign-in success:', error);
    throw error;
  }
}

// Initialize immediately
initializeFirebaseAuth();

// Detect iOS Safari
function isIOSSafari() {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
  return isIOS && isSafari;
}

// Detect mobile browsers (iOS, Android, etc.)
function isMobileBrowser() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|android|mobile|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua);
}

// Detect if popups are likely to be blocked (mobile or certain desktop scenarios)
function shouldUseRedirect() {
  // Always use redirect on mobile browsers
  if (isMobileBrowser()) {
    return true;
  }
  // Always use redirect on iOS Safari
  if (isIOSSafari()) {
    return true;
  }
  // Use redirect by default for better reliability (popups are often blocked)
  // Set to false if you want to try popup first on desktop
  return true; // Changed to true - redirect is more reliable across all browsers
}

// Sign in with Google
async function signInWithGoogle() {
  console.log('🔵 signInWithGoogle called');
  
  try {
    // Wait for Firebase to be ready if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      console.log('⏳ Waiting for Firebase to initialize...');
      let attempts = 0;
      while ((typeof firebase === 'undefined' || !firebase.apps.length) && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (typeof firebase === 'undefined' || !firebase.apps.length) {
        throw new Error('Firebase failed to initialize');
      }
    }
    
    // Re-initialize auth if needed
    if (!auth || !googleProvider) {
      console.log('🔄 Initializing auth and provider...');
      auth = firebase.auth();
      googleProvider = new firebase.auth.GoogleAuthProvider();
      // Add scopes for better iOS Safari compatibility
      googleProvider.addScope('profile');
      googleProvider.addScope('email');
      // Set custom parameters for better mobile experience
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });
    }
    
    // Ensure persistence is set before sign-in
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    console.log('✅ Persistence confirmed before sign-in');
    
    const useRedirect = shouldUseRedirect();
    const isIOS = isIOSSafari();
    const isMobile = isMobileBrowser();
    console.log('📱 Device check - isMobile:', isMobile, 'isIOSSafari:', isIOS, 'useRedirect:', useRedirect);
    console.log('🌐 User Agent:', navigator.userAgent);
    
    console.log('🚀 Starting Google Sign-In...');
    
    // On mobile browsers or when redirect is preferred, use redirect directly
    if (useRedirect) {
      console.log('📱 Mobile browser detected - using redirect method');
      try {
        console.log('🔄 Calling signInWithRedirect...');
        await auth.signInWithRedirect(googleProvider);
        console.log('✅ Redirect initiated - page will navigate');
        // The page will redirect, so we return here
        return;
      } catch (redirectError) {
        console.error('❌ Redirect sign-in error:', redirectError);
        console.error('Error code:', redirectError.code);
        console.error('Error message:', redirectError.message);
        alert('Failed to sign in with Google: ' + redirectError.message);
        return;
      }
    }
    
    // For desktop browsers, try popup first, but immediately fallback to redirect if blocked
    // Note: Many browsers block popups, so redirect is often more reliable
    let result;
    let user;
    
    try {
      // Try popup method first (works best on desktop when not blocked)
      console.log('🪟 Attempting popup sign-in...');
      result = await auth.signInWithPopup(googleProvider);
      user = result.user;
      console.log('✅ Popup sign-in successful');
    } catch (popupError) {
      // If popup is blocked or fails, immediately use redirect method
      console.log('⚠️ Popup failed or blocked');
      console.log('Error code:', popupError.code);
      console.log('Error message:', popupError.message);
      
      // Check if it's a popup-blocked error or any other error
      const isPopupBlocked = popupError.code === 'auth/popup-blocked' || 
                            popupError.code === 'auth/popup-closed-by-user' ||
                            popupError.message?.toLowerCase().includes('popup');
      
      if (isPopupBlocked) {
        console.log('🔄 Popup blocked - switching to redirect method...');
      } else {
        console.log('🔄 Popup error - switching to redirect method...');
      }
      
      try {
        await auth.signInWithRedirect(googleProvider);
        console.log('✅ Redirect initiated - page will navigate');
        // The page will redirect, so we return here
        return;
      } catch (redirectError) {
        console.error('❌ Redirect also failed:', redirectError);
        console.error('Redirect error code:', redirectError.code);
        console.error('Redirect error message:', redirectError.message);
        alert('Failed to sign in with Google. Please check your browser settings and try again.\n\nError: ' + redirectError.message);
        throw new Error('Both popup and redirect methods failed: ' + redirectError.message);
      }
    }
    
    console.log('Google sign-in successful, user:', user.email);
    
    // Handle the sign-in success (shared logic for both popup and redirect)
    await handleGoogleSignInSuccess(user);
    
    return user;
  } catch (error) {
    console.error('Google sign-in error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    alert('Failed to sign in with Google: ' + error.message);
  }
}

// Sign up with email/password
async function signUpWithEmail(email, password, displayName) {
  try {
    // Ensure persistence is set before sign-up
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    console.log('✅ Persistence confirmed before sign-up');
    
    const result = await auth.createUserWithEmailAndPassword(email, password);
    const user = result.user;
    
    console.log('Email sign-up successful, user:', user.email);
    
    // Get Firebase token
    const token = await user.getIdToken();
    
    // Store Firebase user info
    localStorage.setItem('firebaseUser', JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: displayName || user.email,
      photoURL: null
    }));
    
    localStorage.setItem('firebaseToken', token);
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token);
    
    console.log('Stored Firebase token in localStorage');
    
    // Create user in backend database
    try {
      console.log('Attempting to register user with backend...');
      const userData = {
        name: displayName || user.email.split('@')[0],
        email: user.email,
        phone: '',
        firebaseUid: user.uid,
        isFirebaseUser: true
      };
      
      // Use fetch directly (don't use apiRequest) so we don't send Firebase token in Authorization header
      const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
      const response = await fetch(`${apiUrl}/api/auth/firebase-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data) {
        console.log('Backend registration successful:', data);
        
        // Store the BACKEND auth token (overwrite Firebase token)
        if (data.token) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('token', data.token);
          console.log('✅ Backend JWT stored in authToken');
        }
        
        // Store current user info
        if (data.user) {
          localStorage.setItem('currentUser', JSON.stringify(data.user));
        }
      }
    } catch (backendError) {
      console.error('Backend registration error:', backendError);
    }
    
    // Restore cart from server
    await syncCartOnLogin(token);
    
    updateAuthUI();
    
    // Redirect based on page
    if (window.location.pathname.includes('auth.html')) {
      console.log('Redirecting from auth.html to index.html');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 500);
    } else {
      console.log('Refreshing page to update UI');
      window.location.reload();
    }
    
    return user;
  } catch (error) {
    console.error('Sign-up error:', error);
    throw new Error(error.message);
  }
}

// Sign in with email/password
async function signInWithEmail(email, password) {
  try {
    // Ensure persistence is set before sign-in
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    console.log('✅ Persistence confirmed before sign-in');
    
    const result = await auth.signInWithEmailAndPassword(email, password);
    const user = result.user;
    
    console.log('Email sign-in successful, user:', user.email);
    
    // Get Firebase token
    const token = await user.getIdToken();
    
    // Store Firebase user info
    localStorage.setItem('firebaseUser', JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email,
      photoURL: user.photoURL
    }));
    
    localStorage.setItem('firebaseToken', token);
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token);
    
    console.log('Stored Firebase token in localStorage');
    
    // Sync with backend database
    try {
      console.log('Attempting to sync user with backend...');
      const userData = {
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        phone: '',
        firebaseUid: user.uid,
        isFirebaseUser: true
      };
      
      // Use fetch directly (don't use apiRequest) so we don't send Firebase token in Authorization header
      const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
      const response = await fetch(`${apiUrl}/api/auth/firebase-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data) {
        console.log('Backend sync successful:', data);
        
        // Store the BACKEND auth token (overwrite Firebase token)
        if (data.token) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('token', data.token);
          console.log('✅ Backend JWT stored in authToken');
        }
        
        // Store current user info
        if (data.user) {
          localStorage.setItem('currentUser', JSON.stringify(data.user));
        }
      }
    } catch (backendError) {
      console.error('Backend sync error:', backendError);
    }
    
    // Restore cart from server
    await syncCartOnLogin(token);
    
    updateAuthUI();
    
    // Redirect based on page
    if (window.location.pathname.includes('auth.html')) {
      console.log('Redirecting from auth.html to index.html');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 500);
    } else {
      console.log('Refreshing page to update UI');
      window.location.reload();
    }
    
    return user;
  } catch (error) {
    console.error('Sign-in error:', error);
    throw new Error(error.message);
  }
}

// Sign out
async function firebaseSignOut() {
  try {
    // Save cart before signing out (don't clear it)
    const currentCart = localStorage.getItem('cart');
    
    await auth.signOut();
    
    // Remove ALL auth tokens and user info
    localStorage.removeItem('firebaseUser');
    localStorage.removeItem('firebaseToken');
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('user');
    
    // Delete user-specific cart cookie (will create guest cookie below)
    if (typeof window.deleteCookie !== 'undefined' && typeof window.getCartCookieName !== 'undefined') {
      try {
        const cartCookieName = window.getCartCookieName();
        window.deleteCookie(cartCookieName);
      } catch (error) {
        // Ignore errors
      }
    }
    
    // Keep cart for guest browsing
    if (currentCart) {
      localStorage.setItem('cart', currentCart);
      // Save to guest cookie
      if (typeof window.setCookie !== 'undefined') {
        try {
          window.setCookie('cart_guest', currentCart, 30);
        } catch (error) {
          // Ignore errors
        }
      }
    }
    
    console.log('Signed out');
    updateAuthUI();
    window.location.href = '/index.html';
  } catch (error) {
    console.error('Sign-out error:', error);
  }
}

// Helper function to get first name from full name
function getFirstName(fullName) {
  if (!fullName) return 'User';
  const nameParts = fullName.trim().split(/\s+/);
  return nameParts[0] || 'User';
}

// Update UI based on auth state
function updateAuthUI() {
  const firebaseUserInfo = document.getElementById('firebaseUserInfo');
  const loginActions = document.getElementById('loginActions');
  const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
  
  if (firebaseUser) {
    if (firebaseUserInfo) {
      firebaseUserInfo.style.display = 'flex';
      const userName = firebaseUserInfo.querySelector('#firebaseUserName');
      const userPhoto = firebaseUserInfo.querySelector('#firebaseUserPhoto');
      
      if (userName) {
        const fullName = firebaseUser.displayName || firebaseUser.email;
        userName.textContent = getFirstName(fullName);
      }
      
      if (userPhoto) {
        if (firebaseUser.photoURL) {
          userPhoto.src = firebaseUser.photoURL;
          userPhoto.style.display = 'block';
        } else {
          userPhoto.style.display = 'none';
        }
      }
    }
    if (loginActions) loginActions.style.display = 'none';
  } else {
    if (firebaseUserInfo) firebaseUserInfo.style.display = 'none';
    if (loginActions) loginActions.style.display = 'flex';
  }
  
  // Also update the main header userName element if it exists
  const mainUserName = document.getElementById('userName');
  if (mainUserName) {
    const storedUser = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
    const firebaseUser = JSON.parse(localStorage.getItem('firebaseUser') || 'null');
    const fullName = storedUser?.name || firebaseUser?.displayName || firebaseUser?.email || '';
    if (fullName) {
      const currentText = mainUserName.textContent;
      // Only update if it's showing a full name (has spaces)
      if (currentText.includes('Welcome,')) {
        const namePart = currentText.replace('Welcome,', '').trim();
        if (namePart.includes(' ') || namePart === fullName) {
          mainUserName.textContent = `Welcome, ${getFirstName(fullName)}`;
        }
      }
    }
  }
}

// Auth UI updates are now handled by the global listener above

// Helper function to restore cart on login
async function syncCartOnLogin(token) {
  try {
    // Use backend JWT token (not Firebase token) - get it from localStorage
    const backendToken = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!backendToken) {
      console.log('No backend token available for cart restore');
      return;
    }
    
    // Use API_BASE_URL to ensure requests go to Railway, not Firebase Hosting
    const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
    
    // Load cart from server (restore saved cart, don't merge with guest cart)
    const response = await fetch(`${apiUrl}/api/cart`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${backendToken}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const serverCart = data && data.cart ? data.cart : [];
      
      // Get cached guest cart (if user was shopping before login)
      const cachedCartStr = localStorage.getItem('cartCache');
      const cachedCart = cachedCartStr ? JSON.parse(cachedCartStr) : [];
      
      // Merge carts: combine server cart with cached guest cart
      // Use a Map to avoid duplicates (by productId + selectedSize)
      const cartMap = new Map();
      
      // First, add server cart items
      serverCart.forEach(item => {
        const key = `${item.id}-${item.selectedSize?.size || 'default'}`;
        cartMap.set(key, item);
      });
      
      // Then, add cached guest cart items (will overwrite duplicates or add new ones)
      cachedCart.forEach(item => {
        const key = `${item.id}-${item.selectedSize?.size || 'default'}`;
        const existing = cartMap.get(key);
        if (existing) {
          // Merge quantities if same product+size
          existing.quantity = Math.max(existing.quantity, item.quantity);
        } else {
          // Add new item
          cartMap.set(key, item);
        }
      });
      
      // Convert back to array
      const mergedCart = Array.from(cartMap.values());
      
      // Save merged cart
      const mergedCartJson = JSON.stringify(mergedCart);
      localStorage.setItem('cart', mergedCartJson);
      
      // Also save to cookie
      if (typeof setCookie !== 'undefined') {
        const cartCookieName = typeof getCartCookieName !== 'undefined' ? getCartCookieName() : 'cart_user';
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
          console.log('Could not save cart to cookie:', cookieError.message);
        }
      }
      
      // Update global cart variable if it exists (for script.js)
      if (typeof window !== 'undefined' && window.cart !== undefined) {
        window.cart = mergedCart;
      }
      
      // Clear cache after merging
      if (cachedCart.length > 0) {
        localStorage.removeItem('cartCache');
        console.log(`✅ Cart merged: ${serverCart.length} server items + ${cachedCart.length} guest items = ${mergedCart.length} total items`);
      } else {
        console.log('✅ Cart restored from server:', serverCart.length, 'items');
      }
      
      // Sync merged cart back to server
      try {
        const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
        const syncResponse = await fetch(`${apiUrl}/api/cart/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${backendToken}`
          },
          body: JSON.stringify({ cart: mergedCart })
        });
        if (syncResponse.ok) {
          console.log('✅ Merged cart synced to server');
        }
      } catch (syncError) {
        console.log('Cart sync skipped:', syncError.message);
      }
      
      // Trigger cart update in UI if we're on the main page
      if (typeof updateCartCount === 'function') {
        updateCartCount();
      }
      if (typeof updateCartDisplay === 'function') {
        updateCartDisplay();
      }
    } else if (response.status === 401 || response.status === 403) {
      console.log('Cart restore skipped: authentication required');
      // If server cart load fails due to auth, use cached cart
      const cachedCartStr = localStorage.getItem('cartCache');
      if (cachedCartStr) {
        const cachedCart = JSON.parse(cachedCartStr);
        localStorage.setItem('cart', cachedCartStr);
        if (typeof window !== 'undefined' && window.cart !== undefined) {
          window.cart = cachedCart;
        }
        localStorage.removeItem('cartCache');
        console.log('✅ Using cached guest cart:', cachedCart.length, 'items');
      }
    } else {
      console.error('Failed to restore cart:', response.status);
      // If server cart load fails, use cached cart
      const cachedCartStr = localStorage.getItem('cartCache');
      if (cachedCartStr) {
        const cachedCart = JSON.parse(cachedCartStr);
        localStorage.setItem('cart', cachedCartStr);
        if (typeof window !== 'undefined' && window.cart !== undefined) {
          window.cart = cachedCart;
        }
        localStorage.removeItem('cartCache');
        console.log('✅ Using cached guest cart:', cachedCart.length, 'items');
        
        // Sync cached cart to server
        try {
          const apiUrl = window.API_BASE_URL || 'https://fiesta-liquor-website-production.up.railway.app';
          await fetch(`${apiUrl}/api/cart/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${backendToken}`
            },
            body: JSON.stringify({ cart: cachedCart })
          });
        } catch (syncError) {
          console.log('Cart sync skipped:', syncError.message);
        }
      } else {
        localStorage.setItem('cart', JSON.stringify([]));
        if (typeof window !== 'undefined' && window.cart !== undefined) {
          window.cart = [];
        }
        console.log('No saved cart on server, starting fresh');
      }
    }
  } catch (error) {
    console.error('Failed to restore cart:', error);
  }
}

// Call updateAuthUI on page load to restore state
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
});

// Export functions immediately (even before Firebase is ready)
window.firebaseAuth = {
  signInWithGoogle: async function() {
    console.log('🔵 firebaseAuth.signInWithGoogle called');
    return await signInWithGoogle();
  },
  signUpWithEmail,
  signInWithEmail,
  firebaseSignOut,
  updateAuthUI,
  async sendPasswordReset(email) {
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      alert('Password reset email sent. Please check your inbox.');
    } catch (error) {
      console.error('Firebase reset error:', error);
      alert(error.message || 'Failed to send password reset email');
    }
  }
};

// Also expose signInWithGoogle directly for easier access
window.signInWithGoogle = signInWithGoogle;

// Add direct event listeners to Google sign-in buttons when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupGoogleButtons);
} else {
  setupGoogleButtons();
}

function setupGoogleButtons() {
  const googleButtons = document.querySelectorAll('.google-signin-btn');
  console.log('🔍 Found', googleButtons.length, 'Google sign-in buttons');
  
  googleButtons.forEach((button, index) => {
    // Remove existing onclick and add event listener
    button.removeAttribute('onclick');
    button.setAttribute('type', 'button'); // Ensure it doesn't submit forms
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`🔵 Google button ${index + 1} clicked`);
      button.disabled = true; // Prevent double-clicks
      button.style.opacity = '0.6';
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error('Button click error:', error);
        alert('Failed to sign in: ' + error.message);
        button.disabled = false;
        button.style.opacity = '1';
      }
    });
    console.log(`✅ Added click handler to button ${index + 1}`);
  });
}
