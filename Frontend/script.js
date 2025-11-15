// ===================================
//  CONFIGURATION
// ===================================
const API_BASE_URL = 'http://127.0.0.1:8000';
const API_ENDPOINTS = {
    HEALTH: '/health',
    GET_FILES: '/files',
    UPLOAD_MEDIA: '/upload/', // From upload_router.py
    UPLOAD_JSON: '/json/bulk-upload', // From json_routes.py
    SEARCH: '/search', // Stub endpoint
    CATEGORIES: '/categories' // Stub endpoint
};

// ===================================
//  DOM ELEMENTS
// ===================================
const page1 = document.getElementById('page1');
const page2 = document.getElementById('page2');
const btnStart = document.getElementById('btn-start');
const btnHome = document.getElementById('btn-home');
const btnTheme = document.getElementById('btn-theme');
const btnUpload = document.getElementById('btn-upload');
const modalUpload = document.getElementById('modal-upload');
const btnClose = document.getElementById('btn-close');
const btnCancel = document.getElementById('btn-cancel');
const btnSubmit = document.getElementById('btn-submit');
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('input-file');
const filesGrid = document.getElementById('grid-files');
const searchInput = document.getElementById('search-input');
const typeSelect = document.getElementById('select-type');
const categoryList = document.getElementById('list-cat');
const sectionTitle = document.getElementById('section-title');
const viewButtons = document.getElementById('view-btns');
const statusContainer = document.getElementById('status-container');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// ===================================
//  GLOBAL STATE
// ===================================
let currentFilters = {
    type: 'all',
    category: 'all'
};
let currentView = 'grid'; // 'grid' or 'list'

// ===================================
//  API SERVICE LAYER
// ===================================

/**
 * Checks if the backend is online.
 */
async function checkBackendHealth() {
    try {
        await fetch(`${API_BASE_URL}${API_ENDPOINTS.HEALTH}`);
        updateConnectionStatus(true);
    } catch (error) {
        updateConnectionStatus(false);
        console.error('Backend health check failed:', error);
    }
}

/**
 * Fetches all files from the backend based on current filters.
 */
async function fetchFiles() {
    showLoadingState(true, 'Loading files...');
    try {
        const params = new URLSearchParams();
        if (currentFilters.type !== 'all') {
            params.append('type', currentFilters.type);
        }
        if (currentFilters.category !== 'all') {
            params.append('category', currentFilters.category);
        }

        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_FILES}?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const files = await response.json();
        
        renderFiles(files);
        updateCategoryCounts(files);
        updateConnectionStatus(true);

    } catch (error) {
        showError('Failed to load files. Is the backend running?');
        updateConnectionStatus(false);
        console.error('fetchFiles error:', error);
    } finally {
        showLoadingState(false);
    }
}

/**
 * Fetches search results from the backend.
 * @param {string} query - The search query.
 */
async function fetchSearch(query) {
    if (query.length < 2) {
        fetchFiles(); // Reload all if query is cleared
        return;
    }
    
    showLoadingState(true, `Searching for "${query}"...`);
    try {
        const params = new URLSearchParams({ q: query });
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SEARCH}?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const files = await response.json();
        
        renderFiles(files);
        updateCategoryCounts(files); // Update counts for the search results
        
    } catch (error) {
        showError('Search failed.');
        console.error('fetchSearch error:', error);
    } finally {
        showLoadingState(false);
    }
}

/**
 * "Smart" uploader. Sorts files and sends them to the correct endpoints.
 */
async function uploadFiles() {
    const files = fileInput.files;
    if (files.length === 0) {
        showError("Please select files to upload.");
        return;
    }

    const mediaFormData = new FormData();
    const jsonFormData = new FormData();
    let mediaFileCount = 0;
    let jsonFileCount = 0;

    // 1. Sort files into media and JSON
    Array.from(files).forEach(file => {
        if (file.name.endsWith('.json') || file.type === 'application/json') {
            jsonFormData.append('files', file); // 'files' for bulk endpoint
            jsonFileCount++;
        } else {
            mediaFormData.append(file.name, file); // Use unique keys for media
            mediaFileCount++;
        }
    });

    showLoadingState(true, `Uploading ${files.length} file(s)...`);
    toggleModal(false);

    const uploadPromises = [];

    // 2. Create upload promise for JSON (if any)
    if (jsonFileCount > 0) {
        uploadPromises.push(
            fetch(`${API_BASE_URL}${API_ENDPOINTS.UPLOAD_JSON}`, {
                method: 'POST',
                body: jsonFormData
            }).then(response => {
                if (!response.ok) throw new Error(`JSON upload failed`);
                return response.json();
            })
        );
    }

    // 3. Create upload promises for Media (one by one)
    if (mediaFileCount > 0) {
        // We must upload media one by one as our endpoint expects a single file
        for (const [key, file] of mediaFormData.entries()) {
            const singleMediaForm = new FormData();
            singleMediaForm.append('file', file, key); // 'file' is the key backend expects

            uploadPromises.push(
                fetch(`${API_BASE_URL}${API_ENDPOINTS.UPLOAD_MEDIA}`, {
                    method: 'POST',
                    body: singleMediaForm
                }).then(response => {
                    if (!response.ok) throw new Error(`Upload failed for ${file.name}`);
                    return response.json();
                })
            );
        }
    }
    
    // 4. Run all uploads concurrently and report results
    try {
        const results = await Promise.allSettled(uploadPromises);
        
        let failedUploads = 0;
        results.forEach(result => {
            if (result.status === 'rejected') {
                failedUploads++;
                console.error("Upload failed:", result.reason);
            }
        });

        if (failedUploads > 0) {
            showError(`${failedUploads} (out of ${files.length}) files failed to upload.`);
        } else {
            showSuccess(`All ${files.length} files uploaded successfully!`);
        }

    } catch (error) {
        showError('An unexpected error occurred during upload.');
        console.error("Upload error:", error);
    } finally {
        fileInput.value = ''; // Clear the file input
        await fetchFiles(); // Refresh the file grid
    }
}


// ===================================
//  UI RENDERING
// ===================================

/**
 * Renders all files into the main grid.
 * @param {Array} files - An array of file objects from the backend.
 */
function renderFiles(files) {
    filesGrid.innerHTML = ''; // Clear existing files

    if (files.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-folder-open"></i>
                <h3>No files found</h3>
                <p>Try adjusting your filters or upload new files.</p>
            </div>
        `;
        return;
    }

    files.forEach(file => {
        filesGrid.appendChild(createFileCard(file));
    });

    toggleView(currentView); // Re-apply current view
}

/**
 * Creates a single file card element.
 * @param {object} file - A file object.
 * @returns {HTMLElement} A div element representing the file card.
 */
function createFileCard(file) {
    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';

    // The backend /files endpoint returns a unified object
    const fileName = file.name || file.filename;
    const fileType = file.type; // 'image', 'video', 'json'
    const category = file.category; // 'Images', 'Videos', 'SQL', 'NoSQL'
    const score = file.score || (file.metadata ? 100 : 80); // Use score or fake one
    
    // Use Cloudinary URL first, fall back to local URL
    const url = file.cloudinary_url || file.local_url;
    
    let previewContent = '';
    if (fileType === 'image' && url) {
        previewContent = `<img src="${url}" alt="${fileName}" class="file-img" loading="lazy">`;
    } else if (fileType === 'video') {
        previewContent = `<i class="fas fa-file-video"></i>`; // Icon for video
    } else if (fileType === 'json') {
        previewContent = `<i class="fas fa-file-code"></i>`; // Icon for JSON
    } else {
        previewContent = `<i class="fas fa-file"></i>`; // Default icon
    }
    
    fileCard.innerHTML = `
        <div class="file-preview">
            ${previewContent}
        </div>
        <div class="file-info">
            <div class="file-name" title="${fileName}">${fileName}</div>
            <div class="file-details">
                <span class="file-type">${fileType.toUpperCase()}</span>
                <div class="file-score">
                    <span>${score}%</span>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${score}%"></div>
                    </div>
                </div>
            </div>
            <div class="file-category">${category}</div>
            <div class="file-timestamp">${formatTimestamp(file.timestamp)}</div>
        </div>
    `;

    // Add click handler to open the file URL
    fileCard.addEventListener('click', () => {
        if (!url) {
            showError("No preview URL available for this file.");
            return;
        }
        
        // Local URLs need the base API path prepended
        if (file.local_url && !file.local_url.startsWith('http')) {
            window.open(`${API_BASE_URL}${file.local_url}`, '_blank');
        } else {
            window.open(url, '_blank');
        }
    });

    return fileCard;
}

/**
 * Updates the category counts in the sidebar dynamically.
 * @param {Array} files - The current list of files.
 */
function updateCategoryCounts(files) {
    const counts = {
        all: files.length,
        Images: files.filter(f => f.category === 'Images').length,
        Videos: files.filter(f => f.category === 'Videos').length,
        SQL: files.filter(f => f.category === 'SQL').length,
        NoSQL: files.filter(f => f.category === 'NoSQL').length,
    };

    categoryList.querySelectorAll('.item-cat').forEach(item => {
        const category = item.dataset.category;
        const countEl = item.querySelector('.cat-count');
        if (countEl) {
            countEl.textContent = counts[category] !== undefined ? counts[category] : 0;
        }
    });
}

// ===================================
//  UI HELPERS
// ===================================

/**
 * Debounce function to limit how often a function can run.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The delay in milliseconds.
 */
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Shows or hides the main loading spinner.
 * @param {boolean} isLoading - Whether to show the loader.
 * @param {string} [message='Loading...'] - The message to display.
 */
function showLoadingState(isLoading, message = 'Loading...') {
    if (isLoading) {
        filesGrid.innerHTML = `
            <div class="loading-state" style="grid-column: 1 / -1;">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    } else {
        // Clearing is handled by renderFiles
    }
}

function showError(message) {
    alert(`Error: ${message}`); // Simple alert, replace with a toast library
}

function showSuccess(message) {
    alert(message); // Simple alert
}

function updateConnectionStatus(isOnline) {
    statusContainer.className = isOnline ? 'status connected' : 'status disconnected';
    statusText.textContent = isOnline ? 'Connected to backend' : 'Connection Failed';
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '...';
    return new Date(timestamp).toLocaleDateString();
}

function toggleModal(show) {
    modalUpload.classList.toggle('active', show);
    if (!show) {
        fileInput.value = ''; // Reset file input on close
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const icon = btnTheme.querySelector('i');
    const isLight = document.body.classList.contains('light-mode');
    icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
}

/**
 * Toggles between grid and list view.
 * @param {string} view - 'grid' or 'list'.
 */
function toggleView(view) {
    currentView = view;
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
    // Update active button
    viewButtons.querySelectorAll('.btn-view').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
}

function showMainApp() {
    page1.classList.add('hidden');
    setTimeout(() => {
        page2.classList.add('active');
        fetchFiles(); // Load files when entering the app
    }, 800);
}

function showLandingPage() {
    page2.classList.remove('active');
    setTimeout(() => {
        page1.classList.remove('hidden');
    }, 500);
}

// ===================================
//  EVENT LISTENER SETUP
// ===================================

function initApp() {
    // Page navigation
    btnStart.addEventListener('click', showMainApp);
    btnHome.addEventListener('click', showLandingPage);

    // Theme
    btnTheme.addEventListener('click', toggleTheme);

    // Modal
    btnUpload.addEventListener('click', () => toggleModal(true));
    btnClose.addEventListener('click', () => toggleModal(false));
    btnCancel.addEventListener('click', () => toggleModal(false));

    // Upload
    dropArea.addEventListener('click', () => fileInput.click());
    btnSubmit.addEventListener('click', uploadFiles);

    // Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('drag-over'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('drag-over'), false);
    });
    dropArea.addEventListener('drop', e => {
        fileInput.files = e.dataTransfer.files;
        showSuccess(`${e.dataTransfer.files.length} file(s) ready to upload.`);
    }, false);

    // Filters
    typeSelect.addEventListener('change', () => {
        currentFilters.type = typeSelect.value;
        fetchFiles();
    });

    // Category List
    categoryList.addEventListener('click', e => {
        const item = e.target.closest('.item-cat');
        if (item) {
            categoryList.querySelector('.item-cat.active').classList.remove('active');
            item.classList.add('active');
            currentFilters.category = item.dataset.category;
            sectionTitle.textContent = `${item.querySelector('span').textContent} Files`;
            fetchFiles();
        }
    });

    // View Toggle
    viewButtons.addEventListener('click', e => {
        const btn = e.target.closest('.btn-view');
        if (btn) {
            toggleView(btn.dataset.view);
        }
    });

    // Search
    searchInput.addEventListener('input', debounce(e => {
        const query = e.target.value.trim();
        if (query) {
            fetchSearch(query);
        } else {
            fetchFiles();
        }
    }, 300));
    
    // Initial Load
    checkBackendHealth();
}

// Start the application
document.addEventListener('DOMContentLoaded', initApp);