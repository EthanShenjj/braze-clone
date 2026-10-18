"""Run against an isolated server: BASE_URL=http://127.0.0.1:3100 python3 tests/subscription-safety-api.py."""
import json
import os
from urllib.error import HTTPError
from urllib.parse import urlencode
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
    suffix = uuid4().hex[:8]
    status, group = request("/api/subscription-groups", "POST", {"name": "Safety group " + suffix, "channel": "Email"})
    assert status == 201, group
    group_id = group["id"]
    assert request(f"/api/subscription-groups/{group_id}/members", "PATCH", {"userId": "user_1", "state": "subscribed"})[0] == 200

    def estimate(eligibility="subscribed"):
        query = urlencode({"audience": "All Users", "country": "GB", "eligibility": eligibility, "subscriptionGroupId": group_id, "channel": "email"})
        return request("/api/audience/estimate?" + query)

    assert request("/api/users", "PATCH", {"id": "user_1", "emailSubscriptionStatus": "opted_in"})[0] == 200
    assert estimate("opted-in")[1]["reachable"] == 1
    assert request("/api/users", "PATCH", {"id": "user_1", "emailSubscriptionStatus": "subscribed"})[0] == 200
    assert estimate("opted-in")[1]["reachable"] == 0
    assert estimate()[1]["reachable"] == 1

    status, center = request("/api/preference-centers", "POST", {"name": "Safety center " + suffix, "groupIds": [group_id], "status": "Active"})
    assert status == 201, center
    center_id = center["id"]
    status, insight = request(f"/api/preference-centers/{center_id}/insights?user=user_1")
    assert status == 200 and insight["link"]["token"]
    token = insight["link"]["token"]
    public = f"/api/preference-centers/{center_id}/public"
    assert request(public + "?user=user_1")[0] == 404
    assert request(public + "?user=user_1&token=invalid")[0] == 404
    assert request(public + "?" + urlencode({"user": "user_1", "token": token}))[0] == 200
    assert request(public, "POST", {"userId": "user_1", "token": "invalid", "states": {group_id: False}})[0] == 404
    assert request(public, "POST", {"userId": "user_1", "token": token, "states": {}})[0] == 400

    status, draft = request("/api/preference-centers", "POST", {"name": "Draft center " + suffix, "description": "Original live copy", "groupIds": [group_id]})
    assert status == 201 and draft["status"] == "Draft" and draft["publishedVersion"] is None, draft
    draft_id = draft["id"]
    draft_public = f"/api/preference-centers/{draft_id}/public"
    assert request(f"/api/preference-centers/{draft_id}/insights?user=user_1")[1]["link"] is None
    assert request(draft_public + "?" + urlencode({"user": "user_1", "token": token}))[0] == 404
    status, published = request(f"/api/preference-centers/{draft_id}/publish", "POST")
    assert status == 200 and published["publishedVersion"] == 1, published
    draft_token = request(f"/api/preference-centers/{draft_id}/insights?user=user_1")[1]["link"]["token"]
    draft_url = draft_public + "?" + urlencode({"user": "user_1", "token": draft_token})
    original = request(draft_url)[1]
    assert original["center"]["description"] == "Original live copy" and len(original["groups"]) == 1, original
    status, edited = request(f"/api/preference-centers/{draft_id}", "PATCH", {"description": "Unpublished copy", "groupIds": []})
    assert status == 200 and edited["version"] == 2 and edited["publishedVersion"] == 1, edited
    still_live = request(draft_url)[1]
    assert still_live["center"]["description"] == "Original live copy" and len(still_live["groups"]) == 1, still_live
    status, published = request(f"/api/preference-centers/{draft_id}/publish", "POST")
    assert status == 200 and published["publishedVersion"] == 2, published
    updated_live = request(draft_url)[1]
    assert updated_live["center"]["description"] == "Unpublished copy" and not updated_live["groups"], updated_live

    status, _ = request(public, "POST", {"userId": "user_1", "token": token, "states": {group_id: True}, "action": "global_unsubscribe"})
    assert status == 200
    assert estimate()[1]["reachable"] == 0
    assert estimate("all")[1]["reachable"] == 0
    assert request("/api/users?q=user_1")[1]["data"][0]["emailSubscriptionStatus"] == "unsubscribed"

    campaign_id = "cmp_subscription_safety_" + suffix
    status, created = request("/api/campaigns", "POST", {"id": campaign_id, "name": "Subscription safety", "channel": "email", "subject": "Safety test", "body": "Safety test", "audience": "All Users", "config": {"subscriptionGroupId": group_id, "audienceCountry": "GB", "controlGroup": 0}})
    assert status == 201, created
    status, launched = request(f"/api/campaigns/{campaign_id}/launch", "POST")
    assert status == 200, launched
    assert launched["run"]["eligible"] == 0 and launched["run"]["delivered"] == 0, launched

    status, archived = request(f"/api/subscription-groups/{group_id}", "PATCH", {"status": "Archived"})
    assert status == 200 and archived["status"] == "Archived", archived
    assert estimate()[0] == 400
    second_id = "cmp_archived_group_" + suffix
    assert request("/api/campaigns", "POST", {"id": second_id, "name": "Archived group safety", "channel": "email", "subject": "Safety test", "body": "Safety test", "config": {"subscriptionGroupId": group_id}})[0] == 201
    assert request(f"/api/campaigns/{second_id}/launch", "POST")[0] == 400
    print("PASS: three-state eligibility, signed links, draft isolation, publish snapshot, global unsubscribe, archived-group suppression")


if __name__ == "__main__":
    main()
