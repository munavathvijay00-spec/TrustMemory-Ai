import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

@pytest.mark.asyncio
async def test_api_events_and_helpers(client: AsyncClient, seed_data):
    # Check helpers endpoint returns seeded data
    resp_helpers = await client.get("/api/v1/helpers")
    assert resp_helpers.status_code == 200
    helpers_list = resp_helpers.json()
    assert len(helpers_list) >= 2

    # Ingest event via API
    resp_ev = await client.post(
        "/api/v1/events",
        json={
            "helper_id": "anita",
            "household_id": "h107",
            "event_type": "complaint",
            "description": "Household noted task schedule misalignment.",
            "source": "live",
        },
    )
    assert resp_ev.status_code == 200
    ev_data = resp_ev.json()
    assert ev_data["event"]["event_type"] == "complaint"
    assert ev_data["after_churn"] is not None

    # Test matching endpoint
    resp_match = await client.post(
        "/api/v1/matching/find",
        json={
            "role": "elder_care",
            "household_id": "h107",
            "naive": False,
        },
    )
    assert resp_match.status_code == 200
    match_data = resp_match.json()
    assert len(match_data["candidates"]) >= 2

    # Test dashboard endpoint
    resp_dash = await client.get("/api/v1/dashboard")
    assert resp_dash.status_code == 200
    dash_data = resp_dash.json()
    assert dash_data["active_helpers"] >= 2
