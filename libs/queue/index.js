const Bull = require('bull');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const queues = {};

function createQueue(name) {
    if (!queues[name]) {
        queues[name] = new Bull(name, REDIS_URL);
        console.log(`Queue created: ${name}`);
    }
    return queues[name];
}

function getQueue(name) {
    if (!queues[name]) {
        throw new Error(`Queue ${name} not found`);
    }
    return queues[name];
}

async function closeAllQueues() {
    for (const queue of Object.values(queues)) {
        await queue.close();
    }
}

module.exports = { createQueue, getQueue, closeAllQueues };
