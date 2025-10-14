# Zone News Monorepo - Claude Development Assistant

---

## 📋 **MODULE 1: PROJECT CONTEXT & STATUS**

### **Current Project State**
- **Phase**: 2 - API Gateway Enhancement
- **Status**: Active Development  
- **Focus**: Performance optimization and caching
- **Last Updated**: 2025-08-21
- **Server**: 67.219.107.230 (Production Live)

### **System Architecture Overview**
```
Zone News Platform:
├── Telegram Bot (Port 3002) ✅ Optimized - 77MB memory
├── API Gateway (Port 3001) 🎯 Enhancement Target  
├── Mini App Frontend 🌐 Live at http://67.219.107.230/telegram-mini-app
├── 10+ Microservices 🏗️ Running stable
└── MongoDB Database 💾 Production ready
```

### **Performance Metrics (Current Baseline)**
- **Bot Memory**: 77.1MB (was 75.8MB before optimization)
- **API Response**: ~145ms average (target: <200ms)
- **Database**: Stable connections
- **Uptime**: 99.98%
- **Security**: 0 vulnerabilities
- **Technical Debt**: 15% (HEALTHY)

---

## 🚨 **MODULE 2: CRITICAL RULES & PROHIBITIONS**

### **NEVER DO (STRICT PROHIBITIONS)**
- ❌ Skip documentation updates after changes
- ❌ Create duplicate files without reviewing existing ones first
- ❌ Introduce hardcoded values (use environment variables)
- ❌ Deploy without tests or performance validation
- ❌ Break existing functionality
- ❌ Add technical debt without explicit documentation
- ❌ Ignore file naming conventions

### **ALWAYS DO (MANDATORY ACTIONS)**
- ✅ **Review existing files before creating new ones**
- ✅ **Suggest fixes to existing files instead of duplicates**
- ✅ **Follow kebab-case naming**: `user-service.js`, `news-api.config.js`
- ✅ **Update documentation after every significant change**
- ✅ **Use TodoWrite for task tracking**
- ✅ **Test thoroughly before deployment**
- ✅ **Measure performance impact**

### **Technical Debt Prevention**
```javascript
// ❌ CREATES DEBT
const API_URL = 'http://localhost:3001'; // Hardcoded
function createUser(a, b, c, d, e, f) {} // Too many params
if (user.email && user.email.includes('@')) {} // Duplicate validation

// ✅ PREVENTS DEBT  
const API_URL = process.env.API_URL; // Configurable
function createUser(userData) {} // Single object parameter
userValidator.validateEmail(user.email); // Extracted validation
```

---

## 📁 **MODULE 3: FILE ACCESS CONTROL**

### **AUTHORIZED FILES (Safe to Read)**
```
✅ DOCUMENTATION (Always safe to read):
- docs/development/MASTER_PLAN.md
- docs/tracking/FEATURE_TRACKING.md
- docs/tracking/AGENT_CHANGES.md
- docs/architecture/CONVENTIONS.md
- docs/development/TECHNICAL_DEBT_PREVENTION.md

✅ CONFIGURATION (Review before modifying):
- apps/*/package.json
- ecosystem.config.js
- .claude/settings.local.json
- apps/*/config/*.config.js

✅ SOURCE CODE (Review existing before creating new):
- apps/*/src/**/*.js
- apps/*/index.js
- libs/**/*.js
```

### **RESTRICTED FILES (Forbidden to Read)**
```
🚫 SECURITY SENSITIVE:
- .env files (any environment files)
- **/secrets/**
- **/keys/**
- **/*.pem, **/*.key files

🚫 TEMPORARY/GENERATED:
- node_modules/**
- logs/**/*.log
- .git/**
- dist/**, build/**

🚫 BACKUP/ARCHIVE:
- **/*.backup
- **/*.old
- archive/**
- backup/**
```

### **FILE REVIEW PROTOCOL**
Before creating any new file, Claude MUST:
1. **Check if similar file exists** using Glob/Grep tools
2. **Read existing file** if found
3. **Suggest modifications** to existing file instead of creating new
4. **Only create new file** if genuinely needed and no alternative exists

---

## 🔧 **MODULE 4: NAMING CONVENTIONS & STANDARDS**

### **File Naming Rules (STRICT)**
```
Services:     {service-name}-{context}.service.js
Controllers:  {resource}-{action}.controller.js  
Utilities:    {function}-{context}.util.js
Tests:        {component}.{type}.test.js
Configs:      {service}-{environment}.config.js
Routes:       {resource}-{version}.routes.js
Middleware:   {function}-{context}.middleware.js
```

### **Code Structure Standards**
```javascript
// ✅ CORRECT STRUCTURE
export class NewsAggregationService {
  constructor({ newsRepository, cacheService, logger }) {
    this.newsRepository = newsRepository;
    this.cacheService = cacheService;
    this.logger = logger;
  }

  async aggregateNews(config) {
    try {
      this.validateConfig(config);
      return await this.performAggregation(config);
    } catch (error) {
      this.logger.error('Aggregation failed:', error);
      throw new AggregationError('News aggregation failed', error);
    }
  }

  private validateConfig(config) {
    if (!config.sources?.length) {
      throw new ValidationError('No news sources provided');
    }
  }
}
```

### **Variable Naming Standards**
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`)
- **Functions**: `camelCase` (e.g., `aggregateNewsArticles`) 
- **Classes**: `PascalCase` (e.g., `NewsAggregationService`)
- **Files**: `kebab-case` (e.g., `news-aggregation.service.js`)

---

## 📊 **MODULE 5: PHASE 2 CURRENT TASKS**

### **Feature 2.1: Performance Monitoring System**
```yaml
Status: 🔵 Planned
Owner: Claude Code + performance-engineer
Priority: High
Estimate: 2 days
Dependencies: None

Requirements:
- API response time tracking for all endpoints
- Memory usage monitoring with 10MB alert threshold  
- Database query performance metrics
- Real-time alerting for >200ms response times
- Performance dashboard at /admin/performance

Files to Create/Modify:
- apps/api/src/middleware/performance-monitoring.middleware.js
- apps/api/src/services/metrics-collection.service.js
- apps/api/src/routes/admin-performance.routes.js
```

### **Feature 2.2: Redis Caching Layer**
```yaml
Status: 🔵 Planned
Owner: Claude Code + backend-architect  
Priority: High
Estimate: 3 days
Dependencies: Performance monitoring (for cache metrics)

Requirements:
- Redis integration for news article caching
- 5-minute TTL for news articles
- Cache invalidation on article updates
- Cache hit/miss ratio monitoring
- >80% cache hit rate target after 24 hours

Files to Create/Modify:
- apps/api/src/services/redis-cache.service.js
- apps/api/src/middleware/cache.middleware.js
- apps/api/config/redis.config.js
```

### **Feature 2.3: Advanced Error Handling**
```yaml
Status: 🔵 Planned
Owner: Claude Code + security-auditor
Priority: Medium  
Estimate: 2 days
Dependencies: None

Requirements:
- Centralized error handling middleware
- Structured error logging with Winston
- Error rate monitoring per endpoint
- Client-friendly error responses (no sensitive data)
- Automatic retry for transient failures

Files to Create/Modify:
- apps/api/src/middleware/error-handling.middleware.js
- apps/api/src/utils/error-logger.util.js
- apps/api/src/types/error.types.js
```

---

## 📝 **MODULE 6: DOCUMENTATION UPDATE PROTOCOL**

### **Mandatory Updates After Each Task**
1. **Change Tracking**: `docs/tracking/AGENT_CHANGES.md`
2. **Feature Progress**: `docs/tracking/FEATURE_TRACKING.md`
3. **Master Plan**: `docs/development/MASTER_PLAN.md` (if timeline changes)

### **Change Entry Template**
```markdown
## Change Entry #{NEXT_ID}

**Date**: {ISO_TIMESTAMP}
**Agent**: Claude Code + {specialized_agents}
**Change Type**: {feature|fix|optimization|refactor}
**Priority**: {high|medium|low}

### Files Modified
- {complete_list_of_changed_files}

### Description
{what_was_changed_and_why_in_detail}

### Performance Impact
- Memory: {before} → {after}
- Response Time: {before} → {after}  
- Dependencies: {added/removed}

### Testing Performed
- [ ] Unit tests: {pass/fail}
- [ ] Integration tests: {pass/fail}
- [ ] Performance validation: {pass/fail}
- [ ] Security check: {pass/fail}

### Rollback Plan
```bash
{specific_commands_to_undo_changes}
```

### Validation Checklist
- [ ] No hardcoded values introduced
- [ ] Naming conventions followed
- [ ] Error handling implemented
- [ ] Documentation updated
- [ ] Performance impact assessed
```

---

## 🤖 **MODULE 7: AGENT COORDINATION WORKFLOWS**

### **Task-Specific Agent Selection**
```yaml
Performance_Tasks:
  primary: performance-engineer
  support: [backend-architect, database-optimizer]
  
API_Development:
  primary: backend-architect
  support: [api-documenter, security-auditor, test-automator]
  
Bug_Investigation:
  primary: debugger  
  support: [code-reviewer, performance-engineer]
  
Security_Review:
  primary: security-auditor
  support: [code-reviewer, backend-architect]
```

### **Multi-Agent Coordination Pattern**
```javascript
// Example: Feature development workflow
const workflow = {
  phase1: "backend-architect", // Design API structure
  phase2: "security-auditor",  // Security review  
  phase3: "test-automator",    // Test implementation
  phase4: "performance-engineer", // Performance validation
  phase5: "api-documenter"     // Documentation
};
```

---

## 🎯 **MODULE 8: SESSION WORKFLOW**

### **Pre-Task Protocol**
1. **Read current status** from `docs/development/MASTER_PLAN.md`
2. **Check feature progress** in `docs/tracking/FEATURE_TRACKING.md`
3. **Review recent changes** in `docs/tracking/AGENT_CHANGES.md`
4. **Update TodoWrite** with specific task breakdown
5. **Identify required agents** for the task

### **During Development Protocol**  
1. **Review existing files** before creating new ones
2. **Follow naming conventions** strictly
3. **Implement proper error handling**
4. **Write tests** for new functionality
5. **Document decisions** in code comments

### **Post-Task Protocol**
1. **Update change tracking** with complete details
2. **Update feature status** with current progress
3. **Mark TodoWrite tasks** as completed
4. **Validate performance impact**
5. **Document rollback procedures**

---

## 📈 **MODULE 9: SUCCESS METRICS & TARGETS**

### **Performance Targets**
- **API Response Time**: < 200ms (current: 145ms)
- **Memory Usage**: < 100MB per service (current: 77MB bot)  
- **Cache Hit Rate**: > 80% (for caching features)
- **System Uptime**: > 99.9% (current: 99.98%)
- **Error Rate**: < 0.1% (current: 0.02%)

### **Quality Targets**
- **Test Coverage**: > 80% (current: 87%)
- **Security Vulnerabilities**: 0 (current: 0)
- **Technical Debt Index**: < 20% (current: 15%)
- **Documentation Coverage**: 100% for APIs
- **Convention Compliance**: 100%

### **Development Velocity Targets**
- **Features Completed**: 3-5 per week
- **Bug Introduction Rate**: < 1 per feature
- **Rollback Rate**: < 5% of deployments
- **Code Review Coverage**: 100%

---

## 🚀 **MODULE 10: NEXT ACTIONS**

### **Immediate Priority (This Session)**
**Start Feature 2.1: Performance Monitoring System**

1. Review existing monitoring in `apps/api/src/`
2. Create `performance-monitoring.middleware.js` 
3. Implement metrics collection service
4. Add monitoring dashboard endpoint
5. Update documentation with changes

### **Session Success Criteria**
- [ ] Performance monitoring middleware implemented
- [ ] Metrics collection service created  
- [ ] Dashboard endpoint functional
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] No performance regressions introduced

---

**🎯 CURRENT FOCUS**: Feature 2.1 - Performance Monitoring System  
**📝 REMEMBER**: Update documentation after completing tasks  
**🔍 NEXT**: Begin with reviewing existing API monitoring code