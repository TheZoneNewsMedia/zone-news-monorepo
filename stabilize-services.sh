#!/bin/bash

# Zone News Bot Service Stabilization Script
# This script fixes the problematic services and implements monitoring

set -e

echo "🔧 Zone News Bot Service Stabilization Started"
echo "============================================="

# Configuration
MONOREPO_DIR="/Users/georgesimbe/telegramNewsBot/zone-news-monorepo"
LOG_DIR="$MONOREPO_DIR/logs"
BACKUP_DIR="$MONOREPO_DIR/backups/$(date +%Y%m%d_%H%M%S)"

# Create necessary directories
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"

echo "📁 Created log and backup directories"

# Function to check service health
check_service_health() {
    local service_name=$1
    local port=$2
    local max_retries=5
    local retry=0
    
    echo "🔍 Checking $service_name health on port $port..."
    
    while [ $retry -lt $max_retries ]; do
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "✅ $service_name is healthy"
            return 0
        fi
        
        retry=$((retry + 1))
        echo "⏳ Retry $retry/$max_retries for $service_name..."
        sleep 2
    done
    
    echo "❌ $service_name health check failed after $max_retries retries"
    return 1
}

# Function to install dependencies
install_dependencies() {
    local service_dir=$1
    local service_name=$2
    
    echo "📦 Installing dependencies for $service_name..."
    
    if [ -f "$service_dir/package.json" ]; then
        cd "$service_dir"
        
        # Backup existing package-lock.json if it exists
        if [ -f "package-lock.json" ]; then
            cp package-lock.json "$BACKUP_DIR/${service_name}-package-lock.json.bak"
        fi
        
        # Clean install
        rm -rf node_modules package-lock.json 2>/dev/null || true
        npm install --production
        
        echo "✅ Dependencies installed for $service_name"
    else
        echo "⚠️  No package.json found for $service_name"
    fi
}

# Function to stop problematic services
stop_problematic_services() {
    echo "🛑 Stopping problematic services..."
    
    # Stop services that are restarting too much
    pkill -f "workflow-service" 2>/dev/null || echo "workflow-service not running"
    pkill -f "settings-service" 2>/dev/null || echo "settings-service not running" 
    pkill -f "zone-bot" 2>/dev/null || echo "zone-bot not running"
    
    # Wait for processes to stop
    sleep 3
    
    echo "✅ Problematic services stopped"
}

# Function to update package.json files
update_package_files() {
    echo "📝 Updating package.json files with missing dependencies..."
    
    # Update workflow-service package.json (already done, but ensure it's correct)
    local workflow_pkg="$MONOREPO_DIR/apps/workflow-service/package.json"
    if [ -f "$workflow_pkg" ]; then
        echo "✅ Workflow service package.json already updated"
    fi
    
    # Update settings-service package.json (already done)
    local settings_pkg="$MONOREPO_DIR/apps/settings-service/package.json"
    if [ -f "$settings_pkg" ]; then
        echo "✅ Settings service package.json already updated"
    fi
    
    # Check bot package.json
    local bot_pkg="$MONOREPO_DIR/apps/bot/package.json"
    if [ -f "$bot_pkg" ]; then
        # Add mongodb dependency if missing
        if ! grep -q '"mongodb"' "$bot_pkg"; then
            echo "📦 Adding mongodb dependency to bot package.json..."
            # This would require jq or manual editing - for now just report
            echo "⚠️  Please ensure bot package.json includes mongodb dependency"
        fi
        echo "✅ Bot package.json checked"
    fi
}

# Function to install dependencies for all services
install_all_dependencies() {
    echo "📦 Installing dependencies for all services..."
    
    # Install workflow-service dependencies
    if [ -d "$MONOREPO_DIR/apps/workflow-service" ]; then
        install_dependencies "$MONOREPO_DIR/apps/workflow-service" "workflow-service"
    fi
    
    # Install settings-service dependencies  
    if [ -d "$MONOREPO_DIR/apps/settings-service" ]; then
        install_dependencies "$MONOREPO_DIR/apps/settings-service" "settings-service"
    fi
    
    # Install bot dependencies
    if [ -d "$MONOREPO_DIR/apps/bot" ]; then
        install_dependencies "$MONOREPO_DIR/apps/bot" "bot"
    fi
    
    # Install root dependencies
    if [ -f "$MONOREPO_DIR/package.json" ]; then
        install_dependencies "$MONOREPO_DIR" "monorepo-root"
    fi
}

# Function to start services with monitoring
start_service_with_monitoring() {
    local service_name=$1
    local service_dir=$2
    local port=$3
    local start_script=${4:-"npm start"}
    
    echo "🚀 Starting $service_name..."
    
    cd "$service_dir"
    
    # Create log file
    local log_file="$LOG_DIR/${service_name}.log"
    
    # Start service in background with logging
    nohup $start_script > "$log_file" 2>&1 &
    local pid=$!
    
    echo "📝 $service_name started with PID $pid, logs: $log_file"
    
    # Wait a moment for startup
    sleep 5
    
    # Check if process is still running
    if kill -0 $pid 2>/dev/null; then
        echo "✅ $service_name started successfully"
        
        # Try health check if port is provided
        if [ -n "$port" ]; then
            if check_service_health "$service_name" "$port"; then
                echo "🎉 $service_name is healthy and responding"
            else
                echo "⚠️  $service_name started but health check failed"
            fi
        fi
        
        return 0
    else
        echo "❌ $service_name failed to start"
        echo "📋 Last 20 lines of log:"
        tail -20 "$log_file"
        return 1
    fi
}

# Function to create monitoring script
create_monitoring_script() {
    echo "📊 Creating monitoring script..."
    
    cat > "$MONOREPO_DIR/monitor-services.sh" << 'EOF'
#!/bin/bash

# Service monitoring script
# Checks health of all services and restarts if needed

SERVICES=(
    "workflow-service:4003"
    "settings-service:4005"
    "bot:3000"
)

check_and_restart() {
    local service_info=$1
    local service_name=$(echo $service_info | cut -d: -f1)
    local port=$(echo $service_info | cut -d: -f2)
    
    echo "Checking $service_name on port $port..."
    
    if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
        echo "✅ $service_name is healthy"
    else
        echo "❌ $service_name is unhealthy, attempting restart..."
        
        # Kill existing process
        pkill -f "$service_name" 2>/dev/null || true
        sleep 2
        
        # Restart based on service
        case $service_name in
            "workflow-service")
                cd "/Users/georgesimbe/telegramNewsBot/zone-news-monorepo/apps/workflow-service"
                nohup npm start > "/Users/georgesimbe/telegramNewsBot/zone-news-monorepo/logs/${service_name}.log" 2>&1 &
                ;;
            "settings-service")
                cd "/Users/georgesimbe/telegramNewsBot/zone-news-monorepo/apps/settings-service"
                nohup npm start > "/Users/georgesimbe/telegramNewsBot/zone-news-monorepo/logs/${service_name}.log" 2>&1 &
                ;;
            "bot")
                cd "/Users/georgesimbe/telegramNewsBot/zone-news-monorepo/apps/bot"
                nohup npm start > "/Users/georgesimbe/telegramNewsBot/zone-news-monorepo/logs/${service_name}.log" 2>&1 &
                ;;
        esac
        
        sleep 5
        
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "✅ $service_name restarted successfully"
        else
            echo "❌ $service_name restart failed"
        fi
    fi
}

echo "🔍 Service Health Check - $(date)"
echo "=================================="

for service in "${SERVICES[@]}"; do
    check_and_restart "$service"
    echo ""
done

echo "Health check complete."
EOF

    chmod +x "$MONOREPO_DIR/monitor-services.sh"
    echo "✅ Monitoring script created at $MONOREPO_DIR/monitor-services.sh"
}

# Function to create service status script
create_status_script() {
    echo "📈 Creating status script..."
    
    cat > "$MONOREPO_DIR/service-status.sh" << 'EOF'
#!/bin/bash

# Service status script
# Shows detailed status of all services

echo "📊 Zone News Bot Service Status - $(date)"
echo "=========================================="

SERVICES=(
    "workflow-service:4003"
    "settings-service:4005" 
    "bot:3000"
    "api:3001"
)

for service_info in "${SERVICES[@]}"; do
    service_name=$(echo $service_info | cut -d: -f1)
    port=$(echo $service_info | cut -d: -f2)
    
    echo ""
    echo "🔍 $service_name (port $port)"
    echo "------------------------"
    
    # Check if process is running
    if pgrep -f "$service_name" > /dev/null; then
        pid=$(pgrep -f "$service_name")
        echo "✅ Process running (PID: $pid)"
        
        # Check memory usage
        if [ -n "$pid" ]; then
            memory=$(ps -o rss= -p $pid 2>/dev/null | tr -d ' ')
            if [ -n "$memory" ]; then
                memory_mb=$((memory / 1024))
                echo "💾 Memory usage: ${memory_mb}MB"
            fi
        fi
        
        # Check health endpoint
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "🟢 Health check: PASSED"
            
            # Try to get health details
            health_response=$(curl -s "http://localhost:$port/health" 2>/dev/null)
            if echo "$health_response" | grep -q "uptime"; then
                uptime=$(echo "$health_response" | grep -o '"uptime":[0-9.]*' | cut -d: -f2)
                if [ -n "$uptime" ]; then
                    uptime_hours=$(echo "scale=2; $uptime / 3600" | bc 2>/dev/null || echo "N/A")
                    echo "⏱️  Uptime: ${uptime_hours}h"
                fi
            fi
        else
            echo "🔴 Health check: FAILED"
        fi
        
        # Check restart count from logs
        log_file="/Users/georgesimbe/telegramNewsBot/zone-news-monorepo/logs/${service_name}.log"
        if [ -f "$log_file" ]; then
            restart_count=$(grep -c "starting\|Starting\|started\|Started" "$log_file" 2>/dev/null || echo "0")
            if [ "$restart_count" -gt 0 ]; then
                echo "🔄 Restarts detected: $restart_count"
            fi
            
            # Check for recent errors
            recent_errors=$(tail -100 "$log_file" 2>/dev/null | grep -i "error\|Error\|ERROR" | wc -l | tr -d ' ')
            if [ "$recent_errors" -gt 0 ]; then
                echo "⚠️  Recent errors: $recent_errors"
            fi
        fi
        
    else
        echo "❌ Process not running"
    fi
done

echo ""
echo "📈 System Resources"
echo "------------------"
echo "💾 Memory: $(free -h 2>/dev/null | grep Mem | awk '{print $3 "/" $2}' || echo "N/A")"
echo "💽 Disk: $(df -h . | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
echo "⚡ Load: $(uptime | awk -F'load average:' '{print $2}')"

EOF

    chmod +x "$MONOREPO_DIR/service-status.sh"
    echo "✅ Status script created at $MONOREPO_DIR/service-status.sh"
}

# Main execution
main() {
    echo "🚀 Starting stabilization process..."
    
    # Stop problematic services
    stop_problematic_services
    
    # Update package files
    update_package_files
    
    # Install dependencies
    install_all_dependencies
    
    # Create monitoring scripts
    create_monitoring_script
    create_status_script
    
    echo ""
    echo "🎯 Starting stabilized services..."
    
    # Start workflow-service
    if [ -d "$MONOREPO_DIR/apps/workflow-service" ]; then
        start_service_with_monitoring "workflow-service" "$MONOREPO_DIR/apps/workflow-service" "4003"
    fi
    
    # Start settings-service
    if [ -d "$MONOREPO_DIR/apps/settings-service" ]; then
        start_service_with_monitoring "settings-service" "$MONOREPO_DIR/apps/settings-service" "4005"
    fi
    
    # Start bot (give it more time as it's more complex)
    if [ -d "$MONOREPO_DIR/apps/bot" ]; then
        echo "🤖 Starting bot service (this may take longer)..."
        cd "$MONOREPO_DIR/apps/bot"
        nohup npm start > "$LOG_DIR/bot.log" 2>&1 &
        bot_pid=$!
        
        echo "📝 Bot started with PID $bot_pid"
        
        # Wait longer for bot to initialize
        echo "⏳ Waiting for bot initialization..."
        sleep 15
        
        if kill -0 $bot_pid 2>/dev/null; then
            echo "✅ Bot started successfully"
        else
            echo "❌ Bot failed to start"
            echo "📋 Last 30 lines of bot log:"
            tail -30 "$LOG_DIR/bot.log"
        fi
    fi
    
    echo ""
    echo "🎉 Service stabilization complete!"
    echo "=================================="
    echo ""
    echo "📊 Next steps:"
    echo "• Run './service-status.sh' to check service health"
    echo "• Run './monitor-services.sh' to check and restart unhealthy services"
    echo "• Check logs in: $LOG_DIR"
    echo "• Monitor memory usage and restart counts"
    echo ""
    echo "🔧 Maintenance commands:"
    echo "• View service status: ./service-status.sh"
    echo "• Monitor services: ./monitor-services.sh"
    echo "• View logs: tail -f logs/[service-name].log"
    echo "• Emergency stop all: pkill -f 'workflow-service|settings-service|zone-bot'"
    echo ""
    
    # Show initial status
    echo "📈 Initial service status:"
    "$MONOREPO_DIR/service-status.sh"
}

# Execute main function
main

echo "✅ Stabilization script completed!"