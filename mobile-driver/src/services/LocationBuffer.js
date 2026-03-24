/**
 * LocationBuffer — Disk-backed location buffer with smart thinning.
 *
 * Survives app kill: stores points in AsyncStorage.
 * On reconnect or ride end, flushes to server in chunks of 50.
 * When buffer exceeds maxSize, uses smart thinning that preserves
 * route endpoints and significant movement points.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBufferKey } from './rideStorage';
import { haversineM } from '../utils/distance';

const MAX_BUFFER_SIZE = 2000;  // ~100 min at 3s intervals
const CHUNK_SIZE = 50;         // max points per REST request

export default class LocationBuffer {
  constructor(rideId) {
    this.rideId = rideId;
    this.key = getBufferKey(rideId);
    this._memoryBuffer = [];   // In-memory hot buffer for fast appends
    this._dirty = false;
  }

  /**
   * Append new location points (fast, in-memory + periodic disk flush).
   * @param {Array<{lat,lng,heading,speed,accuracy,ts}>} points
   */
  append(points) {
    if (!points || points.length === 0) return;
    this._memoryBuffer.push(...points);
    this._dirty = true;

    // Flush to disk every 10 points or if buffer is getting large
    if (this._memoryBuffer.length >= 10 || this._memoryBuffer.length > MAX_BUFFER_SIZE * 0.9) {
      this.flushToDisk();
    }
  }

  /**
   * Persist in-memory buffer to disk (merges with existing disk data).
   */
  async flushToDisk() {
    if (!this._dirty || this._memoryBuffer.length === 0) return;

    try {
      const diskBuffer = await this._readDisk();
      const merged = [...diskBuffer, ...this._memoryBuffer];
      this._memoryBuffer = [];
      this._dirty = false;

      if (merged.length > MAX_BUFFER_SIZE) {
        const thinned = this._thinBuffer(merged, MAX_BUFFER_SIZE);
        await this._writeDisk(thinned);
      } else {
        await this._writeDisk(merged);
      }
    } catch (e) {
      console.warn('[LocationBuffer] Flush to disk failed:', e.message);
      // Keep in memory — will retry on next append
    }
  }

  /**
   * Read all buffered points (memory + disk).
   */
  async readAll() {
    const diskBuffer = await this._readDisk();
    return [...diskBuffer, ...this._memoryBuffer];
  }

  /**
   * Get count of buffered points.
   */
  async count() {
    const disk = await this._readDisk();
    return disk.length + this._memoryBuffer.length;
  }

  /**
   * Flush buffered locations to server in chunks.
   * @param {Function} sendChunk - async (points, chunkMeta) => boolean
   * @returns {{ sent: number, remaining: number }}
   */
  async flushToServer(sendChunk) {
    // Ensure all memory data is on disk first
    await this.flushToDisk();

    const points = await this._readDisk();
    if (points.length === 0) return { sent: 0, remaining: 0 };

    let sentCount = 0;

    for (let i = 0; i < points.length; i += CHUNK_SIZE) {
      const chunk = points.slice(i, i + CHUNK_SIZE);
      const meta = {
        chunkIndex: Math.floor(i / CHUNK_SIZE),
        totalPoints: points.length,
        isLast: i + CHUNK_SIZE >= points.length,
      };

      try {
        const ok = await sendChunk(chunk, meta);
        if (ok) {
          sentCount += chunk.length;
        } else {
          break; // Stop on first failure, remaining chunks stay in buffer
        }
      } catch (e) {
        console.warn('[LocationBuffer] Chunk send failed:', e.message);
        break;
      }
    }

    // Remove sent points from disk
    if (sentCount > 0) {
      const remaining = points.slice(sentCount);
      await this._writeDisk(remaining);
    }

    return { sent: sentCount, remaining: points.length - sentCount };
  }

  /**
   * Clear all buffered data (on ride end after successful flush).
   */
  async clear() {
    this._memoryBuffer = [];
    this._dirty = false;
    try {
      await AsyncStorage.removeItem(this.key);
    } catch (e) {
      // ignore
    }
  }

  // ─── Smart thinning ─────────────────────────────────────────────────────

  /**
   * Reduce buffer to maxSize while preserving route shape.
   * Strategy: keep head/tail, thin middle by distance+time significance.
   */
  _thinBuffer(buffer, maxSize) {
    if (buffer.length <= maxSize) return buffer;

    const keepEnds = Math.floor(maxSize * 0.1);
    const head = buffer.slice(0, keepEnds);
    const tail = buffer.slice(-keepEnds);
    const middle = buffer.slice(keepEnds, -keepEnds);

    if (middle.length === 0) return [...head, ...tail].slice(0, maxSize);

    // Keep points with significant movement (>25m) or time gap (>30s)
    const kept = [middle[0]];
    for (let i = 1; i < middle.length; i++) {
      const prev = kept[kept.length - 1];
      const curr = middle[i];
      const dist = haversineM(prev.lat, prev.lng, curr.lat, curr.lng);
      const timeDiff = curr.ts - prev.ts;

      if (dist > 25 || timeDiff > 30000) {
        kept.push(curr);
      }
    }

    // If still too large, uniformly sample
    let middleResult = kept;
    const totalSize = head.length + kept.length + tail.length;
    if (totalSize > maxSize) {
      const available = maxSize - head.length - tail.length;
      if (available > 0 && kept.length > available) {
        const step = Math.ceil(kept.length / available);
        middleResult = kept.filter((_, i) => i % step === 0);
      }
    }

    return [...head, ...middleResult, ...tail];
  }

  // ─── Disk I/O ───────────────────────────────────────────────────────────

  async _readDisk() {
    try {
      const raw = await AsyncStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  async _writeDisk(buffer) {
    try {
      await AsyncStorage.setItem(this.key, JSON.stringify(buffer));
    } catch (e) {
      console.warn('[LocationBuffer] Write failed:', e.message);
    }
  }
}
