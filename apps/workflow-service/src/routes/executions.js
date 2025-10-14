/**
 * Execution Routes with Circuit Breaker Protection
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler, protectedHandler, databaseHandler, AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// List executions
router.get('/', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            workflow_id,
            started_by,
            from_date,
            to_date 
        } = req.query;
        
        const skip = (page - 1) * limit;
        const filter = {};
        
        if (status) filter.status = status;
        if (workflow_id) {
            const { ObjectId } = require('mongodb');
            filter.workflow_id = new ObjectId(workflow_id);
        }
        if (started_by) filter.started_by = started_by;
        
        if (from_date || to_date) {
            filter.started_at = {};
            if (from_date) filter.started_at.$gte = new Date(from_date);
            if (to_date) filter.started_at.$lte = new Date(to_date);
        }
        
        const executions = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions')
                .find(filter)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ started_at: -1 })
                .toArray();
        });
        
        // Populate workflow names
        for (const execution of executions) {
            const workflow = await databaseCircuitBreaker.execute(async () => {
                return await req.db.collection('workflows').findOne(
                    { _id: execution.workflow_id },
                    { projection: { name: 1, version: 1 } }
                );
            });
            execution.workflow_name = workflow?.name || 'Unknown';
            execution.workflow_version = workflow?.version || 1;
        }
        
        const total = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').countDocuments(filter);
        });
        
        logger.performanceMetric('execution_list_query', Date.now() - startTime);
        
        res.json({
            executions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Failed to list executions', { error: error.message });
        throw new AppError('Failed to retrieve executions', 500);
    }
}));

// Get specific execution
router.get('/:id', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const executionId = new ObjectId(req.params.id);
        
        const execution = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').findOne({ _id: executionId });
        });
        
        if (!execution) {
            throw new AppError('Execution not found', 404);
        }
        
        // Get workflow details
        const workflow = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').findOne({ _id: execution.workflow_id });
        });
        
        // Get execution logs
        const logs = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('execution_logs')
                .find({ execution_id: executionId })
                .sort({ timestamp: 1 })
                .toArray();
        });
        
        logger.performanceMetric('execution_get_query', Date.now() - startTime);
        
        res.json({
            execution,
            workflow: workflow ? {
                name: workflow.name,
                version: workflow.version,
                steps: workflow.steps
            } : null,
            logs
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to get execution', { 
            executionId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to retrieve execution', 500);
    }
}));

// Cancel execution
router.post('/:id/cancel', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const executionId = new ObjectId(req.params.id);
        
        const execution = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').findOne({ _id: executionId });
        });
        
        if (!execution) {
            throw new AppError('Execution not found', 404);
        }
        
        if (!['pending', 'running'].includes(execution.status)) {
            throw new AppError('Cannot cancel execution in current state', 400);
        }
        
        // Cancel through workflow engine
        const result = await req.engine.cancelExecution(executionId);
        
        if (!result.success) {
            throw new AppError(result.error || 'Failed to cancel execution', 500);
        }
        
        // Update execution status
        const updateResult = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').updateOne(
                { _id: executionId },
                { 
                    $set: { 
                        status: 'cancelled',
                        cancelled_at: new Date(),
                        cancelled_by: req.user?.id || 'system'
                    }
                }
            );
        });
        
        // Log cancellation
        await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('execution_logs').insertOne({
                execution_id: executionId,
                level: 'info',
                message: 'Execution cancelled by user',
                timestamp: new Date(),
                step: null,
                data: {
                    cancelled_by: req.user?.id || 'system'
                }
            });
        });
        
        logger.performanceMetric('execution_cancel_query', Date.now() - startTime);
        logger.info('Execution cancelled', {
            executionId: executionId,
            cancelledBy: req.user?.id || 'system'
        });
        
        res.json({
            success: true,
            message: 'Execution cancelled successfully'
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to cancel execution', { 
            executionId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to cancel execution', 500);
    }
}));

// Retry execution
router.post('/:id/retry', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const executionId = new ObjectId(req.params.id);
        
        const execution = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').findOne({ _id: executionId });
        });
        
        if (!execution) {
            throw new AppError('Execution not found', 404);
        }
        
        if (!['failed', 'cancelled'].includes(execution.status)) {
            throw new AppError('Can only retry failed or cancelled executions', 400);
        }
        
        // Get original workflow
        const workflow = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').findOne({ _id: execution.workflow_id });
        });
        
        if (!workflow) {
            throw new AppError('Original workflow not found', 404);
        }
        
        if (!workflow.enabled) {
            throw new AppError('Cannot retry - workflow is disabled', 400);
        }
        
        // Create new execution
        const newExecutionData = {
            workflow_id: execution.workflow_id,
            input: execution.input || {},
            priority: execution.priority || 5,
            started_by: req.user?.id || 'system',
            started_at: new Date(),
            status: 'queued',
            retry_of: executionId,
            retry_count: (execution.retry_count || 0) + 1
        };
        
        const newExecution = await req.engine.executeWorkflow(workflow, newExecutionData);
        
        logger.performanceMetric('execution_retry_query', Date.now() - startTime);
        logger.info('Execution retried', {
            originalExecutionId: executionId,
            newExecutionId: newExecution.id,
            retryCount: newExecutionData.retry_count
        });
        
        res.status(202).json({
            success: true,
            execution: {
                id: newExecution.id,
                status: newExecution.status,
                started_at: newExecution.started_at,
                retry_of: executionId,
                retry_count: newExecutionData.retry_count
            }
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to retry execution', { 
            executionId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to retry execution', 500);
    }
}));

// Get execution logs
router.get('/:id/logs', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const executionId = new ObjectId(req.params.id);
        
        const { level, step, limit = 100 } = req.query;
        const filter = { execution_id: executionId };
        
        if (level) filter.level = level;
        if (step) filter.step = step;
        
        const logs = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('execution_logs')
                .find(filter)
                .sort({ timestamp: -1 })
                .limit(parseInt(limit))
                .toArray();
        });
        
        logger.performanceMetric('execution_logs_query', Date.now() - startTime);
        
        res.json({
            logs: logs.reverse(), // Reverse to show chronological order
            total: logs.length
        });
    } catch (error) {
        logger.error('Failed to get execution logs', { 
            executionId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to retrieve execution logs', 500);
    }
}));

// Get execution statistics
router.get('/stats/summary', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { from_date, to_date, workflow_id } = req.query;
        const filter = {};
        
        if (workflow_id) {
            const { ObjectId } = require('mongodb');
            filter.workflow_id = new ObjectId(workflow_id);
        }
        
        if (from_date || to_date) {
            filter.started_at = {};
            if (from_date) filter.started_at.$gte = new Date(from_date);
            if (to_date) filter.started_at.$lte = new Date(to_date);
        }
        
        const stats = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        avg_duration: { 
                            $avg: { 
                                $subtract: ['$finished_at', '$started_at'] 
                            } 
                        }
                    }
                }
            ]).toArray();
        });
        
        const totalExecutions = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').countDocuments(filter);
        });
        
        const recentFailures = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions')
                .find({ 
                    ...filter, 
                    status: 'failed',
                    started_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                })
                .limit(10)
                .toArray();
        });
        
        logger.performanceMetric('execution_stats_query', Date.now() - startTime);
        
        res.json({
            total_executions: totalExecutions,
            status_breakdown: stats,
            recent_failures: recentFailures,
            generated_at: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get execution statistics', { error: error.message });
        throw new AppError('Failed to retrieve execution statistics', 500);
    }
}));

module.exports = router;