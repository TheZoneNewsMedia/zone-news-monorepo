#!/bin/bash

# Build script for Astro applications
# This script builds both web and admin Astro apps for production

set -e

echo "🚀 Building Astro Applications..."
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the monorepo root directory"
    exit 1
fi

# Install dependencies if needed
print_status "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    print_status "Installing root dependencies..."
    npm install
fi

# Build Web App
print_status "Building Web Application..."
cd apps/web

# Install web app dependencies
if [ ! -d "node_modules" ]; then
    print_status "Installing web app dependencies..."
    npm install
fi

# Clean previous build
print_status "Cleaning previous web build..."
npm run clean 2>/dev/null || true

# Build web app
print_status "Building web app for production..."
if npm run build; then
    print_success "Web app built successfully"
else
    print_error "Failed to build web app"
    exit 1
fi

# Check if build output exists
if [ -d "dist" ]; then
    print_success "Web app dist folder created"
    du -sh dist
else
    print_error "Web app build failed - no dist folder found"
    exit 1
fi

cd ../..

# Build Admin App
print_status "Building Admin Application..."
cd apps/admin

# Install admin app dependencies
if [ ! -d "node_modules" ]; then
    print_status "Installing admin app dependencies..."
    npm install
fi

# Clean previous build
print_status "Cleaning previous admin build..."
npm run clean 2>/dev/null || true

# Build admin app
print_status "Building admin app for production..."
if npm run build; then
    print_success "Admin app built successfully"
else
    print_error "Failed to build admin app"
    exit 1
fi

# Check if build output exists
if [ -d "dist" ]; then
    print_success "Admin app dist folder created"
    du -sh dist
else
    print_error "Admin app build failed - no dist folder found"
    exit 1
fi

cd ../..

# Summary
echo ""
echo "========================================"
print_success "✅ All Astro applications built successfully!"
echo ""
print_status "Build Summary:"
echo "  📱 Web App: apps/web/dist/"
echo "  🔧 Admin App: apps/admin/dist/"
echo ""
print_status "Next Steps:"
echo "  1. Deploy using PM2: pm2 start config/pm2/ecosystem.monorepo.config.js"
echo "  2. Or run locally: npm run dev in each app directory"
echo ""
print_warning "Note: Make sure all required services are running:"
echo "  - MongoDB (port 27017)"
echo "  - API Service (port 3001)"
echo "  - Auth Service (port 3015)"
echo "  - User Service (port 3016)"
echo ""