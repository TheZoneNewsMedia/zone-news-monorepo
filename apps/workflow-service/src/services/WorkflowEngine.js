/**
 * Enhanced Workflow Engine with Circuit Breaker Protection
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');
const { databaseCircuitBreaker } = require('../middleware/errorHandler');

class WorkflowEngine extends EventEmitter {
    constructor(db, queues) {
        super();
        this.db = db;
        this.queues = queues;
        this.activeExecutions = new Map();
        this.stepProcessors = new Map();
        this.isShuttingDown = false;
        this.healthStats = {
            executions: 0,
            failures: 0,
            lastHealthCheck: new Date()
        };
        
        this.setupStepProcessors();
        this.setupQueueProcessors();
        this.startHealthMonitoring();
    }

    async initialize() {
        try {
            logger.info('Initializing Workflow Engine...');
            
            // Ensure indexes exist
            await this.ensureIndexes();
            
            // Resume any interrupted executions
            await this.resumeInterruptedExecutions();
            
            // Start queue processing
            this.startQueueProcessing();
            
            logger.info('Workflow Engine initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Workflow Engine', { error: error.message });
            throw error;
        }
    }

    async ensureIndexes() {
        try {
            await databaseCircuitBreaker.execute(async () => {
                // Workflow indexes
                await this.db.collection('workflows').createIndex({ name: 1 });
                await this.db.collection('workflows').createIndex({ enabled: 1, status: 1 });
                await this.db.collection('workflows').createIndex({ created_at: -1 });
                
                // Execution indexes
                await this.db.collection('workflow_executions').createIndex({ workflow_id: 1, status: 1 });
                await this.db.collection('workflow_executions').createIndex({ started_at: -1 });
                await this.db.collection('workflow_executions').createIndex({ status: 1, started_at: -1 });
                
                // Log indexes
                await this.db.collection('execution_logs').createIndex({ execution_id: 1, timestamp: 1 });
                await this.db.collection('execution_logs').createIndex({ level: 1, timestamp: -1 });
            });
            
            logger.info('Database indexes ensured');
        } catch (error) {
            logger.error('Failed to ensure indexes', { error: error.message });
            throw error;
        }
    }

    async resumeInterruptedExecutions() {
        try {
            const interruptedExecutions = await databaseCircuitBreaker.execute(async () => {
                return await this.db.collection('workflow_executions')
                    .find({ status: 'running' })
                    .toArray();
            });
            
            logger.info(`Found ${interruptedExecutions.length} interrupted executions`);
            
            for (const execution of interruptedExecutions) {
                await this.markExecutionAsFailed(execution._id, 'System restart during execution');
            }
        } catch (error) {
            logger.error('Failed to resume interrupted executions', { error: error.message });
        }
    }

    setupStepProcessors() {
        // Content processing steps
        this.stepProcessors.set('fetch_news', this.processFetchNews.bind(this));
        this.stepProcessors.set('format_content', this.processFormatContent.bind(this));
        this.stepProcessors.set('post_to_channel', this.processPostToChannel.bind(this));
        this.stepProcessors.set('send_notification', this.processSendNotification.bind(this));
        
        // User management steps
        this.stepProcessors.set('create_user', this.processCreateUser.bind(this));
        this.stepProcessors.set('update_subscription', this.processUpdateSubscription.bind(this));
        this.stepProcessors.set('send_welcome', this.processSendWelcome.bind(this));
        
        // Analytics steps
        this.stepProcessors.set('track_event', this.processTrackEvent.bind(this));
        this.stepProcessors.set('generate_report', this.processGenerateReport.bind(this));
        
        // Payment steps
        this.stepProcessors.set('process_payment', this.processPayment.bind(this));
        this.stepProcessors.set('update_subscription_status', this.processUpdateSubscriptionStatus.bind(this));
        
        // Generic steps
        this.stepProcessors.set('delay', this.processDelay.bind(this));
        this.stepProcessors.set('webhook', this.processWebhook.bind(this));
        this.stepProcessors.set('condition', this.processCondition.bind(this));
        
        logger.info(`Registered ${this.stepProcessors.size} step processors`);
    }

    setupQueueProcessors() {
        // Process content workflows
        this.queues.content.process('workflow-execution', async (job) => {
            return await this.processExecution(job.data);
        });
        
        // Process user workflows
        this.queues.user.process('workflow-execution', async (job) => {
            return await this.processExecution(job.data);
        });
        
        // Process payment workflows
        this.queues.payment.process('workflow-execution', async (job) => {
            return await this.processExecution(job.data);
        });
        
        // Process analytics workflows
        this.queues.analytics.process('workflow-execution', async (job) => {
            return await this.processExecution(job.data);
        });
    }

    startQueueProcessing() {
        Object.entries(this.queues).forEach(([queueName, queue]) => {
            queue.on('completed', (job, result) => {
                logger.info(`Queue job completed`, {
                    queue: queueName,
                    jobId: job.id,
                    executionId: job.data.executionId
                });
            });
            
            queue.on('failed', (job, err) => {
                logger.error(`Queue job failed`, {
                    queue: queueName,
                    jobId: job.id,
                    executionId: job.data.executionId,
                    error: err.message
                });
            });
        });
    }

    async executeWorkflow(workflow, executionData) {
        try {
            // Create execution record
            const execution = await databaseCircuitBreaker.execute(async () => {
                const result = await this.db.collection('workflow_executions').insertOne({
                    ...executionData,
                    workflow_name: workflow.name,
                    workflow_version: workflow.version,
                    status: 'pending',
                    current_step: 0,
                    context: {},
                    error: null,
                    finished_at: null
                });
                
                return await this.db.collection('workflow_executions').findOne({ _id: result.insertedId });
            });
            
            // Determine which queue to use
            const queueName = this.getQueueForWorkflow(workflow);
            const queue = this.queues[queueName];
            
            if (!queue) {
                throw new Error(`Queue ${queueName} not found`);
            }
            
            // Add to queue
            const job = await queue.add('workflow-execution', {
                executionId: execution._id,
                workflowId: workflow._id,
                priority: executionData.priority || 5
            }, {
                priority: executionData.priority || 5,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                }
            });
            
            this.activeExecutions.set(execution._id.toString(), {
                execution,
                workflow,
                jobId: job.id,
                queueName
            });
            
            logger.info('Workflow execution queued', {
                executionId: execution._id,
                workflowId: workflow._id,
                queue: queueName,
                jobId: job.id
            });
            
            return execution;
        } catch (error) {
            logger.error('Failed to execute workflow', { error: error.message });
            throw error;
        }
    }

    async processExecution(jobData) {
        const { executionId, workflowId } = jobData;
        
        try {
            const execution = await databaseCircuitBreaker.execute(async () => {
                return await this.db.collection('workflow_executions').findOne({ _id: executionId });
            });
            
            if (!execution) {
                throw new Error('Execution not found');
            }
            
            const workflow = await databaseCircuitBreaker.execute(async () => {
                return await this.db.collection('workflows').findOne({ _id: workflowId });
            });
            
            if (!workflow) {
                throw new Error('Workflow not found');
            }
            
            // Update execution status to running
            await databaseCircuitBreaker.execute(async () => {
                return await this.db.collection('workflow_executions').updateOne(
                    { _id: executionId },
                    { $set: { status: 'running', started_at: new Date() } }
                );
            });
            
            await this.logExecution(executionId, 'info', 'Execution started');
            
            // Process each step
            let context = execution.context || {};
            let currentStep = execution.current_step || 0;
            
            for (let i = currentStep; i < workflow.steps.length; i++) {
                const step = workflow.steps[i];
                
                await this.logExecution(executionId, 'info', `Starting step ${i + 1}: ${step.type}`, { step });
                
                try {
                    const processor = this.stepProcessors.get(step.type);
                    if (!processor) {
                        throw new Error(`No processor found for step type: ${step.type}`);
                    }
                    
                    const stepResult = await processor(step, context, execution);
                    
                    // Update context with step result
                    if (stepResult && stepResult.context) {
                        context = { ...context, ...stepResult.context };
                    }
                    
                    // Update execution progress
                    await databaseCircuitBreaker.execute(async () => {
                        return await this.db.collection('workflow_executions').updateOne(
                            { _id: executionId },
                            { 
                                $set: { 
                                    current_step: i + 1,
                                    context: context,
                                    updated_at: new Date()
                                }
                            }
                        );
                    });
                    
                    await this.logExecution(executionId, 'info', `Completed step ${i + 1}: ${step.type}`, { 
                        step,
                        result: stepResult 
                    });
                    
                    // Check for conditional branching
                    if (stepResult && stepResult.skipToStep) {
                        i = stepResult.skipToStep - 1; // -1 because loop will increment
                        continue;
                    }
                    
                    if (stepResult && stepResult.stopExecution) {
                        break;
                    }
                    
                } catch (stepError) {
                    await this.logExecution(executionId, 'error', `Step ${i + 1} failed: ${stepError.message}`, { 
                        step,
                        error: stepError.stack 
                    });
                    
                    // Check if step has error handling
                    if (step.onError === 'continue') {
                        await this.logExecution(executionId, 'warn', 'Continuing despite step failure');
                        continue;
                    } else if (step.onError === 'skip') {
                        await this.logExecution(executionId, 'warn', 'Skipping to next step due to failure');
                        continue;
                    } else {
                        // Default: fail execution
                        throw stepError;
                    }
                }
            }
            
            // Mark execution as completed
            await databaseCircuitBreaker.execute(async () => {
                return await this.db.collection('workflow_executions').updateOne(
                    { _id: executionId },
                    { 
                        $set: { 
                            status: 'completed',
                            finished_at: new Date(),
                            final_context: context
                        }
                    }
                );
            });
            
            await this.logExecution(executionId, 'info', 'Execution completed successfully');
            
            this.activeExecutions.delete(executionId.toString());
            this.healthStats.executions++;
            
            this.emit('executionCompleted', { executionId, workflowId, context });
            
            return { success: true, context };
            
        } catch (error) {
            await this.markExecutionAsFailed(executionId, error.message);
            this.healthStats.failures++;
            
            this.emit('executionFailed', { executionId, workflowId, error: error.message });
            
            throw error;
        }
    }

    async markExecutionAsFailed(executionId, errorMessage) {
        try {
            await databaseCircuitBreaker.execute(async () => {
                return await this.db.collection('workflow_executions').updateOne(
                    { _id: executionId },
                    { 
                        $set: { 
                            status: 'failed',
                            error: errorMessage,
                            finished_at: new Date()
                        }
                    }
                );
            });
            
            await this.logExecution(executionId, 'error', `Execution failed: ${errorMessage}`);
            
            this.activeExecutions.delete(executionId.toString());
        } catch (error) {
            logger.error('Failed to mark execution as failed', { 
                executionId,
                error: error.message 
            });
        }
    }

    async logExecution(executionId, level, message, data = {}) {
        try {
            await databaseCircuitBreaker.execute(async () => {
                return await this.db.collection('execution_logs').insertOne({
                    execution_id: executionId,
                    level,
                    message,
                    timestamp: new Date(),
                    data
                });
            });
        } catch (error) {
            logger.error('Failed to log execution', { 
                executionId,
                level,
                message,
                error: error.message 
            });
        }
    }

    getQueueForWorkflow(workflow) {
        // Simple queue routing based on workflow name or tags
        if (workflow.tags?.includes('content') || workflow.name.includes('content')) {
            return 'content';
        }
        if (workflow.tags?.includes('user') || workflow.name.includes('user')) {
            return 'user';
        }
        if (workflow.tags?.includes('payment') || workflow.name.includes('payment')) {
            return 'payment';
        }
        if (workflow.tags?.includes('analytics') || workflow.name.includes('analytics')) {
            return 'analytics';
        }
        
        return 'content'; // default queue
    }

    async validateWorkflow(workflow) {
        const errors = [];
        
        if (!workflow.steps || workflow.steps.length === 0) {
            errors.push('Workflow must have at least one step');
        }
        
        for (let i = 0; i < workflow.steps.length; i++) {
            const step = workflow.steps[i];
            
            if (!step.type) {
                errors.push(`Step ${i + 1} must have a type`);
                continue;
            }
            
            if (!this.stepProcessors.has(step.type)) {
                errors.push(`Step ${i + 1} has unknown type: ${step.type}`);
            }
            
            if (!step.config) {
                errors.push(`Step ${i + 1} must have config`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    async cancelExecution(executionId) {
        try {
            const executionData = this.activeExecutions.get(executionId.toString());
            
            if (executionData) {
                // Cancel the job in the queue
                const queue = this.queues[executionData.queueName];
                const job = await queue.getJob(executionData.jobId);
                
                if (job) {
                    await job.remove();
                }
                
                this.activeExecutions.delete(executionId.toString());
            }
            
            await this.logExecution(executionId, 'info', 'Execution cancelled by user');
            
            return { success: true };
        } catch (error) {
            logger.error('Failed to cancel execution', { 
                executionId,
                error: error.message 
            });
            return { success: false, error: error.message };
        }
    }

    startHealthMonitoring() {
        setInterval(() => {
            this.healthStats.lastHealthCheck = new Date();
            
            const memUsage = process.memoryUsage();
            logger.performanceMetric('workflow_engine_memory', memUsage.heapUsed / 1024 / 1024, 'MB');
            logger.performanceMetric('workflow_engine_active_executions', this.activeExecutions.size);
            
            if (this.healthStats.failures > 0) {
                const failureRate = this.healthStats.failures / Math.max(this.healthStats.executions, 1);
                if (failureRate > 0.1) { // 10% failure rate
                    logger.warn('High failure rate detected', {
                        failures: this.healthStats.failures,
                        executions: this.healthStats.executions,
                        failureRate
                    });
                }
            }
        }, 30000); // Every 30 seconds
    }

    async getStatus() {
        return {
            active_executions: this.activeExecutions.size,
            health_stats: this.healthStats,
            queue_stats: await this.getQueueStats(),
            last_health_check: this.healthStats.lastHealthCheck
        };
    }

    async getQueueStats() {
        const stats = {};
        
        for (const [queueName, queue] of Object.entries(this.queues)) {
            try {
                const waiting = await queue.getWaiting();
                const active = await queue.getActive();
                const completed = await queue.getCompleted();
                const failed = await queue.getFailed();
                
                stats[queueName] = {
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length
                };
            } catch (error) {
                stats[queueName] = { error: error.message };
            }
        }
        
        return stats;
    }

    async shutdown() {
        this.isShuttingDown = true;
        
        logger.info('Shutting down Workflow Engine...');
        
        // Wait for active executions to complete or timeout
        const timeout = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.activeExecutions.size > 0 && (Date.now() - startTime) < timeout) {
            logger.info(`Waiting for ${this.activeExecutions.size} active executions to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Force close remaining executions
        for (const [executionId] of this.activeExecutions) {
            await this.markExecutionAsFailed(executionId, 'System shutdown');
        }
        
        // Close all queues
        for (const queue of Object.values(this.queues)) {
            await queue.close();
        }
        
        logger.info('Workflow Engine shutdown complete');
    }

    // Step Processors Implementation
    async processFetchNews(step, context, execution) {
        // Implementation would depend on your news service
        await this.logExecution(execution._id, 'debug', 'Fetching news...', { step });
        return { context: { news_fetched: true } };
    }

    async processFormatContent(step, context, execution) {
        // Implementation for content formatting
        await this.logExecution(execution._id, 'debug', 'Formatting content...', { step });
        return { context: { content_formatted: true } };
    }

    async processPostToChannel(step, context, execution) {
        // Implementation for posting to channel
        await this.logExecution(execution._id, 'debug', 'Posting to channel...', { step });
        return { context: { posted: true } };
    }

    async processSendNotification(step, context, execution) {
        // Implementation for sending notifications
        await this.logExecution(execution._id, 'debug', 'Sending notification...', { step });
        return { context: { notification_sent: true } };
    }

    async processCreateUser(step, context, execution) {
        // Implementation for user creation
        await this.logExecution(execution._id, 'debug', 'Creating user...', { step });
        return { context: { user_created: true } };
    }

    async processUpdateSubscription(step, context, execution) {
        // Implementation for subscription update
        await this.logExecution(execution._id, 'debug', 'Updating subscription...', { step });
        return { context: { subscription_updated: true } };
    }

    async processSendWelcome(step, context, execution) {
        // Implementation for welcome message
        await this.logExecution(execution._id, 'debug', 'Sending welcome message...', { step });
        return { context: { welcome_sent: true } };
    }

    async processTrackEvent(step, context, execution) {
        // Implementation for event tracking
        await this.logExecution(execution._id, 'debug', 'Tracking event...', { step });
        return { context: { event_tracked: true } };
    }

    async processGenerateReport(step, context, execution) {
        // Implementation for report generation
        await this.logExecution(execution._id, 'debug', 'Generating report...', { step });
        return { context: { report_generated: true } };
    }

    async processPayment(step, context, execution) {
        // Implementation for payment processing
        await this.logExecution(execution._id, 'debug', 'Processing payment...', { step });
        return { context: { payment_processed: true } };
    }

    async processUpdateSubscriptionStatus(step, context, execution) {
        // Implementation for subscription status update
        await this.logExecution(execution._id, 'debug', 'Updating subscription status...', { step });
        return { context: { subscription_status_updated: true } };
    }

    async processDelay(step, context, execution) {
        const delay = step.config.delay || 1000;
        await this.logExecution(execution._id, 'debug', `Delaying for ${delay}ms...`, { step });
        await new Promise(resolve => setTimeout(resolve, delay));
        return { context: { delayed: true } };
    }

    async processWebhook(step, context, execution) {
        // Implementation for webhook calls
        await this.logExecution(execution._id, 'debug', 'Calling webhook...', { step });
        return { context: { webhook_called: true } };
    }

    async processCondition(step, context, execution) {
        // Implementation for conditional logic
        const condition = step.config.condition;
        const result = this.evaluateCondition(condition, context);
        
        await this.logExecution(execution._id, 'debug', `Condition result: ${result}`, { step, result });
        
        if (result && step.config.onTrue) {
            return { skipToStep: step.config.onTrue };
        } else if (!result && step.config.onFalse) {
            return { skipToStep: step.config.onFalse };
        }
        
        return { context: { condition_evaluated: true, condition_result: result } };
    }

    evaluateCondition(condition, context) {
        // Simple condition evaluation - in production, use a proper expression parser
        try {
            // This is a simplified implementation
            return eval(condition.replace(/\$\{([^}]+)\}/g, (match, path) => {
                const value = this.getValueFromPath(context, path);
                return JSON.stringify(value);
            }));
        } catch (error) {
            logger.error('Failed to evaluate condition', { condition, error: error.message });
            return false;
        }
    }

    getValueFromPath(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
}

module.exports = WorkflowEngine;