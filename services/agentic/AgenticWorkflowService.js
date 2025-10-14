/**
 * AgenticWorkflowService - Intelligent workflow orchestration
 * Single Responsibility: Coordinate services using AI-driven decisions
 */

const EventEmitter = require('events');

class AgenticWorkflowService extends EventEmitter {
    constructor(services, aiService) {
        super();
        this.services = services;
        this.aiService = aiService;
        this.workflows = new Map();
        this.activeWorkflows = new Map();
        this.workflowLog = [];
    }

    async initialize() {
        this.registerWorkflows();
        console.log('🤖 Agentic Workflow Service initialized');
        console.log(`  📋 Registered workflows: ${this.workflows.size}`);
    }

    /**
     * Register predefined workflows
     */
    registerWorkflows() {
        // Content Publishing Workflow
        this.registerWorkflow('content-publishing', {
            name: 'Intelligent Content Publishing',
            description: 'AI-driven content selection and publishing',
            steps: [
                { service: 'news', action: 'fetchLatestArticles', name: 'Fetch Content' },
                { service: 'ai', action: 'analyzeContent', name: 'AI Analysis' },
                { service: 'ai', action: 'selectBestContent', name: 'Content Selection' },
                { service: 'posting', action: 'formatArticle', name: 'Format Post' },
                { service: 'ai', action: 'optimizeForEngagement', name: 'Optimize Content' },
                { service: 'posting', action: 'postToChannels', name: 'Publish' },
                { service: 'reactions', action: 'trackInitialEngagement', name: 'Track Reactions' },
                { service: 'analytics', action: 'recordPublishing', name: 'Analytics' }
            ],
            decisions: {
                'afterAnalysis': async (context) => {
                    // AI decides if content is worth publishing
                    const quality = context.analysisResult.qualityScore;
                    if (quality < 0.6) {
                        this.log('workflow', `⚠️ Content quality too low (${quality}), skipping`);
                        return 'skip';
                    }
                    return 'continue';
                },
                'selectChannel': async (context) => {
                    // AI selects best channel based on content
                    const category = context.analysisResult.category;
                    const channels = await this.aiService.selectBestChannels(category);
                    context.selectedChannels = channels;
                    this.log('workflow', `🎯 AI selected channels: ${channels.join(', ')}`);
                    return 'continue';
                }
            }
        });

        // Engagement Optimization Workflow
        this.registerWorkflow('engagement-optimization', {
            name: 'Engagement Optimization',
            description: 'Monitor and optimize content based on engagement',
            steps: [
                { service: 'reactions', action: 'getRecentPosts', name: 'Get Posts' },
                { service: 'analytics', action: 'analyzeEngagement', name: 'Analyze Metrics' },
                { service: 'ai', action: 'identifyPatterns', name: 'Find Patterns' },
                { service: 'ai', action: 'generateInsights', name: 'Generate Insights' },
                { service: 'posting', action: 'adjustStrategy', name: 'Adjust Strategy' }
            ],
            triggers: ['lowEngagement', 'scheduled'],
            decisions: {
                'shouldRepost': async (context) => {
                    const engagement = context.engagementRate;
                    if (engagement < 0.1) {
                        this.log('workflow', '📈 Low engagement detected, considering repost');
                        return await this.aiService.shouldRepost(context);
                    }
                    return 'skip';
                }
            }
        });

        // User Interaction Workflow
        this.registerWorkflow('user-interaction', {
            name: 'Intelligent User Interaction',
            description: 'Handle user interactions with AI assistance',
            steps: [
                { service: 'commands', action: 'parseCommand', name: 'Parse Input' },
                { service: 'ai', action: 'understandIntent', name: 'Understand Intent' },
                { service: 'users', action: 'checkPermissions', name: 'Check Permissions' },
                { service: 'ai', action: 'generateResponse', name: 'Generate Response' },
                { service: 'bot', action: 'sendResponse', name: 'Send Response' }
            ],
            decisions: {
                'requiresHumanReview': async (context) => {
                    const confidence = context.aiConfidence;
                    if (confidence < 0.7) {
                        this.log('workflow', '🤔 Low AI confidence, flagging for human review');
                        return 'humanReview';
                    }
                    return 'continue';
                }
            }
        });

        // Payment Processing Workflow
        this.registerWorkflow('payment-processing', {
            name: 'Payment Processing',
            description: 'Handle payments with fraud detection',
            steps: [
                { service: 'payments', action: 'validatePayment', name: 'Validate' },
                { service: 'ai', action: 'detectFraud', name: 'Fraud Check' },
                { service: 'users', action: 'updateSubscription', name: 'Update User' },
                { service: 'tiers', action: 'applyTierBenefits', name: 'Apply Benefits' },
                { service: 'analytics', action: 'recordTransaction', name: 'Record' }
            ],
            decisions: {
                'fraudDetection': async (context) => {
                    const fraudScore = await this.aiService.calculateFraudScore(context);
                    if (fraudScore > 0.8) {
                        this.log('workflow', '⚠️ High fraud risk detected, blocking payment');
                        return 'block';
                    }
                    return 'continue';
                }
            }
        });

        // Content Moderation Workflow
        this.registerWorkflow('content-moderation', {
            name: 'Content Moderation',
            description: 'AI-powered content moderation',
            steps: [
                { service: 'groups', action: 'getMessage', name: 'Get Message' },
                { service: 'ai', action: 'moderateContent', name: 'Check Content' },
                { service: 'ai', action: 'checkSentiment', name: 'Sentiment Analysis' },
                { service: 'groups', action: 'takeAction', name: 'Take Action' }
            ],
            decisions: {
                'moderationAction': async (context) => {
                    const result = context.moderationResult;
                    if (result.toxic) {
                        this.log('workflow', '🚫 Toxic content detected, removing');
                        return 'delete';
                    }
                    if (result.spam) {
                        this.log('workflow', '🚮 Spam detected, warning user');
                        return 'warn';
                    }
                    return 'approve';
                }
            }
        });
    }

    /**
     * Register a workflow
     */
    registerWorkflow(id, workflow) {
        this.workflows.set(id, workflow);
        this.log('system', `📋 Registered workflow: ${workflow.name}`);
    }

    /**
     * Execute a workflow
     */
    async executeWorkflow(workflowId, initialContext = {}) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const executionId = this.generateExecutionId();
        const context = {
            ...initialContext,
            workflowId,
            executionId,
            startTime: Date.now(),
            steps: []
        };

        this.activeWorkflows.set(executionId, context);
        this.log('workflow', `🚀 Starting workflow: ${workflow.name} [${executionId}]`);

        try {
            for (const step of workflow.steps) {
                const stepResult = await this.executeStep(step, context);
                
                context.steps.push({
                    name: step.name,
                    service: step.service,
                    action: step.action,
                    result: stepResult,
                    timestamp: Date.now()
                });

                this.log('step', `  ✅ ${step.name} completed`);

                // Check for decisions after this step
                const decision = await this.checkDecisions(workflow, step, context);
                if (decision === 'skip') {
                    this.log('workflow', '  ⏭️ Skipping remaining steps');
                    break;
                } else if (decision === 'retry') {
                    this.log('workflow', '  🔄 Retrying step');
                    continue;
                }
            }

            context.endTime = Date.now();
            context.duration = context.endTime - context.startTime;
            
            this.log('workflow', `✨ Workflow completed: ${workflow.name} (${context.duration}ms)`);
            this.emit('workflow:completed', context);

            return context;

        } catch (error) {
            this.log('error', `❌ Workflow failed: ${error.message}`);
            context.error = error;
            this.emit('workflow:failed', context);
            throw error;

        } finally {
            this.activeWorkflows.delete(executionId);
        }
    }

    /**
     * Execute a single workflow step
     */
    async executeStep(step, context) {
        const service = this.services[step.service];
        if (!service) {
            throw new Error(`Service ${step.service} not found`);
        }

        const action = service[step.action];
        if (!action) {
            throw new Error(`Action ${step.action} not found in ${step.service}`);
        }

        this.log('step', `  🔧 Executing: ${step.name} (${step.service}.${step.action})`);
        
        try {
            const result = await action.call(service, context);
            return result;
        } catch (error) {
            this.log('error', `  ❌ Step failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check and execute workflow decisions
     */
    async checkDecisions(workflow, step, context) {
        if (!workflow.decisions) return 'continue';

        for (const [decisionPoint, decisionFunc] of Object.entries(workflow.decisions)) {
            // Check if this decision should be made after current step
            if (this.shouldMakeDecision(step, decisionPoint, context)) {
                this.log('decision', `  🤔 Making decision: ${decisionPoint}`);
                const decision = await decisionFunc(context);
                this.log('decision', `  ➡️ Decision: ${decision}`);
                return decision;
            }
        }

        return 'continue';
    }

    /**
     * Check if decision should be made
     */
    shouldMakeDecision(step, decisionPoint, context) {
        // Custom logic to determine when to make decisions
        // Can be based on step name, service, or context
        return step.name.toLowerCase().includes(decisionPoint.toLowerCase());
    }

    /**
     * Execute parallel workflows
     */
    async executeParallel(workflowIds, context = {}) {
        this.log('workflow', `🚀 Starting ${workflowIds.length} parallel workflows`);
        
        const promises = workflowIds.map(id => 
            this.executeWorkflow(id, context).catch(err => ({ error: err, workflowId: id }))
        );

        const results = await Promise.all(promises);
        
        const successful = results.filter(r => !r.error);
        const failed = results.filter(r => r.error);

        this.log('workflow', `✅ Completed: ${successful.length}, ❌ Failed: ${failed.length}`);
        
        return { successful, failed };
    }

    /**
     * Schedule workflow execution
     */
    scheduleWorkflow(workflowId, cronExpression, context = {}) {
        // Implementation for scheduled workflows
        this.log('schedule', `⏰ Scheduled workflow: ${workflowId} at ${cronExpression}`);
    }

    /**
     * Cancel active workflow
     */
    cancelWorkflow(executionId) {
        const workflow = this.activeWorkflows.get(executionId);
        if (workflow) {
            workflow.cancelled = true;
            this.activeWorkflows.delete(executionId);
            this.log('workflow', `🛑 Cancelled workflow: ${executionId}`);
            return true;
        }
        return false;
    }

    /**
     * Get workflow status
     */
    getWorkflowStatus(executionId) {
        return this.activeWorkflows.get(executionId);
    }

    /**
     * Get all active workflows
     */
    getActiveWorkflows() {
        return Array.from(this.activeWorkflows.values());
    }

    /**
     * Generate unique execution ID
     */
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Enhanced logging with categories
     */
    log(category, message) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, category, message };
        
        this.workflowLog.push(logEntry);
        
        // Keep only last 1000 entries
        if (this.workflowLog.length > 1000) {
            this.workflowLog.shift();
        }

        // Color-coded console output
        const colors = {
            workflow: '\x1b[36m', // Cyan
            step: '\x1b[90m',     // Gray
            decision: '\x1b[33m', // Yellow
            error: '\x1b[31m',    // Red
            system: '\x1b[35m',   // Magenta
            schedule: '\x1b[34m'  // Blue
        };

        const color = colors[category] || '\x1b[0m';
        console.log(`${color}[AGENTIC:${category.toUpperCase()}] ${message}\x1b[0m`);
        
        this.emit('log', logEntry);
    }

    /**
     * Get workflow logs
     */
    getLogs(filter = {}) {
        let logs = [...this.workflowLog];
        
        if (filter.category) {
            logs = logs.filter(l => l.category === filter.category);
        }
        
        if (filter.executionId) {
            logs = logs.filter(l => l.message.includes(filter.executionId));
        }
        
        if (filter.limit) {
            logs = logs.slice(-filter.limit);
        }
        
        return logs;
    }
}

module.exports = AgenticWorkflowService;