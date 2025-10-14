#!/bin/bash

# Zone News Deployment Validation Script
# Comprehensive checks to ensure system is production-ready

set -e

# Configuration
API_BASE="http://localhost"
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test result tracking
declare -A TEST_RESULTS

# Function to run a check
run_check() {
    local check_name="$1"
    local check_command="$2"
    local critical="${3:-true}"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    echo -n "  ⏳ ${check_name}... "
    
    if eval "${check_command}" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        TEST_RESULTS["${check_name}"]="PASS"
        return 0
    else
        if [ "${critical}" = "true" ]; then
            echo -e "${RED}❌ FAIL${NC}"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            TEST_RESULTS["${check_name}"]="FAIL"
            return 1
        else
            echo -e "${YELLOW}⚠️ WARNING${NC}"
            WARNINGS=$((WARNINGS + 1))
            TEST_RESULTS["${check_name}"]="WARNING"
            return 0
        fi
    fi
}

echo "==============================================="
echo -e "${BLUE}🔍 Zone News Deployment Validation${NC}"
echo "==============================================="
echo "Time: $(date)"
echo ""

# ==========================================
# 1. SYSTEM REQUIREMENTS
# ==========================================
echo -e "${BLUE}1. System Requirements${NC}"

run_check "Node.js installed" "command -v node"
run_check "Node.js version >= 18" "node -v | grep -E 'v(1[8-9]|[2-9][0-9])'"
run_check "NPM installed" "command -v npm"
run_check "PM2 installed" "command -v pm2"
run_check "MongoDB installed" "command -v mongod" false
run_check "Redis installed" "command -v redis-server"
run_check "Nginx installed" "command -v nginx"
run_check "Git installed" "command -v git"

echo ""

# ==========================================
# 2. SERVICES STATUS
# ==========================================
echo -e "${BLUE}2. Services Status${NC}"

run_check "MongoDB running" "pgrep -x mongod" false
run_check "Redis running" "redis-cli ping | grep -q PONG"
run_check "Nginx running" "systemctl is-active nginx | grep -q active"
run_check "PM2 daemon running" "pm2 ping | grep -q pong"

echo ""

# ==========================================
# 3. PM2 PROCESSES
# ==========================================
echo -e "${BLUE}3. PM2 Processes${NC}"

# Check if PM2 processes are running
PM2_SERVICES=(
    "zone-api:3001"
    "auth-service:3015"
    "user-service:3016"
    "news-api:3011"
    "channels-service:3013"
    "groups-service:3012"
    "workflow-service:3017"
    "analytics-service:3018"
    "subscription-service:3019"
    "settings-service:3020"
)

for service_port in "${PM2_SERVICES[@]}"; do
    IFS=':' read -r service port <<< "${service_port}"
    run_check "${service} (${port})" "pm2 list | grep -q ${service}" false
done

echo ""

# ==========================================
# 4. API ENDPOINTS
# ==========================================
echo -e "${BLUE}4. API Health Checks${NC}"

# Check main endpoints
run_check "API Gateway health" "curl -f ${API_BASE}:3001/health"
run_check "Auth Service health" "curl -f ${API_BASE}:3015/health" false
run_check "User Service health" "curl -f ${API_BASE}:3016/health" false
run_check "News API health" "curl -f ${API_BASE}:3011/health" false

# Check API responses
run_check "News endpoint" "curl -f ${API_BASE}:3001/api/news"
run_check "Stats endpoint" "curl -f ${API_BASE}:3001/api/stats" false

echo ""

# ==========================================
# 5. MINIAPP VALIDATION
# ==========================================
echo -e "${BLUE}5. Miniapp Validation${NC}"

run_check "Miniapp files exist" "[ -d /var/www/miniapp ]"
run_check "Miniapp index.html" "[ -f /var/www/miniapp/index.html ]"
run_check "Miniapp accessible" "curl -f ${API_BASE}:8080 | grep -q '<html'"
run_check "Miniapp assets" "[ -d /var/www/miniapp/assets ]" false

echo ""

# ==========================================
# 6. DATABASE VALIDATION
# ==========================================
echo -e "${BLUE}6. Database Validation${NC}"

if command -v mongo >/dev/null 2>&1; then
    run_check "MongoDB connection" "mongo --eval 'db.adminCommand({ping: 1})' --quiet"
    run_check "Database exists" "mongo zone_news_production --eval 'db.getName()' --quiet | grep -q zone_news"
    
    # Check collections
    COLLECTIONS=$(mongo zone_news_production --quiet --eval "db.getCollectionNames().length")
    run_check "Collections created (${COLLECTIONS})" "[ ${COLLECTIONS:-0} -gt 0 ]"
else
    echo -e "  ${YELLOW}⚠️ MongoDB client not installed, skipping database checks${NC}"
fi

echo ""

# ==========================================
# 7. CONFIGURATION FILES
# ==========================================
echo -e "${BLUE}7. Configuration Files${NC}"

run_check "Environment file" "[ -f /root/zone-news-monorepo/.env ]"
run_check "PM2 ecosystem file" "[ -f /root/zone-news-monorepo/config/pm2/ecosystem.monorepo.config.js ]"
run_check "Nginx config" "[ -f /etc/nginx/sites-available/zone-news ]"
run_check "Nginx config valid" "nginx -t 2>&1 | grep -q 'test is successful'"

echo ""

# ==========================================
# 8. SECURITY CHECKS
# ==========================================
echo -e "${BLUE}8. Security Checks${NC}"

run_check "JWT_SECRET configured" "grep -q 'JWT_SECRET=' /root/zone-news-monorepo/.env" false
run_check "No default passwords" "! grep -q 'password.*=.*admin' /root/zone-news-monorepo/.env"
run_check "Redis password set" "grep -q 'REDIS_PASSWORD=.' /root/zone-news-monorepo/.env" false
run_check "CORS configured" "grep -q 'ALLOWED_ORIGINS=' /root/zone-news-monorepo/.env" false

echo ""

# ==========================================
# 9. PERFORMANCE CHECKS
# ==========================================
echo -e "${BLUE}9. Performance Checks${NC}"

# Check response times
API_RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' ${API_BASE}:3001/health 2>/dev/null || echo "999")
API_RESPONSE_MS=$(echo "${API_RESPONSE_TIME} * 1000" | bc 2>/dev/null || echo "999")
API_RESPONSE_INT=${API_RESPONSE_MS%.*}

run_check "API response time < 200ms (${API_RESPONSE_INT}ms)" "[ ${API_RESPONSE_INT:-999} -lt 200 ]" false

# Check memory usage
if command -v free >/dev/null 2>&1; then
    MEMORY_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
    run_check "Memory usage < 80% (${MEMORY_USAGE}%)" "[ ${MEMORY_USAGE:-100} -lt 80 ]" false
fi

# Check disk usage
DISK_USAGE=$(df -h / | tail -1 | awk '{print int($5)}')
run_check "Disk usage < 80% (${DISK_USAGE}%)" "[ ${DISK_USAGE:-100} -lt 80 ]" false

echo ""

# ==========================================
# 10. TELEGRAM BOT
# ==========================================
echo -e "${BLUE}10. Telegram Bot${NC}"

run_check "Bot token configured" "grep -q 'BOT_TOKEN=.' /root/zone-news-monorepo/.env" false
run_check "Webhook URL configured" "grep -q 'WEBHOOK_URL=' /root/zone-news-monorepo/.env" false
run_check "Webhook endpoint accessible" "curl -f ${API_BASE}:3000/webhook -X POST -H 'Content-Type: application/json' -d '{}'" false

echo ""

# ==========================================
# 11. LOGGING & MONITORING
# ==========================================
echo -e "${BLUE}11. Logging & Monitoring${NC}"

run_check "PM2 logs directory" "[ -d ~/.pm2/logs ]"
run_check "Log files created" "ls ~/.pm2/logs/*.log 2>/dev/null | head -1"
run_check "Nginx access log" "[ -f /var/log/nginx/access.log ]"
run_check "Nginx error log" "[ -f /var/log/nginx/error.log ]"

echo ""

# ==========================================
# 12. BACKUP SYSTEM
# ==========================================
echo -e "${BLUE}12. Backup System${NC}"

run_check "Backup directory exists" "[ -d /var/backups/zone-news ]" false
run_check "Backup script exists" "[ -f /root/zone-news-monorepo/scripts/backup.sh ]"
run_check "Restore script exists" "[ -f /root/zone-news-monorepo/scripts/restore.sh ]"

echo ""

# ==========================================
# VALIDATION SUMMARY
# ==========================================
echo "==============================================="
echo -e "${BLUE}📊 Validation Summary${NC}"
echo "==============================================="

PASS_RATE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

echo "Total Checks: ${TOTAL_CHECKS}"
echo -e "Passed: ${GREEN}${PASSED_CHECKS}${NC}"
echo -e "Failed: ${RED}${FAILED_CHECKS}${NC}"
echo -e "Warnings: ${YELLOW}${WARNINGS}${NC}"
echo "Pass Rate: ${PASS_RATE}%"
echo ""

if [ ${FAILED_CHECKS} -eq 0 ]; then
    echo -e "${GREEN}✅ DEPLOYMENT VALIDATION SUCCESSFUL!${NC}"
    echo "The system is ready for production use."
    EXIT_CODE=0
elif [ ${FAILED_CHECKS} -le 3 ]; then
    echo -e "${YELLOW}⚠️ DEPLOYMENT VALIDATION PASSED WITH WARNINGS${NC}"
    echo "The system is functional but has some issues to address."
    EXIT_CODE=0
else
    echo -e "${RED}❌ DEPLOYMENT VALIDATION FAILED${NC}"
    echo "Critical issues detected. Please fix before deploying to production."
    EXIT_CODE=1
fi

echo ""
echo "==============================================="
echo -e "${BLUE}📋 Recommendations${NC}"
echo "==============================================="

# Provide recommendations based on failures
if [ ${TEST_RESULTS["MongoDB running"]:-""} = "FAIL" ] || [ ${TEST_RESULTS["MongoDB running"]:-""} = "WARNING" ]; then
    echo "• Install and start MongoDB: apt-get install mongodb && systemctl start mongodb"
fi

if [ ${TEST_RESULTS["JWT_SECRET configured"]:-""} = "WARNING" ]; then
    echo "• Generate secure JWT secret: openssl rand -base64 32"
fi

if [ ${TEST_RESULTS["API response time < 200ms"]:-""} = "WARNING" ]; then
    echo "• Optimize API performance: Enable caching, add indexes"
fi

if [ ${TEST_RESULTS["Memory usage < 80%"]:-""} = "WARNING" ]; then
    echo "• High memory usage detected: Consider scaling or optimizing"
fi

if [ ${TEST_RESULTS["Disk usage < 80%"]:-""} = "WARNING" ]; then
    echo "• High disk usage detected: Clean up logs or increase storage"
fi

echo ""

# Save validation report
REPORT_FILE="/var/log/zone-news-validation-$(date +%Y%m%d-%H%M%S).log"
{
    echo "Zone News Deployment Validation Report"
    echo "Generated: $(date)"
    echo ""
    echo "Results:"
    for check in "${!TEST_RESULTS[@]}"; do
        echo "  - ${check}: ${TEST_RESULTS[${check}]}"
    done
    echo ""
    echo "Summary: Passed ${PASSED_CHECKS}/${TOTAL_CHECKS} (${PASS_RATE}%)"
} > ${REPORT_FILE}

echo "Report saved to: ${REPORT_FILE}"

exit ${EXIT_CODE}