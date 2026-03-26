"""Tests for FastAPI server endpoints."""

from __future__ import annotations


class TestHealthEndpoint:
    def test_returns_ok(self, app_client):
        client, _ = app_client
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"


class TestProviders:
    def test_list_providers(self, app_client):
        client, _ = app_client
        res = client.get("/providers")
        assert res.status_code == 200
        data = res.json()
        assert "providers" in data
        assert "current" in data
        provider_ids = [p["id"] for p in data["providers"]]
        assert "openai" in provider_ids
        assert "anthropic" in provider_ids


class TestSessionEndpoints:
    def test_create_session(self, app_client):
        client, _ = app_client
        res = client.post("/session")
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert "thread_id" in data

    def test_reset_returns_new_token(self, app_client):
        client, _ = app_client
        # Create a session first
        s1 = client.post("/session").json()
        # Reset with that token
        res = client.post(
            "/reset",
            headers={"Authorization": f"Bearer {s1['token']}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["token"] != s1["token"]


class TestContextEndpoints:
    def _get_token(self, client):
        return client.post("/session").json()["token"]

    def test_get_empty_context(self, app_client):
        client, _ = app_client
        token = self._get_token(client)
        res = client.get("/context", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["user_context"] == []
        assert data["scratchpad"] == []

    def test_add_context(self, app_client):
        client, _ = app_client
        token = self._get_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post("/context", json={"context": "test hint"}, headers=headers)
        assert res.status_code == 200
        assert res.json()["count"] == 1

    def test_delete_all_context(self, app_client):
        client, _ = app_client
        token = self._get_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        client.post("/context", json={"context": "hint1"}, headers=headers)
        res = client.delete("/context", headers=headers)
        assert res.status_code == 200
        # Verify empty
        ctx = client.get("/context", headers=headers).json()
        assert ctx["user_context"] == []

    def test_delete_context_by_index(self, app_client):
        client, _ = app_client
        token = self._get_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        client.post("/context", json={"context": "a"}, headers=headers)
        client.post("/context", json={"context": "b"}, headers=headers)
        res = client.delete("/context/0", headers=headers)
        assert res.status_code == 200
        assert res.json()["removed"] == "a"

    def test_delete_context_invalid_index(self, app_client):
        client, _ = app_client
        token = self._get_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        res = client.delete("/context/99", headers=headers)
        assert res.status_code == 400


class TestScratchpadReward:
    def test_invalid_delta(self, app_client):
        client, _ = app_client
        token = client.post("/session").json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(
            "/scratchpad/0/reward",
            json={"delta": 5},
            headers=headers,
        )
        assert res.status_code == 400


class TestHITL:
    def test_get_status(self, app_client):
        client, _ = app_client
        res = client.get("/hitl")
        assert res.status_code == 200
        assert "enabled" in res.json()
