// ===================================
//  CONFIGURATION
// ===================================
const API_BASE_URL = 'http://127.0.0.1:8000';
const API_ENDPOINTS = {
    HEALTH: '/health',
    GET_FILES: '/files',
    UPLOAD: '/upload', // Using /upload as per your latest file
    SEARCH: '/search',
    CATEGORIES: '/categories'
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

// --- Text Editor Elements (Used for context, full logic omitted) ---
// These are included only to maintain the full DOM list from previous steps
const btnCreateFile = document.getElementById('btn-create-file');
const modalEditor = document.getElementById('modal-editor');
const btnCloseEditor = document.getElementById('btn-close-editor');
const btnCancelEditor = document.getElementById('btn-cancel-editor');
const btnSaveFile = document.getElementById('btn-save-file');
const selectFileType = document.getElementById('select-file-type');
const inputFilename = document.getElementById('input-filename');
const codeTextarea = document.getElementById('code-textarea');
const editorStatus = document.getElementById('editor-status');


// --- Progress Bar Elements (NEW) ---
const progressContainer = document.getElementById('progress-container');
const progressText = document.getElementById('progress-text');
const progressFill = document.querySelector('.progress-fill'); 

// ===================================
//  GLOBAL STATE
// ===================================
let currentFilters = {
    type: 'all',        
    category: 'all',    
    extension: 'all'    
};
let currentView = 'grid'; 
let allFilesCache = []; 

// ===================================
//  API SERVICE LAYER
// ===================================

async function checkBackendHealth() {
    try {
        await fetch(`${API_BASE_URL}${API_ENDPOINTS.HEALTH}`);
        updateConnectionStatus(true);
    } catch (error) {
        updateConnectionStatus(false);
        console.error('Backend health check failed:', error);
    }
}

async function fetchFiles() {
    showLoadingState(true, 'Loading files...');
    try {
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_FILES}?category=all`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allFilesCache = await response.json();

        updateCategoryCounts(allFilesCache);
        filterAndRenderFiles();
        updateConnectionStatus(true);

    } catch (error) {
        showError('Failed to load files. Is the backend running?');
        updateConnectionStatus(false);
        console.error('fetchFiles error:', error);
        allFilesCache = [];
        updateCategoryCounts([]);
        renderFiles([]);
    } finally {
        showLoadingState(false);
    }
}

async function fetchSearch(query) {
    if (query.length < 2) {
        filterAndRenderFiles();
        return;
    }

    showLoadingState(true, `Searching for "${query}"...`);
    const searchResults = allFilesCache.filter(file =>
        (file.name || file.filename || '').toLowerCase().includes(query.toLowerCase())
    );
    renderFiles(searchResults);
    updateCategoryCounts(searchResults);
    showLoadingState(false);
}
// --- NEW DOWNLOAD FUNCTION ---
async function downloadFile(url, filename) {
    // Note: The URL must be accessible directly from the browser (i.e., not a POST endpoint).
    // This logic handles downloading blob data securely.
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status}`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
        showSuccess(`Downloaded: ${filename}`);
        
    } catch (error) {
        showError(`Download failed: ${error.message}`);
        console.error("Download Error:", error);
    }
}

// ===================================
//  UI RENDERING
// ===================================

function updateProgressBar(percentage, message) {
    const width = Math.min(100, Math.max(0, percentage));
    
    // Safety check, ensure elements exist
    if (progressFill) {
        progressFill.style.width = `${width}%`;
        progressText.textContent = message || `${width.toFixed(0)}%`;
    }

    if (width === 0 && !message) {
        progressContainer.classList.remove('active');
    } else {
        progressContainer.classList.add('active');
    }
}

function filterAndRenderFiles() {
    let filteredFiles = allFilesCache;
    let title = "All Files";

    const type = typeSelect.value;
    const cat = currentFilters.category; 
    const ext = currentFilters.extension;

    // 1. Filter by Type Dropdown
    if (type !== 'all') {
        filteredFiles = filteredFiles.filter(f => f.type === type);
    }

    // 2. Filter by Category Sidebar
    if (cat !== 'all') {
        if (cat === 'JSON') {
            filteredFiles = filteredFiles.filter(f => f.type === 'json');
        } else if (cat === 'SQL' || cat === 'NoSQL') {
            filteredFiles = filteredFiles.filter(f => f.category === cat);
        } else {
            filteredFiles = filteredFiles.filter(f => f.category === cat);
        }
    }

    // 3. Filter by Extension Sidebar
    if (ext !== 'all') {
        if (cat === 'SQL' || cat === 'NoSQL') {
            filteredFiles = filteredFiles.filter(f => f.category === cat && f.extension === 'json');
        } else {
            filteredFiles = filteredFiles.filter(f => f.extension === ext);
        }
    }

    // --- Set Title ---
    if (ext !== 'all') {
        title = (cat === 'SQL' || cat === 'NoSQL') ? `${cat} Files` : `${cat} / ${ext.toUpperCase()}`;
    } else if (cat !== 'all') {
        title = `${cat} Files`;
    } else if (type !== 'all') {
        title = `${type.charAt(0).toUpperCase() + type.slice(1)} Files`;
    } else {
        title = "All Files";
    }

    sectionTitle.textContent = title;
    renderFiles(filteredFiles);
}

function updateCategoryCounts(files) {
    const counts = {
        all: files.length,
        Images: 0, Videos: 0, JSON: 0, SQL: 0, NoSQL: 0
    };
    const extensions = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp", "tiff", "tif", "heic", "heif", "ico", "raw", "cr2", "nef", "orf", "sr2",
        "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "mpeg", "mpg", "3gp", "m4v", "vob"
    ];
    extensions.forEach(ext => counts[ext] = 0);

    for (const file of files) {
        const mainCat = file.category; 
        const ext = file.extension; 
        const type = file.type; 

        if (type === 'image' || type === 'video') {
            if (counts.hasOwnProperty(mainCat)) counts[mainCat]++;
            if (counts.hasOwnProperty(ext)) counts[ext]++;
        } else if (type === 'json') {
            counts.JSON++;
            if (counts.hasOwnProperty(mainCat)) counts[mainCat]++;
        }
    }

    document.querySelector('.cat-count[data-category="all"]').textContent = counts.all;
    document.querySelector('.cat-count[data-category="Images"]').textContent = counts.Images;
    document.querySelector('.cat-count[data-category="Videos"]').textContent = counts.Videos;
    document.querySelector('.cat-count[data-category="JSON"]').textContent = counts.JSON;

    categoryList.querySelectorAll('.item-cat-sub').forEach(item => {
        const ext = item.dataset.extension;
        const mainCat = item.dataset.category;
        const countEl = item.querySelector('.cat-count');

        if (mainCat === 'SQL') {
            countEl.textContent = counts.SQL;
        } else if (mainCat === 'NoSQL') {
            countEl.textContent = counts.NoSQL;
        } else if (counts.hasOwnProperty(ext)) {
            countEl.textContent = counts[ext];
        } else {
            countEl.textContent = 0;
        }
    });
}

function renderFiles(files) {
    filesGrid.innerHTML = '';
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
    toggleView(currentView);
}

function createFileCard(file) {
    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';
    const fileName = file.name || file.filename;
    const score = file.score || (file.metadata ? 100 : 80);
    
    // Use file.local_url for download/view since it's the direct file path on the server
    const previewUrl = file.cloudinary_url || file.online_url || file.local_url;
    const directUrl = previewUrl.startsWith('http') ? previewUrl : `${API_BASE_URL}${previewUrl}`;
    
    let previewContent = '';
    
    if (file.type === 'image' && previewUrl) {
        previewContent = `<img src="${previewUrl.startsWith('http') ? previewUrl : API_BASE_URL + previewUrl}" alt="${fileName}" class="file-img" loading="lazy">`;
    } else if (file.type === 'video') {
        previewContent = `<i class="fas fa-file-video"></i>`;
    } else if (file.type === 'json') {
        previewContent = `<i class="fas fa-file-code"></i>`;
    } else {
        previewContent = `<i class="fas fa-file"></i>`;
    }
    
    fileCard.innerHTML = `
        <div class="file-preview">${previewContent}</div>
        <div class="file-info">
            <div class="file-name" title="${fileName}">${fileName}</div>
            <div class="file-details">
                <span class="file-type">${file.type.toUpperCase()}</span>
                <div class="file-score">
                    <span>${score}%</span>
                    <div class="score-bar"><div class="score-fill" style="width: ${score}%"></div></div>
                </div>
            </div>
            <div class="file-category">${file.category} / ${file.extension.toUpperCase()}</div>
            <div class="file-timestamp">${formatTimestamp(file.timestamp)}</div>
            
            <div class="gallery-item-actions">
                <button 
                    class="action-btn view-btn" 
                    onclick="window.open('${directUrl}', '_blank')"
                >
                    <i class="fas fa-eye"></i> View
                </button>
                <button 
                    class="action-btn download-btn" 
                    onclick="downloadFile('${directUrl}', '${fileName}')"
                >
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        </div>
    `;

    // Remove the original card click listener since we now have dedicated buttons
    // fileCard.addEventListener('click', () => { /* ... */ });

    return fileCard;
}

// ===================================
//  UI HELPERS
// ===================================

function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function showLoadingState(isLoading, message = 'Loading...') {
    if (isLoading) {
        filesGrid.innerHTML = `
            <div class="loading-state" style="grid-column: 1 / -1;">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    } else {
        // Stop global loading when files are finished rendering
    }
}

function showError(message) {
    alert(`❌ ${message}`);
}

function showSuccess(message) {
    alert(`✅ ${message}`);
}

function updateConnectionStatus(isOnline) {
    statusContainer.className = isOnline ? 'status connected' : 'status disconnected';
    statusText.textContent = isOnline ? 'Connected to backend' : 'Connection Failed';
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '...';
    const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp);
    return date.toLocaleDateString();
}

function toggleModal(show) {
    modalUpload.classList.toggle('active', show);
    // Reset state when closing the modal
    if (!show) {
        fileInput.value = '';
        updateProgressBar(0, '0%');
        updateUploadAreaUI([]); // Assuming this exists from a previous step
    }
}

function updateUploadAreaUI(files) {
    // This function must be defined for the script to work correctly
    const uploadText = dropArea.querySelector('.upload-text');
    const uploadIcon = dropArea.querySelector('.upload-icon i');
    const uploadHint = dropArea.querySelector('.upload-hint');

    if (files && files.length > 0) {
        uploadText.textContent = `${files.length} file(s) selected and ready.`;
        uploadHint.textContent = 'Click "Upload Files" below, or change selection.';
        dropArea.classList.add('file-selected');
        uploadIcon.classList.remove('fa-cloud-upload-alt');
        uploadIcon.classList.add('fa-check-circle');
    } else {
        uploadText.textContent = 'Drag & drop files here or click to browse';
        uploadHint.textContent = 'Supports: JSON, JPG, PNG, MP4, etc.';
        dropArea.classList.remove('file-selected');
        uploadIcon.classList.remove('fa-check-circle');
        uploadIcon.classList.add('fa-cloud-upload-alt');
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const icon = btnTheme.querySelector('i');
    icon.className = document.body.classList.contains('light-mode') ? 'fas fa-sun' : 'fas fa-moon';
}

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
    viewButtons.querySelectorAll('.btn-view').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
}

function highlightActiveSidebar() {
    categoryList.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

    let elToActivate;
    if (currentFilters.category === 'all') {
        elToActivate = categoryList.querySelector('.item-cat-main[data-category="all"]');
    } else if (currentFilters.extension !== 'all') {
        if (currentFilters.category === 'SQL' || currentFilters.category === 'NoSQL') {
            elToActivate = categoryList.querySelector(`.item-cat-sub[data-category="${currentFilters.category}"][data-extension="json"]`);
        } else {
            elToActivate = categoryList.querySelector(`.item-cat-sub[data-category="${currentFilters.category}"][data-extension="${currentFilters.extension}"]`);
        }
    } else {
        elToActivate = categoryList.querySelector(`.item-cat-main[data-category="${currentFilters.category}"]`);
    }

    if (elToActivate) {
        elToActivate.classList.add('active');

        const parentGroup = elToActivate.closest('.item-cat-group');
        if (parentGroup) {
            const mainCat = parentGroup.querySelector('.item-cat-main');
            const subList = parentGroup.querySelector('.list-cat-sub');
            if (mainCat && subList && mainCat.dataset.category !== 'all') {
                mainCat.classList.add('open');
                subList.classList.add('open');
            }
        }
    }
}

function navigateToCategory(category, extension) {
    let targetElement;

    if (category === 'SQL' || category === 'NoSQL') {
        targetElement = categoryList.querySelector(`.item-cat-sub[data-category="${category}"][data-extension="json"]`);
    } else {
        targetElement = categoryList.querySelector(`.item-cat-sub[data-category="${category}"][data-extension="${extension}"]`);
    }

    if (!targetElement) {
        targetElement = categoryList.querySelector(`.item-cat-main[data-category="${category}"]`);
    }

    if (targetElement) {
        targetElement.click();
    }
}

function showMainApp() {
    page1.classList.add('hidden');
    setTimeout(() => {
        page2.classList.add('active');
        fetchFiles();
    }, 800);
}

function showLandingPage() {
    page2.classList.remove('active');
    setTimeout(() => {
        page1.classList.remove('hidden');
    }, 500);
}


// ===================================
//  EVENT LISTENER SETUP (FIXED BUTTON)
// ===================================

function initApp() {
    // Page navigation
    btnStart.addEventListener('click', showMainApp);
    btnHome.addEventListener('click', showLandingPage);
    btnTheme.addEventListener('click', toggleTheme);
    btnUpload.addEventListener('click', () => toggleModal(true));
    btnClose.addEventListener('click', () => toggleModal(false));
    btnCancel.addEventListener('click', () => toggleModal(false));
    dropArea.addEventListener('click', () => fileInput.click());

    // --- FIX: Robust Button Listener with Progress Bar UI Updates ---
    btnSubmit.addEventListener('click', async () => {
        console.log('🔵 Upload button clicked!');

        try {
            const fileList = fileInput.files;

            if (fileList.length === 0) {
                showError("Please select files to upload.");
                return;
            }

            // Convert FileList to Array and close modal BEFORE fetch
            const files = Array.from(fileList);
            toggleModal(false);
            
            // --- START PROGRESS & LOADING ---
            showLoadingState(true, `Preparing ${files.length} file(s)...`);
            updateProgressBar(0, 'Starting...');
            // --------------------------------

            let successCount = 0;
            let failedCount = 0;
            let lastSuccessfulUpload = null;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const uploadURL = `${API_BASE_URL}${API_ENDPOINTS.UPLOAD}`;
                
                updateProgressBar(
                    (i / files.length) * 100, 
                    `Uploading ${i + 1} of ${files.length}: ${file.name}`
                );

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch(uploadURL, {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();

                    if (response.status === 201) {
                        successCount++;
                        // Determine category for navigation
                        const fileExt = file.name.split('.').pop().toLowerCase();
                        if (result.details) { // JSON
                            lastSuccessfulUpload = { mainCategory: 'JSON', subCategory: result.details.storage_type, extension: 'json' };
                        } else if (result.saved_file) { // Media
                            lastSuccessfulUpload = { mainCategory: result.saved_file.category, subCategory: null, extension: fileExt };
                        }
                    } else {
                        failedCount++;
                        console.error(`❌ ${file.name} upload failed (Status: ${response.status}):`, result);
                        // Skip showError to avoid multiple popups, use final alert
                    }

                } catch (error) {
                    failedCount++;
                    console.error(`❌ Network error for ${file.name}:`, error);
                }
            }

            // --- END PROGRESS & LOADING ---
            updateProgressBar(100, 'Upload Complete!');
            showLoadingState(false);
            // --------------------------------

            // Show results
            if (successCount > 0 && failedCount === 0) {
                showSuccess(`All ${successCount} file(s) uploaded successfully!`);
            } else if (successCount > 0) {
                showSuccess(`${successCount} uploaded, ${failedCount} failed.`);
            } else {
                showError(`All ${failedCount} upload(s) failed.`);
            }

            // Clear file input and refresh
            fileInput.value = '';
            await fetchFiles();
            
            // Navigate to the last uploaded file's category
            if (lastSuccessfulUpload) {
                if (lastSuccessfulUpload.mainCategory === 'JSON') {
                    navigateToCategory(lastSuccessfulUpload.subCategory, 'json');
                } else {
                    navigateToCategory(lastSuccessfulUpload.mainCategory, lastSuccessfulUpload.extension);
                }
            }

        } catch (outerError) {
            console.error('❌ FATAL UPLOAD ERROR:', outerError);
            showError('Upload failed: ' + outerError.message);
            updateProgressBar(0, 'Error');
            showLoadingState(false);
        }
    });
    // -------------------------------------------------------------
    
    // Drag and Drop (ADD file input change listener)
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('drag-over'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('drag-over'), false);
    });
    dropArea.addEventListener('drop', e => {
        fileInput.files = e.dataTransfer.files;
        updateUploadAreaUI(e.dataTransfer.files); // New UI update
        showSuccess(`${e.dataTransfer.files.length} file(s) ready to upload.`);
    }, false);

    // Manual file selection update
    fileInput.addEventListener('change', (e) => {
        updateUploadAreaUI(e.target.files);
    });
    
    // Sidebar Click Logic
    categoryList.addEventListener('click', e => {
        const mainCatEl = e.target.closest('.item-cat-main');
        const subCatEl = e.target.closest('.item-cat-sub');

        if (mainCatEl) {
            categoryList.querySelectorAll('.item-cat-main.open').forEach(openMain => {
                if (openMain !== mainCatEl) {
                    openMain.classList.remove('open');
                    if (openMain.nextElementSibling) {
                        openMain.nextElementSibling.classList.remove('open');
                    }
                }
            });
        }

        if (subCatEl) {
            currentFilters.category = subCatEl.dataset.category;
            currentFilters.extension = subCatEl.dataset.extension;
        } else if (mainCatEl) {
            currentFilters.category = mainCatEl.dataset.category;
            currentFilters.extension = 'all';

            const subList = mainCatEl.nextElementSibling;
            if (subList && subList.classList.contains('list-cat-sub')) {
                mainCatEl.classList.toggle('open');
                subList.classList.toggle('open');
            }
        }

        highlightActiveSidebar();
        filterAndRenderFiles();
    });

    // Type dropdown
    typeSelect.addEventListener('change', () => {
        currentFilters.category = 'all';
        currentFilters.extension = 'all';
        highlightActiveSidebar();
        filterAndRenderFiles();
    });

    // View Toggle
    viewButtons.addEventListener('click', e => {
        const btn = e.target.closest('.btn-view');
        if (btn) toggleView(btn.dataset.view);
    });

    // Search
    searchInput.addEventListener('input', debounce(e => {
        fetchSearch(e.target.value.trim());
    }, 300));

    // Initial Load
    checkBackendHealth();
}

document.addEventListener('DOMContentLoaded', initApp);