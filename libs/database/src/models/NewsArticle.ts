import mongoose, { Schema, Document } from 'mongoose';
import { NewsArticle as INewsArticle } from '@zone/shared';

export interface NewsArticleDocument extends Omit<INewsArticle, 'id'>, Document {}

const NewsArticleSchema = new Schema<NewsArticleDocument>({
  title: { 
    type: String, 
    required: true,
    index: 'text'
  },
  content: { 
    type: String, 
    required: true 
  },
  summary: { 
    type: String 
  },
  category: { 
    type: String, 
    required: true,
    index: true
  },
  source: { 
    type: String, 
    required: true,
    index: true
  },
  url: { 
    type: String 
  },
  imageUrl: { 
    type: String 
  },
  publishedAt: { 
    type: Date, 
    required: true,
    index: true
  },
  views: { 
    type: Number, 
    default: 0 
  },
  reactions: {
    likes: { 
      type: Number, 
      default: 0 
    },
    hearts: { 
      type: Number, 
      default: 0 
    }
  }
});

// Compound index for efficient queries
NewsArticleSchema.index({ publishedAt: -1, category: 1 });
NewsArticleSchema.index({ source: 1, publishedAt: -1 });

export const NewsArticleModel = mongoose.model<NewsArticleDocument>('NewsArticle', NewsArticleSchema);