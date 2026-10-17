// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: chart-line;
// ==========================================
// MOOD DASHBOARD (REDESIGNED LAYOUT & SAFE AVATAR SYNC)
// ==========================================

const fm = FileManager.local();
const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");

let myUserName = "You";
let partnerUserName = "Partner";

if (fm.fileExists(userConfigPath)) {
  try {
    let config = JSON.parse(fm.readString(userConfigPath));
    myUserName = (config.myUserName || "You").trim();
    partnerUserName = (config.partnerUserName || "Partner").trim();
  } catch (e) {
    console.log("Could not read user_config.json, using defaults.");
  }
}

const listName = "Mood Dashboard";
const configPath = fm.joinPath(fm.documentsDirectory(), "mood_presets.json");

const defaults = [
  { title: "🟢 Locked In", energy: 5 },
  { title: "⚡ Focused", energy: 4 },
  { title: "🟣 Creative", energy: 3 },
  { title: "🟡 Chill", energy: 2 },
  { title: "☕ Cozy", energy: 2 },
  { title: "🔴 Low Battery", energy: 1 },
];

let rawMoods = defaults;
if (fm.fileExists(configPath)) {
  try {
    let parsedMoods = JSON.parse(fm.readString(configPath));
    if (Array.isArray(parsedMoods)) rawMoods = parsedMoods;
  } catch (e) {
    console.log(
      "Could not parse mood_presets.json, using defaults: " + e.message,
    );
  }
}
let moods = rawMoods.map((m) =>
  typeof m === "string" ? { title: m, energy: 3 } : m,
);

if (!fm.fileExists(configPath)) {
  fm.writeString(configPath, JSON.stringify(defaults, null, 2));
}

// ---- Check-in reminder settings (stored in mood_settings.json) ----
const settingsPath = fm.joinPath(fm.documentsDirectory(), "mood_settings.json");
let settings = {
  reminderHours: 0,
  quietEnabled: true,
  quietStart: 22,
  quietEnd: 8,
};

function clampInt(v, lo, hi, fallback) {
  let n = parseInt(v, 10);
  return isNaN(n) ? fallback : Math.max(lo, Math.min(hi, n));
}

if (fm.fileExists(settingsPath)) {
  try {
    let saved = JSON.parse(fm.readString(settingsPath));
    settings = {
      reminderHours: clampInt(saved.reminderHours, 0, 168, 0),
      quietEnabled: saved.quietEnabled !== false,
      quietStart: clampInt(saved.quietStart, 0, 23, 22),
      quietEnd: clampInt(saved.quietEnd, 0, 23, 8),
    };
  } catch (e) {
    console.log("Could not read mood_settings.json, using defaults.");
  }
}

let calendars = await Calendar.forReminders();
let cal = calendars.find(
  (c) => c.title.toLowerCase() === listName.toLowerCase(),
);
// NOTE: no fallback to the default Reminders list. If the list is missing,
// the script stops with a message instead (see bottom of file).

// Helper to extract the direct Base64 Data URI from reminder notes
function getAvatarBase64FromNotes(reminder) {
  if (
    !reminder ||
    !reminder.notes ||
    !reminder.notes.startsWith("data:image")
  ) {
    return null;
  }
  return reminder.notes;
}

// Avatar reminders are titled exactly "<Name> Avatar" (case-insensitive)
function isAvatarFor(reminder, name) {
  let title = ((reminder && reminder.title) || "").trim().toLowerCase();
  return title === (name + " avatar").trim().toLowerCase();
}

// Function to safely pick photo, center-crop, compress, and update avatar reminder notes
async function changeMyAvatar() {
  try {
    let img = await Photos.fromLibrary();
    if (!img) return; // User cancelled, exit safely

    // Center-crop to a square so non-square photos aren't squashed
    const AVATAR_PX = 180;
    let side = Math.min(img.size.width, img.size.height);
    let scale = AVATAR_PX / side;
    let drawW = img.size.width * scale;
    let drawH = img.size.height * scale;

    let dc = new DrawContext();
    dc.size = new Size(AVATAR_PX, AVATAR_PX);
    dc.opaque = true;
    dc.respectScreenScale = false; // true pixel size = smaller note payload
    dc.drawImageInRect(
      img,
      new Rect((AVATAR_PX - drawW) / 2, (AVATAR_PX - drawH) / 2, drawW, drawH),
    );
    let processedImg = dc.getImage();
    let jpegData = Data.fromJPEG(processedImg);
    let base64String = "data:image/jpeg;base64," + jpegData.toBase64String();

    let allReminders = await Reminder.all([cal]);
    let myAvatarReminder = allReminders.find((r) => isAvatarFor(r, myUserName));

    if (!myAvatarReminder) {
      myAvatarReminder = new Reminder();
      myAvatarReminder.title = myUserName + " Avatar";
      myAvatarReminder.calendar = cal;
    }

    myAvatarReminder.notes = base64String;
    await myAvatarReminder.save();
  } catch (e) {
    console.log("Photo selection cancelled or failed: " + e);
  }
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const sleep = (ms) => new Promise((r) => Timer.schedule(ms, false, r));
const getTime = (r) =>
  r.creationDate ? new Date(r.creationDate).getTime() : 0;

function formatDate(d) {
  if (!d) return "Just now";
  let date = new Date(d);
  let df = new DateFormatter();
  if (date.toDateString() === new Date().toDateString()) {
    df.dateFormat = "'Today' h:mm a";
  } else {
    df.dateFormat = "MMM d, h:mm a";
  }
  return df.string(date);
}

function parseMood(title) {
  let match = title.match(/^\[(.*?)\]\s*(.*)$/);
  if (match) return { user: match[1], mood: match[2] };
  return { user: "Unknown", mood: title };
}

// Display-only: same face swap the widgets use. Stored reminder titles are never changed.
function faceify(text) {
  return String(text || "")
    .replace(/🟢/g, "😤")
    .replace(/🔴/g, "🪫")
    .replace(/🟡/g, "😌")
    .replace(/🟣/g, "🎨")
    .replace(/\s+/g, " ")
    .trim();
}

// Compact relative time for the hero cards ("Just now", "5m ago", "3h ago", "2d ago")
function relTime(d) {
  if (!d) return "--";
  let sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 60) return "Just now";
  let min = Math.floor(sec / 60);
  if (min < 60) return min + "m ago";
  let hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + "h ago";
  let days = Math.floor(hrs / 24);
  if (days < 7) return days + "d ago";
  return formatDate(d);
}

function isStale(d) {
  return d ? Date.now() - new Date(d).getTime() > 24 * 3600 * 1000 : false;
}

// Energy level for a mood, looked up from the presets (exact match first)
function energyFor(mood) {
  let m = String(mood || "")
    .trim()
    .toLowerCase();
  if (!m) return null;
  let p =
    moods.find((x) => String(x.title).trim().toLowerCase() === m) ||
    moods.find((x) => String(x.title).toLowerCase().indexOf(m) !== -1);
  return p && p.energy != null ? p.energy : null;
}

function energyDotsHtml(mood) {
  let e = energyFor(mood);
  if (e == null) return "";
  let lvl = Math.max(1, Math.min(5, e));
  return (
    '<span class="dots">' + "●".repeat(lvl) + "○".repeat(5 - lvl) + "</span>"
  );
}

let myLatestReminderRef = null;

// ---- MOCK DATA GENERATOR ----
function buildMockData() {
  let now = new Date();
  let moodPool = [
    { title: "🟢 Locked In", energy: 5 },
    { title: "☕ Cozy", energy: 2 },
    { title: "🟡 Chill", energy: 2 },
    { title: "🔴 Low Battery", energy: 1 },
    { title: "🟣 Creative", energy: 3 },
    { title: "⚡ Focused", energy: 4 },
  ];
  let notePool = [
    "Working on Scriptable dashboard",
    "Watching movies",
    "Testing layout features",
    "Weekend unwind",
    "Sprint wrap-up",
    "Long day at work",
    "Late night gaming",
    "Crafting & projects",
    "Pool day",
    "Cooking something new",
    "Rainy day reset",
  ];
  let out = [];
  let n = 0;
  let monthsBack = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  monthsBack.forEach(function (m) {
    let slots = m === 0 ? [0, 1, 2] : [0, 1, 2, 3];
    slots.forEach(function (k) {
      let who = n % 2 === 0 ? myUserName : partnerUserName;
      let date;
      let selectedPreset = moodPool[(n + m) % moodPool.length];
      if (m === 0) {
        let offsets = [0, 2700000, 18000000];
        date = new Date(now.getTime() - (offsets[k] || k * 3600000));
      } else {
        date = new Date(
          now.getFullYear(),
          now.getMonth() - m,
          24 - k,
          8 + (n % 13),
          n % 60,
        );
      }
      out.push({
        title: "[" + who + "] " + selectedPreset.title,
        notes: notePool[(n + m) % notePool.length],
        creationDate: date,
      });
      n++;
    });
  });
  return out;
}

// Builds the page script for the bottom sheets (Log Mood, Custom Mood, Manage Moods).
// Sheets run inside the WebView and submit by navigating to http://localhost/<route>?...,
// which Scriptable intercepts (saveMood, saveCustom, saveManage).
function buildSheetJs() {
  let sheetMoods = moods.map((m) => {
    let t = faceify(m.title);
    let parts = t.split(" ");
    let first = parts[0] || "";
    let hasEmoji = first !== "" && !/^[A-Za-z0-9]/.test(first);
    let emoji = hasEmoji ? first : (t.charAt(0) || "•").toUpperCase();
    let label = hasEmoji ? parts.slice(1).join(" ") : t;
    if (!label) label = t;
    let lvl = Math.max(1, Math.min(5, m.energy || 3));
    return {
      emoji: esc(emoji),
      ini: !hasEmoji,
      label: esc(label),
      energy: lvl,
      raw: String(m.title),
      dots: "●".repeat(lvl) + "○".repeat(5 - lvl),
    };
  });
  let safe = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
  let json = safe(sheetMoods);

  // Info about my current check-in (for the Edit sheet)
  let mine = { has: false, mood: "", note: "", time: "", idx: -1 };
  if (myLatestReminderRef) {
    let mp = parseMood(myLatestReminderRef.title || "");
    let key = String(mp.mood).trim().toLowerCase();
    mine = {
      has: true,
      mood: faceify(mp.mood),
      note: myLatestReminderRef.notes || "",
      time: relTime(myLatestReminderRef.creationDate),
      idx: moods.findIndex((m) => String(m.title).trim().toLowerCase() === key),
    };
  }
  let settingsData = {
    hours: settings.reminderHours,
    quietOn: settings.quietEnabled,
    qs: settings.quietStart,
    qe: settings.quietEnd,
  };
  let data = { MOODS: json, MINE: safe(mine), SETTINGS: safe(settingsData) };

  return `
var MOODS = __MOODS__;
var MINE = __MINE__;
var SETTINGS = __SETTINGS__;
var selected = -1;
var editSel = -1;
var delArmed = false;
var delTimer = null;
var rHours = 0;
var qOn = true;
var qS = 22;
var qE = 8;
var HOUR_OPTS = [0, 6, 12, 24, 48];
var HOUR_LABELS = ["Off", "6h", "12h", "24h", "48h"];
var openId = null;
var mEnergy = [];
var mDel = [];
var cEnergy = 3;
var QUICK = ["😀","😴","🔥","🚀","🎮","🧘","🤒","🥳","😎","🤯","💪","🍕"];
var ELABELS = ["Very low","Low","Medium","High","Max"];
function $(id) { return document.getElementById(id); }
function dotsFor(n) { var s = ""; for (var k = 1; k <= 5; k++) { s += (k <= n ? "●" : "○"); } return s; }

function hourLabel(h) { return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? " AM" : " PM"); }
function chipsHtml(prefix, handler) {
  var h = "";
  for (var i = 0; i < MOODS.length; i++) {
    var m = MOODS[i];
    h += '<button type="button" class="chip" id="' + prefix + i + '" onclick="' + handler + '(' + i + ')">' +
      '<span class="chip-emoji' + (m.ini ? ' ini' : '') + '">' + m.emoji + '</span>' +
      '<span class="chip-label">' + m.label + '</span>' +
      '<span class="cdots">' + m.dots + '</span></button>';
  }
  return h;
}

function initSheet() {
  // Log Mood + Edit tiles
  var emptyMsg = '<div class="sheet-empty">No moods yet. Close this and tap Custom Mood to add one.</div>';
  $("moodGrid").innerHTML = MOODS.length ? chipsHtml("chip_", "pick") : emptyMsg;
  $("editGrid").innerHTML = MOODS.length ? chipsHtml("echip_", "pickEdit") : emptyMsg;
  // Reminders: hour options + quiet-hour selects
  var rs = "";
  for (var rk = 0; rk < HOUR_OPTS.length; rk++) {
    rs += '<button type="button" class="eopt" id="rs_' + rk + '" onclick="setHours(' + HOUR_OPTS[rk] + ')"><span class="hlabel">' + HOUR_LABELS[rk] + '</span></button>';
  }
  $("rSeg").innerHTML = rs;
  var so = "";
  for (var hh = 0; hh < 24; hh++) { so += '<option value="' + hh + '">' + hourLabel(hh) + '</option>'; }
  $("qStart").innerHTML = so;
  $("qEnd").innerHTML = so;
  $("rCustom").addEventListener("input", customChanged);
  $("qStart").addEventListener("change", quietChanged);
  $("qEnd").addEventListener("change", quietChanged);
  // Custom Mood: quick emoji + energy picker
  var q = "";
  for (var j = 0; j < QUICK.length; j++) { q += '<button type="button" class="qe" onclick="setQuick(' + j + ')">' + QUICK[j] + '</button>'; }
  $("quickEmoji").innerHTML = q;
  var ce = "";
  for (var n = 1; n <= 5; n++) {
    ce += '<button type="button" class="eopt" id="ce_' + n + '" onclick="setCEnergy(' + n + ')">' +
      '<span class="cdots">' + dotsFor(n) + '</span><span class="eopt-label">' + ELABELS[n - 1] + '</span></button>';
  }
  $("cEnergy").innerHTML = ce;
  $("cEmoji").addEventListener("input", renderCustom);
  $("cName").addEventListener("input", renderCustom);
  $("cName").addEventListener("keydown", function (e) { if (e.key === "Enter") { submitCustom(); } });
  $("noteInput").addEventListener("keydown", function (e) { if (e.key === "Enter") { submitMood(); } });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitSheet);
    window.visualViewport.addEventListener("scroll", fitSheet);
  }
}

// ----- shared sheet plumbing -----
function showSheet(id) {
  openId = id;
  $("backdrop").className = "backdrop show";
  $(id).className = "sheet show";
  document.body.style.overflow = "hidden";
  fitSheet();
}
function closeSheet() {
  if (!openId) { return; }
  if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }
  $("backdrop").className = "backdrop";
  $(openId).className = "sheet";
  $(openId).style.bottom = "0px";
  document.body.style.overflow = "";
  openId = null;
}
function fitSheet() {
  var vv = window.visualViewport;
  if (!vv || !openId) { return; }
  var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  $(openId).style.bottom = kb + "px";
  $(openId).style.maxHeight = Math.max(240, Math.floor(vv.height - 24)) + "px";
}

// ----- Log Mood -----
function openLog() {
  selected = -1;
  $("noteInput").value = "";
  $("logBtn").disabled = true;
  for (var k = 0; k < MOODS.length; k++) { $("chip_" + k).className = "chip"; }
  showSheet("logSheet");
}
function pick(i) {
  selected = i;
  for (var k = 0; k < MOODS.length; k++) { $("chip_" + k).className = (k === i) ? "chip sel" : "chip"; }
  $("logBtn").disabled = false;
}
function submitMood() {
  if (selected < 0 || $("logBtn").disabled) { return; }
  $("logBtn").disabled = true;
  window.location.href = "http://localhost/saveMood?i=" + selected + "&note=" + encodeURIComponent($("noteInput").value);
}

// ----- Edit current check-in -----
function openEdit() {
  if (!MINE.has) { openLog(); return; }
  editSel = MINE.idx;
  $("editNote").value = MINE.note;
  $("editSub").textContent = "Currently " + MINE.mood + " \u00b7 " + MINE.time;
  $("editSaveBtn").disabled = false;
  renderEdit();
  resetDelete();
  showSheet("editSheet");
}
function pickEdit(i) { editSel = i; renderEdit(); }
function renderEdit() {
  for (var k = 0; k < MOODS.length; k++) { $("echip_" + k).className = (k === editSel) ? "chip sel" : "chip"; }
}
function submitEdit() {
  if ($("editSaveBtn").disabled) { return; }
  $("editSaveBtn").disabled = true;
  window.location.href = "http://localhost/saveEdit?i=" + editSel + "&note=" + encodeURIComponent($("editNote").value);
}
function resetDelete() {
  delArmed = false;
  if (delTimer) { clearTimeout(delTimer); delTimer = null; }
  $("delBtn").textContent = "\ud83d\uddd1\ufe0f Delete this check-in";
  $("delBtn").className = "danger-link";
}
function askDelete() {
  if (!delArmed) {
    delArmed = true;
    $("delBtn").textContent = "Tap again to confirm delete";
    $("delBtn").className = "danger-link armed";
    delTimer = setTimeout(resetDelete, 4000);
    return;
  }
  window.location.href = "http://localhost/deleteCheckin";
}

// ----- Check-in reminders -----
function openRemind() {
  rHours = SETTINGS.hours;
  qOn = SETTINGS.quietOn;
  qS = SETTINGS.qs;
  qE = SETTINGS.qe;
  renderRemind(true);
  showSheet("remindSheet");
}
function setHours(h) { rHours = h; renderRemind(true); }
function customChanged() {
  var v = parseInt($("rCustom").value, 10);
  if (isNaN(v)) { return; }
  rHours = Math.max(0, Math.min(168, v));
  renderRemind(false);
}
function toggleQuiet() { qOn = !qOn; renderRemind(false); }
function quietChanged() {
  qS = parseInt($("qStart").value, 10);
  qE = parseInt($("qEnd").value, 10);
  renderRemind(false);
}
function renderRemind(syncCustom) {
  for (var k = 0; k < HOUR_OPTS.length; k++) { $("rs_" + k).className = (rHours === HOUR_OPTS[k]) ? "eopt sel" : "eopt"; }
  if (syncCustom) { $("rCustom").value = (HOUR_OPTS.indexOf(rHours) === -1 && rHours > 0) ? rHours : ""; }
  $("qToggle").className = qOn ? "switch on" : "switch";
  $("qToggle").textContent = qOn ? "On" : "Off";
  $("qStart").disabled = !qOn;
  $("qEnd").disabled = !qOn;
  $("qStart").value = qS;
  $("qEnd").value = qE;
  var quietActive = qOn && qS !== qE;
  $("rWarn").textContent = (rHours > 0 && qOn && qS === qE) ? "Quiet hours start and end at the same time, so they won't apply." : "";
  $("rSummary").textContent = rHours === 0
    ? "Reminders are off."
    : "You'll get one nudge " + rHours + " hour" + (rHours === 1 ? "" : "s") + " after each check-in" + (quietActive ? ", held until " + hourLabel(qE) + " if it lands in quiet hours." : ".");
}
function saveRemind() {
  window.location.href = "http://localhost/saveSettings?h=" + rHours + "&q=" + (qOn ? 1 : 0) + "&qs=" + qS + "&qe=" + qE;
}
function testRemind() { window.location.href = "http://localhost/testReminder"; }

// ----- Custom Mood -----
function openCustom() {
  $("cEmoji").value = "";
  $("cName").value = "";
  cEnergy = 3;
  renderCustom();
  showSheet("customSheet");
}
function setQuick(j) { $("cEmoji").value = QUICK[j]; renderCustom(); }
function setCEnergy(n) { cEnergy = n; renderCustom(); }
function composeTitle() {
  var e = $("cEmoji").value.trim();
  var nm = $("cName").value.trim();
  if (!nm) { return ""; }
  return (e ? e + " " : "") + nm;
}
function renderCustom() {
  for (var n = 1; n <= 5; n++) { $("ce_" + n).className = (n === cEnergy) ? "eopt sel" : "eopt"; }
  var t = composeTitle();
  var dup = false;
  if (t) {
    var lt = t.toLowerCase();
    for (var i = 0; i < MOODS.length; i++) { if (MOODS[i].raw.trim().toLowerCase() === lt) { dup = true; } }
  }
  $("pvTitle").textContent = t || "Your new mood";
  $("pvDots").textContent = dotsFor(cEnergy);
  $("cWarn").textContent = dup ? "You already have a mood with that name." : "";
  $("addBtn").disabled = (!t || dup);
}
function submitCustom() {
  if ($("addBtn").disabled) { return; }
  $("addBtn").disabled = true;
  window.location.href = "http://localhost/saveCustom?t=" + encodeURIComponent(composeTitle()) + "&e=" + cEnergy;
}

// ----- Manage Moods -----
function openManage() {
  mEnergy = [];
  mDel = [];
  for (var i = 0; i < MOODS.length; i++) { mEnergy.push(MOODS[i].energy); mDel.push(false); }
  renderManage();
  showSheet("manageSheet");
}
function setE(i, n) { mEnergy[i] = n; renderManage(); }
function toggleDel(i) { mDel[i] = !mDel[i]; renderManage(); }
function renderManage() {
  var g = $("manageList");
  if (!MOODS.length) {
    g.innerHTML = '<div class="sheet-empty">No moods to manage yet.</div>';
    $("mHint").style.display = "none";
    $("saveBtn").disabled = true;
    return;
  }
  var h = "";
  var removed = 0;
  var changed = false;
  var same = true;
  for (var i = 0; i < MOODS.length; i++) {
    var m = MOODS[i];
    if (mDel[i]) { removed++; changed = true; }
    if (mEnergy[i] !== m.energy) { changed = true; }
    if (mEnergy[i] !== mEnergy[0]) { same = false; }
    h += '<div class="mrow' + (mDel[i] ? ' removed' : '') + '">' +
      '<div class="mrow-top"><span class="mrow-emoji' + (m.ini ? ' ini' : '') + '">' + m.emoji + '</span>' +
      '<span class="mrow-label">' + m.label + '</span>' +
      '<button type="button" class="trash" onclick="toggleDel(' + i + ')">' + (mDel[i] ? 'Undo' : '🗑️') + '</button></div>' +
      '<div class="mrow-energy"><span class="elbl">Energy</span>';
    for (var n = 1; n <= 5; n++) {
      h += '<button type="button" class="edot" onclick="setE(' + i + ',' + n + ')">' + (n <= mEnergy[i] ? '●' : '○') + '</button>';
    }
    h += '</div></div>';
  }
  g.innerHTML = h;
  $("mHint").style.display = (same && MOODS.length > 1) ? "block" : "none";
  $("saveBtn").disabled = !changed;
  $("saveBtn").textContent = removed ? ("Save (" + removed + " removed)") : "Save changes";
}
function submitManage() {
  if ($("saveBtn").disabled) { return; }
  $("saveBtn").disabled = true;
  var d = [];
  for (var i = 0; i < mDel.length; i++) { if (mDel[i]) { d.push(i); } }
  window.location.href = "http://localhost/saveManage?e=" + mEnergy.join(",") + "&d=" + d.join(",");
}
`.replace(/__(MOODS|MINE|SETTINGS)__/g, (m, k) => data[k]);
}

async function buildHtml(state) {
  let allReminders = await Reminder.all([cal]);
  if (!allReminders || allReminders.length === 0)
    allReminders = buildMockData();

  let myAvatarReminder = allReminders.find((r) => isAvatarFor(r, myUserName));
  let partnerAvatarReminder = allReminders.find((r) =>
    isAvatarFor(r, partnerUserName),
  );

  let myAvatarB64 = getAvatarBase64FromNotes(myAvatarReminder);
  let partnerAvatarB64 = getAvatarBase64FromNotes(partnerAvatarReminder);

  let myAvatarHtml = myAvatarB64
    ? '<div class="avatar-wrapper"><a href="http://localhost/changeAvatar"><img src="' +
      myAvatarB64 +
      '" class="avatar"><div class="avatar-badge">✏️</div></a></div>'
    : '<div class="avatar-wrapper"><a href="http://localhost/changeAvatar" style="text-decoration:none;"><div class="avatar-fallback">' +
      esc(myUserName.charAt(0)) +
      '</div><div class="avatar-badge">✏️</div></a></div>';

  let partnerAvatarHtml = partnerAvatarB64
    ? '<div class="avatar-wrapper"><img src="' +
      partnerAvatarB64 +
      '" class="avatar"></div>'
    : '<div class="avatar-wrapper"><div class="avatar-fallback avatar-fallback-partner">' +
      esc(partnerUserName.charAt(0)) +
      "</div></div>";

  // CRITICAL: Filter out any reminders containing "avatar" so they never show up in history
  let reminders = allReminders.filter(
    (r) => !r.title.toLowerCase().includes("avatar"),
  );
  reminders.sort((a, b) => getTime(b) - getTime(a));

  let myLatest = null;
  let partnerLatest = null;
  for (let r of reminders) {
    let p = parseMood(r.title);
    if (!myLatest && p.user.toLowerCase() === myUserName.toLowerCase()) {
      myLatest = { r: r, mood: p.mood };
    } else if (
      !partnerLatest &&
      p.user.toLowerCase() === partnerUserName.toLowerCase()
    ) {
      partnerLatest = { r: r, mood: p.mood };
    }
    if (myLatest && partnerLatest) break;
  }

  myLatestReminderRef = myLatest ? myLatest.r : null;

  let myMood = myLatest ? myLatest.mood : "No Status";
  let myNote =
    myLatest && myLatest.r.notes ? myLatest.r.notes : "Tap 'Log Mood'";
  let myTime = myLatest ? relTime(myLatest.r.creationDate) : "--";
  let myStale = myLatest ? isStale(myLatest.r.creationDate) : false;
  let partnerMood = partnerLatest ? partnerLatest.mood : "No Status";
  let partnerNote =
    partnerLatest && partnerLatest.r.notes
      ? partnerLatest.r.notes
      : "No check-in yet";
  let partnerTime = partnerLatest
    ? relTime(partnerLatest.r.creationDate)
    : "--";
  let partnerStale = partnerLatest
    ? isStale(partnerLatest.r.creationDate)
    : false;

  let years = [];
  let grouped = {};
  for (let r of reminders) {
    let date = r.creationDate ? new Date(r.creationDate) : new Date();
    let y = date.getFullYear();
    let mo = MONTHS[date.getMonth()];
    if (!grouped[y]) {
      grouped[y] = { order: [], data: {} };
      years.push(y);
    }
    if (!grouped[y].data[mo]) {
      grouped[y].data[mo] = [];
      grouped[y].order.push(mo);
    }
    grouped[y].data[mo].push(r);
  }

  let historyHtml = "";
  let id = 0;
  years.forEach(function (y, i) {
    historyHtml += '<div class="year-header">' + y + "</div>";
    grouped[y].order.forEach(function (mo, j) {
      let list = grouped[y].data[mo];
      let sid = "sec_" + id;
      id++;
      let key = y + "-" + mo;
      let open =
        state && state.open
          ? state.open.indexOf(key) !== -1
          : i === 0 && j === 0;
      historyHtml +=
        '<div class="month-toggle" onclick="toggleSection(\'' +
        sid +
        "')\"><span>" +
        mo +
        " (" +
        list.length +
        ")</span>" +
        '<span id="icon_' +
        sid +
        '" class="toggle-icon">' +
        (open ? "▾" : "▸") +
        "</span></div>";
      historyHtml +=
        '<div id="' +
        sid +
        '" data-key="' +
        key +
        '" class="month-container" style="display:' +
        (open ? "block" : "none") +
        ';">';
      for (let r of list) {
        let p = parseMood(r.title);
        let cls =
          p.user.toLowerCase() === myUserName.toLowerCase()
            ? "tag-me"
            : "tag-partner";
        historyHtml +=
          '<div class="card"><div><div class="user-tag ' +
          cls +
          '">' +
          esc(p.user) +
          "</div>" +
          '<div class="title">' +
          esc(faceify(p.mood)) +
          "</div>" +
          (r.notes ? '<div class="note">' + esc(r.notes) + "</div>" : "") +
          '</div><div class="time">' +
          esc(formatDate(r.creationDate)) +
          energyDotsHtml(p.mood) +
          "</div></div>";
      }
      historyHtml += "</div>";
    });
  });
  if (!historyHtml) historyHtml = '<div class="note">No history found.</div>';

  let css = [
    "body{background:#0b0c10;color:#fff;font-family:-apple-system,sans-serif;padding:20px;margin:0}",
    "h2{margin-top:0;margin-bottom:16px;font-size:24px}",
    ".dual-container{display:flex;gap:12px;margin-bottom:20px}",
    ".hero{flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:14px;box-sizing:border-box}",
    ".hero-partner{border-color:rgba(236,72,153,0.3)}",
    ".hero-header{display:flex;align-items:center;gap:10px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px}",
    ".hero-label{font-size:10px;color:#818cf8;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}",
    ".hero-label-partner{color:#f472b6}",
    ".hero-name{font-size:14px;font-weight:800;color:#fff;min-width:0;overflow-wrap:anywhere}",
    ".hero-name-me{color:#818cf8}",
    ".hero-name-partner{color:#f472b6}",
    ".avatar-wrapper{position:relative;display:inline-block;flex-shrink:0}",
    ".avatar{box-sizing:border-box;width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;border:2px solid rgba(255,255,255,0.2)}",
    ".avatar-fallback{box-sizing:border-box;width:72px;height:72px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:28px;color:#fff;border:2px solid rgba(255,255,255,0.2)}",
    ".avatar-fallback-partner{background:#ec4899}",
    ".avatar-badge{box-sizing:border-box;position:absolute;bottom:-2px;right:-2px;background:#6366f1;color:#fff;width:18px;height:18px;border-radius:50%;font-size:9px;display:flex;align-items:center;justify-content:center;border:2px solid #0b0c10;box-shadow:0 2px 4px rgba(0,0,0,0.4)}",
    ".hero-clickable{cursor:pointer}",
    ".hero-clickable:active{opacity:0.7}",
    ".hero-title{font-size:20px;font-weight:800;margin-bottom:6px;word-break:break-word}",
    ".note{color:rgba(255,255,255,0.6);font-size:12px;font-style:italic}",
    ".btn{background:#6366f1;color:#fff;text-decoration:none;padding:14px;border-radius:14px;font-weight:600;font-size:15px;margin-bottom:10px;display:block;text-align:center;box-sizing:border-box}",
    ".btn-sec{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12)}",
    ".year-header{font-size:18px;font-weight:800;color:#818cf8;margin-top:24px;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px}",
    ".month-toggle{font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.5px;margin-top:10px;margin-bottom:6px;background:rgba(255,255,255,0.05);padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;user-select:none}",
    ".toggle-icon{font-size:14px;color:#818cf8}",
    ".month-container{margin-bottom:12px}",
    ".card{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px}",
    ".user-tag{font-size:10px;font-weight:700;margin-bottom:2px;text-transform:uppercase;display:inline-block;padding:2px 6px;border-radius:6px}",
    ".tag-me{background:rgba(99,102,241,0.2);color:#818cf8;border:1px solid rgba(99,102,241,0.4)}",
    ".tag-partner{background:rgba(236,72,153,0.2);color:#f472b6;border:1px solid rgba(236,72,153,0.4)}",
    ".title{font-weight:600;font-size:14px;margin-top:2px}",
    ".time{font-size:11px;color:rgba(255,255,255,0.5);text-align:right;flex-shrink:0}",
    ".dots{display:block;color:#00e5ff;font-size:11px;letter-spacing:1px;margin-bottom:6px}",
    ".time .dots{margin:4px 0 0 0}",
    ".stale .hero-title,.stale .dots{opacity:0.6}",
    ".stale .time{color:rgba(251,191,36,0.85)}",
    ".btn-row{display:flex;gap:10px}",
    ".btn-row .btn{flex:1;min-width:0;padding:12px 8px;font-size:14px}",
    ".backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity 0.25s ease;z-index:90}",
    ".backdrop.show{opacity:1;pointer-events:auto}",
    ".sheet{position:fixed;left:0;right:0;bottom:0;z-index:100;box-sizing:border-box;background:#14151c;border:1px solid rgba(255,255,255,0.1);border-bottom:none;border-radius:26px 26px 0 0;padding:10px 16px calc(18px + env(safe-area-inset-bottom));max-height:88vh;overflow-y:auto;transform:translateY(105%);transition:transform 0.3s cubic-bezier(0.2,0.8,0.2,1);box-shadow:0 -10px 40px rgba(0,0,0,0.5)}",
    ".sheet.show{transform:translateY(0)}",
    ".grabber{width:40px;height:5px;border-radius:3px;background:rgba(255,255,255,0.25);margin:0 auto 14px}",
    ".sheet-title{font-size:20px;font-weight:800;margin:0}",
    ".sheet-sub{font-size:13px;color:rgba(255,255,255,0.55);margin:2px 0 14px}",
    ".mood-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    ".chip{appearance:none;-webkit-appearance:none;font:inherit;color:#fff;text-align:left;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.1);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:3px;min-width:0;transition:background 0.15s,border-color 0.15s,box-shadow 0.15s}",
    ".chip:active{transform:scale(0.97)}",
    ".chip.sel{background:rgba(99,102,241,0.22);border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.25)}",
    ".chip-emoji{font-size:28px;line-height:1.1}",
    ".chip-emoji.ini{width:32px;height:32px;border-radius:50%;background:rgba(129,140,248,0.25);color:#c7d2fe;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center}",
    ".chip-label{font-size:14px;font-weight:700;overflow-wrap:anywhere}",
    ".cdots{color:#00e5ff;font-size:10px;letter-spacing:1px}",
    ".note-input{box-sizing:border-box;width:100%;margin-top:12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px;color:#fff;font-size:16px;font-family:inherit;outline:none}",
    ".note-input:focus{border-color:#6366f1}",
    ".note-input::placeholder{color:rgba(255,255,255,0.4)}",
    ".sheet-actions{display:flex;gap:10px;margin-top:12px}",
    ".sbtn{appearance:none;-webkit-appearance:none;font:inherit;font-weight:600;font-size:15px;color:#fff;border-radius:14px;padding:14px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.08);flex:1}",
    ".sbtn-primary{flex:2;background:#6366f1;border-color:#6366f1}",
    ".sbtn:disabled{opacity:0.4}",
    ".sheet-empty{color:rgba(255,255,255,0.6);font-size:14px;padding:8px 0}",
    ".cust-row{display:flex;gap:10px}",
    ".cust-row .note-input{margin-top:0}",
    ".cust-row .emoji-input{flex:0 0 76px;width:76px;text-align:center;font-size:26px;padding:10px 6px}",
    ".quick{display:flex;gap:8px;overflow-x:auto;margin-top:10px;padding-bottom:2px}",
    ".qe{appearance:none;-webkit-appearance:none;flex:0 0 auto;width:42px;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);font-size:22px;padding:0}",
    ".qe:active{transform:scale(0.92)}",
    ".elabel{font-size:12px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 8px}",
    ".eseg{display:flex;gap:6px}",
    ".eopt{appearance:none;-webkit-appearance:none;font:inherit;color:#fff;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 2px;border-radius:14px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06)}",
    ".eopt.sel{background:rgba(99,102,241,0.22);border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.25)}",
    ".eopt-label{font-size:11px;font-weight:600;color:rgba(255,255,255,0.75)}",
    ".cpreview{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.15)}",
    ".pv-title{font-weight:700;font-size:15px;overflow-wrap:anywhere}",
    ".pv-dots{color:#00e5ff;font-size:12px;letter-spacing:1px;flex-shrink:0;margin-left:10px}",
    ".cwarn{font-size:12px;color:#fbbf24;min-height:16px;margin-top:6px}",
    ".mlist{display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow-y:auto}",
    ".mrow{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)}",
    ".mrow.removed{opacity:0.5}",
    ".mrow.removed .mrow-label{text-decoration:line-through}",
    ".mrow-top{display:flex;align-items:center;gap:10px}",
    ".mrow-emoji{font-size:24px;flex-shrink:0}",
    ".mrow-emoji.ini{width:28px;height:28px;border-radius:50%;background:rgba(129,140,248,0.25);color:#c7d2fe;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center}",
    ".mrow-label{flex:1;min-width:0;font-weight:700;font-size:15px;overflow-wrap:anywhere}",
    ".trash{appearance:none;-webkit-appearance:none;font:inherit;font-size:14px;font-weight:600;color:#fca5a5;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:6px 10px;flex-shrink:0}",
    ".mrow.removed .trash{color:#fff;background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2)}",
    ".mrow-energy{display:flex;align-items:center;gap:2px;margin-top:4px}",
    ".elbl{font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-right:8px}",
    ".edot{appearance:none;-webkit-appearance:none;background:none;border:none;color:#00e5ff;font-size:22px;line-height:1;padding:6px 7px}",
    ".mhint{display:none;font-size:12px;color:#fbbf24;margin:0 0 10px}",
    ".top-actions{display:flex;align-items:center;gap:8px}",
    ".iconbtn{cursor:pointer;font-size:16px;line-height:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:9px 12px}",
    ".iconbtn:active{opacity:0.6}",
    ".danger-link{display:block;width:100%;margin-top:6px;background:none;border:none;color:#fca5a5;font:inherit;font-weight:600;font-size:14px;padding:12px}",
    ".danger-link.armed{color:#fff;background:rgba(239,68,68,0.35);border-radius:12px}",
    ".ghost-link{display:block;width:100%;margin-top:10px;background:none;border:none;color:#a5b4fc;font:inherit;font-weight:600;font-size:14px;padding:10px}",
    ".hlabel{font-size:14px;font-weight:700;padding:4px 0}",
    ".r-row{display:flex;align-items:center;gap:10px;margin-top:10px;color:rgba(255,255,255,0.7);font-size:14px}",
    ".num-input{box-sizing:border-box;width:84px;text-align:center;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px;color:#fff;font-size:16px;font-family:inherit;outline:none}",
    ".num-input:focus{border-color:#6366f1}",
    ".switch{appearance:none;-webkit-appearance:none;font:inherit;font-weight:700;font-size:13px;padding:9px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7)}",
    ".switch.on{background:#6366f1;border-color:#6366f1;color:#fff}",
    ".hsel{color-scheme:dark;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:#fff;font-size:16px;padding:10px 8px;font-family:inherit}",
    ".hsel:disabled{opacity:0.4}",
    ".top-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}",
    ".top-bar h2{margin:0}",
    ".refresh{color:#818cf8;text-decoration:none;font-size:13px;font-weight:700;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:8px 14px}",
    ".refresh:active{opacity:0.6}",
  ].join("");

  let js =
    'function toggleSection(id){var el=document.getElementById(id);var ic=document.getElementById("icon_"+id);' +
    'if(el.style.display==="none"){el.style.display="block";ic.innerText="▾";}else{el.style.display="none";ic.innerText="▸";}}';

  return (
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    "<style>" +
    css +
    "</style><script>" +
    js +
    buildSheetJs() +
    "</script></head><body>" +
    '<div class="top-bar"><h2>Dashboard</h2><div class="top-actions">' +
    '<div class="iconbtn" onclick="openRemind()">' +
    (settings.reminderHours ? "🔔" : "🔕") +
    "</div>" +
    '<a class="refresh" href="http://localhost/refresh">↻ Refresh</a></div></div>' +
    '<div class="dual-container">' +
    // YOU CARD
    '<div class="hero' +
    (myStale ? " stale" : "") +
    '">' +
    '<div class="hero-header">' +
    myAvatarHtml +
    '<div class="hero-name hero-name-me">' +
    esc(myUserName) +
    "</div>" +
    "</div>" +
    '<div onclick="openEdit()" class="hero-clickable">' +
    '<div class="hero-title">' +
    esc(faceify(myMood)) +
    "</div>" +
    energyDotsHtml(myMood) +
    '<div class="note" style="margin-bottom:8px;">"' +
    esc(myNote) +
    '"</div>' +
    '<div class="time" style="text-align:left">' +
    esc(myTime) +
    "</div>" +
    "</div></div>" +
    // PARTNER CARD (Styled with Pink Accent)
    '<div class="hero hero-partner' +
    (partnerStale ? " stale" : "") +
    '">' +
    '<div class="hero-header">' +
    partnerAvatarHtml +
    '<div class="hero-name hero-name-partner">' +
    esc(partnerUserName) +
    "</div>" +
    "</div>" +
    '<div class="hero-title">' +
    esc(faceify(partnerMood)) +
    "</div>" +
    energyDotsHtml(partnerMood) +
    '<div class="note" style="margin-bottom:8px;">"' +
    esc(partnerNote) +
    '"</div>' +
    '<div class="time" style="text-align:left">' +
    esc(partnerTime) +
    "</div>" +
    "</div>" +
    "</div>" +
    '<div class="btn" style="cursor:pointer" onclick="openLog()">📝 Log Mood</div>' +
    '<div class="btn-row">' +
    '<div class="btn btn-sec" style="cursor:pointer" onclick="openCustom()">➕ Custom Mood</div>' +
    '<div class="btn btn-sec" style="cursor:pointer" onclick="openManage()">🗑️ Manage Moods</div>' +
    "</div>" +
    '<h3 style="font-size:16px;color:rgba(255,255,255,0.8);margin:24px 0 10px 0;">History Feed</h3>' +
    "<div>" +
    historyHtml +
    "</div>" +
    // BOTTOM SHEETS (Log Mood / Custom Mood / Manage Moods)
    '<div id="backdrop" class="backdrop" onclick="closeSheet()"></div>' +
    // --- Log Mood ---
    '<div id="logSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">How are you feeling?</h3>' +
    '<div class="sheet-sub">Logging as ' +
    esc(myUserName) +
    "</div>" +
    '<div id="moodGrid" class="mood-grid"></div>' +
    '<input id="noteInput" class="note-input" type="text" maxlength="140" placeholder="Add a note (optional)" autocomplete="off" autocapitalize="sentences">' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Cancel</button>' +
    '<button type="button" id="logBtn" class="sbtn sbtn-primary" onclick="submitMood()" disabled>Log Mood</button>' +
    "</div></div>" +
    // --- Edit current check-in ---
    '<div id="editSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">Edit your check-in</h3>' +
    '<div id="editSub" class="sheet-sub"></div>' +
    '<div id="editGrid" class="mood-grid"></div>' +
    '<input id="editNote" class="note-input" type="text" maxlength="140" placeholder="Add a note (optional)" autocomplete="off" autocapitalize="sentences">' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Cancel</button>' +
    '<button type="button" id="editSaveBtn" class="sbtn sbtn-primary" onclick="submitEdit()">Save changes</button>' +
    "</div>" +
    '<button type="button" id="delBtn" class="danger-link" onclick="askDelete()"></button>' +
    "</div>" +
    // --- Check-in reminders ---
    '<div id="remindSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">Check-in reminders</h3>' +
    '<div id="rSummary" class="sheet-sub"></div>' +
    '<div class="elabel" style="margin-top:4px">Remind me after</div>' +
    '<div id="rSeg" class="eseg"></div>' +
    '<div class="r-row"><span>Or set your own:</span><input id="rCustom" class="num-input" type="number" inputmode="numeric" min="1" max="168" placeholder="36"><span>hours</span></div>' +
    '<div class="elabel">Quiet hours</div>' +
    '<div class="r-row" style="margin-top:0"><button type="button" id="qToggle" class="switch" onclick="toggleQuiet()">On</button><select id="qStart" class="hsel"></select><span>to</span><select id="qEnd" class="hsel"></select></div>' +
    '<div id="rWarn" class="cwarn"></div>' +
    '<button type="button" class="ghost-link" onclick="testRemind()">🔔 Send a test (arrives in 10 sec, so leave the app)</button>' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Cancel</button>' +
    '<button type="button" class="sbtn sbtn-primary" onclick="saveRemind()">Save</button>' +
    "</div></div>" +
    // --- Custom Mood ---
    '<div id="customSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">New mood</h3>' +
    '<div class="sheet-sub">Pick an emoji, name it, and set its energy.</div>' +
    '<div class="cust-row">' +
    '<input id="cEmoji" class="note-input emoji-input" type="text" maxlength="8" placeholder="🙂" autocomplete="off">' +
    '<input id="cName" class="note-input" type="text" maxlength="30" placeholder="Mood name" autocomplete="off" autocapitalize="words">' +
    "</div>" +
    '<div id="quickEmoji" class="quick"></div>' +
    '<div class="elabel">Energy level</div>' +
    '<div id="cEnergy" class="eseg"></div>' +
    '<div class="cpreview"><span id="pvTitle" class="pv-title"></span><span id="pvDots" class="pv-dots"></span></div>' +
    '<div id="cWarn" class="cwarn"></div>' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Cancel</button>' +
    '<button type="button" id="addBtn" class="sbtn sbtn-primary" onclick="submitCustom()" disabled>Add Mood</button>' +
    "</div></div>" +
    // --- Manage Moods ---
    '<div id="manageSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">Manage moods</h3>' +
    '<div class="sheet-sub">Tap the dots to set energy, or remove a mood. Nothing changes until you save.</div>' +
    '<div id="mHint" class="mhint">Every mood has the same energy right now. Tap the dots to set each one.</div>' +
    '<div id="manageList" class="mlist"></div>' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Cancel</button>' +
    '<button type="button" id="saveBtn" class="sbtn sbtn-primary" onclick="submitManage()" disabled>Save changes</button>' +
    "</div></div>" +
    "<script>initSheet();</script></body></html>"
  );
}

// Reads "?a=1&b=2" from a URL (safe against malformed escapes)
function parseQuery(url) {
  let out = {};
  let q = (url.split("?")[1] || "").split("#")[0];
  q.split("&").forEach((kv) => {
    if (!kv) return;
    let i = kv.indexOf("=");
    let k = i === -1 ? kv : kv.slice(0, i);
    let v = i === -1 ? "" : kv.slice(i + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch (e) {}
  });
  return out;
}

// Called when the in-page "Log Mood" sheet submits. Same reminder format as before:
// title "[Name] <mood title>", notes = optional note.
async function saveMoodFromUrl(url) {
  let q = parseQuery(url || "");
  let idx = parseInt(q.i, 10);
  if (isNaN(idx) || idx < 0 || idx >= moods.length) return;

  let r = new Reminder();
  r.title = "[" + myUserName + "] " + moods[idx].title;
  r.notes = (q.note || "").trim();
  r.calendar = cal;
  await r.save();
}

// Edit sheet -> change mood and/or note on my latest check-in
async function saveEditFromUrl(url) {
  let r = myLatestReminderRef;
  if (!r || typeof r.save !== "function") return;
  let q = parseQuery(url || "");
  let idx = parseInt(q.i, 10);
  if (!isNaN(idx) && idx >= 0 && idx < moods.length) {
    r.title = "[" + myUserName + "] " + moods[idx].title;
  }
  r.notes = (q.note || "").trim();
  await r.save();
}

// Edit sheet -> delete my latest check-in
async function deleteCheckin() {
  let r = myLatestReminderRef;
  if (!r || typeof r.remove !== "function") return;
  await r.remove();
}

// ---- Check-in reminders (local notifications) ----
const REMINDER_ID = "mood-checkin-reminder";

function describeHours(h) {
  if (h >= 48 && h % 24 === 0) return h / 24 + " days";
  return h + (h === 1 ? " hour" : " hours");
}

// If a time falls inside quiet hours, hold it until the quiet window ends
function adjustForQuietHours(date) {
  if (!settings.quietEnabled || settings.quietStart === settings.quietEnd)
    return date;
  let d = new Date(date);
  let h = d.getHours() + d.getMinutes() / 60;
  let s = settings.quietStart;
  let e = settings.quietEnd;
  let inQuiet = s > e ? h >= s || h < e : h >= s && h < e;
  if (!inQuiet) return d;
  let r = new Date(d);
  r.setHours(e, 0, 0, 0);
  if (r.getTime() <= d.getTime()) r.setDate(r.getDate() + 1);
  return r;
}

// Schedules ONE notification: (my latest check-in + chosen hours), adjusted for quiet hours.
// Re-run whenever I open the dashboard, log/edit/delete a mood, or change settings.
async function scheduleCheckInReminder() {
  try {
    if (!settings.reminderHours || !cal) {
      await Notification.removePending([REMINDER_ID]);
      return;
    }
    let all = await Reminder.all([cal]);
    let latest = 0;
    for (let r of all) {
      let title = r.title || "";
      if (title.toLowerCase().includes("avatar")) continue;
      let p = parseMood(title);
      if (p.user.toLowerCase() !== myUserName.toLowerCase()) continue;
      latest = Math.max(latest, getTime(r));
    }
    if (!latest) {
      await Notification.removePending([REMINDER_ID]);
      return;
    }
    let when = adjustForQuietHours(
      new Date(latest + settings.reminderHours * 3600 * 1000),
    );
    // Already overdue (you're looking at the app right now), so nothing to schedule
    if (when.getTime() <= Date.now() + 60 * 1000) {
      await Notification.removePending([REMINDER_ID]);
      return;
    }
    let n = new Notification();
    n.identifier = REMINDER_ID;
    n.title = "How are you feeling?";
    n.body =
      "It's been over " +
      describeHours(settings.reminderHours) +
      " since your last check-in. Tap to log your mood.";
    n.sound = "default";
    n.openURL = "scriptable:///run/" + encodeURIComponent(Script.name());
    n.setTriggerDate(when);
    await n.schedule();
  } catch (e) {
    console.log("Could not schedule reminder: " + e.message);
  }
}

async function sendTestReminder() {
  try {
    let n = new Notification();
    n.identifier = "mood-checkin-test";
    n.title = "How are you feeling?";
    n.body = "Test reminder: this is how your check-in nudge will look.";
    n.sound = "default";
    n.openURL = "scriptable:///run/" + encodeURIComponent(Script.name());
    n.setTriggerDate(new Date(Date.now() + 10 * 1000));
    await n.schedule();
  } catch (e) {
    console.log("Could not send test reminder: " + e.message);
  }
}

// Reminders sheet -> save preferences
async function saveSettingsFromUrl(url) {
  let q = parseQuery(url || "");
  let h = parseInt(q.h, 10);
  let qs = parseInt(q.qs, 10);
  let qe = parseInt(q.qe, 10);
  if (isNaN(h) || h < 0 || h > 168) return;
  if (isNaN(qs) || qs < 0 || qs > 23 || isNaN(qe) || qe < 0 || qe > 23) return;
  settings = {
    reminderHours: h,
    quietEnabled: q.q === "1",
    quietStart: qs,
    quietEnd: qe,
  };
  fm.writeString(settingsPath, JSON.stringify(settings, null, 2));
}

function saveMoodPresets() {
  fm.writeString(configPath, JSON.stringify(moods, null, 2));
}

// Custom Mood sheet -> adds a preset { title, energy }
async function saveCustomFromUrl(url) {
  let q = parseQuery(url || "");
  let title = String(q.t || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  let energy = parseInt(q.e, 10);
  if (!title || isNaN(energy) || energy < 1 || energy > 5) return;
  let exists = moods.some(
    (m) => String(m.title).trim().toLowerCase() === title.toLowerCase(),
  );
  if (exists) return;
  moods.push({ title: title, energy: energy });
  saveMoodPresets();
}

// Manage Moods sheet -> applies energy edits and removals in one save
async function saveManageFromUrl(url) {
  let q = parseQuery(url || "");
  let energies = String(q.e || "")
    .split(",")
    .map((x) => parseInt(x, 10));
  if (
    energies.length !== moods.length ||
    energies.some((n) => isNaN(n) || n < 1 || n > 5)
  )
    return;

  let del = String(q.d || "")
    .split(",")
    .filter((x) => x !== "")
    .map((x) => parseInt(x, 10));
  if (del.some((i) => isNaN(i) || i < 0 || i >= moods.length)) return;

  let kept = [];
  moods.forEach((m, i) => {
    if (del.indexOf(i) !== -1) return;
    kept.push(Object.assign({}, m, { energy: energies[i] }));
  });
  moods = kept;
  saveMoodPresets();
}

async function showMissingListAlert() {
  let a = new Alert();
  a.title = 'List "' + listName + '" not found';
  a.message =
    'Create a Reminders list named "' +
    listName +
    '" (shared with your partner) and run this again. ' +
    "Nothing was written to your other lists.";
  a.addAction("OK");
  await a.present();
}

// Reads scroll position + expanded months from the page so a reload doesn't reset them
const CAPTURE_STATE_JS =
  "JSON.stringify({y:window.scrollY,open:Array.prototype.slice.call(" +
  "document.querySelectorAll('.month-container')).filter(function(e){" +
  "return e.style.display!=='none'}).map(function(e){return e.getAttribute('data-key')})})";

async function captureState(wv) {
  try {
    let raw = await Promise.race([
      wv.evaluateJavaScript(CAPTURE_STATE_JS, false),
      sleep(1500).then(() => null),
    ]);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function restoreScroll(wv, state) {
  if (!state || !state.y) return;
  try {
    await wv.evaluateJavaScript(
      "window.scrollTo(0," + Number(state.y) + ");",
      false,
    );
  } catch (e) {}
}

async function runDashboard() {
  let pending = null;
  let pendingUrl = null;
  let closed = false;

  let wv = new WebView();
  wv.shouldAllowRequest = (req) => {
    let url = req.url || "";
    if (url.indexOf("localhost/saveMood") !== -1) {
      pending = "saveMood";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/saveCustom") !== -1) {
      pending = "saveCustom";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/saveManage") !== -1) {
      pending = "saveManage";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/saveEdit") !== -1) {
      pending = "saveEdit";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/deleteCheckin") !== -1) {
      pending = "deleteCheckin";
      return false;
    }
    if (url.indexOf("localhost/saveSettings") !== -1) {
      pending = "saveSettings";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/testReminder") !== -1) {
      pending = "testReminder";
      return false;
    }
    if (url.indexOf("localhost/changeAvatar") !== -1) {
      pending = "changeAvatar";
      return false;
    }
    if (url.indexOf("localhost/refresh") !== -1) {
      pending = "refresh";
      return false;
    }
    return true;
  };

  await scheduleCheckInReminder();
  await wv.loadHTML(await buildHtml(null), "http://localhost/");
  wv.present(true).then(() => {
    closed = true;
  });

  while (!closed) {
    if (pending) {
      let action = pending;
      let actionUrl = pendingUrl;
      pending = null;
      pendingUrl = null;
      let state = await captureState(wv);
      if (action === "saveMood") await saveMoodFromUrl(actionUrl);
      if (action === "saveCustom") await saveCustomFromUrl(actionUrl);
      if (action === "saveManage") await saveManageFromUrl(actionUrl);
      if (action === "saveEdit") await saveEditFromUrl(actionUrl);
      if (action === "deleteCheckin") await deleteCheckin();
      if (action === "saveSettings") await saveSettingsFromUrl(actionUrl);
      if (action === "testReminder") await sendTestReminder();
      if (action === "changeAvatar") await changeMyAvatar();
      // Keep the "you haven't checked in" notification in step with whatever just changed
      await scheduleCheckInReminder();
      // "refresh" has no action of its own: the reload below is the refresh
      if (!closed) {
        await wv.loadHTML(await buildHtml(state), "http://localhost/");
        await restoreScroll(wv, state);
      }
    } else {
      await sleep(150);
    }
  }
}

if (!cal) {
  await showMissingListAlert();
} else {
  await runDashboard();
}

Script.complete();
