module.exports = {
    apps: [
        {
            name: 'lulini-api',
            script: 'app.js',
            instances: process.env.PM2_INSTANCES || 2,
            exec_mode: 'cluster',
            env: {
                NODE_ENV: 'production',
            },
            // Graceful shutdown
            kill_timeout: 10000,
            listen_timeout: 5000,
            // Restart policy
            max_restarts: 10,
            restart_delay: 1000,
            // Memory limit
            max_memory_restart: '512M',
        },
        {
            name: 'lulini-worker',
            script: 'worker.js',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'production',
            },
            kill_timeout: 10000,
            max_restarts: 10,
            restart_delay: 1000,
            max_memory_restart: '256M',
        },
        {
            name: 'lulini-ride-worker',
            script: 'workers/rideEventWorker.js',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'production',
            },
            kill_timeout: 10000,
            max_restarts: 10,
            restart_delay: 1000,
            max_memory_restart: '256M',
        }
    ]
};
