# Subscription Service - Implementation Specification

## Purpose
Manage user subscriptions using Telegram Stars for premium content access.

## Telegram Stars Overview
Telegram Stars is Telegram's native payment system:
- Users buy stars with real money in Telegram
- Bots can charge stars for premium features
- No external payment processor needed
- Refunds supported

## Database Schema

### `subscriptions` Collection
```javascript
{
  _id: ObjectId,
  userId: String,            // Telegram user ID
  username: String,          // Telegram username
  plan: String,              // 'basic', 'premium', 'professional'
  status: String,            // 'active', 'cancelled', 'expired', 'pending'
  stars: Number,             // Stars charged for this subscription
  startDate: Date,
  endDate: Date,
  autoRenew: Boolean,
  features: {
    premiumArticles: Boolean,
    noAds: Boolean,
    customAlerts: Boolean,
    analyticsAccess: Boolean
  },
  payments: [
    {
      transactionId: String,
      amount: Number,         // Stars amount
      date: Date,
      status: String          // 'completed', 'pending', 'refunded'
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

## Subscription Plans

### Basic (Free)
- Stars: 0
- Features: Access to public articles

### Premium Monthly
- Stars: 100 ⭐
- Features:
  - Premium articles
  - No ads
  - Early access to breaking news

### Professional Monthly
- Stars: 300 ⭐
- Features:
  - All Premium features
  - Custom alerts
  - Analytics dashboard access
  - Priority support

## API Endpoints

### GET /api/subscriptions/:userId
Get user's subscription status

### POST /api/subscriptions/create
Create subscription (initiate Stars payment)
- Body: { userId, plan }
- Returns: Invoice link for Telegram Stars payment

### POST /api/subscriptions/webhook
Handle Telegram Stars payment webhooks
- Verify payment completion
- Activate subscription

### POST /api/subscriptions/cancel
Cancel subscription (no refund, runs to end date)

### POST /api/subscriptions/refund
Request refund (admin only)

### GET /api/subscriptions/plans
Get available subscription plans

### GET /api/subscriptions/check/:userId
Check if user has access to premium features

## Telegram Stars Integration

### Creating Invoice
```javascript
bot.telegram.createInvoiceLink({
  title: 'Premium Subscription',
  description: '1 month of premium access',
  payload: JSON.stringify({ userId, plan }),
  provider_token: '', // Empty for Stars
  currency: 'XTR',     // Telegram Stars currency
  prices: [{ label: 'Premium', amount: 100 }] // Amount in stars
});
```

### Handling Payment
```javascript
bot.on('pre_checkout_query', async (ctx) => {
  // Validate before payment
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  // Activate subscription
  const payment = ctx.message.successful_payment;
  // Update database
});
```

## Features

1. **Telegram Stars Integration**: Native payment system
2. **Auto-renewal**: Optional automatic renewal
3. **Refund Support**: Handle refund requests
4. **Feature Gating**: Check subscription for premium access
5. **Analytics**: Track subscription metrics

## Integration Points
- Telegram Bot API (for Stars payments)
- MongoDB (for subscription data)
- Analytics Service (for subscription metrics)
