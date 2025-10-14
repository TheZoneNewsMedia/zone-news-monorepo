/**
 * Subscription Service - Zone News Bot
 * Manages user subscriptions using Telegram Stars
 */

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const { Telegraf } = require('telegraf');
require('dotenv').config();

const app = express();
const PORT = process.env.SUBSCRIPTION_SERVICE_PORT || 4007;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const DB_NAME = 'zone_news_production';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Initialize Telegram Bot
let bot;
if (TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(TELEGRAM_BOT_TOKEN);
} else {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not configured - payment features disabled');
}

// Middleware
app.use(express.json());
app.use(cors());

// Database connection
let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);

        // Create indexes
        await db.collection('subscriptions').createIndex({ userId: 1 }, { unique: true });
        await db.collection('subscriptions').createIndex({ status: 1 });
        await db.collection('subscriptions').createIndex({ endDate: 1 });
        await db.collection('subscriptions').createIndex({ 'payments.transactionId': 1 });

        console.log('✅ Subscription Service connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
    basic: {
        name: 'Basic',
        stars: 0,
        duration: 0, // Forever
        features: {
            premiumArticles: false,
            noAds: false,
            customAlerts: false,
            analyticsAccess: false
        }
    },
    premium: {
        name: 'Premium',
        stars: 100,
        duration: 30, // 30 days
        features: {
            premiumArticles: true,
            noAds: true,
            customAlerts: false,
            analyticsAccess: false
        }
    },
    professional: {
        name: 'Professional',
        stars: 300,
        duration: 30, // 30 days
        features: {
            premiumArticles: true,
            noAds: true,
            customAlerts: true,
            analyticsAccess: true
        }
    }
};

// Error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Helper: Check if subscription is expired
function isSubscriptionExpired(subscription) {
    if (!subscription) return true;
    if (subscription.status === 'cancelled' || subscription.status === 'expired') return true;
    if (subscription.plan === 'basic') return false; // Basic never expires
    if (subscription.endDate && new Date(subscription.endDate) < new Date()) return true;
    return false;
}

// Helper: Calculate end date
function calculateEndDate(plan) {
    const planConfig = SUBSCRIPTION_PLANS[plan];
    if (!planConfig || planConfig.duration === 0) return null;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + planConfig.duration);
    return endDate;
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'subscription-service',
        database: db ? 'connected' : 'disconnected',
        telegram: bot ? 'configured' : 'not configured',
        timestamp: new Date().toISOString()
    });
});

// GET /api/subscriptions/plans - Get available subscription plans
app.get('/api/subscriptions/plans', asyncHandler(async (req, res) => {
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => ({
        id: key,
        name: plan.name,
        stars: plan.stars,
        duration: plan.duration,
        features: plan.features,
        description: generatePlanDescription(key, plan)
    }));

    res.json({
        success: true,
        plans
    });
}));

function generatePlanDescription(planId, plan) {
    if (planId === 'basic') {
        return 'Free access to public articles';
    } else if (planId === 'premium') {
        return 'Premium articles, ad-free experience, early access to breaking news';
    } else if (planId === 'professional') {
        return 'All Premium features + custom alerts, analytics dashboard, priority support';
    }
    return '';
}

// GET /api/subscriptions/:userId - Get user subscription status
app.get('/api/subscriptions/:userId', asyncHandler(async (req, res) => {
    const { userId } = req.params;

    let subscription = await db.collection('subscriptions').findOne({ userId });

    // If no subscription exists, create basic free subscription
    if (!subscription) {
        subscription = {
            userId,
            username: null,
            plan: 'basic',
            status: 'active',
            stars: 0,
            startDate: new Date(),
            endDate: null,
            autoRenew: false,
            features: SUBSCRIPTION_PLANS.basic.features,
            payments: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await db.collection('subscriptions').insertOne(subscription);
    } else {
        // Check if subscription expired
        if (isSubscriptionExpired(subscription) && subscription.plan !== 'basic') {
            await db.collection('subscriptions').updateOne(
                { _id: subscription._id },
                {
                    $set: {
                        status: 'expired',
                        plan: 'basic',
                        features: SUBSCRIPTION_PLANS.basic.features,
                        updatedAt: new Date()
                    }
                }
            );
            subscription.status = 'expired';
            subscription.plan = 'basic';
            subscription.features = SUBSCRIPTION_PLANS.basic.features;
        }
    }

    res.json({
        success: true,
        subscription: {
            userId: subscription.userId,
            username: subscription.username,
            plan: subscription.plan,
            status: subscription.status,
            features: subscription.features,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            autoRenew: subscription.autoRenew,
            isExpired: isSubscriptionExpired(subscription)
        }
    });
}));

// GET /api/subscriptions/check/:userId - Check if user has premium access
app.get('/api/subscriptions/check/:userId', asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { feature } = req.query; // Optional specific feature check

    const subscription = await db.collection('subscriptions').findOne({ userId });

    // Default to basic if no subscription
    const effectivePlan = subscription && !isSubscriptionExpired(subscription)
        ? subscription.plan
        : 'basic';

    const features = subscription && !isSubscriptionExpired(subscription)
        ? subscription.features
        : SUBSCRIPTION_PLANS.basic.features;

    // If checking specific feature
    if (feature) {
        res.json({
            success: true,
            hasAccess: features[feature] === true,
            plan: effectivePlan,
            feature
        });
    } else {
        // Return all access levels
        res.json({
            success: true,
            plan: effectivePlan,
            features,
            isPremium: effectivePlan !== 'basic',
            isActive: subscription?.status === 'active'
        });
    }
}));

// POST /api/subscriptions/create - Create subscription invoice
app.post('/api/subscriptions/create', asyncHandler(async (req, res) => {
    const { userId, plan, username } = req.body;

    if (!userId || !plan) {
        return res.status(400).json({
            success: false,
            error: 'userId and plan are required'
        });
    }

    if (!SUBSCRIPTION_PLANS[plan]) {
        return res.status(400).json({
            success: false,
            error: `Invalid plan. Available plans: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`
        });
    }

    if (plan === 'basic') {
        return res.status(400).json({
            success: false,
            error: 'Basic plan is free, no payment needed'
        });
    }

    if (!bot) {
        return res.status(503).json({
            success: false,
            error: 'Telegram bot not configured. Payment features unavailable.'
        });
    }

    const planConfig = SUBSCRIPTION_PLANS[plan];

    try {
        // Create invoice link for Telegram Stars payment
        const invoiceLink = await bot.telegram.createInvoiceLink({
            title: `${planConfig.name} Subscription`,
            description: `${planConfig.duration}-day access to ${planConfig.name} features`,
            payload: JSON.stringify({
                userId,
                plan,
                timestamp: Date.now()
            }),
            provider_token: '', // Empty for Telegram Stars
            currency: 'XTR', // Telegram Stars currency code
            prices: [{
                label: `${planConfig.name} Plan`,
                amount: planConfig.stars
            }]
        });

        res.json({
            success: true,
            invoiceLink,
            plan: planConfig.name,
            stars: planConfig.stars,
            duration: planConfig.duration,
            message: 'Invoice created successfully. Complete payment to activate subscription.'
        });

    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payment invoice',
            message: error.message
        });
    }
}));

// POST /api/subscriptions/webhook - Handle Telegram payment webhooks
app.post('/api/subscriptions/webhook', asyncHandler(async (req, res) => {
    const payment = req.body;

    if (!payment || !payment.successful_payment) {
        return res.status(400).json({
            success: false,
            error: 'Invalid payment webhook data'
        });
    }

    const successfulPayment = payment.successful_payment;
    const payload = JSON.parse(successfulPayment.invoice_payload);
    const { userId, plan } = payload;

    if (!userId || !plan) {
        return res.status(400).json({
            success: false,
            error: 'Invalid payment payload'
        });
    }

    const planConfig = SUBSCRIPTION_PLANS[plan];
    if (!planConfig) {
        return res.status(400).json({
            success: false,
            error: 'Invalid subscription plan'
        });
    }

    // Create or update subscription
    const startDate = new Date();
    const endDate = calculateEndDate(plan);

    const subscriptionUpdate = {
        userId,
        username: payment.from?.username || null,
        plan,
        status: 'active',
        stars: planConfig.stars,
        startDate,
        endDate,
        autoRenew: false,
        features: planConfig.features,
        updatedAt: new Date(),
        $push: {
            payments: {
                transactionId: successfulPayment.telegram_payment_charge_id,
                amount: successfulPayment.total_amount,
                date: new Date(),
                status: 'completed'
            }
        }
    };

    // Upsert subscription
    await db.collection('subscriptions').updateOne(
        { userId },
        {
            $set: subscriptionUpdate,
            $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
    );

    console.log(`✅ Subscription activated for user ${userId} - ${plan} plan`);

    res.json({
        success: true,
        message: 'Subscription activated successfully',
        subscription: {
            userId,
            plan,
            status: 'active',
            endDate
        }
    });
}));

// POST /api/subscriptions/cancel - Cancel subscription
app.post('/api/subscriptions/cancel', asyncHandler(async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            success: false,
            error: 'userId is required'
        });
    }

    const subscription = await db.collection('subscriptions').findOne({ userId });

    if (!subscription) {
        return res.status(404).json({
            success: false,
            error: 'Subscription not found'
        });
    }

    if (subscription.status === 'cancelled') {
        return res.status(400).json({
            success: false,
            error: 'Subscription already cancelled'
        });
    }

    // Cancel subscription (runs until end date, no refund)
    await db.collection('subscriptions').updateOne(
        { userId },
        {
            $set: {
                status: 'cancelled',
                autoRenew: false,
                updatedAt: new Date()
            }
        }
    );

    res.json({
        success: true,
        message: 'Subscription cancelled. Access will continue until end date.',
        endDate: subscription.endDate
    });
}));

// POST /api/subscriptions/refund - Request refund (admin only)
app.post('/api/subscriptions/refund', asyncHandler(async (req, res) => {
    const { userId, transactionId, adminToken } = req.body;

    // Simple admin token check (should be replaced with proper authentication)
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN || adminToken !== ADMIN_TOKEN) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized. Admin access required.'
        });
    }

    if (!userId || !transactionId) {
        return res.status(400).json({
            success: false,
            error: 'userId and transactionId are required'
        });
    }

    const subscription = await db.collection('subscriptions').findOne({ userId });

    if (!subscription) {
        return res.status(404).json({
            success: false,
            error: 'Subscription not found'
        });
    }

    // Find payment
    const payment = subscription.payments.find(p => p.transactionId === transactionId);

    if (!payment) {
        return res.status(404).json({
            success: false,
            error: 'Payment transaction not found'
        });
    }

    if (payment.status === 'refunded') {
        return res.status(400).json({
            success: false,
            error: 'Payment already refunded'
        });
    }

    // Update payment status
    await db.collection('subscriptions').updateOne(
        { userId, 'payments.transactionId': transactionId },
        {
            $set: {
                'payments.$.status': 'refunded',
                status: 'cancelled',
                plan: 'basic',
                features: SUBSCRIPTION_PLANS.basic.features,
                updatedAt: new Date()
            }
        }
    );

    console.log(`💰 Refund processed for user ${userId} - transaction ${transactionId}`);

    res.json({
        success: true,
        message: 'Refund processed successfully. Subscription reverted to basic plan.',
        transactionId
    });
}));

// GET /api/subscriptions/stats - Get subscription statistics (admin only)
app.get('/api/subscriptions/stats', asyncHandler(async (req, res) => {
    const { adminToken } = req.query;

    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN || adminToken !== ADMIN_TOKEN) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized. Admin access required.'
        });
    }

    // Get subscription statistics
    const stats = await db.collection('subscriptions').aggregate([
        {
            $group: {
                _id: '$plan',
                count: { $sum: 1 },
                activeCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                },
                totalRevenue: {
                    $sum: {
                        $reduce: {
                            input: '$payments',
                            initialValue: 0,
                            in: {
                                $add: [
                                    '$$value',
                                    { $cond: [{ $eq: ['$$this.status', 'completed'] }, '$$this.amount', 0] }
                                ]
                            }
                        }
                    }
                }
            }
        }
    ]).toArray();

    const totalSubscriptions = await db.collection('subscriptions').countDocuments();
    const activeSubscriptions = await db.collection('subscriptions').countDocuments({ status: 'active' });

    res.json({
        success: true,
        statistics: {
            total: totalSubscriptions,
            active: activeSubscriptions,
            byPlan: stats
        }
    });
}));

// Background job: Check expired subscriptions
async function checkExpiredSubscriptions() {
    if (!db) return;

    try {
        const now = new Date();

        const expiredSubscriptions = await db.collection('subscriptions').find({
            status: 'active',
            plan: { $ne: 'basic' },
            endDate: { $lte: now }
        }).toArray();

        for (const subscription of expiredSubscriptions) {
            await db.collection('subscriptions').updateOne(
                { _id: subscription._id },
                {
                    $set: {
                        status: 'expired',
                        plan: 'basic',
                        features: SUBSCRIPTION_PLANS.basic.features,
                        updatedAt: new Date()
                    }
                }
            );

            console.log(`⏰ Subscription expired for user ${subscription.userId}`);
        }

        if (expiredSubscriptions.length > 0) {
            console.log(`✅ Processed ${expiredSubscriptions.length} expired subscriptions`);
        }
    } catch (error) {
        console.error('Error checking expired subscriptions:', error);
    }
}

// Run expiration check every hour
setInterval(checkExpiredSubscriptions, 60 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
async function startServer() {
    await connectDB();

    // Run initial expiration check
    await checkExpiredSubscriptions();

    app.listen(PORT, () => {
        console.log(`🚀 Subscription Service running on port ${PORT}`);
        console.log(`📡 Health check: http://localhost:${PORT}/health`);
        console.log(`⭐ Telegram Stars payment enabled: ${bot ? 'YES' : 'NO'}`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down Subscription Service...');
    if (client) {
        await client.close();
    }
    if (bot) {
        await bot.stop();
    }
    process.exit(0);
});

// Start
if (require.main === module) {
    startServer().catch(console.error);
}

module.exports = { app, connectDB, SUBSCRIPTION_PLANS };
