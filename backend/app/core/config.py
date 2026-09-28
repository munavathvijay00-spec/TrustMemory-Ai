try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:
    class BaseSettings:
        def __init__(self, **kwargs):
            for k, v in self.__class__.__dict__.items():
                if not k.startswith("_") and not callable(v):
                    setattr(self, k, v)
            for k, v in kwargs.items():
                setattr(self, k, v)
    def SettingsConfigDict(**kwargs):
        return {}

class Settings(BaseSettings):
    PROJECT_NAME: str = "TrustMemory AI"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./trustmemory.db"

    # Security
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # LLM (Groq)
    GROQ_API_KEY: str = "mock_groq_key"
    GROQ_MODEL: str = "llama-3.1-70b-versatile"

    # Hindsight Memory
    HINDSIGHT_API_URL: str = "https://api.hindsight.vectorize.io"
    HINDSIGHT_API_KEY: str = "mock_hindsight_key"

    # Voice (Vapi / Bland / Twilio)
    VAPI_API_KEY: str = "mock_vapi_key"
    VAPI_ASSISTANT_ID: str = "mock_asst_id"
    BLAND_API_KEY: str = "mock_bland_key"
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None

    # Email / Gmail SMTP
    GOOGLEUSER: Optional[str] = "munavathvijay00@gmail.com"
    GMAIL_APP_PASSWORD: Optional[str] = "ubrezovdqdqbubdk"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    COORDINATOR_ALERT_EMAIL: Optional[str] = "munavathvijay00@gmail.com"

    # Google OAuth / Google Login
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
