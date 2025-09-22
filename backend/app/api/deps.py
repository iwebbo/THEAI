from typing import Generator

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.database import SessionLocal, get_db

# Réutilisation de la fonction get_db du module database