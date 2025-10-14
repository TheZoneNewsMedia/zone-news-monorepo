# 🌐 Zone News DNS Configuration Guide

## Domain Setup for thezonenews.com

### Required DNS Records

Configure these DNS records with your domain registrar or DNS provider (e.g., Cloudflare, Route53, etc.):

## A Records (IPv4)

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| A | @ | 67.219.107.230 | 300 | Main domain |
| A | www | 67.219.107.230 | 300 | WWW subdomain |
| A | admin | 67.219.107.230 | 300 | Admin panel |
| A | api | 67.219.107.230 | 300 | API endpoint |
| A | app | 67.219.107.230 | 300 | Telegram miniapp |

## CNAME Records (Aliases)

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| CNAME | cdn | thezonenews.com | 300 | CDN endpoint |
| CNAME | assets | thezonenews.com | 300 | Static assets |

## MX Records (Email)

| Type | Priority | Name | Value | TTL |
|------|----------|------|-------|-----|
| MX | 10 | @ | mail.thezonenews.com | 3600 |
| MX | 20 | @ | mail2.thezonenews.com | 3600 |

## TXT Records (Verification & Security)

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| TXT | @ | "v=spf1 ip4:67.219.107.230 include:_spf.google.com ~all" | 300 | SPF record |
| TXT | _dmarc | "v=DMARC1; p=quarantine; rua=mailto:admin@thezonenews.com" | 300 | DMARC policy |
| TXT | @ | "zone-news-verification=2025" | 300 | Domain verification |

## CAA Records (Certificate Authority)

| Type | Name | Tag | Value | TTL |
|------|------|-----|-------|-----|
| CAA | @ | issue | "letsencrypt.org" | 300 |
| CAA | @ | issuewild | "letsencrypt.org" | 300 |

## Configuration Steps

### 1. Cloudflare Setup (Recommended)

```bash
# Add domain to Cloudflare
1. Sign up at cloudflare.com
2. Add site: thezonenews.com
3. Update nameservers at registrar to Cloudflare's
4. Configure DNS records as above
5. Enable SSL/TLS: Full (strict)
6. Enable Always Use HTTPS
7. Enable Auto Minify for JS/CSS/HTML
```

### 2. Direct DNS Setup (Alternative)

If not using Cloudflare, configure with your registrar:

```bash
# Example for common registrars
# Namecheap, GoDaddy, Google Domains, etc.
1. Login to registrar control panel
2. Navigate to DNS management
3. Add A records pointing to 67.219.107.230
4. Save changes (propagation takes 1-48 hours)
```

### 3. Verify DNS Configuration

```bash
# Check DNS propagation
dig thezonenews.com
dig admin.thezonenews.com
dig api.thezonenews.com
dig app.thezonenews.com

# Alternative checks
nslookup thezonenews.com
host thezonenews.com

# Check from multiple locations
curl https://dnschecker.org/#A/thezonenews.com
```

### 4. SSL Certificate Setup

After DNS is configured:

```bash
# SSH to server
ssh root@67.219.107.230

# Install Let's Encrypt
apt-get update
apt-get install certbot python3-certbot-nginx

# Generate certificates
certbot --nginx -d thezonenews.com \
  -d www.thezonenews.com \
  -d admin.thezonenews.com \
  -d api.thezonenews.com \
  -d app.thezonenews.com

# Auto-renewal
certbot renew --dry-run
```

## Nginx Virtual Hosts

The nginx configuration will handle routing:

| Domain | Document Root | Service |
|--------|--------------|---------|
| thezonenews.com | /var/www/web | Astro web app |
| admin.thezonenews.com | /var/www/admin | Astro admin app |
| api.thezonenews.com | proxy:3001 | API Gateway |
| app.thezonenews.com | /var/www/miniapp | Telegram miniapp |

## Testing Domains

After configuration, test each endpoint:

```bash
# Main website
curl -I https://thezonenews.com
# Expected: 200 OK

# Admin panel
curl -I https://admin.thezonenews.com
# Expected: 200 OK or 401 (if auth enabled)

# API endpoint
curl https://api.thezonenews.com/health
# Expected: {"status":"ok"}

# Miniapp
curl -I https://app.thezonenews.com
# Expected: 200 OK
```

## Troubleshooting

### DNS Not Resolving
- Wait for propagation (up to 48 hours)
- Clear DNS cache: `sudo dscacheutil -flushcache` (Mac)
- Try different DNS servers (8.8.8.8, 1.1.1.1)

### SSL Certificate Issues
- Ensure DNS is pointing to correct IP
- Check firewall allows port 80/443
- Verify nginx configuration: `nginx -t`

### 502 Bad Gateway
- Check services are running: `pm2 status`
- Verify nginx upstream configuration
- Check service logs: `pm2 logs`

## Monitoring

### Setup monitoring for domains:
1. **UptimeRobot**: Monitor uptime
2. **Pingdom**: Performance monitoring
3. **GTmetrix**: Page speed analysis
4. **SSL Labs**: SSL certificate health

## Security Recommendations

1. **Enable DNSSEC** if supported by registrar
2. **Configure CAA records** to restrict certificate issuance
3. **Setup rate limiting** in Cloudflare
4. **Enable DDoS protection**
5. **Configure firewall rules**

## Email Configuration

For email delivery from the domain:

```bash
# SPF Record
TXT @ "v=spf1 ip4:67.219.107.230 include:_spf.google.com ~all"

# DKIM (generate key first)
TXT default._domainkey "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"

# DMARC Policy
TXT _dmarc "v=DMARC1; p=quarantine; rua=mailto:admin@thezonenews.com"
```

## Backup DNS Provider

Configure secondary DNS for redundancy:

| Provider | Nameservers |
|----------|-------------|
| Cloudflare | ada.ns.cloudflare.com, bob.ns.cloudflare.com |
| Route53 | ns-xxx.awsdns-xx.com (4 servers) |
| Google Cloud | ns-cloud-xx.googledomains.com |

---

*Last updated: 2025-08-14*
*For support: admin@thezonenews.com*