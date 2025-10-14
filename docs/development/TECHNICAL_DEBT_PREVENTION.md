# Technical Debt Prevention Guidelines

## 🎯 **Overview**
Technical debt prevention is critical for maintaining a healthy, scalable codebase. This document outlines proactive measures to prevent debt accumulation and maintain code quality.

---

## 🚨 **Debt Prevention Principles**

### **1. Code Quality Gates**
Never compromise on these fundamentals:
- **No hardcoded values** - Use configuration/environment variables
- **No duplicate code** - Extract common functionality to utilities
- **No TODO comments** in production code - Create issues instead
- **No console.log** in production - Use proper logging
- **No commented-out code** - Remove or create feature flags

### **2. Architecture Consistency**
- **Follow established patterns** - Don't introduce new patterns without review
- **Respect service boundaries** - No direct database access from other services
- **Use dependency injection** - Avoid tight coupling
- **Implement proper error handling** - Every function should handle errors
- **Document architectural decisions** - Use ADRs for significant choices

### **3. Testing Requirements**
- **Unit tests** for all business logic (minimum 80% coverage)
- **Integration tests** for API endpoints
- **E2E tests** for critical user flows
- **Performance tests** for bottleneck-prone areas
- **Security tests** for authentication/authorization

---

## ⚠️ **Debt Identification**

### **Code Smells to Watch For**

#### **🔴 Critical Debt Indicators**
```javascript
// ❌ Hardcoded configuration
const API_URL = 'http://localhost:3001';
const MAX_RETRIES = 5;

// ✅ Configuration-driven
const API_URL = process.env.API_URL || config.api.url;
const MAX_RETRIES = config.api.maxRetries;
```

```javascript
// ❌ Duplicate error handling
try {
  await userService.createUser(data);
} catch (error) {
  console.error('Error creating user:', error);
  return { success: false, error: error.message };
}

try {
  await newsService.createArticle(data);
} catch (error) {
  console.error('Error creating article:', error);
  return { success: false, error: error.message };
}

// ✅ Centralized error handling
const handleServiceError = (operation, error) => {
  logger.error(`Error in ${operation}:`, error);
  return { success: false, error: error.message };
};

try {
  await userService.createUser(data);
} catch (error) {
  return handleServiceError('createUser', error);
}
```

#### **🟡 Warning Indicators**
- **Large functions** (>50 lines) - Break into smaller functions
- **Deep nesting** (>3 levels) - Extract to separate functions
- **Long parameter lists** (>5 parameters) - Use configuration objects
- **Magic numbers** - Define as named constants
- **Inconsistent naming** - Follow established conventions

#### **🟢 Acceptable Patterns**
```javascript
// ✅ Well-structured service class
export class NewsAggregationService {
  constructor({ newsRepository, cacheService, logger }) {
    this.newsRepository = newsRepository;
    this.cacheService = cacheService;
    this.logger = logger;
  }

  async aggregateNews(config) {
    try {
      return await this.performAggregation(config);
    } catch (error) {
      this.logger.error('News aggregation failed:', error);
      throw new AggregationError('Failed to aggregate news', error);
    }
  }

  private async performAggregation(config) {
    // Implementation details
  }
}
```

---

## 🛡️ **Prevention Strategies**

### **1. Automated Quality Checks**

#### **ESLint Configuration**
```json
{
  "extends": ["eslint:recommended", "@typescript-eslint/recommended"],
  "rules": {
    "no-console": "error",
    "no-debugger": "error",
    "no-var": "error",
    "prefer-const": "error",
    "no-unused-vars": "error",
    "complexity": ["error", 10],
    "max-lines-per-function": ["error", 50],
    "max-params": ["error", 5],
    "no-magic-numbers": ["error", { "ignore": [0, 1, -1] }]
  }
}
```

#### **Pre-commit Hooks**
```bash
#!/bin/sh
# .git/hooks/pre-commit

echo "🔍 Running pre-commit checks..."

# Lint check
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ Linting failed. Fix errors before committing."
    exit 1
fi

# Type check
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ Type checking failed. Fix type errors before committing."
    exit 1
fi

# Test check
npm run test:unit
if [ $? -ne 0 ]; then
    echo "❌ Unit tests failed. Fix tests before committing."
    exit 1
fi

# Security audit
npm audit --audit-level high
if [ $? -ne 0 ]; then
    echo "❌ Security vulnerabilities detected. Fix before committing."
    exit 1
fi

echo "✅ Pre-commit checks passed!"
```

### **2. Code Review Checklist**

#### **Reviewer Checklist**
- [ ] **Code follows naming conventions**
- [ ] **No hardcoded values or magic numbers**
- [ ] **Proper error handling implemented**
- [ ] **Tests added for new functionality**
- [ ] **Documentation updated**
- [ ] **No performance regressions**
- [ ] **Security considerations addressed**
- [ ] **Logging appropriately implemented**
- [ ] **Configuration externalized**
- [ ] **Dependencies justified and minimal**

#### **Automated Review Tools**
```yaml
# .github/workflows/code-quality.yml
name: Code Quality Check

on: [pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Lint check
        run: npm run lint
        
      - name: Type check
        run: npm run type-check
        
      - name: Security audit
        run: npm audit --audit-level high
        
      - name: Test coverage
        run: npm run test:coverage
        
      - name: Performance benchmark
        run: npm run benchmark
```

### **3. Architecture Governance**

#### **Service Design Principles**
1. **Single Responsibility**: Each service has one clear purpose
2. **Loose Coupling**: Services communicate via well-defined APIs
3. **High Cohesion**: Related functionality grouped together
4. **Fail Fast**: Validate inputs early and clearly
5. **Stateless Operations**: Services should be stateless where possible

#### **API Design Standards**
```javascript
// ✅ Well-designed API endpoint
/**
 * GET /api/v1/news/articles
 * Query params:
 * - category: string (optional) - Filter by category
 * - limit: number (optional, max 100, default 20) - Number of articles
 * - offset: number (optional, default 0) - Pagination offset
 * - sortBy: 'date'|'popularity' (optional, default 'date') - Sort order
 */
export async function getNewsArticles(req, res) {
  try {
    const { category, limit = 20, offset = 0, sortBy = 'date' } = req.query;
    
    // Validate inputs
    const validatedParams = validateGetArticlesParams({ 
      category, limit, offset, sortBy 
    });
    
    const articles = await newsService.getArticles(validatedParams);
    
    res.json({
      success: true,
      data: articles,
      pagination: {
        limit: validatedParams.limit,
        offset: validatedParams.offset,
        total: await newsService.countArticles(validatedParams)
      }
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
```

---

## 📊 **Debt Monitoring**

### **Metrics to Track**

#### **Code Quality Metrics**
```javascript
// Technical debt calculation
const technicalDebtScore = {
  codeSmells: sonarQubeMetrics.codeSmells,
  duplicatedLines: sonarQubeMetrics.duplicatedLines,
  complexity: sonarQubeMetrics.complexity,
  testCoverage: jestMetrics.coverage,
  securityHotspots: sonarQubeMetrics.securityHotspots
};

const debtIndex = calculateDebtIndex(technicalDebtScore);
// Target: Keep debt index < 20%
```

#### **Performance Metrics**
```javascript
// Performance debt indicators
const performanceMetrics = {
  averageResponseTime: metricsCollector.getAverageResponseTime(),
  memoryUsage: process.memoryUsage(),
  cpuUsage: process.cpuUsage(),
  errorRate: metricsCollector.getErrorRate(),
  throughput: metricsCollector.getThroughput()
};

// Alert if metrics exceed thresholds
if (performanceMetrics.averageResponseTime > 200) {
  alerting.triggerAlert('PERFORMANCE_DEGRADATION', performanceMetrics);
}
```

### **Debt Dashboard**
```markdown
# Technical Debt Dashboard - 2025-08-21

## Current Debt Status: 🟢 HEALTHY (15%)

### Code Quality
- **Code Smells**: 23 (Target: <50) ✅
- **Duplicated Lines**: 2.3% (Target: <5%) ✅
- **Test Coverage**: 87% (Target: >80%) ✅
- **Security Hotspots**: 0 (Target: 0) ✅

### Performance Health
- **Avg Response Time**: 145ms (Target: <200ms) ✅
- **Memory Usage**: 78MB (Target: <100MB) ✅
- **Error Rate**: 0.02% (Target: <0.1%) ✅
- **Uptime**: 99.98% (Target: >99.9%) ✅

### Debt Trends (Last 30 Days)
- **New Debt Added**: 5 issues
- **Debt Resolved**: 12 issues
- **Net Debt Change**: -7 issues (improvement) ✅

### Action Items
1. Refactor user authentication service (complexity: 8.5)
2. Add integration tests for news aggregation
3. Update deprecated dependencies (2 packages)
```

---

## 🔧 **Debt Resolution Process**

### **Debt Prioritization Matrix**

| Impact | Effort | Priority | Action |
|--------|--------|----------|---------|
| High | Low | Critical | Fix immediately |
| High | Medium | High | Schedule within sprint |
| High | High | Medium | Plan for next release |
| Low | Low | Low | Fix when convenient |
| Low | High | Postpone | Consider not fixing |

### **Debt Resolution Workflow**
1. **Identify**: Use automated tools and manual review
2. **Assess**: Evaluate impact and effort required
3. **Prioritize**: Use prioritization matrix
4. **Plan**: Schedule resolution in sprint planning
5. **Implement**: Fix following quality standards
6. **Validate**: Ensure fix doesn't introduce new debt
7. **Document**: Record resolution in change log

### **Refactoring Guidelines**
```javascript
// Refactoring example: Extract common functionality

// ❌ Before: Duplicated validation logic
function createUser(userData) {
  if (!userData.email || !isValidEmail(userData.email)) {
    throw new ValidationError('Invalid email');
  }
  if (!userData.password || userData.password.length < 8) {
    throw new ValidationError('Password too short');
  }
  // ... user creation logic
}

function updateUser(userId, userData) {
  if (userData.email && !isValidEmail(userData.email)) {
    throw new ValidationError('Invalid email');
  }
  if (userData.password && userData.password.length < 8) {
    throw new ValidationError('Password too short');
  }
  // ... user update logic
}

// ✅ After: Extracted validation service
class UserValidationService {
  validateEmail(email) {
    if (!email || !isValidEmail(email)) {
      throw new ValidationError('Invalid email');
    }
  }

  validatePassword(password) {
    if (!password || password.length < 8) {
      throw new ValidationError('Password too short');
    }
  }

  validateUserData(userData, { requireEmail = true, requirePassword = true } = {}) {
    if (requireEmail) this.validateEmail(userData.email);
    if (requirePassword) this.validatePassword(userData.password);
  }
}

function createUser(userData) {
  userValidator.validateUserData(userData);
  // ... user creation logic
}

function updateUser(userId, userData) {
  userValidator.validateUserData(userData, { 
    requireEmail: !!userData.email, 
    requirePassword: !!userData.password 
  });
  // ... user update logic
}
```

---

## 🎯 **Success Criteria**

### **Monthly Targets**
- **Technical Debt Index**: < 20%
- **Code Coverage**: > 80%
- **Security Vulnerabilities**: 0 high/critical
- **Performance Regression**: 0 degradations
- **Code Review Coverage**: 100% of changes

### **Quality Improvement Trends**
- **Debt Resolution Rate**: > Debt Introduction Rate
- **Test Coverage Trend**: Increasing
- **Performance Metrics**: Stable or improving
- **Developer Satisfaction**: High (measured via surveys)

---

**Last Updated**: 2025-08-21  
**Review Schedule**: Weekly (Mondays)  
**Owner**: Development Team Lead + Claude Code