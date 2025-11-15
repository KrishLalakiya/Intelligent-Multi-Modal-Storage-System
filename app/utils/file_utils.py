# app/utils/file_utils.py

import os
import zipfile
import io
from pathlib import Path
from fastapi import UploadFile
from werkzeug.utils import secure_filename
import cloudinary
import cloudinary.uploader  # Import the uploader

STORAGE_BASE_DIR = "some/path/to/storage"
# --- Configuration ---
# We no longer need the local storage paths
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "webp"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "mkv", "wmv"}

# --- NEW: Cloudinary Upload Function ---

def upload_to_cloudinary(file_data: bytes, filename: str) -> dict:
    """
    Uploads file data to Cloudinary and returns the response.
    """
    # Sanitize filename for security
    safe_filename = secure_filename(filename)
    if not safe_filename:
        raise ValueError("Invalid filename")

    # Get extension (e.g., "jpg")
    extension = safe_filename.split('.')[-1].lower()
    
    # Determine the correct category and resource type
    folder_path = ""
    resource_type = "auto" # Let Cloudinary detect
    
    if extension in ALLOWED_IMAGE_EXTENSIONS:
        folder_path = f"images/{extension}"
    elif extension in ALLOWED_VIDEO_EXTENSIONS:
        folder_path = f"videos/{extension}"
        resource_type = "video"
    else:
        raise ValueError(f"Unsupported file type: {extension}")

    # Use the filename without extension as the public_id
    public_id = Path(safe_filename).stem

    # Upload to Cloudinary
    try:
        upload_result = cloudinary.uploader.upload(
            file_data,
            public_id=public_id,
            folder=folder_path,
            resource_type=resource_type,
            overwrite=True  # Overwrite if file with same public_id exists
        )
        return upload_result
    except Exception as e:
        raise ValueError(f"Cloudinary upload failed: {e}")


# --- Modified Handler Functions ---

async def handle_file_upload(file: UploadFile) -> dict:
    """
    Handles a single file upload to Cloudinary.
    """
    file_data = await file.read()
    return upload_to_cloudinary(file_data, file.filename)


async def handle_zip_upload(file: UploadFile) -> list[dict]:
    """
    Handles a zip file upload, processing each file inside to Cloudinary.
    """
    zip_data = await file.read()
    upload_results = []

    try:
        with io.BytesIO(zip_data) as in_memory_zip:
            with zipfile.ZipFile(in_memory_zip, 'r') as zf:
                file_list = zf.namelist()
                
                for filename in file_list:
                    if filename.endswith('/') or "__MACOSX" in filename:
                        continue

                    file_data = zf.read(filename)
                    base_filename = os.path.basename(filename)
                    if not base_filename: continue

                    try:
                        result = upload_to_cloudinary(file_data, base_filename)
                        upload_results.append(result)
                    except ValueError as e:
                        print(f"Skipping file '{filename}' in zip: {e}")
                        
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")
        
    return upload_results