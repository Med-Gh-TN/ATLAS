from fastapi import APIRouter
from . import command

router = APIRouter()

router.include_router(command.router)
