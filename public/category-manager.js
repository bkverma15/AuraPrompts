// ──────────────────────────────────────────────────────────
// CATEGORY MANAGER
// Handles: load, add, rename, delete categories
// Also populates the category dropdowns in Magic & Image tabs
// ──────────────────────────────────────────────────────────

let allCategories = [];

// Load categories from API and populate everywhere
async function loadCategories() {
    try {
        const res = await fetch('/api/categories');
        allCategories = await res.json();
        renderCategoryList();
        populateCategoryDropdowns();
    } catch (e) {
        console.error('Failed to load categories:', e);
    }
}

// Render the category list in the Categories tab
function renderCategoryList() {
    const list = document.getElementById('cats-list');
    if (!list) return;

    if (allCategories.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No categories yet. Add one above!</p>';
        return;
    }

    list.innerHTML = '';
    allCategories.forEach((cat, idx) => {
        const row = document.createElement('div');
        row.setAttribute('data-cat-name', cat);
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 0.8rem;
            padding: 0.85rem 1rem;
            background: var(--bg-color);
            border: 1px solid var(--border);
            border-radius: 10px;
            transition: border-color 0.2s;
        `;

        row.innerHTML = `
            <!-- Icon + Name (view mode) -->
            <span style="font-size:1.1rem;">📂</span>
            <span class="cat-name-display" style="flex:1;font-weight:600;font-size:0.95rem;">${cat}</span>

            <!-- Edit input (hidden by default) -->
            <input class="cat-rename-input" type="text" value="${cat}"
                style="display:none;flex:1;padding:0.4rem 0.7rem;background:var(--bg-secondary);border:1px solid var(--primary);border-radius:7px;color:var(--text-main);font-family:inherit;font-size:0.9rem;outline:none;"
                onkeydown="handleRenameKey(event, '${cat}', this)">

            <!-- Prompt count badge -->
            <span class="cat-count-badge" style="font-size:0.75rem;color:var(--text-muted);background:var(--bg-secondary);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:99px;flex-shrink:0;">...</span>

            <!-- Action buttons -->
            <div style="display:flex;gap:0.4rem;flex-shrink:0;">
                <button class="cat-edit-btn"
                    onclick="startRename(this, '${cat}')"
                    style="background:#a855f7;color:white;border:none;padding:0.4rem 0.75rem;border-radius:7px;cursor:pointer;font-size:0.8rem;font-weight:700;transition:opacity 0.2s;">
                    ✏️ Rename
                </button>
                <button class="cat-save-btn"
                    onclick="saveRename('${cat}', this)"
                    style="display:none;background:#22c55e;color:white;border:none;padding:0.4rem 0.75rem;border-radius:7px;cursor:pointer;font-size:0.8rem;font-weight:700;">
                    ✅ Save
                </button>
                <button class="cat-cancel-btn"
                    onclick="cancelRename(this, '${cat}')"
                    style="display:none;background:#64748b;color:white;border:none;padding:0.4rem 0.75rem;border-radius:7px;cursor:pointer;font-size:0.8rem;font-weight:700;">
                    ✕
                </button>
                <button
                    onclick="deleteCategory('${cat}', this)"
                    style="background:#ef4444;color:white;border:none;padding:0.4rem 0.75rem;border-radius:7px;cursor:pointer;font-size:0.8rem;font-weight:700;transition:opacity 0.2s;">
                    🗑️
                </button>
            </div>
        `;
        list.appendChild(row);
    });

    // Fetch prompt counts
    fetchCategoryCounts();
}

// Fetch prompt counts per category
async function fetchCategoryCounts() {
    try {
        const res = await fetch('/api/prompts');
        const prompts = await res.json();
        const counts = {};
        prompts.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });

        document.querySelectorAll('[data-cat-name]').forEach(row => {
            const cat = row.getAttribute('data-cat-name');
            const badge = row.querySelector('.cat-count-badge');
            if (badge) badge.textContent = `${counts[cat] || 0} prompts`;
        });
    } catch(e) {}
}

// Populate category dropdowns in Magic AI & Image Analyzer
function populateCategoryDropdowns() {
    const selects = [
        document.getElementById('magic-category-override'),
        document.getElementById('image-category-override')
    ];
    selects.forEach(sel => {
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">🤖 Let AI decide</option>';
        allCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            if (cat === current) opt.selected = true;
            sel.appendChild(opt);
        });
    });
}

// ── Add category ──
async function addCategory() {
    const input = document.getElementById('new-cat-input');
    const statusMsg = document.getElementById('cats-status');
    const name = input.value.trim();
    if (!name) {
        showCatStatus('❌ Please enter a category name.', false);
        return;
    }

    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const result = await res.json();
        if (res.ok && result.success) {
            allCategories = result.categories;
            renderCategoryList();
            populateCategoryDropdowns();
            input.value = '';
            showCatStatus(`✅ Category "${name}" added!`, true);
        } else {
            showCatStatus('❌ ' + (result.error || 'Failed to add'), false);
        }
    } catch(e) {
        showCatStatus('❌ Error: ' + e.message, false);
    }
}

// ── Rename: start edit mode ──
function startRename(btn, catName) {
    const row = btn.closest('[data-cat-name]');
    row.querySelector('.cat-name-display').style.display = 'none';
    row.querySelector('.cat-rename-input').style.display = 'block';
    row.querySelector('.cat-rename-input').focus();
    row.querySelector('.cat-edit-btn').style.display = 'none';
    row.querySelector('.cat-save-btn').style.display = 'block';
    row.querySelector('.cat-cancel-btn').style.display = 'block';
}

// ── Rename: cancel ──
function cancelRename(btn, catName) {
    const row = btn.closest('[data-cat-name]');
    row.querySelector('.cat-rename-input').value = catName;
    row.querySelector('.cat-name-display').style.display = 'block';
    row.querySelector('.cat-rename-input').style.display = 'none';
    row.querySelector('.cat-edit-btn').style.display = 'block';
    row.querySelector('.cat-save-btn').style.display = 'none';
    row.querySelector('.cat-cancel-btn').style.display = 'none';
}

// ── Rename: keyboard handler ──
function handleRenameKey(event, catName, input) {
    if (event.key === 'Enter') {
        const saveBtn = input.closest('[data-cat-name]').querySelector('.cat-save-btn');
        saveRename(catName, saveBtn);
    } else if (event.key === 'Escape') {
        cancelRename(input.closest('[data-cat-name]').querySelector('.cat-cancel-btn'), catName);
    }
}

// ── Rename: save ──
async function saveRename(oldName, btn) {
    const row = btn.closest('[data-cat-name]');
    const newName = row.querySelector('.cat-rename-input').value.trim();
    if (!newName) { showCatStatus('❌ Name cannot be empty.', false); return; }
    if (newName === oldName) { cancelRename(row.querySelector('.cat-cancel-btn'), oldName); return; }

    btn.textContent = '...';
    btn.disabled = true;

    try {
        const res = await fetch(`/api/categories/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
        });
        const result = await res.json();
        if (res.ok && result.success) {
            allCategories = result.categories;
            showCatStatus(`✅ Renamed "${oldName}" → "${newName}" (all prompts updated)`, true);
            renderCategoryList();
            populateCategoryDropdowns();
        } else {
            showCatStatus('❌ ' + (result.error || 'Rename failed'), false);
            btn.textContent = '✅ Save';
            btn.disabled = false;
        }
    } catch(e) {
        showCatStatus('❌ Error: ' + e.message, false);
        btn.textContent = '✅ Save';
        btn.disabled = false;
    }
}

// ── Delete category ──
async function deleteCategory(name, btn) {
    if (!confirm(`Delete category "${name}"?\n\nAll prompts in this category will be marked as "Uncategorized".`)) return;

    btn.textContent = '...';
    btn.disabled = true;

    try {
        const res = await fetch(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const result = await res.json();
        if (res.ok && result.success) {
            allCategories = result.categories;
            showCatStatus(`✅ Category "${name}" deleted.`, true);
            renderCategoryList();
            populateCategoryDropdowns();
        } else {
            showCatStatus('❌ ' + (result.error || 'Delete failed'), false);
            btn.textContent = '🗑️';
            btn.disabled = false;
        }
    } catch(e) {
        showCatStatus('❌ Error: ' + e.message, false);
        btn.textContent = '🗑️';
        btn.disabled = false;
    }
}

// ── Status message helper ──
function showCatStatus(msg, success) {
    const el = document.getElementById('cats-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = success ? '#22c55e' : '#ef4444';
    setTimeout(() => { el.textContent = ''; }, 4000);
}

// Initialize on page load
loadCategories();
