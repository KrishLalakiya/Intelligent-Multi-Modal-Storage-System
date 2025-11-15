# app/routers/retrieve_router.py

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from werkzeug.utils import secure_filename
from app.utils.file_utils import STORAGE_BASE_DIR

router = APIRouter()

@router.get("/files/{category}/{extension}/{filename}")
async def get_sorted_file(category: str, extension: str, filename: str):
    """
    Retrieves a file from the sorted storage.
    Example: /api/files/images/jpg/my_photo.jpg
    """
    
    # --- CRITICAL SECURITY STEP ---
    # Sanitize all input parameters to prevent path traversal attacks
    safe_category = secure_filename(category)
    safe_extension = secure_filename(extension)
    safe_filename = secure_filename(filename)
    
    # Re-build the path
    file_path = STORAGE_BASE_DIR / safe_category / safe_extension / safe_filename
    
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
        
    # Use FileResponse to stream the file
    return FileResponse(path=file_path)