"""
Run this script to test if your backend is working correctly.
Usage: python test_upload.py
"""

import requests
import os
from pathlib import Path

API_BASE = "http://127.0.0.1:8000"

def test_health():
    """Test health endpoint"""
    print("\n" + "="*50)
    print("1. Testing Health Endpoint")
    print("="*50)
    try:
        response = requests.get(f"{API_BASE}/health")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_root():
    """Test root endpoint"""
    print("\n" + "="*50)
    print("2. Testing Root Endpoint")
    print("="*50)
    try:
        response = requests.get(f"{API_BASE}/")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Root endpoint failed: {e}")
        return False

def create_test_image():
    """Create a simple test image file"""
    from PIL import Image
    
    test_file = Path("test_image.jpg")
    if not test_file.exists():
        # Create a simple 100x100 red image
        img = Image.new('RGB', (100, 100), color='red')
        img.save(test_file)
        print(f"✅ Created test image: {test_file}")
    return test_file

def create_test_json():
    """Create a test JSON file"""
    import json
    
    test_file = Path("test_data.json")
    
    # Flat JSON (should be SQL)
    flat_data = {
        "id": 1,
        "name": "Test User",
        "email": "test@example.com",
        "age": 25
    }
    
    with open(test_file, 'w') as f:
        json.dump(flat_data, f, indent=2)
    
    print(f"✅ Created test JSON: {test_file}")
    return test_file

def create_nested_json():
    """Create a nested JSON file"""
    import json
    
    test_file = Path("test_nested.json")
    
    # Nested JSON (should be NoSQL)
    nested_data = {
        "id": 1,
        "user": {
            "name": "Test User",
            "profile": {
                "age": 25,
                "location": "Test City"
            }
        }
    }
    
    with open(test_file, 'w') as f:
        json.dump(nested_data, f, indent=2)
    
    print(f"✅ Created nested JSON: {test_file}")
    return test_file

def test_upload(file_path, file_type):
    """Test file upload"""
    print("\n" + "="*50)
    print(f"3. Testing Upload: {file_path.name} ({file_type})")
    print("="*50)
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (file_path.name, f)}
            response = requests.post(f"{API_BASE}/upload", files=files)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 201:
            print(f"✅ Upload successful!")
            print(f"Response: {response.json()}")
            return True
        else:
            print(f"❌ Upload failed!")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return False

def test_get_files():
    """Test get files endpoint"""
    print("\n" + "="*50)
    print("4. Testing Get Files Endpoint")
    print("="*50)
    try:
        response = requests.get(f"{API_BASE}/files")
        print(f"Status Code: {response.status_code}")
        data = response.json()
        print(f"Total files found: {len(data)}")
        if data:
            print(f"First file: {data[0]}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Get files failed: {e}")
        return False

def main():
    print("\n🚀 FileVibe Backend Test Suite")
    print("=" * 50)
    
    # Check if PIL is installed for image creation
    try:
        from PIL import Image
        has_pil = True
    except ImportError:
        print("⚠️  PIL not installed. Install with: pip install Pillow")
        has_pil = False
    
    # Test 1: Health
    if not test_health():
        print("\n❌ Backend is not running! Start it with: uvicorn main:app --reload")
        return
    
    # Test 2: Root
    test_root()
    
    # Test 3: Upload Image (if PIL available)
    if has_pil:
        test_image = create_test_image()
        test_upload(test_image, "image")
    else:
        print("\n⚠️  Skipping image test (PIL not installed)")
    
    # Test 4: Upload Flat JSON
    test_json = create_test_json()
    test_upload(test_json, "flat JSON")
    
    # Test 5: Upload Nested JSON
    test_nested = create_nested_json()
    test_upload(test_nested, "nested JSON")
    
    # Test 6: Get Files
    test_get_files()
    
    print("\n" + "="*50)
    print("✅ Test suite completed!")
    print("="*50)
    
    # Cleanup
    if has_pil:
        Path("test_image.jpg").unlink(missing_ok=True)
    Path("test_data.json").unlink(missing_ok=True)
    Path("test_nested.json").unlink(missing_ok=True)

if __name__ == "__main__":
    main()