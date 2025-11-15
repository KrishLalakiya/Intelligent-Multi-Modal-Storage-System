from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
from app.utils import file_utils

router = APIRouter()

@router.post("/upload/", status_code=201)
async def upload_files(file: UploadFile = File(...)):
    """
    Accepts a single file (image, video) or a ZIP file.
    It will automatically sort all valid files into the storage structure.
    """
    
    # Get the file extension
    filename = file.filename
    extension = filename.split('.')[-1].lower() if '.' in filename else None

    try:
        if extension == "zip":
            # Process as a ZIP file
            saved_paths = await file_utils.handle_zip_upload(file)
            if not saved_paths:
                return {"message": "ZIP processed, but no valid media files were found."}
            return {
                "message": f"ZIP processed. {len(saved_paths)} files saved.",
                "saved_files": [str(p) for p in saved_paths]
            }
        
        elif extension in file_utils.ALLOWED_IMAGE_EXTENSIONS or \
             extension in file_utils.ALLOWED_VIDEO_EXTENSIONS:
            # Process as a single media file
            saved_path = await file_utils.handle_file_upload(file)
            return {
                "message": "File uploaded successfully",
                "saved_path": str(saved_path)
            }
        
        else:
            # Handle unsupported file types
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type. Allowed types are images, videos, or ZIP."
            )

    except ValueError as e:
        # Catch errors from our utils (e.g., bad zip, bad filename)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Catch any unexpected server errors
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {e}")