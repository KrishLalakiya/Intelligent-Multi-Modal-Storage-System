# app/main.py

from fastapi import FastAPI
from app.routers import upload_router, retrieve_router
import cloudinary
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Media Storage API")

@app.on_event("startup")
async def startup_event():
    """
    Configure Cloudinary on app startup.
    """
    cloudinary.config(
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key = os.getenv("CLOUDINARY_API_KEY"),
        api_secret = os.getenv("CLOUDINARY_API_SECRET"),
        secure = True  # Ensure all URLs are HTTPS
    )
    print("Cloudinary configuration loaded.")


app.include_router(upload_router.router, prefix="/api", tags=["Upload"])
# We will disable the local retrieve router for now, as Cloudinary handles delivery
# app.include_router(retrieve_router.router, prefix="/api", tags=["Retrieve"])

@app.get("/")
async def root():
    return {"message": "Welcome to the Media Storage API. Use /api/upload to post files."}