# app/routers/upload_router.py

from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks
from app.utils import file_utils
import os
from pathlib import Path
import aiofiles

# --- Import the tools from your other files ---
from app.utils.json_analyzer import JSONAnalyzer

# --- This is the helper function from json_routes.py ---
# We need it here for the background task
def process_additional_metadata(result: dict, analysis: dict):
    """Background task for additional processing"""
    try:
        # This runs in background - doesn't block the response
        print(f"Background processing completed for {result.get('stored_name')}")
    except Exception as e:
        print(f"Background processing failed: {e}")

# --- Initialize your analyzer ---
router = APIRouter()
json_analyzer = JSONAnalyzer() # This will connect to Mongo if mode is 'online' or 'both'

@router.post("/upload/", status_code=201)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    
    filename = file.filename
    extension = filename.split('.')[-1].lower() if '.' in filename else None

    try:
        # --- 1. HANDLE JSON FILES ---
        if extension == "json":
            # This logic is from your json_routes.py
            content = await file.read()
            temp_dir = Path("app/storage/temp")
            temp_dir.mkdir(exist_ok=True)
            temp_file = temp_dir / f"temp_{file.filename}"
            
            async with aiofiles.open(temp_file, 'wb') as f:
                await f.write(content)
            
            analysis = json_analyzer.analyze_json_file(str(temp_file))
            # store_json_file is now mode-aware
            result = json_analyzer.store_json_file(str(temp_file), file.filename, analysis)
            
            if not result["success"]:
                raise HTTPException(500, result.get("error", "JSON processing error"))

            # Add background task
            if not result.get("duplicate"):
                background_tasks.add_task(process_additional_metadata, result, analysis)
            
            # Return the JSON response format
            return {
                "message": "JSON processed successfully!",
                "details": result,
                "analysis": analysis,
                "storage_mode": os.getenv("STORAGE_MODE", "local")
            }

        # --- 2. HANDLE ZIP FILES ---
        elif extension == "zip":
            # handle_zip_upload is already mode-aware
            results = await file_utils.handle_zip_upload(file)
            return {
                "message": f"ZIP processed. {len(results)} files handled.",
                "storage_mode": os.getenv("STORAGE_MODE", "local"),
                "saved_files": results
            }
        
        # --- 3. HANDLE MEDIA FILES ---
        elif extension in file_utils.ALLOWED_IMAGE_EXTENSIONS or \
             extension in file_utils.ALLOWED_VIDEO_EXTENSIONS:
            
            # handle_file_upload is already mode-aware
            result = await file_utils.handle_file_upload(file)
            
            # Create a consistent "saved_file" object for the frontend
            ext = extension
            category = "Images" if ext in file_utils.ALLOWED_IMAGE_EXTENSIONS else "Videos"
            
            return {
                "message": "File processed successfully.",
                "storage_mode": os.getenv("STORAGE_MODE", "local"),
                "saved_file": { # <-- Return a full object
                    "filename": result["filename"],
                    "category": category,
                    "extension": ext,
                    "json_type": None,
                    "local_path": result["local_path"],
                    "online_url": result["online_url"]
                }
            }
        
        # --- 4. HANDLE UNSUPPORTED FILES ---
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type: {extension}. Allowed types are images, videos, JSON, or ZIP."
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Clean up temp file on error, if it exists
        temp_file_path = Path("app/storage/temp") / f"temp_{file.filename}"
        if extension == "json" and temp_file_path.exists():
            temp_file_path.unlink(missing_ok=True)
            
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {e}")