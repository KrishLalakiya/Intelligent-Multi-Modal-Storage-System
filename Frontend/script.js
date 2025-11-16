// ===================================
//  CONFIGURATION
// ===================================
const API_BASE_URL = 'http://localhost:8000';
// const API_BASE_URL = 'http://127.0.0.1:8000'; 
const API_ENDPOINTS = {
    HEALTH: '/health',
    GET_FILES: '/files',
    UPLOAD: '/upload/', // Unified upload endpoint
    SEARCH: '/search',
    CATEGORIES: '/categories' // Not strictly needed, but kept for clarity
};

// ===================================
//  HELPER FUNCTIONS
// ===================================

function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '...';
    // Convert Cloudinary ISO string or Python timestamp (seconds) to Date
    const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp);
    if (isNaN(date)) return 'Invalid Date';
    return date.toLocaleDateString();
}

// ===================================
//  FILEVIBE APPLICATION CLASS
// ===================================

class FileVibeApp {

    constructor() {
        this.dom = {};
        this.state = {
            currentFilters: {
                type: 'all',        // 'image', 'video', 'json', 'all'
                category: 'all',    // 'Images', 'Videos', 'SQL', 'NoSQL', 'all'
                extension: 'all'    // 'jpg', 'json', 'all'
            },
            currentView: 'grid', // 'grid' or 'list'
            allFilesCache: [],
            isUploading: false
        };

        // Initialize the app on DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    // --- 1. INITIALIZATION ---

    init() {
        this.mapDOMElements();
        this.setupEventListeners();
        this.checkBackendHealth();
    }

    mapDOMElements() {
        // Core App Elements
        this.dom.page1 = document.getElementById('page1');
        this.dom.page2 = document.getElementById('page2');
        this.dom.btnStart = document.getElementById('btn-start');
        this.dom.btnHome = document.getElementById('btn-home');
        this.dom.btnTheme = document.getElementById('btn-theme');
        this.dom.btnUpload = document.getElementById('btn-upload');
        this.dom.filesGrid = document.getElementById('grid-files');
        this.dom.searchInput = document.getElementById('search-input');
        this.dom.typeSelect = document.getElementById('select-type');
        this.dom.categoryList = document.getElementById('list-cat');
        this.dom.sectionTitle = document.getElementById('section-title');
        this.dom.viewButtons = document.getElementById('view-btns');
        this.dom.statusContainer = document.getElementById('status-container');
        this.dom.statusDot = document.getElementById('status-dot');
        this.dom.statusText = document.getElementById('status-text');

        // Upload Modal
        this.dom.modalUpload = document.getElementById('modal-upload');
        this.dom.btnClose = document.getElementById('btn-close');
        this.dom.btnCancel = document.getElementById('btn-cancel');
        this.dom.btnSubmit = document.getElementById('btn-submit');
        this.dom.dropArea = document.getElementById('drop-area');
        this.dom.fileInput = document.getElementById('input-file');
        this.dom.btnCreateFile = document.getElementById('btn-create-file');

        // Editor Modal
        this.dom.modalEditor = document.getElementById('modal-editor');
        this.dom.btnCloseEditor = document.getElementById('btn-close-editor');
        this.dom.btnCancelEditor = document.getElementById('btn-cancel-editor');
        this.dom.btnSaveFile = document.getElementById('btn-save-file');
        this.dom.selectFileType = document.getElementById('select-file-type');
        this.dom.inputFilename = document.getElementById('input-filename');
        this.dom.codeTextarea = document.getElementById('code-textarea');
        this.dom.editorStatus = document.getElementById('editor-status');
    }

    setupEventListeners() {
        // Navigation
        this.dom.btnStart.addEventListener('click', () => this.showMainApp());
        this.dom.btnHome.addEventListener('click', () => this.showLandingPage());
        this.dom.btnTheme.addEventListener('click', () => this.toggleTheme());

        // Upload/Modal Controls
        this.dom.btnUpload.addEventListener('click', () => this.toggleModal(true));
        this.dom.btnClose.addEventListener('click', () => this.toggleModal(false));
        this.dom.btnCancel.addEventListener('click', () => this.toggleModal(false));
        this.dom.dropArea.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.btnSubmit.addEventListener('click', () => this.uploadFiles());
        this.setupDragAndDrop();

        // Editor Controls
        this.dom.btnCreateFile.addEventListener('click', () => this.handleCreateFileClick());
        this.dom.btnCloseEditor.addEventListener('click', () => this.toggleEditorModal(false));
        this.dom.btnCancelEditor.addEventListener('click', () => this.toggleEditorModal(false));
        this.dom.btnSaveFile.addEventListener('click', () => this.saveCreatedFile());
        this.dom.selectFileType.addEventListener('change', () => this.updateEditorContent());
        this.dom.inputFilename.addEventListener('input', () => this.updateEditorStatus(`Editing: ${this.dom.inputFilename.value}`));
        this.dom.codeTextarea.addEventListener('input', () => this.updateCodeTextareaStatus());

        // Filtering & Search
        this.dom.categoryList.addEventListener('click', (e) => this.handleCategoryClick(e));
        this.dom.typeSelect.addEventListener('change', () => this.handleTypeChange());
        this.dom.viewButtons.addEventListener('click', (e) => this.handleViewToggle(e));
        this.dom.searchInput.addEventListener('input', debounce((e) => this.fetchSearch(e.target.value.trim()), 300));
    }

    // --- 2. API CALLS ---

    async checkBackendHealth() {
        try {
            await fetch(`${API_BASE_URL}${API_ENDPOINTS.HEALTH}`);
            this.updateConnectionStatus(true);
        } catch (error) {
            this.updateConnectionStatus(false);
            console.error('Backend health check failed:', error);
        }
    }

    async fetchFiles() {
        this.showLoadingState(true, 'Loading files...');
        try {
            const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_FILES}?category=all`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.state.allFilesCache = await response.json();

            this.updateCategoryCounts(this.state.allFilesCache);
            this.filterAndRenderFiles();
            this.updateConnectionStatus(true);

        } catch (error) {
            this.showError('Failed to load files. Is the backend running?');
            this.updateConnectionStatus(false);
            console.error('fetchFiles error:', error);
            this.state.allFilesCache = [];
            this.updateCategoryCounts([]);
            this.renderFiles([]);
        } finally {
            this.showLoadingState(false);
        }
    }

    async fetchSearch(query) {
        if (query.length < 2) {
            this.filterAndRenderFiles();
            return;
        }

        this.showLoadingState(true, `Searching for "${query}"...`);

        // Client-side filtering as per existing logic (stub API not integrated)
        const searchResults = this.state.allFilesCache.filter(file =>
            (file.name || file.filename || '').toLowerCase().includes(query.toLowerCase())
        );

        this.renderFiles(searchResults);
        this.updateCategoryCounts(searchResults);
        this.showLoadingState(false);
    }

    async uploadFiles(fileList = null) {
        const files = fileList || this.dom.fileInput.files;
        if (files.length === 0) {
            this.showError("Please select files to upload.");
            return;
        }

        this.state.isUploading = true;
        this.showLoadingState(true, `Uploading ${files.length} file(s)...`);
        this.toggleModal(false);
        this.toggleEditorModal(false);

        let successCount = 0;
        let failedUploads = 0;
        // let lastSuccessfulUpload = null;

        // for (const file of files) {
        //     const formData = new FormData();
        //     formData.append('files', file);

        //     try {
        let lastSuccessfulUpload = null;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            
            // ✅ IMPROVEMENT: Update loading state for individual file processing
            const fileIndex = successCount + failedUploads + 1;
            this.showLoadingState(true, `Uploading ${file.name} (${fileIndex}/${files.length})...`);

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
                successCount++;

                if (result.saved_file) {
                    // Media file response from upload_router
                    lastSuccessfulUpload = { category: result.saved_file.category, extension: result.saved_file.extension };
                } else if (result.details) {
                    let cat = result.details.storage_type.toLowerCase();
                    if (cat.includes("mongo") || cat.includes("nosql"))
                        cat = "NoSQL";
                    else if (cat.includes("sql"))
                        cat = "SQL";

                    lastSuccessfulUpload = { category: cat, extension: "json" };
                }

            } catch (error) {
                failedUploads++;
                console.error("Upload failed for file:", file.name, error);
                this.showError(`Upload failed for ${file.name}: ${error.message || 'Unknown error'}`);
            }
        }

        this.state.isUploading = false;

        if (successCount > 0 && failedUploads === 0) {
            this.showSuccess(`All ${files.length} files uploaded successfully!`);
        } else if (successCount > 0 && failedUploads > 0) {
            this.showSuccess(`${successCount} files uploaded, ${failedUploads} failed.`);
        }

        this.dom.fileInput.value = '';
        await this.fetchFiles();

        if (lastSuccessfulUpload) {
            this.navigateToCategory(lastSuccessfulUpload.category, lastSuccessfulUpload.extension);
        }
    }


    // --- 3. EDITOR FUNCTIONS ---

    handleCreateFileClick() {
        this.toggleModal(false); // Close upload modal
        setTimeout(() => this.toggleEditorModal(true), 300); // Open editor with delay
    }

    toggleEditorModal(show) {
        this.dom.modalEditor.classList.toggle('active', show);
        if (show) {
            this.updateEditorContent();
            this.dom.codeTextarea.focus();
        } else {
            this.dom.codeTextarea.value = '';
        }
    }

    updateEditorContent() {
        const fileType = this.dom.selectFileType.value;
        const filename = this.dom.inputFilename.value;
        const extension = filename.includes('.') ? filename.split('.').pop() : fileType;

        // Auto-update extension in filename if needed
        if (extension !== fileType) {
            const baseName = filename.split('.')[0] || 'new_file';
            this.dom.inputFilename.value = `${baseName}.${fileType}`;
        }

        let defaultContent = '';
        switch (fileType) {
            case 'json':
                defaultContent = '{\n  "name": "value",\n  "array": [1, 2, 3]\n}';
                break;
            case 'js':
                defaultContent = '// JavaScript code here\nconsole.log("Hello World!");';
                break;
            case 'html':
                defaultContent = '<h1>Hello FileVibe!</h1>';
                break;
            case 'css':
                defaultContent = 'body { margin: 0; }';
                break;
            case 'py':
                defaultContent = '# Python code here\nprint("Hello World!")';
                break;
            default:
                defaultContent = 'Start typing your content here...';
        }

        if (!this.dom.codeTextarea.value.trim()) {
            this.dom.codeTextarea.value = defaultContent;
        }

        this.updateEditorStatus(`Editing: ${this.dom.inputFilename.value}`);
        this.updateCodeTextareaStatus();
    }

    updateCodeTextareaStatus() {
        const content = this.dom.codeTextarea.value;
        const lines = content.split('\n').length;
        const chars = content.length;
        this.updateEditorStatus(`Editing: ${this.dom.inputFilename.value} | Lines: ${lines} | Chars: ${chars}`);
    }

    updateEditorStatus(message) {
        this.dom.editorStatus.textContent = message;
    }

    getMimeType(fileType) {
        const mimeTypes = {
            'json': 'application/json',
            'txt': 'text/plain',
            'js': 'application/javascript',
            'html': 'text/html',
            'css': 'text/css',
            'py': 'text/x-python'
        };
        return mimeTypes[fileType] || 'text/plain';
    }

    async saveCreatedFile() {
        const filename = this.dom.inputFilename.value.trim();
        const content = this.dom.codeTextarea.value.trim();
        const fileType = this.dom.selectFileType.value;

        if (!filename || !content) {
            this.showError('Filename and content cannot be empty.');
            return;
        }

        const mimeType = this.getMimeType(fileType);
        const file = new File([content], filename, { type: mimeType });

        // Use the unified upload function
        await this.uploadFiles([file]);
    }


    // --- 4. UI LOGIC & RENDERING ---

    showMainApp() {
        this.dom.page1.classList.add('hidden');
        setTimeout(() => {
            this.dom.page2.classList.add('active');
            this.fetchFiles();
        }, 800);
    }

    showLandingPage() {
        this.dom.page2.classList.remove('active');
        setTimeout(() => {
            this.dom.page1.classList.remove('hidden');
        }, 500);
    }

    toggleModal(show) {
        this.dom.modalUpload.classList.toggle('active', show && !this.state.isUploading);
        if (!show) this.dom.fileInput.value = '';
    }

    toggleTheme() {
        document.body.classList.toggle('light-mode');
        const icon = this.dom.btnTheme.querySelector('i');
        icon.className = document.body.classList.contains('light-mode') ? 'fas fa-sun' : 'fas fa-moon';
    }

    // Status & Notifications (using alert as fallback)
    showLoadingState(isLoading, message = 'Loading...') {
        if (isLoading) {
            this.dom.filesGrid.innerHTML = `
                <div class="loading-state" style="grid-column: 1 / -1;">
                    <div class="loading-spinner"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    showError(message) {
        alert(`Error: ${message}`);
        console.error(message);
    }

    showSuccess(message) {
        // Use a non-intrusive console log or light alert for multiple file success
        if (message.includes("files uploaded") && message.includes(",")) {
            console.log(`Success: ${message}`);
        } else {
            alert(`Success: ${message}`);
        }
    }

    updateConnectionStatus(isOnline) {
        this.dom.statusContainer.className = isOnline ? 'status connected' : 'status disconnected';
        this.dom.statusText.textContent = isOnline ? 'Connected to backend' : 'Connection Failed';
    }

    // --- 5. FILTERING & RENDERING ---

    handleCategoryClick(e) {
        const mainCatEl = e.target.closest('.item-cat-main');
        const subCatEl = e.target.closest('.item-cat-sub');

        // Close all other toggles and handle main category toggle
        if (mainCatEl && mainCatEl.dataset.category !== 'all') {
            this.dom.categoryList.querySelectorAll('.item-cat-main.open').forEach(openMain => {
                if (openMain !== mainCatEl) {
                    openMain.classList.remove('open');
                    if (openMain.nextElementSibling) {
                        openMain.nextElementSibling.classList.remove('open');
                    }
                }
            });
            const subList = mainCatEl.nextElementSibling;
            if (subList && subList.classList.contains('list-cat-sub')) {
                mainCatEl.classList.toggle('open');
                subList.classList.toggle('open');
            }
        }

        if (subCatEl) {
            this.state.currentFilters.category = subCatEl.dataset.category;
            this.state.currentFilters.extension = subCatEl.dataset.extension;
        } else if (mainCatEl) {
            this.state.currentFilters.category = mainCatEl.dataset.category;
            this.state.currentFilters.extension = 'all';
        } else {
            return; // Ignore clicks that don't hit a category item
        }

        // Reset type dropdown when clicking sidebar filter
        this.dom.typeSelect.value = this.state.currentFilters.category === 'all' ? 'all' : (mainCatEl ? mainCatEl.dataset.type || 'all' : (this.state.currentFilters.category === 'SQL' || this.state.currentFilters.category === 'NoSQL' ? 'json' : 'all'));

        this.highlightActiveSidebar();
        this.filterAndRenderFiles();
    }

    handleTypeChange() {
        // When type dropdown changes, reset category filters to 'all'
        this.state.currentFilters.category = 'all';
        this.state.currentFilters.extension = 'all';
        this.highlightActiveSidebar(); // This will highlight 'All Files'
        this.filterAndRenderFiles();
    }

    filterAndRenderFiles() {
        let filteredFiles = this.state.allFilesCache;
        let title = "All Files";

        const type = this.dom.typeSelect.value;
        const { category, extension } = this.state.currentFilters;

        // Filter by Type Dropdown
        if (type !== 'all') {
            filteredFiles = filteredFiles.filter(f => f.type === type);
        }

        // Filter by Category/Extension Sidebar
        if (category !== 'all' || extension !== 'all') {
            if (category === 'SQL' || category === 'NoSQL') {
                // Filter for SQL/NoSQL files, which always have extension 'json'
                filteredFiles = filteredFiles.filter(f => f.category === category);
                title = `${category} Files`;
            } else if (category !== 'all' && extension === 'all') {
                // Filter for main media category (Images, Videos)
                filteredFiles = filteredFiles.filter(f => f.category === category);
                title = `${category} Files`;
            } else if (category !== 'all' && extension !== 'all') {
                // Filter for specific extension (e.g., Images/jpg)
                filteredFiles = filteredFiles.filter(f => f.category === category && f.extension === extension);
                title = `${category} / ${extension.toUpperCase()}`;
            }
        } else if (type !== 'all') {
            title = `${type.charAt(0).toUpperCase() + type.slice(1)} Files`;
        }

        this.dom.sectionTitle.textContent = title;
        this.renderFiles(filteredFiles);
    }

    updateCategoryCounts(files) {
        // Map elements for efficient lookup
        const countElements = {};
        this.dom.categoryList.querySelectorAll('.cat-count').forEach(el => {
            const cat = el.dataset.category;
            const ext = el.closest('.item-cat-sub') ? el.closest('.item-cat-sub').dataset.extension : null;
            const key = ext ? `${cat}_${ext}` : cat;
            countElements[key] = el;
        });

        const counts = { all: files.length, Images: 0, Videos: 0, JSON: 0, SQL: 0, NoSQL: 0 };
        const extensionCounts = {};

        for (const file of files) {
            const mainCat = file.category; // 'Images', 'SQL', 'NoSQL'
            const ext = file.extension; // 'jpg', 'json'
            const type = file.type; // 'image', 'video', 'json'

            if (counts.hasOwnProperty(mainCat)) counts[mainCat]++;

            if (type === 'json' && (mainCat === 'SQL' || mainCat === 'NoSQL')) {
                // Special case: JSON sub-categories use 'json' extension
                // We only need the main SQL/NoSQL counts
                continue;
            }

            if (ext) {
                extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
            }
        }

        // Update main category counts
        if (countElements.all) countElements.all.textContent = counts.all;
        if (countElements.Images) countElements.Images.textContent = counts.Images;
        if (countElements.Videos) countElements.Videos.textContent = counts.Videos;
        if (countElements.JSON) countElements.JSON.textContent = counts.JSON;

        // Update all sub-category HTML
        this.dom.categoryList.querySelectorAll('.item-cat-sub').forEach(item => {
            const subCat = item.dataset.category; // 'SQL', 'NoSQL', 'Images'
            const ext = item.dataset.extension; // 'json', 'jpg', 'mp4'
            const countEl = item.querySelector('.cat-count');

            if (subCat === 'SQL') {
                countEl.textContent = counts.SQL;
            } else if (subCat === 'NoSQL') {
                countEl.textContent = counts.NoSQL;
            } else if (extensionCounts.hasOwnProperty(ext)) {
                countEl.textContent = extensionCounts[ext];
            } else {
                countEl.textContent = 0;
            }
        });
    }

    renderFiles(files) {
        this.dom.filesGrid.innerHTML = '';
        if (files.length === 0) {
            this.dom.filesGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-folder-open"></i>
                    <h3>No files found</h3>
                    <p>Try adjusting your filters or upload new files.</p>
                </div>
            `;
            return;
        }
        files.forEach(file => {
            this.dom.filesGrid.appendChild(this.createFileCard(file));
        });
        this.toggleView(this.state.currentView);
    }

    createFileCard(file) {
        const fileCard = document.createElement('div');
        fileCard.className = 'file-card';
        const fileName = file.name || file.filename;
        const score = file.score || 100;

        const url = file.cloudinary_url || file.content_url || file.local_url;

        let previewContent = '';
        if (file.type === 'image' && url && !file.content_url) {
            previewContent = `<img src="${url.startsWith('http') ? url : API_BASE_URL + url}" alt="${fileName}" class="file-img" loading="lazy">`;
        } else if (file.type === 'video') {
            previewContent = `<i class="fas fa-file-video"></i>`;
        } else if (file.type === 'json' || file.type === 'text') {
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
                <div class="file-category">${file.category || file.type.toUpperCase()} / ${file.extension.toUpperCase()}</div>
                <div class="file-timestamp">${formatTimestamp(file.timestamp)}</div>
            </div>
        `;

        fileCard.addEventListener('click', () => {
            if (!url) { this.showError("No preview URL available."); return; }
            window.open(url.startsWith('http') ? url : `${API_BASE_URL}${url}`, '_blank');
        });

        return fileCard;
    }

    // --- 6. UI TOGGLES ---

    handleViewToggle(e) {
        const btn = e.target.closest('.btn-view');
        if (btn) this.toggleView(btn.dataset.view);
    }

    toggleView(view) {
        this.state.currentView = view;
        const cards = document.querySelectorAll('.file-card');

        if (view === 'list') {
            this.dom.filesGrid.style.gridTemplateColumns = '1fr';
            this.dom.filesGrid.style.gap = '0.5rem';
            cards.forEach(card => {
                card.style.display = 'flex';
                card.style.height = '80px';
                card.querySelector('.file-preview').style.width = '80px';
                card.querySelector('.file-preview').style.height = '80px';
                card.querySelector('.file-preview').style.flexShrink = '0';
                card.querySelector('.file-info').style.flex = '1';
                card.querySelector('.file-info').style.padding = '0.5rem 1rem';
            });
        } else {
            this.dom.filesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
            this.dom.filesGrid.style.gap = '1.5rem';
            cards.forEach(card => {
                card.style.display = 'block';
                card.style.height = 'auto';
                card.querySelector('.file-preview').style.width = '100%';
                card.querySelector('.file-preview').style.height = '150px';
                card.querySelector('.file-info').style.flex = 'none';
                card.querySelector('.file-info').style.padding = '1rem';
            });
        }
        this.dom.viewButtons.querySelectorAll('.btn-view').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
    }

    highlightActiveSidebar() {
        this.dom.categoryList.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
        const { category, extension } = this.state.currentFilters;

        let elToActivate;
        if (category === 'all') {
            elToActivate = this.dom.categoryList.querySelector('.item-cat-main[data-category="all"]');
        } else if (extension !== 'all') {
            // Sub-category active (e.g., 'jpg', 'SQL')
            elToActivate = this.dom.categoryList.querySelector(`.item-cat-sub[data-category="${category}"][data-extension="${extension}"]`);
        } else {
            // Main category active (e.g., 'Images', 'JSON')
            elToActivate = this.dom.categoryList.querySelector(`.item-cat-main[data-category="${category}"]`);
        }

        if (elToActivate) {
            elToActivate.classList.add('active');
            // Auto-open parent toggle if a sub-item is active
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

    navigateToCategory(category, extension) {
        // Find the target element (sub-category first, then main category)
        let targetElement = this.dom.categoryList.querySelector(`.item-cat-sub[data-category="${category}"][data-extension="${extension}"]`);

        if (!targetElement) {
            targetElement = this.dom.categoryList.querySelector(`.item-cat-main[data-category="${category}"]`);
        }

        if (targetElement) {
            targetElement.click(); // Simulate the click to update filters and render
        }
    }

    // --- 7. DRAG AND DROP ---
    setupDragAndDrop() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dom.dropArea.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.dom.dropArea.addEventListener(eventName, () => this.dom.dropArea.classList.add('drag-over'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dom.dropArea.addEventListener(eventName, () => this.dom.dropArea.classList.remove('drag-over'), false);
        });

        this.dom.dropArea.addEventListener('drop', e => {
            this.dom.fileInput.files = e.dataTransfer.files;
            this.showSuccess(`${e.dataTransfer.files.length} file(s) ready to upload.`);
        }, false);
    }
}

// --- INSTANTIATE THE APP ---
new FileVibeApp();