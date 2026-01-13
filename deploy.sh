#!/bin/bash

# Fiesta Liquor Website - Deployment Script
# This script deploys both backend (Railway) and frontend (Firebase)

set -e  # Exit on error

echo "🚀 Starting deployment process..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Sync files to public folder
echo -e "${YELLOW}📁 Step 1: Syncing files to public folder...${NC}"
if [ -f "admin-dashboard.html" ] && [ -f "public/admin-dashboard.html" ]; then
    cp admin-dashboard.html public/admin-dashboard.html
    echo "✅ Copied admin-dashboard.html"
fi

if [ -f "product-import.html" ] && [ -f "public/product-import.html" ]; then
    cp product-import.html public/product-import.html
    echo "✅ Copied product-import.html"
fi

# Step 2: Deploy Backend to Railway
echo ""
echo -e "${YELLOW}🚂 Step 2: Deploying backend to Railway...${NC}"
if command -v railway &> /dev/null; then
    echo "Deploying to Railway..."
    railway up --detach
    echo -e "${GREEN}✅ Backend deployed to Railway${NC}"
else
    echo -e "${RED}⚠️  Railway CLI not found. Please install it or deploy manually.${NC}"
    echo "   Install: npm i -g @railway/cli"
    echo "   Or deploy via Railway dashboard"
fi

# Step 3: Deploy Frontend to Firebase
echo ""
echo -e "${YELLOW}🔥 Step 3: Deploying frontend to Firebase...${NC}"
if command -v firebase &> /dev/null; then
    echo "Deploying to Firebase Hosting..."
    firebase deploy --only hosting
    echo -e "${GREEN}✅ Frontend deployed to Firebase${NC}"
else
    echo -e "${RED}⚠️  Firebase CLI not found. Please install it or deploy manually.${NC}"
    echo "   Install: npm i -g firebase-tools"
    echo "   Or deploy via Firebase console"
fi

# Step 4: Summary
echo ""
echo -e "${GREEN}✨ Deployment Summary:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Files synced to public folder"
echo "✅ Backend: https://fiesta-liquor-website-production.up.railway.app"
echo "✅ Frontend: https://fiesta-liquor-store.web.app"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Verify webhook in Stripe Dashboard"
echo "2. Test barcode scanning in admin dashboard"
echo "3. Make a test payment to verify webhook"
echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"

