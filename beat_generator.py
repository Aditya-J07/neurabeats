"""
NURO-BEATS Multi-Tier Generative Audio Engine
beat_generator.py

Fail-Safe Dual-Engine Therapeutic Audio Generation:
Level 1: Hugging Face Serverless Inference Router (facebook/musicgen-small)
Level 2: Procedural Generative Acoustic Synthesis (wave, struct, math)
Level 3: Web Audio / Tone.js In-Browser Generation

Generates studio-quality 16-bit 44.1kHz WAV therapeutic pacing tracks
with zero external C++ build tool dependencies.
"""

import os
import sys
import math
import wave
import struct
import random
import time
import json
import logging
import re
from typing import Dict, Any, Optional

try:
    import requests
except ImportError:
    requests = None

logger = logging.getLogger("BeatGenerator")


class BeatGenerator:
    """
    Multi-tier therapeutic beat generator with Hugging Face cloud neural inference
    and mathematical procedural acoustic fallback.
    """

    def __init__(self, api_token: Optional[str] = None):
        self.api_token = api_token or os.environ.get("HUGGINGFACE_API_TOKEN", "")
        # Modern Hugging Face serverless router (replaces deprecated api-inference.huggingface.co)
        self.base_url = "https://router.huggingface.co/hf-inference/models"
        self.whoami_url = "https://huggingface.co/api/whoami-v2"
        self.output_dir = os.path.join("static", "audio", "generated")
        os.makedirs(self.output_dir, exist_ok=True)

        self.beat_sounds = {
            'metronome': {
                'description': 'Traditional dual-tone metronome click',
                'tone_type': 'woodblock',
                'frequency': '1120/820 Hz'
            },
            'drum': {
                'description': 'Acoustic kick & snare motor cue',
                'tone_type': 'acoustic_drum',
                'frequency': '48-135 Hz'
            },
            'soft_bell': {
                'description': 'Solfeggio crystal chimes (528Hz / 432Hz)',
                'tone_type': 'solfeggio',
                'frequency': '528 Hz'
            },
            'wooden_block': {
                'description': 'Crisp wooden percussion transient',
                'tone_type': 'woodblock',
                'frequency': '1120 Hz'
            },
            'piano': {
                'description': 'Rhodes & classical piano harmonic chords',
                'tone_type': 'fourier_keys',
                'frequency': 'Cmaj7 / Am'
            }
        }

    def check_connection(self) -> Dict[str, Any]:
        """Check connection and return formatted router status info."""
        res = self.test_connection()
        return {
            "authenticated": res.get("valid", False),
            "endpoint": self.base_url,
            "username": res.get("username"),
            "details": res
        }

    def test_connection(self) -> Dict[str, Any]:
        """Verify Hugging Face API token permissions via whoami endpoint."""
        token = self.api_token or os.environ.get("HUGGINGFACE_API_TOKEN", "")
        if not token:
            return {
                "valid": False,
                "error": "No HUGGINGFACE_API_TOKEN found in environment.",
                "username": None
            }

        if not requests:
            return {
                "valid": False,
                "error": "Python 'requests' library not installed.",
                "username": None
            }

        try:
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(self.whoami_url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "valid": True,
                    "username": data.get("name") or data.get("username", "Authenticated User"),
                    "type": data.get("type", "user"),
                    "status": "connected"
                }
            else:
                return {
                    "valid": False,
                    "error": f"HF Auth failed (HTTP {resp.status_code}): {resp.text[:120]}",
                    "username": None
                }
        except Exception as e:
            return {
                "valid": False,
                "error": f"HF Connection error: {str(e)}",
                "username": None
            }

    # =========================================================================
    # Level 1: Hugging Face Neural Cloud Generation
    # =========================================================================
    def _call_musicgen_api(self, prompt: str, bpm: int, custom_params: Optional[Dict[str, Any]] = None) -> Optional[bytes]:
        """Calls Hugging Face router for neural audio generation with genuine parameter control."""
        try:
            from services.ai_provider import AIProviderManager
            hf_provider = AIProviderManager.get_hf_provider()
            return hf_provider.generate_audio(
                base_prompt=prompt,
                bpm=bpm,
                custom_params=custom_params
            )
        except Exception as e:
            logger.info(f"AI Provider error ({e}). Engaging procedural fallback.")
            return None

    # =========================================================================
    # Level 2: Mathematical Procedural Acoustic Audio Synthesis
    # =========================================================================
    def synthesize_acoustic_wav(
        self,
        sound_type: str = "drum",
        bpm: int = 60,
        bars: int = 4,
        seed: Optional[int] = None
    ) -> str:
        """
        Synthesizes a 16-bit 44.1kHz PCM WAV file using mathematical acoustic modeling.
        Guarantees 100% uptime with zero external dependencies.
        """
        sample_rate = 44100
        sec_per_beat = 60.0 / max(30, min(180, bpm))
        total_beats = bars * 4
        total_duration_sec = total_beats * sec_per_beat
        total_samples = int(sample_rate * total_duration_sec)

        samples = [0.0] * total_samples
        rnd = random.Random(seed if seed is not None else int(time.time() * 1000) % 999999)

        # 1. Acoustic Kick Drum
        # Pitch sweep: f(t) = 48 + 92 * exp(-32t), Amp: 0.85 * exp(-24t)
        def _render_kick(start_sample: int):
            kick_len = int(sample_rate * 0.28)
            for i in range(kick_len):
                idx = start_sample + i
                if idx >= total_samples:
                    break
                t = i / sample_rate
                inst_freq = 48.0 + 92.0 * math.exp(-32.0 * t)
                phase = 2.0 * math.pi * inst_freq * t
                amp = 0.85 * math.exp(-24.0 * t)
                samples[idx] += amp * math.sin(phase)

        # 2. Snare / Rimshot
        # Dual-band shell fundamental (205 Hz) + shaped noise body
        def _render_snare(start_sample: int, soft: bool = False):
            snare_len = int(sample_rate * 0.22)
            gain = 0.40 if soft else 0.65
            for i in range(snare_len):
                idx = start_sample + i
                if idx >= total_samples:
                    break
                t = i / sample_rate
                tone = 0.35 * math.sin(2.0 * math.pi * 205.0 * t)
                noise = 0.65 * (rnd.random() * 2.0 - 1.0)
                amp = gain * math.exp(-28.0 * t)
                samples[idx] += amp * (tone + noise)

        # 3. Dual-Tone Metronome Woodblock
        # 1120 Hz on downbeat (Beat 1), 820 Hz on beats 2, 3, 4
        def _render_woodblock(start_sample: int, is_downbeat: bool):
            freq = 1120.0 if is_downbeat else 820.0
            wb_len = int(sample_rate * 0.08)
            for i in range(wb_len):
                idx = start_sample + i
                if idx >= total_samples:
                    break
                t = i / sample_rate
                amp = 0.70 * math.exp(-65.0 * t)
                samples[idx] += amp * math.sin(2.0 * math.pi * freq * t)

        # 4. Solfeggio Crystal Chimes (432Hz & 528Hz)
        # Multi-harmonic inharmonic partials
        def _render_solfeggio(start_sample: int, f0: float):
            chime_len = int(sample_rate * 1.5)
            for i in range(chime_len):
                idx = start_sample + i
                if idx >= total_samples:
                    break
                t = i / sample_rate
                p1 = 0.50 * math.sin(2.0 * math.pi * f0 * t)
                p2 = 0.25 * math.sin(2.0 * math.pi * (f0 * 2.76) * t)
                p3 = 0.15 * math.sin(2.0 * math.pi * (f0 * 5.40) * t)
                amp = 0.55 * math.exp(-2.8 * t)
                samples[idx] += amp * (p1 + p2 + p3)

        # 5. Rhodes / Electric Piano Chords
        # Warm multi-harmonic keys with smooth acoustic envelope
        def _render_piano_chord(start_sample: int, chord_freqs: list, duration_beats: float = 2.0):
            chord_len = min(int(sample_rate * sec_per_beat * duration_beats), total_samples - start_sample)
            per_note_amp = 0.42 / max(1, len(chord_freqs))
            for f0 in chord_freqs:
                for i in range(chord_len):
                    idx = start_sample + i
                    if idx >= total_samples:
                        break
                    t = i / sample_rate
                    h1 = 0.52 * math.sin(2.0 * math.pi * f0 * t)
                    h2 = 0.26 * math.sin(2.0 * math.pi * (2 * f0) * t)
                    h3 = 0.10 * math.sin(2.0 * math.pi * (3 * f0) * t)
                    amp = per_note_amp * math.exp(-4.2 * t)
                    samples[idx] += amp * (h1 + h2 + h3)

        # 6. Smooth Rhythmic Hi-Hat
        def _render_hihat(start_sample: int, accent: bool = False):
            hihat_len = int(sample_rate * 0.045)
            gain = 0.20 if accent else 0.11
            for i in range(hihat_len):
                idx = start_sample + i
                if idx >= total_samples:
                    break
                t = i / sample_rate
                noise = rnd.random() * 2.0 - 1.0
                amp = gain * math.exp(-75.0 * t)
                samples[idx] += amp * noise

        # 7. Warm Sub & Acoustic Bassline
        # Fundamental sine + subtle 2nd harmonic saturation
        def _render_bass(start_sample: int, freq: float, duration_sec: float = 0.45):
            bass_len = min(int(sample_rate * duration_sec), total_samples - start_sample)
            for i in range(bass_len):
                idx = start_sample + i
                if idx >= total_samples:
                    break
                t = i / sample_rate
                f_wave = 0.76 * math.sin(2.0 * math.pi * freq * t) + 0.24 * math.sin(2.0 * math.pi * (freq * 2.0) * t)
                amp = 0.48 * math.exp(-4.5 * t)
                samples[idx] += amp * f_wave

        # 8. Ambient Harmonic Pad Bed
        def _render_ambient_pad(start_sample: int, chord_freqs: list, duration_sec: float):
            pad_len = min(int(sample_rate * duration_sec), total_samples - start_sample)
            per_note_amp = 0.18 / max(1, len(chord_freqs))
            for f0 in chord_freqs:
                for i in range(pad_len):
                    idx = start_sample + i
                    if idx >= total_samples:
                        break
                    t = i / sample_rate
                    # Gentle chorused twin sines
                    w1 = math.sin(2.0 * math.pi * f0 * t)
                    w2 = math.sin(2.0 * math.pi * (f0 * 1.003) * t)
                    fade_in = min(1.0, t / 0.15)
                    fade_out = math.exp(-1.8 * t)
                    samples[idx] += per_note_amp * 0.5 * (w1 + w2) * fade_in * fade_out

        # Render musical arrangement
        st = sound_type.lower()
        chord_prog = [
            [261.63, 329.63, 392.00, 493.88],  # Cmaj7
            [220.00, 261.63, 329.63, 392.00],  # Am7
            [293.66, 349.23, 440.00, 523.25],  # Dm7
            [196.00, 246.94, 293.66, 349.23],  # G7
        ]
        bass_notes = [65.41, 55.00, 73.42, 49.00]  # C2, A1, D2, G1 roots
        solfeggio_pitches = [528.0, 432.0, 639.0, 528.0]

        for b in range(total_beats):
            beat_sample = int(b * sec_per_beat * sample_rate)
            beat_in_bar = b % 4
            bar_idx = (b // 4) % len(chord_prog)

            if st in ("drum", "percussion"):
                # Full Groovy Rhythm Track: Drums + Bass + Rhodes Harmony
                _render_hihat(beat_sample, accent=(beat_in_bar in (0, 2)))
                half_beat_sample = beat_sample + int(0.5 * sec_per_beat * sample_rate)
                if half_beat_sample < total_samples:
                    _render_hihat(half_beat_sample, accent=False)

                if beat_in_bar == 0:
                    _render_kick(beat_sample)
                    _render_bass(beat_sample, bass_notes[bar_idx], duration_sec=sec_per_beat * 1.4)
                    _render_piano_chord(beat_sample, chord_prog[bar_idx], duration_beats=2.0)
                    _render_ambient_pad(beat_sample, chord_prog[bar_idx][:2], duration_sec=sec_per_beat * 3.8)
                elif beat_in_bar == 1:
                    _render_snare(beat_sample)
                elif beat_in_bar == 2:
                    _render_kick(beat_sample)
                    # Syncopated bass fifth bounce
                    _render_bass(beat_sample, bass_notes[bar_idx] * 1.5, duration_sec=sec_per_beat * 0.9)
                elif beat_in_bar == 3:
                    _render_snare(beat_sample)

            elif st in ("piano", "keys"):
                # Warm Lo-Fi Rhodes Piano with gentle rhythmic backing
                if beat_in_bar == 0:
                    _render_piano_chord(beat_sample, chord_prog[bar_idx], duration_beats=2.2)
                    _render_bass(beat_sample, bass_notes[bar_idx], duration_sec=sec_per_beat * 1.6)
                    _render_kick(beat_sample)
                elif beat_in_bar == 2:
                    # Syncopated chord push
                    _render_piano_chord(beat_sample, chord_prog[bar_idx], duration_beats=1.2)
                    _render_bass(beat_sample, bass_notes[bar_idx] * 1.5, duration_sec=sec_per_beat * 0.8)
                elif beat_in_bar in (1, 3):
                    _render_snare(beat_sample, soft=True)

                _render_hihat(beat_sample, accent=(beat_in_bar in (0, 2)))
                half_beat_sample = beat_sample + int(0.5 * sec_per_beat * sample_rate)
                if half_beat_sample < total_samples:
                    _render_hihat(half_beat_sample, accent=False)

            elif st in ("soft_bell", "chimes", "bell", "ambient"):
                # Solfeggio 528Hz & 432Hz Ambient Healing Soundscape
                if beat_in_bar == 0:
                    pitch = solfeggio_pitches[(b // 4) % len(solfeggio_pitches)]
                    _render_solfeggio(beat_sample, pitch)
                    _render_ambient_pad(beat_sample, [pitch * 0.5, pitch], duration_sec=sec_per_beat * 3.8)
                    _render_bass(beat_sample, 55.0, duration_sec=sec_per_beat * 1.8)
                _render_woodblock(beat_sample, beat_in_bar == 0)

            elif st in ("wooden_block", "speech_rhythm"):
                # Acoustic Woodblock with melodic pulse cues
                _render_woodblock(beat_sample, beat_in_bar == 0)
                if beat_in_bar == 0:
                    _render_bass(beat_sample, 82.4, duration_sec=sec_per_beat * 0.5)

            else:  # metronome
                # Clean Clinical Dual-Tone Metronome
                _render_woodblock(beat_sample, beat_in_bar == 0)

        # Normalize and prevent clipping
        max_val = max(abs(s) for s in samples) if samples else 1.0
        norm_factor = 0.85 / max(max_val, 1e-4) if max_val > 0.85 else 1.0

        ts = int(time.time() * 1000)
        s_id = seed or rnd.randint(100000, 999999)
        filename = f"ai_beat_{st}_{bpm}_s{s_id}_{ts}.wav"
        filepath = os.path.join(self.output_dir, filename)

        # Write 16-bit PCM WAV
        with wave.open(filepath, "w") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            raw_frames = bytearray()
            for s in samples:
                clamped = max(-1.0, min(1.0, s * norm_factor))
                pcm = int(clamped * 32767.0)
                raw_frames.extend(struct.pack("<h", pcm))
            wav_file.writeframes(raw_frames)

        return f"/static/audio/generated/{filename}?v={ts}"

    def generate_beat_detailed(
        self,
        bpm: int = 60,
        sound_type: str = "drum",
        custom_prompt: Optional[str] = None,
        seed: Optional[int] = None,
        prompt: Optional[str] = None,
        duration: Optional[int] = None,
        session_type: Optional[str] = None,
        custom_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Public high-level generation API.
        Attempts Level 1 neural generation, gracefully falling back to Level 2 acoustic synthesis.
        Intelligently extracts BPM and acoustic sound type from user natural language prompt.
        """
        sound_map = {
            "gait_trainer": "drum",
            "upper_limb_motor": "drum",
            "melodic_intonation": "piano",
            "speech_rhythm": "wooden_block",
            "cognitive_rhythm": "soft_bell",
            "rhythmic_walking": "drum"
        }

        resolved_prompt = (prompt or custom_prompt or "").strip()

        # 1. Intelligent BPM extraction from prompt if present
        extracted_bpm = None
        if resolved_prompt:
            m_bpm = re.search(r'(\d{2,3})\s*(?:bpm|beats\s*per\s*minute)\b', resolved_prompt, re.IGNORECASE)
            if not m_bpm:
                m_bpm = re.search(r'\b(?:tempo|bpm|cadence|pace)\s*[:=]?\s*(\d{2,3})\b', resolved_prompt, re.IGNORECASE)
            if m_bpm:
                try:
                    val = int(m_bpm.group(1))
                    if 40 <= val <= 200:
                        extracted_bpm = val
                except (ValueError, TypeError):
                    pass

        # Priority: explicit non-default bpm, then prompt-extracted bpm, then default
        if extracted_bpm is not None and (bpm is None or bpm == 60 or bpm == 100):
            bpm_val = extracted_bpm
        elif bpm is not None:
            bpm_val = max(40, min(180, int(bpm)))
        else:
            bpm_val = extracted_bpm or 60

        # 2. Intelligent instrument/sound_type extraction from prompt
        prompt_lower = resolved_prompt.lower()
        detected_sound = None
        if any(w in prompt_lower for w in ["piano", "rhodes", "keyboard", "chord", "chords", "lo-fi piano", "lofi piano", "keys"]):
            detected_sound = "piano"
        elif any(w in prompt_lower for w in ["bell", "bells", "chime", "chimes", "solfeggio", "singing bowl", "bowl", "zen", "ambient", "healing", "calm"]):
            detected_sound = "soft_bell"
        elif any(w in prompt_lower for w in ["wood", "wooden", "block", "click", "stick", "tap", "percussion", "wooden_block"]):
            detected_sound = "wooden_block"
        elif any(w in prompt_lower for w in ["metronome", "tick", "ticking", "pulse"]):
            detected_sound = "metronome"
        elif any(w in prompt_lower for w in ["drum", "drums", "beat", "rock", "hip hop", "gait", "kick", "snare", "rhythm"]):
            detected_sound = "drum"

        if detected_sound:
            st = detected_sound
        elif session_type and session_type in sound_map:
            st = sound_map[session_type]
        else:
            st = sound_type or "drum"

        if not resolved_prompt:
            resolved_prompt = f"{st} rhythm therapeutic beat {bpm_val} bpm"

        bars_count = max(2, min(16, (duration or 10) // 2))

        # Try Hugging Face cloud neural inference
        neural_bytes = self._call_musicgen_api(resolved_prompt, bpm_val, custom_params=custom_params)
        if neural_bytes:
            ts = int(time.time() * 1000)
            filename = f"ai_beat_neural_{st}_{bpm_val}_{ts}.wav"
            filepath = os.path.join(self.output_dir, filename)
            try:
                with open(filepath, "wb") as f:
                    f.write(neural_bytes)
                return {
                    "success": True,
                    "audio_url": f"/static/audio/generated/{filename}?v={ts}",
                    "bpm": bpm_val,
                    "sound_type": st,
                    "prompt": resolved_prompt,
                    "track_title": f"Neural MusicGen: {st.title()} ({bpm_val} BPM)",
                    "engine": "HUGGING_FACE_MUSICGEN",
                    "engine_used": "huggingface_router",
                    "timestamp": ts
                }
            except Exception as e:
                logger.warning(f"Error saving neural bytes: {e}. Falling back to procedural.")

        # Seamless Level 2 procedural synthesis
        audio_url = self.synthesize_acoustic_wav(sound_type=st, bpm=bpm_val, bars=bars_count, seed=seed)
        titles = {
            "drum": f"Acoustic Gait Cue Drum ({bpm_val} BPM)",
            "piano": f"Lo-Fi Rhodes Chord Cadence ({bpm_val} BPM)",
            "soft_bell": f"Solfeggio 528Hz Healing Chimes ({bpm_val} BPM)",
            "wooden_block": f"Precision Dual-Tone Woodblock ({bpm_val} BPM)",
            "metronome": f"Clinical Metronome ({bpm_val} BPM)"
        }

        return {
            "success": True,
            "audio_url": audio_url,
            "bpm": bpm_val,
            "sound_type": st,
            "prompt": resolved_prompt,
            "track_title": titles.get(st, f"Therapeutic Beat ({bpm_val} BPM)"),
            "engine": "PROCEDURAL_ACOUSTIC_SYNTHESIZER",
            "engine_used": "procedural_acoustic_synth",
            "timestamp": int(time.time() * 1000)
        }


    # =========================================================================
    # Compatibility methods preserving legacy API surface
    # =========================================================================
    def generate_stroke_therapy_beat(self, session_type: str, bpm: int, patient_condition: Dict) -> Optional[str]:
        """Generates therapeutic audio URL for stroke sessions."""
        sound_map = {
            "gait_trainer": "drum",
            "upper_limb_motor": "drum",
            "melodic_intonation": "piano",
            "speech_rhythm": "wooden_block",
            "cognitive_rhythm": "soft_bell"
        }
        st = sound_map.get(session_type, "metronome")
        res = self.generate_beat_detailed(bpm=bpm, sound_type=st)
        return res.get("audio_url")

    def get_optimal_bpm_for_stroke_therapy(self, session_type: str, patient_condition: Dict) -> int:
        severity = patient_condition.get('severity', 'moderate')
        if session_type == "gait_trainer":
            return 40 if severity == 'severe' else (50 if severity == 'moderate' else 60)
        elif session_type in ["upper_limb_motor", "cognitive_rhythm"]:
            return 45 if severity == 'severe' else (55 if severity == 'moderate' else 65)
        elif session_type in ["melodic_intonation", "speech_rhythm"]:
            return 50 if severity == 'severe' else (65 if severity == 'moderate' else 80)
        return 60

    def get_available_sounds(self) -> Dict:
        return self.beat_sounds
