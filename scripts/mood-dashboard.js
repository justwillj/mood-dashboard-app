// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: chart-line;
// ==========================================
// DUAL MOOD DASHBOARD (Collapsible + Long Mock History)
// ==========================================

const myUserName = "You";
const partnerUserName = "Partner";

const listName = "Mood Dashboard";
const fm = FileManager.local();
const configPath = fm.joinPath(fm.documentsDirectory(), "mood_presets.json");

const defaults = [
  "☕ Cozy",
  "🟢 Locked In",
  "🟡 Chill",
  "🔴 Low Battery",
  "🟣 Creative",
];
let moods = fm.fileExists(configPath)
  ? JSON.parse(fm.readString(configPath))
  : defaults;
if (!fm.fileExists(configPath))
  fm.writeString(configPath, JSON.stringify(defaults));

let calendars = await Calendar.forReminders();
let cal = calendars.find(
  (c) => c.title.toLowerCase() === listName.toLowerCase(),
);
if (!cal) cal = await Calendar.defaultForReminders();

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

// ---- MOCK DATA: ~14 months back, generated, never saved to Reminders ----
function buildMockData() {
  let now = new Date();
  let moodPool = [
    "🟢 Locked In",
    "☕ Cozy",
    "🟡 Chill",
    "🔴 Low Battery",
    "🟣 Creative",
    "⚡ Focused",
    "😴 Sleepy",
    "🎉 Celebrating",
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
    "Gym then errands",
    "Family dinner",
    "Reading in bed",
    "Big deadline today",
    "Coffee shop session",
    "Long walk",
    "Game night",
  ];
  let out = [];
  let n = 0;
  let monthsBack = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  monthsBack.forEach(function (m) {
    let slots = m === 0 ? [0, 1, 2] : [0, 1, 2, 3];
    slots.forEach(function (k) {
      let who = n % 2 === 0 ? myUserName : partnerUserName;
      let date;
      if (m === 0) {
        let offsets = [0, 45 * 60000, 5 * 3600000];
        date = new Date(now.getTime() - offsets[k]);
      } else {
        date = new Date(
          now.getFullYear(),
          now.getMonth() - m,
          24 - k * 7,
          8 + ((n * 3) % 13),
          (n * 17) % 60,
        );
      }
      out.push({
        title: "[" + who + "] " + moodPool[(n * 3 + m) % moodPool.length],
        notes: notePool[(n * 5 + m) % notePool.length],
        creationDate: date,
      });
      n++;
    });
  });
  return out;
}

async function buildHtml() {
  let reminders = await Reminder.allIncomplete([cal]);
  if (!reminders || reminders.length === 0) reminders = buildMockData();
  reminders.sort((a, b) => getTime(b) - getTime(a));

  // Latest mood per person
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
  let myMood = myLatest ? myLatest.mood : "No Status";
  let myNote =
    myLatest && myLatest.r.notes ? myLatest.r.notes : "Tap 'Log Mood'";
  let myTime = myLatest ? formatDate(myLatest.r.creationDate) : "--:--";
  let partnerMood = partnerLatest ? partnerLatest.mood : "No Status";
  let partnerNote =
    partnerLatest && partnerLatest.r.notes
      ? partnerLatest.r.notes
      : "No check-in yet";
  let partnerTime = partnerLatest
    ? formatDate(partnerLatest.r.creationDate)
    : "--:--";

  // Group by year -> month (reminders are already newest first)
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
      let open = i === 0 && j === 0;
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
          esc(p.mood) +
          "</div>" +
          (r.notes ? '<div class="note">' + esc(r.notes) + "</div>" : "") +
          '</div><div class="time">' +
          esc(formatDate(r.creationDate)) +
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
    ".hero{flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:16px;box-sizing:border-box}",
    ".hero-label{font-size:10px;color:#818cf8;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px}",
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
    "</script></head><body>" +
    "<h2>Dashboard</h2>" +
    '<div class="dual-container">' +
    '<div class="hero"><div class="hero-label">YOU (' +
    esc(myUserName) +
    ')</div><div class="hero-title">' +
    esc(myMood) +
    "</div>" +
    '<div class="note" style="margin-bottom:8px;">"' +
    esc(myNote) +
    '"</div><div class="time" style="text-align:left">' +
    esc(myTime) +
    "</div></div>" +
    '<div class="hero"><div class="hero-label">' +
    esc(partnerUserName) +
    '</div><div class="hero-title">' +
    esc(partnerMood) +
    "</div>" +
    '<div class="note" style="margin-bottom:8px;">"' +
    esc(partnerNote) +
    '"</div><div class="time" style="text-align:left">' +
    esc(partnerTime) +
    "</div></div>" +
    "</div>" +
    '<a class="btn" href="http://localhost/log">📝 Log Mood</a>' +
    '<a class="btn btn-sec" href="http://localhost/create">➕ Custom Mood</a>' +
    '<h3 style="font-size:16px;color:rgba(255,255,255,0.8);margin:24px 0 10px 0;">History Feed</h3>' +
    "<div>" +
    historyHtml +
    "</div></body></html>"
  );
}

async function logMood() {
  let a = new Alert();
  a.title = "Log Mood (" + myUserName + ")";
  a.message = "Select your current status:";
  a.addTextField("Add an optional note...", "");
  moods.forEach((m) => a.addAction(m));
  a.addCancelAction("Cancel");
  let res = await a.presentAlert();
  if (res === -1) return;
  let r = new Reminder();
  r.title = "[" + myUserName + "] " + moods[res];
  r.notes = a.textFieldValue(0) || "";
  r.calendar = cal;
  await r.save();
}

async function createMood() {
  let a = new Alert();
  a.title = "Create Custom Mood";
  a.message = "Enter a new mood title:";
  a.addTextField("e.g. ⚡ Focused", "");
  a.addAction("Save Mood");
  a.addCancelAction("Cancel");
  let res = await a.presentAlert();
  if (res === -1) return;
  let name = a.textFieldValue(0).trim();
  if (name) {
    moods.push(name);
    fm.writeString(configPath, JSON.stringify(moods));
  }
}

let pending = null;
let closed = false;

let wv = new WebView();
wv.shouldAllowRequest = (req) => {
  let url = req.url || "";
  if (url.indexOf("localhost/log") !== -1) {
    pending = "log";
    return false;
  }
  if (url.indexOf("localhost/create") !== -1) {
    pending = "create";
    return false;
  }
  return true;
};

await wv.loadHTML(await buildHtml(), "http://localhost/");
wv.present(true).then(() => {
  closed = true;
}); // don't await

while (!closed) {
  if (pending) {
    let action = pending;
    pending = null;
    if (action === "log") await logMood();
    if (action === "create") await createMood();
    if (!closed) await wv.loadHTML(await buildHtml(), "http://localhost/");
  } else {
    await sleep(150);
  }
}

Script.complete();
