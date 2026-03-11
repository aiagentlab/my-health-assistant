"""Pydantic 요청/응답 스키마"""
from pydantic import BaseModel
from typing import Optional, List

class ConsultationStartResponse(BaseModel):
    session_id: str
    phase: str

class MessageRequest(BaseModel):
    session_id: str
    message: str

class HospitalSearchResponse(BaseModel):
    hospitals: List[dict]
    total: int
    dept_code: str

class DirectionsResponse(BaseModel):
    walking_min: Optional[int]
    transit_min: Optional[int]
    driving_min: Optional[int]
