/**
 * AI Article Processor Service
 *
 * Uses AI (Groq/OpenRouter) with JSON prompting to automatically:
 * 1. Extract article content from URLs
 * 2. Analyze and categorize
 * 3. Structure for Telegram posts
 * 4. Generate engaging headlines
 *
 * Integrates with existing AI infrastructure
 */

const axios = require('axios');

class AIArticleProcessor {
  constructor(config = {}) {
    // Use existing AI API keys from environment
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY;

    // API endpoints
    this.groqBaseUrl = 'https://api.groq.com/openai/v1';
    this.openRouterBaseUrl = 'https://openrouter.ai/api/v1';

    // Default config
    this.config = {
      defaultModel: 'llama-3.1-70b-versatile', // Groq model
      temperature: 0.3, // Low for consistent JSON output
      maxTokens: 2000,
      ...config
    };

    console.log('🤖 AI Article Processor initialized');
    console.log(`   Groq: ${this.groqApiKey ? '✅' : '❌'}`);
    console.log(`   OpenRouter: ${this.openRouterApiKey ? '✅' : '❌'}`);
  }

  /**
   * Process article with AI - main entry point
   */
  async processArticle(articleData) {
    try {
      console.log('🧠 Processing article with AI...');

      // Step 1: Analyze content
      const analysis = await this.analyzeArticle(articleData);

      // Step 2: Generate Telegram post structure
      const telegramPost = await this.generateTelegramPost(articleData, analysis);

      // Step 3: Enhance with hashtags and emojis
      const enhancedPost = await this.enhancePost(telegramPost, analysis);

      return {
        success: true,
        analysis,
        post: enhancedPost,
        metadata: {
          processed_at: new Date(),
          ai_model: this.config.defaultModel
        }
      };

    } catch (error) {
      console.error('❌ AI processing failed:', error);
      throw error;
    }
  }

  /**
   * Analyze article content with AI using JSON prompting
   */
  async analyzeArticle(articleData) {
    const prompt = {
      role: 'system',
      content: `You are an Australian news analyst for Zone News Adelaide. Analyze articles and return ONLY valid JSON.

EDITORIAL GUIDELINES:
- Tone: Honest, unbiased, straightforward, non-alarmist
- Focus: Adelaide/SA primary, Australia national secondary, international with AU relevance
- Language: Australian English spelling (colour, centre, organisation)
- Policy: Pro-cannabis reform but report factually without bias

ADELAIDE FOCUS HIERARCHY:
1. Adelaide direct impact - highest priority
2. South Australia state news - secondary
3. Australian national news - tertiary (with SA relevance)
4. International news - only with Australian connection

Your response MUST be a valid JSON object with this exact structure:
{
  "category": "string (Local News, South Australian Politics, Australian Politics, Technology, Business, Sport, Entertainment, Health, Science, Environment, International)",
  "sentiment": "string (positive/negative/neutral/serious/concerned)",
  "urgency": "string (low/medium/high)",
  "keywords": ["array", "of", "key", "terms"],
  "summary": "string (180-250 words, facts→context→local relevance structure)",
  "adelaide_relevance": "string (how this impacts Adelaide/SA residents)",
  "location_mentions": ["array", "of", "Adelaide/SA", "locations"],
  "is_breaking": boolean,
  "target_audience": "South Australians",
  "reading_difficulty": "string (easy/medium/hard)",
  "word_count": number
}

CRITICAL: Return ONLY the JSON object, no explanations, no markdown formatting.`
    };

    const userPrompt = {
      role: 'user',
      content: `Analyze this article:

Title: ${articleData.title}
Content: ${articleData.content ? articleData.content.substring(0, 1500) : articleData.excerpt}
Source: ${articleData.siteName || 'Unknown'}

Return analysis as JSON:`
    };

    try {
      const response = await this.callGroqAPI([prompt, userPrompt]);

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const analysis = JSON.parse(jsonMatch[0]);
      console.log('✅ Article analyzed:', analysis.category, '-', analysis.sentiment);

      return analysis;

    } catch (error) {
      console.error('Analysis failed:', error);
      // Return fallback analysis
      return {
        category: 'General',
        sentiment: 'neutral',
        urgency: 'medium',
        keywords: [],
        summary: articleData.excerpt || articleData.content.substring(0, 200),
        location_mentions: [],
        is_breaking: false,
        target_audience: 'general',
        reading_difficulty: 'medium'
      };
    }
  }

  /**
   * Generate Telegram post with AI using JSON prompting
   */
  async generateTelegramPost(articleData, analysis) {
    const prompt = {
      role: 'system',
      content: `You are a news writer for Zone News Adelaide. Create honest, straightforward Telegram posts and return ONLY valid JSON.

WRITING STYLE (from editorial guidelines):
- Honest, unbiased, straightforward, non-alarmist
- Factual reporting without promotional language
- Australian English spelling (colour, centre, organisation)
- NO clickbait, NO marketing fluff, NO sensationalism

STRUCTURE REQUIREMENT (180-250 words total):
Paragraph 1: Key facts immediately (who, what, when, where)
Paragraph 2: Context and background (quotes, statistics, details)
Paragraph 3: Adelaide/South Australia local relevance and impact

Your response MUST be a valid JSON object with this exact structure:
{
  "headline": "string (clear, factual headline, <60 chars, no emojis unless breaking news)",
  "paragraph_1_facts": "string (key facts only, no context or background)",
  "paragraph_2_context": "string (background information, quotes, supporting details)",
  "paragraph_3_local": "string (Adelaide/SA relevance, what it means for local residents)",
  "sources_cited": ["Source 1", "Source 2"],
  "hashtags": ["array", "of", "relevant", "tags"],
  "emoji_theme": "string (emoji representing the story - 📰 for general news)",
  "word_count": number,
  "formatting": {
    "use_bold": boolean,
    "use_italic": boolean,
    "use_lists": boolean
  }
}

CRITICAL: Return ONLY the JSON object, no explanations. NO call-to-action phrases.`
    };

    const userPrompt = {
      role: 'user',
      content: `Create a Telegram post for:

Title: ${articleData.title}
Category: ${analysis.category}
Sentiment: ${analysis.sentiment}
Summary: ${analysis.summary}
Source: ${articleData.siteName || 'Unknown'}
URL: ${articleData.url}

Key points:
${analysis.keywords.slice(0, 5).map(k => `- ${k}`).join('\n')}

Return post structure as JSON:`
    };

    try {
      const response = await this.callGroqAPI([prompt, userPrompt]);

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const postStructure = JSON.parse(jsonMatch[0]);
      console.log('✅ Telegram post generated');

      return postStructure;

    } catch (error) {
      console.error('Post generation failed:', error);
      // Return fallback structure
      const contentPreview = articleData.content || articleData.excerpt || '';
      return {
        headline: articleData.title.substring(0, 60),
        paragraph_1_facts: contentPreview.substring(0, 150),
        paragraph_2_context: analysis.summary || contentPreview.substring(150, 400),
        paragraph_3_local: analysis.adelaide_relevance || 'Impact on Adelaide/SA residents to be confirmed.',
        sources_cited: [articleData.siteName || 'Unknown'],
        hashtags: ['ZoneNews', 'Adelaide', analysis.category.replace(/\s/g, '')],
        emoji_theme: '📰',
        word_count: analysis.word_count || 0,
        formatting: {
          use_bold: true,
          use_italic: false,
          use_lists: false
        }
      };
    }
  }

  /**
   * Enhance post with formatting
   */
  async enhancePost(postStructure, analysis) {
    let formattedPost = '';

    // Add urgency indicator for breaking news (at top)
    if (analysis.is_breaking) {
      formattedPost += `🚨 <b>BREAKING NEWS</b>\n\n`;
    }

    // Add emoji theme
    if (postStructure.emoji_theme) {
      formattedPost += `${postStructure.emoji_theme} `;
    }

    // Add headline (bold)
    formattedPost += `<b>${this.escapeHtml(postStructure.headline)}</b>\n\n`;

    // Paragraph 1: Key Facts (with bold emphasis on first sentence)
    if (postStructure.paragraph_1_facts) {
      const p1 = postStructure.paragraph_1_facts;
      const sentences = p1.split('. ');
      if (sentences.length > 0 && postStructure.formatting?.use_bold) {
        formattedPost += `<b>${this.escapeHtml(sentences[0])}.</b>`;
        if (sentences.length > 1) {
          formattedPost += ` ${this.escapeHtml(sentences.slice(1).join('. '))}`;
        }
      } else {
        formattedPost += this.escapeHtml(p1);
      }
      formattedPost += '\n\n';
    }

    // Paragraph 2: Context & Background
    if (postStructure.paragraph_2_context) {
      formattedPost += `${this.escapeHtml(postStructure.paragraph_2_context)}\n\n`;
    }

    // Paragraph 3: Local Relevance (with italic emphasis)
    if (postStructure.paragraph_3_local && postStructure.formatting?.use_italic) {
      formattedPost += `<i>${this.escapeHtml(postStructure.paragraph_3_local)}</i>\n\n`;
    } else if (postStructure.paragraph_3_local) {
      formattedPost += `${this.escapeHtml(postStructure.paragraph_3_local)}\n\n`;
    }

    // Add sources cited
    if (postStructure.sources_cited && postStructure.sources_cited.length > 0) {
      formattedPost += `<i>Sources: ${postStructure.sources_cited.join(', ')}</i>\n\n`;
    }

    // Add hashtags
    if (postStructure.hashtags && postStructure.hashtags.length > 0) {
      formattedPost += postStructure.hashtags
        .slice(0, 5)
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
        .join(' ');
    }

    // Add word count to metadata (not visible in post)
    const wordCount = postStructure.word_count || this.countWords(formattedPost);

    return {
      text: formattedPost,
      structure: postStructure,
      analysis: analysis,
      wordCount: wordCount
    };
  }

  /**
   * Call Groq API
   */
  async callGroqAPI(messages, options = {}) {
    if (!this.groqApiKey) {
      throw new Error('Groq API key not configured');
    }

    try {
      const response = await axios.post(
        `${this.groqBaseUrl}/chat/completions`,
        {
          model: options.model || this.config.defaultModel,
          messages: messages,
          temperature: options.temperature || this.config.temperature,
          max_tokens: options.maxTokens || this.config.maxTokens,
          response_format: { type: 'json_object' } // Force JSON output
        },
        {
          headers: {
            'Authorization': `Bearer ${this.groqApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;

    } catch (error) {
      console.error('Groq API error:', error.response?.data || error.message);

      // Fallback to OpenRouter if Groq fails
      if (this.openRouterApiKey) {
        console.log('⚠️ Groq failed, trying OpenRouter...');
        return await this.callOpenRouterAPI(messages, options);
      }

      throw error;
    }
  }

  /**
   * Call OpenRouter API (fallback)
   */
  async callOpenRouterAPI(messages, options = {}) {
    if (!this.openRouterApiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const response = await axios.post(
        `${this.openRouterBaseUrl}/chat/completions`,
        {
          model: 'meta-llama/llama-3.1-70b-instruct',
          messages: messages,
          temperature: options.temperature || this.config.temperature,
          max_tokens: options.maxTokens || this.config.maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://thezonenews.com',
            'X-Title': 'Zone News Bot'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;

    } catch (error) {
      console.error('OpenRouter API error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Quick headline generation
   */
  async generateHeadline(title, content) {
    const prompt = {
      role: 'system',
      content: 'You are a headline writer. Create engaging headlines. Return ONLY a JSON object: {"headline": "your headline here", "emoji": "📰"}'
    };

    const userPrompt = {
      role: 'user',
      content: `Create an engaging headline for:\n\nOriginal: ${title}\n\nContext: ${content.substring(0, 200)}\n\nReturn JSON:`
    };

    try {
      const response = await this.callGroqAPI([prompt, userPrompt]);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result.headline;
      }
    } catch (error) {
      console.error('Headline generation failed:', error);
    }

    // Fallback
    return title.substring(0, 60);
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Count words in text (excluding HTML tags)
   */
  countWords(text) {
    if (!text) return 0;
    // Remove HTML tags
    const plainText = text.replace(/<[^>]*>/g, '');
    // Remove extra whitespace and count words
    const words = plainText.trim().split(/\s+/);
    return words.filter(word => word.length > 0).length;
  }

  /**
   * Validate word count is within target range (180-250 words)
   */
  validateWordCount(text, targetMin = 180, targetMax = 250) {
    const count = this.countWords(text);
    const isValid = count >= targetMin && count <= targetMax;
    const status = isValid ? '✅' : count < targetMin ? '⚠️ Too short' : '⚠️ Too long';

    return {
      count,
      isValid,
      status,
      targetRange: `${targetMin}-${targetMax}`,
      message: isValid
        ? `Word count (${count}) is within target range.`
        : `Word count (${count}) is outside target range (${targetMin}-${targetMax}).`
    };
  }

  /**
   * Test AI connection
   */
  async testConnection() {
    try {
      const testMessages = [
        { role: 'system', content: 'Return only JSON: {"status": "ok"}' },
        { role: 'user', content: 'Test' }
      ];

      await this.callGroqAPI(testMessages);
      return { success: true, provider: 'Groq' };
    } catch (error) {
      if (this.openRouterApiKey) {
        try {
          const testMessages = [
            { role: 'system', content: 'Return only JSON: {"status": "ok"}' },
            { role: 'user', content: 'Test' }
          ];
          await this.callOpenRouterAPI(testMessages);
          return { success: true, provider: 'OpenRouter' };
        } catch (error2) {
          return { success: false, error: 'Both providers failed' };
        }
      }
      return { success: false, error: error.message };
    }
  }
}

module.exports = AIArticleProcessor;
