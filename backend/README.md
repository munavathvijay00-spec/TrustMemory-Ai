# TrustMemory AI — Backend Reference Implementation

FastAPI backend orchestrating the five agents for agency placement memory, intelligence, and action.

## Architecture

- **FastAPI**: Asynchronous REST API layer.
- **SQLAlchemy 2.0**: Unified async ORM with cross-dialect compatibility (SQLite in dev/test, PostgreSQL in production).
- **Hindsight Memory Core**: 4 networks (World, Experience, Opinion, Observation) via Retain/Recall/Reflect.
- **Decision Agent & Scoring Engine**: Deterministic Trust, Churn, and Household Difficulty formulas + LLM severity classification.
- **Reflection Agent**: Cross-placement pattern synthesis (Facts, Observations, Hypotheses).
- **Matching Agent**: Role-fit, trust-signal, and churn-risk candidate evaluation with pre-staged backup support.
- **Voice Agent**: Vapi / Bland abstraction with idempotent call planning and transcript evidence extraction.

## Getting Started

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements-dev.txt
   ```

3. Run migrations:
   ```bash
   alembic upgrade head
   ```

4. Start the development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

5. Run test suite:
   ```bash
   pytest
   ```
