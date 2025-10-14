/**
 * Workflow Routes with Circuit Breaker Protection
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler, protectedHandler, databaseHandler, AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation middleware
const validateWorkflow = [
    body('name').isString().notEmpty().withMessage('Workflow name is required'),
    body('description').optional().isString(),
    body('steps').isArray().withMessage('Steps must be an array'),
    body('steps.*.type').isString().notEmpty().withMessage('Step type is required'),
    body('steps.*.config').isObject().withMessage('Step config must be an object'),
    body('triggers').optional().isArray(),
    body('enabled').optional().isBoolean()
];

const validateExecution = [
    body('input').optional().isObject(),
    body('priority').optional().isInt({ min: 1, max: 10 })
];

// List workflows
router.get('/', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { page = 1, limit = 20, status, enabled } = req.query;
        const skip = (page - 1) * limit;
        
        const filter = {};
        if (status) filter.status = status;
        if (enabled !== undefined) filter.enabled = enabled === 'true';
        
        const workflows = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows')
                .find(filter)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ created_at: -1 })
                .toArray();
        });
        
        const total = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').countDocuments(filter);
        });
        
        logger.performanceMetric('workflow_list_query', Date.now() - startTime);
        
        res.json({
            workflows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Failed to list workflows', { error: error.message });
        throw new AppError('Failed to retrieve workflows', 500);
    }
}));

// Get specific workflow
router.get('/:id', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const workflowId = new ObjectId(req.params.id);
        
        const workflow = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').findOne({ _id: workflowId });
        });
        
        if (!workflow) {
            throw new AppError('Workflow not found', 404);
        }
        
        // Get recent executions
        const executions = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions')
                .find({ workflow_id: workflowId })
                .sort({ started_at: -1 })
                .limit(10)
                .toArray();
        });
        
        logger.performanceMetric('workflow_get_query', Date.now() - startTime);
        
        res.json({
            workflow,
            recent_executions: executions
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to get workflow', { 
            workflowId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to retrieve workflow', 500);
    }
}));

// Create workflow
router.post('/', validateWorkflow, protectedHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, true);
    }
    
    const startTime = Date.now();
    
    try {
        const workflowData = {
            ...req.body,
            created_at: new Date(),
            updated_at: new Date(),
            created_by: req.user?.id || 'system',
            status: 'draft',
            enabled: req.body.enabled !== false,
            version: 1,
            execution_count: 0,
            last_execution: null
        };
        
        // Validate workflow steps
        const validationResult = await req.engine.validateWorkflow(workflowData);
        if (!validationResult.valid) {
            throw new AppError(`Workflow validation failed: ${validationResult.errors.join(', ')}`, 400);
        }
        
        const result = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').insertOne(workflowData);
        });
        
        const workflow = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').findOne({ _id: result.insertedId });
        });
        
        logger.performanceMetric('workflow_create_query', Date.now() - startTime);
        logger.info('Workflow created', {
            workflowId: result.insertedId,
            name: workflowData.name,
            steps: workflowData.steps.length
        });
        
        res.status(201).json({
            success: true,
            workflow
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to create workflow', { error: error.message });
        throw new AppError('Failed to create workflow', 500);
    }
}));

// Update workflow
router.put('/:id', validateWorkflow, protectedHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, true);
    }
    
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const workflowId = new ObjectId(req.params.id);
        
        // Check if workflow exists
        const existingWorkflow = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').findOne({ _id: workflowId });
        });
        
        if (!existingWorkflow) {
            throw new AppError('Workflow not found', 404);
        }
        
        const updateData = {
            ...req.body,
            updated_at: new Date(),
            updated_by: req.user?.id || 'system',
            version: existingWorkflow.version + 1
        };
        
        // Validate workflow steps
        const validationResult = await req.engine.validateWorkflow(updateData);
        if (!validationResult.valid) {
            throw new AppError(`Workflow validation failed: ${validationResult.errors.join(', ')}`, 400);
        }
        
        const result = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').updateOne(
                { _id: workflowId },
                { $set: updateData }
            );
        });
        
        const workflow = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').findOne({ _id: workflowId });
        });
        
        logger.performanceMetric('workflow_update_query', Date.now() - startTime);
        logger.info('Workflow updated', {
            workflowId: workflowId,
            version: updateData.version
        });
        
        res.json({
            success: true,
            workflow
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to update workflow', { 
            workflowId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to update workflow', 500);
    }
}));

// Delete workflow
router.delete('/:id', protectedHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const workflowId = new ObjectId(req.params.id);
        
        // Check if workflow has active executions
        const activeExecutions = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflow_executions').countDocuments({
                workflow_id: workflowId,
                status: { $in: ['running', 'pending'] }
            });
        });
        
        if (activeExecutions > 0) {
            throw new AppError('Cannot delete workflow with active executions', 409);
        }
        
        const result = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').deleteOne({ _id: workflowId });
        });
        
        if (result.deletedCount === 0) {
            throw new AppError('Workflow not found', 404);
        }
        
        logger.performanceMetric('workflow_delete_query', Date.now() - startTime);
        logger.info('Workflow deleted', { workflowId: workflowId });
        
        res.json({
            success: true,
            message: 'Workflow deleted successfully'
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to delete workflow', { 
            workflowId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to delete workflow', 500);
    }
}));

// Execute workflow
router.post('/:id/execute', validateExecution, protectedHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, true);
    }
    
    const startTime = Date.now();
    
    try {
        const { ObjectId } = require('mongodb');
        const workflowId = new ObjectId(req.params.id);
        
        const workflow = await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').findOne({ _id: workflowId });
        });
        
        if (!workflow) {
            throw new AppError('Workflow not found', 404);
        }
        
        if (!workflow.enabled) {
            throw new AppError('Workflow is disabled', 400);
        }
        
        const executionData = {
            workflow_id: workflowId,
            input: req.body.input || {},
            priority: req.body.priority || 5,
            started_by: req.user?.id || 'system',
            started_at: new Date(),
            status: 'queued'
        };
        
        // Add to execution queue
        const execution = await req.engine.executeWorkflow(workflow, executionData);
        
        // Update workflow execution count
        await databaseCircuitBreaker.execute(async () => {
            return await req.db.collection('workflows').updateOne(
                { _id: workflowId },
                { 
                    $inc: { execution_count: 1 },
                    $set: { last_execution: new Date() }
                }
            );
        });
        
        logger.performanceMetric('workflow_execute_query', Date.now() - startTime);
        logger.info('Workflow execution started', {
            workflowId: workflowId,
            executionId: execution.id,
            priority: executionData.priority
        });
        
        res.status(202).json({
            success: true,
            execution: {
                id: execution.id,
                status: execution.status,
                started_at: execution.started_at
            }
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        logger.error('Failed to execute workflow', { 
            workflowId: req.params.id,
            error: error.message 
        });
        throw new AppError('Failed to execute workflow', 500);
    }
}));

module.exports = router;