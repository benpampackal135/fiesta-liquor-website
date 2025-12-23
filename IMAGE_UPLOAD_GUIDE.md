# 📸 Image Upload Guide - Admin Dashboard

## How to Add Product Images

You now have **two ways** to add product images in the admin dashboard:

### Option 1: Upload to Firebase Storage (Recommended) ⭐

This is the easiest way - just upload your image file directly!

1. **Go to Admin Dashboard**
   - Navigate to: https://fiesta-liquor-store.web.app/admin-dashboard.html
   - Log in as admin

2. **Click "Add Product" or "Edit" an existing product**

3. **In the "Product Image" section:**
   - Click "Choose File" under "Upload Image to Firebase Storage"
   - Select your image file (PNG, JPG, SVG, etc.)
   - Click "Upload Image" button
   - Wait for upload to complete (you'll see a success message)
   - The Firebase Storage URL will automatically be filled in the "Image URL/Path" field below

4. **Fill in other product details** and click "Save Product"

**Benefits:**
- ✅ No need to manually upload files to server
- ✅ Images stored in cloud (Firebase Storage)
- ✅ Automatic URL generation
- ✅ Works from anywhere (no server access needed)

### Option 2: Manual URL/Path Entry

If you already have an image URL or want to use a local path:

1. **In the "Or Enter Image URL/Path" field:**
   - For local images: Enter `images/filename.png` (file must exist in `public/images/`)
   - For Firebase Storage URLs: Paste the full URL (starts with `https://firebasestorage.googleapis.com/...`)
   - For external URLs: Paste any image URL

2. **Preview will show automatically** as you type

## Firebase Storage Setup (One-Time)

Before you can upload images, make sure Firebase Storage is enabled:

1. **Go to Firebase Console:**
   - https://console.firebase.google.com/project/fiesta-liquor-store/storage

2. **Enable Storage:**
   - Click "Get Started"
   - Choose "Start in test mode" (we'll secure it later)
   - Select a location (choose closest to your users)
   - Click "Done"

3. **Set Storage Rules (Security):**
   - Go to "Rules" tab
   - Update rules to allow authenticated admins to upload:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /products/{allPaths=**} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```
   - Click "Publish"

## Image Requirements

- **Supported formats:** PNG, JPG, JPEG, GIF, SVG, WebP
- **Recommended size:** Under 2MB for faster loading
- **Recommended dimensions:** 500x500px to 1000x1000px
- **Aspect ratio:** Square (1:1) works best for product images

## Troubleshooting

### "Firebase is not initialized" error
- Make sure you're logged in as admin
- Refresh the page
- Check browser console for errors

### Upload fails
- Check Firebase Storage is enabled in Firebase Console
- Verify you're logged in (Firebase Auth required)
- Check browser console for specific error messages
- Make sure image file is not corrupted

### Image doesn't show after upload
- Check the URL in the "Image URL/Path" field
- Try refreshing the page
- Check browser console for CORS or loading errors

### Want to use local images instead?
1. Upload image file to `public/images/` directory on your server
2. Enter path as: `images/filename.png` in the manual URL field
3. Deploy to Firebase: `firebase deploy --only hosting`

## Tips

- **Organize images:** Firebase Storage organizes uploads in `products/` folder automatically
- **Unique filenames:** System adds timestamp to prevent filename conflicts
- **Preview before saving:** Always check the preview to ensure image looks correct
- **Edit existing products:** You can upload a new image to replace an existing one

## Example Workflow

1. Take/select product photo
2. Go to Admin Dashboard → Add Product
3. Fill in product name, category, description, price
4. Click "Choose File" → Select your image
5. Click "Upload Image" → Wait for success message
6. Verify preview looks good
7. Click "Save Product"
8. Done! Image is now live on your website

---

**Need help?** Check the browser console (F12) for detailed error messages.

