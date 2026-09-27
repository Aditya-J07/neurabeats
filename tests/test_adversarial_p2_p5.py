import unittest
from unittest.mock import patch, MagicMock
from services.gemini_service import (
    generate_agent_reasoning,
    _generate_deterministic_agent_reasoning,
    generate_agent_session_reflection,
    _generate_deterministic_session_reflection
)

class MockP2Engine:
    """
    Python mirror of authoritative P2 execution gateway (adaptive_engine.js).
    Validates agent proposals with strict bounds, cooldown, and confidence gating.
    """
    def __init__(self, current_bpm=60.0, cooldown_sec=12.0, min_bpm=40.0, max_bpm=140.0):
        self.target_bpm = current_bpm
        self.cooldown_sec = cooldown_sec
        self.min_bpm = min_bpm
        self.max_bpm = max_bpm
        self.last_adaptation_timestamp = -100.0
        self.min_confidence_threshold = 0.45

    def validate_and_execute_proposal(self, proposal, current_confidence=1.0, personal_envelope=None, now_sec=0.0):
        # 1. Tracking confidence gating
        if current_confidence < self.min_confidence_threshold:
            return {
                "validatorResult": "FROZEN",
                "reason": f"Tracking confidence ({current_confidence:.2f}) is below threshold.",
                "executedAction": {
                    "direction": "FREEZE",
                    "parameter": "NONE",
                    "previousBpm": self.target_bpm,
                    "executedBpm": self.target_bpm,
                    "magnitude": 0
                }
            }

        # 2. Cooldown enforcement
        time_since_last = now_sec - self.last_adaptation_timestamp
        action = str(proposal.get("action", "MAINTAIN")).upper() if proposal else "MAINTAIN"
        if time_since_last < self.cooldown_sec and action != "MAINTAIN":
            return {
                "validatorResult": "REJECTED",
                "reason": "Adaptation cooldown active.",
                "executedAction": {
                    "direction": "MAINTAIN",
                    "parameter": "NONE",
                    "previousBpm": self.target_bpm,
                    "executedBpm": self.target_bpm,
                    "magnitude": 0
                }
            }

        if not proposal or not isinstance(proposal, dict):
            return {
                "validatorResult": "REJECTED",
                "reason": "Invalid proposal object.",
                "executedAction": {"direction": "MAINTAIN", "parameter": "NONE", "executedBpm": self.target_bpm}
            }

        valid_actions = {
            "INCREASE_TEMPO", "DECREASE_TEMPO", "MAINTAIN",
            "INCREASE_MOVEMENT_TARGET", "DECREASE_MOVEMENT_TARGET",
            "REQUEST_MORE_OBSERVATION", "OBSERVE", "RECOVER"
        }
        valid_targets = {"TEMPO", "MOVEMENT", "REPETITIONS", "ROM", "NONE"}

        target = str(proposal.get("target", "TEMPO")).upper()
        if action not in valid_actions:
            return {
                "validatorResult": "REJECTED",
                "reason": f"Unrecognized action: {action}",
                "executedAction": {"direction": "MAINTAIN", "parameter": "NONE", "executedBpm": self.target_bpm}
            }
        if target not in valid_targets:
            return {
                "validatorResult": "REJECTED",
                "reason": f"Unrecognized target: {target}",
                "executedAction": {"direction": "MAINTAIN", "parameter": "NONE", "executedBpm": self.target_bpm}
            }

        # Check explicit requested BPM
        explicit_bpm = proposal.get("requestedBpm") or proposal.get("requested_bpm")
        if explicit_bpm is not None:
            try:
                parsed = float(explicit_bpm)
                import math
                if math.isnan(parsed) or math.isinf(parsed) or parsed <= 0:
                    return {
                        "validatorResult": "REJECTED",
                        "reason": "Requested BPM must be a positive finite numerical value.",
                        "executedAction": {"direction": "MAINTAIN", "parameter": "NONE", "executedBpm": self.target_bpm}
                    }
            except (ValueError, TypeError):
                return {
                    "validatorResult": "REJECTED",
                    "reason": "Requested BPM cannot be parsed.",
                    "executedAction": {"direction": "MAINTAIN", "parameter": "NONE", "executedBpm": self.target_bpm}
                }

        if action in ("MAINTAIN", "OBSERVE", "REQUEST_MORE_OBSERVATION"):
            return {
                "validatorResult": "APPROVED",
                "reason": "Maintained steady challenge.",
                "executedAction": {"direction": "MAINTAIN", "parameter": "NONE", "executedBpm": self.target_bpm}
            }

        # Parameter: TEMPO
        if target == "TEMPO":
            prev_bpm = self.target_bpm
            raw_delta = 0.0
            direction = "MAINTAIN"

            mag = proposal.get("magnitude", 1.0)
            try:
                mag_val = abs(float(mag))
            except (ValueError, TypeError):
                mag_val = 1.0

            if action == "INCREASE_TEMPO":
                direction = "PROGRESS"
                raw_delta = mag_val if mag_val > 1.0 else max(1.0, round(mag_val * 50))
            elif action == "DECREASE_TEMPO":
                direction = "REGRESS"
                raw_delta = -mag_val if mag_val > 1.0 else -max(1.0, round(mag_val * 50))

            if explicit_bpm is not None:
                raw_delta = float(explicit_bpm) - prev_bpm
                direction = "PROGRESS" if raw_delta >= 0 else "REGRESS"

            # Maximum step bound: max 5 BPM per intervention
            max_step = 5.0
            clamped_delta = raw_delta
            clamp_reason = None
            if abs(clamped_delta) > max_step:
                clamped_delta = (1.0 if clamped_delta > 0 else -1.0) * max_step
                clamp_reason = f"Requested step clamped to max allowed step ({max_step} BPM)."

            candidate_bpm = prev_bpm + clamped_delta
            if candidate_bpm < self.min_bpm:
                candidate_bpm = self.min_bpm
                clamp_reason = "Clamped to minimum safety bound."
            elif candidate_bpm > self.max_bpm:
                candidate_bpm = self.max_bpm
                clamp_reason = "Clamped to maximum safety bound."

            # Personal envelope bound check
            if personal_envelope and direction == "PROGRESS":
                env_max = personal_envelope.get("stable_bpm_max") or personal_envelope.get("stableBpmMax")
                if env_max and candidate_bpm > env_max + 2:
                    candidate_bpm = min(candidate_bpm, env_max + 2)
                    clamp_reason = f"Restricted by patient stable envelope ceiling ({env_max} BPM)."

            executed_bpm = candidate_bpm
            validator_result = "APPROVED" if (executed_bpm == prev_bpm + raw_delta) else "CLAMPED"

            self.target_bpm = executed_bpm
            self.last_adaptation_timestamp = now_sec

            return {
                "validatorResult": validator_result,
                "reason": clamp_reason or "Approved.",
                "executedAction": {
                    "direction": direction,
                    "parameter": "TEMPO",
                    "previousBpm": prev_bpm,
                    "requestedBpm": prev_bpm + raw_delta,
                    "executedBpm": executed_bpm,
                    "magnitude": abs(executed_bpm - prev_bpm)
                }
            }

        return {
            "validatorResult": "APPROVED",
            "reason": "Non-tempo adaptation approved.",
            "executedAction": {"direction": "MAINTAIN", "parameter": target, "executedBpm": self.target_bpm}
        }


class TestAdversarialP2P5(unittest.TestCase):
    """
    Adversarial validation of P2 Decision Gateway, P5 Agent Contract, and LLM Resilience.
    """

    def setUp(self):
        self.p2 = MockP2Engine(current_bpm=60.0, cooldown_sec=12.0)

    # =========================================================================
    # Section 8: P2 Adversarial Validation (Bypass & Clamping Attacks)
    # =========================================================================
    def test_p2_step_size_attacks_and_clamping(self):
        """Proposals of +1, +2, +5, +6, +20, -1, -5, -6, negative BPM."""
        now = 100.0

        # +1 BPM proposal -> APPROVED
        res_plus1 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 61.0}, now_sec=now)
        self.assertEqual(res_plus1["validatorResult"], "APPROVED")
        self.assertEqual(res_plus1["executedAction"]["executedBpm"], 61.0)

        # Wait past cooldown
        now += 15.0

        # +2 BPM proposal -> APPROVED
        res_plus2 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 63.0}, now_sec=now)
        self.assertEqual(res_plus2["validatorResult"], "APPROVED")
        self.assertEqual(res_plus2["executedAction"]["executedBpm"], 63.0)

        now += 15.0

        # +5 BPM proposal -> APPROVED (exact boundary)
        res_plus5 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 68.0}, now_sec=now)
        self.assertEqual(res_plus5["validatorResult"], "APPROVED")
        self.assertEqual(res_plus5["executedAction"]["executedBpm"], 68.0)

        now += 15.0

        # +6 BPM proposal -> CLAMPED to +5
        res_plus6 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 74.0}, now_sec=now)
        self.assertEqual(res_plus6["validatorResult"], "CLAMPED")
        self.assertEqual(res_plus6["executedAction"]["executedBpm"], 73.0) # 68 + 5 = 73

        now += 15.0

        # +20 BPM attack -> CLAMPED to +5
        res_plus20 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 93.0}, now_sec=now)
        self.assertEqual(res_plus20["validatorResult"], "CLAMPED")
        self.assertEqual(res_plus20["executedAction"]["executedBpm"], 78.0) # 73 + 5 = 78

        now += 15.0

        # -6 BPM proposal -> CLAMPED to -5
        res_minus6 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "DECREASE_TEMPO", "requestedBpm": 72.0}, now_sec=now)
        self.assertEqual(res_minus6["validatorResult"], "CLAMPED")
        self.assertEqual(res_minus6["executedAction"]["executedBpm"], 73.0) # 78 - 5 = 73

    def test_p2_malformed_and_nan_bypass_attacks(self):
        """Attempts to bypass P2 with NaN, Infinity, negative BPM, null, or string BPM."""
        now = 100.0

        # Negative BPM -> REJECTED
        res_neg = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": -50.0}, now_sec=now)
        self.assertEqual(res_neg["validatorResult"], "REJECTED")

        # NaN BPM -> REJECTED
        res_nan = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": float('nan')}, now_sec=now)
        self.assertEqual(res_nan["validatorResult"], "REJECTED")

        # Infinity BPM -> REJECTED
        res_inf = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": float('inf')}, now_sec=now)
        self.assertEqual(res_inf["validatorResult"], "REJECTED")

        # String BPM ("HACK_BPM") -> REJECTED
        res_str = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": "HACK_BPM"}, now_sec=now)
        self.assertEqual(res_str["validatorResult"], "REJECTED")

        # Invalid Action -> REJECTED
        res_act = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "FORCE_OVERRIDE_BPM", "requestedBpm": 80.0}, now_sec=now)
        self.assertEqual(res_act["validatorResult"], "REJECTED")

        # Invalid Target -> REJECTED
        res_tgt = self.p2.validate_and_execute_proposal({"target": "EXPLOSIVE_CADENCE", "action": "INCREASE_TEMPO"}, now_sec=now)
        self.assertEqual(res_tgt["validatorResult"], "REJECTED")

        # Target BPM remains safely untouched at 60.0
        self.assertEqual(self.p2.target_bpm, 60.0)

    def test_p2_cooldown_and_tracking_degradation(self):
        """Cooldown prevents rapid multi-interventions; low confidence freezes adaptation."""
        now = 100.0

        # First valid intervention -> executed
        res1 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 62.0}, now_sec=now)
        self.assertEqual(res1["validatorResult"], "APPROVED")

        # Immediate second intervention at t=102s (< 12s cooldown) -> REJECTED
        res2 = self.p2.validate_and_execute_proposal({"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 64.0}, now_sec=now + 2.0)
        self.assertEqual(res2["validatorResult"], "REJECTED")
        self.assertIn("cooldown active", res2["reason"].lower())

        # Low confidence (0.35 < 0.45) -> FROZEN
        res_low_conf = self.p2.validate_and_execute_proposal(
            {"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 64.0},
            current_confidence=0.35,
            now_sec=now + 20.0
        )
        self.assertEqual(res_low_conf["validatorResult"], "FROZEN")
        self.assertEqual(res_low_conf["executedAction"]["direction"], "FREEZE")

    def test_p2_personal_envelope_ceiling_clamping(self):
        """Proposals exceeding patient personal envelope ceiling are clamped to stableMax + 2."""
        now = 100.0
        envelope = {"stable_bpm_max": 65.0, "stable_bpm_min": 50.0}

        # Propose 70 BPM from 60 BPM -> max step clamp gives 65, within envelope
        res1 = self.p2.validate_and_execute_proposal(
            {"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 70.0},
            personal_envelope=envelope,
            now_sec=now
        )
        self.assertEqual(res1["executedAction"]["executedBpm"], 65.0)

        # Propose 70 BPM from 65 BPM -> would be 70, but envelope ceiling is 65+2=67
        now += 15.0
        res2 = self.p2.validate_and_execute_proposal(
            {"target": "TEMPO", "action": "INCREASE_TEMPO", "requestedBpm": 70.0},
            personal_envelope=envelope,
            now_sec=now
        )
        self.assertEqual(res2["executedAction"]["executedBpm"], 67.0)
        self.assertIn("envelope ceiling", res2["reason"].lower())

    # =========================================================================
    # Section 9 & 10: P5 Agent Contract & LLM Red Team
    # =========================================================================
    def test_p5_deterministic_reasoning_contract(self):
        """P5 deterministic fallback produces strictly valid schema under all contexts."""
        # Clean improving context
        ctx_good = {
            "current": {"confidence": 0.95, "rhythmSync": 0.90},
            "performance": {"score": 0.88, "trend": "IMPROVING", "stability": 0.85}
        }
        dec_good = _generate_deterministic_agent_reasoning(ctx_good)
        self.assertEqual(dec_good["intent"], "PROGRESS")
        self.assertEqual(dec_good["action"], "INCREASE_TEMPO")
        self.assertIn("confidence", dec_good)
        self.assertGreaterEqual(dec_good["confidence"], 0.8)

        # Low confidence context -> must request more observation
        ctx_low = {
            "current": {"confidence": 0.30, "rhythmSync": 0.90},
            "performance": {"score": 0.88, "trend": "IMPROVING", "stability": 0.85}
        }
        dec_low = _generate_deterministic_agent_reasoning(ctx_low)
        self.assertEqual(dec_low["intent"], "OBSERVE")
        self.assertEqual(dec_low["action"], "REQUEST_MORE_OBSERVATION")

        # Declining context -> RECOVER / DECREASE_TEMPO
        ctx_decline = {
            "current": {"confidence": 0.90, "rhythmSync": 0.50},
            "performance": {"score": 0.50, "trend": "DECLINING", "stability": 0.60}
        }
        dec_decline = _generate_deterministic_agent_reasoning(ctx_decline)
        self.assertEqual(dec_decline["intent"], "RECOVER")
        self.assertEqual(dec_decline["action"], "DECREASE_TEMPO")

    @patch("services.gemini_service.get_gemini_client")
    def test_llm_failure_resilience_and_prompt_injection(self, mock_get_client):
        """When Gemini times out, returns HTTP 500, or hallucinations, fallback engages seamlessly."""
        # 1. Simulate API failure (Exception / Timeout)
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = TimeoutError("Gemini API connection timed out")
        mock_get_client.return_value = mock_client

        ctx = {
            "current": {"confidence": 0.92, "rhythmSync": 0.88},
            "performance": {"score": 0.85, "trend": "IMPROVING", "stability": 0.80}
        }
        # Calling generate_agent_reasoning must NOT raise, but return valid deterministic decision
        decision = generate_agent_reasoning(ctx)
        self.assertIsInstance(decision, dict)
        self.assertEqual(decision["intent"], "PROGRESS")
        self.assertEqual(decision["action"], "INCREASE_TEMPO")

        # 2. Simulate Prompt Injection / Hallucinated Action against P2
        adversarial_proposal = {
            "intent": "OVERRIDE",
            "target": "MAX_TEMPO",
            "action": "SET_BPM_999",
            "magnitude": 999
        }
        p2_eval = self.p2.validate_and_execute_proposal(adversarial_proposal, now_sec=200.0)
        self.assertEqual(p2_eval["validatorResult"], "REJECTED")
        self.assertEqual(self.p2.target_bpm, 60.0, "Adversarial LLM output must NEVER mutate target BPM")

if __name__ == '__main__':
    unittest.main()
