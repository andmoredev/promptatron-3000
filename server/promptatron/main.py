"""FastAPI application factory for the promptatron server."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from promptatron.config import get_settings
from promptatron.errors import register_exception_handlers
from promptatron.routers import health

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(title="Promptatron Server", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health.router, prefix=API_PREFIX)

    return app


app = create_app()
