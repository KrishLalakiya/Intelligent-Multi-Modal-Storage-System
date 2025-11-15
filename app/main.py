# app/main.py

from fastapi import FastAPI
from app.routers import upload_router, retrieve_router
# ADD THESE IMPORTS
from app.routers import json_routes
from app.routers import database_routes
import cloudinary
from dotenv import load_dotenv
import os
from pathlib import Path  # ADD THIS


# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Media Storage API")

@app.on_event("startup")
async def startup_event():
    """
    Configure Cloudinary on app startup and create storage directories.
    """
    # Cloudinary configuration (for images/videos) - KEEP EXISTING
    cloudinary.config(
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key = os.getenv("CLOUDINARY_API_KEY"),
        api_secret = os.getenv("CLOUDINARY_API_SECRET"),
        secure = True  # Ensure all URLs are HTTPS
    )
    print("✅ Cloudinary configuration loaded.")
    
    # CREATE STORAGE DIRECTORIES FOR JSON FILES - KEEP EXISTING
    storage_dirs = [
        "app/storage/databases/sql",
        "app/storage/databases/nosql", 
        "app/storage/temp"
    ]
    
    for directory in storage_dirs:
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    print("✅ JSON storage directories created.")
    
    # ADD INTERNAL DATABASE DIRECTORIES - NEW
    internal_db_dirs = [
        "app/storage/internal_databases/tables",
        "app/storage/internal_databases/collections",
        "app/storage/internal_databases/schemas"
    ]
    
    for directory in internal_db_dirs:
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    print("✅ Internal database directories created.")


# INCLUDE ALL ROUTERS - KEEP EXISTING
app.include_router(upload_router.router, prefix="/api", tags=["Upload"])
# ADD JSON ROUTES - KEEP EXISTING
app.include_router(json_routes.router, prefix="/api", tags=["JSON Processing"])
# ADD DATABASE ROUTES - NEW
app.include_router(database_routes.router, prefix="/api", tags=["Internal Databases"])

# We will disable the local retrieve router for now, as Cloudinary handles delivery - KEEP EXISTING
# app.include_router(retrieve_router.router, prefix="/api", tags=["Retrieve"])

@app.get("/")
async def root():
    return {
        "message": "Welcome to the Media Storage API", 
        "endpoints": {
            "upload_media": "/api/upload - Upload images/videos to Cloudinary",
            "upload_json": "/api/json/upload - Upload and analyze JSON files",
            "list_json": "/api/json/files - List stored JSON files",
            # ADD NEW ENDPOINTS
            "internal_dbs": "/api/database - Internal database operations",
            "list_tables": "/api/database/tables - List SQL tables", 
            "list_collections": "/api/database/collections - List NoSQL collections",
            "db_stats": "/api/database/stats - Get database statistics"
        }
    }

# ADD HEALTH CHECK ENDPOINT - NEW
@app.get("/health")
async def health_check():
    """
    System health check
    """
    return {
        "status": "healthy",
        "cloudinary_configured": bool(os.getenv("CLOUDINARY_CLOUD_NAME")),
        "storage_directories": {
            "images": "Cloudinary (external)",
            "json_files": "Internal storage", 
            "databases": "Internal simulation"
        },
        "external_apis": {
            "cloudinary": "For images/videos only",
            "databases": "None - using internal storage"
        }
    }