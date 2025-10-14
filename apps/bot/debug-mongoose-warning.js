#!/usr/bin/env node

// Debug script to find the source of Mongoose 'errors' warning
const mongoose = require('mongoose');

// Override mongoose.Schema to catch any schema with 'errors' field
const originalSchema = mongoose.Schema;
mongoose.Schema = function(definition, options) {
    if (definition && typeof definition === 'object') {
        for (const [key, value] of Object.entries(definition)) {
            if (key === 'errors') {
                console.error(`🚨 FOUND 'errors' FIELD IN SCHEMA:`);
                console.error(`Field definition:`, value);
                console.error(`Stack trace:`);
                console.trace();
                break;
            }
        }
    }
    return new originalSchema(definition, options);
};

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/zone_news_production')
    .then(() => {
        console.log('✅ Connected to MongoDB');
        console.log('Loading bot services...');
        
        // Now require the main bot file
        require('./index.js');
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
    });