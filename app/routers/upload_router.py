# app/routers/upload_router.py

from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks
from app.utils import file_utils
import os
from pathlib import Path
import aiofiles

# --- Import the tools from your other files ---
from app.utils.json_analyzer import JSONAnalyzer

# --- This is the helper function from json_routes.py ---
def process_additional_metadata(result: dict, analysis: dict):
    """Background task for additional processing"""
    try:
        print(f"Background processing completed for {result.get('stored_name')}")
    except Exception as e:
        print(f"Background processing failed: {e}")

# --- Initialize your analyzer ---
router = APIRouter()
json_analyzer = JSONAnalyzer()

@router.post("/upload", status_code=201)  # Changed from "/upload/" to "/upload"
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Single unified upload endpoint for ALL file types:
    - Images (jpg, png, etc.)
    - Videos (mp4, mov, etc.)
    - JSON files
    - ZIP archives
    """
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    filename = file.filename
    extension = filename.split('.')[-1].lower() if '.' in filename else None
    
    print(f"📤 Upload received: {filename} (extension: {extension})")

    try:
        # --- 1. HANDLE JSON FILES ---
        if extension == "json":
            print(f"Processing JSON file: {filename}")
            content = await file.read()
            
            if len(content) > 50 * 1024 * 1024:  # 50MB limit
                raise HTTPException(413, "File too large. Maximum size is 50MB")
            
            temp_dir = Path("app/storage/temp")
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file = temp_dir / f"temp_{file.filename}"
            
            async with aiofiles.open(temp_file, 'wb') as f:
                await f.write(content)
            
            print(f"🔍 Analyzing JSON: {filename}")
            analysis = json_analyzer.analyze_json_file(str(temp_file))
            print(f"📊 Analysis result: {analysis}")
            
            result = json_analyzer.store_json_file(str(temp_file), file.filename, analysis)
            print(f"💾 Storage result: {result}")
            
            if not result["success"]:
                raise HTTPException(500, result.get("error", "JSON processing error"))

            # Add background task
            if not result.get("duplicate"):
                background_tasks.add_task(process_additional_metadata, result, analysis)
            
            # Return the JSON response format
            return {
                "message": "JSON file uploaded successfully!",
                "details": {
                    "original_name": result["original_name"],
                    "stored_name": result["stored_name"],
                    "storage_type": result["storage_type"],  # 'SQL' or 'NOSQL'
                    "local_path": result.get("local_path"),
                    "online_url": result.get("online_url"),
                    "reason": result["reason"]
                },
                "analysis": analysis,
                "storage_mode": os.getenv("STORAGE_MODE", "local")
            }

        # --- 2. HANDLE ZIP FILES ---
        elif extension == "zip":
            print(f"Processing ZIP file: {filename}")
            results = await file_utils.handle_zip_upload(file)
            
            if not results:
                return {
                    "message": "ZIP processed but no valid files found.",
                    "storage_mode": os.getenv("STORAGE_MODE", "local"),
                    "saved_files": []
                }
            
            return {
                "message": f"ZIP processed successfully! {len(results)} files uploaded.",
                "storage_mode": os.getenv("STORAGE_MODE", "local"),
                "saved_files": results
            }
        
        # --- 3. HANDLE MEDIA FILES (Images & Videos) ---
        elif extension in file_utils.ALLOWED_IMAGE_EXTENSIONS or \
             extension in file_utils.ALLOWED_VIDEO_EXTENSIONS:
            
            print(f"Processing media file: {filename} (type: {extension})")
            result = await file_utils.handle_file_upload(file)
            print(f"💾 Media storage result: {result}")
            
            # Determine category based on extension
            if extension in file_utils.ALLOWED_IMAGE_EXTENSIONS:
                category = "Images"
                file_type = "image"
            else:
                category = "Videos"
                file_type = "video"
            
            return {
                "message": "File uploaded successfully.",
                "storage_mode": os.getenv("STORAGE_MODE", "local"),
                "saved_file": {
                    "filename": result["filename"],
                    "category": category,
                    "extension": extension,
                    "type": file_type,
                    "json_type": None,
                    "local_path": result.get("local_path"),
                    "online_url": result.get("online_url")
                }
            }
        
        # --- 4. HANDLE UNSUPPORTED FILES ---
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type: '.{extension}'. Allowed: images, videos, JSON, or ZIP."
            )

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except ValueError as e:
        print(f"❌ ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        # Clean up temp file on error, if it exists
        temp_file_path = Path("app/storage/temp") / f"temp_{file.filename}"
        if extension == "json" and temp_file_path.exists():
            temp_file_path.unlink()
            
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")