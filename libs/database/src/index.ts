// Database library exports
import mongoose from 'mongoose';

export * from './models/User';
export * from './models/NewsArticle';
export * from './repositories/UserRepository';
export * from './repositories/NewsRepository';

// Database connection helper
export async function connectDatabase(uri: string, options?: mongoose.ConnectOptions) {
  try {
    await mongoose.connect(uri, {
      ...options,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    });
    console.log('✅ Database connected successfully');
    
    // Create indexes
    await createIndexes();
    
    return mongoose.connection;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

async function createIndexes() {
  try {
    // Indexes are defined in models, this ensures they're created
    await Promise.all([
      mongoose.model('User').createIndexes(),
      mongoose.model('NewsArticle').createIndexes()
    ]);
    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('⚠️ Index creation warning:', error);
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  console.log('Database disconnected');
}