import mongoose, { Schema, Document } from 'mongoose';
import { User as IUser, TierType } from '@zone/shared';

export interface UserDocument extends Omit<IUser, 'id'>, Document {}

const UserSchema = new Schema<UserDocument>({
  telegramId: { 
    type: Number, 
    required: true, 
    unique: true,
    index: true 
  },
  username: { 
    type: String,
    sparse: true,
    index: true
  },
  tier: { 
    type: String, 
    enum: ['free', 'pro', 'business', 'enterprise', 'admin'],
    default: 'free',
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

UserSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const UserModel = mongoose.model<UserDocument>('User', UserSchema);