"""Current Canvas HTTP acceptance against an explicitly isolated localhost server.

BASE_URL=http://127.0.0.1:3240 BRAZE_DATABASE_PATH=/private/tmp/canvas.sqlite \
NODE_BINARY=/path/to/node22 python3 tests/canvas-runtime-api.py

The existing server and the Node fixture runner must share this SQLite file.
Node 22.22.3+ is required by scripts/register-runtime.mjs. Fixtures use a unique
workspace, fake .test addresses and fake device tokens. Controlled worker ticks
run with delivery disabled. Fixtures remain in the isolated DB for inspection.
"""
import copy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("BASE_URL", "").rstrip("/")
DATABASE = os.environ.get("BRAZE_DATABASE_PATH", "")
NODE = os.environ.get("NODE_BINARY", "node")
SCOPE = "canvas_http_" + uuid4().hex
FOREIGN_SCOPE = SCOPE + "_foreign"
USER_IDS = [SCOPE + "_user_" + str(index).zfill(3) for index in range(125)]
FOREIGN_USER = FOREIGN_SCOPE + "_user"

NODE_PROGRAM = r"""
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import * as store from './lib/braze-store.ts';
import {defaultCanvasWizard} from './lib/canvas-wizard-model.ts';
const input=JSON.parse(readFileSync(0,'utf8'));
let result;
if(input.action==='seed'){
 store.applyProfileRows(input.userIds.map((id,index)=>({external_id:id,email:id+'@example.test',first_name:'Fixture '+index,country:'US',attributes:{workspaceId:input.workspaceId,push_token:'fake-device-'+id}})),input.workspaceId);
 store.applyProfileRows([{external_id:input.foreignUser,email:input.foreignUser+'@example.test',country:'US'}],input.foreignWorkspaceId);
 result={wizard:defaultCanvasWizard};
}else if(input.action==='advance')result=await store.processCanvasRuntime(input.at,1000);
else if(input.action==='event')result=store.trackProfileEvent({userId:input.userId,name:input.name,properties:input.properties??{}});
else if(input.action==='snapshot'){
 const db=new DatabaseSync(process.env.BRAZE_DATABASE_PATH,{readOnly:true});
 try{result={users:input.userIds.map(id=>store.getUser(id)),events:db.prepare('SELECT id,event_type,data_json FROM message_events WHERE campaign_id=? ORDER BY id').all(input.canvasId)};}finally{db.close();}
}else throw Error('Unknown isolated fixture action.');
console.log(JSON.stringify(result));
"""


def expect(condition, explanation, evidence=None):
    if not condition:
        detail = "\n" + json.dumps(evidence, ensure_ascii=False)[:8000] if evidence is not None else ""
        raise AssertionError(explanation + detail)


def request(path, method="GET", payload=None, status=200):
    body = None if payload is None else json.dumps(payload).encode()
    req = Request(BASE + path, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=120) as response:
            actual, raw = response.status, response.read()
    except HTTPError as error:
        actual, raw = error.code, error.read()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as error:
        raise AssertionError(f"{method} {path} returned non-JSON HTTP {actual}: {raw[:500]!r}") from error
    expect(actual == status, f"{method} {path}: expected HTTP {status}, received {actual}", result)
    return result


def fixture(action, **payload):
    env = {**os.environ, "BRAZE_DATABASE_PATH": str(Path(DATABASE).resolve()), "MESSAGE_DELIVERY_ENABLED": "false"}
    result = subprocess.run(
        [NODE, "--conditions=react-server", "--experimental-transform-types", "--import", str(ROOT / "scripts/register-runtime.mjs"), "--input-type=module", "--eval", NODE_PROGRAM],
        input=json.dumps({"action": action, **payload}), text=True, capture_output=True, cwd=ROOT, env=env, timeout=120,
    )
    expect(result.returncode == 0, f"Native fixture action {action} failed; use Node 22.22.3+ and the server's isolated SQLite file.", result.stderr)
    return json.loads(result.stdout)


def iso(at):
    return at.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def node(identifier, kind, config=None):
    result = {"id": identifier, "kind": kind, "label": identifier, "x": 100, "y": 100}
    if config is not None:
        result["config"] = config
    return result


def graph(*nodes):
    return {"nodes": list(nodes), "edges": [[one["id"], two["id"]] for one, two in zip(nodes, nodes[1:])]}


def scoped(canvas_id, suffix="", workspace=SCOPE):
    return f"/api/canvases/{canvas_id}{suffix}?" + urlencode({"workspaceId": workspace})


def create_canvas(label, journey, defaults, entry=None):
    canvas = request("/api/canvases", "POST", {"name": SCOPE + " " + label, "workspaceId": SCOPE}, status=201)
    saved = request(scoped(canvas["id"], "/graph"), "PUT", {"workspaceId": SCOPE, "updatedAt": canvas["updatedAt"], "graph": journey})
    wizard = copy.deepcopy(defaults)
    wizard["entry"].update({"timing": "immediate", **(entry or {})})
    wizard["audience"]["filters"] = [{"id": "fixture-country", "field": "country", "operator": "is", "value": "US"}]
    request(scoped(canvas["id"]), "PATCH", {"workspaceId": SCOPE, "updatedAt": saved["updatedAt"], "wizard": wizard})
    return canvas["id"]


def profile_http(user_id):
    found = request("/api/users?" + urlencode({"q": user_id}))["data"]
    return next((user for user in found if user["id"] == user_id), None)


def main():
    parsed = urlsplit(BASE)
    expect(bool(BASE) and parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"} and not parsed.username and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment, "Set BASE_URL explicitly to the existing isolated HTTP localhost server.")
    expect(bool(DATABASE) and Path(DATABASE).is_absolute() and Path(DATABASE).is_file(), "Set BRAZE_DATABASE_PATH explicitly to the existing isolated server SQLite file.")
    seeded = fixture("seed", workspaceId=SCOPE, userIds=USER_IDS, foreignUser=FOREIGN_USER, foreignWorkspaceId=FOREIGN_SCOPE)
    expect(profile_http(USER_IDS[0]) is not None, "BASE_URL and BRAZE_DATABASE_PATH do not share the same fixture database.")
    print("Fixture workspace:", SCOPE, flush=True)

    journey = graph(
        node("entry", "entry"), node("delay", "delay", {"durationHours": 1}),
        node("update", "update", {"attribute": "runtime_http_entered", "value": "yes"}),
        node("push", "message", {"channel": "push", "subject": "HTTP fixture", "message": "Hello {{first_name}}"}),
    )
    canvas_id = create_canvas("125 users", journey, seeded["wizard"])
    run = request(scoped(canvas_id, "/launch"), "POST", {}, status=201)
    expect(run["entered"] == 125 and run["completed"] == 0 and len(run["traces"]) == 125, "Launch must enroll all 125 workspace users and wait at Delay, without the former 100/10 caps.", run)
    expect(all([step["nodeId"] for step in trace["steps"]] == ["entry", "delay"] for trace in run["traces"]), "Launch must stop each user at the real Delay.")
    fixture("advance", at=iso(datetime.now(timezone.utc) + timedelta(hours=2)))
    resumed = next(row for row in request(scoped(canvas_id))["runs"] if row["id"] == run["id"])
    expect(resumed["completed"] == 125 and resumed["messages"] == 125, "The controlled worker tick must resume all 125 users and prepare their messages.", resumed)
    state = fixture("snapshot", canvasId=canvas_id, userIds=USER_IDS)
    expect(all(user["attributes"].get("runtime_http_entered") == "yes" for user in state["users"]), "All 125 users must execute User Update.")
    expect(len(state["events"]) == 125 and all(row["event_type"] == "prepared" and json.loads(row["data_json"])["delivery"]["delivered"] is False for row in state["events"]), "Delivery-disabled execution must record prepared outcomes, never delivered receipts.", state["events"][:3])
    second = request(scoped(canvas_id, "/launch"), "POST", {}, status=201)
    expect(second["entered"] == 0, "The same users must not re-enter a Canvas with re-entry disabled.", second)
    request(scoped(canvas_id, "/launch", FOREIGN_SCOPE), "POST", {}, status=404)
    revision = request(scoped(canvas_id))["updatedAt"]
    request(scoped(canvas_id, "/graph", FOREIGN_SCOPE), "PUT", {"workspaceId": FOREIGN_SCOPE, "updatedAt": revision, "graph": journey}, status=404)
    expect(request(scoped(canvas_id))["updatedAt"] == revision, "A foreign graph write must leave the Canvas revision unchanged.")
    print("PASS: 125 users, delay/resume, prepared outcomes, no re-entry and foreign-write isolation", flush=True)

    preview_graph = graph(
        node("entry", "entry"), node("preview-update", "update", {"attribute": "preview_only", "value": "simulated"}),
        node("preview-push", "message", {"channel": "push", "subject": "Preview", "message": "Hello {{first_name}}"}),
    )
    preview_id = create_canvas("pure preview", preview_graph, seeded["wizard"])
    before = fixture("snapshot", canvasId=preview_id, userIds=[USER_IDS[0]])
    users = request(scoped(preview_id, "/test") + "&" + urlencode({"q": USER_IDS[0]}))["users"]
    expect(any(user["id"] == USER_IDS[0] for user in users), "Test-user search must find the scoped fixture user.", users)
    tested = request(scoped(preview_id, "/test"), "POST", {"workspaceId": SCOPE, "userId": USER_IDS[0], "sendMessages": False})
    expect(tested["preview"]["status"] == "completed" and tested["preview"]["profileAfter"]["preview_only"] == "simulated" and tested["deliveries"] == [], "Preview must simulate the authored update and compile the path without sending.", tested)
    expect(fixture("snapshot", canvasId=preview_id, userIds=[USER_IDS[0]]) == before, "Pure preview must leave the real profile and message-event table unchanged.")
    request(scoped(preview_id, "/test", FOREIGN_SCOPE), status=404)
    request(scoped(preview_id, "/test"), "POST", {"workspaceId": SCOPE, "userId": FOREIGN_USER}, status=404)
    standard = request("/api/resources/campaign-standards", "POST", {"name": SCOPE + " message content", "status": "Active", "data": {"workspaceId": SCOPE, "rules": [{"id": "content", "type": "required", "field": "message", "nodeKinds": ["message"]}]}}, status=201)
    evaluation = request(scoped(preview_id, "/evaluation"), "POST", {"workspaceId": SCOPE, "standardIds": [standard["id"]]})
    expect(evaluation["run"]["status"] == "passed" and evaluation["run"]["findings"][0]["nodeId"] == "preview-push", "Evaluation must execute the saved structural rule against the message step.", evaluation)
    expect(any(row["id"] == evaluation["runId"] for row in request(scoped(preview_id, "/evaluation"))["data"]), "The evaluation run must persist and be observable over HTTP.")
    request(scoped(preview_id, "/evaluation"), "POST", {"workspaceId": FOREIGN_SCOPE, "standardIds": [standard["id"]]}, status=404)
    print("PASS: pure preview, profile/event immutability, scoped users and persisted Standards evaluation", flush=True)

    api_id = create_canvas("API trigger", graph(node("entry", "entry"), node("api-update", "update", {"attribute": "http_api_entered", "value": "yes"})), seeded["wizard"], {"type": "api"})
    expect(request(scoped(api_id, "/launch"), "POST", {}, status=201)["entered"] == 0, "Activating an API-triggered Canvas must not enroll its audience.")
    payload = {"workspaceId": SCOPE, "userIds": USER_IDS[:2], "requestId": "same-request", "properties": {"source": "http-acceptance"}}
    first = request(scoped(api_id, "/trigger"), "POST", payload, status=202)
    repeated = request(scoped(api_id, "/trigger"), "POST", payload, status=202)
    expect(first["entered"] == 2 and repeated["entered"] == 0 and repeated["id"] == first["id"], "The API must enroll requested users once and deduplicate the request ID.", {"first": first, "repeated": repeated})
    request(scoped(api_id, "/trigger", FOREIGN_SCOPE), "POST", {**payload, "workspaceId": FOREIGN_SCOPE}, status=404)
    expect(profile_http(USER_IDS[0])["attributes"].get("http_api_entered") == "yes", "The API-triggered journey must execute its authored update.")
    print("PASS: API activation, requested recipients, request deduplication and foreign-workspace 404", flush=True)

    event_name = SCOPE + "_checkout"
    action_id = create_canvas("action entry", graph(node("entry", "entry"), node("action-update", "update", {"attribute": "http_action_entered", "value": "yes"})), seeded["wizard"], {"type": "action", "startDate": (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat(), "startTime": "00:00", "timeZone": "UTC", "triggers": ["Perform Custom Event"], "triggerDetails": [{"id": "checkout", "type": "Perform Custom Event", "eventName": event_name}]})
    expect(request(scoped(action_id, "/launch"), "POST", {}, status=201)["entered"] == 0, "Action-Based activation must wait for a matching event.")
    fixture("event", userId=USER_IDS[0], name=event_name + "_other")
    expect(not profile_http(USER_IDS[0])["attributes"].get("http_action_entered"), "An unmatched event must not enter the Action-Based Canvas.")
    fixture("event", userId=USER_IDS[0], name=event_name)
    expect(profile_http(USER_IDS[0])["attributes"].get("http_action_entered") == "yes", "A tracked matching event must enter and execute the Action-Based Canvas.")

    due = (datetime.now(timezone.utc) + timedelta(hours=3)).replace(second=0, microsecond=0)
    scheduled_id = create_canvas("scheduled entry", graph(node("entry", "entry"), node("scheduled-update", "update", {"attribute": "http_scheduled_entered", "value": "yes"})), seeded["wizard"], {"type": "scheduled", "timing": "designated", "frequency": "Once", "startDate": due.date().isoformat(), "startTime": due.strftime("%H:%M"), "timeZone": "UTC"})
    expect(request(scoped(scheduled_id, "/launch"), "POST", {}, status=201)["entered"] == 0, "Designated-time activation must not enroll users early.")
    fixture("advance", at=iso(due - timedelta(seconds=1)))
    expect(not profile_http(USER_IDS[0])["attributes"].get("http_scheduled_entered"), "Scheduled users must wait until the designated instant.")
    fixture("advance", at=iso(due))
    scheduled_runs = request(scoped(scheduled_id))["runs"]
    expect(sum(row["entered"] for row in scheduled_runs) == 125 and sum(row["completed"] for row in scheduled_runs) == 125, "The designated occurrence must enter and complete all 125 scoped users.", scheduled_runs)
    fixture("advance", at=iso(due + timedelta(seconds=1)))
    expect(request(scoped(scheduled_id))["runs"] == scheduled_runs, "A repeated worker sweep must not duplicate the one-time occurrence.")
    print("PASS: actual Action-Based ingestion and designated-time execution without early or repeated enrollment", flush=True)
    print("PASS: current Canvas HTTP acceptance; isolated fixture workspace retained:", SCOPE)


if __name__ == "__main__":
    main()
