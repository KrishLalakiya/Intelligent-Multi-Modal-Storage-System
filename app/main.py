from fastapi import FastAPI
from app.routers import upload_router, retrieve_router, json_routes, database_routes
import cloudinary
from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Media Storage API")

@app.on_event("startup")
async def startup_event():
    """
    Configure Cloudinary based on STORAGE_MODE and create all storage directories.
    """
    
    # --- 1. Cloudinary Config (From your first file, with the toggle) ---
    storage_mode = os.getenv("STORAGE_MODE", "local")  # Default to "local"
    
    if storage_mode in ("online", "both"):
        if not os.getenv("CLOUDINARY_CLOUD_NAME"):
            print("WARNING: STORAGE_MODE is 'online' or 'both' but Cloudinary keys are not set.")
        else:
            cloudinary.config(
                cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
                api_key = os.getenv("CLOUDINARY_API_KEY"),
                api_secret = os.getenv("CLOUDINARY_API_SECRET"),
                secure = True
            )
            print(f"✅ Startup: Storage mode '{storage_mode}'. Cloudinary configured.")
    else:
        print(f"✅ Startup: Storage mode '{storage_mode}'. Cloudinary is OFF.")

    # --- 2. Directory Creation (From your second file, plus media) ---
    # Ensures all local folders exist for all features
    storage_dirs = [
        # For local media storage
        "storage/images",
        "storage/videos",
        # For JSON file storage
        "app/storage/databases/sql",
        "app/storage/databases/nosql", 
        "app/storage/temp",
        # For internal database simulation
        "app/storage/internal_databases/tables",
        "app/storage/internal_databases/collections",
        "app/storage/internal_databases/schemas"
    ]
    
    for directory in storage_dirs:
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    print(f"✅ All {len(storage_dirs)} storage directories ensured.")


# --- 3. Include All Routers ---
app.include_router(upload_router.router, prefix="/api", tags=["Media Upload"])
app.include_router(json_routes.router, prefix="/api", tags=["JSON Processing"])
app.include_router(database_routes.router, prefix="/api", tags=["Internal Databases"])

# --- 4. Conditional Local Retrieve Router (The key feature) ---
# Only include the local file server if mode is 'local' or 'both'
storage_mode = os.getenv("STORAGE_MODE", "local")
if storage_mode in ("local", "both"):
    app.include_router(retrieve_router.router, prefix="/api", tags=["Media Retrieve (Local)"])
    print("✅ Media Retrieve (Local) router is ACTIVE.")
else:
    print("✅ Media Retrieve (Local) router is INACTIVE (online-only mode).")


# --- 5. Enhanced Root Endpoint (From your second file) ---
@app.get("/")
async def root():
    storage_mode = os.getenv("STORAGE_MODE", "local")
    retrieve_endpoint = "/api/files/{category}/{extension}/{filename}" \
        if storage_mode in ("local", "both") else "DISABLED (Online-Only Mode)"

    return {
        "message": "Welcome to the Media Storage API", 
        "storage_mode": storage_mode,
        "endpoints": {
            "upload_media": "/api/upload - Upload images/videos",
            "retrieve_media": retrieve_endpoint,
            "upload_json": "/api/json/upload - Upload and analyze JSON files",
            "list_json": "/api/json/files - List stored JSON files",
            "internal_dbs": "/api/database - Internal database operations",
            "list_tables": "/api/database/tables - List SQL tables", 
            "list_collections": "/api/database/collections - List NoSQL collections",
            "db_stats": "/api/database/stats - Get database statistics",
            "health_check": "/health"
        }
    }

# --- 6. Health Check Endpoint (From your second file, but improved) ---
@app.get("/health")
async def health_check():
    """
    System health check that respects the STORAGE_MODE.
    """
    storage_mode = os.getenv("STORAGE_MODE", "local")
    cloudinary_configured = False
    
    if storage_mode in ("online", "both"):
         cloudinary_configured = bool(os.getenv("CLOUDINARY_CLOUD_NAME"))

    return {
        "status": "healthy",
        "storage_mode": storage_mode,
        "cloudinary_configured": cloudinary_configured,
        "storage_type": {
            "media_files": "local/online" if storage_mode == "both" else storage_mode,
            "json_files": "local/online" if storage_mode == "both" else storage_mode,
            "databases": "Internal simulation (local only)"
        }
    }