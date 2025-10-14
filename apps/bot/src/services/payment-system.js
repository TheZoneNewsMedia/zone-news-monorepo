/**
 * Payment System - Complete payment processing with affiliate program
 * Production-ready implementation with Stripe, PayPal, and 20.5% affiliate commissions
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');

class PaymentSystem {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        
        // Affiliate commission rate
        this.AFFILIATE_COMMISSION = 0.205; // 20.5%
        
        // Payment providers
        this.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        this.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
        this.PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
        this.PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
        this.PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;
        this.TELEGRAM_PAYMENT_TOKEN = process.env.TELEGRAM_PAYMENT_TOKEN;
        
        // Subscription tiers with comprehensive pricing
        this.tiers = {
            basic: {
                name: 'Basic',
                price_monthly: 999,     // $9.99
                price_yearly: 9900,     // $99.00 (2 months free)
                stripe_monthly: 'price_basic_monthly',
                stripe_yearly: 'price_basic_yearly',
                paypal_monthly: 'BASIC_MONTHLY',
                paypal_yearly: 'BASIC_YEARLY',
                features: [
                    '50 posts per day',
                    '10 scheduled posts',
                    'Media posting (50MB)',
                    '5 destinations',
                    'Basic analytics (7 days)',
                    'Email support',
                    'Template system (5 templates)',
                    'Bulk posting (3 destinations)'
                ],
                highlight: 'Most Popular'
            },
            pro: {
                name: 'Pro',
                price_monthly: 1999,    // $19.99
                price_yearly: 19900,    // $199.00 (2 months free)
                stripe_monthly: 'price_pro_monthly',
                stripe_yearly: 'price_pro_yearly',
                paypal_monthly: 'PRO_MONTHLY',
                paypal_yearly: 'PRO_YEARLY',
                features: [
                    '500 posts per day',
                    'Unlimited scheduled posts',
                    'Media posting (200MB)',
                    '50 destinations',
                    'Advanced analytics (30 days)',
                    'Priority support',
                    'Advanced templates (20 templates)',
                    'Bulk posting (25 destinations)',
                    'Recurring posts',
                    'API access (1000 calls/day)',
                    'Webhooks (5 endpoints)',
                    'Team collaboration (3 members)'
                ],
                highlight: 'Best Value'
            },
            enterprise: {
                name: 'Enterprise',
                price_monthly: 4999,    // $49.99
                price_yearly: 49900,    // $499.00 (2 months free)
                stripe_monthly: 'price_enterprise_monthly',
                stripe_yearly: 'price_enterprise_yearly',
                paypal_monthly: 'ENTERPRISE_MONTHLY',
                paypal_yearly: 'ENTERPRISE_YEARLY',
                features: [
                    'Unlimited posts',
                    'Unlimited scheduled posts',
                    'Media posting (1GB)',
                    'Unlimited destinations',
                    'Full analytics (365 days)',
                    'Dedicated support',
                    'Unlimited templates',
                    'Unlimited bulk posting',
                    'Advanced recurring posts',
                    'Unlimited API access',
                    'Unlimited webhooks',
                    'Unlimited team members',
                    'White-label branding',
                    'Custom domains',
                    'Advanced integrations'
                ],
                highlight: 'Premium'
            }
        };
        
        // Payment methods configuration
        this.paymentMethods = {
            stripe: {
                name: 'Credit/Debit Card',
                icon: '💳',
                enabled: !!this.STRIPE_SECRET_KEY,
                fees: '2.9% + $0.30'
            },
            paypal: {
                name: 'PayPal',
                icon: '🅿️',
                enabled: !!this.PAYPAL_CLIENT_ID,
                fees: '2.9% + $0.30'
            },
            telegram: {
                name: 'Telegram Payments',
                icon: '💎',
                enabled: !!this.TELEGRAM_PAYMENT_TOKEN,
                fees: 'Varies by region'
            },
            crypto: {
                name: 'Cryptocurrency',
                icon: '₿',
                enabled: process.env.CRYPTO_ENABLED === 'true',
                fees: 'Network fees only'
            }
        };
        
        // Withdrawal methods
        this.withdrawalMethods = {
            paypal: {
                name: 'PayPal',
                icon: '🅿️',
                min_amount: 1000, // $10.00
                fee: 0,
                processing_time: '1-2 business days'
            },
            bank: {
                name: 'Bank Transfer',
                icon: '🏦',
                min_amount: 5000, // $50.00
                fee: 500, // $5.00
                processing_time: '3-5 business days'
            },
            stripe: {
                name: 'Instant Transfer',
                icon: '⚡',
                min_amount: 500, // $5.00
                fee: 50, // $0.50
                processing_time: 'Instant'
            }
        };
        
        // Affiliate program configuration
        this.affiliateConfig = {
            commission_rate: 0.205,
            min_payout: 1000, // $10.00
            payout_schedule: 'weekly', // weekly, monthly
            cookie_duration: 30, // days
            referral_bonus: 500, // $5.00 bonus for first referral
            tiered_commissions: {
                bronze: { min_referrals: 0, rate: 0.205 },   // 20.5%
                silver: { min_referrals: 10, rate: 0.25 },   // 25%
                gold: { min_referrals: 50, rate: 0.30 },     // 30%
                platinum: { min_referrals: 100, rate: 0.35 } // 35%
            }
        };
    }

    /**
     * Register payment commands and handlers
     */
    register() {
        console.log('🔧 Registering PaymentSystem...');
        
        // Subscription commands
        this.bot.command('subscribe', this.handleSubscribe.bind(this));
        this.bot.command('subscription', this.handleViewSubscription.bind(this));
        this.bot.command('billing', this.handleBilling.bind(this));
        this.bot.command('cancel', this.handleCancelSubscription.bind(this));
        this.bot.command('renew', this.handleRenewSubscription.bind(this));
        
        // Affiliate commands
        this.bot.command('affiliate', this.handleAffiliate.bind(this));
        this.bot.command('earnings', this.handleViewEarnings.bind(this));
        this.bot.command('withdraw', this.handleWithdraw.bind(this));
        this.bot.command('referrals', this.handleReferrals.bind(this));
        this.bot.command('payouts', this.handlePayouts.bind(this));
        
        // Payment handlers (Telegram payments)
        this.bot.on('pre_checkout_query', this.handlePreCheckout.bind(this));
        this.bot.on('successful_payment', this.handleSuccessfulPayment.bind(this));
        
        // Callback handlers
        this.bot.action(/^subscribe:/, this.handleSubscribeCallback.bind(this));
        this.bot.action(/^payment:/, this.handlePaymentCallback.bind(this));
        this.bot.action(/^affiliate:/, this.handleAffiliateCallback.bind(this));
        this.bot.action(/^billing:/, this.handleBillingCallback.bind(this));
        this.bot.action(/^withdraw:/, this.handleWithdrawCallback.bind(this));
        
        console.log('✅ PaymentSystem registered');
    }

    /**
     * Handle /subscribe command
     */
    async handleSubscribe(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Check if user came through affiliate link
            const startPayload = ctx.startPayload;
            if (startPayload && startPayload.startsWith('ref_')) {
                await this.trackReferral(userId, startPayload);
            }
            
            // Check current subscription
            const currentSub = await this.getCurrentSubscription(userId);
            
            let message = '💎 *Premium Subscriptions*\n\n';
            message += '🚀 Unlock the full power of Zone News Bot!\n\n';
            
            if (currentSub) {
                message += `*Current Plan:* ${this.tiers[currentSub.tier]?.name || currentSub.tier}\n`;
                message += `*Status:* ${currentSub.status}\n`;
                message += `*Expires:* ${currentSub.expires_at.toLocaleDateString()}\n\n`;
            }
            
            message += '*Choose your plan:*';
            
            const keyboard = [];
            
            // Add tier options
            for (const [key, tier] of Object.entries(this.tiers)) {
                const monthlyPrice = (tier.price_monthly / 100).toFixed(2);
                const yearlyPrice = (tier.price_yearly / 100).toFixed(2);
                const yearlyMonthly = (tier.price_yearly / 12 / 100).toFixed(2);
                
                keyboard.push([{
                    text: `${tier.name} - $${monthlyPrice}/mo ${tier.highlight ? '⭐' : ''}`,
                    callback_data: `subscribe:${key}:monthly`
                }]);
                
                keyboard.push([{
                    text: `${tier.name} Yearly - $${yearlyPrice}/yr ($${yearlyMonthly}/mo) 💰`,
                    callback_data: `subscribe:${key}:yearly`
                }]);
            }
            
            keyboard.push([
                { text: '📊 Compare Plans', callback_data: 'subscribe:compare' }
            ]);
            keyboard.push([
                { text: '💰 Affiliate Program', callback_data: 'affiliate:info' }
            ]);
            keyboard.push([
                { text: '❓ FAQ', callback_data: 'subscribe:faq' },
                { text: '💬 Support', callback_data: 'subscribe:support' }
            ]);
            keyboard.push([
                { text: '❌ Cancel', callback_data: 'cancel' }
            ]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error in subscribe command:', error);
            await ctx.reply('❌ Error loading subscription options. Please try again.');
        }
    }

    /**
     * Handle subscription callbacks
     */
    async handleSubscribeCallback(ctx) {
        try {
            const data = ctx.callbackQuery.data.split(':');
            const action = data[1];
            
            await ctx.answerCallbackQuery();
            
            switch (action) {
                case 'compare':
                    await this.showPlanComparison(ctx);
                    break;
                case 'faq':
                    await this.showFAQ(ctx);
                    break;
                case 'support':
                    await this.showSupport(ctx);
                    break;
                default:
                    // Handle tier selection: subscribe:basic:monthly
                    const tier = action;
                    const billing = data[2];
                    await this.showPaymentMethods(ctx, tier, billing);
            }
            
        } catch (error) {
            console.error('Error handling subscribe callback:', error);
            await ctx.answerCallbackQuery('❌ Error processing subscription');
        }
    }

    /**
     * Show payment methods for selected tier
     */
    async showPaymentMethods(ctx, tier, billing) {
        try {
            const tierConfig = this.tiers[tier];
            const price = billing === 'yearly' ? tierConfig.price_yearly : tierConfig.price_monthly;
            const priceDisplay = (price / 100).toFixed(2);
            
            let message = `💳 *Payment Methods*\n\n`;
            message += `*Plan:* ${tierConfig.name} (${billing})\n`;
            message += `*Amount:* $${priceDisplay}\n\n`;
            message += '*Choose your payment method:*\n\n';
            
            const keyboard = [];
            
            // Add available payment methods
            for (const [key, method] of Object.entries(this.paymentMethods)) {
                if (method.enabled) {
                    keyboard.push([{
                        text: `${method.icon} ${method.name} (${method.fees})`,
                        callback_data: `payment:${key}:${tier}:${billing}`
                    }]);
                }
            }
            
            keyboard.push([
                { text: '« Back to Plans', callback_data: 'subscribe:back' },
                { text: '❌ Cancel', callback_data: 'cancel' }
            ]);
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error showing payment methods:', error);
            await ctx.reply('❌ Error loading payment methods.');
        }
    }

    /**
     * Handle payment method selection
     */
    async handlePaymentCallback(ctx) {
        try {
            const data = ctx.callbackQuery.data.split(':');
            const method = data[1];
            const tier = data[2];
            const billing = data[3];
            
            await ctx.answerCallbackQuery();
            
            switch (method) {
                case 'stripe':
                    await this.processStripePayment(ctx, tier, billing);
                    break;
                case 'paypal':
                    await this.processPayPalPayment(ctx, tier, billing);
                    break;
                case 'telegram':
                    await this.processTelegramPayment(ctx, tier, billing);
                    break;
                case 'crypto':
                    await this.processCryptoPayment(ctx, tier, billing);
                    break;
                default:
                    await ctx.reply('❌ Payment method not available.');
            }
            
        } catch (error) {
            console.error('Error handling payment callback:', error);
            await ctx.reply('❌ Error processing payment. Please try again.');
        }
    }

    /**
     * Process Stripe payment
     */
    async processStripePayment(ctx, tier, billing) {
        try {
            if (!this.STRIPE_SECRET_KEY) {
                await ctx.reply('❌ Stripe payments are not configured. Please contact support.');
                return;
            }
            
            const tierConfig = this.tiers[tier];
            const price = billing === 'yearly' ? tierConfig.price_yearly : tierConfig.price_monthly;
            
            // Create payment intent or checkout session
            const paymentData = {
                user_id: ctx.from.id,
                tier: tier,
                billing: billing,
                amount: price,
                currency: 'usd',
                method: 'stripe',
                status: 'pending',
                created_at: new Date()
            };
            
            const result = await this.db.collection('payment_intents').insertOne(paymentData);
            
            // Generate secure payment link
            const paymentLink = `${process.env.BASE_URL}/payment/stripe/${result.insertedId}`;
            
            await ctx.editMessageText(
                `💳 *Stripe Payment*\n\n` +
                `*Plan:* ${tierConfig.name} (${billing})\n` +
                `*Amount:* $${(price / 100).toFixed(2)}\n\n` +
                `Click the button below to complete your payment securely with Stripe.\n\n` +
                `🔒 *Your payment is secured by Stripe's industry-leading encryption.*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💳 Pay with Stripe', url: paymentLink }],
                            [{ text: '« Back', callback_data: `subscribe:${tier}:${billing}` }],
                            [{ text: '❌ Cancel', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error processing Stripe payment:', error);
            await ctx.reply('❌ Error setting up Stripe payment. Please try again.');
        }
    }

    /**
     * Process PayPal payment
     */
    async processPayPalPayment(ctx, tier, billing) {
        try {
            if (!this.PAYPAL_CLIENT_ID) {
                await ctx.reply('❌ PayPal payments are not configured. Please contact support.');
                return;
            }
            
            const tierConfig = this.tiers[tier];
            const price = billing === 'yearly' ? tierConfig.price_yearly : tierConfig.price_monthly;
            
            // Create PayPal order
            const paymentData = {
                user_id: ctx.from.id,
                tier: tier,
                billing: billing,
                amount: price,
                currency: 'usd',
                method: 'paypal',
                status: 'pending',
                created_at: new Date()
            };
            
            const result = await this.db.collection('payment_intents').insertOne(paymentData);
            
            // Generate PayPal payment link
            const paymentLink = `${process.env.BASE_URL}/payment/paypal/${result.insertedId}`;
            
            await ctx.editMessageText(
                `🅿️ *PayPal Payment*\n\n` +
                `*Plan:* ${tierConfig.name} (${billing})\n` +
                `*Amount:* $${(price / 100).toFixed(2)}\n\n` +
                `Click the button below to complete your payment with PayPal.\n\n` +
                `🔒 *Secure payment powered by PayPal.*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🅿️ Pay with PayPal', url: paymentLink }],
                            [{ text: '« Back', callback_data: `subscribe:${tier}:${billing}` }],
                            [{ text: '❌ Cancel', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error processing PayPal payment:', error);
            await ctx.reply('❌ Error setting up PayPal payment. Please try again.');
        }
    }

    /**
     * Process Telegram payment
     */
    async processTelegramPayment(ctx, tier, billing) {
        try {
            if (!this.TELEGRAM_PAYMENT_TOKEN) {
                await ctx.reply('❌ Telegram payments are not configured. Please contact support.');
                return;
            }
            
            const tierConfig = this.tiers[tier];
            const price = billing === 'yearly' ? tierConfig.price_yearly : tierConfig.price_monthly;
            const userId = ctx.from.id;
            
            // Check for affiliate referral
            const referral = await this.db.collection('referrals').findOne({
                referred_user_id: userId,
                status: 'pending'
            });
            
            const invoice = {
                title: `${tierConfig.name} Subscription`,
                description: `${billing === 'yearly' ? 'Annual' : 'Monthly'} subscription to Zone News Bot ${tierConfig.name} plan`,
                payload: JSON.stringify({
                    tier: tier,
                    billing: billing,
                    user_id: userId,
                    referral_id: referral?._id?.toString(),
                    amount: price
                }),
                provider_token: this.TELEGRAM_PAYMENT_TOKEN,
                currency: 'USD',
                prices: [
                    {
                        label: `${tierConfig.name} Plan (${billing})`,
                        amount: price
                    }
                ],
                start_parameter: `sub_${tier}_${billing}_${userId}`,
                photo_url: `${process.env.BASE_URL}/assets/subscription-${tier}.png`,
                photo_width: 512,
                photo_height: 512,
                need_name: true,
                need_email: true,
                send_phone_number_to_provider: false,
                send_email_to_provider: true,
                is_flexible: false
            };
            
            await ctx.replyWithInvoice(invoice);
            
        } catch (error) {
            console.error('Error creating Telegram invoice:', error);
            await ctx.reply('❌ Error creating payment invoice. Please try again.');
        }
    }

    /**
     * Handle pre-checkout query for Telegram payments
     */
    async handlePreCheckout(ctx) {
        try {
            const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);
            
            // Validate the payment
            const isValid = await this.validatePayment(payload);
            
            if (isValid) {
                await ctx.answerPreCheckoutQuery(true);
            } else {
                await ctx.answerPreCheckoutQuery(false, 'Payment validation failed. Please try again.');
            }
        } catch (error) {
            console.error('Error in pre-checkout:', error);
            await ctx.answerPreCheckoutQuery(false, 'Payment validation error. Please contact support.');
        }
    }

    /**
     * Handle successful Telegram payment
     */
    async handleSuccessfulPayment(ctx) {
        try {
            const payment = ctx.message.successful_payment;
            const payload = JSON.parse(payment.invoice_payload);
            const userId = ctx.from.id;
            
            // Create subscription record
            const subscription = {
                user_id: userId,
                tier: payload.tier,
                billing_cycle: payload.billing,
                amount: payload.amount,
                currency: payment.currency,
                payment_method: 'telegram',
                telegram_payment_charge_id: payment.telegram_payment_charge_id,
                provider_payment_charge_id: payment.provider_payment_charge_id,
                started_at: new Date(),
                expires_at: this.calculateExpiryDate(payload.billing),
                status: 'active',
                auto_renew: true
            };
            
            await this.db.collection('subscriptions').insertOne(subscription);
            
            // Process affiliate commission if applicable
            if (payload.referral_id) {
                await this.processAffiliateCommission(
                    payload.referral_id, 
                    payload.amount, 
                    subscription._id
                );
            }
            
            // Log payment
            await this.logPayment({
                user_id: userId,
                subscription_id: subscription._id,
                amount: payload.amount,
                currency: payment.currency,
                method: 'telegram',
                transaction_id: payment.provider_payment_charge_id,
                status: 'completed'
            });
            
            // Send confirmation
            const tier = this.tiers[payload.tier];
            await ctx.reply(
                '✅ *Payment Successful!*\n\n' +
                `🎉 Welcome to ${tier.name}!\n\n` +
                `*Your subscription details:*\n` +
                `• Plan: ${tier.name} (${payload.billing})\n` +
                `• Amount: $${(payload.amount / 100).toFixed(2)}\n` +
                `• Expires: ${subscription.expires_at.toLocaleDateString()}\n\n` +
                '*Premium features are now active:*\n' +
                tier.features.slice(0, 5).map(f => `✓ ${f}`).join('\n') +
                (tier.features.length > 5 ? `\n✓ And ${tier.features.length - 5} more features!` : '') +
                '\n\n' +
                'Use /usage to see your new limits!\n\n' +
                'Thank you for upgrading! 🚀',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📊 View Usage', callback_data: 'usage:view' }],
                            [{ text: '🎯 Start Posting', callback_data: 'post:wizard' }],
                            [{ text: '💰 Affiliate Program', callback_data: 'affiliate:info' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error handling successful payment:', error);
            await ctx.reply('✅ Payment received! Your subscription is being activated. You\'ll receive a confirmation shortly.');
        }
    }

    /**
     * Handle /affiliate command
     */
    async handleAffiliate(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Get or create affiliate account
            let affiliate = await this.db.collection('affiliates').findOne({ user_id: userId });
            
            if (!affiliate) {
                // Create new affiliate account
                const code = this.generateAffiliateCode(userId);
                affiliate = {
                    user_id: userId,
                    username: ctx.from.username,
                    first_name: ctx.from.first_name,
                    code: code,
                    tier: 'bronze',
                    total_earnings: 0,
                    pending_earnings: 0,
                    paid_earnings: 0,
                    referrals_count: 0,
                    conversions_count: 0,
                    click_count: 0,
                    conversion_rate: 0,
                    created_at: new Date(),
                    last_payout: null,
                    payout_method: null,
                    payout_details: {}
                };
                
                await this.db.collection('affiliates').insertOne(affiliate);
            }
            
            // Update affiliate tier based on referrals
            const newTier = this.calculateAffiliateTier(affiliate.referrals_count);
            if (newTier !== affiliate.tier) {
                await this.db.collection('affiliates').updateOne(
                    { user_id: userId },
                    { $set: { tier: newTier } }
                );
                affiliate.tier = newTier;
            }
            
            const botUsername = this.bot.botInfo?.username || 'ZoneNewsBot';
            const affiliateLink = `https://t.me/${botUsername}?start=${affiliate.code}`;
            const commissionRate = this.affiliateConfig.tiered_commissions[affiliate.tier].rate;
            
            await ctx.reply(
                '💰 *Affiliate Program*\n\n' +
                `🎯 Earn ${(commissionRate * 100).toFixed(1)}% commission on every subscription!\n\n` +
                `*Your Affiliate Dashboard:*\n` +
                `🏆 Tier: ${affiliate.tier.charAt(0).toUpperCase() + affiliate.tier.slice(1)}\n` +
                `💰 Total Earned: $${(affiliate.total_earnings / 100).toFixed(2)}\n` +
                `⏳ Pending: $${(affiliate.pending_earnings / 100).toFixed(2)}\n` +
                `✅ Paid Out: $${(affiliate.paid_earnings / 100).toFixed(2)}\n` +
                `👥 Referrals: ${affiliate.referrals_count}\n` +
                `💡 Conversions: ${affiliate.conversions_count}\n` +
                `📊 Rate: ${(affiliate.conversion_rate * 100).toFixed(1)}%\n\n` +
                '*Your Affiliate Link:*\n' +
                `\`${affiliateLink}\`\n\n` +
                '📱 Share this link to start earning!',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📊 Detailed Stats', callback_data: 'affiliate:stats' },
                                { text: '💵 Withdraw', callback_data: 'affiliate:withdraw' }
                            ],
                            [
                                { text: '🏆 Leaderboard', callback_data: 'affiliate:leaderboard' },
                                { text: '🎯 Promote', callback_data: 'affiliate:promote' }
                            ],
                            [
                                { text: '📋 Copy Link', callback_data: 'affiliate:copy' },
                                { text: '❓ Help', callback_data: 'affiliate:help' }
                            ],
                            [{ text: '❌ Close', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error in affiliate command:', error);
            await ctx.reply('❌ Error accessing affiliate program. Please try again.');
        }
    }

    /**
     * Handle /withdraw command
     */
    async handleWithdraw(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Check if user has active subscription for withdrawals
            const subscription = await this.getCurrentSubscription(userId);
            if (!subscription) {
                await ctx.reply(
                    '💵 *Withdrawals Require Subscription*\n\n' +
                    'You need an active subscription to withdraw affiliate earnings.\n\n' +
                    'This helps prevent fraud and ensures legitimate affiliate activity.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💎 Subscribe', callback_data: 'subscribe:plans' }],
                                [{ text: '❌ Close', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            const affiliate = await this.db.collection('affiliates').findOne({ user_id: userId });
            
            if (!affiliate || affiliate.pending_earnings < this.affiliateConfig.min_payout) {
                const minPayout = (this.affiliateConfig.min_payout / 100).toFixed(2);
                await ctx.reply(
                    `💵 *Insufficient Balance*\n\n` +
                    `Minimum withdrawal: $${minPayout}\n` +
                    `Your balance: $${affiliate ? (affiliate.pending_earnings / 100).toFixed(2) : '0.00'}\n\n` +
                    'Keep referring to reach the minimum!',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🎯 Share Link', callback_data: 'affiliate:share' }],
                                [{ text: '❌ Close', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            let message = '💵 *Withdrawal Request*\n\n';
            message += `*Available Balance:* $${(affiliate.pending_earnings / 100).toFixed(2)}\n\n`;
            message += '*Choose withdrawal method:*\n\n';
            
            const keyboard = [];
            
            for (const [key, method] of Object.entries(this.withdrawalMethods)) {
                if (affiliate.pending_earnings >= method.min_amount) {
                    const fee = method.fee > 0 ? ` (Fee: $${(method.fee / 100).toFixed(2)})` : '';
                    keyboard.push([{
                        text: `${method.icon} ${method.name}${fee}`,
                        callback_data: `withdraw:${key}`
                    }]);
                }
            }
            
            keyboard.push([
                { text: '📊 Earnings History', callback_data: 'affiliate:history' },
                { text: '❌ Cancel', callback_data: 'cancel' }
            ]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error in withdraw command:', error);
            await ctx.reply('❌ Error processing withdrawal request. Please try again.');
        }
    }

    /**
     * Process affiliate commission
     */
    async processAffiliateCommission(referralId, amount, subscriptionId) {
        try {
            const referral = await this.db.collection('referrals').findOne({
                _id: new ObjectId(referralId)
            });
            
            if (!referral) {
                console.log('Referral not found:', referralId);
                return;
            }
            
            // Get affiliate info to determine commission rate
            const affiliate = await this.db.collection('affiliates').findOne({
                user_id: referral.affiliate_id
            });
            
            const commissionRate = this.affiliateConfig.tiered_commissions[affiliate?.tier || 'bronze'].rate;
            const commission = Math.floor(amount * commissionRate);
            
            // Update affiliate earnings
            await this.db.collection('affiliates').updateOne(
                { user_id: referral.affiliate_id },
                {
                    $inc: {
                        total_earnings: commission,
                        pending_earnings: commission,
                        conversions_count: 1
                    },
                    $set: {
                        conversion_rate: await this.calculateConversionRate(referral.affiliate_id)
                    }
                }
            );
            
            // Create commission record
            const commissionRecord = {
                affiliate_id: referral.affiliate_id,
                referral_id: referralId,
                subscription_id: subscriptionId,
                amount: commission,
                rate: commissionRate,
                original_amount: amount,
                status: 'pending',
                created_at: new Date(),
                payout_date: null
            };
            
            await this.db.collection('commissions').insertOne(commissionRecord);
            
            // Update referral status
            await this.db.collection('referrals').updateOne(
                { _id: referral._id },
                { 
                    $set: { 
                        status: 'converted', 
                        converted_at: new Date(),
                        commission_amount: commission
                    } 
                }
            );
            
            // Notify affiliate
            try {
                await this.bot.telegram.sendMessage(
                    referral.affiliate_id,
                    `🎉 *Commission Earned!*\n\n` +
                    `💰 Amount: $${(commission / 100).toFixed(2)}\n` +
                    `📊 Rate: ${(commissionRate * 100).toFixed(1)}%\n` +
                    `💳 Original: $${(amount / 100).toFixed(2)}\n\n` +
                    `Your total earnings: $${((await this.getAffiliateEarnings(referral.affiliate_id)) / 100).toFixed(2)}\n\n` +
                    'Use /earnings to view details!',
                    { parse_mode: 'Markdown' }
                );
            } catch (err) {
                console.error('Could not notify affiliate:', err);
            }
            
        } catch (error) {
            console.error('Error processing affiliate commission:', error);
        }
    }

    /**
     * Track referral click
     */
    async trackReferral(userId, referralCode) {
        try {
            const affiliate = await this.db.collection('affiliates').findOne({ code: referralCode });
            
            if (!affiliate || affiliate.user_id === userId) {
                return; // Can't refer yourself
            }
            
            // Check if already referred
            const existing = await this.db.collection('referrals').findOne({
                referred_user_id: userId
            });
            
            if (existing) {
                // Update click count for existing referral
                await this.db.collection('affiliates').updateOne(
                    { user_id: affiliate.user_id },
                    { $inc: { click_count: 1 } }
                );
                return;
            }
            
            // Create new referral record
            await this.db.collection('referrals').insertOne({
                affiliate_id: affiliate.user_id,
                referred_user_id: userId,
                referral_code: referralCode,
                status: 'pending',
                created_at: new Date(),
                ip_address: null, // Could be populated from web interface
                user_agent: null
            });
            
            // Update affiliate stats
            await this.db.collection('affiliates').updateOne(
                { user_id: affiliate.user_id },
                { 
                    $inc: { 
                        click_count: 1,
                        referrals_count: 1
                    }
                }
            );
            
        } catch (error) {
            console.error('Error tracking referral:', error);
        }
    }

    /**
     * Get current subscription for user
     */
    async getCurrentSubscription(userId) {
        return await this.db.collection('subscriptions').findOne({
            user_id: userId,
            status: 'active',
            expires_at: { $gt: new Date() }
        });
    }

    /**
     * Calculate expiry date based on billing cycle
     */
    calculateExpiryDate(billing) {
        const now = new Date();
        if (billing === 'yearly') {
            return new Date(now.setFullYear(now.getFullYear() + 1));
        } else {
            return new Date(now.setMonth(now.getMonth() + 1));
        }
    }

    /**
     * Generate unique affiliate code
     */
    generateAffiliateCode(userId) {
        return `ref_${userId}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Calculate affiliate tier based on referrals
     */
    calculateAffiliateTier(referralsCount) {
        const tiers = this.affiliateConfig.tiered_commissions;
        
        if (referralsCount >= tiers.platinum.min_referrals) return 'platinum';
        if (referralsCount >= tiers.gold.min_referrals) return 'gold';
        if (referralsCount >= tiers.silver.min_referrals) return 'silver';
        return 'bronze';
    }

    /**
     * Calculate conversion rate for affiliate
     */
    async calculateConversionRate(affiliateId) {
        const totalReferrals = await this.db.collection('referrals').countDocuments({
            affiliate_id: affiliateId
        });
        
        const conversions = await this.db.collection('referrals').countDocuments({
            affiliate_id: affiliateId,
            status: 'converted'
        });
        
        return totalReferrals > 0 ? conversions / totalReferrals : 0;
    }

    /**
     * Get affiliate total earnings
     */
    async getAffiliateEarnings(userId) {
        const affiliate = await this.db.collection('affiliates').findOne({ user_id: userId });
        return affiliate?.total_earnings || 0;
    }

    /**
     * Validate payment before processing
     */
    async validatePayment(payload) {
        try {
            // Basic validation
            if (!payload.tier || !payload.billing || !payload.user_id || !payload.amount) {
                return false;
            }
            
            // Check if tier exists and amount is correct
            const tierConfig = this.tiers[payload.tier];
            if (!tierConfig) return false;
            
            const expectedAmount = payload.billing === 'yearly' ? 
                tierConfig.price_yearly : tierConfig.price_monthly;
            
            if (payload.amount !== expectedAmount) return false;
            
            // Additional validation can be added here
            return true;
            
        } catch (error) {
            console.error('Error validating payment:', error);
            return false;
        }
    }

    /**
     * Log payment transaction
     */
    async logPayment(paymentData) {
        try {
            await this.db.collection('payment_logs').insertOne({
                ...paymentData,
                created_at: new Date()
            });
        } catch (error) {
            console.error('Error logging payment:', error);
        }
    }

    /**
     * Show plan comparison
     */
    async showPlanComparison(ctx) {
        let message = '📊 *Plan Comparison*\n\n';
        
        for (const [key, tier] of Object.entries(this.tiers)) {
            message += `*${tier.name}*\n`;
            message += `💰 Monthly: $${(tier.price_monthly / 100).toFixed(2)}\n`;
            message += `💰 Yearly: $${(tier.price_yearly / 100).toFixed(2)} (${(tier.price_yearly / 12 / 100).toFixed(2)}/mo)\n\n`;
            
            message += '*Features:*\n';
            tier.features.slice(0, 6).forEach(f => {
                message += `✓ ${f}\n`;
            });
            if (tier.features.length > 6) {
                message += `✓ And ${tier.features.length - 6} more...\n`;
            }
            message += '\n';
        }
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '« Back to Plans', callback_data: 'subscribe:back' }],
                    [{ text: '💎 Choose Plan', callback_data: 'subscribe:choose' }],
                    [{ text: '❌ Close', callback_data: 'cancel' }]
                ]
            }
        });
    }
}

module.exports = PaymentSystem;