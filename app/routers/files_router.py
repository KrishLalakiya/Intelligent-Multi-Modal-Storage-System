from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import os
import cloudinary
import cloudinary.api
from typing import List, Dict, Any

# Import the function from json_routes to reuse it!
from app.routers.json_routes import list_json_files

router = APIRouter()

def format_local_media(file_path: Path, storage_root: Path) -> Dict[str, Any]:
    """Helper to format local media files for the frontend"""
    category = file_path.parent.parent.name # e.g., 'images' or 'videos'
    ext = file_path.suffix.lstrip('.').lower() # e.g., 'jpg', 'png', 'mp4'
    local_url = f"/files/{category}/{ext}/{file_path.name}"
    return {
        "name": file_path.name,
        "type": "image" if category == "images" else "video",
        "category": category.capitalize(), # 'Images' or 'Videos'
        "extension": ext,
        "local_url": local_url,
        "cloudinary_url": None,
        # Restoring os.path.getmtime as per your claimed working version
        "timestamp": os.path.getmtime(file_path),
        "score": 100 
    }

def format_cloudinary_media(resource: Dict) -> Dict[str, Any]:
    """Helper to format Cloudinary files for the frontend"""
    resource_type = resource.get("resource_type", "image")
    public_id_parts = resource["public_id"].split('/')
    ext = ""
    if len(public_id_parts) > 1:
        ext = public_id_parts[-2].lower()
    
    # Fallback logic to determine extension (kept from your last provided code)
    if not ext or ext not in ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "svg", "heic", "heif", "ico", "raw", "cr2", "nef", "orf", "sr2", "avif", "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "mpeg", "mpg", "3gp", "m4v", "vob"]:
        url_suffix = Path(resource["secure_url"]).suffix.lstrip('.').lower()
        if url_suffix: ext = url_suffix

    if not ext:
        ext = resource_type
            
    return {
        "name": resource["public_id"],
        "type": resource_type,
        "category": resource_type.capitalize() + "s", 
        "extension": ext,
        "local_url": None,
        "cloudinary_url": resource["secure_url"],
        "timestamp": resource["created_at"],
        "score": 100 
    }

@router.get("/files")
async def get_all_files(
    type: str = Query(None),
    category: str = Query(None)
):
    storage_mode = os.getenv("STORAGE_MODE", "local")
    all_files = []

    # --- 1. Get JSON Files (Using your existing, protected code) ---
    json_category = None
    if category in ("SQL", "NoSQL"):
        json_category = category.lower()
    elif type == "json":
        json_category = "all" 
    
    if not type or not category or json_category or category == 'all':
        try:
            json_response = await list_json_files(category=json_category)
            for file in json_response.get("files", []):
                file["type"] = "json"
                file["category"] = file["metadata"].get("analysis", {}).get("recommendation", "nosql").upper()
                file["extension"] = "json" 
                file["name"] = file["filename"]
                all_files.append(file)
        except Exception as e:
            print(f"Error fetching JSON files: {e}")

    # --- 2. Get Media Files (Using your code + critical guard) ---
    if not type or type in ("image", "video") or category in ("Images", "Videos") or category == 'all':
        # --- From Local Storage ---
        if storage_mode in ("local", "both"):
            media_root = Path("storage")
            # Loop through category (images, videos) then extension (jpg, png)
            for cat_dir in media_root.glob("*"): # e.g., 'storage/images', 'storage/videos'
                if not cat_dir.is_dir(): continue
                
                # ⭐ CRITICAL FIX: Only allow media folders (This prevents the crash)
                if cat_dir.name not in ('images', 'videos'): continue
                
                for ext_dir in cat_dir.glob("*"): # e.g., 'storage/images/jpg', 'storage/videos/mp4'
                    if not ext_dir.is_dir(): continue
                    
                    for file_path in ext_dir.glob("*"): # actual files
                        if file_path.is_file():
                            all_files.append(format_local_media(file_path, media_root))
        
        # --- From Cloudinary ---
        if storage_mode in ("online", "both"):
            try:
                # Images
                resources = cloudinary.api.resources(
                    type="upload", prefix="images/", max_results=100)
                for res in resources.get("resources", []):
                    all_files.append(format_cloudinary_media(res))
                
                # Videos
                resources_vid = cloudinary.api.resources(
                    type="upload", resource_type="video", prefix="videos/", max_results=100)
                for res in resources_vid.get("resources", []):
                    all_files.append(format_cloudinary_media(res))
            except Exception as e:
                print(f"Could not list Cloudinary files. Is Admin API enabled? {e}")

    # --- 3. Apply Final Filters ---
    final_files = all_files
    
    if type and type != 'all':
        final_files = [f for f in final_files if f['type'] == type]
    
    if category and category != 'all':
        final_files = [f for f in final_files if f['category'] == category]

    return final_files 

# --- STUB ENDPOINTS (Unchanged) ---
@router.get("/search")
async def stub_search(q: str = Query(...)):
    print(f"Search query received: {q}")
    return [] 

@router.get("/categories")
async def stub_categories():
    return [
        {"name": "Images", "count": 0},
        {"name": "Videos", "count": 0},
        {"name": "SQL", "count": 0},
        {"name": "NoSQL", "count": 0}
    ]