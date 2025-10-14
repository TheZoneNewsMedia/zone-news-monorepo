import { UserModel, UserDocument } from '../models/User';
import { TierType } from '@zone/shared';

export class UserRepository {
  async findByTelegramId(telegramId: number): Promise<UserDocument | null> {
    return UserModel.findOne({ telegramId });
  }

  async create(data: {
    telegramId: number;
    username?: string;
    tier?: TierType;
  }): Promise<UserDocument> {
    const user = new UserModel({
      ...data,
      tier: data.tier || 'free'
    });
    return user.save();
  }

  async updateTier(telegramId: number, tier: TierType): Promise<UserDocument | null> {
    return UserModel.findOneAndUpdate(
      { telegramId },
      { tier, updatedAt: new Date() },
      { new: true }
    );
  }

  async findOrCreate(data: {
    telegramId: number;
    username?: string;
  }): Promise<UserDocument> {
    let user = await this.findByTelegramId(data.telegramId);
    if (!user) {
      user = await this.create(data);
    }
    return user;
  }

  async countByTier(tier: TierType): Promise<number> {
    return UserModel.countDocuments({ tier });
  }

  async getAdmins(): Promise<UserDocument[]> {
    return UserModel.find({ tier: 'admin' });
  }
}