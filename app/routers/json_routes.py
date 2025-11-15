# app/routers/json_routes.py

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
import aiofiles
from pathlib import Path
import asyncio
from typing import List, Dict
import json

from app.utils.json_analyzer import JSONAnalyzer

from fastapi.responses import FileResponse


router = APIRouter(prefix="/json", tags=["JSON Files"])
json_analyzer = JSONAnalyzer()

@router.post("/upload")
async def upload_json(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Enhanced upload with background processing and better error handling
    """
    if not file.filename.lower().endswith('.json'):
        raise HTTPException(400, "Only JSON files are allowed")
    
    # Validate file size
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(413, "File too large. Maximum size is 50MB")
    
    temp_dir = Path("app/storage/temp")
    temp_dir.mkdir(exist_ok=True)
    temp_file = temp_dir / f"temp_{file.filename}"
    
    try:
        # Save uploaded file
        async with aiofiles.open(temp_file, 'wb') as f:
            await f.write(content)
        
        print(f"📥 Processing: {file.filename}")
        
        # Analyze JSON (quick operation)
        analysis = json_analyzer.analyze_json_file(str(temp_file))
        
        # Store based on analysis
        result = json_analyzer.store_json_file(str(temp_file), file.filename, analysis)
        
        if result["success"]:
            response = {
                "message": "JSON processed successfully!",
                "details": result,
                "analysis": analysis
            }
            
            # Add background task for additional processing
            if not result.get("duplicate"):
                background_tasks.add_task(process_additional_metadata, str(temp_file), analysis)
            
            return response
        else:
            raise HTTPException(500, result["error"])
            
    except Exception as e:
        # Cleanup on error
        if temp_file.exists():
            temp_file.unlink()
        raise HTTPException(500, f"Processing failed: {str(e)}")

@router.post("/bulk-upload")
async def bulk_upload_json(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """
    Process multiple JSON files efficiently
    """
    results = []
    tasks = []
    
    for file in files:
        if file.filename.lower().endswith('.json'):
            # Process each file concurrently
            task = process_single_file(file)
            tasks.append(task)
    
    # Wait for all files to process
    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    successful = [r for r in results if not isinstance(r, Exception) and r.get("success")]
    failed = [r for r in results if isinstance(r, Exception) or not r.get("success")]
    
    return {
        "message": f"Bulk processing completed",
        "summary": {
            "total_files": len(files),
            "successful": len(successful),
            "failed": len(failed)
        },
        "successful_files": successful,
        "failed_files": failed
    }

async def process_single_file(file: UploadFile) -> Dict:
    """Process a single file asynchronously"""
    try:
        content = await file.read()
        temp_dir = Path("app/storage/temp")
        temp_file = temp_dir / f"bulk_{file.filename}"
        
        async with aiofiles.open(temp_file, 'wb') as f:
            await f.write(content)
        
        analysis = json_analyzer.analyze_json_file(str(temp_file))
        result = json_analyzer.store_json_file(str(temp_file), file.filename, analysis)
        
        return result
        
    except Exception as e:
        return {"success": False, "error": str(e), "filename": file.filename}

@router.get("/files")
async def list_json_files(
    category: str = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Enhanced file listing with filtering and pagination
    """
    try:
        sql_files = []
        nosql_files = []
        
        # Get SQL files with metadata
        sql_path = Path("app/storage/databases/sql")
        if sql_path.exists():
            for file in sql_path.glob("*.json"):
                if file.name.endswith('.meta.json'):
                    continue
                    
                metadata = await get_file_metadata(file)
                sql_files.append({
                    "filename": file.name,
                    "size": file.stat().st_size,
                    "modified": file.stat().st_mtime,
                    "metadata": metadata
                })
        
        # Get NoSQL files with metadata
        nosql_path = Path("app/storage/databases/nosql")
        if nosql_path.exists():
            for file in nosql_path.glob("*.json"):
                if file.name.endswith('.meta.json'):
                    continue
                    
                metadata = await get_file_metadata(file)
                nosql_files.append({
                    "filename": file.name,
                    "size": file.stat().st_size,
                    "modified": file.stat().st_mtime,
                    "metadata": metadata
                })
        
        # Apply filtering
        if category == "sql":
            files = sql_files
        elif category == "nosql":
            files = nosql_files
        else:
            files = sql_files + nosql_files
        
        # Apply pagination
        total_files = len(files)
        paginated_files = files[offset:offset + limit]
        
        return {
            "files": paginated_files,
            "pagination": {
                "total": total_files,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total_files
            },
            "summary": {
                "sql_files": len(sql_files),
                "nosql_files": len(nosql_files),
                "total_files": total_files
            }
        }
        
    except Exception as e:
        raise HTTPException(500, f"Error listing files: {str(e)}")

async def get_file_metadata(file_path: Path) -> Dict:
    """Get metadata for a file"""
    metadata_path = file_path.with_suffix('.meta.json')
    if metadata_path.exists():
        async with aiofiles.open(metadata_path, 'r') as f:
            content = await f.read()
            return json.loads(content)
    return {}

def process_additional_metadata(file_path: str, analysis: Dict):
    """Background task for additional processing"""
    # This runs in background - doesn't block the response
    try:
        # Could generate previews, create indexes, etc.
        print(f"Background processing completed for {file_path}")
    except Exception as e:
        print(f"Background processing failed: {e}")