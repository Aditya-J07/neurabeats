"""
NURO-BEATS AI Provider Architecture
services/ai_provider.py

Clean AI abstraction layer separating:
├── GeminiProvider (Clinical reasoning, SOAP progress notes, measurement summaries)
└── HuggingFaceProvider (Neural audio synthesis, MusicGen model control, prompt conditioning)

Supports live runtime configuration of:
- Model name and revision
- Device selection (cpu / cuda / auto)
- Generation parameters (max_new_tokens, temperature, top_p, do_sample)
- Response caching and deterministic fallbacks
"""

import os
import json
import hashlib
import logging
from typing import Dict, Any, Optional

try:
    import requests
except ImportError:
    requests = None

from services.prompt_service import PromptService

logger = logging.getLogger("AIProvider")


class HuggingFaceConfig:
    """Dynamic configuration container for Hugging Face inference."""
    
    def __init__(
        self,
        model: str = "facebook/musicgen-small",
        revision: str = "main",
        device: str = "cpu",
        max_new_tokens: int = 256,
        temperature: float = 1.0,
        top_p: float = 0.9,
        do_sample: bool = True,
        timeout: int = 10
    ):
        self.model = model
        self.revision = revision
        self.device = device
        self.max_new_tokens = max_new_tokens
        self.temperature = temperature
        self.top_p = top_p
        self.do_sample = do_sample
        self.timeout = timeout

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model": self.model,
            "revision": self.revision,
            "device": self.device,
            "parameters": {
                "max_new_tokens": self.max_new_tokens,
                "temperature": self.temperature,
                "top_p": self.top_p,
                "do_sample": self.do_sample
            },
            "timeout": self.timeout
        }

    def update(self, updates: Dict[str, Any]):
        if "model" in updates and isinstance(updates["model"], str) and updates["model"].strip():
            self.model = updates["model"].strip()
        if "revision" in updates and isinstance(updates["revision"], str):
            self.revision = updates["revision"].strip()
        if "device" in updates and isinstance(updates["device"], str):
            self.device = updates["device"].strip().lower()
        if "timeout" in updates and isinstance(updates["timeout"], (int, float)):
            self.timeout = int(updates["timeout"])
            
        params = updates.get("parameters", updates)
        if "max_new_tokens" in params and isinstance(params["max_new_tokens"], (int, float)):
            self.max_new_tokens = max(16, min(1024, int(params["max_new_tokens"])))
        if "temperature" in params and isinstance(params["temperature"], (int, float)):
            self.temperature = max(0.1, min(2.0, float(params["temperature"])))
        if "top_p" in params and isinstance(params["top_p"], (int, float)):
            self.top_p = max(0.1, min(1.0, float(params["top_p"])))
        if "do_sample" in params and isinstance(params["do_sample"], bool):
            self.do_sample = params["do_sample"]


class HuggingFaceProvider:
    """Manages Hugging Face cloud neural audio generation and model configuration."""

    def __init__(self, api_token: Optional[str] = None):
        self.api_token = api_token or os.environ.get("HUGGINGFACE_API_TOKEN", "")
        self.base_url = "https://router.huggingface.co/hf-inference/models"
        self.whoami_url = "https://huggingface.co/api/whoami-v2"
        self.config = HuggingFaceConfig()
        self._cache: Dict[str, bytes] = {}

    def test_connection(self) -> Dict[str, Any]:
        """Test authentication and user profile with Hugging Face router."""
        token = self.api_token or os.environ.get("HUGGINGFACE_API_TOKEN", "")
        if not token:
            return {
                "valid": False,
                "error": "No HUGGINGFACE_API_TOKEN configured.",
                "endpoint": self.base_url,
                "username": None
            }
        if not requests:
            return {
                "valid": False,
                "error": "Requests library not available.",
                "endpoint": self.base_url,
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
                    "status": "connected",
                    "endpoint": self.base_url,
                    "model": self.config.model
                }
            return {
                "valid": False,
                "error": f"HF Auth failed (HTTP {resp.status_code}): {resp.text[:120]}",
                "endpoint": self.base_url,
                "username": None
            }
        except Exception as e:
            return {
                "valid": False,
                "error": f"Connection error: {str(e)}",
                "endpoint": self.base_url,
                "username": None
            }

    def generate_audio(
        self,
        base_prompt: str,
        bpm: int,
        duration_sec: int = 5,
        custom_params: Optional[Dict[str, Any]] = None
    ) -> Optional[bytes]:
        """
        Executes controlled neural inference via modern Hugging Face Router.
        Uses centralized prompt templating and configured generation parameters.
        """
        token = self.api_token or os.environ.get("HUGGINGFACE_API_TOKEN", "")
        if not token or not requests:
            return None

        # Build prompt using PromptService
        prompt = PromptService.get_prompt("rhythm_audio_generation", {
            "prompt": base_prompt,
            "bpm": bpm,
            "duration": duration_sec
        })

        # Cache key based on exact inputs and generation parameters
        max_tokens = custom_params.get("max_new_tokens", self.config.max_new_tokens) if custom_params else self.config.max_new_tokens
        temp = custom_params.get("temperature", self.config.temperature) if custom_params else self.config.temperature
        top_p = custom_params.get("top_p", self.config.top_p) if custom_params else self.config.top_p
        model = custom_params.get("model", self.config.model) if custom_params else self.config.model

        cache_key = hashlib.sha256(f"{model}_{prompt}_{bpm}_{max_tokens}_{temp}_{top_p}".encode()).hexdigest()
        if cache_key in self._cache:
            logger.info(f"[HuggingFaceProvider] Returning cached audio generation for key {cache_key[:8]}")
            return self._cache[cache_key]

        model_url = f"{self.base_url}/{model}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": max_tokens,
                "temperature": temp,
                "top_p": top_p,
                "do_sample": self.config.do_sample
            }
        }

        try:
            logger.info(f"[HuggingFaceProvider] Dispatching neural inference to {model_url} (temp={temp}, top_p={top_p})")
            resp = requests.post(model_url, headers=headers, json=payload, timeout=self.config.timeout)
            if resp.status_code == 200 and len(resp.content) > 1000:
                self._cache[cache_key] = resp.content
                logger.info(f"[HuggingFaceProvider] Inference success: {len(resp.content)} audio bytes received.")
                return resp.content
            logger.info(f"[HuggingFaceProvider] HF Router responded with HTTP {resp.status_code}. Falling back.")
            return None
        except Exception as e:
            logger.info(f"[HuggingFaceProvider] Inference exception ({e}). Engaging procedural fallback.")
            return None


class AIProviderManager:
    """Singleton coordinator for AI providers."""
    
    _hf_provider = HuggingFaceProvider()

    @classmethod
    def get_hf_provider(cls) -> HuggingFaceProvider:
        return cls._hf_provider

    @classmethod
    def get_hf_config(cls) -> Dict[str, Any]:
        cfg = cls._hf_provider.config.to_dict()
        cfg["status"] = cls._hf_provider.test_connection()
        return cfg

    @classmethod
    def update_hf_config(cls, updates: Dict[str, Any]) -> Dict[str, Any]:
        cls._hf_provider.config.update(updates)
        return cls.get_hf_config()
