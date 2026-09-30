
from fastapi import Depends, FastAPI, Response, status, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import FileResponse
from pydantic import BaseModel

from typing import Annotated
import hashlib
import os

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

USERNAME = "admin"
PASSWORD = "admin" #NOTE: Replace me with better password saving later

def writeFile(filename: str, hours: list[list[int]], week: list[int]):
    with open("synced/" + filename, "r") as file:
        lines = file.readlines()
    for i in range(0, 7):
            lines[i + 9] = "ALLOWED_HOURS_" + str(i+1) + " = " + (";".join(str(n) for n in hours[i])) + "\n"
    lines[17] = "ALLOWED_WEEKDAYS = " + (";".join(str(n) for n in week)) + "\n"
    with open("synced/" + filename, "w") as file:
        file.writelines(lines)
    return

def readFile(filename: str):
    with open("synced/" + filename, "r") as file:
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
    if "/" in filename:
        raise HTTPException(status_code = 400, detail="Invalid file name")
    else:
        if os.path.isfile("synced/" + filename):
            return True
        else:
            raise HTTPException(status_code = 404, detail="File does not exist")

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

    with open("synced/" + item, "rb") as f:
        return {"hash": hashlib.blake2b(f.read(), digest_size=8).hexdigest()}

@app.get("/api/timekpr/file", status_code=200)
async def file(item: str, file: bool):
    checkFilename(item)
    if file:
        return FileResponse("synced/" + item)
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

