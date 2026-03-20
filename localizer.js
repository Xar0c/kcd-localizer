const state = {
    progress:       new Map(),
    files:          new Map(),
    pageLength:     10,
    currentPage:    0,
    currentFile:    "",
    rowCount:       0,
    pakName:        "",
    unsaved:        false,
}

const el = {
    dropArea:       document.getElementById("droparea"),
    exportBtn:      document.getElementById("exportbtn"),
    saveBtn:        document.getElementById("savebtn"),
    fileBrowser:    document.getElementById("filelist"),
    stringBrowser:  document.getElementById("stringbrowser"),
    navControls:    document.getElementById("navcontrols"),
    notesArea:      document.getElementById("notesarea")
}

async function dropHandler(e) {
    const pakfile = e.dataTransfer.files[0];
    if (state.unsaved && !confirm("Current session has unsaved changes, are you sure you want to load another file?")) return;
    reset();

    if (!pakfile) return;

    const ext = pakfile.name.split(".").pop();
    if (!["pak", "zip"].includes(ext)) return;

    // Crappy regex
    state.pakName = pakfile.name.split(".").shift().replace(/_[0-9]+/i, "");

    await loadPak(pakfile);
    //console.log(`Loaded ${pakfile.name} which contains ${state.files.size} files`)
    if (ext == "pak" && checkOutdated() && confirm("This .pak file seems to have outdated translation hints. Would you like to copy new ones from current in-game translations?")) {
        updateHints();
    }

    renderList(); // Redundant but just in case loadFile fails
    loadFile(state.files.keys().next().value);
}

function updateHints() {
    for (const filename of state.files.keys()) {
        const rows = state.files.get(filename).querySelectorAll("Row");
        for (const row of rows) {
            const cells = row.querySelectorAll("Cell");
            cells[1].textContent = cells[2].textContent;
        }
    }
}

function checkOutdated() {
    const xml = state.files.get("text_ui_items.xml");
    const id = "alch_absintium_step_5";
    const row = [...xml.querySelectorAll("Row")].find(row => row.querySelector("Cell")?.textContent == id);
    const cells = row.querySelectorAll("Cell");
    // Using arbitrary know outdated hint. Some non-english revisions may pass this check even if they are outdated.
    return cells[1].textContent == "Distil";
}

function reset() {
    el.fileBrowser.innerHTML = "";
    el.stringBrowser.innerHTML = "";
    el.notesArea.value = el.notesArea.defaultValue;
    state.progress.clear();
    state.files.clear();
    state.currentPage =     0;
    state.currentFile =     "";
    state.rowCount =        0;
    state.pakName =         "";
    state.unsaved =         false;
}

async function loadPak(pakfile) {
    const reader = new zip.ZipReader(new zip.BlobReader(pakfile));
    const entries = await reader.getEntries();

    const files = new Map();
    let progress = new Map();

    for (const entry of entries) {
        const text = await entry.getData(new zip.TextWriter());
        if (entry.filename == "progress.json") {
            progress = new Map(Object.entries(JSON.parse(text)));
        } else {
            files.set(entry.filename, new DOMParser().parseFromString(text, "text/xml"));
        }
    }

    await reader.close();

    state.progress = progress;
    state.files = files;
}

async function save() {
    const writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"), {extendedTimestamp: false});
    const files = state.files;

    for (const [filename, xml] of files.entries()) {
        const str = new XMLSerializer().serializeToString(xml);
        await writer.add(filename, new zip.TextReader(str))
    }
    const progjson = JSON.stringify(Object.fromEntries(state.progress));

    await writer.add("progress.json", new zip.TextReader(progjson));

    const blob = await writer.close();
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const d = new Date();
    a.href = url;
    a.download = `${state.pakName}_${d.getFullYear()}${d.getMonth()}${d.getDate()}${d.getHours()}${d.getMinutes()}`;
    a.click();
    URL.revokeObjectURL(url);
    state.unsaved = false;
}

async function exportSave() {
    const writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"), {extendedTimestamp: false});
    const files = state.files;

    for (const [filename, xml] of files.entries()) {
        const str = new XMLSerializer().serializeToString(xml);
        await writer.add(filename, new zip.TextReader(str))
    }

    const blob = await writer.close();
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${state.pakName}.pak`;
    a.click();
    URL.revokeObjectURL(url);
}

function renderList() {
    el.fileBrowser.innerHTML = "";

    for (const filename of state.files.keys()) {
        const li = document.createElement("li");
        li.textContent = filename;
        li.classList.add("filelistentry");
        li.addEventListener("click", () => loadFile(filename));
        if (filename == state.currentFile) {
            li.classList.add("active");
        }
        el.fileBrowser.appendChild(li);
    }
}

function loadFile(filename) {
    state.currentPage = 0;
    state.currentFile = filename;
    state.rowCount = state.files.get(state.currentFile).querySelectorAll('Row').length;
    renderPage();
    renderNav();
    renderList();
    renderNotes();
}

function getProgress(id) {
    const progress = state.progress.get(id);
    if (progress) return progress;
    return 0;
}

function renderPage() {
    const rows = state.files.get(state.currentFile).querySelectorAll('Row');
    const firstRow = state.currentPage * state.pageLength;

    const lastRow = Math.min(firstRow + state.pageLength, rows.length - 1);

    el.stringBrowser.innerHTML = "";

    for (let i = firstRow; i <= lastRow; i++) {
        el.stringBrowser.appendChild(createCard(rows[i]));
        //console.log(`Created row ${i}`);
    }

    el.stringBrowser.scrollTop = 0;
}

function renderNotes() {
    if (state.progress.get("editornotes")) {
        el.notesArea.value = state.progress.get("editornotes");
    }
}

function renderNav() {
    const backBtn = document.createElement("div");
    backBtn.textContent = "❮";
    backBtn.className = "btn";
    backBtn.addEventListener("click", () => switchPage(state.currentPage - 1));

    const nextBtn = document.createElement("div");
    nextBtn.textContent = "❯";
    nextBtn.className = "btn";
    nextBtn.addEventListener("click", () => switchPage(state.currentPage + 1));

    const pageCount = Math.ceil(state.rowCount/state.pageLength);
    const pageCounter = document.createElement("div");
    pageCounter.innerHTML = `
        <div style="display: flex; flex-direction: row;" id="pagecounter">
            <div id="counter" contenteditable="true">${state.currentPage + 1}</div>
            / ${pageCount}
        </div>
    `
    pageCounter.querySelector("#counter").addEventListener("keydown", e => {
        if (e.key == "Enter") {
            switchPage(e.target.textContent - 1);
        }
    });
    
    el.navControls.innerHTML = "";
    el.navControls.appendChild(backBtn);
    el.navControls.appendChild(pageCounter);
    el.navControls.appendChild(nextBtn);
}

function switchPage(page) {
    const pageCount = Math.ceil(state.rowCount/state.pageLength);
    //console.log(`${page}`)
    if (page >= 0 && page < pageCount) {
        state.currentPage = page;
        renderPage();
        renderNav();
    }
}

function createCard(row) {
    const cells = row.querySelectorAll("Cell");

    const id =          cells[0]?.textContent ?? "";
    const sampleText =  cells[1]?.textContent ?? "";
    const editText =    cells[2]?.textContent ?? "";

    const card = document.createElement("div");
    card.className = "stringcard";
    card.innerHTML = `
        <p class="card-id">${id}</p>
        <div class="card-sampletext">${sampleText}</div>
        <div class="card-edittext" contenteditable="true">${editText}</div>
        <div class="card-rating">
            <div class="rating-btn green"></div>
            <div class="rating-btn blue"></div>
            <div class="rating-btn red"></div>
        </div>
    `;

    card.querySelector(".card-edittext").addEventListener("input", e => {
        cells[2].textContent = e.target.textContent;
        if (getProgress(id) == 0) {
            state.progress.set(id, 1);
        }
        refreshButtons(id, card);
        state.unsaved = true;
    });

    card.querySelector(".green").addEventListener("click", e => {
        state.progress.set(id, 2);
        refreshButtons(id, card);
        state.unsaved = true;
    });

    card.querySelector(".blue").addEventListener("click", e => {
        state.progress.set(id, 1);
        refreshButtons(id, card);
        state.unsaved = true;
    });

    card.querySelector(".red").addEventListener("click", e => {
        state.progress.set(id, 0);
        refreshButtons(id, card);
        state.unsaved = true;
    });

    refreshButtons(id, card);

    return card;
}

function refreshButtons(id, card) {
    const progress = getProgress(id);
    const greenBtn = card.querySelector(".green");
    const blueBtn = card.querySelector(".blue");
    const redBtn = card.querySelector(".red");

    greenBtn.classList.add("inactive");
    blueBtn.classList.add("inactive");
    redBtn.classList.add("inactive");

    if (progress == 2) greenBtn.classList.remove("inactive");
    if (progress == 1) blueBtn.classList.remove("inactive");
    if (progress == 0) redBtn.classList.remove("inactive");
}

// Event listeners and override bs
window.addEventListener("drop", e => e.preventDefault());
window.addEventListener("dragover", e => e.preventDefault());
el.dropArea.addEventListener('drop', e => {
    e.preventDefault()
    el.dropArea.classList.remove('dragging')
    dropHandler(e);
});
el.dropArea.addEventListener('dragover', e => {
    e.preventDefault()
    el.dropArea.classList.add('dragging')
});
el.dropArea.addEventListener('dragleave', e => {
    el.dropArea.classList.remove('dragging')
});

el.saveBtn.addEventListener('click', e => {
    save();
});

el.exportBtn.addEventListener('click', e => {
    exportSave();
});

el.notesArea.addEventListener("input", e => {
    state.progress.set("editornotes", e.target.value);
    state.unsaved = true;
});

window.addEventListener("beforeunload", e => {
    if (state.unsaved) {
        e.preventDefault();
    }
});