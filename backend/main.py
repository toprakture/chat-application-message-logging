from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Dict
import json
from datetime import datetime
import os

from database import engine, Base, get_db
import models

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI()

# Mount frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            await self.active_connections[username].send_json(message)

manager = ConnectionManager()

# Endpoint for frontend main page
@app.get("/")
async def get(request: Request):
    with open(os.path.join(frontend_dir, "login.html")) as f:
        return HTMLResponse(f.read())

@app.get("/chat")
async def chat_page(request: Request):
    with open(os.path.join(frontend_dir, "index.html")) as f:
        return HTMLResponse(f.read())

# Simple login endpoint
@app.post("/login")
async def login(data: dict, db: Session = Depends(get_db)):
    username = data.get("username")
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        user = models.User(username=username)
        db.add(user)
        db.commit()
        db.refresh(user)
        
    return {"user_id": user.id, "username": user.username}

@app.get("/users")
async def get_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    return [{"username": u.username} for u in users]

@app.get("/history")
async def get_history(contact: str, current_user: str, db: Session = Depends(get_db)):
    messages = db.query(models.Message).filter(
        or_(
            and_(models.Message.sender_username == current_user, models.Message.receiver_username == contact),
            and_(models.Message.sender_username == contact, models.Message.receiver_username == current_user)
        )
    ).order_by(models.Message.timestamp.asc()).all()
    
    return [
        {
            "sender": m.sender_username,
            "receiver": m.receiver_username,
            "content": m.content,
            "timestamp": m.timestamp.isoformat() + "Z"
        } for m in messages
    ]

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str, db: Session = Depends(get_db)):
    # Ensure user exists in DB (fixes issue where localStorage bypasses /login)
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        user = models.User(username=username)
        db.add(user)
        db.commit()

    await manager.connect(websocket, username)
    
    # Broadcast to everyone that a new user might have joined (to refresh contacts)
    for connection in manager.active_connections.values():
        await connection.send_json({"type": "system", "action": "refresh_contacts"})
    
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            receiver = payload.get("receiver")
            content = payload.get("content")
            
            if not receiver or not content:
                continue
                
            # Save message to database
            new_message = models.Message(
                sender_username=username,
                receiver_username=receiver,
                content=content,
                timestamp=datetime.utcnow()
            )
            db.add(new_message)
            db.commit()
            
            # Broadcast to receiver and sender
            message_data = {
                "sender": username,
                "receiver": receiver,
                "content": content,
                "timestamp": new_message.timestamp.isoformat() + "Z"
            }
            
            # Send to receiver if online
            if receiver != username:
                await manager.send_personal_message(message_data, receiver)
            # Send back to sender so they see their own message
            await manager.send_personal_message(message_data, username)
            
    except WebSocketDisconnect:
        manager.disconnect(username)
