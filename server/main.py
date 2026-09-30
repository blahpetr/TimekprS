
from fastapi import Depends, FastAPI, Response, status, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import FileResponse
from pydantic import BaseModel

from typing import Annotated
import hashlib
import os

class Item(BaseModel):
    name: str

app = FastAPI()
security = HTTPBasic()

USERNAME = "admin"
PASSWORD = "admin" #NOTE: Replace me with better password saving later

@app.get("/api/timekpr/hello", status_code=200)
async def hello():
    return {"message": "Hi!"}

@app.get("/api/timekpr/authenticate", status_code=200)
async def private(credentials: Annotated[HTTPBasicCredentials, Depends(security)]):
    if credentials.username == USERNAME and credentials.password == PASSWORD:
        return {"Authorised": True}
    else:
        return {"Authorised": False}

@app.get("/api/timekpr/hash")
async def hash(item: str, response: Response):
    if "/" in item:
        raise HTTPException(status_code = 400, detail="Invalid file name")
    else:
        if os.path.isfile("synced/" + item):
            with open("synced/" + item, "rb") as f:
                return {"hash": hashlib.blake2b(f.read(), digest_size=8).hexdigest()}
        else:
            raise HTTPException(status_code = 404, detail="File does not exist")

@app.get("/api/timekpr/file", status_code=200)
async def file(item: str, response: Response):
    if "/" in item:
        raise HTTPException(status_code = 400, detail="Invalid file name")
    else:
        if os.path.isfile("synced/" + item):
            return FileResponse("synced/" + item)
        else:
            raise HTTPException(status_code = 404, detail="File does not exist")

