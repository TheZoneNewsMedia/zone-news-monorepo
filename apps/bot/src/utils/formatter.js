/**
 * Common formatting utilities
 */

class Formatter {
    /**
     * Format article for display
     */
    static formatArticle(article) {
        if (!article) return 'No article data';
        
        const date = article.published_date 
            ? new Date(article.published_date).toLocaleDateString('en-AU')
            : 'Unknown date';
        
        const title = article.title || 'Untitled';
        const content = article.summary || article.content?.substring(0, 300) || '';
        const category = article.category || 'General';
        const url = article.url || 'https://thezonenews.com';
        
        return `📰 *${this.escapeMarkdown(title)}*\n\n` +
            `${this.escapeMarkdown(content)}...\n\n` +
            `📅 ${date} | 📂 ${category}\n` +
            `🔗 [Read More](${url})`;
    }
    
    /**
     * Format article with media
     */
    static formatArticleWithMedia(article, media) {
        const baseFormat = this.formatArticle(article);
        
        if (media && media.caption) {
            return `${media.caption}\n\n${baseFormat}`;
        }
        
        return baseFormat;
    }
    
    /**
     * Escape markdown special characters
     */
    static escapeMarkdown(text) {
        if (!text) return '';
        
        // Don't escape inside URLs
        const urlRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const urls = [];
        let tempText = text.replace(urlRegex, (match) => {
            urls.push(match);
            return `__URL_${urls.length - 1}__`;
        });
        
        // Escape special characters
        tempText = tempText.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
        
        // Restore URLs
        urls.forEach((url, index) => {
            tempText = tempText.replace(`__URL_${index}__`, url);
        });
        
        return tempText;
    }
    
    /**
     * Format file size
     */
    static formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    /**
     * Format duration
     */
    static formatDuration(seconds) {
        if (!seconds) return 'Unknown';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Format date relative
     */
    static formatDateRelative(date) {
        const now = new Date();
        const then = new Date(date);
        const diff = now - then;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 7) {
            return then.toLocaleDateString('en-AU');
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }
    
    /**
     * Truncate text
     */
    static truncate(text, maxLength = 200) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
}

module.exports = Formatter;