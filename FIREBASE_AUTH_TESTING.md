# Firebase Authentication Testing Guide

## Prerequisites

1. **Local Server Running**: Make sure your server is running on `http://localhost:4242`
2. **Browser Console Open**: Press `F12` or `Cmd+Option+I` to open Developer Tools
3. **Firebase Console Access**: https://console.firebase.google.com/project/fiesta-liquor-store/authentication/users

---

## Test 1: Email/Password Sign-Up (New User)

### Steps:
1. Navigate to: `http://localhost:4242/auth.html`
2. Click the **"Register"** tab
3. Fill in the form:
   - **Name**: Test User
   - **Email**: test@example.com (use a real email you can access)
   - **Phone**: +1234567890
   - **Password**: test123456 (min 6 characters)
   - **Confirm Password**: test123456
4. Click **"Create Account"**

### What to Check:
✅ **Browser Console Should Show:**
```
🔐 Attempting Firebase registration for: test@example.com
✅ Persistence confirmed before sign-up
Email sign-up successful, user: test@example.com
Stored Firebase token in localStorage
Attempting to register user with backend...
Backend registration successful: {...}
✅ Backend JWT stored in authToken
✅ Cart restored from server
```

✅ **Expected Behavior:**
- Success message: "Account created successfully! Redirecting..."
- Redirects to `/index.html` (or `/admin-dashboard.html` if admin)
- User info appears in header
- No errors in console

✅ **Firebase Console Check:**
- Go to Firebase Console → Authentication → Users
- You should see the new user with email `test@example.com`
- User should have `firebaseUid` and be marked as `isFirebaseUser: true`

---

## Test 2: Email/Password Sign-In (Existing User)

### Steps:
1. Navigate to: `http://localhost:4242/auth.html`
2. Make sure you're on the **"Login"** tab
3. Enter:
   - **Email**: test@example.com (the one you just created)
   - **Password**: test123456
4. Click **"Sign In"**

### What to Check:
✅ **Browser Console Should Show:**
```
🔐 Attempting Firebase login for: test@example.com
✅ Persistence confirmed before sign-in
Email sign-in successful, user: test@example.com
Stored Firebase token in localStorage
Attempting to sync user with backend...
Backend sync successful: {...}
✅ Backend JWT stored in authToken
✅ Cart restored from server
```

✅ **Expected Behavior:**
- Success message: "Welcome back!"
- Redirects to `/index.html` (or admin dashboard if admin)
- User info appears in header
- Cart items restored (if any)

✅ **Common Errors to Watch For:**
- `auth/user-not-found` → User doesn't exist (use sign-up first)
- `auth/wrong-password` → Incorrect password
- `auth/invalid-email` → Invalid email format
- `auth/too-many-requests` → Too many failed attempts

---

## Test 3: Google Sign-In

### Steps:
1. Navigate to: `http://localhost:4242/auth.html`
2. Click **"Sign in with Google"** button
3. Select your Google account
4. Authorize the app

### What to Check:
✅ **Browser Console Should Show:**
```
🔵 signInWithGoogle called
🚀 Starting Google Sign-In...
✅ Popup sign-in successful (or ✅ Redirect sign-in successful)
Google sign-in successful, user: [your-email@gmail.com]
Stored Firebase token in localStorage
Attempting to register/sync user with backend...
Backend registration successful: {...}
✅ Backend JWT stored in authToken
✅ Cart restored from server
```

✅ **Expected Behavior:**
- Google popup/redirect appears
- After authorization, redirects to home page
- User info with Google profile picture appears in header

---

## Test 4: Password Reset (Forgot Password)

### Steps:
1. Navigate to: `http://localhost:4242/auth.html`
2. Click **"Forgot password?"** link
3. Enter your email: `test@example.com`
4. Click **"Send Reset Email"**

### What to Check:
✅ **Browser Console Should Show:**
```
🔐 Sending password reset email via Firebase for: test@example.com
✅ Password reset email sent to: test@example.com
```

✅ **Expected Behavior:**
- Success message: "Password reset email sent. Please check your inbox (and spam folder)."
- Email field clears
- Reset panel hides after 3 seconds

✅ **Email Check:**
- Check your email inbox (and spam folder)
- You should receive an email from Firebase
- Click the reset link
- Set a new password
- Try logging in with the new password

---

## Test 5: Error Handling

### Test Invalid Email:
1. Try signing in with: `invalid-email`
2. **Expected**: Error message "Please enter a valid email address"

### Test Wrong Password:
1. Sign in with correct email but wrong password
2. **Expected**: Error message "Incorrect password. Please try again."

### Test Non-Existent User:
1. Try signing in with: `nonexistent@example.com`
2. **Expected**: Error message "No account found with this email address."

### Test Weak Password:
1. Try registering with password: `123`
2. **Expected**: Error message "Password must be at least 6 characters"

### Test Password Mismatch:
1. Register with password: `test123` and confirm: `test456`
2. **Expected**: Error message "Passwords do not match"

---

## Test 6: User Data Sync with Backend

### Steps:
1. Sign up or sign in
2. Open Browser Console
3. Check localStorage:
```javascript
// Check Firebase user
JSON.parse(localStorage.getItem('firebaseUser'))

// Check backend user
JSON.parse(localStorage.getItem('currentUser'))

// Check tokens
localStorage.getItem('authToken')
localStorage.getItem('firebaseToken')
```

### What to Verify:
✅ `firebaseUser` contains: `uid`, `email`, `displayName`
✅ `currentUser` contains: `name`, `email`, `phone`, `role`, `firebaseUid`
✅ `authToken` exists (backend JWT token)
✅ `firebaseToken` exists (Firebase ID token)

---

## Test 7: Admin Role Detection

### Steps:
1. Sign in as a regular user
2. Check console for: `user role: customer`
3. **Expected**: Redirects to `/index.html`

### To Test Admin:
1. In Firebase Console → Authentication → Users
2. Or check backend database for user with `role: 'admin'`
3. Sign in with admin account
4. **Expected**: Redirects to `/admin-dashboard.html`

---

## Test 8: Cart Restoration

### Steps:
1. Add items to cart as guest
2. Sign in
3. Check console for: `✅ Cart restored from server` or `✅ Cart merged`

### What to Verify:
✅ Cart items persist after login
✅ Guest cart merges with user cart (if both exist)
✅ Cart syncs to server

---

## Test 9: Sign Out

### Steps:
1. Sign in
2. Click sign out button
3. Check console

### What to Check:
✅ **Console Should Show:**
```
Signed out
```

✅ **Expected Behavior:**
- Redirects to home page
- User info disappears
- Cart persists (for guest browsing)
- All auth tokens cleared from localStorage

---

## Test 10: Session Persistence

### Steps:
1. Sign in
2. Close browser tab
3. Reopen `http://localhost:4242`
4. Check if still logged in

### What to Verify:
✅ User remains logged in (Firebase persistence: LOCAL)
✅ User info still visible
✅ Cart still accessible

---

## Common Issues & Solutions

### Issue: "Firebase Auth is not loaded"
**Solution**: 
- Check if `firebase.js` and `firebase-auth.js` are loaded
- Check browser console for script errors
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### Issue: "Backend sync failed"
**Solution**:
- Check if backend server is running
- Check `API_BASE_URL` in console
- Verify backend endpoint `/api/auth/firebase-register` exists

### Issue: "Email already in use"
**Solution**:
- User already exists, use sign-in instead
- Or delete user from Firebase Console

### Issue: Reset email not received
**Solution**:
- Check spam folder
- Verify email in Firebase Console → Authentication → Users
- Check Firebase Console → Authentication → Templates (email settings)
- Verify domain is authorized in Firebase Console → Authentication → Settings → Authorized domains

---

## Quick Test Checklist

- [ ] Email/Password Sign-Up works
- [ ] Email/Password Sign-In works
- [ ] Google Sign-In works
- [ ] Password Reset works
- [ ] Error messages are user-friendly
- [ ] User data syncs with backend
- [ ] Cart restores after login
- [ ] Admin redirects to dashboard
- [ ] Regular users redirect to home
- [ ] Sign out works
- [ ] Session persists across page reloads
- [ ] No console errors

---

## Firebase Console Verification

After testing, verify in Firebase Console:

1. **Authentication → Users**: All test users should appear
2. **Authentication → Sign-in method**: Email/Password and Google should be enabled
3. **Authentication → Settings → Authorized domains**: Should include `localhost` and your production domain
4. **Hosting**: Deployed site should work the same way

---

## Next Steps After Testing

Once all tests pass locally:
1. Deploy to Firebase Hosting: `firebase deploy --only hosting`
2. Test on production URL: `https://fiesta-liquor-store.web.app/auth.html`
3. Verify production domain is authorized in Firebase Console

