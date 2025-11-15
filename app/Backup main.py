from fastapi import FastAPI
from app.routers import upload_router, retrieve_router  # <-- Re-import retrieve_router
import cloudinary
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Media Storage API")

@app.on_event("startup")
async def startup_event():
    """
    Configure Cloudinary on app startup ONLY if mode is 'online' or 'both'.
    """
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
            print(f"Startup complete. Storage mode: {storage_mode}. Cloudinary configured.")
    else:
        print(f"Startup complete. Storage mode: {storage_mode}. Cloudinary is OFF.")


app.include_router(upload_router.router, prefix="/api", tags=["Upload"])
app.include_router(retrieve_router.router, prefix="/api", tags=["Retrieve"])  # <-- Re-enable this line

@app.get("/")
async def root():
    return {"message": "Welcome to the Media Storage API. Use /api/upload to post files."}