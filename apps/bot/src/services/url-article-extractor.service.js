/**
 * URL Article Extractor Service
 * Extracts article content from URLs for quick submission
 */

const axios = require('axios');
const cheerio = require('cheerio');

class URLArticleExtractor {
    constructor(logger) {
        this.logger = logger || console;
        this.timeout = 10000; // 10 seconds
    }

    /**
     * Detect if message contains a URL
     */
    detectURL(text) {
        if (!text) return null;

        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const matches = text.match(urlRegex);

        return matches ? matches[0] : null;
    }

    /**
     * Extract article content from URL
     */
    async extractArticle(url) {
        try {
            this.logger.info('Extracting article from URL:', url);

            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const html = response.data;
            const $ = cheerio.load(html);

            // Extract metadata using Open Graph, Twitter Cards, and standard meta tags
            const article = {
                url: url,
                title: this.extractTitle($),
                description: this.extractDescription($),
                image: this.extractImage($, url),
                author: this.extractAuthor($),
                publishedDate: this.extractPublishedDate($),
                content: this.extractContent($),
                siteName: this.extractSiteName($)
            };

            this.logger.info('Article extracted successfully:', article.title);
            return article;

        } catch (error) {
            this.logger.error('Error extracting article:', error.message);
            throw new Error(`Failed to extract article: ${error.message}`);
        }
    }

    /**
     * Extract title from page
     */
    extractTitle($) {
        return (
            $('meta[property="og:title"]').attr('content') ||
            $('meta[name="twitter:title"]').attr('content') ||
            $('title').text() ||
            $('h1').first().text() ||
            'Untitled Article'
        ).trim();
    }

    /**
     * Extract description from page
     */
    extractDescription($) {
        return (
            $('meta[property="og:description"]').attr('content') ||
            $('meta[name="twitter:description"]').attr('content') ||
            $('meta[name="description"]').attr('content') ||
            $('p').first().text().substring(0, 200) ||
            'No description available'
        ).trim();
    }

    /**
     * Extract main image from page
     */
    extractImage($, baseUrl) {
        let imageUrl =
            $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content') ||
            $('article img').first().attr('src') ||
            $('img').first().attr('src');

        // Convert relative URLs to absolute
        if (imageUrl && !imageUrl.startsWith('http')) {
            const urlObj = new URL(baseUrl);
            imageUrl = new URL(imageUrl, urlObj.origin).href;
        }

        return imageUrl || null;
    }

    /**
     * Extract author from page
     */
    extractAuthor($) {
        return (
            $('meta[name="author"]').attr('content') ||
            $('meta[property="article:author"]').attr('content') ||
            $('[rel="author"]').text() ||
            $('.author').text() ||
            'Unknown Author'
        ).trim();
    }

    /**
     * Extract published date from page
     */
    extractPublishedDate($) {
        const dateStr =
            $('meta[property="article:published_time"]').attr('content') ||
            $('meta[name="publish_date"]').attr('content') ||
            $('time').attr('datetime') ||
            $('.published-date').text();

        if (dateStr) {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? null : date;
        }

        return null;
    }

    /**
     * Extract main content from page
     */
    extractContent($) {
        // Try to find article content
        let content = $('article').text() ||
                     $('.article-content').text() ||
                     $('.post-content').text() ||
                     $('main').text();

        // Clean up content
        content = content.replace(/\s+/g, ' ').trim();

        // Limit to first 500 characters for preview
        return content.substring(0, 500);
    }

    /**
     * Extract site name from page
     */
    extractSiteName($) {
        return (
            $('meta[property="og:site_name"]').attr('content') ||
            $('meta[name="application-name"]').attr('content') ||
            'Unknown Source'
        ).trim();
    }

    /**
     * Format article for preview
     */
    formatPreview(article) {
        let preview = '✅ *Article Found!*\n\n';

        preview += `📰 *${article.title}*\n\n`;

        if (article.description) {
            preview += `📝 ${article.description.substring(0, 200)}${article.description.length > 200 ? '...' : ''}\n\n`;
        }

        if (article.author && article.author !== 'Unknown Author') {
            preview += `✍️ Author: ${article.author}\n`;
        }

        if (article.siteName && article.siteName !== 'Unknown Source') {
            preview += `🌐 Source: ${article.siteName}\n`;
        }

        if (article.publishedDate) {
            preview += `📅 Published: ${article.publishedDate.toLocaleDateString()}\n`;
        }

        preview += `\n🔗 ${article.url}\n\n`;
        preview += '*What would you like to do?*';

        return preview;
    }

    /**
     * Create inline keyboard for article preview
     */
    createPreviewKeyboard(articleData) {
        return {
            inline_keyboard: [
                [
                    { text: '✅ Publish Now', callback_data: `publish_url_article:${articleData.id}` },
                    { text: '✏️ Edit First', callback_data: `edit_url_article:${articleData.id}` }
                ],
                [
                    { text: '🚀 Post to Channel', callback_data: `post_url_article:${articleData.id}` }
                ],
                [
                    { text: '❌ Cancel', callback_data: 'cancel_url_article' }
                ]
            ]
        };
    }
}

module.exports = URLArticleExtractor;
