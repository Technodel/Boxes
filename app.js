const STORAGE_KEY = 'technodel_boxes_state';
const API_URL = 'http://localhost:3051/api/data';

// ── Initial State ──
let state = {
    boxes: {},
    history: [],
    totalSold: 0
};

// ── State Management ──
async function loadState() {
    // 1. Try to load from Server first (Authoritative)
    try {
        const response = await fetch(API_URL).catch(() => null);
        if (response && response.ok) {
            const serverData = await response.json();
            if (serverData && serverData.boxes) {
                state = serverData;
                console.log("Loaded from Server");
                renderAll();
                return;
            }
        }
    } catch (e) {
        console.warn("Server load failed, falling back to LocalStorage.");
    }

    // 2. Fallback to LocalStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            state = JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse LocalStorage state", e);
        }
    }
    renderAll();
}

async function saveState() {
    // 1. Save to LocalStorage (Instant local copy)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    // 2. Sync to Server (If available)
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        }).catch(() => null);
    } catch (e) {
        console.warn("Could not sync to server.");
    }

    renderAll();
}

function updateStats() {
    let totalLaptopsNum = 0;
    let totalBoxesNum = Object.keys(state.boxes).length;

    Object.values(state.boxes).forEach(box => {
        totalLaptopsNum += box.length;
    });

    const totalLaptopsEl = document.getElementById('totalLaptops');
    const totalBoxesEl = document.getElementById('totalBoxes');
    const totalSoldEl = document.getElementById('totalSold');
    const boxCountBadgeEl = document.getElementById('boxCountBadge');

    if (totalLaptopsEl) totalLaptopsEl.textContent = totalLaptopsNum;
    if (totalBoxesEl) totalBoxesEl.textContent = totalBoxesNum;
    if (totalSoldEl) totalSoldEl.textContent = state.totalSold;
    if (boxCountBadgeEl) boxCountBadgeEl.textContent = totalBoxesNum;
}

// ── Helpers ──
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function addHistoryEntry(type, data) {
    const entry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        type,
        ...data
    };
    state.history.unshift(entry);
    if (state.history.length > 200) state.history.pop();
}

// ── Core Actions ──

function addBox(name) {
    if (!name.trim()) return;
    if (state.boxes[name]) {
        showToast(`Box "${name}" already exists`, 'error');
        return;
    }
    state.boxes[name] = [];
    addHistoryEntry('ADD_BOX', { box: name.trim() });
    saveState();
    showToast(`Box "${name}" created`, 'success');
}

function deleteBox(name) {
    if (state.boxes[name] && state.boxes[name].length > 0) {
        if (!confirm(`Box "${name}" is not empty. Delete anyway?`)) return;
    } else {
        if (!confirm(`Delete box "${name}"?`)) return;
    }
    delete state.boxes[name];
    saveState();
    showToast(`Box "${name}" deleted`, 'info');
}

function renameBox(oldName, newName) {
    if (!newName || !newName.trim() || oldName === newName) return;
    if (state.boxes[newName]) {
        showToast(`Box "${newName}" already exists`, 'error');
        return;
    }
    state.boxes[newName] = state.boxes[oldName];
    delete state.boxes[oldName];
    saveState();
    showToast(`Box renamed to "${newName}"`, 'success');
}

function addLaptop(name, boxName) {
    if (!name.trim() || !boxName) return;
    if (!state.boxes[boxName]) return;

    const laptop = {
        id: generateId(),
        name: name.trim(),
        number: state.boxes[boxName].length + 1,
        status: 'not_ready',
        addedAt: new Date().toISOString()
    };
    state.boxes[boxName].push(laptop);
    addHistoryEntry('ADD_LAPTOP', { box: boxName, laptop: name.trim() });
    saveState();
    showToast(`Added "${name}" to ${boxName}`, 'success');
}

function addLaptopsBulk(text, boxName) {
    const names = text.split('\n').map(n => n.trim()).filter(n => n);
    if (names.length === 0) return;
    names.forEach(name => {
        state.boxes[boxName].push({
            id: generateId(),
            name: name,
            number: state.boxes[boxName].length + 1,
            status: 'not_ready',
            addedAt: new Date().toISOString()
        });
    });
    addHistoryEntry('ADD_LAPTOP', { box: boxName, laptop: `${names.length} laptops (Bulk)` });
    saveState();
    showToast(`Added ${names.length} laptops to ${boxName}`, 'success');
}

function renameLaptop(boxName, id, newName) {
    if (!newName || !newName.trim()) return;
    const box = state.boxes[boxName];
    if (box) {
        const laptop = box.find(l => l.id === id);
        if (laptop) {
            laptop.name = newName.trim();
            saveState();
            showToast("Laptop renamed", "success");
        }
    }
}

function toggleLaptopStatus(boxName, id) {
    const box = state.boxes[boxName];
    if (box) {
        const laptop = box.find(l => l.id === id);
        if (laptop) {
            const oldStatus = laptop.status || 'not_ready';
            laptop.status = (oldStatus === 'ready') ? 'not_ready' : 'ready';
            addHistoryEntry('STATUS_CHANGE', {
                box: boxName,
                laptop: laptop.name,
                oldStatus,
                newStatus: laptop.status
            });
            saveState();
        }
    }
}

function moveLaptop(id, sourceBoxName, targetBoxName, comment = "") {
    if (sourceBoxName === targetBoxName) return;
    const sourceBox = state.boxes[sourceBoxName];
    const targetBox = state.boxes[targetBoxName];
    if (!sourceBox || !targetBox) return;
    const index = sourceBox.findIndex(l => l.id === id);
    if (index === -1) return;
    const [laptop] = sourceBox.splice(index, 1);
    sourceBox.forEach((l, i) => l.number = i + 1);
    laptop.number = targetBox.length + 1;
    targetBox.push(laptop);
    addHistoryEntry('MOVE', { from: sourceBoxName, to: targetBoxName, laptop: laptop.name, comment });
    saveState();
    showToast(`Moved ${laptop.name} to ${targetBoxName}`, 'success');
}

function reorderLaptop(boxName, draggedId, targetId) {
    const box = state.boxes[boxName];
    const draggedIdx = box.findIndex(l => l.id === draggedId);
    const targetIdx = box.findIndex(l => l.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;
    const [laptop] = box.splice(draggedIdx, 1);
    box.splice(targetIdx, 0, laptop);
    box.forEach((l, i) => l.number = i + 1);
    saveState();
}

function markSold(boxName, id, comment = "") {
    const box = state.boxes[boxName];
    if (!box) return;
    const index = box.findIndex(l => l.id === id);
    if (index === -1) return;
    const [laptop] = box.splice(index, 1);
    state.totalSold++;
    box.forEach((l, i) => l.number = i + 1);
    addHistoryEntry('SOLD', { box: boxName, laptop: laptop.name, comment });
    saveState();
    showToast(`"${laptop.name}" marked as SOLD`, 'success');
}

function clearHistory() {
    if (!confirm("Are you sure?")) return;
    state.history = [];
    saveState();
}

function clearHistoryOlderThan(months) {
    if (!confirm(`Clear entries older than ${months} months?`)) return;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    state.history = state.history.filter(e => new Date(e.timestamp) > cutoff);
    saveState();
}

// ── Rendering ──

function renderAll() {
    updateStats();
    renderSidebar();
    renderStockGrid();
    renderHistory();
    updateBoxSelects();
}

function updateBoxSelects() {
    const selects = [
        document.getElementById('boxSelect'),
        document.getElementById('moveTargetBox'),
        document.getElementById('bulkBoxSelect')
    ];
    const boxNames = Object.keys(state.boxes).sort();
    selects.forEach(select => {
        if (!select) return;
        const current = select.value;
        select.innerHTML = select.id === 'boxSelect' ? '<option value="" disabled selected>Choose a box…</option>' : '';
        boxNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = name;
            select.appendChild(opt);
        });
        if (boxNames.includes(current)) select.value = current;
    });
}

function renderSidebar() {
    const boxList = document.getElementById('boxList');
    if (!boxList) return;
    boxList.innerHTML = '';
    Object.keys(state.boxes).sort().forEach(name => {
        const li = document.createElement('li');
        li.className = 'box-list-item';
        li.innerHTML = `
            <span class="box-icon">📦</span>
            <span class="box-name">${name}</span>
            <span class="box-list-count">${state.boxes[name].length}</span>
            <div class="box-list-actions">
              <button class="edit-box-btn" onclick="event.stopPropagation(); promptRenameBox('${name}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="delete-box-btn" onclick="event.stopPropagation(); deleteBox('${name}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
        `;
        li.onclick = () => {
            const card = document.querySelector(".box-card[data-name='" + name + "']");
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('expanded');
                card.style.borderColor = 'var(--accent)';
                setTimeout(() => card.style.borderColor = '', 1000);
            }
        };
        boxList.appendChild(li);
    });
}

function renderStockGrid() {
    const grid = document.getElementById('stockGrid');
    const empty = document.getElementById('emptyState');
    if (!grid) return;
    const boxNames = Object.keys(state.boxes).sort();

    if (boxNames.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.classList.add('visible');
        return;
    }
    if (empty) empty.classList.remove('visible');

    const expandedNames = Array.from(document.querySelectorAll('.box-card.expanded')).map(c => c.dataset.name);
    grid.innerHTML = '';
    boxNames.forEach(name => {
        const laptops = state.boxes[name];
        const card = document.createElement('div');
        card.className = `box-card ${expandedNames.includes(name) ? 'expanded' : ''}`;
        card.dataset.name = name;
        card.innerHTML = `
            <div class="box-card-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="box-card-title">
                    <span class="box-emoji">📦</span>
                    <span>${name}</span>
                    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); promptRenameBox('${name}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                </div>
                <div class="box-card-count">
                    <span class="count-num">${laptops.length}</span>
                    <span class="box-card-expand">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </span>
                </div>
            </div>
            <div class="box-card-body">
                <ul class="laptop-list">
                    ${laptops.length > 0 ? laptops.map(l => `
                        <li class="laptop-item" draggable="true" data-id="${l.id}" data-box="${name}" data-name="${l.name}">
                            <span class="laptop-number">${l.number}</span>
                            <div class="laptop-info-group">
                                <span class="laptop-name" onclick="event.stopPropagation(); window.promptRenameLaptop('${name}', '${l.id}', '${l.name}')">${l.name}</span>
                                <span class="status-tag ${l.status || 'not_ready'}" onclick="event.stopPropagation(); window.toggleLaptopStatus('${name}', '${l.id}')">
                                    ${(l.status || 'not_ready') === 'ready' ? 'Ready' : 'Not Ready'}
                                </span>
                            </div>
                            <div class="laptop-actions">
                                <button class="btn btn-ghost btn-sm" onclick="window.openMoveModal('${l.id}', '${name}', '${l.name}')">Move</button>
                                <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.promptRenameLaptop('${name}', '${l.id}', '${l.name}')">Edit</button>
                                <button class="btn btn-ghost btn-sm btn-sell" onclick="window.openSoldModal('${l.id}', '${name}', '${l.name}')">🏷️ SOLD</button>
                            </div>
                        </li>
                    `).join('') : '<div class="box-card-empty">Empty box</div>'}
                    <li class="laptop-add-direct" onclick="window.promptAddLaptop('${name}')">
                        <span class="add-icon">+</span>
                        <span class="add-text">Add Laptop to ${name}</span>
                    </li>
                </ul>
            </div>
        `;

        card.querySelectorAll('.laptop-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    id: item.dataset.id,
                    sourceBox: item.dataset.box,
                    name: item.dataset.name
                }));
                item.classList.add('dragging');
                document.getElementById('searchResults').classList.add('hidden');
            });
            item.addEventListener('dragend', () => item.classList.remove('dragging'));
            item.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); item.classList.add('drag-target'); });
            item.addEventListener('dragleave', () => item.classList.remove('drag-target'));
            item.addEventListener('drop', (e) => {
                e.preventDefault(); e.stopPropagation(); item.classList.remove('drag-target');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.sourceBox === name && data.id !== item.dataset.id) { reorderLaptop(name, data.id, item.dataset.id); }
                    else if (data.sourceBox !== name) {
                        const comment = prompt(`Move "${data.name}" to "${name}"?`, "");
                        if (comment !== null) moveLaptop(data.id, data.sourceBox, name, comment);
                    }
                } catch (err) { }
            });
        });
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', (e) => {
            if (e.defaultPrevented) return;
            e.preventDefault(); card.classList.remove('drag-over');
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.sourceBox !== name) {
                    const comment = prompt(`Move "${data.name}" to "${name}"?`, "");
                    if (comment !== null) moveLaptop(data.id, data.sourceBox, name, comment);
                }
            } catch (err) { }
        });
        grid.appendChild(card);
    });
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const q = document.getElementById('historySearchInput')?.value.toLowerCase() || '';
    const filtered = state.history.filter(e => {
        if (!q) return true;
        const details = (e.laptop || '') + (e.box || '') + (e.from || '') + (e.to || '');
        return details.toLowerCase().includes(q) || (e.comment || '').toLowerCase().includes(q);
    });
    if (filtered.length === 0) { list.innerHTML = '<div class="box-card-empty">No activity</div>'; return; }
    list.innerHTML = filtered.map(e => {
        const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let details = '';
        if (e.type === 'SOLD') details = `Sold <strong>${e.laptop}</strong> from <strong>${e.box}</strong>`;
        else if (e.type === 'MOVE') details = `Moved <strong>${e.laptop}</strong>: <strong>${e.from}</strong> → <strong>${e.to}</strong>`;
        else if (e.type === 'ADD_BOX') details = `Created box <strong>${e.box}</strong>`;
        else if (e.type === 'ADD_LAPTOP') details = `Added <strong>${e.laptop}</strong> to <strong>${e.box}</strong>`;
        else if (e.type === 'STATUS_CHANGE') details = `Updated <strong>${e.laptop}</strong>: ${e.oldStatus} → ${e.newStatus}`;
        return `
            <div class="history-item ${e.type.toLowerCase()}">
                <div class="history-item-header"><span class="history-type">${e.type}</span><span class="history-time">${time}</span></div>
                <div class="history-details">${details}</div>
                ${e.comment ? `<div class="history-comment">"${e.comment}"</div>` : ''}
            </div>
        `;
    }).join('');
}

function handleSearch(query) {
    const resultsEl = document.getElementById('searchResults');
    if (!query.trim()) { resultsEl.classList.add('hidden'); return; }
    const results = [];
    const q = query.toLowerCase();
    Object.entries(state.boxes).forEach(([boxName, laptops]) => {
        laptops.forEach(laptop => { if (laptop.name.toLowerCase().includes(q)) results.push({ ...laptop, boxName }); });
    });
    resultsEl.classList.remove('hidden');
    if (results.length === 0) { resultsEl.innerHTML = '<div class="search-no-results">No matches</div>'; return; }
    resultsEl.innerHTML = results.map(r => `
        <div class="search-result-item">
            <div class="search-result-info">
                <div class="search-result-title"><span class="search-result-name">${r.name}</span></div>
                <span class="search-result-meta">In ${r.boxName}</span>
            </div>
            <button class="btn btn-sm btn-sold" onclick="window.openSoldModal('${r.id}', '${r.boxName}', '${r.name}')">SOLD</button>
        </div>
    `).join('');
}

// ── Modals ──
let activeLaptop = null;
function openMoveModal(id, box, name) {
    activeLaptop = { id, box, name };
    document.getElementById('moveLaptopInfo').innerHTML = `Moving <strong>${name}</strong> from <strong>${box}</strong>`;
    document.getElementById('moveModal').classList.remove('hidden');
}
function openSoldModal(id, box, name) {
    activeLaptop = { id, box, name };
    document.getElementById('soldLaptopInfo').innerHTML = `Mark <strong>${name}</strong> items in <strong>${box}</strong> as sold?`;
    document.getElementById('soldModal').classList.remove('hidden');
}
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden')); activeLaptop = null; }

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Event Listeners ──
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    // renderAll is called inside loadState after fetch

    document.getElementById('addBoxForm').onsubmit = (e) => { e.preventDefault(); const inp = document.getElementById('boxNameInput'); addBox(inp.value); inp.value = ''; };
    document.getElementById('addLaptopForm').onsubmit = (e) => { e.preventDefault(); const nInp = document.getElementById('laptopNameInput'); const bInp = document.getElementById('boxSelect'); addLaptop(nInp.value, bInp.value); nInp.value = ''; nInp.focus(); };
    document.getElementById('searchInput').oninput = (e) => handleSearch(e.target.value);
    document.getElementById('historySearchInput').oninput = () => renderHistory();
    document.addEventListener('click', (e) => { if (document.getElementById('searchWrapper') && !document.getElementById('searchWrapper').contains(e.target)) document.getElementById('searchResults').classList.add('hidden'); });
    document.getElementById('moveModalClose').onclick = closeModals;
    document.getElementById('moveCancelBtn').onclick = closeModals;
    document.getElementById('soldModalClose').onclick = closeModals;
    document.getElementById('soldCancelBtn').onclick = closeModals;
    document.getElementById('bulkModalClose').onclick = closeModals;
    document.getElementById('bulkCancelBtn').onclick = closeModals;
    document.getElementById('bulkAddBtn').onclick = () => { document.getElementById('bulkInput').value = ''; document.getElementById('bulkModal').classList.remove('hidden'); };

    document.getElementById('moveConfirmBtn').onclick = () => { const target = document.getElementById('moveTargetBox').value; const comment = document.getElementById('moveComment').value; if (activeLaptop && target) { moveLaptop(activeLaptop.id, activeLaptop.box, target, comment); closeModals(); } };
    document.getElementById('soldConfirmBtn').onclick = () => { const comment = document.getElementById('soldComment').value; if (activeLaptop) { markSold(activeLaptop.box, activeLaptop.id, comment); closeModals(); } };
    document.getElementById('bulkConfirmBtn').onclick = () => { const text = document.getElementById('bulkInput').value; const box = document.getElementById('bulkBoxSelect').value; if (text && box) { addLaptopsBulk(text, box); closeModals(); } };
    document.getElementById('clearHistoryBtn').onclick = clearHistory;
    document.getElementById('clearOlderBtn').onclick = () => { const m = parseInt(document.getElementById('clearOlderSelect').value); clearHistoryOlderThan(m); };
    document.getElementById('btnGridView').onclick = () => { document.getElementById('stockGrid').classList.remove('list-view'); document.getElementById('btnGridView').classList.add('active'); document.getElementById('btnListView').classList.remove('active'); };
    document.getElementById('btnListView').onclick = () => { document.getElementById('stockGrid').classList.add('list-view'); document.getElementById('btnListView').classList.add('active'); document.getElementById('btnGridView').classList.remove('active'); };

    document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'k') { e.preventDefault(); document.getElementById('searchInput').focus(); } if (e.key === 'Escape') { closeModals(); document.getElementById('searchResults').classList.add('hidden'); } });
});

function promptAddLaptop(boxName) { const name = prompt(`Add block to ${boxName}:`, ""); if (name && name.trim()) addLaptop(name, boxName); }

// Global exports
window.deleteBox = deleteBox;
window.markSold = markSold;
window.openMoveModal = openMoveModal;
window.openSoldModal = openSoldModal;
window.toggleLaptopStatus = toggleLaptopStatus;
window.promptAddLaptop = promptAddLaptop;
window.promptRenameBox = (oldName) => { const newName = prompt(`Rename box "${oldName}" to:`, oldName); if (newName) renameBox(oldName, newName); };
window.promptRenameLaptop = (boxName, id, oldName) => { const newName = prompt(`Rename laptop "${oldName}" to:`, oldName); if (newName) renameLaptop(boxName, id, newName); };
