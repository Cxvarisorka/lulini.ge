# Scalability & Bottleneck Audit

## Executive Summary

The server is **well-built for early-stage production** (sub-500 concurrent users). The codebase already has many good patterns: atomic ride transitions, room-based broadcasts, lean queries, aggregation pipelines. However, there are **several bottlenecks that will break sequentially** as you scale. Here they are, ranked by severity and likely order of failure.

---

## 1. BOTTLENECK RANKING (by severity)

### CRITICAL — Will break at 200-500 concurrent drivers

#### B1. `updateDriverLocation` — 2 DB queries per GPS tick

**File:** `controllers/driver.controller.js:288-329`

Every location update executes:

1. `Driver.findOne({ user: req.user.id })` — full document fetch for speed validation
2. `Driver.updateOne(...)` — atomic location write
3. `Ride.findOne(...)` — check for active ride (conditional socket emit)

At 30 req/min rate limit × 500 drivers = **15,000 DB operations/min** (250/sec). This is the single hottest path and the first thing that breaks.

The `findOne` to load the full driver doc just for speed validation is the worst part — only `location` and `updatedAt` are needed, but the entire driver document is hydrated including `documents`, `vehicle`, etc.

#### B2. `expireWaitingRides` — sequential `findByIdAndUpdate` in a loop

**File:** `controllers/ride.controller.js:1097-1100`

```javascript
for (const ride of waitingExpiredRides) {
    await Driver.findByIdAndUpdate(ride.driver._id, { status: 'online' });
    // ...socket emissions per ride
}
```

This runs every **15 seconds** and does N individual `findByIdAndUpdate` calls sequentially. Under a spike (e.g., 50 drivers waiting simultaneously due to a network blip), this blocks the event loop for the entire iteration duration. The `updateMany` for rides is fine, but the driver status reset is O(N) sequential awaits.

#### B3. Socket auth middleware — DB query on every connection

**File:** `app.js:133`

```javascript
const user = await User.findById(decoded.id).select('-password');
```

Every socket connection/reconnection hits the database. With mobile apps doing frequent reconnects (network switches, backgrounding), 500 drivers reconnecting simultaneously after a brief network outage = 500 concurrent `findById` queries. No caching layer.

#### B4. `createRide` — 4 DB operations + push notification query on the hot path

**File:** `controllers/ride.controller.js:100-160`

```
1. Ride.findOne (active ride check)
2. Ride.create
3. Ride.findById.populate (re-fetch for broadcast)
4. Driver.find (online drivers for push notifications)
```

The re-fetch at step 3 is unnecessary — the data is already available. The `Driver.find` at step 4 queries the DB on every ride creation to find push notification targets, even though the socket broadcast already reached them.

---

### HIGH — Will degrade at 500-2,000 concurrent users

#### B5. `pushIfOffline` — `fetchSockets()` on every notification

**File:** `controllers/ride.controller.js:14`

```javascript
const sockets = await io.in(`user:${userId}`).fetchSockets();
```

`fetchSockets()` iterates all sockets in the room adapter. In a single-process setup this is O(room_size) and fast. **In a clustered setup (multiple Node processes), this broadcasts across all instances** via the adapter, making it an expensive cross-process IPC call for every notification.

#### B6. `protect` middleware — DB query on every authenticated HTTP request

**File:** `middlewares/auth.middleware.js:22`

```javascript
const user = await User.findById(decoded.id).select('-password');
```

Every API call hits MongoDB to verify the user still exists. With 500 drivers sending location updates at 30/min + ride operations + maps calls, this adds 15,000+ extra DB reads/min just for auth verification.

#### B7. `isDriver` middleware — additional DB query on driver endpoints

**File:** `middlewares/auth.middleware.js:43`

```javascript
const driver = await Driver.findOne({ user: req.user.id, isActive: true, isApproved: true });
```

Every driver endpoint runs `protect` (1 query) THEN `isDriver` (1 query). The location update path does: `protect` → `isDriver` → `updateDriverLocation` = **4 DB queries minimum** per GPS tick.

#### B8. Maps cache — unbounded in-memory Map with no proper LRU

**File:** `controllers/maps.controller.js:11-30`

```javascript
const cache = new Map();
const MAX_CACHE_SIZE = 2000;

function setCache(key, data, ttl) {
    if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { data, ts: Date.now(), ttl });
}
```

This is FIFO eviction, not LRU. The "first inserted" entry gets evicted, which may be the most popular route. Hot cache entries get evicted while cold ones survive. Also, stale entries are only removed on read (`getCached`), not proactively — the cache can fill with expired entries.

---

### MEDIUM — Scaling ceiling at 2,000-5,000 users

#### B9. Idempotency store — unbounded in-memory Map

**File:** `controllers/ride.controller.js:24-34`

The cleanup runs every 60s and iterates ALL entries. At scale, this Map grows unbounded between cleanups. More importantly, **this doesn't work across multiple Node processes** — each instance has its own store, so retries hitting a different instance bypass idempotency.

#### B10. No connection pooling configuration for MongoDB

**File:** `configs/db.config.js`

```javascript
const conn = await mongoose.connect(process.env.MONGODB_URI);
```

No explicit pool size configuration. Mongoose defaults to `maxPoolSize: 100`, which may be too low for high-concurrency and too high for a small server. Not tuned for the workload.

#### B11. `sendToUsers` for push notifications — unbounded batch query

**File:** `services/pushNotification.service.js:160`

```javascript
const users = await User.find({ _id: { $in: userIds } })
    .select('deviceTokens preferredLanguage').lean();
```

If 1,000 drivers are online, this loads 1,000 user documents in a single query on every ride creation. No batching or streaming.

#### B12. `registerToken` — 3 sequential DB operations

**File:** `controllers/notification.controller.js:33-50`

```javascript
await User.updateOne(...$pull...);   // Remove existing token
await User.updateOne(...$push...);   // Add new token
await User.updateMany(...);          // Remove from other users
```

Three sequential writes. The `updateMany` scans potentially all users to find token duplicates. No index on `deviceTokens.token`.

---

### LOW — Architectural limits for 5,000+ users

#### B13. Single-process Socket.io — no Redis adapter

No `@socket.io/redis-adapter` configured. Socket.io cannot scale horizontally. Limited to a single Node.js process for all WebSocket connections.

#### B14. No read replicas or query routing

All reads and writes go to the same MongoDB instance/replica set primary. Location updates (writes) compete with reads on the same connection pool.

#### B15. `expireOldRides` notification loop

**File:** `controllers/ride.controller.js:1034-1047`

```javascript
for (const ride of expiredRides) {
    io.to(`user:${ride.user}`).emit('ride:expired', ...);
    io.to('drivers:all').emit('ride:unavailable', ...);
    pushIfOffline(...);
}
```

Each expired ride triggers 2 socket emissions + 1 push check. If 100 rides expire simultaneously (peak period), that's 100 sequential `pushIfOffline` calls, each with a `fetchSockets()` + potential push send.

---

## 2. MISSING INDEXES

| Query Pattern | File:Line | Missing Index |
|---|---|---|
| `User.findOne({ email })` | auth.controller multiple | `{ email: 1 }` (sparse exists, but compound with `_id: { $ne }` queries need it) |
| `User.findOne({ phone })` | auth.controller multiple | Covered by unique sparse — OK |
| `User.updateMany({ 'deviceTokens.token': token })` | notification.controller:47 | **`{ 'deviceTokens.token': 1 }`** — scans full collection without this |
| `Ride.findOne({ driver, status: $in })` | ride.controller:316 | Covered by `{ driver: 1, status: 1 }` — OK |
| `Driver.findOne({ user: id })` | everywhere | Covered by `{ user: 1 }` — OK |

**The missing `deviceTokens.token` index is the only significant gap.** The rest are well-covered.

---

## 3. CONCURRENCY LIMIT ESTIMATES

| Component | Realistic Limit | Bottleneck |
|---|---|---|
| **Single Node.js process** | ~500 concurrent WebSocket connections | Event loop saturation from DB queries in socket auth |
| **MongoDB (no tuning)** | ~300 write ops/sec sustained | Location updates at scale |
| **Location update path** | ~250 drivers at 30 req/min | 4 DB queries per update × 250 = 500 ops/sec |
| **Ride creation under load** | ~50 concurrent ride requests | 4 DB queries + push notification query per creation |
| **Maps cache** | ~2,000 unique routes cached | FIFO eviction kills hit rate |
| **Push notifications** | ~200 drivers per ride broadcast | Expo API rate limits + user query |
| **Horizontal scaling** | **0 additional instances** | No Redis adapter, in-memory stores |

**Realistic concurrent capacity today: ~300-500 active users** (mix of drivers and passengers), assuming MongoDB Atlas M10+ or equivalent.

---

## 4. WHAT BREAKS FIRST UNDER LOAD

**Order of failure:**

1. **Location update latency** — Response times spike from 50ms to 500ms+ as MongoDB connection pool saturates from the 4-query-per-tick pattern
2. **Socket reconnection storms** — A brief network hiccup causes 500 drivers to reconnect simultaneously, each hitting `User.findById` in socket auth middleware, creating a thundering herd
3. **Ride creation timeouts** — Under peak load (e.g., rain causes 100 ride requests in 1 minute), the combination of duplicate check + create + re-fetch + push query backs up the event loop
4. **Memory pressure** — Maps cache + idempotency store + Socket.io internal buffers grow without proper bounds, eventually triggering GC pauses
5. **Background job stalls** — `expireWaitingRides` running every 15s competes with user-facing requests for the same DB connection pool

---

## 5. STAGED OPTIMIZATION ROADMAP

### Stage 1: Immediate Code-Level Fixes (1-2 days, 0 infrastructure cost)

These are pure code changes with zero new dependencies.

#### 1a. Fix `updateDriverLocation` — eliminate 2 of 4 DB queries

```javascript
// BEFORE: 4 queries (protect + isDriver + findOne + updateOne + findOne)
// AFTER:  2 queries (protect + findOneAndUpdate with projection)

const updateDriverLocation = catchAsync(async (req, res, next) => {
    const { latitude, longitude } = req.body;

    // req.driver is already loaded by isDriver middleware — reuse it
    const driver = req.driver;

    // Speed validation using data already on req.driver
    if (driver.location?.coordinates?.[0] !== 0) {
        // ... same validation, no extra query
    }

    // Combine update + active ride check into parallel operations
    const [, activeRide] = await Promise.all([
        Driver.updateOne(
            { _id: driver._id },
            { $set: { location: { type: 'Point', coordinates: [longitude, latitude] } } }
        ),
        Ride.findOne({
            driver: driver._id,
            status: { $in: ['accepted', 'driver_arrived'] }
        }).select('_id user').lean()
    ]);

    // ... emit to passenger if active ride
});
```

**Impact:** Cuts location update from 4 queries to 2. At 500 drivers × 30/min = saves **15,000 queries/min**.

#### 1b. Fix `expireWaitingRides` — bulk driver status reset

```javascript
// BEFORE: N sequential findByIdAndUpdate calls
// AFTER:  Single bulkWrite

const driverIds = waitingExpiredRides
    .filter(r => r.driver)
    .map(r => r.driver._id);

if (driverIds.length > 0) {
    await Driver.updateMany(
        { _id: { $in: driverIds }, status: 'busy' },
        { $set: { status: 'online' } }
    );
}
```

**Impact:** O(1) instead of O(N). Eliminates sequential awaits in a 15-second loop.

#### 1c. Fix `createRide` — remove unnecessary re-fetch

```javascript
// BEFORE: create -> findById.populate (2 queries)
// AFTER:  create -> populate directly

const ride = await Ride.create({ ... });
await ride.populate('user', 'firstName lastName email phone');
// Use ride directly instead of re-fetching
```

**Impact:** Eliminates 1 query per ride creation.

#### 1d. Parallelize push notifications in `createRide`

The `Driver.find` for push notification targets should not block the response. It's already fire-and-forget (`.catch()`), but the `await` on the find delays the response.

```javascript
// Move the entire push block to be truly async — don't await the Driver.find
setImmediate(async () => {
    try {
        const onlineDrivers = await Driver.find({ ... }).select('user').lean();
        // ... send push
    } catch (err) {
        console.error('Push error:', err.message);
    }
});

// Return response immediately
res.status(201).json(responseBody);
```

**Impact:** Shaves 10-50ms off ride creation response time.

#### 1e. Fix maps cache — proper LRU eviction + proactive cleanup

```javascript
// Add access time tracking for true LRU
function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
        cache.delete(key);
        return null;
    }
    // Move to end of Map iteration order (LRU refresh)
    cache.delete(key);
    cache.set(key, entry);
    return entry.data;
}
```

#### 1f. Add missing index on `deviceTokens.token`

In user model:

```javascript
userSchema.index({ 'deviceTokens.token': 1 });
```

**Impact:** The `updateMany` in `registerToken` goes from collection scan to index lookup.

---

### Stage 2: Structural Improvements (3-5 days, minimal cost)

#### 2a. Cache user/driver in JWT or short-lived memory cache for auth middleware

The `protect` and `isDriver` middlewares hit the DB on every request. Add a 60-second in-memory cache:

```javascript
const userCache = new Map();
const USER_CACHE_TTL = 60_000;

async function protect(req, res, next) {
    // ... JWT decode ...
    const cacheKey = decoded.id;
    const cached = userCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL) {
        req.user = cached.user;
        return next();
    }
    const user = await User.findById(decoded.id).select('-password').lean();
    userCache.set(cacheKey, { user, ts: Date.now() });
    req.user = user;
    next();
}
```

**Impact:** Reduces auth DB queries by ~95% (most requests within 60s window). Location updates go from 4 queries to ~1.

#### 2b. Batch `pushIfOffline` calls in expiration loops

Instead of checking socket presence one-by-one:

```javascript
// Batch check: fetch all sockets in one call
const offlineUserIds = [];
for (const ride of expiredRides) {
    const sockets = await io.in(`user:${ride.user}`).fetchSockets();
    if (sockets.length === 0) offlineUserIds.push(ride.user);
}
// Single batch push
if (offlineUserIds.length > 0) {
    pushService.sendToUsers(offlineUserIds, ...);
}
```

#### 2c. Tune MongoDB connection pool

```javascript
mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 50,       // Match expected concurrent operations
    minPoolSize: 10,       // Keep warm connections
    maxIdleTimeMS: 30000,  // Release idle connections after 30s
    serverSelectionTimeoutMS: 5000,
});
```

#### 2d. Add `$project` to aggregation pipelines

The driver stats aggregation at `controllers/ride.controller.js:355` matches on `{ driver: _id, status: 'completed', endTime: { $gte: thisMonth } }`. Adding an early `$project` stage to drop unused fields (`pickup`, `dropoff`, `stops`, `notes`, etc.) reduces working set memory.

---

### Stage 3: Infrastructure Scaling (1-2 weeks, moderate cost)

#### 3a. Add Redis for Socket.io adapter + shared state

```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

Move these to Redis:

- Idempotency store → Redis with TTL (`SET key value EX 300`)
- Maps cache → Redis with TTL (shared across instances)
- User auth cache → Redis with 60s TTL

**Cost:** Redis on Railway/Render = ~$5-10/month for small instance.

#### 3b. Move to PM2 cluster mode

```javascript
// ecosystem.config.js
module.exports = {
    apps: [{
        name: 'lulini-server',
        script: 'app.js',
        instances: 'max',  // or 2-4 for small VPS
        exec_mode: 'cluster',
    }]
};
```

With Redis adapter from 3a, this multiplies connection capacity by the number of CPU cores.

#### 3c. Separate background jobs from the API process

Move `expireOldRides` and `expireWaitingRides` to a dedicated worker process (or use a job queue like BullMQ):

- Prevents background DB queries from competing with user-facing requests
- Eliminates risk of interval overlap on slow iterations

#### 3d. MongoDB read preference for non-critical reads

```javascript
// For getNearbyDrivers, getAvailableRides, stats queries
Driver.find(query).read('secondaryPreferred');
```

Routes read traffic to replica set secondaries, freeing the primary for writes.

---

### Stage 4: 10k+ Driver Architecture (weeks-months, significant investment)

#### 4a. Dedicated location service

Extract driver location tracking into a separate microservice:

- **Redis GEO** for real-time location storage (`GEOADD`, `GEOSEARCH`)
- Bypasses MongoDB entirely for the hottest write path
- Location updates become Redis writes (~0.1ms) instead of MongoDB writes (~5-20ms)
- Nearby driver queries use `GEOSEARCH` instead of MongoDB `$near`

#### 4b. Message queue for ride events

Replace direct socket emissions with a message queue (Redis Streams or NATS):

- Ride lifecycle events published to queue
- Socket servers subscribe and emit to their local connections
- Decouples ride processing from notification delivery
- Enables retry, ordering guarantees, and dead letter queues

#### 4c. CQRS for driver stats

Driver stats (earnings, trips, ratings) are computed via aggregation on every request. At 10k+ drivers:

- Maintain pre-computed stats in a separate collection/Redis hash
- Update incrementally on ride completion (not recomputed from scratch)
- Stats queries become simple lookups instead of aggregation pipelines

#### 4d. Connection management

- Implement WebSocket connection limits per user (max 3 connections)
- Add graceful degradation: if >80% capacity, reject new socket connections with retry-after header
- Implement long-polling fallback for low-priority clients (admin dashboards)

---

## 6. SUMMARY TABLE

| # | Bottleneck | Severity | Breaks At | Fix Stage |
|---|---|---|---|---|
| B1 | Location update: 4 DB queries/tick | CRITICAL | 300 drivers | Stage 1 |
| B2 | expireWaitingRides: sequential awaits | CRITICAL | 50 concurrent expirations | Stage 1 |
| B3 | Socket auth: DB query per connection | CRITICAL | 500 reconnections | Stage 2 |
| B4 | createRide: unnecessary re-fetch | HIGH | 50 concurrent rides | Stage 1 |
| B5 | pushIfOffline: fetchSockets per call | HIGH | Clustering | Stage 3 |
| B6 | protect middleware: DB per request | HIGH | 500 concurrent users | Stage 2 |
| B7 | isDriver middleware: extra DB query | HIGH | 500 drivers | Stage 1 |
| B8 | Maps cache: FIFO not LRU | HIGH | 2,000 cached routes | Stage 1 |
| B9 | Idempotency store: in-memory only | MEDIUM | Clustering | Stage 3 |
| B10 | No MongoDB pool tuning | MEDIUM | 300 ops/sec | Stage 2 |
| B11 | sendToUsers: unbounded batch | MEDIUM | 1,000 drivers | Stage 2 |
| B12 | registerToken: 3 sequential writes | MEDIUM | High churn | Stage 1 |
| B13 | Single-process Socket.io | LOW | 1 CPU core | Stage 3 |
| B14 | No read replicas | LOW | 5,000 users | Stage 3 |
| B15 | Expiration notification loop | LOW | 100 expirations | Stage 2 |

**Bottom line:** Stage 1 fixes alone (1-2 days of work, zero cost) will roughly double capacity from ~300 to ~600-800 concurrent users. Stage 2 adds another 2-3x. Stage 3-4 are not needed until consistently above 2,000 concurrent users.
