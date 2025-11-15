from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware 

# Import your new files_router
from app.routers import upload_router, retrieve_router, json_routes, database_routes, files_router
import cloudinary
from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Media Storage API")

# --- 2. DEFINE YOUR FRONTEND'S URL (THE "WHITELIST") ---
origins = [
    "http://localhost",
    "http://localhost:5500",  # Your frontend (from screenshot)
    "http://127.0.0.1:5500" # Also for your frontend
]

# --- 3. ADD THE CORS MIDDLEWARE TO YOUR APP ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,     # Allow the origins list
    allow_credentials=True,    # Allow cookies
    allow_methods=["*"],       # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],       # Allow all headers
)


@app.on_event("startup")
async def startup_event():
    """
    Configure Cloudinary based on STORAGE_MODE and create all storage directories.
    """
    
    # 1. Cloudinary Config (with the toggle)
    storage_mode = os.getenv("STORAGE_MODE", "local")    
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

    # 2. Directory Creation
    storage_dirs = [
        "storage/images", "storage/videos", "app/storage/databases/sql",
        "app/storage/databases/nosql", "app/storage/temp",
        "app/storage/internal_databases/tables",
        "app/storage/internal_databases/collections",
        "app/storage/internal_databases/schemas"
    ]
    for directory in storage_dirs:
        Path(directory).mkdir(parents=True, exist_ok=True)
    print(f"✅ All {len(storage_dirs)} storage directories ensured.")


# --- 3. Include All Routers (with NO '/api' prefix) ---
app.include_router(upload_router.router, tags=["Media Upload"])
app.include_router(json_routes.router, tags=["JSON Processing"])
app.include_router(database_routes.router, tags=["Internal Databases"])
app.include_router(files_router.router, tags=["File Management"])

# 4. Conditional Local Retrieve Router
storage_mode = os.getenv("STORAGE_MODE", "local")
if storage_mode in ("local", "both"):
    # This router provides GET /files/{category}/{extension}/{filename}
    app.include_router(retrieve_router.router, tags=["Media Retrieve (Local)"])
    print("✅ Media Retrieve (Local) router is ACTIVE.")
else:
    print("✅ Media Retrieve (Local) router is INACTIVE (online-only mode).")


# --- 5. Enhanced Root Endpoint ---
@app.get("/")
async def root():
    storage_mode = os.getenv("STORAGE_MODE", "local")
    retrieve_endpoint = "/files/{category}/{extension}/{filename}" \
        if storage_mode in ("local", "both") else "DISABLED (Online-Only Mode)"

    return {
        "message": "Welcome to the FileVibe API", 
        "storage_mode": storage_mode,
        "endpoints": {
            "upload_media": "/upload", # Fixed path
            "upload_json": "/json/upload", # Fixed path
            "list_all_files": "/files", # New
            "search_files": "/search", # New
            "list_categories": "/categories", # New
            "retrieve_media": retrieve_endpoint,
            "list_tables": "/database/tables", 
            "list_collections": "/database/collections",
            "health_check": "/health"
        }
    }

# --- 6. Health Check Endpoint ---
@app.get("/health")
async def health_check():
    # ... (health check logic from your file, no changes needed) ...
    storage_mode = os.getenv("STORAGE_MODE", "local")
    cloudinary_configured = False
    
    if storage_mode in ("online", "both"):
         cloudinary_configured = bool(os.getenv("CLOUDINARY_CLOUD_NAME"))

    return {
        "status": "healthy",
        "storage_mode": storage_mode,
        "cloudinary_configured": cloudinary_configured
    }