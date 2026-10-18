"""Run against an isolated local server: BASE_URL=http://127.0.0.1:3100 python3 tests/email-preferences-api.py."""
import copy
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
            text = response.read()
            return response.status, json.loads(text) if text else None
    except HTTPError as error:
        return error.code, json.loads(error.read())


def main():
    status, original = request("/api/email-preferences")
    assert status == 200
    settings = copy.deepcopy(original["data"])
    campaign_id = "cmp_email_settings_" + uuid4().hex[:8]
    try:
        for data in [None, [], {}, {"sending": "invalid"}]:
            status, result = request("/api/email-preferences", "PUT", {"data": data, "expectedUpdatedAt": original["updatedAt"]})
            assert status == 400, result

        settings["sending"]["senders"][0]["displayName"] = "API Regression Store"
        settings["editor"]["contentWidth"] = 720
        settings["editor"]["paragraph"]["color"] = "#123456"
        status, saved = request("/api/email-preferences", "PUT", {"data": settings, "expectedUpdatedAt": original["updatedAt"]})
        assert status == 200, saved
        assert request("/api/email-preferences")[1]["data"] == settings

        status, conflict = request("/api/email-preferences", "PUT", {"data": original["data"], "expectedUpdatedAt": original["updatedAt"]})
        assert status == 409, conflict
        assert request("/api/email-preferences")[1]["data"] == settings

        invalid = copy.deepcopy(settings)
        invalid["sending"]["requireBcc"] = True
        invalid["sending"]["bcc"] = []
        invalid["sending"]["defaultBccId"] = ""
        assert request("/api/email-preferences", "PUT", {"data": invalid, "expectedUpdatedAt": saved["updatedAt"]})[0] == 400
        assert request("/api/email-preferences")[1]["data"] == settings

        campaign = {"id": campaign_id, "name": "Email defaults API regression", "channel": "email", "body": "Test"}
        status, created = request("/api/campaigns", "POST", campaign)
        assert status == 201, created
        assert created["config"]["emailSending"]["fromName"] == "API Regression Store"
        assert created["config"]["emailStyle"]["contentWidth"] == 720
        assert created["config"]["emailStyle"]["textColor"] == "#123456"

        newest = request("/api/email-preferences")[1]
        changed = copy.deepcopy(settings)
        changed["editor"]["contentWidth"] = 600
        assert request("/api/email-preferences", "PUT", {"data": changed, "expectedUpdatedAt": newest["updatedAt"]})[0] == 200
        status, existing = request("/api/campaigns", "POST", created)
        assert status == 201
        assert existing["config"]["emailStyle"]["contentWidth"] == 720, "Existing campaigns must keep their stored theme"
        print("PASS: persistence, validation, conflict handling, new campaign defaults, existing campaign preservation")
    finally:
        newest = request("/api/email-preferences")[1]
        status, restored = request("/api/email-preferences", "PUT", {"data": original["data"], "expectedUpdatedAt": newest["updatedAt"]})
        assert status == 200, restored
        request(f"/api/campaigns/{campaign_id}", "DELETE")


if __name__ == "__main__":
    main()
