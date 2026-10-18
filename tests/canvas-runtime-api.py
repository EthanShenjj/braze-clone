"""Run against an isolated server: BASE_URL=http://127.0.0.1:3100 python3 tests/canvas-runtime-api.py."""
import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:3100")


def request(path, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = Request(BASE + path, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def main():
    status, workspace = request("/api/canvas")
    assert status == 200
    graph = {"nodes": [
        {"id": "entry", "kind": "entry", "label": "Entry", "x": 100, "y": 100, "config": {"reEntry": "none"}},
        {"id": "delay", "kind": "delay", "label": "Wait 24 hours", "x": 300, "y": 100, "config": {"durationHours": 24}},
        {"id": "message", "kind": "message", "label": "Email", "x": 500, "y": 100, "config": {"channel": "email", "subject": "Welcome", "message": "Welcome"}},
    ], "edges": [["entry", "delay"], ["delay", "message"]]}
    status, saved = request("/api/canvas", "PUT", {"graph": graph, "updatedAt": workspace["updatedAt"]})
    assert status == 200, saved
    status, run = request("/api/canvas", "POST")
    assert status == 201, run
    assert run["entered"] == 10 and run["completed"] == 0 and run["messages"] == 0, run
    assert all([step["kind"] for step in trace["steps"]] == ["entry", "delay"] for trace in run["traces"])
    assert request("/api/demo")[1]["pendingCanvasSteps"] == 10
    waiting = next(item for item in request("/api/canvas")[1]["runs"] if item["id"] == run["id"])
    assert waiting["nextDueAt"], waiting

    status, advanced = request("/api/demo", "POST", {"action": "advance"})
    assert status == 200, advanced
    assert advanced["state"]["pendingCanvasSteps"] == 0, advanced
    updated = next(item for item in request("/api/canvas")[1]["runs"] if item["id"] == run["id"])
    assert updated["completed"] == 10 and updated["messages"] > 0, updated
    assert all([step["kind"] for step in trace["steps"]] == ["entry", "delay", "message"] for trace in updated["traces"])
    assert request("/api/demo", "POST", {"action": "advance"})[1]["state"]["pendingCanvasSteps"] == 0
    assert next(item for item in request("/api/canvas")[1]["runs"] if item["id"] == run["id"])["messages"] == updated["messages"]

    status, second = request("/api/canvas", "POST")
    assert status == 201, second
    assert not {trace["userId"] for trace in run["traces"]} & {trace["userId"] for trace in second["traces"]}

    invalid_graph = {"nodes": [
        {"id": "entry", "kind": "entry", "label": "Entry", "x": 100, "y": 100},
        {"id": "update", "kind": "update", "label": "Status", "x": 300, "y": 100, "config": {"attribute": "subscribed", "value": "treu"}},
    ], "edges": [["entry", "update"]]}
    status, saved = request("/api/canvas", "PUT", {"graph": invalid_graph, "updatedAt": request("/api/canvas")[1]["updatedAt"]})
    assert status == 200, saved
    status, rejected = request("/api/canvas", "POST")
    assert status == 422 and "true or false" in rejected["error"], rejected

    linked_campaign = "cmp_canvas_link_" + uuid4().hex[:8]
    status, campaign = request("/api/campaigns", "POST", {"id": linked_campaign, "name": "Canvas linked test", "channel": "email", "subject": "Original subject", "body": "Original body"})
    assert status in (200, 201), campaign
    linked_graph = {"nodes": [
        {"id": "entry", "kind": "entry", "label": "Entry", "x": 100, "y": 100},
        {"id": "message", "kind": "message", "label": "Linked email", "x": 300, "y": 100, "config": {"channel": "email", "subject": "Stale subject", "message": "Stale body", "linkedCampaignId": linked_campaign}},
    ], "edges": [["entry", "message"]]}
    status, saved = request("/api/canvas", "PUT", {"graph": linked_graph, "updatedAt": request("/api/canvas")[1]["updatedAt"]})
    assert status == 200, saved
    status, campaign = request(f"/api/campaigns/{linked_campaign}", "PATCH", {"subject": "Updated subject", "body": "Updated body"})
    assert status == 200, campaign
    linked = next(node for node in request("/api/canvas")[1]["graph"]["nodes"] if node["id"] == "message")
    assert linked["config"]["subject"] == "Updated subject" and linked["config"]["message"] == "Updated body", linked

    update_graph = {"nodes": [
        {"id": "entry", "kind": "entry", "label": "Entry", "x": 100, "y": 100, "config": {"reEntry": "always"}},
        {"id": "update", "kind": "update", "label": "Unsubscribe", "x": 300, "y": 100, "config": {"attribute": "subscribed", "value": "false"}},
        {"id": "message", "kind": "message", "label": "Email", "x": 500, "y": 100, "config": {"channel": "email", "subject": "Welcome", "message": "Welcome"}},
    ], "edges": [["entry", "update"], ["update", "message"]]}
    status, saved = request("/api/canvas", "PUT", {"graph": update_graph, "updatedAt": request("/api/canvas")[1]["updatedAt"]})
    assert status == 200, saved
    status, updated_run = request("/api/canvas", "POST")
    assert status == 201 and updated_run["entered"] == 10 and updated_run["messages"] == 0, updated_run
    assert request("/api/users?q=" + updated_run["traces"][0]["userId"])[1]["data"][0]["emailSubscriptionStatus"] == "unsubscribed"
    print("PASS: delay due times, clock advancement, idempotent resume, no user re-entry, update validation, campaign roundtrip")


if __name__ == "__main__":
    main()
