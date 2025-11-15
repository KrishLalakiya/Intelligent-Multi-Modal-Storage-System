// API Configuration
const API_BASE_URL = 'http://localhost:8000'; // Your backend URL
const API_ENDPOINTS = {
    // These match the new 'files_router.py' and 'main.py'
    UPLOAD_MEDIA: '/upload/', // The endpoint in 'upload_router.py'
    UPLOAD_JSON: '/json/bulk-upload', // The endpoint in 'json_routes.py'
    GET_FILES: '/files', // The new endpoint in 'files_router.py'
    SEARCH: '/search', // The stub endpoint in 'files_router.py'
    CATEGORIES: '/categories' // The stub endpoint in 'files_router.py'
};

// Global state
let currentFiles = [];
let currentFilters = {
    type: 'all',
    category: 'all'
};

// DOM Elements
const page1 = document.getElementById('page1');
const page2 = document.getElementById('page2');
const btnStart = document.getElementById('btn-start');
const btnUpload = document.getElementById('btn-upload');
const modalUpload = document.getElementById('modal-upload');
const btnClose = document.getElementById('btn-close');
const btnCancel = document.getElementById('btn-cancel');
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('input-file');
const filesGrid = document.getElementById('grid-files');
const btnHome = document.getElementById('btn-home');
const btnTheme = document.getElementById('btn-theme');
const searchInput = document.querySelector('.search-input');
const typeSelect = document.getElementById('select-type');
// Note: 'select-score' is in your JS but not your HTML. I've left the code for it.
const scoreSelect = document.getElementById('select-score'); 
const categories = document.querySelectorAll('.item-cat');
const viewButtons = document.querySelectorAll('.btn-view');
const uploadSubmit = document.querySelector('.btn-submit');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status span');

// API Service Layer
class FileVibeAPI {
    static async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            // Handle empty responses (like a 201 No Content)
            if (response.status === 204) return null; 
            
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // No static methods needed, we will call 'request' directly for simplicity
}

// Backend Integration Functions

async function loadFiles() {
    try {
        showLoadingState(true);
        
        // Build query params from filters
        const params = new URLSearchParams();
        if (currentFilters.type && currentFilters.type !== 'all') {
            params.append('type', currentFilters.type);
        }
        if (currentFilters.category && currentFilters.category !== 'all') {
            params.append('category', currentFilters.category);
        }

        const response = await FileVibeAPI.request(`${API_ENDPOINTS.GET_FILES}?${params}`);
        
        currentFiles = response || []; // The backend returns a list directly
        renderFiles(currentFiles);
        updateCategoryCounts(currentFiles); // Update counts from the files we just got
        updateConnectionStatus(true);
    } catch (error) {
        console.error('Failed to load files:', error);
        showError(`Failed to load files: ${error.message}`);
        updateConnectionStatus(false);
    } finally {
        showLoadingState(false);
    }
}

async function handleFileUpload(files) {
    const mediaFormData = new FormData();
    const jsonFormData = new FormData();
    const jsonFiles = [];
    const mediaFiles = [];

    // 1. Sort files into two buckets
    Array.from(files).forEach(file => {
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
            jsonFormData.append('files', file); // 'files' for bulk JSON upload
            jsonFiles.push(file.name);
        } else {
            mediaFormData.append('file', file); // 'file' for media upload
            mediaFiles.push(file.name);
        }
    });

    try {
        showLoadingState(true, `Uploading ${files.length} file(s)...`);
        let allSuccess = true;
        let errors = [];

        // 2. Upload Media Files (if any)
        // We must upload media files one by one because our media endpoint is singular
        if (mediaFiles.length > 0) {
            console.log(`Uploading ${mediaFiles.length} media file(s)...`);
            for (const file of Array.from(files).filter(f => !f.name.endsWith('.json'))) {
                const singleMediaFormData = new FormData();
                singleMediaFormData.append('file', file);
                try {
                    await FileVibeAPI.request(API_ENDPOINTS.UPLOAD_MEDIA, {
                        method: 'POST',
                        body: singleMediaFormData
                    });
                } catch (error) {
                    allSuccess = false;
                    errors.push(`Failed to upload ${file.name}: ${error.message}`);
                }
            }
        }

        // 3. Upload JSON Files (if any)
        if (jsonFiles.length > 0) {
            console.log(`Uploading ${jsonFiles.length} JSON file(s)...`);
            try {
                // Use the JSON bulk upload endpoint
                await FileVibeAPI.request(API_ENDPOINTS.UPLOAD_JSON, {
                    method: 'POST',
                    body: jsonFormData
                });
            } catch (error) {
                allSuccess = false;
                errors.push(`JSON upload failed: ${error.message}`);
            }
        }

        // 4. Report status
        if (allSuccess) {
            showSuccess('Files uploaded successfully!');
            await loadFiles(); // Refresh the file list
            toggleModal(false);
        } else {
            throw new Error(errors.join(', '));
        }

    } catch (error) {
        console.error('Upload failed:', error);
        showError(`Upload failed: ${error.message}`);
    } finally {
        showLoadingState(false);
    }
}

async function handleSemanticSearch(query) {
    if (query.length < 2) {
        await loadFiles(); // Reload all files if query is cleared
        return;
    }

    try {
        showLoadingState(true, 'Searching...');
        // Use the stub endpoint
        const response = await FileVibeAPI.request(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`);
        currentFiles = response.data || response; // Adjust based on stub
        renderFiles(currentFiles);
    } catch (error) {
        console.error('Search failed:', error);
        showError('Search failed. Please try again.');
    } finally {
        showLoadingState(false);
    }
}

// UI Helper Functions
function showLoadingState(show, message = 'Loading...') {
    if (show) {
        filesGrid.innerHTML = `
            <div class="loading-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }
}

function showError(message) {
    // TODO: Implement a toast notification system
    console.error('Error:', message);
    alert(`Error: ${message}`); // Temporary
}

function showSuccess(message) {
    console.log('Success:', message);
    // TODO: Implement success notification
}

function updateConnectionStatus(connected) {
    statusDot.parentElement.classList.toggle('connected', connected);
    statusDot.parentElement.classList.toggle('disconnected', !connected);
    statusText.textContent = connected ? 'Connected to backend' : 'Backend connection failed';
}

function updateCategoryCounts(files) {
    // This dynamically counts files from the *client-side* list
    const counts = {
        all: files.length,
        Images: files.filter(f => f.category === 'Images').length,
        Videos: files.filter(f => f.category === 'Videos').length,
        SQL: files.filter(f => f.category === 'SQL').length,
        NoSQL: files.filter(f => f.category === 'NoSQL').length,
    };

    categories.forEach(catElement => {
        const category = catElement.dataset.category;
        const countElement = catElement.querySelector('.cat-count');
        if (countElement) {
            countElement.textContent = counts[category] !== undefined ? counts[category] : 0;
        }
    });
}

// Enhanced File Rendering
function renderFiles(files) {
    filesGrid.innerHTML = '';
    
    if (files.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <i class="fas fa-folder-open" style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem;"></i>
                <h3>No files found</h3>
                <p>Try adjusting your filters or upload new files</p>
            </div>
        `;
        return;
    }
    
    files.forEach(file => {
        const fileCard = createFileCard(file);
        filesGrid.appendChild(fileCard);
    });

    // Re-apply current view
    const activeView = document.querySelector('.btn-view.active').dataset.view;
    toggleView(activeView);
}

function createFileCard(file) {
    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';
    
    const previewContent = getFilePreviewContent(file);
    const score = file.score || (file.metadata && file.metadata.analysis ? 100 : 0); // Placeholder
    const fileName = file.name || file.filename;
    
    fileCard.innerHTML = `
        <div class="file-preview">
            ${previewContent}
        </div>
        <div class="file-info">
            <div class="file-name" title="${fileName}">${fileName}</div>
            <div class="file-details">
                <span class="file-type">${(file.type || 'file').toUpperCase()}</span>
                <div class="file-score">
                    <span>${score}%</span>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${score}%"></div>
                    </div>
                </div>
            </div>
            ${file.category ? `<div class="file-category">${file.category}</div>` : ''}
            ${file.timestamp ? `<div class="file-timestamp">${formatTimestamp(file.timestamp)}</div>` : ''}
        </div>
    `;
    
    fileCard.addEventListener('click', () => handleFileClick(file));
    return fileCard;
}

function getFilePreviewContent(file) {
    // Use the online URL if it exists, otherwise use the local one
    const imageUrl = file.cloudinary_url || file.local_url;

    if (file.type === 'image' && imageUrl) {
        return `<img src="${imageUrl}" alt="${file.name}" class="file-img" loading="lazy">`;
    }
    // Simple icon for video for now
    if (file.type === 'video') {
         return `<i class="fas fa-file-video"></i>`;
    }
    if (file.type === 'json') {
        return `<i class="fas fa-file-code"></i>`;
    }

    // Default icon
    return `<i class="fas fa-file"></i>`;
}

function formatTimestamp(timestamp) {
    // Handle both ISO strings and UNIX timestamps
    const date = new Date(timestamp);
    return date.toLocaleDateString();
}

function handleFileClick(file) {
    console.log('File clicked:', file);
    // Open the direct URL (Cloudinary or local) in a new tab
    const url = file.cloudinary_url || file.local_url;
    if (url) {
        // For local URLs, we must prepend the API base
        if (file.local_url && !file.local_url.startsWith('http')) {
            window.open(`${API_BASE_URL}${file.local_url}`, '_blank');
        } else {
            window.open(url, '_blank');
        }
    } else {
        showError('No preview URL available for this file.');
    }
}

// Filter and Search Functions
async function applyFilters() {
    currentFilters = {
        type: typeSelect.value,
        // score: scoreSelect.value, // Uncomment if you add this back
        category: document.querySelector('.item-cat.active').dataset.category
    };
    
    await loadFiles();
}

async function handleSearch(e) {
    const query = e.target.value.trim();
        
    // Debounce search
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(async () => {
        await handleSemanticSearch(query);
    }, 300);
}

// UI Functions
function showSecondPage() {
    page1.classList.add('hidden');
    setTimeout(() => {
        page2.classList.add('active');
        loadFiles(); // Load files when entering the app
    }, 800);
}

function showFirstPage() {
    page2.classList.remove('active');
    setTimeout(() => {
        page1.classList.remove('hidden');
    }, 500);
}

function toggleModal(show) {
    if (show) {
        modalUpload.classList.add('active');
    } else {
        modalUpload.classList.remove('active');
        fileInput.value = ''; // Reset file input
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const icon = btnTheme.querySelector('i');

    if (document.body.classList.contains('light-mode')) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
}

function toggleView(view) {
    if (view === 'list') {
        filesGrid.style.gridTemplateColumns = '1fr';
        filesGrid.style.gap = '0.5rem';
        document.querySelectorAll('.file-card').forEach(card => {
            card.style.display = 'flex';
            card.style.height = '80px';
            card.querySelector('.file-preview').style.width = '80px';
            card.querySelector('.file-preview').style.height = '80px';
            card.querySelector('.file-preview').style.flexShrink = '0';
            card.querySelector('.file-info').style.flex = '1';
            card.querySelector('.file-info').style.padding = '0.5rem 1rem';
        });
    } else {
        filesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
        filesGrid.style.gap = '1.5rem';
        document.querySelectorAll('.file-card').forEach(card => {
            card.style.display = 'block';
            card.style.height = 'auto';
            card.querySelector('.file-preview').style.width = '100%';
            card.querySelector('.file-preview').style.height = '150px';
            card.querySelector('.file-info').style.flex = 'none';
            card.querySelector('.file-info').style.padding = '1rem';
        });
    }
}

// Enhanced File Upload Handling
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        console.log(`Selected ${files.length} file(s) for upload`);
        // Update UI to show selected file names (optional)
    }
}

// Drag and Drop Support
function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('drag-over'), false);
    });

    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files; // Assign dropped files to the input
        
        // Trigger change event for consistency
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
    }
}

// Initialize App
async function initApp() {
    // Setup drag and drop
    setupDragAndDrop();
    
    // Event Listeners
    btnStart.addEventListener('click', showSecondPage);
    btnHome.addEventListener('click', showFirstPage);

    // Modal Controls
    btnUpload.addEventListener('click', () => toggleModal(true));
    btnClose.addEventListener('click', () => toggleModal(false));
    btnCancel.addEventListener('click', () => toggleModal(false));
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Upload submit
    uploadSubmit.addEventListener('click', () => {
        const files = fileInput.files;
        if (files.length > 0) {
            handleFileUpload(files);
        } else {
            showError('Please select files to upload');
        }
    });

    // Theme Toggle
    btnTheme.addEventListener('click', toggleTheme);

    // Search and Filters
    searchInput.addEventListener('input', handleSearch);
    typeSelect.addEventListener('change', applyFilters);
    if (scoreSelect) { // Only add listener if the element exists
        scoreSelect.addEventListener('change', applyFilters);
    }
    
    // Category Selection
    categories.forEach(item => {
        item.addEventListener('click', () => {
            categories.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            applyFilters();
        });
    });
    
    // View Toggle
    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            viewButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            toggleView(button.dataset.view);
        });
    });

    // Test backend connection on startup
    try {
        await FileVibeAPI.request('/health');
        updateConnectionStatus(true);
    } catch (error) {
        updateConnectionStatus(false);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);