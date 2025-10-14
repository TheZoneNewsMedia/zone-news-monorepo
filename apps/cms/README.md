# Strapi CMS (only)

This app uses Strapi v4 as the sole CMS.

## Bootstrap

Manual setup
```bash
cd zone-news-monorepo
pnpm dlx create-strapi-app@latest apps/cms --quickstart --typescript
# or
npx create-strapi-app@latest apps/cms --quickstart --typescript
```

## Dev
```bash
pnpm --filter ./apps/cms dev
```

## Configure CORS
Allow origins for `apps/api`, `apps/web`, `apps/admin`, and Telegram domains.

## Content Types (initial)
- Article: title, content, summary, published_date, views, reactions, zone_news_data
- Category: name, slug
- Tag: name, slug

## Webhooks
- Inbound: none (handled by API). Outbound: notify bot on publish.
