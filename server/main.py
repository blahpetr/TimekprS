
from fastapi import Depends, FastAPI, Response, status, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from typing import Annotated
import hashlib
import os
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
SYNC_DIR = Path(os.environ.get("TIMEKPRS_SYNC_DIR", SERVER_DIR / "synced")).resolve()

class File(BaseModel):
    name: str
    monday: list[int]
    tuesday: list[int]
    wednesday: list[int]
    thursday: list[int]
    friday: list[int]
    saturday: list[int]
    sunday: list[int]
    week: list[int]

app = FastAPI()
security = HTTPBasic()
app.mount("/static", StaticFiles(directory=SERVER_DIR / "static"), name="static")

USERNAME = "admin"
PASSWORD = "admin" #NOTE: Replace me with better password saving later

def writeFile(filename: str, hours: list[list[int]], week: list[int]):
    with open(SYNC_DIR / filename, "r") as file:
        lines = file.readlines()
    for i in range(0, 7):
            lines[i + 9] = "ALLOWED_HOURS_" + str(i+1) + " = " + (";".join(str(n) for n in hours[i])) + "\n"
    lines[17] = "ALLOWED_WEEKDAYS = " + (";".join(str(n) for n in week)) + "\n"
    with open(SYNC_DIR / filename, "w") as file:
        file.writelines(lines)
    return

def readFile(filename: str):
    with open(SYNC_DIR / filename, "r") as file:
        lines = file.readlines()
    return {"name": filename, 
    "monday": lines[9].split('=')[1].strip().split(';'), 
    "tuesday": lines[10].split('=')[1].strip().split(';'), 
    "wednesday": lines[11].split('=')[1].strip().split(';'), 
    "thursday": lines[12].split('=')[1].strip().split(';'), 
    "friday": lines[13].split('=')[1].strip().split(';'), 
    "saturday": lines[14].split('=')[1].strip().split(';'), 
    "sunday": lines[15].split('=')[1].strip().split(';'), 
    "week": lines[17].split('=')[1].strip().split(';')}

def checkFilename(filename: str):
    if not filename or "/" in filename or "\\" in filename or (SYNC_DIR / filename).resolve().parent != SYNC_DIR:
        raise HTTPException(status_code = 400, detail="Invalid file name")
    else:
        if (SYNC_DIR / filename).is_file():
            return True
        else:
            raise HTTPException(status_code = 404, detail="File does not exist")

@app.get("/", include_in_schema=False)
async def dashboard():
    return FileResponse(SERVER_DIR / "static" / "index.html")

@app.get("/api/timekpr/files")
async def files():
    """List the Timekpr configuration files available to the dashboard."""
    if not SYNC_DIR.is_dir():
        return {"files": []}
    return {"files": sorted(
        path.name for path in SYNC_DIR.glob("timekpr.*.conf")
        if path.is_file() and path.resolve().parent == SYNC_DIR
    )}

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
async def hash(item: str):
    checkFilename(item)

    with open(SYNC_DIR / item, "rb") as f:
        return {"hash": hashlib.blake2b(f.read(), digest_size=8).hexdigest()}

@app.get("/api/timekpr/file", status_code=200)
async def file(item: str, file: bool):
    checkFilename(item)
    if file:
        return FileResponse(SYNC_DIR / item)
    else:
        return readFile(item)

@app.put("/api/timekpr/file", status_code=205)
async def edit(credentials: Annotated[HTTPBasicCredentials, Depends(security)], file: File):
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code = 403, detail="Invalid username or password")

    hours = [file.monday, file.tuesday, file.wednesday, file.thursday, file.friday, file.saturday, file.sunday]
    if all(0 <= x <= 23 for lst in hours for x in lst) and all(1 <= x <= 7 for x in file.week):
        checkFilename(file.name)
        writeFile(file.name, hours, file.week)
        return Response(status_code=205)
    else:
        raise HTTPException(status_code = 422, detail="Invalid intigers given")
