# Strapi Content Types (planned)

- Article
  - title: string, required
  - content: richtext
  - summary: text
  - published_date: datetime
  - source: string
  - views: integer
  - reactions: json
  - zone_news_data: json (message_id, channel, views)
  - category: relation -> Category (many-to-one)
  - tags: relation -> Tag (many-to-many)

- Category
  - name: string, required
  - slug: uid(name), required

- Tag
  - name: string, required
  - slug: uid(name), required
