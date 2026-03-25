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
  
  // ── Handle redirect result after Google sign-in redirect ──
  // On mobile, sessionStorage is often wiped during cross-domain redirects
  // (your site → Google → firebaseapp.com → your site), so we use
  // localStorage as the primary flag. We also use onAuthStateChanged as
  // the PRIMARY detection mechanism, because getRedirectResult() is
  // unreliable on many mobile browsers (returns null even on success).
  const isPendingRedirect =
    localStorage.getItem('googleRedirectPending') === '1' ||
    sessionStorage.getItem('googleRedirectPending') === '1';
  let redirectHandled = false;

  // Show loading state if we're returning from a redirect
  if (isPendingRedirect) {
    const loadingEl = document.getElementById('redirectLoading');
    const googleBtn = document.querySelector('.google-signin-btn');
    if (loadingEl) loadingEl.style.display = 'block';
    if (googleBtn) googleBtn.style.display = 'none';
    console.log('📱 Detected pending Google redirect, showing loading state');
  }

  // PRIMARY: Use onAuthStateChanged to detect sign-in after redirect.
  // This fires reliably on all mobile browsers when Firebase restores
  // the user from the redirect, even when getRedirectResult() fails.
  if (isPendingRedirect) {
    const redirectAuthUnsub = auth.onAuthStateChanged((user) => {
      if (user && !redirectHandled) {
        redirectHandled = true;
        redirectAuthUnsub();
        clearRedirectFlags();
        console.log('✅ onAuthStateChanged detected user after redirect:', user.email);
        handleGoogleSignInSuccess(user).catch((error) => {
          console.error('Error handling redirect sign-in:', error);
          hideRedirectLoading();
        });
      }
    });

    // Safety timeout: if no user detected after 15 seconds, show retry option
    setTimeout(() => {
      if (!redirectHandled) {
        redirectAuthUnsub();
        clearRedirectFlags();
        hideRedirectLoading();
        console.log('⏰ Redirect timeout — no user detected after 15s');
        const msgBox = document.getElementById('msgBox');
        if (msgBox) {
          msgBox.innerHTML = 'Sign-in timed out. <button onclick="window.location.reload()" style="background:none;border:none;color:var(--accent);text-decoration:underline;cursor:pointer;font:inherit;padding:0;">Tap to retry</button>';
          msgBox.className = 'msg error visible';
        }
      }
    }, 15000);
  }

  // SECONDARY: Also try getRedirectResult() as a backup.
  // On browsers where it works, it provides the result faster.
  const redirectDelay = isIOSSafari() ? 600 : 300;
  setTimeout(() => {
    auth.getRedirectResult().then((result) => {
      if (result && result.user && !redirectHandled) {
        redirectHandled = true;
        clearRedirectFlags();
        console.log('✅ getRedirectResult returned user:', result.user.email);
        handleGoogleSignInSuccess(result.user).catch((error) => {
          console.error('Error handling redirect sign-in:', error);
          hideRedirectLoading();
        });
      }
      // If no user and not pending, just clean up
      if (!isPendingRedirect && !result?.user) {
        hideRedirectLoading();
      }
    }).catch((error) => {
      if (error.code !== 'auth/popup-blocked' &&
          error.code !== 'auth/popup-closed-by-user' &&
          error.code !== 'auth/cancelled-popup-request') {
        console.error('getRedirectResult error:', error.code, error.message);
      }
    });
  }, redirectDelay);

  function clearRedirectFlags() {
    localStorage.removeItem('googleRedirectPending');
    sessionStorage.removeItem('googleRedirectPending');
  }

  function hideRedirectLoading() {
    const loadingEl = document.getElementById('redirectLoading');
    const googleBtn = document.querySelector('.google-signin-btn');
    if (loadingEl) loadingEl.style.display = 'none';
    if (googleBtn) { googleBtn.style.display = ''; googleBtn.disabled = false; googleBtn.style.opacity = '1'; }
  }
  
  console.log('Firebase Auth initialized');
}

// Shared function to handle Google sign-in success (used by both popup and redirect)
async function handleGoogleSignInSuccess(user) {
  try {
    // Always clear redirect flags on successful sign-in
    localStorage.removeItem('googleRedirectPending');
    sessionStorage.removeItem('googleRedirectPending');

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
      // Clear potentially stale role info so admin dashboard re-validates via /api/auth/me
      localStorage.removeItem('currentUser');
    }
    
    // Restore cart from server
    await syncCartOnLogin(token);
    
    updateAuthUI();
    
    // Redirect based on page
    // On iOS Safari, use href instead of reload for better reliability
    if (window.location.pathname.includes('auth.html') || window.location.pathname === '/auth') {
      console.log('Redirecting from auth page to home');
      // Check for redirect param
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirect') ? '/' + params.get('redirect') : '/';
      setTimeout(() => {
        window.location.href = redirectTo;
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

// Detect iOS Chrome (CriOS) - signInWithRedirect is broken on iOS Chrome
// because it uses SFSafariViewController which doesn't share storage with the app
function isIOSChrome() {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isChrome = /crios/.test(ua);
  return isIOS && isChrome;
}

// Detect any iOS in-app or third-party browser where redirect won't work
function isIOSBrowserWithBrokenRedirect() {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, OPiOS = Opera
  const isThirdPartyBrowser = /crios|fxios|edgios|opios|gsa\//.test(ua);
  return isIOS && isThirdPartyBrowser;
}

// Detect mobile browsers (iOS, Android, etc.)
function isMobileBrowser() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|android|mobile|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua);
}

// We now try popup first on ALL devices (including mobile).
// Modern mobile browsers allow popups from user-initiated clicks.
// Only fall back to redirect if the popup is explicitly blocked.
function shouldUseRedirect() {
  return false;
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
    
    // Try popup first on ALL devices (including mobile).
    // Modern mobile browsers allow popups from user-initiated clicks.
    // Only fall back to redirect if the popup is explicitly blocked.
    // IMPORTANT: On iOS Chrome/Firefox/Edge, NEVER fall back to redirect —
    // it uses SFSafariViewController which doesn't share storage with the app,
    // causing "Sign-in timed out" every time.
    let result;
    let user;
    const brokenRedirect = isIOSBrowserWithBrokenRedirect();

    try {
      console.log('🪟 Attempting popup sign-in...');
      if (brokenRedirect) {
        console.log('📱 iOS third-party browser detected — popup-only mode (redirect is broken)');
      }

      // On iOS Chrome, wrap popup in a race with onAuthStateChanged listener
      // because sometimes the popup resolves the auth state but the promise hangs
      if (brokenRedirect) {
        result = await new Promise((resolve, reject) => {
          let settled = false;

          // Backup: listen for auth state change in case popup promise doesn't resolve
          const unsubscribe = auth.onAuthStateChanged((authUser) => {
            if (authUser && !settled) {
              settled = true;
              unsubscribe();
              console.log('✅ Auth state detected user after popup (backup listener):', authUser.email);
              resolve({ user: authUser });
            }
          });

          // Primary: popup promise
          auth.signInWithPopup(googleProvider)
            .then((popupResult) => {
              if (!settled) {
                settled = true;
                unsubscribe();
                resolve(popupResult);
              }
            })
            .catch((err) => {
              if (!settled) {
                settled = true;
                unsubscribe();
                reject(err);
              }
            });

          // Safety timeout: 60 seconds for the entire flow on iOS
          setTimeout(() => {
            if (!settled) {
              settled = true;
              unsubscribe();
              reject(new Error('Sign-in took too long. Please try again.'));
            }
          }, 60000);
        });
        user = result.user;
        console.log('✅ Popup sign-in successful (iOS browser)');
      } else {
        result = await auth.signInWithPopup(googleProvider);
        user = result.user;
        console.log('✅ Popup sign-in successful');
      }
    } catch (popupError) {
      console.log('⚠️ Popup failed:', popupError.code, popupError.message);

      // If popup was closed by user, don't fall back — they intentionally cancelled
      if (popupError.code === 'auth/popup-closed-by-user' ||
          popupError.code === 'auth/cancelled-popup-request') {
        console.log('User cancelled sign-in');
        return;
      }

      // On iOS Chrome/Firefox/Edge, DON'T fall back to redirect — it's broken.
      // Show a helpful message instead.
      if (brokenRedirect) {
        console.log('❌ Popup failed on iOS browser where redirect is also broken');
        const msgBox = document.getElementById('msgBox');
        if (msgBox) {
          msgBox.innerHTML = 'Google sign-in popup was blocked. Please allow pop-ups for this site in your browser settings, or <a href="javascript:void(0)" onclick="window.firebaseAuth.signInWithGoogle()" style="color:var(--accent);text-decoration:underline;">tap to try again</a>. You can also try opening this site in Safari.';
          msgBox.className = 'msg error visible';
        } else {
          alert('Google sign-in was blocked. Please allow pop-ups for this site in your browser settings and try again, or open this site in Safari.');
        }
        return;
      }

      // For popup-blocked or other errors on non-iOS-Chrome browsers, fall back to redirect
      console.log('🔄 Falling back to redirect method...');
      try {
        localStorage.setItem('googleRedirectPending', '1');
        sessionStorage.setItem('googleRedirectPending', '1');
        await auth.signInWithRedirect(googleProvider);
        return;
      } catch (redirectError) {
        console.error('❌ Redirect also failed:', redirectError);
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
      localStorage.removeItem('currentUser');
    }

    // Restore cart from server
    await syncCartOnLogin(token);
    
    updateAuthUI();
    
    // Redirect based on page
    if (window.location.pathname.includes('auth.html') || window.location.pathname === '/auth') {
      console.log('Redirecting from auth page to home');
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirect') ? '/' + params.get('redirect') : '/';
      setTimeout(() => {
        window.location.href = redirectTo;
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
    if (window.location.pathname.includes('auth.html') || window.location.pathname === '/auth') {
      console.log('Redirecting from auth page to home');
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirect') ? '/' + params.get('redirect') : '/';
      setTimeout(() => {
        window.location.href = redirectTo;
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
    window.location.href = '/';
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
