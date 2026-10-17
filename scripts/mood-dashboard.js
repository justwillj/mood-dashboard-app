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

// Builds the page script for the "Log Mood" bottom sheet.
// The sheet runs inside the WebView; on submit it navigates to
// http://localhost/saveMood?i=<index>&note=<text>, which Scriptable intercepts.
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
      dots: "●".repeat(lvl) + "○".repeat(5 - lvl),
    };
  });
  let json = JSON.stringify(sheetMoods).replace(/</g, "\\u003c");

  return `
var MOODS = __MOODS__;
var selected = -1;
function $(id) { return document.getElementById(id); }
function initSheet() {
  var g = $("moodGrid");
  if (!MOODS.length) {
    g.innerHTML = '<div class="sheet-empty">No moods yet. Close this and tap Custom Mood to add one.</div>';
  } else {
    var h = "";
    for (var i = 0; i < MOODS.length; i++) {
      var m = MOODS[i];
      h += '<button type="button" class="chip" id="chip_' + i + '" onclick="pick(' + i + ')">' +
        '<span class="chip-emoji' + (m.ini ? ' ini' : '') + '">' + m.emoji + '</span>' +
        '<span class="chip-label">' + m.label + '</span>' +
        '<span class="cdots">' + m.dots + '</span></button>';
    }
    g.innerHTML = h;
  }
  $("noteInput").addEventListener("keydown", function (e) { if (e.key === "Enter") { submitMood(); } });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitSheet);
    window.visualViewport.addEventListener("scroll", fitSheet);
  }
}
function pick(i) {
  selected = i;
  for (var k = 0; k < MOODS.length; k++) { $("chip_" + k).className = (k === i) ? "chip sel" : "chip"; }
  $("logBtn").disabled = false;
}
function fitSheet() {
  var vv = window.visualViewport;
  if (!vv) { return; }
  var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  $("sheet").style.bottom = kb + "px";
  $("sheet").style.maxHeight = Math.max(240, Math.floor(vv.height - 24)) + "px";
}
function openSheet() {
  selected = -1;
  $("noteInput").value = "";
  $("logBtn").disabled = true;
  for (var k = 0; k < MOODS.length; k++) { $("chip_" + k).className = "chip"; }
  $("backdrop").className = "backdrop show";
  $("sheet").className = "sheet show";
  document.body.style.overflow = "hidden";
  fitSheet();
}
function closeSheet() {
  $("noteInput").blur();
  $("backdrop").className = "backdrop";
  $("sheet").className = "sheet";
  $("sheet").style.bottom = "0px";
  document.body.style.overflow = "";
}
function submitMood() {
  if (selected < 0 || $("logBtn").disabled) { return; }
  $("logBtn").disabled = true;
  window.location.href = "http://localhost/saveMood?i=" + selected + "&note=" + encodeURIComponent($("noteInput").value);
}
`.replace("__MOODS__", () => json);
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
    '<div class="top-bar"><h2>Dashboard</h2>' +
    '<a class="refresh" href="http://localhost/refresh">↻ Refresh</a></div>' +
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
    '<div onclick="window.location.href=\'http://localhost/editMyMood\'" class="hero-clickable">' +
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
    '<div class="btn" style="cursor:pointer" onclick="openSheet()">📝 Log Mood</div>' +
    '<div class="btn-row">' +
    '<a class="btn btn-sec" href="http://localhost/create">➕ Custom Mood</a>' +
    '<a class="btn btn-sec" href="http://localhost/delete">🗑️ Manage Moods</a>' +
    "</div>" +
    '<h3 style="font-size:16px;color:rgba(255,255,255,0.8);margin:24px 0 10px 0;">History Feed</h3>' +
    "<div>" +
    historyHtml +
    "</div>" +
    // LOG MOOD BOTTOM SHEET
    '<div id="backdrop" class="backdrop" onclick="closeSheet()"></div>' +
    '<div id="sheet" class="sheet">' +
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

async function editMyMood() {
  if (!myLatestReminderRef) {
    let errAlert = new Alert();
    errAlert.title = "No Status Found";
    errAlert.message = "Log a mood first before editing!";
    errAlert.addAction("OK");
    await errAlert.present();
    return;
  }

  let p = parseMood(myLatestReminderRef.title);

  let menuAlert = new Alert();
  menuAlert.title = "Edit Current Status";
  menuAlert.message = "Status: " + faceify(p.mood);
  menuAlert.addAction("✏️ Edit Note");
  menuAlert.addAction("🔄 Change Mood Status");
  menuAlert.addAction("🗑️ Delete This Check-in");
  menuAlert.addCancelAction("Cancel");

  let choice = await menuAlert.presentAlert();
  if (choice === -1) return;

  if (choice === 0) {
    let noteAlert = new Alert();
    noteAlert.title = "Update Note";
    noteAlert.addTextField("Your note...", myLatestReminderRef.notes || "");
    noteAlert.addAction("Save Note");
    noteAlert.addCancelAction("Cancel");

    let res = await noteAlert.presentAlert();
    if (res === -1) return;

    myLatestReminderRef.notes = noteAlert.textFieldValue(0);
    await myLatestReminderRef.save();
  } else if (choice === 1) {
    let moodAlert = new Alert();
    moodAlert.title = "Select New Mood";
    moods.forEach((m) => moodAlert.addAction(faceify(m.title)));
    moodAlert.addCancelAction("Cancel");

    let res = await moodAlert.presentAlert();
    if (res === -1) return;

    myLatestReminderRef.title = "[" + myUserName + "] " + moods[res].title;
    await myLatestReminderRef.save();
  } else if (choice === 2) {
    let delAlert = new Alert();
    delAlert.title = "Delete Check-in?";
    delAlert.message = "This will remove your latest mood check-in.";
    delAlert.addAction("Delete");
    delAlert.addCancelAction("Cancel");

    let res = await delAlert.presentAlert();
    if (res === -1) return;

    await myLatestReminderRef.remove();
  }
}

async function createMood() {
  let a = new Alert();
  a.title = "Create Custom Mood";
  a.message = "Enter a new mood title:";
  a.addTextField("e.g. 🚀 Hype Mode", "");
  a.addAction("Next: Set Energy");
  a.addCancelAction("Cancel");

  let res = await a.presentAlert();
  if (res === -1) return;

  let name = a.textFieldValue(0).trim();
  if (!name) return;

  let eAlert = new Alert();
  eAlert.title = "Select Energy Level";
  eAlert.message = "Choose circle dots for: " + name;

  eAlert.addAction("●●●●● (5 - Max)");
  eAlert.addAction("●●●●○ (4 - High)");
  eAlert.addAction("●●●○○ (3 - Medium)");
  eAlert.addAction("●●○○○ (2 - Low-Medium)");
  eAlert.addAction("●○○○○ (1 - Low)");
  eAlert.addCancelAction("Cancel");

  let eRes = await eAlert.presentAlert();
  if (eRes === -1) return;

  let energyValue = 5 - eRes;

  moods.push({ title: name, energy: energyValue });
  fm.writeString(configPath, JSON.stringify(moods, null, 2));
}

async function deleteMood() {
  if (moods.length === 0) {
    let errAlert = new Alert();
    errAlert.title = "No Moods";
    errAlert.message = "There are no saved moods to delete.";
    errAlert.addAction("OK");
    await errAlert.present();
    return;
  }

  let dAlert = new Alert();
  dAlert.title = "Manage / Delete Moods";
  dAlert.message = "Select a mood preset to remove:";

  moods.forEach((m) => dAlert.addAction("🗑️ " + faceify(m.title)));
  dAlert.addCancelAction("Cancel");

  let res = await dAlert.presentAlert();
  if (res === -1) return;

  let selectedMood = moods[res];

  let confirmAlert = new Alert();
  confirmAlert.title = "Confirm Deletion";
  confirmAlert.message =
    "Are you sure you want to delete '" + faceify(selectedMood.title) + "'?";
  confirmAlert.addAction("Delete");
  confirmAlert.addCancelAction("Cancel");

  let cRes = await confirmAlert.presentAlert();
  if (cRes === -1) return;

  moods.splice(res, 1);
  fm.writeString(configPath, JSON.stringify(moods, null, 2));
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
    if (url.indexOf("localhost/create") !== -1) {
      pending = "create";
      return false;
    }
    if (url.indexOf("localhost/delete") !== -1) {
      pending = "delete";
      return false;
    }
    if (url.indexOf("localhost/editMyMood") !== -1) {
      pending = "editMyMood";
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
      if (action === "create") await createMood();
      if (action === "delete") await deleteMood();
      if (action === "editMyMood") await editMyMood();
      if (action === "changeAvatar") await changeMyAvatar();
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
