from fastapi import FastAPI, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
import hashlib
import os

class Item(BaseModel):
    name: str

app = FastAPI()

@app.get("/api/timekpr/hello", status_code=200)
def hello():
    return {"message": "Hi!"}

@app.get("/api/timekpr/hash")
def hash(item: str, response: Response):
    if "/" in item:
        response.status_code = 400
        return
    else:
        if os.path.isfile("synced/" + item):
            with open("synced/" + item, "rb") as f:
                return {"hash": hashlib.blake2b(f.read(), digest_size=8).hexdigest()}
        else:
            response.status_code = 404
            return

@app.get("/api/timekpr/file", status_code=200)
def file(item: str, response: Response):
    if "/" in item:
        response.status_code = 400
        return
    else:
        if os.path.isfile("synced/" + item):
            return FileResponse("synced/" + item)
        else:
            response.status_code = 404
            return
