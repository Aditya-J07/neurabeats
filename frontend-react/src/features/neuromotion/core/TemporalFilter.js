/**
 * Temporal Filtering for Pose Landmarks
 * Implements One Euro Filter (Casiez et al., 2012)
 * Provides jitter reduction at low speeds while eliminating lag during fast movements.
 */

/**
 * First-order low pass filter with variable smoothing factor alpha
 */
export class LowPassFilter {
  constructor(alpha = 0.5) {
    this.alpha = alpha;
    this.y = null;
    this.s = null;
  }

  setAlpha(alpha) {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }

  filter(value, alpha = this.alpha) {
    this.setAlpha(alpha);
    if (this.s === null) {
      this.s = value;
    } else {
      this.s = this.alpha * value + (1.0 - this.alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  lastValue() {
    return this.s;
  }

  reset() {
    this.y = null;
    this.s = null;
  }
}

/**
 * 1-Dimensional One Euro Filter
 */
export class OneEuroFilter {
  constructor(freq = 30, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.freq = freq > 0 ? freq : 30;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  computeAlpha(rate, cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  filter(value, timestamp) {
    // If first frame or time discontinuity, initialize filter state
    if (this.lastTime === null || timestamp === undefined) {
      this.lastTime = timestamp || 0;
      this.xFilter.reset();
      this.dxFilter.reset();
      return this.xFilter.filter(value, 1.0);
    }

    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // Guard against zero or reverse dt
    const rate = dt > 0.0001 ? 1.0 / dt : this.freq;

    // Estimate derivative (rate of change)
    const prevX = this.xFilter.lastValue();
    const dx = prevX !== null && dt > 0.0001 ? (value - prevX) * rate : 0;
    const edx = this.dxFilter.filter(dx, this.computeAlpha(rate, this.dCutoff));

    // Dynamic cutoff frequency: increases with velocity to reduce lag
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter position with dynamic alpha
    return this.xFilter.filter(value, this.computeAlpha(rate, cutoff));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

/**
 * Multidimensional Pose Landmark Filter
 * Manages 33 independent 3D (x, y, z) One Euro Filters.
 */
export class PoseLandmarkFilter {
  constructor(config = {}) {
    this.minCutoff = config.minCutoff ?? 1.0;
    this.beta = config.beta ?? 0.007;
    this.dCutoff = config.dCutoff ?? 1.0;
    this.filters = new Map();
  }

  getOrCreateFilters(index) {
    if (!this.filters.has(index)) {
      this.filters.set(index, {
        x: new OneEuroFilter(30, this.minCutoff, this.beta, this.dCutoff),
        y: new OneEuroFilter(30, this.minCutoff, this.beta, this.dCutoff),
        z: new OneEuroFilter(30, this.minCutoff, this.beta, this.dCutoff),
      });
    }
    return this.filters.get(index);
  }

  /**
   * Filters an array of landmarks
   * @param {Array<{x: number, y: number, z: number, visibility?: number, presence?: number}>} landmarks
   * @param {number} timestamp - timestamp in seconds
   * @returns {Array<{x: number, y: number, z: number, visibility: number, presence: number}>}
   */
  filterLandmarks(landmarks, timestamp) {
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
      return [];
    }

    return landmarks.map((lm, idx) => {
      const f = this.getOrCreateFilters(idx);
      return {
        x: f.x.filter(lm.x, timestamp),
        y: f.y.filter(lm.y, timestamp),
        z: f.z.filter(lm.z, timestamp),
        visibility: lm.visibility ?? 1.0,
        presence: lm.presence ?? 1.0,
      };
    });
  }

  reset() {
    this.filters.forEach(f => {
      f.x.reset();
      f.y.reset();
      f.z.reset();
    });
  }
}
