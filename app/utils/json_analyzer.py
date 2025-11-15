import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime
import hashlib
import cloudinary  # <-- 1. ADD THIS
import cloudinary.uploader  # <-- 2. ADD THIS

class JSONAnalyzer:
    def __init__(self):
        self.base_dir = Path("app/storage")
        self.sql_path = self.base_dir / "databases" / "sql"
        self.nosql_path = self.base_dir / "databases" / "nosql"
        self.temp_path = self.base_dir / "temp"
        self.schema_path = self.base_dir / "internal_databases" / "schemas"
        
        # Create directories efficiently
        for path in [self.sql_path, self.nosql_path, self.temp_path, self.schema_path]:
            path.mkdir(parents=True, exist_ok=True)

    # --- NO CHANGES NEEDED TO ANY ANALYSIS FUNCTIONS ---
    # analyze_json_file, _analyze_array, _analyze_object,
    # _is_sql_optimized, and _calculate_depth are all excellent.
    
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
                return {"recommendation": "nosql", "reason": "Simple scalar data type, best handled as NoSQL document"}
                
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
            return {"recommendation": "nosql", "reason": "Array contains non-object items, lacks uniform structure"}
        
        first_keys = set(sample[0].keys())
        consistent_structure = all(set(item.keys()) == first_keys for item in sample)
        
        if consistent_structure:
            if self._is_sql_optimized(sample, first_keys):
                return {
                    "recommendation": "sql",  
                    "reason": "Uniform structured data optimized for SQL",
                    "estimated_rows": len(data),
                    "columns": list(first_keys)
                }
        
        return {"recommendation": "nosql", "reason": "Variable structure or complex data, better for NoSQL batch insertion"}

    def _analyze_object(self, data: Dict, file_path: str) -> Dict[str, Any]:
        """
        Optimized object analysis.
        Modified to recommend NoSQL for any immediate nesting (depth > 1) 
        to handle document-style data.
        """
        
        has_immediate_nesting = False
        for value in data.values():
            if isinstance(value, dict) and value:
                has_immediate_nesting = True
                break
            if isinstance(value, list) and value and any(isinstance(item, (dict, list)) for item in value):
                has_immediate_nesting = True
                break
        
        max_depth = self._calculate_depth(data)  

        if has_immediate_nesting:
            return {
                "recommendation": "nosql",  
                "reason": f"Contains nested dictionary or list (depth: {max_depth}), ideal for document storage.",
                "nesting_level": max_depth
            }
        else:
            return {
                "recommendation": "sql",
                "reason": "Flat structure, ideal for relational querying.",
                "keys": list(data.keys())
            }

    def _is_sql_optimized(self, sample: List[Dict], keys: set) -> bool:
        """Check if data is optimized for SQL storage"""
        if len(keys) > 50:
            return False
            
        has_id = any(key.lower() in ['id', '_id'] for key in keys)
        has_foreign_keys = any(key.endswith('_id') for key in keys)
        
        return has_id or has_foreign_keys or len(keys) <= 20

    def _calculate_depth(self, obj, current_depth=0) -> int:
        """Calculate maximum nesting depth efficiently"""
        if not isinstance(obj, dict):
            return current_depth
        
        max_depth = current_depth
        for value in obj.values():
            if isinstance(value, dict):
                max_depth = max(max_depth, self._calculate_depth(value, current_depth + 1))
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                max_depth = max(max_depth, self._calculate_depth(value[0], current_depth + 1))
        
        return max_depth

    # --- 3. THIS IS THE FULLY UPDATED FUNCTION ---
    
    def store_json_file(self, file_path: str, original_name: str, analysis: Dict) -> Dict[str, Any]:
        """
        Enhanced storage with duplicate detection, metadata, AND support 
        for 'local', 'online', or 'both' storage modes.
        """
        storage_mode = os.getenv("STORAGE_MODE", "local")
        recommendation = analysis["recommendation"]
        
        try:
            # --- 1. Hashing and Deduplication (from your code) ---
            file_hash = self._get_file_hash(file_path)
            duplicate = self._check_duplicate(file_hash, recommendation)
            
            if duplicate:
                Path(file_path).unlink(missing_ok=True)  # Clean up temp file
                return {
                    "success": True,
                    "original_name": original_name,
                    "stored_name": Path(duplicate).name,
                    "storage_type": recommendation.upper(),
                    "final_path": duplicate, # This is the local_path
                    "reason": analysis["reason"],
                    "duplicate": True,
                    "message": "File already exists (duplicate detected)"
                }
                
            # --- 2. Define Paths and Names (from your code) ---
            name_stem = Path(original_name).stem
            extension = Path(original_name).suffix
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_name = f"{name_stem}_{timestamp}_{file_hash[:8]}{extension}"

            # Define local and online paths
            if recommendation == "sql":
                local_target_path = self.sql_path / new_name
                cloudinary_folder = "json/sql"
            else:
                local_target_path = self.nosql_path / new_name
                cloudinary_folder = "json/nosql"
            
            public_id = Path(new_name).stem

            # --- 3. Storage Logic with Toggle ---
            result = {
                "success": True,
                "original_name": original_name,
                "stored_name": new_name,
                "storage_type": recommendation.upper(),
                "local_path": None,
                "online_url": None,
                "reason": analysis["reason"],
                "file_hash": file_hash,
                "timestamp": timestamp,
                "duplicate": False
            }

            # --- Save to Local ---
            if storage_mode in ("local", "both"):
                # Use copy, not move, in case 'both' mode is active
                shutil.copy(file_path, local_target_path) 
                result["local_path"] = str(local_target_path)
                # Save metadata for the local file
                self._save_metadata(local_target_path, analysis, original_name)

            # --- Save to Online ---
            if storage_mode in ("online", "both"):
                try:
                    upload_result = cloudinary.uploader.upload(
                        file_path,
                        public_id=public_id,
                        folder=cloudinary_folder,
                        resource_type="raw"
                    )
                    result["online_url"] = upload_result["secure_url"]
                except Exception as e:
                    print(f"Cloudinary upload failed: {e}")
                    # If *only* online mode failed, we must raise an error
                    if storage_mode == "online":
                        raise ValueError(f"Cloudinary upload failed: {e}")

            # --- 4. Cleanup Temp File ---
            Path(file_path).unlink(missing_ok=True)
            
            return result

        except Exception as e:
            # General cleanup on any error
            Path(file_path).unlink(missing_ok=True)
            return {"success": False, "error": str(e)}


    # --- NO CHANGES NEEDED to _get_file_hash, _check_duplicate, or _save_metadata ---
    # They are all perfect.

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

    def _save_metadata(self, file_path: Path, analysis: Dict, original_name: str):
        """Save analysis metadata and schema alongside the file"""
        # 1. Save Metadata
        metadata = {
            "original_filename": original_name,
            "analysis": analysis,
            "analyzed_at": datetime.now().isoformat(),
            "file_size": file_path.stat().st_size
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