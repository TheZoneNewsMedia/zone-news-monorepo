const axios = require('axios');

async function testRateLimit() {
    const url = 'http://localhost:3001/api/news';
    const requests = [];
    
    console.log('Testing rate limiting with 40 rapid requests...');
    
    // Send 40 requests rapidly (limit is 30 per minute for news endpoints)
    for (let i = 1; i <= 40; i++) {
        requests.push(
            axios.get(url)
                .then(response => ({ 
                    request: i, 
                    status: response.status,
                    rateLimitRemaining: response.headers['x-ratelimit-remaining']
                }))
                .catch(error => ({ 
                    request: i, 
                    status: error.response?.status || 'error',
                    message: error.response?.data?.error || error.message
                }))
        );
    }
    
    const results = await Promise.all(requests);
    
    // Count successful vs rate limited
    const successful = results.filter(r => r.status === 200).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    
    console.log('\nResults:');
    console.log(`✅ Successful requests: ${successful}`);
    console.log(`🚫 Rate limited (429): ${rateLimited}`);
    
    // Show some details
    const limited = results.filter(r => r.status === 429);
    if (limited.length > 0) {
        console.log('\n✅ Rate limiting is working!');
        console.log(`First rate limit hit at request #${limited[0].request}`);
    } else {
        console.log('\n⚠️ Rate limiting may not be working properly');
    }
    
    return results;
}

testRateLimit().catch(console.error);
