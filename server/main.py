from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel
import hashlib

class Item(BaseModel):
    name: str

app = FastAPI()

@app.get("/api/timekpr/hello")
def hello():
    return {"message": "Hi!"}

@app.get("/api/timekpr/hash")
def hash(item: str):
    with open("synced/" + item, "rb") as f:
        return {"hash": hashlib.blake2b(f.read(), digest_size=8).hexdigest()}

@app.get("/api/timekpr/file")
def file(item: str):
    return FileResponse("synced/" + item)
