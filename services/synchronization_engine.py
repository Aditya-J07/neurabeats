"""
Nuro-Beats Authoritative Synchronization Engine (v2.0)
services/synchronization_engine.py

Real, deterministic movement-to-rhythm synchronization accuracy system based ONLY on:
1. Actual detected pose / movement events with verified timestamps
2. Actual beat timestamps from the rhythm audio engine
3. Rigorous 1-to-1 movement-to-beat matching
4. Adaptive rhythm-relative timing tolerance windows
5. Confidence-weighted timing scores & movement coverage factors

STRICT RULES:
- Zero random, fixed, or default accuracy fallbacks (no 85%, no 100%, no previous score).
- No movement = No accuracy (accuracy = null, measurement_status = "INSUFFICIENT_DATA").
- Left=0 & Right=0 -> symmetry = null.
- Target BPM is NEVER used as detected cadence. Cadence is derived strictly from real step timestamps.
- All metrics are 100% reproducible from timestamp arrays.
"""

import math
import statistics
import logging
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger("SynchronizationEngine")


class SynchronizationEngine:
    # Configurable engineering thresholds (non-clinical)
    MIN_VALID_MOVEMENT_EVENTS: int = 3
    MIN_POSE_COVERAGE: float = 0.30
    MIN_POSE_CONFIDENCE: float = 0.35
    MIN_EVENT_CONFIDENCE: float = 0.40
    MAX_ABSOLUTE_TOLERANCE_MS: float = 250.0
    TOLERANCE_BEAT_RATIO: float = 0.25

    @classmethod
    def evaluate_session(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main authoritative evaluation entry point.
        Takes raw session completion payload and computes the canonical metric object.
        """
        if not isinstance(data, dict):
            return cls._insufficient_data_result("Invalid session payload format (expected dictionary).")

        # 1. Extract and validate input data
        target_bpm = cls._sanitize_float(data.get("target_bpm") or data.get("final_bpm") or data.get("initial_bpm"), default=60.0)
        valid_pose_frames = cls._sanitize_int(data.get("valid_pose_frames"), default=0)
        total_pose_frames = cls._sanitize_int(data.get("total_pose_frames"), default=0)
        pose_confidence = cls._sanitize_float(data.get("pose_confidence"), default=0.0)

        raw_movement_events = data.get("movement_events")
        if not isinstance(raw_movement_events, list):
            # Also check nested metrics_data
            metrics_dict = data.get("metrics_data")
            if isinstance(metrics_dict, dict) and isinstance(metrics_dict.get("movement_events"), list):
                raw_movement_events = metrics_dict.get("movement_events")
            else:
                raw_movement_events = []

        raw_beat_timestamps = data.get("beat_timestamps_ms") or data.get("beat_timestamps")
        if not isinstance(raw_beat_timestamps, list):
            metrics_dict = data.get("metrics_data")
            if isinstance(metrics_dict, dict) and isinstance(metrics_dict.get("beat_timestamps_ms"), list):
                raw_beat_timestamps = metrics_dict.get("beat_timestamps_ms")
            else:
                raw_beat_timestamps = []

        # Convert beat timestamps to float milliseconds
        beat_timestamps_ms = cls._normalize_beat_timestamps(raw_beat_timestamps)

        # 2. Step 1: Validate Pose Data
        pose_coverage = (valid_pose_frames / total_pose_frames) if total_pose_frames > 0 else 0.0
        pose_detected = total_pose_frames > 0 and valid_pose_frames > 0

        # If camera frames were processed, check coverage and confidence
        if total_pose_frames > 0:
            if pose_coverage < cls.MIN_POSE_COVERAGE or pose_confidence < cls.MIN_POSE_CONFIDENCE:
                logger.info(f"Insufficient pose data: coverage={pose_coverage:.2f}, conf={pose_confidence:.2f}")
                return cls._insufficient_data_result(
                    reason="Pose tracking coverage or confidence was too low for reliable movement analysis.",
                    pose_detected=pose_detected,
                    pose_coverage=round(pose_coverage, 3)
                )

        # 3. Step 2: Validate & Filter Movement Events
        session_duration_s = cls._sanitize_float(data.get("duration"), default=0.0)
        max_timestamp_ms = (session_duration_s * 1000.0 + 5000.0) if session_duration_s > 0 else None

        valid_events, left_count, right_count = cls._filter_movement_events(
            raw_movement_events,
            min_confidence=cls.MIN_EVENT_CONFIDENCE,
            max_timestamp_ms=max_timestamp_ms
        )

        verified_steps = len(valid_events)
        fallback_left = cls._sanitize_int(data.get("left_steps"), default=0)
        fallback_right = cls._sanitize_int(data.get("right_steps"), default=0)
        effective_left = max(left_count, fallback_left)
        effective_right = max(right_count, fallback_right)

        # MANDATORY RULE 3: NO MOVEMENT = NO ACCURACY
        if verified_steps < cls.MIN_VALID_MOVEMENT_EVENTS:
            logger.info(f"Insufficient movement events: {verified_steps} < {cls.MIN_VALID_MOVEMENT_EVENTS}")
            return cls._insufficient_data_result(
                reason=f"Fewer than {cls.MIN_VALID_MOVEMENT_EVENTS} valid movement events detected.",
                pose_detected=pose_detected,
                pose_coverage=round(pose_coverage, 3) if total_pose_frames > 0 else None,
                movement_event_count=verified_steps,
                verified_steps=verified_steps,
                left_steps=effective_left,
                right_steps=effective_right
            )

        # 4. Step 3: Validate Beat Events
        if len(beat_timestamps_ms) < 2:
            logger.info(f"Insufficient beat timestamps provided: {len(beat_timestamps_ms)}")
            # If movements exist but no beats were recorded, we can compute cadence & symmetry but NOT sync accuracy
            cadence = cls._calculate_cadence([ev["timestamp_ms"] for ev in valid_events])
            symmetry = cls._calculate_symmetry(effective_left, effective_right)
            return {
                "measurement_status": "PARTIAL",
                "pose_detected": pose_detected,
                "pose_coverage": round(pose_coverage, 3) if total_pose_frames > 0 else None,
                "movement_event_count": verified_steps,
                "verified_steps": verified_steps,
                "left_steps": effective_left,
                "right_steps": effective_right,
                "cadence": cadence,
                "timing_error_mean_ms": None,
                "timing_error_std_ms": None,
                "timing_score": None,
                "movement_coverage": None,
                "synchronization_accuracy": None,
                "symmetry": symmetry,
                "message": "Beat timestamps unavailable for movement synchronization matching."
            }

        # 5. Step 4 & 5: Match Movements to Beats with Adaptive Tolerance
        beat_interval_ms = cls._calculate_beat_interval(beat_timestamps_ms, target_bpm)
        tolerance_ms = min(beat_interval_ms * cls.TOLERANCE_BEAT_RATIO, cls.MAX_ABSOLUTE_TOLERANCE_MS)

        matched_errors, timing_scores = cls._match_movement_to_beats_1to1(
            valid_events,
            beat_timestamps_ms,
            tolerance_ms
        )

        if not matched_errors:
            return cls._insufficient_data_result(
                reason="No movements could be matched to beat timestamps.",
                pose_detected=pose_detected,
                pose_coverage=round(pose_coverage, 3) if total_pose_frames > 0 else None,
                movement_event_count=verified_steps,
                verified_steps=verified_steps,
                left_steps=effective_left,
                right_steps=effective_right
            )

        # 6. Step 6 & 7: Calculate Timing Error Stats & Weighted Timing Score
        timing_error_mean_ms = round(statistics.mean(matched_errors), 1)
        timing_error_std_ms = round(statistics.stdev(matched_errors), 1) if len(matched_errors) > 1 else 0.0

        # Confidence-weighted timing score
        total_weight = sum(ev.get("confidence", 1.0) for ev in valid_events[:len(timing_scores)])
        if total_weight > 0:
            weighted_score_sum = sum(score * ev.get("confidence", 1.0) for score, ev in zip(timing_scores, valid_events))
            timing_score = weighted_score_sum / total_weight
        else:
            timing_score = statistics.mean(timing_scores)

        # 7. Step 8 & 9: Movement Coverage & Final Synchronization Accuracy
        expected_events = len(beat_timestamps_ms)
        matched_count = len(timing_scores)
        movement_coverage = min(1.0, matched_count / max(1, expected_events))

        # Configurable engineering formula:
        final_accuracy = round(max(0.0, min(100.0, 100.0 * timing_score * movement_coverage)), 2)

        # 8. Step 17: Independent Symmetry Calculation
        symmetry = cls._calculate_symmetry(effective_left, effective_right)

        # 9. Step 18: Cadence from Real Movement Timestamps
        cadence = cls._calculate_cadence([ev["timestamp_ms"] for ev in valid_events])

        # 10. Step 19: Session Status Classification
        if symmetry is not None and cadence is not None and final_accuracy is not None:
            measurement_status = "VALID"
        else:
            measurement_status = "PARTIAL"

        return {
            "measurement_status": measurement_status,
            "pose_detected": pose_detected,
            "pose_coverage": round(pose_coverage, 3) if total_pose_frames > 0 else 1.0,
            "movement_event_count": verified_steps,
            "verified_steps": verified_steps,
            "left_steps": effective_left,
            "right_steps": effective_right,
            "cadence": cadence,
            "timing_error_mean_ms": timing_error_mean_ms,
            "timing_error_std_ms": timing_error_std_ms,
            "timing_score": round(timing_score, 4),
            "movement_coverage": round(movement_coverage, 4),
            "synchronization_accuracy": final_accuracy,
            "symmetry": symmetry
        }

    # -------------------------------------------------------------------------
    # Helper & Component Algorithms
    # -------------------------------------------------------------------------

    @classmethod
    def _normalize_beat_timestamps(cls, raw_beats: List[Any]) -> List[float]:
        """Converts raw beat timestamps (seconds or ms) into sorted ms floats."""
        beats_ms = []
        float_vals = []
        for b in raw_beats:
            try:
                float_vals.append(float(b))
            except (ValueError, TypeError):
                continue

        # If all values are <= 600.0, they represent seconds (e.g. 1.0, 2.0s for a session)
        is_in_seconds = len(float_vals) > 0 and max(float_vals) <= 600.0

        for val in float_vals:
            if is_in_seconds:
                val = val * 1000.0
            beats_ms.append(val)
        return sorted(beats_ms)

    @classmethod
    def _filter_movement_events(
        cls,
        events: List[Any],
        min_confidence: float = 0.40,
        max_timestamp_ms: Optional[float] = None
    ) -> Tuple[List[Dict[str, Any]], int, int]:
        """Filters movement events by timestamp validity, type, confidence, and boundaries."""
        valid = []
        left_count = 0
        right_count = 0

        valid_types = {"STEP", "TAP", "MOVEMENT", "HEEL_STRIKE_CANDIDATE"}

        for ev in events:
            if not isinstance(ev, dict):
                continue

            if "timestamp_ms" in ev and ev["timestamp_ms"] is not None:
                try:
                    t_val = float(ev["timestamp_ms"])
                except (ValueError, TypeError):
                    continue
            elif "timestamp" in ev and ev["timestamp"] is not None:
                try:
                    t_val = float(ev["timestamp"])
                    if t_val <= 600.0 and max_timestamp_ms is not None and max_timestamp_ms > 10000.0:
                        t_val = t_val * 1000.0
                except (ValueError, TypeError):
                    continue
            else:
                continue

            if t_val < 0:
                continue
            if max_timestamp_ms is not None and t_val > max_timestamp_ms:
                continue

            ev_type = str(ev.get("type", "STEP")).upper()
            if ev_type not in valid_types:
                continue

            conf = cls._sanitize_float(ev.get("confidence"), default=1.0)
            if conf < min_confidence:
                continue

            side = str(ev.get("side", "")).upper()
            if side == "LEFT":
                left_count += 1
            elif side == "RIGHT":
                right_count += 1

            valid.append({
                "timestamp_ms": t_val,
                "type": ev_type,
                "side": side,
                "confidence": conf
            })

        # Sort chronologically
        valid.sort(key=lambda x: x["timestamp_ms"])
        return valid, left_count, right_count

    @classmethod
    def _calculate_beat_interval(cls, beat_timestamps_ms: List[float], fallback_bpm: float = 60.0) -> float:
        """Calculates median interval between consecutive beats."""
        if len(beat_timestamps_ms) >= 2:
            diffs = [
                beat_timestamps_ms[i] - beat_timestamps_ms[i - 1]
                for i in range(1, len(beat_timestamps_ms))
                if beat_timestamps_ms[i] > beat_timestamps_ms[i - 1]
            ]
            if diffs:
                return statistics.median(diffs)
        safe_bpm = max(30.0, min(240.0, fallback_bpm))
        return 60000.0 / safe_bpm

    @classmethod
    def _match_movement_to_beats_1to1(
        cls,
        movement_events: List[Dict[str, Any]],
        beat_timestamps_ms: List[float],
        tolerance_ms: float
    ) -> Tuple[List[float], List[float]]:
        """
        One-to-one matching strategy for gait/movement events.
        Matches each movement to its closest available beat timestamp without reusing beats.
        Returns:
            matched_absolute_errors: list of abs(movement_t - beat_t) in ms
            event_scores: list of max(0, 1 - abs_error / tolerance_ms)
        """
        available_beats = list(beat_timestamps_ms)
        matched_errors = []
        event_scores = []

        for ev in movement_events:
            if not available_beats:
                break
            m_time = ev["timestamp_ms"]

            # Find nearest available beat
            best_idx = -1
            best_diff = float("inf")
            for idx, b_time in enumerate(available_beats):
                diff = abs(m_time - b_time)
                if diff < best_diff:
                    best_diff = diff
                    best_idx = idx

            if best_idx >= 0:
                matched_beat = available_beats.pop(best_idx)
                err_ms = abs(m_time - matched_beat)
                score = max(0.0, 1.0 - (err_ms / max(1.0, tolerance_ms)))

                matched_errors.append(err_ms)
                event_scores.append(score)

        return matched_errors, event_scores

    @classmethod
    def _calculate_symmetry(cls, left_count: int, right_count: int) -> Optional[float]:
        """
        Section 17: Symmetry Calculation.
        Symmetry must be completely independent from synchronization accuracy.
        Never do left=0, right=0 -> 100%.
        Only calculate symmetry when both sides have sufficient observations (> 0).
        """
        if left_count <= 0 or right_count <= 0:
            return None
        min_side = min(left_count, right_count)
        max_side = max(left_count, right_count)
        return round(100.0 * min_side / max_side, 1)

    @classmethod
    def _calculate_cadence(cls, step_timestamps_ms: List[float]) -> Optional[float]:
        """
        Section 18: Actual Cadence Calculation.
        Must come strictly from actual movement timestamps using median interval.
        Never use therapy BPM as cadence.
        """
        if len(step_timestamps_ms) < 2:
            return None
        sorted_ts = sorted(step_timestamps_ms)
        intervals = [
            sorted_ts[i] - sorted_ts[i - 1]
            for i in range(1, len(sorted_ts))
            if sorted_ts[i] > sorted_ts[i - 1]
        ]
        if not intervals:
            return None
        median_interval_ms = statistics.median(intervals)
        if median_interval_ms <= 0:
            return None
        # Cadence in steps per minute (SPM)
        cadence_spm = 60000.0 / median_interval_ms
        return round(cadence_spm, 1)

    @classmethod
    def _insufficient_data_result(
        cls,
        reason: str,
        pose_detected: bool = False,
        pose_coverage: Optional[float] = None,
        movement_event_count: int = 0,
        verified_steps: int = 0,
        left_steps: int = 0,
        right_steps: int = 0
    ) -> Dict[str, Any]:
        """Canonical INSUFFICIENT_DATA metric object (Section 20 & 23)."""
        return {
            "measurement_status": "INSUFFICIENT_DATA",
            "pose_detected": pose_detected,
            "pose_coverage": pose_coverage,
            "movement_event_count": movement_event_count,
            "verified_steps": verified_steps,
            "left_steps": left_steps,
            "right_steps": right_steps,
            "cadence": None,
            "timing_error_mean_ms": None,
            "timing_error_std_ms": None,
            "timing_score": None,
            "movement_coverage": None,
            "synchronization_accuracy": None,
            "symmetry": None,
            "message": reason
        }

    @staticmethod
    def _sanitize_float(val: Any, default: float = 0.0) -> float:
        try:
            if val is None:
                return default
            f = float(val)
            return default if (math.isnan(f) or math.isinf(f)) else f
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _sanitize_int(val: Any, default: int = 0) -> int:
        try:
            if val is None:
                return default
            f = float(val)
            return default if (math.isnan(f) or math.isinf(f)) else int(f)
        except (ValueError, TypeError):
            return default
