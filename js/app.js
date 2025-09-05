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

// file inputs
const jsInput = document.querySelector('.js-js-files');
const cssInput = document.querySelector('.js-css-files');
const htmlInput = document.querySelector('.js-html-files');

// preview and result section blocks
const previewBox = document.querySelector('.js-preview');
const resultBox = document.querySelector('.js-result');

// scan and download buttons
const scanBtn = document.querySelector('.js-btn-scan');
const downloadBtn = document.querySelector('.js-btn-download');

// modal selectors
const modal = document.querySelector('.js-modal');
const testNameInput = document.querySelector('.js-test-name');
const testNumberInput = document.querySelector('.js-test-number');
const generateBtn = document.querySelector('.js-generate-zip');


/*  ==================================================
    FILE DRAG & DROP + MANUAL FILE UPLOAD LOGIC
    ================================================== */
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
[jsInput, cssInput, htmlInput].forEach(input => {
    input.addEventListener('change', () => {
        const files = [...input.files];
        //collectedFiles.push(...files);
        updatePreview(files);
    });
});

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
    const include = {
        js: jsCheckbox.checked,
        css: cssCheckbox.checked,
        fonts: fontCheckbox.checked,
        images: imgCheckbox.checked
    };

    const allFiles = [
        ...jsInput.files,
        ...cssInput.files,
        ...htmlInput.files,
        ...collectedFiles
    ];

    if (allFiles.length === 0) {
        alert('Please add files before scanning.');
        return;
    }

    // Step 1: extract asset links using regex
    const assetData = await extractAssetsFromFiles(allFiles, include);

    // Step 2: render collapsible UI previews
    renderAssetPreview(assetData);

    // Step 3: validate external asset URLs (downloadable?)
    resultBox.innerText = "Validating assets...";
    const validationResult = await validateAndFetchAssets(assetData);
    zipContent = validationResult.valid;

    resultBox.innerText = "Validation complete. Click download to proceed.";

    const excluded = Object.keys(include).filter(key => !include[key]);
    if (excluded.length > 0) {
        resultBox.innerText += `\n\n⚠️ Excluded from scan: ${excluded.map(e => e.toUpperCase()).join(', ')}`;
    }

    // Step 4: show failed URLs (CORS, 404 etc.)
    if (validationResult.failed.length > 0) {
        renderFailedAssets(validationResult.failed);
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
    };

    // Regex matches:
    // - URLs in quotes, parentheses, or plain
    // - CSS url(...) with or without quotes
    // - Protocol-relative and absolute URLs
    // - Common web asset extensions
        // Improved regex: only match file extensions after a slash, not in the domain
        const urlRegex = /(?:url\(\s*['"]?|['"])?((?:https?:)?\/\/[^\s"'()]+\/[^\s"'()]+?\.(js|css|png|jpe?g|svg|webp|gif|mp4|webm|ogg|woff2?|ttf|otf|eot)(\?[^\s"'()]*)?)(?:['"]?\s*\))?/gi;
    // prev const urlRegex = /(?:url\(\s*['"]?|['"])?((?:https?:)?\/\/[^\s"'()]+?\.(js|css|png|jpe?g|svg|webp|woff2?|ttf|otf|eot)(\?[^\s"'()]*)?)(?:['"]?\s*\))?/gi;

    for (const file of files) {
        try {
            const text = await file.text();

            const matches = [...text.matchAll(urlRegex)];
            matches.forEach(match => {
                let rawUrl = match[1]; // Use the captured group for the actual URL

                // Normalize protocol
                const fullUrl = rawUrl.startsWith('//') ? 'https:' + rawUrl : rawUrl;

                // Categorize based on extension and add to sets
                if ((fullUrl.endsWith('.js') || fullUrl.includes('.js?')) && include.js) {
                    assets.js.add(fullUrl);
                } else if ((fullUrl.endsWith('.css') || fullUrl.includes('.css?')) && include.css) {
                    assets.css.add(fullUrl);
                } else if (/\.(png|jpe?g|svg|webp|gif|mp4|webm|ogg)([\?#][^"')\s]*)?$/i.test(fullUrl) && include.images) {
                    assets.images.add(fullUrl);
                } else if (/\.(woff2?|ttf|otf|eot)([\?#][^"')\s]*)?$/i.test(fullUrl) && include.fonts) {
                    assets.fonts.add(fullUrl);
                }
            });
        } catch (err) {
            console.warn(`Error reading file "${file.name}":`, err);
        }
    }

    return assets;
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

    Object.entries(assetData).forEach(([type, items]) => {
        const label = `${type.toUpperCase()} (${items.size})`;

        if (type === 'images') {
            html += `
        <details class="preview-section">
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
        <details class="preview-section">
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
    <details class="preview-section preview-section--error">
      <summary class="preview-summary">❌ Failed Downloads (${failedList.length})</summary>
      ${Object.entries(grouped).map(([type, list]) => `
        <div>
          <strong>${type.toUpperCase()} (${list.length}):</strong>
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
            js: new Map()
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
[testNameInput].forEach(input =>
    input.addEventListener('input', validateInputs)
);

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
        modal.classList.add('modal--show');
        return;
    }
    alert("Please scan and validate assets first.");
});


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

    // Only create folders if there are any assets of that type
    const hasAssets = (type) => zipContent[type] && zipContent[type].size > 0;

    // Assets folder for images, fonts, videos, gifs, etc.
    if (hasAssets('images') || hasAssets('fonts') || hasAssets('videos') || hasAssets('gifs')) {
        const assets = root.folder('assets');
        // Images
        if (hasAssets('images')) {
            const imgFolder = assets.folder('images');
            const normalizedTracker = new Set();
            zipContent.images.forEach((blob, filename) => {
                // Only add if not gif or video
                if (!/\.(gif|mp4|webm|ogg)$/i.test(filename)) {
                    const baseFilename = filename.split(/[?#]/)[0];
                    let finalName = baseFilename;
                    let i = 1;
                    while (normalizedTracker.has(finalName)) {
                        finalName = `duplicate-${i++}-${baseFilename}`;
                    }
                    normalizedTracker.add(finalName);
                    imgFolder.file(finalName, blob);
                }
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
        let hasVideo = false;
        zipContent.images && zipContent.images.forEach((_, filename) => {
            if (/\.(mp4|webm|ogg)$/i.test(filename)) hasVideo = true;
        });
        if (hasVideo) {
            const videoFolder = assets.folder('videos');
            const normalizedTracker = new Set();
            zipContent.images.forEach((blob, filename) => {
                if (/\.(mp4|webm|ogg)$/i.test(filename)) {
                    const baseFilename = filename.split(/[?#]/)[0];
                    let finalName = baseFilename;
                    let i = 1;
                    while (normalizedTracker.has(finalName)) {
                        finalName = `duplicate-${i++}-${baseFilename}`;
                    }
                    normalizedTracker.add(finalName);
                    videoFolder.file(finalName, blob);
                }
            });
        }
        // Gifs
        let hasGif = false;
        zipContent.images && zipContent.images.forEach((_, filename) => {
            if (/\.gif$/i.test(filename)) hasGif = true;
        });
        if (hasGif) {
            const gifFolder = assets.folder('gifs');
            const normalizedTracker = new Set();
            zipContent.images.forEach((blob, filename) => {
                if (/\.gif$/i.test(filename)) {
                    const baseFilename = filename.split(/[?#]/)[0];
                    let finalName = baseFilename;
                    let i = 1;
                    while (normalizedTracker.has(finalName)) {
                        finalName = `duplicate-${i++}-${baseFilename}`;
                    }
                    normalizedTracker.add(finalName);
                    gifFolder.file(finalName, blob);
                }
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