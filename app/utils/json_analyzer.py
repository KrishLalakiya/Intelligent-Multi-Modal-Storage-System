# app/utils/json_analyzer.py

import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime
import hashlib

class JSONAnalyzer:
    def __init__(self):
        self.base_dir = Path("app/storage")
        self.sql_path = self.base_dir / "databases" / "sql"
        self.nosql_path = self.base_dir / "databases" / "nosql"
        self.temp_path = self.base_dir / "temp"
        self.schema_path = self.base_dir / "internal_databases" / "schemas"
        
        # Create directories efficiently
        for path in [self.sql_path, self.nosql_path, self.temp_path,self.schema_path]:
            path.mkdir(parents=True, exist_ok=True)

    def analyze_json_file(self, file_path: str) -> Dict[str, Any]:
        """
        Enhanced analysis with better performance and more insights
        """
        try:
            # Use file size for quick decisions
            file_size = os.path.getsize(file_path)
            if file_size > 10 * 1024 * 1024:  # 10MB limit
                return {"recommendation": "nosql", "reason": "File too large for SQL optimization"}
            
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Quick type check
            if isinstance(data, list):
                return self._analyze_array(data, file_path)
            elif isinstance(data, dict):
                return self._analyze_object(data, file_path)
            else:
                return {"recommendation": "nosql", "reason": "Simple data type"}
                
        except json.JSONDecodeError as e:
            return {"recommendation": "nosql", "reason": f"Invalid JSON: {str(e)}"}
        except Exception as e:
            return {"recommendation": "nosql", "reason": f"Analysis error: {str(e)}"}

    def _analyze_array(self, data: List, file_path: str) -> Dict[str, Any]:
        """Optimized array analysis"""
        if not data:
            return {"recommendation": "nosql", "reason": "Empty array"}
        
        # Quick sample analysis (first 10 items for performance)
        sample_size = min(10, len(data))
        sample = data[:sample_size]
        
        if not all(isinstance(item, dict) for item in sample):
            return {"recommendation": "nosql", "reason": "Array contains non-object items"}
        
        # Check structure consistency efficiently
        first_keys = set(sample[0].keys())
        consistent_structure = all(set(item.keys()) == first_keys for item in sample)
        
        if consistent_structure:
            # Additional checks for SQL optimization
            if self._is_sql_optimized(sample, first_keys):
                return {
                    "recommendation": "sql", 
                    "reason": "Uniform structured data optimized for SQL",
                    "estimated_rows": len(data),
                    "columns": list(first_keys)
                }
        
        return {"recommendation": "nosql", "reason": "Variable structure or complex data"}

    def _analyze_object(self, data: Dict, file_path: str) -> Dict[str, Any]:
        """Optimized object analysis"""
        # Check nesting depth efficiently
        max_depth = self._calculate_depth(data)
        
        if max_depth > 2:
            return {
                "recommendation": "nosql", 
                "reason": f"Deeply nested structure (depth: {max_depth})",
                "nesting_level": max_depth
            }
        else:
            return {
                "recommendation": "sql",
                "reason": "Flat or lightly nested structure",
                "keys": list(data.keys())
            }

    def _is_sql_optimized(self, sample: List[Dict], keys: set) -> bool:
        """Check if data is optimized for SQL storage"""
        # Rule 1: Reasonable number of columns
        if len(keys) > 50:
            return False
            
        # Rule 2: Check for common SQL patterns
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

    def store_json_file(self, file_path: str, original_name: str, analysis: Dict) -> Dict[str, Any]:
        """
        Enhanced storage with duplicate detection and metadata
        """
        try:
            # Generate content-based filename for deduplication
            file_hash = self._get_file_hash(file_path)
            name_stem = Path(original_name).stem
            extension = Path(original_name).suffix
            
            # Check for duplicates
            duplicate = self._check_duplicate(file_hash, analysis["recommendation"])
            if duplicate:
                return {
                    "success": True,
                    "original_name": original_name,
                    "stored_name": duplicate,
                    "storage_type": analysis["recommendation"].upper(),
                    "final_path": duplicate,
                    "reason": analysis["reason"],
                    "duplicate": True,
                    "message": "File already exists (duplicate detected)"
                }
            
            # Create unique filename with metadata
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_name = f"{name_stem}_{timestamp}_{file_hash[:8]}{extension}"
            
            # Choose storage location
            if analysis["recommendation"] == "sql":
                final_path = self.sql_path / new_name
                storage_type = "SQL"
            else:
                final_path = self.nosql_path / new_name
                storage_type = "NoSQL"
            
            # Move with metadata
            shutil.move(file_path, str(final_path))
            
            # Save analysis metadata
            self._save_metadata(final_path, analysis, original_name)
            
            return {
                "success": True,
                "original_name": original_name,
                "stored_name": new_name,
                "storage_type": storage_type,
                "final_path": str(final_path),
                "reason": analysis["reason"],
                "file_hash": file_hash,
                "timestamp": timestamp
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

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
        
        for existing_file in storage_path.glob("*.json"):
            if file_hash in existing_file.name:
                return str(existing_file)
        return ""

    def _save_metadata(self, file_path: Path, analysis: Dict, original_name: str):
        """Save analysis metadata alongside the file"""
        metadata = {
            "original_filename": original_name,
            "analysis": analysis,
            "analyzed_at": datetime.now().isoformat(),
            "file_size": file_path.stat().st_size
        }
        
        metadata_path = file_path.with_suffix('.meta.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        schema_info = {
            "original_filename": original_name,
            "storage_type": analysis["recommendation"],
            # Use 'columns' for SQL arrays, 'keys' for objects
            "columns": analysis.get("columns", analysis.get("keys", [])), 
            "reason": analysis["reason"],
            "analyzed_at": datetime.now().isoformat()
        }
        
        schema_file_name = file_path.stem + '.schema.json'
        schema_path = self.schema_path / schema_file_name
        
        with open(schema_path, 'w') as f:
            json.dump(schema_info, f, indent=2)       

            