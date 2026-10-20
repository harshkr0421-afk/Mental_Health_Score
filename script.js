const API_URL = "http://127.0.0.1:8000/predict";

const $ = id => document.getElementById(id);
const form = $("form");
const submitBtn = $("submit");
const PANELS = ["empty", "load", "err", "res"];

/* Validation rules mirror the Pydantic StudentData model */
const RULES = {
  age:                     { label: "Age", type: "int", min: 10, max: 100 },
  gender:                  { label: "Gender", type: "choice" },
  country:                 { label: "Country", type: "text" },
  academic_level:          { label: "Academic level", type: "choice" },
  most_used_platform:      { label: "Most used platform", type: "choice" },
  purpose_of_use:          { label: "Main purpose", type: "choice" },
  avg_daily_usage_hours:   { label: "Daily usage", type: "float", min: 0, max: 24 },
  daily_unlocks:           { label: "Phone unlocks", type: "int", min: 0 },
  study_hours:             { label: "Study hours", type: "float", min: 0, max: 24 },
  physical_activity_hours: { label: "Physical activity", type: "float", min: 0, max: 2 },
  sleep_hours_per_night:   { label: "Sleep", type: "float", min: 0, max: 24 },
  stress_level:            { label: "Stress level", type: "choice" }
};

/* ---------- helpers ---------- */
function showPanel(name) {
  PANELS.forEach(p => $("s-" + p).classList.toggle("on", p === name));
}

function getValue(name) {
  const radio = form.querySelector(`input[type="radio"][name="${name}"]`);
  if (radio) {
    const checked = form.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : "";
  }
  return $(name).value.trim();
}

function setFieldError(name, message) {
  const wrap = form.querySelector(`.field[data-field="${name}"]`);
  if (!wrap) return false;
  wrap.classList.add("invalid");
  let el = wrap.querySelector(".ferr");
  if (!el) {
    el = document.createElement("small");
    el.className = "ferr";
    el.setAttribute("role", "alert");
    wrap.appendChild(el);
  }
  el.textContent = message;
  return true;
}

function clearFieldError(name) {
  const wrap = form.querySelector(`.field[data-field="${name}"]`);
  if (!wrap) return;
  wrap.classList.remove("invalid");
  const el = wrap.querySelector(".ferr");
  if (el) el.remove();
}

function clearAllErrors() {
  Object.keys(RULES).forEach(clearFieldError);
}

/* ---------- client-side validation ---------- */
function buildPayload() {
  const payload = {};
  const errors = {};

  for (const [name, rule] of Object.entries(RULES)) {
    const raw = getValue(name);

    if (raw === "") {
      errors[name] = rule.type === "choice" ? "Choose an option." : "This field is required.";
      continue;
    }
    if (rule.type === "text") {
      payload[name] = raw;
      continue;
    }
    if (rule.type === "choice") {
      payload[name] = raw;
      continue;
    }

    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors[name] = "Enter a valid number.";
    } else if (rule.type === "int" && !Number.isInteger(n)) {
      errors[name] = "Enter a whole number.";
    } else if (rule.min !== undefined && n < rule.min) {
      errors[name] = `Must be at least ${rule.min}.`;
    } else if (rule.max !== undefined && n > rule.max) {
      errors[name] = `Must be at most ${rule.max}.`;
    } else {
      payload[name] = n;
    }
  }
  return { payload, errors };
}

/* ---------- result card ---------- */
function describe(score) {
  if (score >= 7) return { color: "var(--high)", label: "Healthy range", text: "Habits and well-being look balanced for this student." };
  if (score >= 5) return { color: "var(--mid)", label: "Moderate", text: "Some areas could use attention, such as sleep, screen time or stress." };
  return { color: "var(--low)", label: "Needs attention", text: "This profile suggests the student may benefit from support and healthier routines." };
}

function showResult(score) {
  const info = describe(score);
  $("s-res").style.setProperty("--c", info.color);
  $("score").textContent = score;
  $("badge").textContent = info.label;
  $("msg").textContent = info.text;
  showPanel("res");

  const bar = $("bar");
  bar.style.strokeDashoffset = 553;
  const fraction = Math.min(Math.max(score, 0), 10) / 10;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.strokeDashoffset = 553 * (1 - fraction);
  }));
}

function showError(title, message, retryable = false) {
  $("err-title").textContent = title;
  $("err-msg").textContent = message;
  $("retry").hidden = !retryable; // input errors need fixing first, so no retry
  showPanel("err");
}

/* ---------- API error handling ---------- */
function handleValidationDetail(detail) {
  // FastAPI 422: [{ loc: ["body", "age"], msg: "..." }, ...]
  const general = [];
  detail.forEach(item => {
    const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
    if (!(field in RULES && setFieldError(field, item.msg))) {
      general.push(item.msg);
    }
  });
  const first = form.querySelector(".field.invalid");
  if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  showError("Check your inputs", general.length ? general.join(" ") : "The server flagged some fields. Fix the highlighted fields and try again.");
}

async function requestPrediction(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON response */ }

  if (res.ok) {
    const score = data && data.predicted_mental_Health_score;
    if (typeof score !== "number") throw new Error("The server returned an unexpected response.");
    return score;
  }

  const err = new Error("Request failed");
  err.status = res.status;
  err.detail = data && data.detail;
  throw err;
}

/* ---------- events ---------- */
form.addEventListener("input", e => {
  const wrap = e.target.closest(".field");
  if (wrap) clearFieldError(wrap.dataset.field);
});

async function submitForm() {
  clearAllErrors();

  const { payload, errors } = buildPayload();
  const failed = Object.keys(errors);
  if (failed.length) {
    failed.forEach(name => setFieldError(name, errors[name]));
    showPanel("empty");
    form.querySelector(".field.invalid").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Predicting…";
  showPanel("load");
  if (window.matchMedia("(max-width:860px)").matches) {
    $("s-load").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  try {
    showResult(await requestPrediction(payload));
  } catch (err) {
    if (err instanceof TypeError) {
      showError("Can't reach the API", "Check that the FastAPI server is running at http://127.0.0.1:8000, then try again.", true);
    } else if (err.status === 422 && Array.isArray(err.detail)) {
      handleValidationDetail(err.detail);
    } else if (err.status >= 500) {
      showError("Server error", "The model failed to process this request. Check the FastAPI terminal for details.", true);
    } else if (err.status) {
      showError("Request rejected", typeof err.detail === "string" ? err.detail : `The server responded with status ${err.status}.`, true);
    } else {
      showError("Something went wrong", err.message, true);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Predict score";
  }
}

form.addEventListener("submit", e => {
  e.preventDefault();
  submitForm();
});

$("retry").addEventListener("click", submitForm);

/* "Try again" on the result card: clear the form for a new prediction */
$("again").addEventListener("click", () => {
  form.reset();
  clearAllErrors();
  showPanel("empty");
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("age").focus({ preventScroll: true });
});
