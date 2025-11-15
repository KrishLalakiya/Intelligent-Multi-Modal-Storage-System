import os
import shutil
import zipfile
import io
from pathlib import Path
from fastapi import UploadFile
from werkzeug.utils import secure_filename

# --- Configuration ---

# The root directory for all stored files
STORAGE_BASE_DIR = Path("storage")

# Define our hybrid model categories
IMAGE_DIR = STORAGE_BASE_DIR / "images"
VIDEO_DIR = STORAGE_BASE_DIR / "videos"
JSON_DIR = STORAGE_BASE_DIR / "json"
TEMP_DIR = STORAGE_BASE_DIR / "temp"

# Allowed extensions
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "webp"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "mkv", "wmv"}


# --- Helper Function to Save Data ---

def save_file_data(file_data: bytes, filename: str) -> Path:
    """
    Saves file data to the correct sorted directory based on extension.
    This is the core sorting logic.
    """
    # Sanitize filename for security
    safe_filename = secure_filename(filename)
    if not safe_filename:
        raise ValueError("Invalid filename")

    # Get extension (e.g., "jpg")
    extension = safe_filename.split('.')[-1].lower()
    
    # Determine the correct category and path
    if extension in ALLOWED_IMAGE_EXTENSIONS:
        target_dir = IMAGE_DIR / extension
    elif extension in ALLOWED_VIDEO_EXTENSIONS:
        target_dir = VIDEO_DIR / extension
    else:
        # For now, we'll skip files we don't recognize
        # You could add an "others" category if you like
        raise ValueError(f"Unsupported file type: {extension}")

    # Create the directory (e.g., storage/images/jpg/) if it doesn't exist
    target_dir.mkdir(parents=True, exist_ok=True)

    # Define the final file path
    final_path = target_dir / safe_filename
    
    # Write the file data
    with open(final_path, "wb") as buffer:
        buffer.write(file_data)
        
    return final_path


# --- Main Functions for Router ---

async def handle_file_upload(file: UploadFile) -> Path:
    """
    Handles a single file upload.
    """
    # Read the file's content
    file_data = await file.read()
    
    # Save the data using our core logic
    return save_file_data(file_data, file.filename)


async def handle_zip_upload(file: UploadFile) -> list[Path]:
    """
    Handles a zip file upload, processing each file inside.
    """
    # Read the zip file into memory
    zip_data = await file.read()
    saved_paths = []

    try:
        with io.BytesIO(zip_data) as in_memory_zip:
            with zipfile.ZipFile(in_memory_zip, 'r') as zf:
                
                # Get a list of all files in the zip
                file_list = zf.namelist()
                
                for filename in file_list:
                    # Skip directories or macOS metadata files
                    if filename.endswith('/') or "__MACOSX" in filename:
                        continue

                    # Read the individual file's data from the zip
                    file_data = zf.read(filename)
                    
                    try:
                        # Get the *base* filename (e.g., "images/my_pic.jpg" -> "my_pic.jpg")
                        base_filename = os.path.basename(filename)
                        if not base_filename: continue # Skip if it's just a folder name

                        # Save the file using our core logic
                        saved_path = save_file_data(file_data, base_filename)
                        saved_paths.append(saved_path)
                    except ValueError as e:
                        # Log or handle unsupported files inside the zip
                        print(f"Skipping file '{filename}' in zip: {e}")
                        
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")
        
    return saved_paths