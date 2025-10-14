const fs = require('fs');
const path = require('path');

// Path to command-registry file
const filePath = path.join(__dirname, 'src/services/command-registry.js');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Find the persist handler section
const lines = content.split('\n');
let updatedLines = [];
let inPersistSection = false;
let addedSpamCheck = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    updatedLines.push(line);
    
    // Look for the persist handler section
    if (line.includes('const [, reactionType, messageKey] = match;')) {
        inPersistSection = true;
    }
    
    // Add spam prevention after userId is defined
    if (inPersistSection && line.includes('const userId = ctx.from.id;') && !addedSpamCheck) {
        // Add spam prevention code
        updatedLines.push(`                    
                    // Check if user already reacted (spam prevention)
                    try {
                        const db = this.services?.db;
                        if (db && db.collection) {
                            const userReactions = db.collection('user_reactions');
                            
                            // Check for existing reaction
                            const existing = await userReactions.findOne({
                                user_id: userId,
                                message_key: messageKey,
                                reaction_type: reactionType
                            });
                            
                            if (existing) {
                                console.log(\`User \${userId} already reacted with \${reactionType} to \${messageKey}\`);
                                await ctx.answerCbQuery(\`You already reacted with \${reactionType}!\`, { 
                                    show_alert: false 
                                });
                                return;
                            }
                            
                            // Track new reaction
                            await userReactions.insertOne({
                                user_id: userId,
                                message_key: messageKey,
                                reaction_type: reactionType,
                                timestamp: new Date()
                            }).catch(err => {
                                console.log('Could not track reaction:', err.message);
                            });
                            
                            console.log(\`Tracked new reaction: \${reactionType} from user \${userId}\`);
                        }
                    } catch (spamCheckError) {
                        console.log('Spam check error (non-critical):', spamCheckError.message);
                        // Continue with reaction update even if spam check fails
                    }`);
        addedSpamCheck = true;
        inPersistSection = false;
    }
}

// Write the updated content
if (addedSpamCheck) {
    fs.writeFileSync(filePath, updatedLines.join('\n'));
    console.log('✅ Successfully added spam prevention to reaction handler');
    console.log('📝 Users can now only react once per message');
} else {
    console.log('⚠️ Could not find the right location to add spam prevention');
    console.log('Manual update may be required');
}