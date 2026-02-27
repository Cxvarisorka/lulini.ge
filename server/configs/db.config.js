const mongoose = require('mongoose');
const dns = require('dns/promises');
dns.setServers(['8.8.8.8', '8.8.4.4']);

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
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

module.exports = connectDB;
