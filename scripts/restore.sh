#!/bin/bash

# Zone News Restore Script
# Restores system from backup archive

set -e

# Configuration
BACKUP_DIR="/var/backups/zone-news"
RESTORE_DIR="/tmp/zone-news-restore"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if backup file provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: No backup file specified${NC}"
    echo "Usage: $0 <backup-file> [--force]"
    echo ""
    echo "Available backups:"
    ls -lh ${BACKUP_DIR}/zone-news-backup-*.tar.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"
FORCE_RESTORE=${2:-""}

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    # Try in backup directory
    if [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
        BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    else
        echo -e "${RED}❌ Error: Backup file not found: ${BACKUP_FILE}${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}🔄 Zone News Restore Starting...${NC}"
echo "Backup File: ${BACKUP_FILE}"

# Confirmation prompt
if [ "${FORCE_RESTORE}" != "--force" ]; then
    echo -e "${YELLOW}⚠️ WARNING: This will overwrite existing data!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " CONFIRM
    if [ "${CONFIRM}" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Create restore directory
rm -rf ${RESTORE_DIR}
mkdir -p ${RESTORE_DIR}

# ==========================================
# 1. EXTRACT BACKUP
# ==========================================
echo -e "${YELLOW}📦 Extracting backup archive...${NC}"

tar -xzf "${BACKUP_FILE}" -C ${RESTORE_DIR}

# Find the extracted directory
EXTRACTED_DIR=$(find ${RESTORE_DIR} -maxdepth 1 -type d -name "zone-news-backup-*" | head -1)

if [ -z "${EXTRACTED_DIR}" ]; then
    echo -e "${RED}❌ Error: Could not find extracted backup directory${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Backup extracted${NC}"

# ==========================================
# 2. STOP SERVICES
# ==========================================
echo -e "${YELLOW}⏹️ Stopping services...${NC}"

# Stop PM2 services
pm2 stop all || true
pm2 delete all || true

# Stop nginx
systemctl stop nginx || true

echo -e "${GREEN}✅ Services stopped${NC}"

# ==========================================
# 3. RESTORE MONGODB
# ==========================================
if [ -d "${EXTRACTED_DIR}/mongodb" ]; then
    echo -e "${YELLOW}📊 Restoring MongoDB...${NC}"
    
    if command -v mongorestore >/dev/null 2>&1; then
        # Drop existing database
        mongo zone_news_production --eval "db.dropDatabase()" 2>/dev/null || true
        
        # Restore from backup
        mongorestore \
            --uri="${MONGODB_URI:-mongodb://localhost:27017/zone_news_production}" \
            --gzip \
            --drop \
            "${EXTRACTED_DIR}/mongodb/zone_news_production"
        
        echo -e "${GREEN}✅ MongoDB restored${NC}"
    else
        echo -e "${RED}⚠️ mongorestore not found, skipping MongoDB restore${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ No MongoDB backup found${NC}"
fi

# ==========================================
# 4. RESTORE REDIS
# ==========================================
if [ -f "${EXTRACTED_DIR}/redis-dump.rdb" ]; then
    echo -e "${YELLOW}💾 Restoring Redis...${NC}"
    
    if command -v redis-cli >/dev/null 2>&1; then
        # Stop Redis
        systemctl stop redis || true
        
        # Backup current dump
        if [ -f /var/lib/redis/dump.rdb ]; then
            mv /var/lib/redis/dump.rdb /var/lib/redis/dump.rdb.bak
        fi
        
        # Copy new dump
        cp "${EXTRACTED_DIR}/redis-dump.rdb" /var/lib/redis/dump.rdb
        chown redis:redis /var/lib/redis/dump.rdb
        
        # Start Redis
        systemctl start redis
        
        echo -e "${GREEN}✅ Redis restored${NC}"
    else
        echo -e "${RED}⚠️ redis-cli not found, skipping Redis restore${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ No Redis backup found${NC}"
fi

# ==========================================
# 5. RESTORE CONFIGURATION
# ==========================================
if [ -d "${EXTRACTED_DIR}/configs" ]; then
    echo -e "${YELLOW}⚙️ Restoring configuration files...${NC}"
    
    # Restore environment file
    if [ -f "${EXTRACTED_DIR}/configs/env" ]; then
        cp "${EXTRACTED_DIR}/configs/env" /root/zone-news-monorepo/.env
        echo "  - Environment file restored"
    fi
    
    # Restore PM2 ecosystem
    if [ -f "${EXTRACTED_DIR}/configs/ecosystem.monorepo.config.js" ]; then
        cp "${EXTRACTED_DIR}/configs/ecosystem.monorepo.config.js" \
           /root/zone-news-monorepo/config/pm2/ecosystem.monorepo.config.js
        echo "  - PM2 ecosystem restored"
    fi
    
    # Restore nginx configuration
    if [ -f "${EXTRACTED_DIR}/configs/nginx.conf" ]; then
        cp "${EXTRACTED_DIR}/configs/nginx.conf" /etc/nginx/sites-available/zone-news
        echo "  - Nginx configuration restored"
    fi
    
    # Restore PM2 process list
    if [ -f "${EXTRACTED_DIR}/configs/pm2-dump.pm2" ]; then
        cp "${EXTRACTED_DIR}/configs/pm2-dump.pm2" ~/.pm2/dump.pm2
        echo "  - PM2 process list restored"
    fi
    
    echo -e "${GREEN}✅ Configuration restored${NC}"
else
    echo -e "${YELLOW}⚠️ No configuration backup found${NC}"
fi

# ==========================================
# 6. RESTORE UPLOADS
# ==========================================
if [ -f "${EXTRACTED_DIR}/uploads.tar.gz" ]; then
    echo -e "${YELLOW}📁 Restoring uploaded files...${NC}"
    
    UPLOADS_DIR="/root/zone-news-monorepo/uploads"
    mkdir -p ${UPLOADS_DIR}
    
    # Backup existing uploads
    if [ "$(ls -A ${UPLOADS_DIR})" ]; then
        mv ${UPLOADS_DIR} ${UPLOADS_DIR}.bak
        mkdir -p ${UPLOADS_DIR}
    fi
    
    # Extract uploads
    tar -xzf "${EXTRACTED_DIR}/uploads.tar.gz" -C ${UPLOADS_DIR}
    
    echo -e "${GREEN}✅ Uploads restored${NC}"
else
    echo -e "${YELLOW}⚠️ No uploads backup found${NC}"
fi

# ==========================================
# 7. RESTORE MINIAPP
# ==========================================
if [ -f "${EXTRACTED_DIR}/miniapp.tar.gz" ]; then
    echo -e "${YELLOW}📱 Restoring miniapp...${NC}"
    
    MINIAPP_DIR="/var/www/miniapp"
    
    # Backup existing miniapp
    if [ -d "${MINIAPP_DIR}" ]; then
        mv ${MINIAPP_DIR} ${MINIAPP_DIR}.bak
    fi
    
    mkdir -p ${MINIAPP_DIR}
    tar -xzf "${EXTRACTED_DIR}/miniapp.tar.gz" -C ${MINIAPP_DIR}
    chown -R www-data:www-data ${MINIAPP_DIR}
    
    echo -e "${GREEN}✅ Miniapp restored${NC}"
else
    echo -e "${YELLOW}⚠️ No miniapp backup found${NC}"
fi

# ==========================================
# 8. RESTART SERVICES
# ==========================================
echo -e "${YELLOW}▶️ Starting services...${NC}"

# Start nginx
systemctl start nginx
nginx -t && systemctl reload nginx

# Restore PM2 processes
cd /root/zone-news-monorepo
pm2 resurrect || pm2 start config/pm2/ecosystem.monorepo.config.js

echo -e "${GREEN}✅ Services started${NC}"

# ==========================================
# 9. VERIFY RESTORATION
# ==========================================
echo -e "${YELLOW}🔍 Verifying restoration...${NC}"

# Check services
echo "Service Status:"
pm2 list

# Check MongoDB
if command -v mongo >/dev/null 2>&1; then
    echo ""
    echo "MongoDB Collections:"
    mongo zone_news_production --quiet --eval "db.getCollectionNames().forEach(c => print('  - ' + c + ': ' + db[c].count() + ' documents'))"
fi

# Check Redis
if command -v redis-cli >/dev/null 2>&1; then
    echo ""
    echo "Redis Status:"
    redis-cli ping && echo "  - Redis is running"
    echo "  - Keys: $(redis-cli dbsize | cut -d' ' -f2)"
fi

# Check nginx
echo ""
echo "Nginx Status:"
systemctl is-active nginx && echo "  - Nginx is running"

# ==========================================
# 10. CLEANUP
# ==========================================
echo -e "${YELLOW}🧹 Cleaning up...${NC}"

rm -rf ${RESTORE_DIR}

# ==========================================
# 11. RESTORE SUMMARY
# ==========================================
echo ""
echo -e "${GREEN}✅ Restore completed successfully!${NC}"
echo "=================================="
echo "Restored from: ${BACKUP_FILE}"
echo "Restore date: $(date)"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Verify all services are running: pm2 status"
echo "2. Check application health: curl http://localhost:3001/health"
echo "3. Test miniapp: http://$(hostname -I | awk '{print $1}'):8080"
echo "4. Review logs: pm2 logs"
echo ""

# Create restore log entry
echo "$(date): Restored from ${BACKUP_FILE}" >> ${BACKUP_DIR}/restore.log

exit 0