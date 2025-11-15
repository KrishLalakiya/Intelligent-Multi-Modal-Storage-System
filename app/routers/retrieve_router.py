from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from werkzeug.utils import secure_filename
import os

router = APIRouter()

# --- Use Absolute Paths to find your storage ---
# This makes the router work no matter where you run the server from.
# __file__ is '.../app/routers/retrieve_router.py'
# .parent.parent is '.../app/'
APP_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = APP_ROOT.parent

# Define the *exact* locations of your two storage roots
MEDIA_STORAGE_ROOT = PROJECT_ROOT / "storage"
JSON_STORAGE_ROOT = APP_ROOT / "storage" / "databases"

@router.get("/files/{category:path}/{filename:path}")
async def get_any_file(category: str, filename: str):
    """
    This is now the *only* file retrieval endpoint.
    It intelligently finds media OR JSON files.
    
    Examples:
    - /files/images/jpg/my.jpg
    - /files/json/sql/my.json
    """
    
    # --- Security: Sanitize all parts of the path ---
    # We secure the *entire* path, not just the filename
    
    # Secure the "category" part (e.g., "images/jpg" or "json/sql")
    # This turns '..' into '_'
    safe_category_path = Path(*[secure_filename(part) for part in Path(category).parts])
    
    # Secure the final filename
    safe_filename = secure_filename(filename)

    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # --- Logic: Decide which storage root to use ---
    
    # Check if the first part of the path is 'json'
    if safe_category_path.parts[0] == 'json':
        # It's a JSON file. Look in the JSON_STORAGE_ROOT
        # e.g., .../app/storage/databases/sql/my.json
        file_path = JSON_STORAGE_ROOT / safe_category_path.relative_to("json") / safe_filename
        media_type = "application/json"
        
    # Check if the first part is 'images' or 'videos'
    elif safe_category_path.parts[0] in ('images', 'videos'):
        # It's a Media file. Look in the MEDIA_STORAGE_ROOT
        # e.g., .../storage/images/jpg/my.jpg
        file_path = MEDIA_STORAGE_ROOT / safe_category_path / safe_filename
        media_type = None # Let FileResponse guess
    
    else:
        # The path is invalid (e.g., /files/etc/passwd)
        raise HTTPException(status_code=404, detail="Not Found")

    # --- Final Check and Serve ---
    if not file_path.is_file():
        print(f"DEBUG: File not found at path: {file_path}")
        raise HTTPException(status_code=404, detail="File not found")

    print(f"DEBUG: Serving file from: {file_path}")
    return FileResponse(path=file_path, media_type=media_type)