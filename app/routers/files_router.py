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
    category = file_path.parent.parent.name # e.g., 'images'
    ext = file_path.parent.name # e.g., 'jpg'
    
    # Create the local retrieval URL
    local_url = f"/files/{category}/{ext}/{file_path.name}"
    
    return {
        "name": file_path.name,
        "type": "image" if category == "images" else "video",
        "category": category.capitalize(),
        "local_url": local_url, # Frontend can use this for retrieval
        "cloudinary_url": None,
        "timestamp": os.path.getmtime(file_path),
        "score": 100 # Placeholder
    }

def format_cloudinary_media(resource: Dict) -> Dict[str, Any]:
    """Helper to format Cloudinary files for the frontend"""
    return {
        "name": resource["public_id"],
        "type": resource["resource_type"],
        "category": resource["resource_type"].capitalize() + "s",
        "local_url": None,
        "cloudinary_url": resource["secure_url"],
        "timestamp": resource["created_at"],
        "score": 100 # Placeholder
    }

@router.get("/files")
async def get_all_files(
    type: str = Query(None),
    category: str = Query(None)
):
    """
    The main 'GET /files' endpoint that the frontend needs.
    It combines all our different data sources.
    """
    storage_mode = os.getenv("STORAGE_MODE", "local")
    all_files = []

    # --- 1. Get JSON Files ---
    # The frontend uses 'SQL', 'NoSQL', 'all' for categories
    json_category = None
    if category in ("SQL", "NoSQL"):
        json_category = category.lower()
    elif type == "json":
        json_category = "all" # We need to handle 'all' in list_json_files
    
    # If no filter, or a JSON filter, get JSON files
    if not type or not category or json_category:
        try:
            # list_json_files returns a full response dict
            json_response = await list_json_files(category=json_category)
            # The 'type' and 'category' are custom. Let's fix them.
            for file in json_response.get("files", []):
                file["type"] = "json"
                file["category"] = file["metadata"].get("analysis", {}).get("recommendation", "nosql").upper()
                file["name"] = file["filename"]
                all_files.append(file)
        except Exception as e:
            print(f"Error fetching JSON files: {e}")

    # --- 2. Get Media Files (Images/Videos) ---
    if not type or type in ("image", "video") or category in ("Images", "Videos"):
        # --- From Local Storage ---
        if storage_mode in ("local", "both"):
            media_root = Path("storage")
            for ext_dir in media_root.glob("*/*"): # e.g., images/jpg
                if not ext_dir.is_dir(): continue
                for file_path in ext_dir.glob("*"):
                    if file_path.is_file():
                        all_files.append(format_local_media(file_path, media_root))
        
        # --- From Cloudinary ---
        if storage_mode in ("online", "both"):
            try:
                # This requires your 'Admin API' to be enabled on Cloudinary
                # This lists ALL files. In production, you'd paginate.
                resources = cloudinary.api.resources(
                    type="upload",
                    prefix="images/", # Get all images
                    max_results=100
                )
                for res in resources.get("resources", []):
                    all_files.append(format_cloudinary_media(res))
                
                resources_vid = cloudinary.api.resources(
                    type="upload",
                    resource_type="video",
                    prefix="videos/", # Get all videos
                    max_results=100
                )
                for res in resources_vid.get("resources", []):
                    all_files.append(format_cloudinary_media(res))
            except Exception as e:
                print(f"Could not list Cloudinary files. Is Admin API enabled? {e}")

    # --- 3. Apply Final Filters (if any) ---
    # (Skipping for brevity, but here you would filter the 'all_files' list
    # based on the 'type' and 'category' query parameters)
    
    return all_files # The frontend's 'loadFiles' expects a direct list

@router.get("/search")
async def stub_search(q: str = Query(...)):
    """
    A 'stub' endpoint for search so the frontend doesn't break.
    """
    print(f"Search query received: {q}")
    return [] # Return an empty list

@router.get("/categories")
async def stub_categories():
    """
    A 'stub' endpoint for categories.
    """
    # This should be dynamic, but a stub is fine for now
    return [
        {"name": "Images", "count": 12},
        {"name": "Videos", "count": 8},
        {"name": "SQL", "count": 4},
        {"name": "NoSQL", "count": 0}
    ]