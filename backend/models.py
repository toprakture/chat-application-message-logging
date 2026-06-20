from sqlalchemy import Column, Integer, String, DateTime
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_username = Column(String, index=True)
    receiver_username = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    content = Column(String)
