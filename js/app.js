/**
 * SPZ Devpack Builder v1.0.0
 * ------------------------------------------
 * This app allows users to upload JS, CSS, and HTML files,
 * automatically scans and extracts asset URLs (images, fonts, CSS, JS) from the files,
 * validates and downloads those assets, and packages everything into a ZIP file
 * with a custom folder structure for easy experiment deployment.
 * Includes asset preview, error reporting, and image modal features.
 *
 * @author   Abir Maiti
 * @company  Spiralyze
 * @version  1.0.0
 */


/*  ==================================================
    GLOBAL STATE
    ================================================== */
let collectedFiles = []; // Manually dropped/uploaded files
let uploadedFileSet = new Set(); // Ensures unique file list
let zipContent = null; // Holds validated asset blobs to be zipped

// Only download media (images, videos, gifs, fonts) from this base URL
const MEDIA_BASE_URL = 'https://res.cloudinary.com/spiralyze/';

// Canonical root for resolving relative paths (avoids wrong combos like 3002 base + 3001 path)
const CLOUDINARY_UPLOAD_ROOT = 'https://res.cloudinary.com/spiralyze/image/upload/';


/*  ==================================================
    DOM REFERENCES (SELECTORS)
    ================================================== */
// Filters
const jsCheckbox = document.querySelector('.js-include-js');
const cssCheckbox = document.querySelector('.js-include-css');
const fontCheckbox = document.querySelector('.js-include-fonts');
const imgCheckbox = document.querySelector('.js-include-images');

// drag/dropzon
const dropzone = document.querySelector('.js-dropzone');

// file input (accepts .js, .css, .html)
const allFilesInput = document.querySelector('.js-all-files');

// preview, result, and error section blocks
const previewBox = document.querySelector('.js-preview');
const resultBox = document.querySelector('.js-result');
const errorBox = document.querySelector('.js-error');

// scan, download, and clear buttons
const scanBtn = document.querySelector('.js-btn-scan');
const downloadBtn = document.querySelector('.js-btn-download');
const clearBtn = document.querySelector('.js-btn-clear');

// modal selectors
const modal = document.querySelector('.js-modal');
const testNameInput = document.querySelector('.js-test-name');
const generateBtn = document.querySelector('.js-generate-zip');


/*  ==================================================
    FILE DRAG & DROP + MANUAL FILE UPLOAD LOGIC
    ================================================== */
// Click dropzone to open file picker
dropzone.addEventListener('click', () => allFilesInput.click());

// Highlight dropzone on drag
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#2563eb';
});
dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '#999';
});

// Handle dropped files
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#999';
    const dropped = [...e.dataTransfer.files].filter(f => /\.(js|css|html)$/.test(f.name));
    //collectedFiles.push(...dropped);
    updatePreview(dropped);
});

// handle uploaded files
allFilesInput.addEventListener('change', () => {
    const files = [...allFilesInput.files];
    updatePreview(files);
});

/**
 * Shows an error message above the CTAs. Pass empty string to hide.
 */
function showError(message) {
    if (!errorBox) return;
    if (message) {
        errorBox.textContent = message;
        errorBox.classList.add('devpack__error--show');
    } else {
        errorBox.textContent = '';
        errorBox.classList.remove('devpack__error--show');
    }
}

/**
 * Displays names of newly added files in preview area.
 * Deduplicates by file content (name, size, lastModified).
 * @param {File[]} files
 */
function updatePreview(newFiles) {
    const newUniqueFiles = [];

    // Use a composite key for deduplication (using file name, file size and last modified data)
    for (const f of newFiles) {
        const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
        if (!uploadedFileSet.has(fileKey)) {
            uploadedFileSet.add(fileKey);
            newUniqueFiles.push(f);
        }
    }

    // Only push truly new files to collectedFiles
    collectedFiles.push(...newUniqueFiles);

    // Re-render the file list from collectedFiles
    const allNames = collectedFiles.map(f => f.name);
    const uniqueSorted = [...new Set(allNames)].sort();

    previewBox.innerHTML = `<strong>Files added (${collectedFiles.length}):</strong><br>\n` + uniqueSorted.join('<br>\n');
}


/*  ==================================================
    FILE SCAN & VALIDATE BUTTON LOGIC
    ================================================== */
scanBtn.addEventListener('click', processFiles);

/**
 * Main scan function: reads uploaded files, extracts URLs, validates them.
 */
async function processFiles() {
    // Add selectors for videos and gifs
    const videoCheckbox = document.querySelector('.js-include-videos');
    const gifCheckbox = document.querySelector('.js-include-gifs');
    const include = {
        js: jsCheckbox.checked,
        css: cssCheckbox.checked,
        fonts: fontCheckbox.checked,
        images: imgCheckbox.checked,
        videos: videoCheckbox ? videoCheckbox.checked : true,
        gifs: gifCheckbox ? gifCheckbox.checked : true
    };

    const allFiles = [
        ...(allFilesInput.files || []),
        ...collectedFiles
    ];

    if (allFiles.length === 0) {
        showError('Please add files before scanning.');
        return;
    }

    showError(''); // Clear any previous error

    // Loading state
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning...';

    try {
        // Step 1: extract asset links using regex
        const assetData = await extractAssetsFromFiles(allFiles, include);

        // Step 2: validate external asset URLs (downloadable?)
        resultBox.innerText = "Validating assets...";
        const validationResult = await validateAndFetchAssets(assetData);
        zipContent = validationResult.valid;

        resultBox.innerText = "Validation complete. Click download to proceed.";

        const excluded = Object.keys(include).filter(key => !include[key]);
        if (excluded.length > 0) {
            // Custom labels for user-friendly message
            const labelMap = {
                js: 'JS',
                css: 'CSS',
                fonts: 'FONTS',
                images: 'IMAGES',
                videos: 'VIDEOS',
                gifs: 'GIFS'
            };
            resultBox.innerText += `\n\n⚠️ Excluded from scan: ${excluded.map(e => labelMap[e] || e.toUpperCase()).join(', ')}`;
        }

        // Step 3: render preview with only successfully validated assets (404s etc. excluded)
        renderAssetPreview(validationResult.validUrls);

        // Step 4: scroll to images accordion (open by default)
        const imagesAccordion = previewBox.querySelector('.js-images-accordion');
        if (imagesAccordion) {
            imagesAccordion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Step 5: show failed URLs (CORS, 404 etc.) only in Failed tab
        if (validationResult.failed.length > 0) {
            renderFailedAssets(validationResult.failed);
        }
    } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan & Validate';
    }
}


/*  ==================================================
    ASSET EXTRACTION LOGIC FROM FILE CONTENTS
    ================================================== */
/**
 * Extracts asset URLs from uploaded files using patterns.
 * Improved to catch more image/font/CSS/JS URLs, including those in CSS url(...) and with/without quotes.
 * @param {File[]} files
 * @returns {Promise<Object>} Object of Sets: images, css, js, fonts
 */
async function extractAssetsFromFiles(files, include) {
    const assets = {
        images: new Set(),
        css: new Set(),
        js: new Set(),
        fonts: new Set(),
        videos: new Set(),
        gifs: new Set(),
    };

    // Regex matches:
    // - URLs in quotes, parentheses, or plain
    // - CSS url(...) with or without quotes
    // - Protocol-relative and absolute URLs
    // - Common web asset extensions
    const urlRegex = /(?:url\(\s*['"]?|['"])?((?:https?:)?\/\/[^\s"'()]+\/[^\s"'()]+?\.(js|css|png|jpe?g|svg|webp|gif|mp4|webm|ogg|woff2?|ttf|otf|eot)(\?[^\s"'()]*)?)(?:['"]?\s*\))?/gi;

    // Relative path regex: paths like fl_sanitize/patchmypc/3001/logo-01.svg (from ${cdnBase}path or 'path')
    const relativePathRegex = /(?:[}\s'"`])((?:[a-zA-Z0-9_\-]+\/)+[a-zA-Z0-9_\-.]*\.(?:svg|png|jpe?g|webp|gif|mp4|webm|ogg|woff2?|ttf|otf|eot)(?:\?[^\s"')\]\}]*)?)(?=[\s'")\]\}`;,]|$)/gi;

    for (const file of files) {
        try {
            const text = await file.text();

            // Pass 1: Extract full URLs
            const matches = [...text.matchAll(urlRegex)];
            matches.forEach(match => {
                let rawUrl = match[1];
                const fullUrl = rawUrl.startsWith('//') ? 'https:' + rawUrl : rawUrl;
                addAssetByUrl(fullUrl, assets, include);
            });

            // Pass 2: Extract relative paths and resolve against canonical root only.
            // Using file-specific base URLs (e.g. f_auto/patchmypc/3002/) would produce wrong URLs
            // when a path like fl_sanitize/patchmypc/3001/logo.svg is meant for the root.
            const relativePaths = [...text.matchAll(relativePathRegex)].map(m => m[1].trim());
            relativePaths.forEach(relPath => {
                const fullUrl = CLOUDINARY_UPLOAD_ROOT + relPath.replace(/^\//, '');
                if (fullUrl.startsWith(MEDIA_BASE_URL)) {
                    addAssetByUrl(fullUrl, assets, include);
                }
            });
        } catch (err) {
            console.warn(`Error reading file "${file.name}":`, err);
        }
    }

    return assets;
}

/**
 * Categorizes a URL and adds it to the appropriate asset set.
 * Media assets (images, videos, gifs, fonts) are only included if from the allowed base URL.
 */
function addAssetByUrl(fullUrl, assets, include) {
    const isAllowedMedia = fullUrl.startsWith(MEDIA_BASE_URL);

    if ((fullUrl.endsWith('.js') || fullUrl.includes('.js?')) && include.js) {
        assets.js.add(fullUrl);
    } else if ((fullUrl.endsWith('.css') || fullUrl.includes('.css?')) && include.css) {
        assets.css.add(fullUrl);
    } else if (/\.(woff2?|ttf|otf|eot)([\?#][^"')\s]*)?$/i.test(fullUrl) && include.fonts && isAllowedMedia) {
        assets.fonts.add(fullUrl);
    } else if (/\.(mp4|webm|ogg)([\?#][^"')\s]*)?$/i.test(fullUrl) && include.videos && isAllowedMedia) {
        assets.videos.add(fullUrl);
    } else if (/\.gif([\?#][^"')\s]*)?$/i.test(fullUrl) && include.gifs && isAllowedMedia) {
        assets.gifs.add(fullUrl);
    } else if (/\.svg([\?#][^"')\s]*)?$/i.test(fullUrl) && isAllowedMedia) {
        assets.images.add(fullUrl);
    } else if (/\.(png|jpe?g|webp)([\?#][^"')\s]*)?$/i.test(fullUrl) && include.images && isAllowedMedia) {
        assets.images.add(fullUrl);
    }
}


/*  ==================================================
    RENDER COLLAPSIBLE ASSET UI LOGIC
    ================================================== */
/**
 * Displays found assets in collapsible UI format by type.
 * @param {Object} assetData
 */
function renderAssetPreview(assetData) {
    let html = `<p><strong>Assets Detected:</strong></p>`;

    const thumbTypes = ['images', 'gifs']; // Show as thumbnails
    const listTypes = ['css', 'js', 'fonts', 'videos']; // Show as list

    Object.entries(assetData).forEach(([type, items]) => {
        if (items.size === 0) return;
        const label = `${type.toUpperCase()} (${items.size})`;

        if (thumbTypes.includes(type)) {
            const imagesClass = type === 'images' ? ' js-images-accordion' : '';
            html += `
        <details class="preview-section${imagesClass}" open>
          <summary class="preview-summary">${label}</summary>
          <div class="preview-grid">
            ${[...items].map(url => `
              <div class="preview-thumb js-image-thumb" data-url="${url}">
                <img src="${url}" alt="" />
              </div>
            `).join('')}
          </div>
        </details>
      `;
        } else {
            html += `
        <details class="preview-section" open>
          <summary class="preview-summary">${label}</summary>
          <ul class="preview-list">
            ${[...items].map(url => `
              <li><a href="${url}" target="_blank">${url}</a></li>
            `).join('')}
          </ul>
        </details>
      `;
        }
    });

    previewBox.innerHTML = html;
}


/*  ==================================================
    RENDER FAILED DOWNLOADS UI LOGIC
    ================================================== */
/**
 * Displays asset links that failed to download.
 * @param {Array} failedList
 */
function renderFailedAssets(failedList) {
    const grouped = groupBy(failedList, 'type');

    let html = `
    <details class="preview-section preview-section--error" open>
      <summary class="preview-summary">❌ Failed Downloads (${failedList.length})</summary>
      ${Object.entries(grouped).map(([type, list]) => `
        <div>
          <strong style="padding: 0 10px">${type.toUpperCase()} (${list.length}):</strong>
          <ul class="preview-list error-list">
            ${list.map(item => `
              <li>
                ${item.url} — <em>${item.reason}</em>
                <a href="${item.url}" target="_blank">Try manually</a>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    </details>
  `;

    previewBox.innerHTML += html;
}

/**
 * Groups an array of objects by key.
 */
function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        (acc[item[key]] ||= []).push(item);
        return acc;
    }, {});
}


/*  ==================================================
    VALIDATE ASSET URLS VIA FETCH() LOGIC
    ================================================== */
/**
 * Fetches each URL and keeps only those that can be downloaded.
 */
async function validateAndFetchAssets(assets) {
    const result = {
        valid: {
            images: new Map(),
            fonts: new Map(),
            css: new Map(),
            js: new Map(),
            videos: new Map(),
            gifs: new Map()
        },
        validUrls: {
            images: new Set(),
            fonts: new Set(),
            css: new Set(),
            js: new Set(),
            videos: new Set(),
            gifs: new Set()
        },
        failed: []
    };

    const assetNameTracker = new Set(); // separate from uploadedFileSet

    const generateUniqueName = (url) => {
        let base = url.split('/').pop().split('?')[0].split('#')[0];
        let name = base;
        let i = 1;
        while (assetNameTracker.has(name)) {
            name = `duplicate-${i++}-${base}`;
        }
        assetNameTracker.add(name);
        return name;
    };

    const allFetches = [];

    for (const [type, urls] of Object.entries(assets)) {
        for (let rawUrl of urls) {
            let url = rawUrl.trim();

            // Fix protocol-relative URLs (e.g. //cdn.jsdelivr.net)
            if (url.startsWith('//')) {
                url = 'https:' + url;
            }

            // Skip invalid/local URLs
            if (!/^https?:\/\//.test(url)) {
                result.failed.push({
                    url: rawUrl,
                    type,
                    reason: 'Unsupported or local path'
                });
                continue;
            }

            const fetchPromise = fetch(url)
                .then(async (res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    const filename = generateUniqueName(url);
                    result.valid[type].set(filename, blob);
                    result.validUrls[type].add(url);
                })
                .catch(err => {
                    result.failed.push({
                        url,
                        type,
                        reason: err.message
                    });
                });

            allFetches.push(fetchPromise);
        }
    }

    await Promise.all(allFetches);
    return result;
}


/*  ==================================================
    ZIP DOWNLOAD MODAL INPUTS LOGIC
    ================================================== */
testNameInput.addEventListener('input', validateInputs);

/**
 * Enables "Download ZIP" button if inputs are valid
 */
function validateInputs() {
    let name = testNameInput.value.trim();

    // Replace spaces with hyphens, remove special characters
    name = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

    testNameInput.value = name;

    // Accept uppercase, lowercase, numbers, hyphens, and long text
    const isValid = /^[a-zA-Z0-9-]+$/.test(name) && name.length > 0;
    generateBtn.disabled = !isValid;
}

downloadBtn.addEventListener('click', () => {
    // Allow download if there are validated assets OR user-uploaded files
    let hasAssets = false;
    if (zipContent && typeof zipContent === 'object') {
        const maps = Object.values(zipContent).filter(map => map instanceof Map);
        hasAssets = maps.some(map => map.size > 0);
    }
    // Fallback: if no assets, but user uploaded files exist, allow download
    if (hasAssets || (collectedFiles && collectedFiles.length > 0)) {
        showError('');
        modal.classList.add('modal--show');
        return;
    }
    showError('Please scan and validate assets first.');
});

/*  ==================================================
    CLEAR / RESET LOGIC
    ================================================== */
if (clearBtn) clearBtn.addEventListener('click', resetAll);

function resetAll() {
    collectedFiles = [];
    uploadedFileSet.clear();
    zipContent = null;

    // Clear file input
    allFilesInput.value = '';

    // Clear preview, result, and error
    previewBox.innerHTML = '';
    resultBox.innerHTML = '';
    showError('');

    // Close modal if open
    modal.classList.remove('modal--show');
}


/*  ==================================================
    ZIP GENERATION LOGIC
    ================================================== */
generateBtn.addEventListener('click', async () => {
    const name = testNameInput.value.trim();
    const date = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).replace(/ /g, '-').toLowerCase();

    const filename = `Devpack-${name}-${date}.zip`;
    const folderName = `${name}-devpack`;

    // Loading state
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating ZIP...';

    try {
        const zip = new JSZip();
        const root = zip.folder(folderName);

        // Deduplicate by file content key
        const fileKeyTracker = new Set();
        collectedFiles.forEach(file => {
            const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
            let baseName = file.name;
            let i = 1;
            while (fileKeyTracker.has(fileKey)) {
                baseName = `duplicate-${i++}-${file.name}`;
            }
            fileKeyTracker.add(fileKey);
            root.file(baseName, file);
        });

        // Only create folders if there are any assets of that type (with null checks)
        const hasAssets = (type) => zipContent && zipContent[type] && zipContent[type].size > 0;

        // Assets folder for images, fonts, videos, gifs, etc.
        if (hasAssets('images') || hasAssets('fonts') || hasAssets('videos') || hasAssets('gifs')) {
            const assets = root.folder('assets');
            // Images (png, jpg, svg, webp)
            if (hasAssets('images')) {
                const imgFolder = assets.folder('images');
                const normalizedTracker = new Set();
                zipContent.images.forEach((blob, filename) => {
                    const baseFilename = filename.split(/[?#]/)[0];
                    let finalName = baseFilename;
                    let i = 1;
                    while (normalizedTracker.has(finalName)) {
                        finalName = `duplicate-${i++}-${baseFilename}`;
                    }
                    normalizedTracker.add(finalName);
                    imgFolder.file(finalName, blob);
                });
            }
            // Fonts
            if (hasAssets('fonts')) {
                const fontFolder = assets.folder('fonts');
                const normalizedTracker = new Set();
                zipContent.fonts.forEach((blob, filename) => {
                    const baseFilename = filename.split(/[?#]/)[0];
                    let finalName = baseFilename;
                    let i = 1;
                    while (normalizedTracker.has(finalName)) {
                        finalName = `duplicate-${i++}-${baseFilename}`;
                    }
                    normalizedTracker.add(finalName);
                    fontFolder.file(finalName, blob);
                });
            }
            // Videos
            if (hasAssets('videos')) {
                const videoFolder = assets.folder('videos');
                const normalizedTracker = new Set();
                zipContent.videos.forEach((blob, filename) => {
                    const baseFilename = filename.split(/[?#]/)[0];
                    let finalName = baseFilename;
                    let i = 1;
                    while (normalizedTracker.has(finalName)) {
                        finalName = `duplicate-${i++}-${baseFilename}`;
                    }
                    normalizedTracker.add(finalName);
                    videoFolder.file(finalName, blob);
                });
            }
            // Gifs
            if (hasAssets('gifs')) {
                const gifFolder = assets.folder('gifs');
                const normalizedTracker = new Set();
                zipContent.gifs.forEach((blob, filename) => {
                    const baseFilename = filename.split(/[?#]/)[0];
                    let finalName = baseFilename;
                    let i = 1;
                    while (normalizedTracker.has(finalName)) {
                        finalName = `duplicate-${i++}-${baseFilename}`;
                    }
                    normalizedTracker.add(finalName);
                    gifFolder.file(finalName, blob);
                });
            }
        }

        // Script folder for js
        if (hasAssets('js')) {
            const scriptFolder = root.folder('script');
            const normalizedTracker = new Set();
            zipContent.js.forEach((blob, filename) => {
                const baseFilename = filename.split(/[?#]/)[0];
                let finalName = baseFilename;
                let i = 1;
                while (normalizedTracker.has(finalName)) {
                    finalName = `duplicate-${i++}-${baseFilename}`;
                }
                normalizedTracker.add(finalName);
                scriptFolder.file(finalName, blob);
            });
        }

        // Style folder for css
        if (hasAssets('css')) {
            const styleFolder = root.folder('style');
            const normalizedTracker = new Set();
            zipContent.css.forEach((blob, filename) => {
                const baseFilename = filename.split(/[?#]/)[0];
                let finalName = baseFilename;
                let i = 1;
                while (normalizedTracker.has(finalName)) {
                    finalName = `duplicate-${i++}-${baseFilename}`;
                }
                normalizedTracker.add(finalName);
                styleFolder.file(finalName, blob);
            });
        }

        const content = await zip.generateAsync({
            type: "blob"
        });
        saveAs(content, filename);
        modal.classList.remove('modal--show');
    } finally {
        // Reset button state
        generateBtn.textContent = 'Download ZIP';
        validateInputs();
    }
});


/*  ==================================================
    IMAGE PREVIEW MODAL LOGIC
    ================================================== */
document.addEventListener('click', (e) => {
    const thumb = e.target.closest('.js-image-thumb');
    if (thumb) {
        const url = thumb.getAttribute('data-url');
        openImageModal(url);
    }
});

document.querySelector('.js-image-modal-close').addEventListener('click', () => {
    document.querySelector('.js-image-modal').classList.remove('image-modal--show');
});

/**
 * Opens modal to show full image preview + download
 */
function openImageModal(url) {
    const modal = document.querySelector('.js-image-modal');
    const img = modal.querySelector('.js-image-modal-preview');
    const urlBox = modal.querySelector('.js-image-modal-url');
    const downloadLink = modal.querySelector('.js-image-modal-download');

    img.src = url;
    urlBox.textContent = url;
    downloadLink.href = url;

    modal.classList.add('image-modal--show');
}