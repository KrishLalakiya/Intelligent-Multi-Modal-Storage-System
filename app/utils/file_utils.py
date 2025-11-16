import os
import shutil
import zipfile
import io
import json  
from pathlib import Path
from fastapi import UploadFile
from werkzeug.utils import secure_filename
import cloudinary
import cloudinary.uploader

# --- Local Storage Configuration ---
STORAGE_BASE_DIR = Path("storage")
IMAGE_DIR = STORAGE_BASE_DIR / "images"
VIDEO_DIR = STORAGE_BASE_DIR / "videos"
JSON_DIR = STORAGE_BASE_DIR / "json"  
TEMP_DIR = STORAGE_BASE_DIR / "temp"

# --- Allowed Extensions (Using your expanded list) ---
ALLOWED_IMAGE_EXTENSIONS = { "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif","svg", "heic", "heif", "ico", "raw", "cr2", "nef", "orf", "sr2","avif"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "mpeg", "mpg", "3gp", "m4v", "vob"}
ALLOWED_JSON_EXTENSIONS = {"json"}  


# === MEDIA HELPER 1: Local Media Storage ===
def _save_media_to_local(file_data: bytes, filename: str) -> Path:
    """
    Saves file data to the local hybrid structure.
    """
    safe_filename = secure_filename(filename)
    extension = safe_filename.split('.')[-1].lower()
    
    if extension in ALLOWED_IMAGE_EXTENSIONS:
        target_dir = IMAGE_DIR / extension
    elif extension in ALLOWED_VIDEO_EXTENSIONS:
        target_dir = VIDEO_DIR / extension
    else:
        raise ValueError(f"Unsupported file type: {extension}")

    target_dir.mkdir(parents=True, exist_ok=True)
    final_path = target_dir / safe_filename
    
    with open(final_path, "wb") as buffer:
        buffer.write(file_data)
        
    return final_path


# === MEDIA HELPER 2: Cloudinary Media Upload ===
def _save_media_to_cloudinary(file_data: bytes, filename: str) -> dict:
    """
    Uploads file data to Cloudinary.
    """
    safe_filename = secure_filename(filename)
    extension = safe_filename.split('.')[-1].lower()
    
    folder_path = ""
    resource_type = "auto"
    
    if extension in ALLOWED_IMAGE_EXTENSIONS:
        folder_path = f"images/{extension}"
    elif extension in ALLOWED_VIDEO_EXTENSIONS:
        folder_path = f"videos/{extension}"
        resource_type = "video"
    else:
        raise ValueError(f"Unsupported file type: {extension}")

    public_id = Path(safe_filename).stem

    try:
        upload_result = cloudinary.uploader.upload(
            file_data,
            public_id=public_id,
            folder=folder_path,
            resource_type=resource_type,
            overwrite=True
        )
        return upload_result
    except Exception as e:
        raise ValueError(f"Cloudinary upload failed: {e}")


# === JSON HELPER 1: Classify JSON ===
def _classify_json_content(file_data: bytes) -> str:
    """
    Analyzes JSON content to determine if it's "sql" or "nosql"
    based on a set of fast, simple rules (heuristics).
    """
    try:
        content_str = file_data.decode('utf-8')
        data = json.loads(content_str)
    except Exception:
        return "unstructured"

    # --- Rule-Based Checks ---
    json_type = "nosql" # Default
    
    # Rule 1: Check for common NoSQL keys
    if isinstance(data, dict):
        keys = data.keys()
        if "_id" in keys or "collection" in keys or "document_id" in keys:
            json_type = "nosql"
            
    # Rule 2: Check for list of documents (common NoSQL pattern)
    elif isinstance(data, list) and len(data) > 0:
        if isinstance(data[0], dict) and "_id" in data[0].keys():
            json_type = "nosql"

    # Rule 3: Check for SQL-like content
    if isinstance(data, dict):
        keys = data.keys()
        if "query" in keys:
            query_val = str(data["query"]).strip().upper()
            if query_val.startswith(("SELECT", "INSERT", "UPDATE", "CREATE")):
                json_type = "sql"
            if "sql_statement" in keys:
                json_type = "sql"
                
    return json_type


# === JSON HELPER 2: Local JSON Storage ===
def _save_json_to_local(file_data: bytes, filename: str, json_type: str) -> Path:
    safe_filename = secure_filename(filename)
    target_dir = Path("app/storage/databases") / json_type 
    target_dir.mkdir(parents=True, exist_ok=True)
    
    final_path = target_dir / safe_filename
    with open(final_path, "wb") as buffer:
        buffer.write(file_data)
    return final_path


# === JSON HELPER 3: Cloudinary JSON Upload ===
def _save_json_to_cloudinary(file_data: bytes, filename: str, json_type: str) -> dict:
    safe_filename = secure_filename(filename)
    cloudinary_folder = f"json/{json_type}"
    public_id = Path(safe_filename).stem
    
    try:
        upload_result = cloudinary.uploader.upload(
            file_data,
            public_id=public_id,
            folder=cloudinary_folder,
            resource_type="raw"  # <-- Important: store JSON as a raw file
        )
        return upload_result
    except Exception as e:
        raise ValueError(f"Cloudinary upload failed: {e}")


# --- MAIN HANDLER 1: Media File Upload (Images/Videos) ---
async def handle_file_upload(file: UploadFile) -> dict:
    """
    Handles a single media file, saving it based on the STORAGE_MODE.
    """
    storage_mode = os.getenv("STORAGE_MODE", "local")
    file_data = await file.read()
    
    result = {
        "filename": file.filename,
        "local_path": None,
        "online_url": None
    }
    
    if storage_mode in ("local", "both"):
        local_path = _save_media_to_local(file_data, file.filename)
        result["local_path"] = str(local_path)
        
    if storage_mode in ("online", "both"):
        try:
            cloudinary_result = _save_media_to_cloudinary(file_data, file.filename)
            result["online_url"] = cloudinary_result["secure_url"]
        except Exception as e:
            print(f"Cloudinary upload failed: {e}")
            if storage_mode == "online": # Fail if it's the *only* mode
                raise e

    return result


# --- MAIN HANDLER 2: ZIP File Upload (Media-Only) ---
async def handle_zip_upload(file: UploadFile) -> list[dict]:
    """
    Handles a zip file, saving each MEDIA file based on the STORAGE_MODE.
    Skips JSON or other files inside the zip.
    """
    storage_mode = os.getenv("STORAGE_MODE", "local")
    zip_data = await file.read()
    all_results = []

    try:
        with io.BytesIO(zip_data) as in_memory_zip:
            with zipfile.ZipFile(in_memory_zip, 'r') as zf:
                for filename in zf.namelist():
                    if filename.endswith('/') or "__MACOSX" in filename:
                        continue
                        
                    file_data = zf.read(filename)
                    base_filename = os.path.basename(filename)
                    if not base_filename: continue

                    result = {
                        "filename": base_filename,
                        "local_path": None,
                        "online_url": None
                    }

                    try:
                        # Check extension to make sure it's media
                        ext = base_filename.split('.')[-1].lower()
                        if ext not in ALLOWED_IMAGE_EXTENSIONS and ext not in ALLOWED_VIDEO_EXTENSIONS:
                            print(f"Skipping non-media file in zip: {base_filename}")
                            continue

                        if storage_mode in ("local", "both"):
                            local_path = _save_media_to_local(file_data, base_filename)
                            result["local_path"] = str(local_path)
                        
                        if storage_mode in ("online", "both"):
                            cloudinary_result = _save_media_to_cloudinary(file_data, base_filename)
                            result["online_url"] = cloudinary_result["secure_url"]
                        
                        all_results.append(result)
                        
                    except ValueError as e:
                        print(f"Skipping file '{filename}' in zip: {e}")
            
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")
        
    return all_results


# --- MAIN HANDLER 3: JSON File Upload ---
async def handle_json_upload(file: UploadFile) -> dict:
    """
    Handles a single JSON file, classifies it, and saves it based on STORAGE_MODE.
    """
    storage_mode = os.getenv("STORAGE_MODE", "local")
    file_data = await file.read()
    
    # 1. Classify the content
    json_type = _classify_json_content(file_data) # "sql" or "nosql"
    
    if json_type == "unstructured":
        raise ValueError("File is not valid JSON.")
        
    result = {
        "filename": file.filename,
        "json_type": json_type,
        "local_path": None,
        "online_url": None
    }
    
    # 2. Save the file based on mode
    if storage_mode in ("local", "both"):
        local_path = _save_json_to_local(file_data, file.filename, json_type)
        result["local_path"] = str(local_path)
        
    if storage_mode in ("online", "both"):
        try:
            cloudinary_result = _save_json_to_cloudinary(file_data, file.filename, json_type)
            result["online_url"] = cloudinary_result["secure_url"]
        except Exception as e:
            print(f"Cloudinary upload failed: {e}")
            if storage_mode == "online": raise e

    return result