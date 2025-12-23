# Fix Chrome Image Loading Issues

## Quick Fix (Try This First)

1. **Hard Refresh Chrome**:
   - Windows/Linux: `Ctrl + Shift + R` or `Ctrl + F5`
   - Mac: `Cmd + Shift + R`

2. **Clear Chrome Cache**:
   - Press `F12` to open DevTools
   - Right-click the refresh button (while DevTools is open)
   - Select "Empty Cache and Hard Reload"

3. **Clear Service Worker Cache**:
   - Open DevTools (`F12`)
   - Go to "Application" tab
   - Click "Service Workers" in left sidebar
   - Click "Unregister" for any service workers
   - Go to "Cache Storage" in left sidebar
   - Right-click each cache and select "Delete"
   - Refresh the page

## Permanent Fix (Already Deployed)

The service worker has been updated to:
- Use network-first strategy for images (always fetch fresh images)
- Increment cache version to `v3` (forces cache clear)
- Better handle image loading errors

## If Images Still Don't Load

1. **Check Browser Console**:
   - Press `F12` → Console tab
   - Look for any red error messages
   - Check if images are being blocked

2. **Check Network Tab**:
   - Press `F12` → Network tab
   - Filter by "Img"
   - Check if image requests are failing (red status)
   - Check the actual image URL being requested

3. **Disable Extensions**:
   - Some Chrome extensions block images
   - Try incognito mode: `Ctrl + Shift + N` (Windows) or `Cmd + Shift + N` (Mac)

4. **Check Image Path**:
   - Make sure image path is correct: `images/filename.png`
   - Verify file exists in `public/images/` directory
   - Check for typos in filename (case-sensitive)

## Why This Happens

Chrome aggressively caches resources including images. The service worker was using a "cache-first" strategy, which meant Chrome would serve old cached images even if new ones were available.

The fix changes images to "network-first" strategy, so Chrome always tries to fetch fresh images from the server first.

