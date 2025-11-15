// API Configuration
const API_BASE_URL = 'http://localhost:8000'; // Update with your backend URL
const API_ENDPOINTS = {
    UPLOAD: '/upload',
    FILES: '/files',
    SEARCH: '/search',
    CATEGORIES: '/categories'
};

// Global state
let currentFiles = [];
let currentFilters = {
    type: 'all',
    score: 'all',
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
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    static async uploadFile(formData) {
        return this.request(API_ENDPOINTS.UPLOAD, {
            method: 'POST',
            body: formData
        });
    }

    static async getFiles(filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value && value !== 'all') params.append(key, value);
        });
        
        return this.request(`${API_ENDPOINTS.FILES}?${params}`);
    }

    static async searchFiles(query) {
        return this.request(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`);
    }

    static async getCategories() {
        return this.request(API_ENDPOINTS.CATEGORIES);
    }
}

// Backend Integration Functions
async function loadFiles() {
    try {
        showLoadingState(true);
        const response = await FileVibeAPI.getFiles(currentFilters);
        currentFiles = response.data || response; // Adjust based on your backend response structure
        renderFiles(currentFiles);
        // Ensure updateCategoryCounts handles the new names
        updateCategoryCounts(response.categories || []);
        updateConnectionStatus(true);
    } catch (error) {
        console.error('Failed to load files:', error);
        showError('Failed to load files. Please try again.');
        updateConnectionStatus(false);
    } finally {
        showLoadingState(false);
    }
}

async function handleFileUpload(files) {
    const formData = new FormData();
    
    Array.from(files).forEach(file => {
        formData.append('file', file);
        // Add metadata if needed
        formData.append('metadata', JSON.stringify({
            filename: file.name,
            type: file.type,
            size: file.size
        }));
    });

    try {
        showLoadingState(true, 'Uploading files...');
        const response = await FileVibeAPI.uploadFile(formData);
        
        if (response.success) {
            showSuccess('Files uploaded successfully!');
            await loadFiles(); // Refresh the file list
            toggleModal(false);
        } else {
            throw new Error(response.message || 'Upload failed');
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
        await loadFiles();
        return;
    }

    try {
        showLoadingState(true, 'Searching...');
        const response = await FileVibeAPI.searchFiles(query);
        currentFiles = response.data || response;
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
    // You can implement a toast notification system here
    console.error('Error:', message);
    alert(`Error: ${message}`); // Temporary - replace with proper notifications
}

function showSuccess(message) {
    console.log('Success:', message);
    // Implement success notification
}

function updateConnectionStatus(connected) {
    statusDot.style.background = connected ? '#4CAF50' : '#FF6584';
    statusText.textContent = connected ? 'Connected to backend' : 'Backend connection failed';
}

function updateCategoryCounts(categoryData) {
    categories.forEach(catElement => {
        const category = catElement.dataset.category;
        const countElement = catElement.querySelector('.cat-count');
        
        if (category === 'all') {
            countElement.textContent = currentFiles.length;
        } else {
            // Count based on the local file array until the backend returns dynamic counts
            const count = categoryData.find(c => c.name === category)?.count || 
                         currentFiles.filter(f => f.category === category).length;
            countElement.textContent = count;
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

    const activeView = document.querySelector('.btn-view.active').dataset.view;
    toggleView(activeView, false);
}

function createFileCard(file) {
    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';
    
    const icon = getFileIcon(file.type, file.mimeType);
    const previewContent = getFilePreviewContent(file);
    
    fileCard.innerHTML = `
        <div class="file-preview">
            ${previewContent}
        </div>
        <div class="file-info">
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-details">
                <span class="file-type">${(file.type || getFileTypeFromMime(file.mimeType)).toUpperCase()}</span>
                <div class="file-score">
                    <span>${file.consistency_score || file.score || 0}%</span>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${file.consistency_score || file.score || 0}%"></div>
                    </div>
                </div>
            </div>
            ${file.category ? `<div class="file-category">${file.category}</div>` : ''}
            ${file.timestamp ? `<div class="file-timestamp">${formatTimestamp(file.timestamp)}</div>` : ''}
        </div>
    `;
    
    // Add click handler for file actions
    fileCard.addEventListener('click', () => handleFileClick(file));
    
    return fileCard;
}

function getFileIcon(fileType, mimeType) {
    const type = fileType || getFileTypeFromMime(mimeType);
    
    const iconMap = {
        'image': 'file-image',
        'video': 'file-video',
        'json': 'file-code',
        'text': 'file-alt',
        'document': 'file-word',
        'pdf': 'file-pdf',
        'spreadsheet': 'file-excel',
        'presentation': 'file-powerpoint'
    };
    
    return iconMap[type] || 'file';
}

function getFileTypeFromMime(mimeType) {
    if (!mimeType) return 'file';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/json') return 'json';
    if (mimeType.startsWith('text/')) return 'text';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word')) return 'document';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'spreadsheet';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'presentation';
    
    return 'file';
}

function getFilePreviewContent(file) {
    if (file.type === 'image' && file.cloudinary_url) {
        return `<img src="${file.cloudinary_url}" alt="${file.name}" class="file-img" loading="lazy">`;
    } else if (file.type === 'video' && file.thumbnail_url) {
        return `<img src="${file.thumbnail_url}" alt="${file.name}" class="file-img" loading="lazy">`;
    } else {
        const icon = getFileIcon(file.type, file.mimeType);
        return `<i class="fas fa-${icon}"></i>`;
    }
}

function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleDateString();
}

function handleFileClick(file) {
    // Implement file preview/download logic
    console.log('File clicked:', file);
    // You can open a modal with file details or trigger download
}

// Filter and Search Functions
async function applyFilters() {
    currentFilters = {
        type: typeSelect.value,
        score: scoreSelect.value,
        // Category selection is now based on the new names (Images, Videos, SQL, NoSQL)
        category: document.querySelector('.item-cat.active').dataset.category
    };
    
    await loadFiles();
}

async function handleSearch(e) {
    const query = e.target.value.trim();
    
    if (query.length === 0) {
        await loadFiles();
        return;
    }
    
    if (query.length < 2) return; // Minimum search length
    
    // Debounce search
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(async () => {
        await handleSemanticSearch(query);
    }, 300);
}

// Existing UI Functions (keep these)
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

function toggleView(view, reRender = true) {
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
        });
    }
}

// Enhanced File Upload Handling
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        // Files are now handled by the upload submit button
        console.log(`Selected ${files.length} file(s) for upload`);
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
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.style.borderColor = 'var(--primary)';
        dropArea.style.backgroundColor = 'rgba(108, 99, 255, 0.1)';
    }

    function unhighlight() {
        dropArea.style.borderColor = '';
        dropArea.style.backgroundColor = '';
    }

    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        dt = e.dataTransfer;
        files = dt.files;
        fileInput.files = files;
        
        // Trigger change event for consistency
        event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
    }
}

// Initialize App
async function initApp() {
    // Setup drag and drop
    setupDragAndDrop();
    
    // Initial file load
    await loadFiles();
    
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
        files = fileInput.files;
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
    scoreSelect.addEventListener('change', applyFilters);
    
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
    updateConnectionStatus(true); // Optimistic - will update after first API call
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);