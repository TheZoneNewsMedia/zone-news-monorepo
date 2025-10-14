#!/bin/bash

# Zone News Backup Script
# Creates comprehensive backups of database, configs, and uploads

set -e

# Configuration
BACKUP_DIR="/var/backups/zone-news"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="zone-news-backup-${TIMESTAMP}"
RETENTION_DAYS=7

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Create backup directory
mkdir -p ${BACKUP_DIR}

echo -e "${YELLOW}🔄 Starting Zone News Backup...${NC}"
echo "Backup ID: ${BACKUP_NAME}"

# Create temporary backup directory
TEMP_DIR="${BACKUP_DIR}/${BACKUP_NAME}"
mkdir -p ${TEMP_DIR}

# ==========================================
# 1. BACKUP MONGODB
# ==========================================
echo -e "${YELLOW}📊 Backing up MongoDB...${NC}"

if command -v mongodump >/dev/null 2>&1; then
    mongodump \
        --uri="${MONGODB_URI:-mongodb://localhost:27017/zone_news_production}" \
        --out="${TEMP_DIR}/mongodb" \
        --gzip
    echo -e "${GREEN}✅ MongoDB backup complete${NC}"
else
    echo -e "${RED}⚠️ mongodump not found, skipping MongoDB backup${NC}"
fi

# ==========================================
# 2. BACKUP REDIS
# ==========================================
echo -e "${YELLOW}💾 Backing up Redis...${NC}"

if command -v redis-cli >/dev/null 2>&1; then
    # Save Redis snapshot
    redis-cli BGSAVE
    
    # Wait for background save to complete
    while [ $(redis-cli LASTSAVE) -eq $(redis-cli LASTSAVE) ]; do
        sleep 1
    done
    
    # Copy dump file
    if [ -f /var/lib/redis/dump.rdb ]; then
        cp /var/lib/redis/dump.rdb "${TEMP_DIR}/redis-dump.rdb"
        echo -e "${GREEN}✅ Redis backup complete${NC}"
    else
        echo -e "${YELLOW}⚠️ Redis dump file not found${NC}"
    fi
else
    echo -e "${RED}⚠️ redis-cli not found, skipping Redis backup${NC}"
fi

# ==========================================
# 3. BACKUP CONFIGURATION FILES
# ==========================================
echo -e "${YELLOW}⚙️ Backing up configuration files...${NC}"

CONFIG_DIR="${TEMP_DIR}/configs"
mkdir -p ${CONFIG_DIR}

# Backup environment files
if [ -f /root/zone-news-monorepo/.env ]; then
    cp /root/zone-news-monorepo/.env "${CONFIG_DIR}/env"
fi

# Backup PM2 ecosystem
if [ -f /root/zone-news-monorepo/config/pm2/ecosystem.monorepo.config.js ]; then
    cp /root/zone-news-monorepo/config/pm2/ecosystem.monorepo.config.js "${CONFIG_DIR}/"
fi

# Backup nginx configuration
if [ -f /etc/nginx/sites-available/zone-news ]; then
    cp /etc/nginx/sites-available/zone-news "${CONFIG_DIR}/nginx.conf"
fi

# Save PM2 process list
pm2 save
if [ -f ~/.pm2/dump.pm2 ]; then
    cp ~/.pm2/dump.pm2 "${CONFIG_DIR}/pm2-dump.pm2"
fi

echo -e "${GREEN}✅ Configuration backup complete${NC}"

# ==========================================
# 4. BACKUP UPLOADED FILES
# ==========================================
echo -e "${YELLOW}📁 Backing up uploaded files...${NC}"

UPLOADS_DIR="/root/zone-news-monorepo/uploads"
if [ -d "${UPLOADS_DIR}" ]; then
    tar -czf "${TEMP_DIR}/uploads.tar.gz" -C "${UPLOADS_DIR}" .
    echo -e "${GREEN}✅ Uploads backup complete${NC}"
else
    echo -e "${YELLOW}⚠️ No uploads directory found${NC}"
fi

# ==========================================
# 5. BACKUP MINIAPP BUILD
# ==========================================
echo -e "${YELLOW}📱 Backing up miniapp...${NC}"

MINIAPP_DIR="/var/www/miniapp"
if [ -d "${MINIAPP_DIR}" ]; then
    tar -czf "${TEMP_DIR}/miniapp.tar.gz" -C "${MINIAPP_DIR}" .
    echo -e "${GREEN}✅ Miniapp backup complete${NC}"
else
    echo -e "${YELLOW}⚠️ No miniapp directory found${NC}"
fi

# ==========================================
# 6. CREATE SYSTEM INFO
# ==========================================
echo -e "${YELLOW}ℹ️ Collecting system information...${NC}"

cat > "${TEMP_DIR}/system-info.txt" << EOF
Zone News Backup Information
============================
Date: $(date)
Hostname: $(hostname)
IP Address: $(hostname -I | awk '{print $1}')
Node Version: $(node --version)
NPM Version: $(npm --version)
PM2 Version: $(pm2 --version)
MongoDB Version: $(mongod --version | head -1)
Redis Version: $(redis-server --version)
Nginx Version: $(nginx -v 2>&1)

Services Status:
$(pm2 list)

Disk Usage:
$(df -h)

Memory Usage:
$(free -h)
EOF

echo -e "${GREEN}✅ System info collected${NC}"

# ==========================================
# 7. CREATE BACKUP ARCHIVE
# ==========================================
echo -e "${YELLOW}📦 Creating backup archive...${NC}"

cd ${BACKUP_DIR}
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"

# Calculate backup size
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo -e "${GREEN}✅ Backup archive created: ${BACKUP_SIZE}${NC}"

# ==========================================
# 8. UPLOAD TO S3 (Optional)
# ==========================================
if [ ! -z "${AWS_S3_BUCKET}" ] && command -v aws >/dev/null 2>&1; then
    echo -e "${YELLOW}☁️ Uploading to S3...${NC}"
    
    aws s3 cp "${BACKUP_NAME}.tar.gz" "s3://${AWS_S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Backup uploaded to S3${NC}"
        
        # Remove local backup if S3 upload successful
        if [ "${REMOVE_LOCAL_AFTER_S3}" = "true" ]; then
            rm "${BACKUP_NAME}.tar.gz"
            echo -e "${YELLOW}🗑️ Local backup removed${NC}"
        fi
    else
        echo -e "${RED}❌ S3 upload failed${NC}"
    fi
fi

# ==========================================
# 9. CLEANUP OLD BACKUPS
# ==========================================
echo -e "${YELLOW}🧹 Cleaning up old backups...${NC}"

# Remove backups older than retention period
find ${BACKUP_DIR} -name "zone-news-backup-*.tar.gz" -mtime +${RETENTION_DAYS} -delete

# List remaining backups
echo -e "${GREEN}📋 Current backups:${NC}"
ls -lh ${BACKUP_DIR}/zone-news-backup-*.tar.gz 2>/dev/null || echo "No backups found"

# ==========================================
# 10. BACKUP SUMMARY
# ==========================================
echo ""
echo -e "${GREEN}✅ Backup completed successfully!${NC}"
echo "=================================="
echo "Backup Name: ${BACKUP_NAME}"
echo "Location: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "Size: ${BACKUP_SIZE}"
echo "Retention: ${RETENTION_DAYS} days"
echo ""

# Create backup log entry
echo "$(date): ${BACKUP_NAME} - ${BACKUP_SIZE}" >> ${BACKUP_DIR}/backup.log

# Send notification (optional)
if [ ! -z "${NOTIFICATION_WEBHOOK}" ]; then
    curl -X POST ${NOTIFICATION_WEBHOOK} \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"Zone News backup completed: ${BACKUP_NAME} (${BACKUP_SIZE})\"}" \
        2>/dev/null
fi

exit 0