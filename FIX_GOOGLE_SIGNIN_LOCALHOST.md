# 🔧 Fix Google Sign-In on Localhost

## Quick Fix: Use Email/Password Login Instead

If you need to access the admin dashboard immediately, you can use email/password login:

1. Go to `http://localhost:4242/auth.html`
2. Click **"Register"** tab
3. Create an account with:
   - Email: `admin@fiestaliquor.com` (or any email)
   - Password: (any password, min 6 characters)
   - Name, Phone, etc.
4. After registration, you'll be logged in
5. Then manually set yourself as admin (see below)

## Set Yourself as Admin (After Email/Password Login)

### Option 1: Direct Database Edit (Quick)

1. Open `data/users.json`
2. Find your user by email
3. Change `"role": "user"` to `"role": "admin"`
4. Save the file
5. Refresh the admin dashboard

### Option 2: Use the Update Script

Run this command:
```bash
node update-user-role.js
```

Then follow the prompts to set your email as admin.

## Fix Google Sign-In for Localhost (Proper Fix)

### Step 1: Add Localhost to Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **fiesta-liquor-store**
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Click **"Add domain"**
5. Add: `localhost`
6. Click **"Add"**

### Step 2: Configure OAuth Redirect URLs

1. Still in Firebase Console → **Authentication** → **Settings**
2. Scroll to **Authorized redirect URIs**
3. Make sure these are added:
   - `http://localhost:4242`
   - `http://localhost:4242/auth.html`
   - `http://127.0.0.1:4242`
   - `http://127.0.0.1:4242/auth.html`

### Step 3: Check Google OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** → **OAuth consent screen**
4. Under **Authorized domains**, make sure `localhost` is listed
5. Under **Authorized redirect URIs**, add:
   - `http://localhost:4242/__/auth/handler`
   - `http://127.0.0.1:4242/__/auth/handler`

### Step 4: Test

1. Clear browser cache and cookies for localhost
2. Go to `http://localhost:4242/auth.html`
3. Try Google sign-in again

## Alternative: Use a Different Port

If localhost still doesn't work, try using `127.0.0.1` instead:

1. Access your site at: `http://127.0.0.1:4242/auth.html`
2. This sometimes works better with Firebase

## Temporary Workaround: Use Email/Password

Until Google sign-in is fixed, you can:

1. **Register with email/password** on the auth page
2. **Set yourself as admin** using one of the methods above
3. **Access admin dashboard** normally

The email/password authentication works perfectly on localhost and doesn't require any Firebase configuration changes.

## Check Browser Console for Errors

Open browser DevTools (F12) and check the Console tab for specific error messages. Common errors:

- **"auth/unauthorized-domain"** → Add localhost to Firebase authorized domains
- **"auth/popup-blocked"** → Browser is blocking popups (use redirect method)
- **"auth/network-request-failed"** → Check internet connection
- **"auth/operation-not-allowed"** → Google sign-in not enabled in Firebase

## Still Having Issues?

1. **Check Firebase Console** → Authentication → Sign-in method
   - Make sure "Google" is enabled
   - Check that it's configured correctly

2. **Try Incognito/Private Mode**
   - Sometimes browser extensions interfere
   - Test in a clean browser session

3. **Check Server Logs**
   - Look at your terminal where `npm start` is running
   - Check for any error messages

4. **Verify Firebase Config**
   - Check `public/firebase.js` has correct project ID
   - Make sure API keys are correct

## Quick Admin Access Script

Create a file `make-admin.js` in your project root:

```javascript
const fs = require('fs');
const path = require('path');

const usersFile = path.join(__dirname, 'data', 'users.json');
const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

const email = process.argv[2] || 'admin@fiestaliquor.com';
const user = users.find(u => u.email === email);

if (user) {
    user.role = 'admin';
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    console.log(`✅ ${email} is now an admin!`);
} else {
    console.log(`❌ User ${email} not found.`);
    console.log('Available users:', users.map(u => u.email).join(', '));
}
```

Run it:
```bash
node make-admin.js your-email@example.com
```

