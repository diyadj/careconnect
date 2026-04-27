from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from routes.profile import read_profile

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(req: LoginRequest):
    profile = read_profile()
    expected_username = profile.get("account_username", "admin")
    expected_password = profile.get("account_password", "careconnect123")

    if req.username != expected_username or req.password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    return {"status": "ok", "username": req.username}
