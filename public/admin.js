// ──────────────────────────────────────────────
// Tab Switching
// ──────────────────────────────────────────────
function switchTab(tabName, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-' + tabName).classList.add('active');
    btn.classList.add('active');
}

// ──────────────────────────────────────────────
// Image Drop Zone Preview
// ──────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('image-upload');
const imagePreview = document.getElementById('image-preview');
const fileNameDisplay = document.getElementById('file-name-display');

fileInput.addEventListener('change', () => handleFileSelect(fileInput.files[0]));

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        // Assign file to input
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        handleFileSelect(file);
    }
});

function handleFileSelect(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        fileNameDisplay.textContent = `📁 ${file.name}  (${(file.size / 1024).toFixed(0)} KB)`;
        dropZone.classList.add('has-file');
    };
    reader.readAsDataURL(file);
}

// ──────────────────────────────────────────────
// ✨ Magic AI Form Submit
// ──────────────────────────────────────────────
document.getElementById('magic-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const statusMsg = document.getElementById('magic-status');
    const submitBtn = document.getElementById('magic-btn');
    const loadingBox = document.getElementById('magic-loading');
    const resultCard = document.getElementById('magic-result');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Working...';
    statusMsg.textContent = '';
    statusMsg.style.color = '';
    loadingBox.style.display = 'block';
    resultCard.style.display = 'none';

    const basePrompt = document.getElementById('base-prompt').value.trim();
    const tag = document.getElementById('magic-tag').value;
    const categoryOverride = document.getElementById('magic-category-override')?.value || '';

    try {
        const response = await fetch('/api/magic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ basePrompt, tag, categoryOverride })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            statusMsg.textContent = '✅ Successfully published to website!';
            statusMsg.style.color = '#22c55e';

            document.getElementById('magic-res-title').textContent = result.data.title;
            document.getElementById('magic-res-image').src = result.data.image;
            document.getElementById('magic-res-category').textContent = result.data.category;
            document.getElementById('magic-res-prompt').textContent = result.data.prompt;
            resultCard.style.display = 'block';

            document.getElementById('magic-form').reset();
            loadPromptsForAdmin();
        } else {
            throw new Error(result.error || 'Failed to generate');
        }
    } catch (err) {
        statusMsg.textContent = '❌ Error: ' + err.message;
        statusMsg.style.color = '#ef4444';
    } finally {
        submitBtn.textContent = '✨ Generate & Publish Automatically';
        submitBtn.disabled = false;
        loadingBox.style.display = 'none';
    }
});

// ──────────────────────────────────────────────
// 🖼️ Image Analyzer Form Submit
// ──────────────────────────────────────────────
document.getElementById('image-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const statusMsg = document.getElementById('image-status');
    const submitBtn = document.getElementById('image-btn');
    const loadingBox = document.getElementById('image-loading');
    const resultCard = document.getElementById('image-result');

    if (!fileInput.files[0]) {
        statusMsg.textContent = '❌ Please select an image first.';
        statusMsg.style.color = '#ef4444';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Analyzing...';
    statusMsg.textContent = '';
    statusMsg.style.color = '';
    loadingBox.style.display = 'block';
    resultCard.style.display = 'none';

    const tag = document.getElementById('image-tag').value;
    const categoryOverride = document.getElementById('image-category-override')?.value || '';
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    formData.append('tag', tag);
    formData.append('categoryOverride', categoryOverride);

    try {
        const response = await fetch('/api/analyze-image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
            statusMsg.textContent = '✅ Image analyzed & published to website!';
            statusMsg.style.color = '#22c55e';

            document.getElementById('image-res-title').textContent = result.data.title;
            document.getElementById('image-res-image').src = result.data.image;
            document.getElementById('image-res-category').textContent = result.data.category;
            document.getElementById('image-res-prompt').textContent = result.data.prompt;
            resultCard.style.display = 'block';

            // Reset
            document.getElementById('image-form').reset();
            dropZone.classList.remove('has-file');
            imagePreview.src = '';
            fileNameDisplay.textContent = '';
            loadPromptsForAdmin();
        } else {
            throw new Error(result.error || 'Failed to analyze image');
        }
    } catch (err) {
        statusMsg.textContent = '❌ Error: ' + err.message;
        statusMsg.style.color = '#ef4444';
    } finally {
        submitBtn.textContent = '🔍 Analyze Image & Publish';
        submitBtn.disabled = false;
        loadingBox.style.display = 'none';
    }
});

// ──────────────────────────────────────────────
// Manage Prompts — Load & Delete & Edit
// ──────────────────────────────────────────────
async function loadPromptsForAdmin() {
    const listContainer = document.getElementById('prompts-list');
    try {
        const [promptsRes, catsRes] = await Promise.all([
            fetch('/api/prompts'),
            fetch('/api/categories')
        ]);
        const prompts = await promptsRes.json();
        const categories = await catsRes.json();

        listContainer.innerHTML = '';

        if (prompts.length === 0) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No prompts yet. Add some above!</p>';
            return;
        }

        prompts.forEach(p => {
            const div = document.createElement('div');
            div.className = 'prompt-item';

            const imgSrc = p.image || '';
            const sourceIcon = p.source === 'image-analysis' ? '🖼️' : '✨';

            let catOptions = categories.map(c => 
                `<option value="${c}" ${c === p.category ? 'selected' : ''}>${c}</option>`
            ).join('');
            
            // If current category isn't in the list (like 'Uncategorized'), show it too
            if (p.category && !categories.includes(p.category)) {
                catOptions += `<option value="${p.category}" selected>${p.category}</option>`;
            }

            div.innerHTML = `
                <img src="${imgSrc}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22><rect width=%2252%22 height=%2252%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2255%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2224%22>🖼️</text></svg>'">
                <div class="info" style="display:flex; flex-direction:column; gap:0.3rem;">
                    <strong>${p.title}</strong>
                    <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:var(--text-muted);">
                        <span>${sourceIcon}</span>
                        <select class="inline-cat-select" data-id="${p.id}" style="background:var(--bg-color); border:1px solid var(--border); color:var(--text-main); border-radius:5px; padding:0.15rem 0.4rem; outline:none; font-family:inherit; font-size:0.8rem; cursor:pointer;">
                            ${catOptions}
                        </select>
                        <span>· ${p.tag}</span>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; flex-shrink:0;">
                    <button class="edit-btn" data-id="${p.id}" data-title="${p.title.replace(/"/g,'&quot;')}"
                        style="background:#a855f7; color:white; border:none; padding:0.45rem 0.8rem; border-radius:7px; cursor:pointer; font-size:0.82rem; font-weight:700; transition:opacity 0.2s;">
                        ✏️ Edit
                    </button>
                    <button class="delete-btn" data-id="${p.id}"
                        style="background:#ef4444; color:white; border:none; padding:0.45rem 0.8rem; border-radius:7px; cursor:pointer; font-size:0.82rem; font-weight:700; transition:opacity 0.2s;">
                        🗑️ Delete
                    </button>
                </div>
            `;
            listContainer.appendChild(div);
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm('Delete this prompt permanently?')) return;
                const id = e.currentTarget.getAttribute('data-id');
                try {
                    const res = await fetch('/api/prompts/' + id, { method: 'DELETE' });
                    if (res.ok) loadPromptsForAdmin();
                    else alert('Failed to delete.');
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            });
        });

        // Inline Category Change
        document.querySelectorAll('.inline-cat-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                const newCat = e.target.value;
                try {
                    const res = await fetch(`/api/prompts/${id}/category`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ category: newCat })
                    });
                    if (!res.ok) throw new Error('Failed to update category');
                    
                    // Also refresh the category tab counts if the function exists
                    if (typeof fetchCategoryCounts === 'function') fetchCategoryCounts();
                } catch(err) {
                    alert('Error: ' + err.message);
                    loadPromptsForAdmin();
                }
            });
        });

        // Edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const title = e.currentTarget.getAttribute('data-title');
                openEditModal(id, title);
            });
        });

    } catch (err) {
        listContainer.innerHTML = '<p style="color:#ef4444;">Failed to load prompts.</p>';
    }
}

// ──────────────────────────────────────────────
// Edit Modal
// ──────────────────────────────────────────────
let editingPromptId = null;

function openEditModal(id, title) {
    editingPromptId = id;
    document.getElementById('edit-prompt-title').textContent = `Editing: "${title}"`;
    document.getElementById('edit-status').textContent = '';
    document.getElementById('edit-re-analyze').checked = false;
    document.getElementById('edit-submit-btn').disabled = false;
    document.getElementById('edit-submit-btn').textContent = '💾 Save New Image';

    // Reset drop zone
    const editDz = document.getElementById('edit-drop-zone');
    editDz.classList.remove('has-file');
    document.getElementById('edit-image-preview').src = '';
    document.getElementById('edit-file-name').textContent = '';
    document.getElementById('edit-image-upload').value = '';
    document.getElementById('edit-loading').style.display = 'none';

    const modal = document.getElementById('edit-modal');
    modal.style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    editingPromptId = null;
}

// Close modal on backdrop click
document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
});

// Drop zone for edit modal
const editFileInput = document.getElementById('edit-image-upload');
const editDropZone = document.getElementById('edit-drop-zone');

editFileInput.addEventListener('change', () => handleEditFileSelect(editFileInput.files[0]));
editDropZone.addEventListener('dragover', (e) => { e.preventDefault(); editDropZone.classList.add('drag-over'); });
editDropZone.addEventListener('dragleave', () => editDropZone.classList.remove('drag-over'));
editDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    editDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        editFileInput.files = dt.files;
        handleEditFileSelect(file);
    }
});

function handleEditFileSelect(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('edit-image-preview').src = e.target.result;
        document.getElementById('edit-file-name').textContent = `📁 ${file.name}  (${(file.size/1024).toFixed(0)} KB)`;
        editDropZone.classList.add('has-file');
    };
    reader.readAsDataURL(file);
}

async function submitReplaceImage() {
    if (!editingPromptId) return;

    const fileInput = document.getElementById('edit-image-upload');
    if (!fileInput.files[0]) {
        document.getElementById('edit-status').textContent = '❌ Please select a new image first.';
        document.getElementById('edit-status').style.color = '#ef4444';
        return;
    }

    const reAnalyze = document.getElementById('edit-re-analyze').checked;
    const submitBtn = document.getElementById('edit-submit-btn');
    const loadingBox = document.getElementById('edit-loading');
    const statusMsg = document.getElementById('edit-status');
    const loadingText = document.getElementById('edit-loading-text');

    submitBtn.disabled = true;
    statusMsg.textContent = '';
    loadingBox.style.display = 'block';
    loadingText.textContent = reAnalyze
        ? '🔍 Replacing image & re-analyzing with Gemini... (~15s)'
        : '💾 Saving new image...';

    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    formData.append('reAnalyze', reAnalyze ? 'true' : 'false');

    try {
        const res = await fetch(`/api/prompts/${editingPromptId}/image`, {
            method: 'PUT',
            body: formData
        });
        const result = await res.json();

        if (res.ok && result.success) {
            statusMsg.textContent = reAnalyze
                ? '✅ Image replaced & prompt re-analyzed!'
                : '✅ Image replaced successfully!';
            statusMsg.style.color = '#22c55e';
            loadPromptsForAdmin();
            setTimeout(closeEditModal, 1500);
        } else {
            throw new Error(result.error || 'Failed to replace image');
        }
    } catch (err) {
        statusMsg.textContent = '❌ Error: ' + err.message;
        statusMsg.style.color = '#ef4444';
        submitBtn.disabled = false;
    } finally {
        loadingBox.style.display = 'none';
    }
}

// Load on startup
loadPromptsForAdmin();

