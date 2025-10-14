import { NewsArticleModel, NewsArticleDocument } from '../models/NewsArticle';

export class NewsRepository {
  async findLatest(limit: number = 10, category?: string): Promise<NewsArticleDocument[]> {
    const query = category ? { category } : {};
    return NewsArticleModel
      .find(query)
      .sort({ publishedAt: -1 })
      .limit(limit);
  }

  async findById(id: string): Promise<NewsArticleDocument | null> {
    return NewsArticleModel.findById(id);
  }

  async create(data: Partial<NewsArticleDocument>): Promise<NewsArticleDocument> {
    const article = new NewsArticleModel(data);
    return article.save();
  }

  async incrementViews(id: string): Promise<void> {
    await NewsArticleModel.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } }
    );
  }

  async addReaction(id: string, type: 'likes' | 'hearts'): Promise<void> {
    await NewsArticleModel.findByIdAndUpdate(
      id,
      { $inc: { [`reactions.${type}`]: 1 } }
    );
  }

  async search(query: string, limit: number = 20): Promise<NewsArticleDocument[]> {
    return NewsArticleModel
      .find({ $text: { $search: query } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit);
  }

  async getCategories(): Promise<string[]> {
    return NewsArticleModel.distinct('category');
  }

  async countByDateRange(startDate: Date, endDate: Date): Promise<number> {
    return NewsArticleModel.countDocuments({
      publishedAt: { $gte: startDate, $lte: endDate }
    });
  }
}