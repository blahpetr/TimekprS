const API_BASE = window.location.origin; // or "http://127.0.0.1:8000" for local testing

const state = {
  username: "admin",
  password: "admin",
  currentFile: "timekpr.kuba.conf",
};

const els = {
  loginPanel: document.getElementById("login-panel"),
  editorPanel: document.getElementById("editor-panel"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("login-btn"),
  loginStatus: document.getElementById("login-status"),
  fileSelect: document.getElementById("file-select"),
  loadBtn: document.getElementById("load-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  saveBtn: document.getElementById("save-btn"),
  reloadBtn: document.getElementById("reload-btn"),
  saveStatus: document.getElementById("save-status"),
};

function setStatus(el, message, isError = false, isSuccess = false) {
  el.textContent = message;
  el.className = "status";
  if (isError) el.classList.add("error");
  if (isSuccess) el.classList.add("success");
}

function getBasicAuthHeader() {
  const username = state.username || els.username.value;
  const password = state.password || els.password.value;

  return {
    Authorization:
      "Basic " + btoa(unescape(encodeURIComponent(`${username}:${password}`))),
  };
}

async function authenticate() {
  state.username = els.username.value;
  state.password = els.password.value;

  try {
    const res = await fetch(`${API_BASE}/api/timekpr/authenticate`, {
      headers: getBasicAuthHeader(),
    });

    const data = await res.json();

    if (res.ok && data.Authorised === true) {
      setStatus(els.loginStatus, "Authentication successful.", false, true);
      els.loginPanel.classList.add("hidden");
      els.editorPanel.classList.remove("hidden");
      state.currentFile = els.fileSelect.value;
      await loadCurrentFile();
    } else {
      setStatus(els.loginStatus, "Invalid username or password.", true, false);
    }
  } catch (err) {
    setStatus(
      els.loginStatus,
      "Unable to connect to the API. Check the server URL.",
      true,
      false
    );
  }
}

async function loadCurrentFile() {
  const fileName = els.fileSelect.value;
  state.currentFile = fileName;

  try {
    const res = await fetch(
      `${API_BASE}/api/timekpr/file?item=${encodeURIComponent(fileName)}&file=false`,
      {
        headers: getBasicAuthHeader(),
      }
    );

    if (!res.ok) {
      throw new Error("Failed to load file");
    }

    const data = await res.json();

    fillForm(data);
    setStatus(els.saveStatus, `${fileName} loaded.`, false, true);
  } catch (err) {
    setStatus(els.saveStatus, "Could not load the selected config file.", true, false);
  }
}

function fillForm(data) {
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  days.forEach((day) => {
    const value = Array.isArray(data[day]) ? data[day].join(",") : "";
    document.getElementById(day).value = value;
  });

  const week = Array.isArray(data.week) ? data.week.join(",") : "";
  document.getElementById("week").value = week;
}

function parseList(value) {
  if (!value || value.trim() === "") return [];
  return value
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .map((v) => Number(v));
}

async function saveCurrentFile() {
  const payload = {
    name: state.currentFile,
    monday: parseList(document.getElementById("monday").value),
    tuesday: parseList(document.getElementById("tuesday").value),
    wednesday: parseList(document.getElementById("wednesday").value),
    thursday: parseList(document.getElementById("thursday").value),
    friday: parseList(document.getElementById("friday").value),
    saturday: parseList(document.getElementById("saturday").value),
    sunday: parseList(document.getElementById("sunday").value),
    week: parseList(document.getElementById("week").value),
  };

  try {
    const res = await fetch(`${API_BASE}/api/timekpr/file`, {
      method: "PUT",
      headers: {
        ...getBasicAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || "Save failed");
    }

    setStatus(els.saveStatus, "Configuration saved successfully.", false, true);
  } catch (err) {
    setStatus(els.saveStatus, "Save failed. Check values and auth.", true, false);
  }
}

function logout() {
  els.loginPanel.classList.remove("hidden");
  els.editorPanel.classList.add("hidden");
  els.password.value = "";
  setStatus(els.loginStatus, "", false, false);
  setStatus(els.saveStatus, "", false, false);
}

els.loginBtn.addEventListener("click", authenticate);
els.loadBtn.addEventListener("click", loadCurrentFile);
els.reloadBtn.addEventListener("click", loadCurrentFile);
els.logoutBtn.addEventListener("click", logout);
els.saveBtn.addEventListener("click", saveCurrentFile);
els.fileSelect.addEventListener("change", () => {
  state.currentFile = els.fileSelect.value;
});
