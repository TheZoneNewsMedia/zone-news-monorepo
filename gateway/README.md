# Zone News Hierarchical API Gateway Architecture

## Overview
The Zone News platform uses a hierarchical API gateway pattern with:
- **Main System Gateway** - Central orchestrator managing all service gateways
- **Service Gateways** - Individual gateways for each of the 18 microservices
- **TDLib Integration** - Advanced Telegram features through dedicated gateway

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Main System Gateway                       │
│                  (Kong/Express Gateway)                      │
│                    Port: 8000 (Public)                       │
└─────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
│  Core Services │   │  User Services  │   │ Content Services│
│    Gateway     │   │    Gateway      │   │    Gateway      │
│   Port: 8001   │   │   Port: 8002    │   │   Port: 8003   │
└────────────────┘   └─────────────────┘   └─────────────────┘
        │                      │                      │
   ┌────┴────┐           ┌────┴────┐           ┌────┴────┐
   │Services │           │Services │           │Services │
   └─────────┘           └─────────┘           └─────────┘
```

## Service Distribution

### Core Services Gateway (Port 8001)
- auth-service (3002)
- api (3001)
- monitoring (3010)
- analytics-service (3011)

### User Services Gateway (Port 8002)
- user-service (3003)
- subscription-service (3004)
- settings-service (3005)
- groups-service (3006)

### Content Services Gateway (Port 8003)
- bot (3007)
- channels-service (3008)
- news-api (3009)
- workflow-service (3012)

### Frontend Services Gateway (Port 8004)
- web (3000)
- miniapp (3013)
- admin (3014)
- cms (3015)

### Special Services Gateway (Port 8005)
- mtproto-sidecar (3016)
- demo-bot (3017)
- tdlib-service (3018)

## Implementation Status
- [x] Architecture Design
- [x] Main Gateway Configuration
- [x] Service Gateway Templates
- [ ] Production Deployment
- [ ] TDLib Integration
- [ ] Monitoring Setup
