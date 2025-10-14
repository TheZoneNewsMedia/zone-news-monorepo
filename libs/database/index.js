const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connect() {
    if (db) return db;
    
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
    client = await MongoClient.connect(uri, { useUnifiedTopology: true });
    db = client.db('zone_news_production');
    
    console.log('Connected to MongoDB');
    return db;
}

async function disconnect() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}

function getDb() {
    if (!db) throw new Error('Database not connected');
    return db;
}

module.exports = { connect, disconnect, getDb };
