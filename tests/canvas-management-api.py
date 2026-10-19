"""Run against an isolated server: BASE_URL=http://127.0.0.1:3101 python3 tests/canvas-management-api.py."""
import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


BASE = os.environ.get("BASE_URL", "http://127.0.0.1:3101")


def request(path, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    operation = Request(BASE + path, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(operation) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def main():
    suffix = uuid4().hex[:8]
    status, blank = request("/api/canvases", "POST", {"name": f"Blank {suffix}", "description": "New journey", "tags": ["smoke"]})
    assert status == 201 and blank["tags"] == ["smoke"], blank
    assert request(f"/api/canvases/{blank['id']}/launch", "POST")[0] == 422
    status, first = request("/api/canvases", "POST", {"name": f"Welcome {suffix}", "template": "welcome"})
    assert status == 201, first
    status, second = request("/api/canvases", "POST", {"name": f"Payment {suffix}", "template": "payment"})
    assert status == 201, second
    first_workspace = request(f"/api/canvases/{first['id']}")[1]
    second_workspace = request(f"/api/canvases/{second['id']}")[1]
    assert first_workspace["graph"]["nodes"][2]["label"] != second_workspace["graph"]["nodes"][2]["label"]
    first_workspace["graph"]["nodes"][2]["label"] = "Changed in first Canvas"
    status, saved = request(f"/api/canvases/{first['id']}/graph", "PUT", {"graph": first_workspace["graph"], "updatedAt": first_workspace["updatedAt"]})
    assert status == 200, saved
    assert request(f"/api/canvases/{second['id']}")[1]["graph"]["nodes"][2]["label"] != "Changed in first Canvas"
    status, second_saved = request(f"/api/canvases/{second['id']}/graph", "PUT", {"graph": second_workspace["graph"], "updatedAt": second_workspace["updatedAt"]})
    assert status == 200, second_saved
    first_wizard = first_workspace["canvas"]["wizard"]
    first_wizard["entry"]["timing"] = "immediate"
    first_wizard["audience"]["segmentIds"] = ["seg_country_us"]
    status, first_configured = request(f"/api/canvases/{first['id']}", "PATCH", {"wizard": first_wizard, "updatedAt": saved["updatedAt"]})
    assert status == 200 and first_configured["wizard"]["audience"]["segmentIds"] == ["seg_country_us"], first_configured
    second_wizard = second_workspace["canvas"]["wizard"]
    second_wizard["entry"]["timing"] = "immediate"
    second_wizard["audience"]["segmentIds"] = ["seg_country_cn"]
    status, second_configured = request(f"/api/canvases/{second['id']}", "PATCH", {"wizard": second_wizard, "updatedAt": second_saved["updatedAt"]})
    assert status == 200, second_configured
    status, first_run = request(f"/api/canvases/{first['id']}/launch", "POST")
    assert status == 201, first_run
    status, second_run = request(f"/api/canvases/{second['id']}/launch", "POST")
    assert status == 201, second_run
    assert first_run["id"] != second_run["id"]
    assert all(request(f"/api/users?q={trace['userId']}&limit=1")[1]["data"][0]["country"] == "US" for trace in first_run["traces"])
    assert all(request(f"/api/users?q={trace['userId']}&limit=1")[1]["data"][0]["country"] == "CN" for trace in second_run["traces"])
    first_wizard["conversionEvents"] = [{"id": "conversion_1", "type": "Starts Session", "appScope": "Users from all apps", "deadline": 3, "unit": "Days"}]
    assert request(f"/api/canvases/{first['id']}", "PATCH", {"wizard": first_wizard})[0] == 409
    assert request(f"/api/canvases/{first['id']}")[1]["runs"][0]["id"] == first_run["id"]
    assert request(f"/api/canvases/{second['id']}")[1]["runs"][0]["id"] == second_run["id"]
    status, stale = request(f"/api/canvases/{first['id']}/graph", "PUT", {"graph": first_workspace["graph"], "updatedAt": first_workspace["updatedAt"]})
    assert status == 409 and "another tab" in stale["error"], stale
    status, duplicate = request(f"/api/canvases/{first['id']}", "POST", {"action": "duplicate"})
    assert status == 201 and duplicate["status"] == "Draft", duplicate
    assert request(f"/api/canvases/{duplicate['id']}")[1]["graph"]["nodes"][2]["label"] == "Changed in first Canvas"
    status, updated = request(f"/api/canvases/{first['id']}", "PATCH", {"tags": ["regression"], "alertsConfigured": True})
    assert status == 200 and updated["tags"] == ["regression"] and updated["alertsConfigured"]
    status, archived = request(f"/api/canvases/{first['id']}", "PATCH", {"status": "Archived"})
    assert status == 200 and archived["status"] == "Archived"
    listed = request("/api/canvases")[1]["data"]
    assert any(item["id"] == first["id"] and item["status"] == "Archived" for item in listed)
    assert request("/api/canvases/missing")[0] == 404
    print("PASS: multi-Canvas graphs and runs, templates, optimistic save, duplicate, metadata, archive, list and missing IDs")


if __name__ == "__main__":
    main()
