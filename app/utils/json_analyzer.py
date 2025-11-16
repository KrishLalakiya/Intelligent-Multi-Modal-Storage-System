# app/utils/json_analyzer.py

import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime
import hashlib

import cloudinary
import cloudinary.uploader
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from dotenv import load_dotenv

class JSONAnalyzer:
    def __init__(self):
        load_dotenv()  # Load .env variables

        self.base_dir = Path("app/storage")
        self.sql_path = self.base_dir / "databases" / "sql"
        self.nosql_path = self.base_dir / "databases" / "nosql"
        self.temp_path = self.base_dir / "temp"
        self.schema_path = self.base_dir / "internal_databases" / "schemas"
        
        for path in [self.sql_path, self.nosql_path, self.temp_path, self.schema_path]:
            path.mkdir(parents=True, exist_ok=True)
        
        # --- THIS IS THE FIX ---
        self.storage_mode = os.getenv("STORAGE_MODE", "local")
        self.mongo_client = None
        self.mongo_db = None

        if self.storage_mode in ("online", "both"):
            MONGODB_URI = os.getenv("MONGODB_URI")
            try:
                if not MONGODB_URI:
                    raise ConnectionFailure("MONGODB_URI environment variable not set.")
                
                self.mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
                self.mongo_client.server_info()  # Test connection
                self.mongo_db = self.mongo_client.get_default_database()
                print("✅ MongoDB Atlas connection successful.")
            
            except ConnectionFailure as e:
                print(f"❌ MongoDB connection failed. Is URI correct? Error: {e}")
                self.mongo_client = None
                self.mongo_db = None
        else:
            print("✅ MongoDB connection SKIPPED (local mode).")
        # --- END OF FIX ---


    # --- Analysis functions (NO CHANGES) ---
    def analyze_json_file(self, file_path: str) -> Dict[str, Any]:
        try:
            file_size = os.path.getsize(file_path)
            if file_size > 10 * 1024 * 1024:  # 10MB limit
                return {"recommendation": "nosql", "reason": "File too large"}
            with open(file_path, 'r', encoding='utf-8') as f: data = json.load(f)
            if isinstance(data, list): return self._analyze_array(data, file_path)
            elif isinstance(data, dict): return self._analyze_object(data, file_path)  
            else: return {"recommendation": "nosql", "reason": "Simple scalar data type"}
        except json.JSONDecodeError as e: return {"recommendation": "nosql", "reason": f"Invalid JSON: {str(e)}"}
        except Exception as e: return {"recommendation": "nosql", "reason": f"Analysis error: {str(e)}"}

    def _analyze_array(self, data: List, file_path: str) -> Dict[str, Any]:
        if not data: return {"recommendation": "nosql", "reason": "Empty array"}
        sample_size = min(10, len(data))
        sample = data[:sample_size]
        if not all(isinstance(item, dict) for item in sample): return {"recommendation": "nosql", "reason": "Array contains non-object items"}
        first_keys = set(sample[0].keys())
        consistent_structure = all(set(item.keys()) == first_keys for item in sample)
        if consistent_structure:
            if self._is_sql_optimized(sample, first_keys): return {"recommendation": "sql", "reason": "Uniform structured data"}
        return {"recommendation": "nosql", "reason": "Variable structure"}

    def _analyze_object(self, data: Dict, file_path: str) -> Dict[str, Any]:
        max_depth = self._calculate_depth(data)
        if max_depth > 1: return {"recommendation": "nosql", "reason": f"Nested data (depth: {max_depth})"}
        else: return {"recommendation": "sql", "reason": "Flat structure"}

    def _is_sql_optimized(self, sample: List[Dict], keys: set) -> bool:
        if len(keys) > 50: return False
        has_id = any(key.lower() in ['id', '_id'] for key in keys)
        return has_id or len(keys) <= 20

    def _calculate_depth(self, obj, current_depth=0) -> int:
        if not isinstance(obj, dict): return current_depth
        max_depth = current_depth
        for value in obj.values():
            if isinstance(value, dict): max_depth = max(max_depth, self._calculate_depth(value, current_depth + 1))
        return max_depth

    # --- Helper to store a document in MongoDB (NO CHANGES) ---
    def _store_document_in_nosql(self, data: Dict, collection_name: str) -> str:
        if not self.mongo_db: return "MongoDB connection not available."
        try:
            collection = self.mongo_db[collection_name]
            result = collection.update_one(
                {"_id": data["_id"]}, {"$set": data}, upsert=True
            )
            if result.upserted_id: return f"Stored new document with ID {result.upserted_id}"
            elif result.matched_count > 0: return f"Updated document with ID {data['_id']}"
            else: return "Document stored (no change)."
        except Exception as e: return f"NoSQL storage error: {str(e)}"

    # --- store_json_file (NO CHANGES - it's already correct) ---
    def store_json_file(self, file_path: str, original_name: str, analysis: Dict) -> Dict[str, Any]:
        recommendation = analysis["recommendation"]
        try:
            file_hash = self._get_file_hash(file_path)
            name_stem = Path(original_name).stem
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            result = {
                "success": True, "original_name": original_name,
                "stored_name": original_name, "storage_type": recommendation.upper(),
                "local_path": None, "online_url": None, "database_result": None,
                "reason": analysis["reason"], "file_hash": file_hash,
                "timestamp": timestamp, "duplicate": False
            }

            # --- 1. Online Storage (MongoDB) ---
            if self.storage_mode in ("online", "both"):
                if not self.mongo_db:
                    raise ConnectionError("MongoDB is not connected. Check MONGODB_URI.")
                with open(file_path, 'r', encoding='utf-8') as f: data = json.load(f)
                document_to_store = {
                    "_id": file_hash, "original_filename": original_name,
                    "analysis": analysis, "stored_at": datetime.now(),
                    "content": data
                }
                collection_name = "sql_data" if recommendation == "sql" else "nosql_data"
                db_result = self._store_document_in_nosql(document_to_store, collection_name)
                result["database_result"] = db_result

            # --- 2. Local File Storage ---
            if self.storage_mode in ("local", "both"):
                local_target_path = (self.sql_path if recommendation == "sql" else self.nosql_path)
                local_target_path = local_target_path / f"{name_stem}_{timestamp}{Path(original_name).suffix}"
                shutil.copy(file_path, local_target_path)
                result["local_path"] = str(local_target_path)
                self._save_metadata(local_target_path, analysis, original_name, None)

            Path(file_path).unlink(missing_ok=True)
            return result

        except Exception as e:
            Path(file_path).unlink(missing_ok=True)
            return {"success": False, "error": str(e)}

    # --- Helper functions (NO CHANGES) ---
    def _get_file_hash(self, file_path: str) -> str:
        hasher = hashlib.md5()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""): hasher.update(chunk)
        return hasher.hexdigest()

    def _save_metadata(self, file_path: Path, analysis: Dict, original_name: str, online_url: str = None):
        try:
            metadata = {
                "original_filename": original_name, "analysis": analysis,
                "analyzed_at": datetime.now().isoformat(),
                "file_size": file_path.stat().st_size, "online_url": online_url
            }
            metadata_path = file_path.with_suffix('.meta.json')
            with open(metadata_path, 'w') as f: json.dump(metadata, f, indent=2)
        except Exception as e: print(f"Error saving metadata for {file_path}: {e}")