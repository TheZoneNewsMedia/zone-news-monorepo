#!/usr/bin/env node

/**
 * MTProto Permanent Authentication Setup
 * One-time setup for autonomous channel scraping
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs').promises;
const path = require('path');

// API Credentials (from my.telegram.org)
const apiId = 23866499;
const apiHash = '45d44db30ae4337116e3d58cd17d0b3c';
const appTitle = 'ThezoneNews';

// Session file path
const SESSION_FILE = path.join(__dirname, '.session');
const ENV_FILE = path.join(__dirname, '.env');

/**
 * Setup permanent MTProto session
 */
async function setupAuthentication() {
    console.log('🔐 Zone News MTProto Authentication Setup');
    console.log('==========================================\n');
    
    // Check for existing session
    let sessionString = '';
    try {
        const sessionData = await fs.readFile(SESSION_FILE, 'utf8');
        sessionString = sessionData.trim();
        console.log('✅ Found existing session file');
    } catch {
        console.log('📝 No existing session found, creating new one');
    }
    
    const session = new StringSession(sessionString);
    
    console.log('\n📱 Connecting to Telegram...');
    console.log(`API ID: ${apiId}`);
    console.log(`App Title: ${appTitle}\n`);
    
    const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
        appTitle: appTitle
    });
    
    try {
        await client.start({
            phoneNumber: async () => {
                return await input.text('📞 Enter your phone number (with country code): ');
            },
            password: async () => {
                return await input.text('🔒 Enter your 2FA password (if enabled): ');
            },
            phoneCode: async () => {
                return await input.text('💬 Enter the code sent to your phone: ');
            },
            onError: (err) => {
                console.error('❌ Error:', err.message);
            }
        });
        
        console.log('\n✅ Authentication successful!');
        
        // Save session
        const newSessionString = client.session.save();
        await fs.writeFile(SESSION_FILE, newSessionString, 'utf8');
        console.log('💾 Session saved to .session file');
        
        // Update .env file
        await updateEnvFile(newSessionString);
        
        // Get user info
        const me = await client.getMe();
        console.log('\n👤 Authenticated as:');
        console.log(`   Name: ${me.firstName} ${me.lastName || ''}`);
        console.log(`   Username: @${me.username || 'N/A'}`);
        console.log(`   Phone: ${me.phone}`);
        console.log(`   ID: ${me.id}`);
        
        // Test channel access
        console.log('\n🔍 Testing channel access...');
        await testChannelAccess(client);
        
        console.log('\n✅ Setup complete! Bot can now run autonomously.');
        console.log('📌 Session will remain valid until you log out.');
        
    } catch (error) {
        console.error('\n❌ Authentication failed:', error.message);
        process.exit(1);
    } finally {
        await client.disconnect();
    }
}

/**
 * Update .env file with session
 */
async function updateEnvFile(sessionString) {
    try {
        let envContent = '';
        try {
            envContent = await fs.readFile(ENV_FILE, 'utf8');
        } catch {
            // Create new .env if doesn't exist
        }
        
        // Update or add session
        const sessionLine = `TELEGRAM_SESSION=${sessionString}`;
        
        if (envContent.includes('TELEGRAM_SESSION=')) {
            envContent = envContent.replace(/TELEGRAM_SESSION=.*$/m, sessionLine);
        } else {
            envContent += `\n${sessionLine}`;
        }
        
        // Ensure API credentials are in .env
        if (!envContent.includes('TELEGRAM_API_ID=')) {
            envContent += `\nTELEGRAM_API_ID=${apiId}`;
        }
        if (!envContent.includes('TELEGRAM_API_HASH=')) {
            envContent += `\nTELEGRAM_API_HASH=${apiHash}`;
        }
        
        await fs.writeFile(ENV_FILE, envContent.trim() + '\n', 'utf8');
        console.log('📝 Updated .env file with session');
    } catch (error) {
        console.error('⚠️  Warning: Could not update .env file:', error.message);
    }
}

/**
 * Test access to Zone News channel
 */
async function testChannelAccess(client) {
    try {
        // Zone News Adelaide channel
        const channelUsername = 'ZoneNewsAdl';
        
        const result = await client.invoke({
            _: 'channels.getChannels',
            id: [{
                _: 'inputChannel',
                channelId: channelUsername,
                accessHash: 0
            }]
        }).catch(async () => {
            // Try resolving by username
            return await client.invoke({
                _: 'contacts.resolveUsername',
                username: channelUsername
            });
        });
        
        console.log(`✅ Can access @${channelUsername} channel`);
        
        // Try to get recent messages
        const entity = await client.getEntity(channelUsername);
        const messages = await client.getMessages(entity, { limit: 1 });
        
        if (messages.length > 0) {
            console.log(`📊 Latest message ID: ${messages[0].id}`);
            console.log(`📅 Posted: ${messages[0].date}`);
        }
        
    } catch (error) {
        console.log('⚠️  Could not access channel:', error.message);
        console.log('   Make sure the bot is added as admin to the channel');
    }
}

// Run setup
if (require.main === module) {
    setupAuthentication().catch(console.error);
}

module.exports = { setupAuthentication };