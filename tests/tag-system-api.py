"""Run against an isolated local server; creates only its own tagged fixtures."""
import json
import os
import uuid
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

base = os.environ.get("BASE_URL", "http://127.0.0.1:3210")
assert base.startswith(("http://127.0.0.1:", "http://localhost:")), "Use an isolated local server"
prefix = "tag_qa_" + uuid.uuid4().hex[:8]


def api(path, method="GET", body=None, status=200):
    request = Request(base + path, method=method, headers={"Content-Type": "application/json"}, data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(request) as response:
            code, result = response.status, json.load(response)
    except HTTPError as error:
        code, result = error.code, json.load(error)
    assert code == status, (method, path, code, result)
    return result


root = api("/api/tags", "POST", {"name": prefix + "_parent"}, 201)
child = api("/api/tags", "POST", {"name": prefix + "_child", "parentId": root["id"]}, 201)
api("/api/tags", "POST", {"name": root["name"]}, 400)
api("/api/tags/" + root["id"], "PATCH", {"parentId": child["id"], "expectedUpdatedAt": root["updatedAt"]}, 409)

for suffix, names in [("one", [root["name"]]), ("two", [child["name"]])]:
    api("/api/campaigns", "POST", {"id": "cmp_" + prefix + suffix, "name": prefix + suffix, "channel": "push", "status": "Active", "config": {"tags": names}}, 201)

canvas = api("/api/canvases", "POST", {"name": prefix, "tags": [root["name"]]}, 201)
segment = api("/api/resources/segments", "POST", {"name": prefix, "data": {"tags": [root["name"]], "filters": []}}, 201)
snapshot = api("/api/global-control-group")
assert root["name"] in snapshot["availableTags"]
original_exclusions = snapshot["settings"]["exclusionTags"]
api("/api/global-control-group", "PATCH", {"action": "update-exclusions", "exclusionTags": original_exclusions + [root["name"]], "expectedUpdatedAt": snapshot["updatedAt"]})
before_rename = api("/api/global-control-group")
renamed_name = prefix + "_renamed"
renamed = api("/api/tags/" + root["id"], "PATCH", {"name": renamed_name, "expectedUpdatedAt": root["updatedAt"]})
assert renamed["id"] == root["id"]
assert len(renamed["usages"]) == 4
after = api("/api/global-control-group")
assert after["counts"] == before_rename["counts"]
assert after["settings"]["enabled"] == before_rename["settings"]["enabled"]
assert renamed_name in after["settings"]["exclusionTags"] and root["name"] not in after["settings"]["exclusionTags"]
assert after["updatedAt"] != before_rename["updatedAt"]
assert api("/api/canvases/" + canvas["id"])["canvas"]["tags"] == [renamed_name]
assert next(row for row in api("/api/resources/segments")["data"] if row["id"] == segment["id"])["data"]["tags"] == [renamed_name]
api("/api/tags/" + root["id"], "PATCH", {"name": prefix + "_stale", "expectedUpdatedAt": root["updatedAt"]}, 409)
api("/api/tags/" + root["id"] + "?expectedUpdatedAt=" + quote(renamed["updatedAt"]), "DELETE", status=409)

old_draft = api("/api/campaigns/cmp_" + prefix + "one")
old_draft["config"]["tags"] = [root["name"]]
assert api("/api/campaigns/" + old_draft["id"], "PATCH", old_draft)["config"]["tags"] == [renamed_name]

batch = api("/api/tags/campaigns", "POST", {"ids": ["cmp_" + prefix + "one", "cmp_" + prefix + "two"], "tags": [prefix + "_launch"]})
assert set(batch["tags"]) == {renamed_name, child["name"], prefix + "_launch"}
for suffix in ["one", "two"]:
    assert set(api("/api/campaigns/cmp_" + prefix + suffix)["config"]["tags"]) == set(batch["tags"])

api("/api/campaigns/" + old_draft["id"], "PATCH", {"config": {"tags": [prefix + str(i) for i in range(176)]}}, 400)
assert set(api("/api/campaigns/" + old_draft["id"])["config"]["tags"]) == set(batch["tags"])
api("/api/resources/segments", "PATCH", {"id": root["id"], "name": "wrong type"}, 404)
api("/api/resources/tag-management", "PATCH", {"id": root["id"], "name": "bypass version"}, 409)

unused = api("/api/tags", "POST", {"name": prefix + "_unused"}, 201)
api("/api/tags/" + unused["id"] + "?expectedUpdatedAt=" + quote(unused["updatedAt"]), "DELETE")
api("/api/tags/resolve", "POST", {"tags": [unused["name"]]}, 400)
assert api("/api/tags/resolve", "POST", {"tags": [root["name"]]})["tags"] == [renamed_name]

# Source-confirmed global deletion removes an in-use leaf tag from every task.
deleted_child = api("/api/tags/" + child["id"] + "?expectedUpdatedAt=" + quote(child["updatedAt"]), "DELETE")
assert len(deleted_child["usages"]) == 2
for suffix in ["one", "two"]:
    assert child["name"] not in api("/api/campaigns/cmp_" + prefix + suffix)["config"]["tags"]
api("/api/tags/resolve", "POST", {"tags": [child["name"]]}, 400)

# Full Tag As replacement supports removals and clearing Campaign/Canvas/Segment tags.
for resource_type, resource_id in [("canvas", canvas["id"]), ("segments", segment["id"])]:
    replaced = api("/api/tags/resources", "POST", {"resourceType": resource_type, "ids": [resource_id], "tags": [renamed_name, prefix + "_resource_bulk"]})
    assert replaced["tags"] == [renamed_name, prefix + "_resource_bulk"]
    assert api("/api/tags/resources", "POST", {"resourceType": resource_type, "ids": [resource_id], "tags": []})["tags"] == []
assert api("/api/canvases/" + canvas["id"])["canvas"]["tags"] == []
assert next(row for row in api("/api/resources/segments")["data"] if row["id"] == segment["id"])["data"]["tags"] == []
assert api("/api/tags/campaigns", "POST", {"ids": [old_draft["id"]], "tags": [], "mode": "replace"})["tags"] == []
assert api("/api/campaigns/" + old_draft["id"])["config"]["tags"] == []
api("/api/tags/resources", "POST", {"resourceType": "canvas", "ids": [canvas["id"]]}, 400)

# Restore the control-group settings changed by this test, leaving its data fixtures isolated.
snapshot = api("/api/global-control-group")
api("/api/global-control-group", "PATCH", {"action": "update-exclusions", "exclusionTags": original_exclusions, "expectedUpdatedAt": snapshot["updatedAt"]})
# Scoped Canvas/Segment retargeting uses saved rules and actual receipt records.
scope = prefix + "_workspace"
scoped_query = "?workspaceId=" + quote(scope)
scoped_tag = api("/api/tags" + scoped_query, "POST", {"name": prefix + "_scoped"}, 201)
local_journey = api("/api/canvases", "POST", {"name": prefix + "_scope_journey"}, 201)
other_journey = api("/api/canvases", "POST", {"name": local_journey["name"], "workspaceId": scope, "tags": [scoped_tag["name"]]}, 201)
assert other_journey["id"] in [row["id"] for row in api("/api/canvases" + scoped_query)["data"]]
assert other_journey["id"] not in [row["id"] for row in api("/api/canvases")["data"]]
api("/api/canvases/" + other_journey["id"] + "?workspaceId=local", status=404)
api("/api/tags" + scoped_query, "POST", {"name": prefix + "_invalid_parent", "parentId": root["id"]}, 400)
member = api("/api/users?limit=1")["data"][0]["id"]
source_id = "cmp_" + prefix + "_interaction"
api("/api/campaigns", "POST", {"id": source_id, "name": prefix + "_interaction", "channel": "email", "config": {"workspaceId": scope, "tags": [scoped_tag["name"]]}}, 201)
rule = {"id": "clicked", "field": "receipt_tag_count:engaged:" + scoped_tag["id"], "operator": "greater_than", "value": "0", "tagInteraction": "clicked_email"}
scoped_segment = api("/api/resources/segments", "POST", {"name": prefix + "_retargeting", "status": "Active", "data": {"workspaceId": scope, "filters": [rule]}}, 201)
assert scoped_segment["id"] not in [row["id"] for row in api("/api/resources/segments?workspaceId=local")["data"]]
assert scoped_segment["id"] in [row["id"] for row in api("/api/resources/segments" + scoped_query)["data"]]
criteria = {"workspaceId": scope, "audience": {"segmentIds": [scoped_segment["id"]]}, "lookup": member}
assert api("/api/canvases/audience-preview", "POST", criteria)["matching"] == 0
api("/api/campaigns/" + source_id + "/events", "POST", {"userId": member, "event": "clicked"})
preview = api("/api/canvases/audience-preview", "POST", criteria)
assert preview["matching"] == 1 and preview["lookup"]["matchesFilters"] is True
scoped_tag = api("/api/tags/" + scoped_tag["id"] + scoped_query, "PATCH", {"name": prefix + "_scoped_renamed", "expectedUpdatedAt": scoped_tag["updatedAt"]})
assert api("/api/canvases/audience-preview", "POST", criteria)["matching"] == 1
wrong_scope = {**criteria, "workspaceId": "local"}
api("/api/canvases/audience-preview", "POST", wrong_scope, 400)
api("/api/tags/" + scoped_tag["id"] + scoped_query + "&expectedUpdatedAt=" + quote(scoped_tag["updatedAt"]), "DELETE")
assert api("/api/canvases/" + other_journey["id"] + scoped_query)["canvas"]["tags"] == []
api("/api/canvases/audience-preview", "POST", criteria, 400)
api("/api/resources/segments", "PATCH", {"id": scoped_segment["id"], "expectedUpdatedAt": scoped_segment["updatedAt"], "data": scoped_segment["data"]}, 409)
print("Tag API checks passed: CRUD, hierarchy, conflicts, rename, aliases, bulk merge/replace/clear, limits, cascading deletion, workspace isolation, specific interactions, Segment targeting, Canvas population/lookup and stale-rule rejection.")
