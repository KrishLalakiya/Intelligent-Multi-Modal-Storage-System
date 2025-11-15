# app/routers/upload_router.py

from fastapi import APIRouter, File, UploadFile, HTTPException
from app.utils import file_utils

router = APIRouter()

@router.post("/upload/", status_code=201)
async def upload_files(file: UploadFile = File(...)):
    
    filename = file.filename
    extension = filename.split('.')[-1].lower() if '.' in filename else None

    try:
        if extension == "zip":
            results = await file_utils.handle_zip_upload(file)
            if not results:
                return {"message": "ZIP processed, but no valid media files were found."}
            
            # Return a list of URLs
            return {
                "message": f"ZIP processed. {len(results)} files uploaded.",
                "uploaded_files": [
                    {"public_id": r["public_id"], "url": r["secure_url"]} for r in results
                ]
            }
        
        elif extension in file_utils.ALLOWED_IMAGE_EXTENSIONS or \
             extension in file_utils.ALLOWED_VIDEO_EXTENSIONS:
            
            result = await file_utils.handle_file_upload(file)
            
            # Return the secure URL and public_id
            return {
                "message": "File uploaded successfully to Cloudinary",
                "public_id": result["public_id"],
                "url": result["secure_url"],
                "resource_type": result["resource_type"]
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