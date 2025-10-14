#!/bin/bash

# Test script for Astro applications
# This script starts both web and admin apps in development mode for testing

set -e

echo "🧪 Testing Astro Applications..."
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

# Function to start app in background
start_app() {
    local app_name=$1
    local app_path=$2
    local expected_port=$3
    
    print_status "Starting $app_name..."
    
    cd "$app_path"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing $app_name dependencies..."
        npm install --legacy-peer-deps
    fi
    
    # Start in background
    print_status "Starting $app_name server on port $expected_port..."
    npm run dev &
    local app_pid=$!
    
    # Store PID for cleanup
    echo $app_pid > "/tmp/${app_name}_pid"
    
    print_success "$app_name started with PID $app_pid"
    
    cd - > /dev/null
    
    return 0
}

# Function to wait for port to be ready
wait_for_port() {
    local port=$1
    local app_name=$2
    local timeout=30
    local count=0
    
    print_status "Waiting for $app_name to be ready on port $port..."
    
    while [ $count -lt $timeout ]; do
        if lsof -i :$port > /dev/null 2>&1; then
            print_success "$app_name is ready on port $port"
            return 0
        fi
        
        sleep 1
        count=$((count + 1))
        
        if [ $((count % 5)) -eq 0 ]; then
            print_status "Still waiting for $app_name... ($count/${timeout}s)"
        fi
    done
    
    print_error "$app_name failed to start on port $port within ${timeout}s"
    return 1
}

# Function to test app endpoint
test_endpoint() {
    local url=$1
    local app_name=$2
    
    print_status "Testing $app_name at $url..."
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -E "^(200|404)$" > /dev/null; then
        print_success "$app_name is responding"
        return 0
    else
        print_error "$app_name is not responding properly"
        return 1
    fi
}

# Function to cleanup processes
cleanup() {
    print_warning "Cleaning up processes..."
    
    # Kill web app
    if [ -f "/tmp/web_pid" ]; then
        local web_pid=$(cat "/tmp/web_pid")
        if kill -0 "$web_pid" 2>/dev/null; then
            print_status "Stopping web app (PID: $web_pid)"
            kill "$web_pid" 2>/dev/null || true
        fi
        rm -f "/tmp/web_pid"
    fi
    
    # Kill admin app
    if [ -f "/tmp/admin_pid" ]; then
        local admin_pid=$(cat "/tmp/admin_pid")
        if kill -0 "$admin_pid" 2>/dev/null; then
            print_status "Stopping admin app (PID: $admin_pid)"
            kill "$admin_pid" 2>/dev/null || true
        fi
        rm -f "/tmp/admin_pid"
    fi
    
    # Kill any remaining node processes on our ports
    pkill -f "astro dev" 2>/dev/null || true
    
    print_success "Cleanup complete"
}

# Trap cleanup on script exit
trap cleanup EXIT

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the monorepo root directory"
    exit 1
fi

print_status "Testing Prerequisites..."

# Check if required services are running (optional)
if ! curl -s http://67.219.107.230:3001/health > /dev/null 2>&1; then
    print_warning "API service (port 3001) not responding - some features may not work"
fi

if ! curl -s http://67.219.107.230:3015/health > /dev/null 2>&1; then
    print_warning "Auth service (port 3015) not responding - authentication may not work"
fi

# Start both applications
print_status "Starting applications..."

start_app "web" "apps/web" "4321"
start_app "admin" "apps/admin" "4322"

# Wait for both apps to be ready
if wait_for_port "4321" "web" && wait_for_port "4322" "admin"; then
    print_success "Both applications started successfully!"
    
    # Test endpoints
    print_status "Testing application endpoints..."
    
    sleep 2 # Give apps a moment to fully initialize
    
    if test_endpoint "http://localhost:4321" "web" && test_endpoint "http://localhost:4322" "admin"; then
        print_success "✅ All tests passed!"
        
        echo ""
        echo "========================================"
        print_success "🎉 Astro Applications Test Complete!"
        echo "========================================"
        echo ""
        print_status "Access your applications:"
        echo "  🌐 Web App: http://localhost:4321"
        echo "  🔧 Admin App: http://localhost:4322"
        echo ""
        print_status "Available Pages:"
        echo "  Web:"
        echo "    • http://localhost:4321/ (Home)"
        echo "    • http://localhost:4321/news (News Articles)"
        echo "    • http://localhost:4321/pricing (Pricing Plans)"
        echo "    • http://localhost:4321/bot (Telegram Bot Info)"
        echo "    • http://localhost:4321/login (User Login)"
        echo "    • http://localhost:4321/signup (User Registration)"
        echo "    • http://localhost:4321/dashboard (User Dashboard)"
        echo ""
        echo "  Admin:"
        echo "    • http://localhost:4322/admin/login (Admin Login)"
        echo "    • http://localhost:4322/admin (Admin Dashboard)"
        echo ""
        print_status "Admin Credentials (Development):"
        echo "    • Username: admin"
        echo "    • Password: admin"
        echo ""
        print_warning "Press Ctrl+C to stop both applications"
        
        # Keep running until interrupted
        while true; do
            sleep 1
        done
        
    else
        print_error "Some endpoint tests failed"
        exit 1
    fi
else
    print_error "Failed to start applications"
    exit 1
fi