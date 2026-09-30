"use strict";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const $ = (id) => document.getElementById(id);
const state = {
  files: [],
  schedule: null,
  original: null,
  authorization: null,
  busy: false,
  loading: false,
  saveAfterLogin: false,
};
const todayIndex = (new Date().getDay() + 6) % 7;
let toastTimer;

function displayName(filename) {
  return filename.replace(/^timekpr\./, "").replace(/\.conf$/, "");
}

function isDirty() {
  return (
    state.schedule &&
    JSON.stringify(state.schedule) !== JSON.stringify(state.original)
  );
}

function showError(message) {
  $("page-error").textContent = message;
  $("page-error").hidden = !message;
}

function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4000);
}

async function request(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  if (!response.ok) {
    let detail;
    try {
      detail = (await response.json()).detail;
    } catch {
      /* Fall back to HTTP status. */
    }
    const error = new Error(
      typeof detail === "string"
        ? detail
        : `Request failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return response;
}

function parseSchedule(data) {
  const schedule = { name: data.name };
  for (const key of [...DAYS, "week"]) {
    if (!Array.isArray(data[key]))
      throw new Error("This file does not contain a valid weekly schedule.");
    const values = data[key]
      .filter((value) => String(value).trim() !== "")
      .map(Number);
    const min = key === "week" ? 1 : 0;
    const max = key === "week" ? 7 : 23;
    if (
      values.some(
        (value) => !Number.isInteger(value) || value < min || value > max,
      )
    ) {
      throw new Error("This file contains invalid schedule hours or weekdays.");
    }
    schedule[key] = [...new Set(values)].sort((a, b) => a - b);
  }
  return schedule;
}

function renderProfiles() {
  const select = $("profile-select");
  select.replaceChildren();
  const placeholder = new Option(
    state.files.length ? "Select a profile" : "No profiles",
    "",
  );
  placeholder.disabled = true;
  select.append(placeholder);
  for (const filename of state.files) {
    select.append(new Option(displayName(filename), filename));
  }
  select.value = state.schedule?.name || "";
  select.disabled = !state.files.length || state.busy || state.loading;
}

function renderGrid(focusId) {
  const schedule = state.schedule;
  if (!schedule) return;
  const grid = $("schedule-grid");
  grid.replaceChildren();
  const labels = document.createElement("div");
  labels.className = "grid-labels";
  for (const [index, label] of [
    "DAY",
    ...Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")),
    "HRS",
  ].entries()) {
    const span = document.createElement("span");
    span.textContent = label;
    if (index === 0) span.className = "day-label";
    if (index === 25) span.className = "total-label";
    labels.append(span);
  }
  grid.append(labels);

  DAYS.forEach((day, index) => {
    const enabled = schedule.week.includes(index + 1);
    const fullDay = day.charAt(0).toUpperCase() + day.slice(1);
    const row = document.createElement("div");
    row.className = `day-row${enabled ? "" : " day-off"}`;
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", fullDay);
    const heading = document.createElement("div");
    heading.className = "day-heading";
    const toggle = document.createElement("button");
    toggle.className = "day-switch";
    toggle.id = `toggle-${day}`;
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", `${fullDay} enabled`);
    toggle.setAttribute("aria-checked", String(enabled));
    toggle.disabled = state.busy || state.loading;
    toggle.addEventListener("click", () => {
      schedule.week = enabled
        ? schedule.week.filter((value) => value !== index + 1)
        : [...schedule.week, index + 1].sort((a, b) => a - b);
      changed(toggle.id);
    });
    const dayLabel = document.createElement("span");
    dayLabel.textContent = fullDay.slice(0, 3);
    heading.append(toggle, dayLabel);
    row.append(heading);
    for (let hour = 0; hour < 24; hour++) {
      const allowed = schedule[day].includes(hour);
      const cell = document.createElement("button");
      const time = `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`;
      cell.className = `hour-cell${allowed ? " allowed" : ""}`;
      cell.id = `hour-${day}-${hour}`;
      cell.setAttribute("aria-label", `${fullDay} ${time}`);
      cell.setAttribute("aria-pressed", String(allowed));
      cell.title = `${fullDay}, ${time}: ${enabled ? (allowed ? "allowed" : "unavailable") : "day disabled"}`;
      cell.disabled = !enabled || state.busy || state.loading;
      cell.addEventListener("click", () => {
        schedule[day] = allowed
          ? schedule[day].filter((value) => value !== hour)
          : [...schedule[day], hour].sort((a, b) => a - b);
        changed(cell.id);
      });
      row.append(cell);
    }
    const total = document.createElement("span");
    total.className = "day-total";
    total.textContent = enabled ? `${schedule[day].length}h` : "Off";
    row.append(total);
    grid.append(row);
  });
  if (focusId) $(focusId)?.focus({ preventScroll: true });
}

function renderSummary() {
  const schedule = state.schedule;
  if (!schedule) return;
  $("weekly-hours").textContent = DAYS.reduce(
    (sum, day, index) =>
      sum + (schedule.week.includes(index + 1) ? schedule[day].length : 0),
    0,
  );
  $("enabled-days").textContent = schedule.week.length;
  $("today-hours").textContent = schedule.week.includes(todayIndex + 1)
    ? schedule[DAYS[todayIndex]].length
    : 0;
}

function renderSaveStatus(message, failed = false) {
  const dirty = isDirty();
  const status = $("save-status");
  status.className = failed ? "failed" : dirty ? "dirty" : "";
  status.textContent =
    message || (dirty ? "Unsaved changes" : "All changes saved");
  $("save-button").disabled = !dirty || state.busy || state.loading;
  $("discard-button").disabled = !dirty || state.busy || state.loading;
  $("copy-weekdays").disabled = state.busy || state.loading;
}

function changed(focusId) {
  showError("");
  renderGrid(focusId);
  renderSummary();
  renderSaveStatus();
}

async function selectProfile(filename, force = false) {
  if (
    state.busy ||
    state.loading ||
    (!force && state.schedule?.name === filename)
  )
    return;
  if (isDirty() && !window.confirm("Discard your unsaved schedule changes?")) {
    renderProfiles();
    return;
  }
  state.loading = true;
  renderProfiles();
  renderGrid();
  renderSaveStatus("Loading schedule…");
  showError("");
  try {
    const response = await request(
      `/api/timekpr/file?item=${encodeURIComponent(filename)}&file=false`,
    );
    const schedule = parseSchedule(await response.json());
    state.schedule = schedule;
    state.original = structuredClone(schedule);
    $("download-link").href =
      `/api/timekpr/file?item=${encodeURIComponent(filename)}&file=true`;
    $("empty-state").hidden = true;
    $("dashboard").hidden = false;
  } catch (error) {
    showError(`Could not load ${filename}. ${error.message}`);
  } finally {
    state.loading = false;
    renderProfiles();
    renderGrid();
    renderSummary();
    renderSaveStatus();
  }
}

async function loadProfiles() {
  if (state.busy || state.loading) return;
  if (
    isDirty() &&
    !window.confirm("Refresh profiles and discard your unsaved changes?")
  )
    return;
  state.loading = true;
  renderProfiles();
  renderGrid();
  renderSaveStatus("Refreshing profiles…");
  $("refresh-profiles").disabled = true;
  $("empty-refresh").disabled = true;
  showError("");
  try {
    const response = await request("/api/timekpr/files");
    const data = await response.json();
    if (
      !Array.isArray(data.files) ||
      data.files.some((file) => typeof file !== "string")
    )
      throw new Error("Invalid profile list received.");
    state.files = data.files;
    const filename = state.files.includes(state.schedule?.name)
      ? state.schedule.name
      : state.files[0];
    state.schedule = null;
    state.original = null;
    $("dashboard").hidden = true;
    $("empty-state").hidden = Boolean(filename);
    state.loading = false;
    renderProfiles();
    if (filename) await selectProfile(filename);
  } catch (error) {
    showError(
      `Could not connect to TimekprS. ${error.message} Try refreshing profiles.`,
    );
    if (!state.schedule) {
      $("empty-state").hidden = false;
      renderProfiles();
    }
  } finally {
    state.loading = false;
    renderProfiles();
    renderGrid();
    renderSaveStatus();
    $("refresh-profiles").disabled = false;
    $("empty-refresh").disabled = false;
  }
}

function openLogin(saveAfterLogin = false) {
  state.saveAfterLogin = saveAfterLogin;
  $("login-error").hidden = true;
  $("login-dialog").showModal();
  $("username").focus();
}

function renderAuth() {
  const signedIn = Boolean(state.authorization);
  $("auth-status").textContent = signedIn ? "Signed in" : "";
  $("auth-button").textContent = signedIn ? "Sign out" : "Sign in";
}

async function saveSchedule() {
  if (!isDirty() || state.busy || state.loading) return;
  if (!state.authorization) {
    openLogin(true);
    return;
  }
  state.busy = true;
  showError("");
  renderGrid();
  renderProfiles();
  renderSaveStatus("Saving schedule…");
  $("auth-button").disabled = true;
  try {
    await request("/api/timekpr/file", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: state.authorization,
      },
      body: JSON.stringify(state.schedule),
    });
    state.original = structuredClone(state.schedule);
    toast("Schedule saved.");
  } catch (error) {
    showError(
      `Could not save the schedule. ${error.message} Your changes are still here.`,
    );
    if (error.status === 401 || error.status === 403) {
      state.authorization = null;
      renderAuth();
    }
  } finally {
    state.busy = false;
    $("auth-button").disabled = false;
    renderGrid();
    renderProfiles();
    renderSaveStatus(
      isDirty() ? "Changes not saved. Try again." : undefined,
      Boolean(isDirty()),
    );
  }
}

$("profile-select").addEventListener("change", (event) =>
  selectProfile(event.target.value),
);
$("refresh-profiles").addEventListener("click", loadProfiles);
$("empty-refresh").addEventListener("click", loadProfiles);
$("save-button").addEventListener("click", saveSchedule);
$("discard-button").addEventListener("click", () => {
  state.schedule = structuredClone(state.original);
  changed("discard-button");
  toast("Changes discarded.");
});
$("copy-weekdays").addEventListener("click", () => {
  const schedule = state.schedule;
  for (const day of DAYS.slice(1, 5)) schedule[day] = [...schedule.monday];
  const mondayEnabled = schedule.week.includes(1);
  schedule.week = [
    ...(mondayEnabled ? [1, 2, 3, 4, 5] : []),
    ...schedule.week.filter((day) => day > 5),
  ];
  changed("copy-weekdays");
  toast("Monday’s hours and enabled status copied to weekdays.");
});
$("auth-button").addEventListener("click", () => {
  if (state.authorization) {
    state.authorization = null;
    renderAuth();
    toast("Signed out.");
  } else openLogin();
});
$("close-login").addEventListener("click", () => $("login-dialog").close());
$("login-dialog").addEventListener("close", () => {
  $("password").value = "";
});
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-submit").disabled = true;
  $("close-login").disabled = true;
  $("login-error").hidden = true;
  try {
    const bytes = new TextEncoder().encode(
      `${$("username").value}:${$("password").value}`,
    );
    const authorization = `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
    const response = await request("/api/timekpr/authenticate", {
      headers: { Authorization: authorization },
    });
    if (!(await response.json()).Authorised)
      throw new Error("Username or password is incorrect.");
    state.authorization = authorization;
    renderAuth();
    $("login-dialog").close();
    if (state.saveAfterLogin) await saveSchedule();
    else toast("Signed in. You can now save schedules.");
  } catch (error) {
    $("login-error").textContent = error.message;
    $("login-error").hidden = false;
  } finally {
    $("login-submit").disabled = false;
    $("close-login").disabled = false;
  }
});
window.addEventListener("beforeunload", (event) => {
  if (isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
loadProfiles();
