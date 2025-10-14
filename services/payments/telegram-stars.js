/**
 * Telegram Stars Payment Integration
 * Handles subscription payments via Telegram Stars
 */

const TIER_PRICES = {
  pro: {
    stars: 300,
    usd: 5.55,
    name: 'Zone News Pro',
    description: '50 articles/day, AI summaries, early access'
  },
  business: {
    stars: 1350,
    usd: 25,
    name: 'Zone News Business',
    description: '200 articles/day, API access, analytics, 5 channels'
  },
  enterprise: {
    stars: 5400,
    usd: 100,
    name: 'Zone News Enterprise',
    description: 'Unlimited everything, white label, dedicated support'
  }
};

class TelegramStarsPayment {
  constructor(bot) {
    this.bot = bot;
    this.setupHandlers();
  }

  setupHandlers() {
    // Handle /subscribe command
    this.bot.command('subscribe', (ctx) => this.showSubscriptionOptions(ctx));
    
    // Handle pre-checkout query
    this.bot.on('pre_checkout_query', (ctx) => this.handlePreCheckout(ctx));
    
    // Handle successful payment
    this.bot.on('successful_payment', (ctx) => this.handleSuccessfulPayment(ctx));
  }

  async showSubscriptionOptions(ctx) {
    const userId = ctx.from.id;
    
    // Check current tier
    const currentTier = await this.getUserTier(userId);
    
    if (currentTier !== 'free') {
      await ctx.reply(
        `You're currently on the ${currentTier} tier. 🎉\n\n` +
        `To manage your subscription, use /manage_subscription`
      );
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚀 Pro (300 Stars)', callback_data: 'subscribe_pro' }
        ],
        [
          { text: '💼 Business (1,350 Stars)', callback_data: 'subscribe_business' }
        ],
        [
          { text: '🏢 Enterprise (5,400 Stars)', callback_data: 'subscribe_enterprise' }
        ],
        [
          { text: '❓ Compare Plans', callback_data: 'compare_plans' }
        ]
      ]
    };

    await ctx.reply(
      '🌟 *Choose Your Zone News Plan*\n\n' +
      '📱 *Pro* - 300 Stars (~$5.55/mo)\n' +
      '• 50 articles/day (5x more!)\n' +
      '• AI-powered summaries\n' +
      '• 30-60 min early access\n\n' +
      
      '💼 *Business* - 1,350 Stars (~$25/mo)\n' +
      '• 200 articles/day\n' +
      '• Full API access\n' +
      '• Analytics dashboard\n' +
      '• 5 channels\n\n' +
      
      '🏢 *Enterprise* - 5,400 Stars (~$100/mo)\n' +
      '• Unlimited everything\n' +
      '• White label solution\n' +
      '• Dedicated support\n' +
      '• Custom features\n\n' +
      
      'Select a plan to continue:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async handleSubscriptionCallback(ctx, tier) {
    const tierInfo = TIER_PRICES[tier];
    
    if (!tierInfo) {
      await ctx.answerCbQuery('Invalid tier selected');
      return;
    }

    // Create invoice
    const invoice = {
      title: tierInfo.name,
      description: tierInfo.description,
      payload: JSON.stringify({
        tier,
        userId: ctx.from.id,
        timestamp: Date.now()
      }),
      provider_token: '', // Empty for Telegram Stars
      currency: 'XTR', // Telegram Stars currency
      prices: [
        {
          label: tierInfo.name,
          amount: tierInfo.stars
        }
      ],
      start_parameter: `subscribe_${tier}`,
      photo_url: 'https://i.imgur.com/zone-news-logo.png', // Add your logo
      photo_width: 512,
      photo_height: 512,
      need_name: false,
      need_phone_number: false,
      need_email: true,
      need_shipping_address: false,
      is_flexible: false
    };

    await ctx.replyWithInvoice(invoice);
    await ctx.answerCbQuery(`Opening ${tierInfo.name} payment...`);
  }

  async handlePreCheckout(ctx) {
    // Validate the payment
    try {
      const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);
      
      // Check if user already has this tier
      const currentTier = await this.getUserTier(payload.userId);
      if (currentTier === payload.tier) {
        await ctx.answerPreCheckoutQuery(false, 'You already have this subscription');
        return;
      }

      // Approve the payment
      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      console.error('Pre-checkout error:', error);
      await ctx.answerPreCheckoutQuery(false, 'Payment validation failed');
    }
  }

  async handleSuccessfulPayment(ctx) {
    const payment = ctx.message.successful_payment;
    const payload = JSON.parse(payment.invoice_payload);
    
    // Update user tier in database
    await this.upgradeUserTier(payload.userId, payload.tier);
    
    // Send confirmation
    await ctx.reply(
      `🎉 *Payment Successful!*\n\n` +
      `Welcome to Zone News ${payload.tier.charAt(0).toUpperCase() + payload.tier.slice(1)}!\n\n` +
      `Your benefits are now active:\n` +
      `${TIER_PRICES[payload.tier].description}\n\n` +
      `Use /mytier to see your current status.\n` +
      `Open the mini app to start enjoying premium features!`,
      { parse_mode: 'Markdown' }
    );

    // Log to admin channel
    if (process.env.TELEGRAM_LOG_CHANNEL_ID) {
      await this.bot.telegram.sendMessage(
        process.env.TELEGRAM_LOG_CHANNEL_ID,
        `💰 New subscription!\nUser: ${ctx.from.id}\nTier: ${payload.tier}\nStars: ${payment.total_amount}`
      );
    }
  }

  async getUserTier(userId) {
    try {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      
      const db = client.db('zone_news_production');
      const user = await db.collection('users').findOne({ 
        telegramId: userId.toString() 
      });
      
      await client.close();
      return user?.tier || 'free';
    } catch (error) {
      console.error('Error fetching user tier:', error);
      return 'free'; // Fallback to free tier on error
    }
  }

  async upgradeUserTier(userId, tier) {
    try {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      
      const db = client.db('zone_news_production');
      const result = await db.collection('users').updateOne(
        { telegramId: userId.toString() },
        { 
          $set: { 
            tier: tier,
            tierUpgradedAt: new Date(),
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      );
      
      await client.close();
      console.log(`Successfully upgraded user ${userId} to ${tier}`);
      return result;
    } catch (error) {
      console.error(`Error upgrading user ${userId} to ${tier}:`, error);
      throw error;
    }
    // await UserModel.findOneAndUpdate(
    //   { telegramId: userId },
    //   { 
    //     tier, 
    //     tierUpdatedAt: new Date(),
    //     subscriptionActive: true
    //   }
    // );
  }

  // Handle subscription cancellation
  async cancelSubscription(userId) {
    // Downgrade to free tier
    await this.upgradeUserTier(userId, 'free');
  }

  // Check subscription status
  async checkSubscriptionStatus(userId) {
    const tier = await this.getUserTier(userId);
    return {
      tier,
      active: tier !== 'free',
      expiresAt: null // Would be calculated based on payment date
    };
  }
}

module.exports = TelegramStarsPayment;