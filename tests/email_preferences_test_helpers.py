import json
import os
from urllib.error import HTTPError
from urllib.request import Request,urlopen
BASE=os.environ.get("BASE_URL","http://127.0.0.1:3100")

def request(path, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = Request(BASE + path, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req) as response:
            text = response.read()
            return response.status, json.loads(text) if text else None
    except HTTPError as error:
        return error.code, json.loads(error.read())
