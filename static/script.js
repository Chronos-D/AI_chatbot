const chatBox = document.getElementById("chat-box");
const inputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const imageInput = document.getElementById("image-input");
const csvFileInput = document.getElementById("csv-file-input");
const fileNameDisplay = document.getElementById('file-name');
const uploadBtn = document.getElementById('upload-btn');
const uploadOptions = document.getElementById('upload-options');
const uploadOptionBtns = document.querySelectorAll('.upload-option-btn');

let messages = [];

// --- DOM ready ---
document.addEventListener("DOMContentLoaded", () => {
  messages = loadMessages();
  renderAll();
});

// --- Upload popup ---
uploadBtn.addEventListener('click', e => {
  e.stopPropagation();
  uploadOptions.classList.toggle('hidden');
});

document.addEventListener('click', e => {
  if (!uploadOptions.classList.contains('hidden') && e.target !== uploadBtn && !uploadOptions.contains(e.target)) {
    uploadOptions.classList.add('hidden');
  }
});

uploadOptionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setTimeout(() => { uploadOptions.classList.add('hidden'); }, 100);
  });
});

// --- Show selected file ---
function displaySelectedFile(file) {
  fileNameDisplay.innerHTML = ""; 
  const div = document.createElement("div");
  div.classList.add("selected-file");

  // Giới hạn tên file
  let fileName = file.name;
  if (fileName.length > 30) {
    const extIndex = fileName.lastIndexOf(".");
    const ext = extIndex !== -1 ? fileName.slice(extIndex) : "";
    const namePart = fileName.slice(0, 27 - ext.length);
    fileName = namePart + "…" + ext;
  }

  const span = document.createElement("span");
  span.textContent = fileName;

  const removeBtn = document.createElement("button");
  removeBtn.classList.add("remove-file");
  removeBtn.innerHTML = "x";

  removeBtn.addEventListener("click", () => {
    fileNameDisplay.innerHTML = "";
    if (file.type.startsWith("image/")) imageInput.value = "";
    else if (file.name.endsWith(".csv")) csvFileInput.value = "";
  });

  div.appendChild(span);
  div.appendChild(removeBtn);
  fileNameDisplay.appendChild(div);
}


imageInput.addEventListener("change", () => {
  if (imageInput.files.length > 0) {
    uploadOptions.classList.add("hidden");
    displaySelectedFile(imageInput.files[0]);
  }
});

csvFileInput.addEventListener("change", () => {
  if (csvFileInput.files.length > 0) {
    uploadOptions.classList.add("hidden");
    displaySelectedFile(csvFileInput.files[0]);
  }
});

// --- Message handling ---
function loadMessages() {
  try {
    const raw = localStorage.getItem("ai_chat_history_v1");
    const arr = raw ? JSON.parse(raw) : [];
    return arr.map(m => ({
      role: m.role || "assistant",
      text: m.text || "",
      ts: m.ts || new Date().toISOString(),
      imageUrl: m.imageUrl || null,
      fileName: m.fileName || null,
      error: m.error || false
    }));
  } catch (e) { return []; }
}

function saveMessages() { localStorage.setItem("ai_chat_history_v1", JSON.stringify(messages)); }

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function renderAll() {
  chatBox.innerHTML = "";
  messages.forEach(m => renderMessage(m));
  chatBox.scrollTop = chatBox.scrollHeight;
}

function renderMessage(m) {
  const div = document.createElement("div");
  div.classList.add("message", m.role === "user" ? "user" : "assistant");

  const meta = document.createElement("div");
  meta.classList.add("meta");
  meta.textContent = `${m.role === "user" ? "You" : "Assistant"} • ${formatTime(m.ts)}`;

  const body = document.createElement("div");
  body.classList.add("body");
  if (m.error) {
    body.textContent = m.text;
    div.classList.add("system-error");
  } else {
    body.innerHTML = (typeof marked !== "undefined") ? marked.parse(m.text || "") : m.text || "";
  }

  div.appendChild(meta);
  div.appendChild(body);

  if (m.imageUrl) {
    const img = document.createElement("img");
    img.src = m.imageUrl;
    img.classList.add("chat-image");
    // Giới hạn kích thước
    img.style.maxWidth = "320px";  
    img.style.maxHeight = "400px"; 
    img.style.width = "auto";
    img.style.height = "auto";
    div.appendChild(img);
  }

  if (m.fileName) {
    const fileDiv = document.createElement("div");
    fileDiv.classList.add("uploaded-file");
    fileDiv.textContent = m.fileName;
    div.appendChild(fileDiv);
  }

  chatBox.appendChild(div);
}

// --- push message ---
function pushMessage(role, text, imageUrl = null, fileName = null, error = false) {
  const m = { role, text, ts: new Date().toISOString() };
  if (imageUrl) m.imageUrl = imageUrl;
  if (fileName) m.fileName = fileName;
  if (error) m.error = true;
  messages.push(m);
  saveMessages();
  renderAll();
  return m;
}

// --- send message ---
async function sendMessage() {
  const text = inputEl.value.trim();
  const imgFile = imageInput.files[0];
  const csvFile = csvFileInput.files[0];

  if (!text && !imgFile && !csvFile) return;

  fileNameDisplay.innerHTML = "";
  imageInput.value = "";
  csvFileInput.value = "";
  inputEl.value = "";

  if (imgFile) pushMessage("user", text, URL.createObjectURL(imgFile));
  else if (csvFile) pushMessage("user", text, null, csvFile.name);
  else pushMessage("user", text);

  setLoading(true);

  try {
    let res, data;
    if (imgFile || csvFile) {
      const fd = new FormData();
      fd.append("message", text);
      if (imgFile) fd.append("image", imgFile);
      if (csvFile) fd.append("csv", csvFile);
      res = await fetch("/upload-mixed", { method: "POST", body: fd });
    } else {
      res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: messages })
      });
    }

    data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");
    if (data.reply) pushMessage("assistant", data.reply.text || data.reply);

  } catch (err) {
    messages = messages.slice(0, -1);
    pushMessage("assistant", `Lỗi: ${err.message}`, null, null, true);
  } finally {
    setLoading(false);
  }
}

// --- loading ---
function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  inputEl.disabled = isLoading;
  sendBtn.innerHTML = isLoading ? '<span class="spinner"></span>' : "Gửi";
}

// --- event listeners ---
sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    if (e.shiftKey) {
      const start = inputEl.selectionStart;
      const end = inputEl.selectionEnd;
      inputEl.value = inputEl.value.substring(0, start) + "\n" + inputEl.value.substring(end);
      inputEl.selectionStart = inputEl.selectionEnd = start + 1;
      e.preventDefault();
    } else {
      sendMessage();
      e.preventDefault();
    }
  }
});