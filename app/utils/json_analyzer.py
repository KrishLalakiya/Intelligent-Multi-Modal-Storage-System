import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime
import hashlib

# --- Imports from BOTH files ---
import cloudinary
import cloudinary.uploader
import sqlite3
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

class JSONAnalyzer:
    def __init__(self):
        self.base_dir = Path("app/storage")
        self.sql_path = self.base_dir / "databases" / "sql"
        self.nosql_path = self.base_dir / "databases" / "nosql"
        self.temp_path = self.base_dir / "temp"
        self.schema_path = self.base_dir / "internal_databases" / "schemas"
        
        # Create directories
        for path in [self.sql_path, self.nosql_path, self.temp_path, self.schema_path]:
            path.mkdir(parents=True, exist_ok=True)
        
        # --- Database connections (from new code) ---
        try:
            # Use check_same_thread=False, which is critical for FastAPI
            self.sql_conn = sqlite3.connect(self.sql_path / "json_data.db", check_same_thread=False)
            print("✅ SQLite connection successful.")
        except Exception as e:
            print(f"❌ SQLite connection failed: {e}")
            self.sql_conn = None

        try:
            self.mongo_client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=5000)
            # Test connection
            self.mongo_client.server_info()
            self.mongo_db = self.mongo_client['json_storage']
            print("✅ MongoDB connection successful.")
        except ConnectionFailure as e:
            print(f"❌ MongoDB connection failed. Is MongoDB running? Error: {e}")
            self.mongo_client = None
            self.mongo_db = None

    # --- Analysis functions ---
    def analyze_json_file(self, file_path: str) -> Dict[str, Any]:
        """
        Enhanced analysis with better performance and more insights
        """
        try:
            file_size = os.path.getsize(file_path)
            if file_size > 10 * 1024 * 1024:  # 10MB limit
                return {"recommendation": "nosql", "reason": "File too large for SQL optimization"}
            
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if isinstance(data, list):
                return self._analyze_array(data, file_path)
            elif isinstance(data, dict):
                return self._analyze_object(data, file_path)  
            else:
                return {"recommendation": "nosql", "reason": "Simple scalar data type"}
                
        except json.JSONDecodeError as e:
            return {"recommendation": "nosql", "reason": f"Invalid JSON: {str(e)}"}
        except Exception as e:
            return {"recommendation": "nosql", "reason": f"Analysis error: {str(e)}"}

    def _analyze_array(self, data: List, file_path: str) -> Dict[str, Any]:
        """Optimized array analysis"""
        if not data:
            return {"recommendation": "nosql", "reason": "Empty array"}
        sample_size = min(10, len(data))
        sample = data[:sample_size]
        if not all(isinstance(item, dict) for item in sample):
            return {"recommendation": "nosql", "reason": "Array contains non-object items"}
        first_keys = set(sample[0].keys())
        consistent_structure = all(set(item.keys()) == first_keys for item in sample)
        
        # FIXED: Check nesting depth for arrays
        max_depth = self._calculate_depth(sample[0])
        
        # NEW LOGIC: If nesting >= 1, it's NoSQL
        if max_depth >= 1:
            return {
                "recommendation": "nosql",
                "reason": f"Nested data structure (depth: {max_depth})",
                "nesting_level": max_depth
            }
        
        if consistent_structure:
            if self._is_sql_optimized(sample, first_keys):
                return {
                    "recommendation": "sql",  
                    "reason": "Uniform flat structured data",
                    "estimated_rows": len(data),
                    "columns": list(first_keys)
                }
        return {"recommendation": "nosql", "reason": "Variable structure"}

    def _analyze_object(self, data: Dict, file_path: str) -> Dict[str, Any]:
        """Optimized object analysis."""
        max_depth = self._calculate_depth(data)
        
        # NEW LOGIC: If nesting >= 1, it's NoSQL
        if max_depth >= 1:
            return {
                "recommendation": "nosql",  
                "reason": f"Nested data (depth: {max_depth})",
                "nesting_level": max_depth
            }
        else:
            return {
                "recommendation": "sql",
                "reason": "Flat structure",
                "keys": list(data.keys())
            }

    def _is_sql_optimized(self, sample: List[Dict], keys: set) -> bool:
        """Check if data is optimized for SQL storage"""
        if len(keys) > 50: return False
        has_id = any(key.lower() in ['id', '_id'] for key in keys)
        has_foreign_keys = any(key.endswith('_id') for key in keys)
        return has_id or has_foreign_keys or len(keys) <= 20

    def _calculate_depth(self, obj, current_depth=0) -> int:
        """Calculate maximum nesting depth efficiently"""
        if not isinstance(obj, (dict, list)):
            return current_depth
        
        max_depth = current_depth
        
        if isinstance(obj, dict):
            for value in obj.values():
                if isinstance(value, (dict, list)):
                    max_depth = max(max_depth, self._calculate_depth(value, current_depth + 1))
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    max_depth = max(max_depth, self._calculate_depth(item, current_depth + 1))
        
        return max_depth

    # --- Helper for SQL Storage (from new code) ---
    def _store_in_sql(self, data: List[Dict], table_name: str) -> str:
        if not self.sql_conn:
            return "SQL connection not available."
        try:
            if not data: return "No data to store"
            
            first_item = data[0]
            columns = list(first_item.keys())
            
            # Sanitize column and table names (basic)
            safe_table_name = "".join(c for c in table_name if c.isalnum() or c == '_')
            safe_columns = ["".join(c for c in col if c.isalnum() or c == '_') for col in columns]
            
            cursor = self.sql_conn.cursor()
            columns_def = ", ".join([f'"{col}" TEXT' for col in safe_columns])
            cursor.execute(f"CREATE TABLE IF NOT EXISTS {safe_table_name} ({columns_def})")
            
            placeholders = ", ".join(["?" for _ in safe_columns])
            for item in data:
                # Ensure values are safely converted to strings
                values = [json.dumps(item.get(col)) if isinstance(item.get(col), (dict, list)) else str(item.get(col, '')) for col in columns]
                cursor.execute(f"INSERT INTO {safe_table_name} VALUES ({placeholders})", values)
            
            self.sql_conn.commit()
            return f"Stored {len(data)} rows in SQL table '{safe_table_name}'"
        except Exception as e:
            self.sql_conn.rollback()
            return f"SQL storage error: {str(e)}"

    # --- Helper for NoSQL Storage (from new code) ---
    def _store_in_nosql(self, data: Any, collection_name: str) -> str:
        if not self.mongo_db:
            return "MongoDB connection not available."
        try:
            # Sanitize collection name (basic)
            safe_collection_name = "".join(c for c in collection_name if c.isalnum() or c in ['_', '-'])
            if not safe_collection_name:
                safe_collection_name = "default_collection"
            collection = self.mongo_db[safe_collection_name]
            
            if isinstance(data, list):
                if not data: return "No data to store"
                result = collection.insert_many(data)
                return f"Stored {len(result.inserted_ids)} documents in MongoDB collection '{safe_collection_name}'"
            else:
                result = collection.insert_one(data)
                return f"Stored 1 document in MongoDB collection '{safe_collection_name}'"
        except Exception as e:
            return f"NoSQL storage error: {str(e)}"

    # --- MERGED: The new store_json_file function (with bug fix) ---
    def store_json_file(self, file_path: str, original_name: str, analysis: Dict) -> Dict[str, Any]:
        """
        MERGED FUNCTION:
        1. Stores the FILE based on STORAGE_MODE (local/online)
        2. Stores the CONTENT into the correct database (SQL/NoSQL)
        """
        storage_mode = os.getenv("STORAGE_MODE", "local")
        recommendation = analysis["recommendation"]
        
        try:
            # --- 1. Hashing and Deduplication (from your old file) ---
            file_hash = self._get_file_hash(file_path)
            duplicate = self._check_duplicate(file_hash, recommendation)
            
            if duplicate:
                Path(file_path).unlink(missing_ok=True)  # Clean up temp file
                return {
                    "success": True, "message": "File already exists (duplicate detected)",
                    "original_name": original_name, "stored_name": Path(duplicate).name,
                    "storage_type": recommendation.upper(), "final_path": duplicate,
                    "reason": analysis["reason"], "duplicate": True
                }
                
            # --- 2. Define Paths and Names (from both files) ---
            name_stem = Path(original_name).stem
            extension = Path(original_name).suffix
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            # For file storage
            new_file_name = f"{name_stem}_{timestamp}_{file_hash[:8]}{extension}"
            # For DB storage
            db_name = f"{name_stem}_{timestamp}"

            if recommendation == "sql":
                local_target_path = self.sql_path / new_file_name
                cloudinary_folder = "json/sql"
            else:
                local_target_path = self.nosql_path / new_file_name
                cloudinary_folder = "json/nosql"
            
            public_id = Path(new_file_name).stem

            # --- 3. Result dictionary (will be built up) ---
            result = {
                "success": True, "original_name": original_name,
                "stored_name": new_file_name, "storage_type": recommendation.upper(),
                "local_path": None, "online_url": None,
                "database_name": db_name, "database_result": None,
                "reason": analysis["reason"], "file_hash": file_hash,
                "timestamp": timestamp, "duplicate": False
            }

            # --- 4. File Storage (from your old file) ---
            if storage_mode in ("local", "both"):
                shutil.copy(file_path, local_target_path) 
                result["local_path"] = str(local_target_path)

            if storage_mode in ("online", "both"):
                try:
                    upload_result = cloudinary.uploader.upload(
                        file_path, public_id=public_id,
                        folder=cloudinary_folder, resource_type="raw"
                    )
                    result["online_url"] = upload_result["secure_url"]
                except Exception as e:
                    print(f"Cloudinary upload failed: {e}")
                    if storage_mode == "online":
                        raise ValueError(f"Cloudinary upload failed: {e}")

            # --- 5. Database Storage (from your new file) ---
            # Read the file's content for DB insertion
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if recommendation == "sql":
                db_data = [data] if isinstance(data, dict) else data
                if isinstance(db_data, list) and (len(db_data) == 0 or isinstance(db_data[0], dict)):
                     result["database_result"] = self._store_in_sql(db_data, db_name)
                else:
                    result["database_result"] = "SQL storage skipped: data is not a list of objects."
            else:
                result["database_result"] = self._store_in_nosql(data, db_name)

            # --- 6. BUG FIX: Save Metadata AFTER getting URL ---
            if storage_mode in ("local", "both"):
                # We save metadata only if we have a local file to save it *next to*
                self._save_metadata(
                    local_target_path, 
                    analysis, 
                    original_name, 
                    result.get("online_url") # Pass the URL
                )

            # --- 7. Cleanup Temp File ---
            Path(file_path).unlink(missing_ok=True)
            
            return result

        except Exception as e:
            Path(file_path).unlink(missing_ok=True)
            return {"success": False, "error": str(e)}

    # --- Helper functions (from your old file) ---
    def _get_file_hash(self, file_path: str) -> str:
        """Generate file hash for deduplication"""
        hasher = hashlib.md5()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _check_duplicate(self, file_hash: str, storage_type: str) -> str:
        """Check if file already exists"""
        storage_path = self.sql_path if storage_type == "sql" else self.nosql_path
        for existing_file in storage_path.glob("*"):
            if existing_file.is_file() and existing_file.name.endswith('.json') and not existing_file.name.endswith(('.meta.json', '.schema.json')):
                if file_hash in existing_file.name:
                    return str(existing_file)
        return ""

    # --- MODIFIED: _save_metadata (with bug fix) ---
    def _save_metadata(self, file_path: Path, analysis: Dict, original_name: str, online_url: str = None):
        """Saves metadata for the *stored file*."""
        try:
            # 1. Save Metadata
            metadata = {
                "original_filename": original_name,
                "analysis": analysis,
                "analyzed_at": datetime.now().isoformat(),
                "file_size": file_path.stat().st_size,
                "online_url": online_url  # <-- ADDED THIS LINE
            }
            
            metadata_path = file_path.with_suffix('.meta.json')
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)

            # 2. Save Schema
            schema_info = {
                "original_filename": original_name,
                "storage_type": analysis["recommendation"],
                "columns": analysis.get("columns", analysis.get("keys", [])),  
                "reason": analysis["reason"],
                "analyzed_at": datetime.now().isoformat()
            }
            
            schema_file_name = file_path.stem + '.schema.json'
            schema_path = self.schema_path / schema_file_name
            with open(schema_path, 'w') as f:
                json.dump(schema_info, f, indent=2)
        except Exception as e:
            print(f"Error saving metadata for {file_path}: {e}")

    # --- NEW: Cleanup function ---
    def __del__(self):
        """Clean up database connections"""
        if hasattr(self, 'sql_conn') and self.sql_conn:
            self.sql_conn.close()
            print("SQLite connection closed.")
        if hasattr(self, 'mongo_client') and self.mongo_client:
            self.mongo_client.close()
            print("MongoDB connection closed.")