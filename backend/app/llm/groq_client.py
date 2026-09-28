from typing import Optional, Dict, Any, List
import httpx
from app.core.config import settings
from app.core.logging import logger

class GroqLLMClient:
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_MODEL
        self.base_url = "https://api.groq.com/openai/v1"

    async def chat_completion(self, messages: List[Dict[str, str]], temperature: float = 0.2) -> Optional[str]:
        if not self.api_key or self.api_key == "mock_groq_key":
            return None  # Will fall back to deterministic logic

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature,
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    return data["choices"][0]["message"]["content"]
                logger.warning(f"Groq API returned status {res.status_code}: {res.text}")
                return None
        except Exception as e:
            logger.warning(f"Groq API call failed: {e}. Falling back to deterministic logic.")
            return None

groq_client = GroqLLMClient()
