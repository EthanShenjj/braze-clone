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

# Restore the control-group settings changed by this test, leaving its data fixtures isolated.
snapshot = api("/api/global-control-group")
api("/api/global-control-group", "PATCH", {"action": "update-exclusions", "exclusionTags": original_exclusions, "expectedUpdatedAt": snapshot["updatedAt"]})
print("Tag API checks passed: hierarchy, conflicts, cross-resource rename, GCG stability, aliases, bulk union, limits, deletion and legacy-route guards.")
