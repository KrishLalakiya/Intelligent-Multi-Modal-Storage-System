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

# --- Allowed Extensions ---
ALLOWED_IMAGE_EXTENSIONS = { "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif","svg", "heic", "heif", "ico", "raw", "cr2", "nef", "orf", "sr2","avif"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "mpeg", 
"mpg", "3gp", "m4v", "vob"}
ALLOWED_JSON_EXTENSIONS = {"json"}


# --- HELPER 1: Local Storage Logic ---
def _save_to_local_storage(file_data: bytes, filename: str) -> Path:
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


# --- HELPER 2: Cloudinary Upload Logic ---
def _save_to_cloudinary(file_data: bytes, filename: str) -> dict:
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


# --- Main Handler Functions (Now with Mode Logic) ---

async def handle_file_upload(file: UploadFile) -> dict:
    """
    Handles a single file, saving it based on the STORAGE_MODE.
    """
    storage_mode = os.getenv("STORAGE_MODE", "local")
    file_data = await file.read()
    
    result = {
        "filename": file.filename,
        "local_path": None,
        "online_url": None
    }
    
    if storage_mode in ("local", "both"):
        local_path = _save_to_local_storage(file_data, file.filename)
        result["local_path"] = str(local_path)
        
    if storage_mode in ("online", "both"):
        try:
            cloudinary_result = _save_to_cloudinary(file_data, file.filename)
            result["online_url"] = cloudinary_result["secure_url"]
        except Exception as e:
            print(f"Cloudinary upload failed: {e}")
            if storage_mode == "online": # Fail if it's the *only* mode
                raise e

    return result


async def handle_zip_upload(file: UploadFile) -> list[dict]:
    """
    Handles a zip file, saving each file based on the STORAGE_MODE.
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
                        if storage_mode in ("local", "both"):
                            local_path = _save_to_local_storage(file_data, base_filename)
                            result["local_path"] = str(local_path)
                        
                        if storage_mode in ("online", "both"):
                            cloudinary_result = _save_to_cloudinary(file_data, base_filename)
                            result["online_url"] = cloudinary_result["secure_url"]
                        
                        all_results.append(result)
                        
                    except ValueError as e:
                        print(f"Skipping file '{filename}' in zip: {e}")
            
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")
        
    return all_results