# app/routers/files_router.py

from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import os
import cloudinary
import cloudinary.api
from typing import List, Dict, Any
from datetime import datetime

# Import the function from json_routes to reuse it!
from app.routers.json_routes import list_json_files
# Import JSONAnalyzer to connect to MongoDB when storage_mode is "online" or "both"
from app.utils.json_analyzer import JSONAnalyzer 

router = APIRouter()

def format_local_media(file_path: Path, storage_root: Path) -> Dict[str, Any]:
    """Helper to format local media files for the frontend"""
    category = file_path.parent.parent.name # e.g., 'images' or 'videos'
    ext = file_path.suffix.lstrip('.').lower() # e.g., 'jpg', 'png', 'mp4'
    # Use os.path.getmtime for a simple POSIX timestamp
    timestamp = os.path.getmtime(file_path)
    
    # Path is relative to the base URL (e.g., /files/images/jpg/image.jpg)
    local_url = f"/files/{category}/{ext}/{file_path.name}"
    return {
        "name": file_path.name,
        "type": "image" if category == "images" else "video",
        "category": category.capitalize(), # 'Images' or 'Videos'
        "extension": ext,
        "local_url": local_url,
        "cloudinary_url": None,
        "timestamp": timestamp,
        "score": 100 
    }

def format_cloudinary_media(resource: Dict) -> Dict[str, Any]:
    """Helper to format Cloudinary files for the frontend"""
    resource_type = resource.get("resource_type", "image")
    public_id_parts = resource["public_id"].split('/')
    ext = ""
    if len(public_id_parts) > 1:
        ext = public_id_parts[-2].lower()
    
    # Fallback logic to determine extension 
    if not ext:
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
    
    # --- STEP 1: Initialize De-duplication Set and List ---
    all_files = []
    seen_files = set()
    # ----------------------------------------------------

    # --- 1. Get JSON Files ---
    json_category = None
    if category in ("SQL", "NoSQL"):
        json_category = category.lower()
    elif type == "json":
        json_category = "all" 
    
    if not type or not category or json_category or category == 'all':
        
        # --- Online Mode (MongoDB) ---
        if storage_mode in ("online", "both"):
            try:
                analyzer = JSONAnalyzer()
                if analyzer.mongo_db:
                    collections_to_search = ["sql_data", "nosql_data"] 
                    
                    for collection_name in collections_to_search:
                        # Only fetch metadata, exclude the large 'content' field
                        cursor = analyzer.mongo_db[collection_name].find(
                            {},  
                            {"content": 0} 
                        )
                        for doc in cursor:
                            recommendation = doc.get("analysis", {}).get("recommendation", "nosql")
                            # Create an ID based on hash/ID
                            file_id = str(doc["_id"]) 
                            if file_id not in seen_files:
                                seen_files.add(file_id)
                                all_files.append({
                                    "name": doc["original_filename"],
                                    "type": "json",
                                    "category": recommendation.upper(), 
                                    "extension": "json",
                                    "local_url": None,
                                    "cloudinary_url": None,
                                    "content_url": f"/json/content/{doc['_id']}",
                                    "timestamp": doc.get("stored_at", datetime.now()),
                                    "metadata": doc.get("analysis", {}),
                                    "score": 100,
                                    "id": doc["_id"]
                                })
            except Exception as e:
                print(f"Error fetching JSON files from MongoDB: {e}")
        
        # --- Local Mode (Filesystem) ---
        if storage_mode in ("local", "both"):
             try:
                # Use the existing function in json_routes.py to list local JSON files
                json_response = await list_json_files(category=json_category)
                for file in json_response.get("files", []):
                    # Use file hash (stored in metadata) as ID for de-duplication with MongoDB
                    file_id = file["metadata"].get("file_hash")
                    if file_id and file_id not in seen_files:
                        seen_files.add(file_id)
                        file["type"] = "json"
                        file["category"] = file["metadata"].get("analysis", {}).get("recommendation", "nosql").upper()
                        file["extension"] = "json"
                        file["name"] = file["filename"]
                        file["content_url"] = file["local_url"]
                        all_files.append(file)
             except Exception as e:
                print(f"Error fetching local JSON files: {e}")

    # --- 2. Get Media Files (Images/Videos) ---
    if not type or type in ("image", "video") or category in ("Images", "Videos") or category == 'all':
        
        # --- From Local Storage ---
        if storage_mode in ("local", "both"):
            media_root = Path("storage")
            
            for cat_dir in media_root.glob("*"):
                # Ignore non-directory items and non-media folders
                if not cat_dir.is_dir() or cat_dir.name not in ('images', 'videos'): continue
                
                for ext_dir in cat_dir.glob("*"):
                    if not ext_dir.is_dir(): continue
                    
                    for file_path in ext_dir.glob("*"):
                        if file_path.is_file():
                            formatted_file = format_local_media(file_path, media_root)
                            
                            # --- STEP 2: Apply De-duplication Logic for Local Media ---
                            file_id = f"local_{formatted_file['name']}"
                            if file_id not in seen_files:
                                seen_files.add(file_id)
                                all_files.append(formatted_file)
                            # ------------------------------------------------------------
        
        # --- From Cloudinary ---
        if storage_mode in ("online", "both"):
            try:
                # Images + Videos
                resources = cloudinary.api.resources(
                    type="upload", prefix="images/", max_results=100)
                resources_vid = cloudinary.api.resources(
                    type="upload", resource_type="video", prefix="videos/", max_results=100)
                
                all_cloudinary_resources = resources.get("resources", []) + resources_vid.get("resources", [])

                for res in all_cloudinary_resources:
                    formatted_file = format_cloudinary_media(res)
                    filename = formatted_file['name']
                    
                    # --- STEP 3: Apply De-duplication Logic for Cloudinary Media ---
                    cloudinary_id = f"cloudinary_{filename}"
                    local_id = f"local_{filename}"
                    
                    # Only add if neither a Cloudinary entry nor a local file with the same name was already seen
                    if cloudinary_id not in seen_files and local_id not in seen_files:    
                        seen_files.add(cloudinary_id)    
                        all_files.append(formatted_file)
                    # ------------------------------------------------------------

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