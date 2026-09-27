/**
 * Telemetry Buffer & Dispatcher
 * Manages fixed-capacity circular buffering and rate-limited batching (5-10 Hz).
 */

import { POSE_CONFIG } from '../core/PoseConfig';
import { createTelemetryPacket } from './TelemetryTypes';

export class TelemetryBuffer {
  constructor(config = POSE_CONFIG.telemetry) {
    this.config = config;
    this.capacity = config.bufferCapacity || 60;
    this.emitIntervalMs = 1000 / (config.emitRateHz || 10);
    this.buffer = [];
    this.lastEmitTime = 0;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Pushes a new snapshot, formatting into a validated compact telemetry packet
   * Dispatches to listeners if throttling window has elapsed
   */
  push(snapshot) {
    const packet = createTelemetryPacket(snapshot);

    this.buffer.push(packet);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }

    const now = performance.now();
    if (now - this.lastEmitTime >= this.emitIntervalMs) {
      this.lastEmitTime = now;
      this.notify(packet);
    }

    return packet;
  }

  notify(packet) {
    this.listeners.forEach((listener) => {
      try {
        listener(packet);
      } catch (err) {
        console.warn("Error in telemetry listener:", err);
      }
    });
  }

  /**
   * Drains all buffered packets
   */
  flush() {
    const items = [...this.buffer];
    this.buffer = [];
    return items;
  }

  getLatest() {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  clear() {
    this.buffer = [];
  }
}
