// ===================================
//  CONFIGURATION
// ===================================
const API_BASE_URL = 'http://127.0.0.1:8000';
const API_ENDPOINTS = {
    HEALTH: '/health',
    GET_FILES: '/files',
    UPLOAD: '/upload', // Changed from /upload/ to /upload
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

// ===================================
//  GLOBAL STATE
// ===================================
let currentFilters = {
    type: 'all',        // 'image', 'video', 'json', 'all'
    category: 'all',    // 'Images', 'Videos', 'JSON', 'SQL', 'NoSQL', 'all'
    extension: 'all'    // 'jpg', 'png', 'mp4', 'json', 'all'
};
let currentView = 'grid'; // 'grid' or 'list'
let allFilesCache = []; // To store all files for client-side filtering

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

async function uploadFiles() {
    const files = fileInput.files;
    if (files.length === 0) {
        showError("Please select files to upload.");
        return;
    }

    showLoadingState(true, `Uploading ${files.length} file(s)...`);
    toggleModal(false);

    let successCount = 0;
    let failedCount = 0;
    let lastSuccessfulUpload = null;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.UPLOAD}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || `Server error for ${file.name}`);
            }

            const result = await response.json();
            console.log('Upload response:', result); // Debug log

            let fileInfo = null;
            let mainCategory = null;
            let subCategory = null;
            let fileExt = null;

            // Handle different response types
            if (result.saved_file) {
                // Media file (image/video)
                fileInfo = result.saved_file;
                mainCategory = fileInfo.category; // 'Images' or 'Videos'
                fileExt = fileInfo.extension;
                subCategory = null;
            } else if (result.details) {
                // JSON file
                fileInfo = {
                    filename: result.details.original_name || result.details.stored_name,
                    category: result.details.storage_type, // 'SQL' or 'NOSQL'
                    extension: 'json',
                    json_type: result.details.storage_type
                };
                mainCategory = 'JSON';
                subCategory = result.details.storage_type; // 'SQL' or 'NOSQL'
                fileExt = 'json';
            } else if (result.saved_files) {
                // ZIP file
                successCount += result.saved_files.length;
                showSuccess(`ZIP processed: ${result.saved_files.length} files uploaded`);
                continue;
            }

            if (fileInfo) {
                successCount++;
                lastSuccessfulUpload = {
                    mainCategory: mainCategory,
                    subCategory: subCategory,
                    extension: fileExt
                };
            }

        } catch (error) {
            failedCount++;
            console.error("Upload failed for file:", file.name, error);
            showError(`Upload failed for ${file.name}: ${error.message}`);
        }
    }

    // Show final result
    if (successCount > 0 && failedCount === 0) {
        showSuccess(`All ${files.length} file(s) uploaded successfully!`);
    } else if (successCount > 0 && failedCount > 0) {
        showSuccess(`${successCount} file(s) uploaded, ${failedCount} failed.`);
    } else if (failedCount > 0) {
        showError(`All ${failedCount} upload(s) failed.`);
    }

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

    showLoadingState(false);
}

// ===================================
//  UI RENDERING
// ===================================

function filterAndRenderFiles() {
    let filteredFiles = allFilesCache;
    let title = "All Files";

    const type = typeSelect.value; // 'image', 'video', 'json', 'all'
    const cat = currentFilters.category; // 'Images', 'Videos', 'SQL', 'all'
    const ext = currentFilters.extension; // 'jpg', 'png', 'all'

    // 1. Filter by Type Dropdown (e.g., 'image')
    if (type !== 'all') {
        filteredFiles = filteredFiles.filter(f => f.type === type);
    }

    // 2. Filter by Category Sidebar (e.g., 'Images', 'SQL')
    if (cat !== 'all') {
        if (cat === 'Images' || cat === 'Videos' || cat === 'JSON') {
            if (cat === 'JSON') {
                filteredFiles = filteredFiles.filter(f => f.type === 'json');
            } else {
                filteredFiles = filteredFiles.filter(f => f.category === cat);
            }
        } else if (cat === 'SQL' || cat === 'NoSQL') {
            filteredFiles = filteredFiles.filter(f => f.category === cat);
        }
    }

    // 3. Filter by Extension Sidebar (e.g., 'jpg', 'json')
    if (ext !== 'all') {
        if (cat === 'SQL' || cat === 'NoSQL') {
            filteredFiles = filteredFiles.filter(f => f.category === cat && f.extension === 'json');
        } else {
            filteredFiles = filteredFiles.filter(f => f.extension === ext);
        }
    }

    // --- Set Title ---
    if (ext !== 'all') {
        if (cat === 'SQL' || cat === 'NoSQL') {
            title = `${cat} Files`;
        } else {
            title = `${cat} / ${ext.toUpperCase()}`;
        }
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
    // 1. Initialize all known counts to 0
    const counts = {
        all: files.length,
        Images: 0, Videos: 0, JSON: 0, SQL: 0, NoSQL: 0
    };
    const extensions = [
        "jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp", "tiff", "tif", "heic", "heif", "ico", "raw", "cr2", "nef", "orf", "sr2",
        "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "mpeg", "mpg", "3gp", "m4v", "vob"
    ];
    extensions.forEach(ext => counts[ext] = 0);

    // 2. Tally counts from all files
    for (const file of files) {
        const mainCat = file.category; // 'Images', 'SQL', 'NoSQL'
        const ext = file.extension; // 'jpg', 'json'
        const type = file.type; // 'image', 'video', 'json'

        if (type === 'image' || type === 'video') {
            if (counts.hasOwnProperty(mainCat)) counts[mainCat]++;
            if (counts.hasOwnProperty(ext)) counts[ext]++;
        } else if (type === 'json') {
            counts.JSON++;
            if (counts.hasOwnProperty(mainCat)) counts[mainCat]++;
        }
    }

    // 3. Update main category HTML
    document.querySelector('.cat-count[data-category="all"]').textContent = counts.all;
    document.querySelector('.cat-count[data-category="Images"]').textContent = counts.Images;
    document.querySelector('.cat-count[data-category="Videos"]').textContent = counts.Videos;
    document.querySelector('.cat-count[data-category="JSON"]').textContent = counts.JSON;

    // 4. Update all sub-category HTML
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
    const url = file.cloudinary_url || file.online_url || file.local_url;

    let previewContent = '';
    if (file.type === 'image' && url) {
        previewContent = `<img src="${url.startsWith('http') ? url : API_BASE_URL + url}" alt="${fileName}" class="file-img" loading="lazy">`;
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
        </div>
    `;

    fileCard.addEventListener('click', () => {
        if (!url) { showError("No preview URL available."); return; }
        window.open(url.startsWith('http') ? url : `${API_BASE_URL}${url}`, '_blank');
    });

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
    if (!show) fileInput.value = '';
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
//  EVENT LISTENER SETUP
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
    btnSubmit.addEventListener('click', async () => {
        console.log('🔵 Upload button clicked!');

        try {
            console.log('Step 1: Getting files...');
            const fileList = fileInput.files;
            console.log('📁 Files selected:', fileList.length);

            if (fileList.length === 0) {
                console.log('❌ No files selected');
                alert("Please select files to upload.");
                return;
            }

            // IMPORTANT: Convert FileList to Array BEFORE closing modal
            const files = Array.from(fileList);
            console.log('📁 Files array created:', files.length);

            console.log('Step 2: Closing modal...');
            toggleModal(false);

            console.log('Step 3: Showing loading state...');
            showLoadingState(true, `Uploading ${files.length} file(s)...`);

            let successCount = 0;
            let failedCount = 0;

            console.log('Step 4: Starting file loop...');
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                console.log(`📤 Uploading file ${i + 1}/${files.length}: ${file.name}`);

                const formData = new FormData();
                formData.append('file', file);

                try {
                    console.log('🌐 Sending request to:', `${API_BASE_URL}/upload`);

                    const response = await fetch(`${API_BASE_URL}/upload`, {
                        method: 'POST',
                        body: formData
                    });

                    console.log('📥 Response status:', response.status);

                    const result = await response.json();
                    console.log('📥 Response data:', result);

                    if (response.status === 201) {
                        successCount++;
                        console.log(`✅ ${file.name} uploaded successfully!`);
                    } else {
                        failedCount++;
                        console.error(`❌ ${file.name} upload failed:`, result);
                    }

                } catch (error) {
                    failedCount++;
                    console.error(`❌ Upload error for ${file.name}:`, error);
                }
            }

            console.log('Results - Success:', successCount, 'Failed:', failedCount);

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
            showLoadingState(false);

        } catch (outerError) {
            console.error('❌ OUTER ERROR:', outerError);
            showError('Upload failed: ' + outerError.message);
            showLoadingState(false);
        }
    });
    // Drag and Drop
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
        showSuccess(`${e.dataTransfer.files.length} file(s) ready to upload.`);
    }, false);

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