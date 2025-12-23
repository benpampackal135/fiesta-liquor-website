# 📱 Fiesta Liquor Mobile App Setup (PWA)

Your Fiesta Liquor website is now a **Progressive Web App (PWA)** - it can be installed as a native mobile app on both iOS and Android!

## ✨ What is a PWA?

A Progressive Web App is a web app that works like a native mobile app:
- ✅ Works offline (cached content)
- ✅ Installable on home screen
- ✅ Push notifications capable
- ✅ Fast loading (service worker caching)
- ✅ Responsive design

## 📲 How to Install on Your Phone

### **Android (Chrome, Edge, Firefox)**

1. **Open your website** on your phone (e.g., `http://192.168.1.x:4242`)
2. **Look for install prompt** - You should see:
   - A banner at the bottom saying "Install" or "Add to home screen"
   - OR a menu icon with install option
3. **Tap "Install"** - The app will be added to your home screen
4. **Done!** Use it like a native app

**Alternative (if no prompt appears):**
- Tap the **3-dot menu** (⋮) in Chrome
- Select **"Install app"** or **"Add to Home screen"**

### **iOS (Safari)**

1. **Open your website** in Safari on your iPhone
2. **Tap the Share button** (box with arrow up) at the bottom
3. **Scroll and tap "Add to Home Screen"**
4. **Enter app name** (e.g., "Fiesta Liquor")
5. **Tap "Add"**
6. **Done!** The app will appear on your home screen

## 🚀 Features

Your app now has:

| Feature | Details |
|---------|---------|
| **App Icon** | 🍾 Bottle emoji icon (customizable) |
| **App Name** | "Fiesta Liquor" on home screen |
| **Offline Support** | Browse products offline with cached data |
| **Fast Loading** | Service worker caches pages & assets |
| **Status Bar** | Dark theme matching your design |
| **Shortcuts** | Quick access to Shop & My Orders |

## 📁 Files Created

- **`public/manifest.json`** - App configuration (name, icons, display mode)
- **`public/service-worker.js`** - Handles offline support and caching
- **Updated HTML files** - Added PWA meta tags for installation

## ⚙️ How It Works

1. **Service Worker** - Automatically caches your pages and assets
2. **Manifest** - Tells the browser your app's name, icons, and settings
3. **Network-first for API** - Tries to fetch fresh data, uses cache if offline
4. **Cache-first for assets** - Uses cached files, updates in background

## 📊 Caching Strategy

- **API Calls** (e.g., `/api/products`) → Network first, cache fallback
- **Static Assets** (CSS, JS, Images) → Cache first, network fallback
- **HTML Pages** → Cache first with network fallback

## 🔄 Updates

When you update the website:
1. Service worker checks for updates every minute
2. If new version found, it automatically reloads the page
3. Users see the latest version without manual refresh

## 🎯 What Works Offline

✅ Browse products (cached data)
✅ View cached pages
✅ Stored cart items (saved in localStorage)
✅ User account info (cached)

❌ **Can't do offline:**
- Create new orders (needs server)
- Fetch new product data
- Update profile

Once connection returns, everything syncs!

## 🌐 Deployment Tips

When deploying to production:

1. **HTTPS Required** - PWAs must be on HTTPS (not HTTP)
   ```bash
   # Use services like:
   # - Vercel
   # - Netlify (with backend proxy)
   # - Railway
   # - Render
   # - Your own server with SSL certificate
   ```

2. **Update Icons** - Replace emoji icons with real images:
   ```json
   {
     "src": "/images/icon-192x192.png",
     "sizes": "192x192",
     "type": "image/png"
   }
   ```

3. **Add Custom Splash Screen** - iOS splash screens:
   ```html
   <link rel="apple-touch-startup-image" href="/splash.png">
   ```

## 🧪 Testing

**Check if Service Worker is registered:**
1. Open DevTools (F12) → Application tab
2. Look for "Service Workers" section
3. Should see `/service-worker.js` as "activated"

**Test offline mode:**
1. Open DevTools → Network tab
2. Check "Offline" checkbox
3. Try browsing the app - should still work!

## 📝 Customization

To customize the app:

**Edit app name/icons:**
- Edit `public/manifest.json`
- Change `"name"` and `"short_name"`
- Add custom icon files

**Change theme color:**
- Edit meta tag in HTML files:
  ```html
  <meta name="theme-color" content="#1a1a2e">
  ```

**Adjust caching strategy:**
- Edit `public/service-worker.js`
- Change `CACHE_NAME` when you update assets

## 🎓 Learn More

- [MDN - Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Google - PWA Documentation](https://web.dev/progressive-web-apps/)
- [Service Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

## ✅ You're All Set!

Your Fiesta Liquor app is ready to install on mobile phones! 🎉

**Next steps:**
1. Open your website on your phone
2. Install it to your home screen
3. Test it offline
4. Share with customers!

---

**Questions?** Check the browser console (DevTools) for any service worker messages.
