// ── Mobile menu ──
const menuBtn = document.getElementById('mobile-menu-btn');
const navLinks = document.getElementById('nav-links');
if (menuBtn) {
    menuBtn.addEventListener('click', () => navLinks.classList.toggle('active'));
}

// ── Mega Menu & Dynamic Categories ──
async function populateMegaMenu() {
    try {
        const res = await fetch('/api/categories');
        const categories = await res.json();
        
        // 1. Mega Menu
        const megaMenu = document.getElementById('mega-menu-content');
        if (megaMenu) {
            megaMenu.innerHTML = categories.map(c => 
                `<a href="index.html?category=${encodeURIComponent(c)}" class="dropdown-item">${c}</a>`
            ).join('');
        }

        // 2. Sidebar & Tags
        const sidebar = document.getElementById('sidebar-cats-list');
        const filterTags = document.getElementById('filter-tags');
        
        const emojiMap = {
            'Girl Prompt': '👧', 'Boys Prompt': '👦', 'Birthday Prompt': '🎂',
            'Cinematic': '🎬', 'Portraits': '🎭', 'Trending Prompts': '🔥',
            '3D': '🧊', 'Animal': '🦁', 'Architecture': '🏛️', 'Cartoon': '🎨',
            'Food': '🍔', 'Gaming': '🎮', 'Logo': '✨', 'Nature': '🌿'
        };
        const getEmoji = (name) => emojiMap[name] || '📁';

        if (sidebar && filterTags) {
            let sidebarHTML = '<li class="sidebar-cat active-cat" data-cat="All">🌟 All Prompts</li>';
            let tagsHTML = '<span class="tag active-tag" data-cat="All">🌟 All</span>';
            
            categories.forEach(c => {
                const e = getEmoji(c);
                sidebarHTML += `<li class="sidebar-cat" data-cat="${c}">${e} ${c}</li>`;
                // limit tags to first 12 so top header doesn't get ridiculously huge
                if (tagsHTML.split('<span').length <= 12) {
                    tagsHTML += `<span class="tag" data-cat="${c}">${e} ${c}</span>`;
                }
            });
            
            sidebar.innerHTML = sidebarHTML;
            filterTags.innerHTML = tagsHTML;
            
            // Re-attach listeners for the dynamically added elements
            attachFilterListeners();
        }
    } catch(e) {
        console.error("Failed to load categories:", e);
    }
}
populateMegaMenu();

// ─────────────────────────────────────────────────────
// HOME PAGE LOGIC
// ─────────────────────────────────────────────────────
const mainGrid = document.getElementById('main-grid');

if (mainGrid) {
    let allPrompts = [];
    let currentCat = 'All';
    let currentTag = '';
    let currentSearch = '';

    // Show skeleton loaders while fetching
    function showSkeletons(n = 6) {
        mainGrid.innerHTML = Array(n).fill(0).map(() => `
            <div class="skeleton">
                <div class="skeleton-img"></div>
            </div>
        `).join('');
    }

    // Render filtered cards
    function renderGrid(prompts) {
        const emptyState = document.getElementById('empty-state');
        const gridCount = document.getElementById('grid-count');
        const gridTitle = document.getElementById('grid-title');

        mainGrid.innerHTML = '';

        if (prompts.length === 0) {
            emptyState.style.display = 'block';
            gridCount.textContent = '0 prompts';
            return;
        }
        emptyState.style.display = 'none';
        gridCount.textContent = `${prompts.length} prompt${prompts.length !== 1 ? 's' : ''}`;
        gridTitle.textContent = currentCat === 'All' ? 'All Prompts' : currentCat;

        prompts.forEach(p => {
            const card = document.createElement('a');
            card.className = 'card';
            card.href = `prompt-details.html?id=${p.id}`;
            card.innerHTML = `
                <img src="${p.image}" alt="${p.title}" loading="lazy"
                    onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22><rect width=%22300%22 height=%22300%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2248%22>🖼️</text></svg>'">
                <span class="card-cat-badge">${p.category || 'Prompt'}</span>
                <div class="card-overlay">
                    <div class="card-overlay-title">${p.title}</div>
                    <div class="card-overlay-prompt">${p.prompt || ''}</div>
                    <button class="card-copy-btn" data-prompt="${encodeURIComponent(p.prompt || '')}">📋 Copy Prompt</button>
                </div>
            `;
            mainGrid.appendChild(card);
        });

        // Copy buttons (stop propagation so card link doesn't fire)
        document.querySelectorAll('.card-copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = decodeURIComponent(btn.dataset.prompt);
                navigator.clipboard.writeText(text).then(() => {
                    const orig = btn.textContent;
                    btn.textContent = '✅ Copied!';
                    setTimeout(() => btn.textContent = orig, 2000);
                });
            });
        });
    }

    // Filter logic
    function applyFilter() {
        let filtered = allPrompts;
        if (currentCat !== 'All') filtered = filtered.filter(p => p.category === currentCat);
        if (currentTag) filtered = filtered.filter(p => p.tag === currentTag);
        if (currentSearch.trim()) {
            const q = currentSearch.toLowerCase();
            filtered = filtered.filter(p =>
                (p.title || '').toLowerCase().includes(q) ||
                (p.prompt || '').toLowerCase().includes(q) ||
                (p.category || '').toLowerCase().includes(q)
            );
        }
        renderGrid(filtered);
    }

    // Fetch data
    async function loadPrompts() {
        showSkeletons();
        try {
            const res = await fetch('/api/prompts');
            allPrompts = await res.json();

            // Update stats counter
            const statTotal = document.getElementById('stat-total');
            if (statTotal) {
                let count = 0;
                const target = allPrompts.length;
                const step = Math.max(1, Math.ceil(target / 30));
                const interval = setInterval(() => {
                    count = Math.min(count + step, target);
                    statTotal.textContent = count;
                    if (count >= target) clearInterval(interval);
                }, 40);
            }

            applyFilter();
        } catch (err) {
            mainGrid.innerHTML = '<p style="color:#ef4444; padding:2rem;">Failed to load data. Is the server running?</p>';
        }
    }

    // Attach listeners for dynamic filter clicks
    window.attachFilterListeners = function() {
        // Tag filter clicks
        document.querySelectorAll('.tag[data-cat]').forEach(tag => {
            // Remove old listener if exists to prevent duplicates
            const newTag = tag.cloneNode(true);
            tag.parentNode.replaceChild(newTag, tag);
            
            newTag.addEventListener('click', () => {
                currentCat = newTag.dataset.cat;
                currentTag = ''; // reset tag if using cat
                document.querySelectorAll('.tag[data-cat]').forEach(t => t.classList.remove('active-tag'));
                newTag.classList.add('active-tag');
                // Sync sidebar
                document.querySelectorAll('.sidebar-cat').forEach(c => {
                    c.classList.toggle('active-cat', c.dataset.cat === currentCat);
                });
                applyFilter();
            });
        });

        // Sidebar category clicks
        document.querySelectorAll('.sidebar-cat').forEach(cat => {
            const newCat = cat.cloneNode(true);
            cat.parentNode.replaceChild(newCat, cat);
            
            newCat.addEventListener('click', () => {
                currentCat = newCat.dataset.cat;
                currentTag = ''; // reset tag if using cat
                document.querySelectorAll('.sidebar-cat').forEach(c => c.classList.remove('active-cat'));
                newCat.classList.add('active-cat');
                // Sync hero tags
                document.querySelectorAll('.tag[data-cat]').forEach(t => {
                    t.classList.toggle('active-tag', t.dataset.cat === currentCat);
                });
                applyFilter();
            });
        });
    };

    // Search
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentSearch = searchInput.value;
            applyFilter();
        });
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') applyFilter();
        });
    }
    if (searchBtn) searchBtn.addEventListener('click', () => {
        currentSearch = searchInput.value;
        applyFilter();
    });

    // Sub-page & Query routing logic
    const path = window.location.pathname.toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('category');
    
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    const h1 = document.querySelector('.hero h1');

    if (catParam) {
        currentCat = catParam;
        if (h1) h1.innerHTML = `${catParam} <span class="gradient-text">Prompts</span>`;
        document.title = `${catParam} - AuraPrompts`;
    } else if (path.includes('trending')) {
        currentTag = 'Trending';
        document.querySelector('.nav-trending')?.classList.add('active');
        if (h1) h1.innerHTML = `Trending <span class="gradient-text">Prompts</span>`;
        document.title = 'Trending - AuraPrompts';
    } else if (path.includes('latest')) {
        currentTag = 'Latest';
        document.querySelector('.nav-latest')?.classList.add('active');
        if (h1) h1.innerHTML = `Latest <span class="gradient-text">Additions</span>`;
        document.title = 'Latest - AuraPrompts';
    } else if (path.includes('portraits')) {
        currentCat = 'Portraits';
        document.querySelector('.nav-portraits')?.classList.add('active');
        if (h1) h1.innerHTML = `Portrait <span class="gradient-text">Prompts</span>`;
        document.title = 'Portraits - AuraPrompts';
    } else if (path.includes('cinematic')) {
        currentCat = 'Cinematic';
        document.querySelector('.nav-cinematic')?.classList.add('active');
        if (h1) h1.innerHTML = `Cinematic <span class="gradient-text">Prompts</span>`;
        document.title = 'Cinematic - AuraPrompts';
    } else {
        document.querySelector('.nav-home')?.classList.add('active');
    }

    // Sync UI to initial state
    if (currentCat !== 'All') {
        document.querySelectorAll('.tag[data-cat]').forEach(t => t.classList.toggle('active-tag', t.dataset.cat === currentCat));
        document.querySelectorAll('.sidebar-cat').forEach(c => c.classList.toggle('active-cat', c.dataset.cat === currentCat));
    }

    loadPrompts();
}

// ─────────────────────────────────────────────────────
// PROMPT DETAILS PAGE
// ─────────────────────────────────────────────────────
const detailsPage = document.querySelector('.screenshot-layout');

if (detailsPage) {
    const params = new URLSearchParams(window.location.search);
    const promptId = params.get('id');

    if (promptId) {
        fetch('/api/prompts')
            .then(res => res.json())
            .then(prompts => {
                const data = prompts.find(p => p.id === promptId);
                if (!data) {
                    detailsPage.innerHTML = '<p>Prompt not found.</p>';
                    return;
                }
                document.title = data.title + ' - AuraPrompts';
                document.getElementById('detail-title').textContent = data.title;
                document.getElementById('detail-image').src = data.image;
                document.getElementById('detail-image').alt = data.title;
                document.getElementById('detail-prompt').textContent = data.prompt;
                document.getElementById('detail-category').textContent = data.category;

                // Buttons
                const promptText = data.prompt;
                const pageUrl = window.location.href;

                document.getElementById('copy-btn').addEventListener('click', () => {
                    navigator.clipboard.writeText(promptText).then(() => {
                        const btn = document.getElementById('copy-btn');
                        const orig = btn.textContent;
                        btn.textContent = '✅ Copied!';
                        setTimeout(() => btn.textContent = orig, 2000);
                    });
                });

                document.getElementById('wa-btn').addEventListener('click', () => {
                    window.open(`https://wa.me/?text=${encodeURIComponent('✨ Check this AI Prompt:\n\n' + promptText + '\n\n🔗 ' + pageUrl)}`, '_blank');
                });

                document.getElementById('tg-btn').addEventListener('click', () => {
                    window.open(`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent('✨ ' + promptText)}`, '_blank');
                });

                document.getElementById('gpt-btn').addEventListener('click', () => {
                    navigator.clipboard.writeText(promptText).then(() => {
                        window.open('https://chat.openai.com/', '_blank');
                    });
                });

                document.getElementById('gemini-btn').addEventListener('click', () => {
                    navigator.clipboard.writeText(promptText).then(() => {
                        window.open('https://gemini.google.com/', '_blank');
                    });
                });

                // Hide/Show prompt toggle
                const hideBtn = document.getElementById('hide-btn');
                const promptPara = document.getElementById('detail-prompt');
                if (hideBtn) {
                    hideBtn.addEventListener('click', () => {
                        const hidden = promptPara.style.display === 'none';
                        promptPara.style.display = hidden ? 'block' : 'none';
                        hideBtn.textContent = hidden ? '🙈 Hide Prompt' : '👁️ Show Prompt';
                    });
                }
            });
    }
}
