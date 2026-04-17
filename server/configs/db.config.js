const mongoose = require('mongoose');
const dns = require('dns/promises');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Legacy unique indexes that were dropped from the Mongoose schemas but may
// still be present on an existing database. We drop them on startup so the
// server self-heals without requiring a manual `db.users.dropIndex` step.
// Safe to run repeatedly: missing indexes are silently ignored.
const STALE_INDEXES_TO_DROP = [
    { collection: 'users', index: 'phone_1' },
];

const dropStaleIndexes = async () => {
    for (const { collection, index } of STALE_INDEXES_TO_DROP) {
        try {
            await mongoose.connection.db.collection(collection).dropIndex(index);
            console.log(`Dropped stale index ${collection}.${index}`);
        } catch (err) {
            // IndexNotFound (27) / NamespaceNotFound (26) → already clean, ignore
            if (err && (err.code === 27 || err.code === 26)) continue;
            console.warn(`Failed to drop stale index ${collection}.${index}:`, err.message);
        }
    }
};

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            maxPoolSize: 50,              // Right-sized for ~500 concurrent users per process
            minPoolSize: 10,              // Keep warm connections to avoid cold-start latency
            maxIdleTimeMS: 30000,         // Release idle connections after 30s
            serverSelectionTimeoutMS: 5000, // Fail fast if DB unreachable
            socketTimeoutMS: 45000,        // Kill stale sockets
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        await dropStaleIndexes();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

module.exports = connectDB;
