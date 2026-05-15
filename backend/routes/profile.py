import os
import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

PROFILE_FILE = os.path.join(os.path.dirname(__file__), "../data/profile.json")

DEFAULT_PROFILE = {
    "parent_first_name": "",
    "parent_last_name": "",
    "parent_email": "",
    "parent_phone": "",
    "invoice_address": "",
    "child_first_name": "",
    "child_last_name": "",
    "child_ahv_number": "756.",
    "date_of_birth": "",
    "notes": "",
    "account_username": "anna.mueller",
    "account_password": "careconnect123",
}


def read_profile() -> dict:
    if not os.path.exists(PROFILE_FILE):
        return DEFAULT_PROFILE.copy()
    with open(PROFILE_FILE, "r") as f:
        data = json.load(f)
    # backfill any new fields
    for k, v in DEFAULT_PROFILE.items():
        data.setdefault(k, v)
    return data


def write_profile(data: dict):
    os.makedirs(os.path.dirname(PROFILE_FILE), exist_ok=True)
    with open(PROFILE_FILE, "w") as f:
        json.dump(data, f, indent=2)


class ProfileUpdate(BaseModel):
    parent_first_name: Optional[str] = None
    parent_last_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    invoice_address: Optional[str] = None
    child_first_name: Optional[str] = None
    child_last_name: Optional[str] = None
    child_ahv_number: Optional[str] = None
    date_of_birth: Optional[str] = None
    notes: Optional[str] = None
    account_username: Optional[str] = None
    account_password: Optional[str] = None


@router.get("")
def get_profile():
    profile = read_profile()
    # Never expose the password in GET — return a masked sentinel instead
    safe = {**profile, "account_password": "••••••••" if profile.get("account_password") else ""}
    return safe


@router.put("")
def update_profile(updates: ProfileUpdate):
    profile = read_profile()
    for field in (
        "parent_first_name",
        "parent_last_name",
        "parent_email",
        "parent_phone",
        "invoice_address",
        "child_first_name",
        "child_last_name",
        "child_ahv_number",
        "date_of_birth",
        "notes",
        "account_username",
    ):
        val = getattr(updates, field)
        if val is not None:
            profile[field] = val
    # Only update password if a real value (not the masked sentinel) is provided
    if updates.account_password is not None and updates.account_password != "••••••••":
        profile["account_password"] = updates.account_password
    write_profile(profile)
    safe = {**profile, "account_password": "••••••••" if profile.get("account_password") else ""}
    return safe
