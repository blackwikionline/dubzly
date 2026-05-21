from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    app_port: int = 8000
    extension_origin: str = ""

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    supabase_jwt_secret: str = ""

    elevenlabs_api_key: str = ""
    elevenlabs_default_voice_id: str = ""

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_meter_id: str = ""

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "anime-dub-audio"
    r2_public_url: str = ""

    s3_audio_cache_bucket: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
