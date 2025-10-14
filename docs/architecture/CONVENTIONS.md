# Zone News Monorepo - Development Conventions

## 📁 **File Naming Conventions**

### **General Rules**
- **Use kebab-case** for all files and directories: `user-service.js`, `news-api.config.js`
- **Use descriptive names** that clearly indicate purpose: `zone-news-aggregator.js` not `zna.js`
- **Include context** in the name: `telegram-bot-webhooks.js` not just `webhooks.js`
- **Avoid abbreviations** unless universally understood: `database.js` not `db.js`

### **Service Files**
```
✅ Good Examples:
- user-authentication-service.js
- news-aggregation-worker.js
- telegram-webhook-handler.js
- database-connection-manager.js

❌ Bad Examples:
- userauth.js
- newsagg.js
- tgwh.js
- dbconn.js
```

### **Configuration Files**
```
✅ Pattern: {service}-{environment}.config.js
- telegram-bot-production.config.js
- database-development.config.js
- api-gateway-staging.config.js
```

### **Utility Files**
```
✅ Pattern: {function}-{context}.util.js
- date-formatting.util.js
- news-content-parser.util.js
- telegram-message-builder.util.js
```

### **Test Files**
```
✅ Pattern: {component}.{type}.test.js
- user-service.unit.test.js
- news-api.integration.test.js
- telegram-bot.e2e.test.js
```

---

## 🏗️ **Directory Structure Standards**

### **Monorepo Root Structure**
```
zone-news-monorepo/
├── apps/                           # Application services
│   ├── api-gateway/               # Main API service
│   ├── telegram-bot/              # Bot service
│   ├── news-aggregator/           # News collection service
│   ├── user-management/           # User service
│   └── frontend-mini-app/         # Telegram mini app
├── libs/                          # Shared libraries
│   ├── database/                  # Database utilities
│   ├── telegram-utils/            # Telegram helpers
│   ├── news-parser/               # News parsing logic
│   └── common-types/              # TypeScript definitions
├── docs/                          # Documentation
│   ├── development/               # Development guides
│   ├── architecture/              # Architecture docs
│   ├── tracking/                  # Change tracking
│   └── api/                       # API documentation
├── infrastructure/                # Infrastructure code
│   ├── docker/                    # Docker configurations
│   ├── kubernetes/                # K8s manifests
│   └── terraform/                 # Infrastructure as code
├── tools/                         # Development tools
│   ├── scripts/                   # Build/deploy scripts
│   ├── monitoring/                # Monitoring configs
│   └── testing/                   # Testing utilities
└── .github/                       # GitHub workflows
    ├── workflows/                 # CI/CD pipelines
    └── templates/                 # PR/Issue templates
```

### **Service Internal Structure**
```
apps/{service-name}/
├── src/                           # Source code
│   ├── controllers/               # Request handlers
│   ├── services/                  # Business logic
│   ├── models/                    # Data models
│   ├── middleware/                # Express middleware
│   ├── routes/                    # Route definitions
│   ├── utils/                     # Service utilities
│   └── types/                     # TypeScript types
├── tests/                         # Test files
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── fixtures/                  # Test data
├── docs/                          # Service documentation
│   ├── api.md                     # API documentation
│   ├── setup.md                   # Setup instructions
│   └── troubleshooting.md         # Common issues
├── config/                        # Configuration files
│   ├── development.config.js      # Dev config
│   ├── production.config.js       # Prod config
│   └── test.config.js             # Test config
├── scripts/                       # Service scripts
│   ├── build.sh                   # Build script
│   ├── deploy.sh                  # Deployment script
│   └── health-check.js            # Health check
├── Dockerfile                     # Docker configuration
├── package.json                   # Dependencies
├── README.md                      # Service overview
└── .env.example                   # Environment template
```

---

## 🎯 **Code Organization Principles**

### **Single Responsibility**
- **One file, one purpose**: Each file should have a single, clear responsibility
- **Descriptive imports**: Import statements should clearly indicate what's being used
- **Minimal dependencies**: Only import what you actually need

### **Separation of Concerns**
```javascript
✅ Good Structure:
// user-authentication.controller.js
export class UserAuthController {
  constructor(authService, userService) {
    this.authService = authService;
    this.userService = userService;
  }
}

// user-authentication.service.js
export class UserAuthService {
  authenticate(credentials) {
    // Authentication logic only
  }
}

❌ Bad Structure:
// user.js (doing everything)
export class User {
  authenticate() { /* auth logic */ }
  saveToDatabase() { /* db logic */ }
  sendNotification() { /* notification logic */ }
  formatData() { /* formatting logic */ }
}
```

### **Dependency Injection**
```javascript
✅ Good Pattern:
// telegram-bot.service.js
export class TelegramBotService {
  constructor({ 
    messageHandler, 
    webhookManager, 
    databaseService 
  }) {
    this.messageHandler = messageHandler;
    this.webhookManager = webhookManager;
    this.databaseService = databaseService;
  }
}

❌ Bad Pattern:
// telegram-bot.service.js
import { MessageHandler } from './message-handler.js';
import { WebhookManager } from './webhook-manager.js';
import { DatabaseService } from './database-service.js';

export class TelegramBotService {
  constructor() {
    this.messageHandler = new MessageHandler(); // Hard dependency
    this.webhookManager = new WebhookManager(); // Hard dependency
    this.databaseService = new DatabaseService(); // Hard dependency
  }
}
```

---

## 📝 **Documentation Standards**

### **Required Documentation for Each Component**
1. **README.md**: Overview, setup, and basic usage
2. **API.md**: Detailed API documentation with examples
3. **CHANGELOG.md**: Version history and changes
4. **TROUBLESHOOTING.md**: Common issues and solutions

### **Code Documentation**
```javascript
/**
 * Aggregates news articles from multiple sources
 * @param {Object} config - Aggregation configuration
 * @param {string[]} config.sources - Array of news source URLs
 * @param {number} config.maxArticles - Maximum articles to fetch
 * @param {string} config.category - News category filter
 * @returns {Promise<Article[]>} Array of aggregated articles
 * @throws {AggregationError} When source is unreachable
 */
export async function aggregateNews(config) {
  // Implementation
}
```

### **Git Commit Message Format**
```
✅ Good Commit Messages:
feat(api): add news article caching with Redis
fix(bot): resolve memory leak in webhook handler
docs(api): update endpoint documentation with examples
refactor(user): extract authentication logic to service
test(news): add integration tests for aggregation service

❌ Bad Commit Messages:
fixed stuff
update
working now
changes
```

---

## 🧪 **Testing Standards**

### **Test File Organization**
```
tests/
├── unit/                          # Unit tests
│   ├── services/
│   │   ├── user-service.test.js
│   │   └── news-service.test.js
│   └── utils/
│       └── date-parser.test.js
├── integration/                   # Integration tests
│   ├── api/
│   │   ├── news-endpoints.test.js
│   │   └── user-endpoints.test.js
│   └── database/
│       └── news-repository.test.js
└── e2e/                          # End-to-end tests
    ├── telegram-bot-flow.test.js
    └── news-aggregation-flow.test.js
```

### **Test Naming Convention**
```javascript
✅ Good Test Names:
describe('NewsAggregationService', () => {
  describe('aggregateFromSource', () => {
    it('should return articles when source is available', () => {});
    it('should throw error when source is unreachable', () => {});
    it('should filter articles by category when specified', () => {});
  });
});

❌ Bad Test Names:
describe('News', () => {
  it('works', () => {});
  it('fails sometimes', () => {});
  it('test1', () => {});
});
```

---

## 🔐 **Security Standards**

### **Environment Variables**
```bash
✅ Good Patterns:
TELEGRAM_BOT_TOKEN=your_token_here
DATABASE_CONNECTION_URL=mongodb://localhost:27017/zone_news_production
REDIS_CACHE_URL=redis://localhost:6379
API_RATE_LIMIT_REQUESTS_PER_MINUTE=100

❌ Bad Patterns:
TOKEN=your_token_here
DB=mongodb://localhost:27017/zone_news_production
CACHE=redis://localhost:6379
LIMIT=100
```

### **Secret Management**
- **Never commit secrets** to version control
- **Use environment variables** for all configuration
- **Provide .env.example** with dummy values
- **Document required environment variables** in README

---

## ⚡ **Performance Standards**

### **Code Performance**
- **Async/Await**: Use proper async patterns, avoid blocking operations
- **Database Queries**: Use indexes, avoid N+1 queries
- **Memory Management**: Clean up resources, avoid memory leaks
- **Caching**: Implement appropriate caching strategies

### **Monitoring Requirements**
- **Response Time**: Track API response times
- **Memory Usage**: Monitor memory consumption patterns
- **Error Rates**: Track error frequency and types
- **Database Performance**: Monitor query execution times

---

## 📊 **Quality Gates**

### **Before Merge Requirements**
- [ ] All tests passing (unit, integration, e2e)
- [ ] Code coverage > 80% for new code
- [ ] No high/critical security vulnerabilities
- [ ] Documentation updated for API changes
- [ ] Performance impact assessed
- [ ] Code review completed

### **Pre-Deployment Checklist**
- [ ] All quality gates passed
- [ ] Staging environment tested
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Health checks implemented

---

## 🔄 **Continuous Improvement**

### **Weekly Code Reviews**
- Architecture decisions review
- Performance metrics analysis
- Technical debt assessment
- Security vulnerability scan

### **Monthly Retrospectives**
- Convention effectiveness review
- Developer experience feedback
- Process improvement identification
- Tool and framework updates

---

**Last Updated**: 2025-08-21  
**Review Schedule**: Weekly (Fridays)  
**Next Review**: 2025-08-28