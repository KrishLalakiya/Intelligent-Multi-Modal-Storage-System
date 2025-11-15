from fastapi import APIRouter, File, UploadFile, HTTPException
from app.utils import file_utils
import os

router = APIRouter()

@router.post("/upload/", status_code=201)
async def upload_files(file: UploadFile = File(...)):
    
    filename = file.filename
    extension = filename.split('.')[-1].lower() if '.' in filename else None

    try:
        if extension == "zip":
            results = await file_utils.handle_zip_upload(file)
            return {
                "message": f"ZIP processed. {len(results)} files handled.",
                "storage_mode": os.getenv("STORAGE_MODE", "local"),
                "saved_files": results
            }
        
        elif extension in file_utils.ALLOWED_IMAGE_EXTENSIONS or \
             extension in file_utils.ALLOWED_VIDEO_EXTENSIONS:
            
            result = await file_utils.handle_file_upload(file)
            return {
                "message": "File processed successfully.",
                "storage_mode": os.getenv("STORAGE_MODE", "local"),
                "saved_file": result
            }
        
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type. Allowed types are images, videos, or ZIP."
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {e}")