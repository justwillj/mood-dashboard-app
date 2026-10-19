// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: chart-line;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: chart-line;
// ==========================================
// MOOD DASHBOARD (REDESIGNED LAYOUT & SAFE AVATAR SYNC)
// ==========================================

let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch (e) {
  fm = FileManager.local();
}

const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");

let myUserName = "You";
let partnerUserName = "Partner";
let listName = "Mood Dashboard";

if (fm.fileExists(userConfigPath)) {
  try {
    let config = JSON.parse(fm.readString(userConfigPath));
    myUserName = (config.myUserName || "You").trim();
    partnerUserName = (config.partnerUserName || "Partner").trim();
    listName = (config.listName || "Mood Dashboard").trim();
  } catch (e) {
    console.log("Could not read user_config.json, using defaults.");
  }
}

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

function findCalendar(name) {
  let n = String(name || "")
    .trim()
    .toLowerCase();
  return calendars.find((c) => c.title.trim().toLowerCase() === n) || null;
}

// ---- Friends ("circles"): each friend has their OWN shared Reminders list ----
const circlesPath = fm.joinPath(fm.documentsDirectory(), "mood_circles.json");
let circles = [];
let activeCircle = 0;

function cleanCircle(c) {
  if (!c || typeof c.partner !== "string" || typeof c.list !== "string")
    return null;
  let partner = c.partner.trim().slice(0, 40);
  let list = c.list.trim().slice(0, 80);
  if (!partner || !list) return null;
  return { partner: partner, list: list, autoShare: c.autoShare !== false };
}

function loadCircles() {
  let list = [];
  let active = 0;
  if (fm.fileExists(circlesPath)) {
    try {
      let saved = JSON.parse(fm.readString(circlesPath));
      let seen = {};
      (Array.isArray(saved.circles) ? saved.circles : []).forEach((c) => {
        let cc = cleanCircle(c);
        if (cc && !seen[cc.partner.toLowerCase()]) {
          seen[cc.partner.toLowerCase()] = true;
          list.push(cc);
        }
      });
      active = clampInt(saved.active, 0, Math.max(0, list.length - 1), 0);
    } catch (e) {
      console.log("Could not read mood_circles.json, using defaults.");
    }
  }
  // First run (or unreadable file): one friend, from user_config.json
  if (!list.length)
    list = [{ partner: partnerUserName, list: listName, autoShare: true }];
  circles = list;
  activeCircle = active;
}

function saveCircles() {
  fm.writeString(
    circlesPath,
    JSON.stringify({ circles: circles, active: activeCircle }, null, 2),
  );
}

let cal = null;
// Points the whole dashboard at the active friend's list and name
function applyActiveCircle() {
  partnerUserName = circles[activeCircle].partner;
  cal = findCalendar(circles[activeCircle].list);
}

loadCircles();
applyActiveCircle();

// Widgets open the dashboard with ?friend=<Name> so it lands on the same friend
{
  let fq = args.queryParameters && args.queryParameters.friend;
  if (fq) {
    let i = circles.findIndex(
      (c) => c.partner.toLowerCase() === String(fq).trim().toLowerCase(),
    );
    if (i !== -1 && i !== activeCircle) {
      activeCircle = i;
      applyActiveCircle();
      saveCircles();
    }
  }
}
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

    // Saved into every shared list that has sharing switched on
    for (let k of shareCalendars()) {
      let allReminders = await Reminder.all([k]);
      let myAvatarReminder = allReminders.find((r) =>
        isAvatarFor(r, myUserName),
      );

      if (!myAvatarReminder) {
        myAvatarReminder = new Reminder();
        myAvatarReminder.title = myUserName + " Avatar";
        myAvatarReminder.calendar = k;
      }

      myAvatarReminder.notes = base64String;
      await myAvatarReminder.save();
    }
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

// ---- Conventions stored in the shared Reminders list ----
// Last line of a check-in's notes when "no reply needed" is switched on
const NO_REPLY_MARK = "🔕 No reply needed";
// Built-in "no check-ins needed" mood (works on both phones, no preset required)
const REST_TITLE = "🌙 Resting";
// A "Helps: <Name>" reminder holds that person's "what helps" cards as JSON in its notes
const HELPS_PREFIX = "Helps: ";

// Reminders that store data (avatars, help cards) rather than a mood check-in
function isDataTitle(title) {
  let t = String(title || "")
    .toLowerCase()
    .trim();
  return (
    t.includes("avatar") || t.startsWith("helps:") || t.startsWith("love:")
  );
}

function isRestingMood(mood) {
  return String(mood || "")
    .trim()
    .toLowerCase()
    .startsWith("🌙 resting");
}

// ---- Capacity line: "📊 Energy 3/5 · Social 2/5 · Sensory 4/5 · Talk: text" ----
// Stored on its own line in a check-in's notes. Energy is written with every check-in so
// trends stay accurate even for moods that aren't in the other phone's preset list.
const CAP_MARK = "📊";

function parseCapLine(line) {
  let cap = {};
  String(line)
    .replace(CAP_MARK, "")
    .split("·")
    .forEach((part) => {
      let p = part.trim();
      let m = p.match(/^(Energy|Social|Sensory)\s+([1-5])\/5$/i);
      if (m) {
        cap[m[1].toLowerCase()] = parseInt(m[2], 10);
        return;
      }
      let t = p.match(/^Talk:\s*(ok|text|none)$/i);
      if (t) cap.talk = t[1].toLowerCase();
    });
  return cap;
}

function formatCapLine(cap) {
  if (!cap) return "";
  let parts = [];
  if (cap.energy != null) parts.push("Energy " + cap.energy + "/5");
  if (cap.social != null) parts.push("Social " + cap.social + "/5");
  if (cap.sensory != null) parts.push("Sensory " + cap.sensory + "/5");
  if (cap.talk) parts.push("Talk: " + cap.talk);
  return parts.length ? CAP_MARK + " " + parts.join(" · ") : "";
}

// Splits a reminder's notes into the visible note, the capacity values and the "no reply needed" flag
function splitNotes(raw) {
  let keep = [];
  let noReply = false;
  let cap = {};
  String(raw || "")
    .split("\n")
    .forEach((line) => {
      let l = line.trim();
      if (l === NO_REPLY_MARK) noReply = true;
      else if (l.startsWith(CAP_MARK)) cap = parseCapLine(l);
      else if (l) keep.push(l);
    });
  return { text: keep.join(" "), noReply: noReply, cap: cap };
}

// Builds notes text: note, then the capacity line, then the "no reply needed" marker
function buildNotes(text, noReply, cap) {
  let clean = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== NO_REPLY_MARK && !l.startsWith(CAP_MARK))
    .join(" ");
  let lines = [];
  if (clean) lines.push(clean);
  let capLine = formatCapLine(cap);
  if (capLine) lines.push(capLine);
  if (noReply) lines.push(NO_REPLY_MARK);
  return lines.join("\n");
}

// social / sensory / talk from "?soc=2&sen=4&talk=text" style values
function capFromQuery(q) {
  let cap = {};
  let soc = parseInt(q.soc, 10);
  let sen = parseInt(q.sen, 10);
  if (soc >= 1 && soc <= 5) cap.social = soc;
  if (sen >= 1 && sen <= 5) cap.sensory = sen;
  if (["ok", "text", "none"].indexOf(q.talk) !== -1) cap.talk = q.talk;
  return cap;
}

// Energy (1-5) of one of MY presets by exact title; null for Resting / unknown
function energyOfTitle(title) {
  if (isRestingMood(title)) return null;
  let key = String(title || "")
    .trim()
    .toLowerCase();
  let p = moods.find((m) => String(m.title).trim().toLowerCase() === key);
  return p && p.energy != null ? Math.max(1, Math.min(5, p.energy)) : null;
}

function capChipsHtml(cap) {
  if (!cap) return "";
  let chips = [];
  let talkWords = {
    ok: "🗣️ Okay to talk",
    text: "💬 Text only",
    none: "🔇 No talking",
  };
  if (cap.social != null)
    chips.push(
      '<span class="cap-chip' +
        (cap.social <= 2 ? " warn" : "") +
        '">🔋 Social ' +
        cap.social +
        "/5</span>",
    );
  if (cap.sensory != null)
    chips.push(
      '<span class="cap-chip' +
        (cap.sensory >= 4 ? " warn" : "") +
        '">🔊 Sensory ' +
        cap.sensory +
        "/5</span>",
    );
  if (cap.talk)
    chips.push(
      '<span class="cap-chip' +
        (cap.talk === "none" ? " warn" : "") +
        '">' +
        talkWords[cap.talk] +
        "</span>",
    );
  return chips.length
    ? '<div class="cap-chips">' + chips.join("") + "</div>"
    : "";
}

// ---- Trends (per day, from check-ins) ----
const LOW_ENERGY = 2; // a day averaging 2 or below counts as a low-energy day

function dayKey(d) {
  return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
}
function avgOf(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}
function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

// One entry per check-in by this person: { t, energy, resting, social, sensory, talk }
function collectEntries(list, userName) {
  let out = [];
  for (let r of list) {
    if (isDataTitle(r.title) || !r.creationDate) continue;
    let p = parseMood(r.title || "");
    if (p.user.toLowerCase() !== userName.toLowerCase()) continue;
    let ns = splitNotes(r.notes);
    let resting = isRestingMood(p.mood);
    let energy = null;
    if (!resting)
      energy = ns.cap.energy != null ? ns.cap.energy : energyFor(p.mood);
    out.push({
      t: new Date(r.creationDate).getTime(),
      energy: energy,
      resting: resting,
      social: ns.cap.social != null ? ns.cap.social : null,
      sensory: ns.cap.sensory != null ? ns.cap.sensory : null,
      talk: ns.cap.talk || null,
    });
  }
  return out;
}

// Daily summary for the last R days, the R days before that, and a "low lately" alert (last 7 days)
function summarizeTrend(entries, R) {
  let groups = {};
  entries.forEach((e) => {
    let k = dayKey(new Date(e.t));
    (groups[k] = groups[k] || []).push(e);
  });
  let today = new Date();
  today.setHours(0, 0, 0, 0);

  function dayInfo(offset) {
    let d = new Date(today);
    d.setDate(d.getDate() - offset);
    let g = groups[dayKey(d)] || [];
    let es = g.filter((e) => e.energy != null).map((e) => e.energy);
    return {
      l: MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate(),
      c: g.length,
      e: es.length ? round1(avgOf(es)) : null,
      r: g.some((e) => e.resting) ? 1 : 0,
      soc: g.filter((e) => e.social != null).map((e) => e.social),
      sen: g.filter((e) => e.sensory != null).map((e) => e.sensory),
      cant: g.some((e) => e.talk === "none") ? 1 : 0,
    };
  }
  let days = [];
  for (let i = R - 1; i >= 0; i--) days.push(dayInfo(i));
  let prev = [];
  for (let i = 2 * R - 1; i >= R; i--) prev.push(dayInfo(i));
  let last7 = [];
  for (let i = 6; i >= 0; i--) last7.push(dayInfo(i));

  let lowOf = (a) => a.filter((x) => x.e != null && x.e <= LOW_ENERGY).length;
  let withE = (a) => a.filter((x) => x.e != null);
  let flat = (a, k) => a.reduce((acc, x) => acc.concat(x[k]), []);

  let low7 = lowOf(last7);
  let withE7 = withE(last7).length;
  // Alert: low on 3+ of the last 7 days AND on at least 60% of the days that have an energy reading
  let alert =
    low7 >= 3 && withE7 > 0 && low7 >= 0.6 * withE7
      ? { low: low7, days: 7 }
      : null;

  let socAll = flat(days, "soc");
  let senAll = flat(days, "sen");
  let prevE = withE(prev);
  return {
    days: days.map((x) => ({ l: x.l, c: x.c, e: x.e, r: x.r })),
    stats: {
      checkin: days.filter((x) => x.c > 0).length,
      total: R,
      avg: round1(avgOf(withE(days).map((x) => x.e))),
      prev: prevE.length ? round1(avgOf(prevE.map((x) => x.e))) : null,
      low: lowOf(days),
      withE: withE(days).length,
      rest: days.filter((x) => x.r).length,
      soc: round1(avgOf(socAll)),
      socN: socAll.length,
      sen: round1(avgOf(senAll)),
      senN: senAll.length,
      cant: days.filter((x) => x.cant).length,
    },
    alert: alert,
  };
}

function isHelpsFor(reminder, name) {
  let t = ((reminder && reminder.title) || "").trim().toLowerCase();
  return t === (HELPS_PREFIX + name).trim().toLowerCase();
}

// "What helps" cards: [{ m: mood title, or "*" for general, t: text }]
function sanitizeHelps(list) {
  let out = [];
  let seen = {};
  for (let c of list) {
    if (!c || typeof c.m !== "string" || typeof c.t !== "string") continue;
    let m = c.m.trim().slice(0, 80);
    let t = c.t.trim().slice(0, 240);
    if (!m || !t) continue;
    let k = m.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    out.push({ m: m, t: t });
    if (out.length >= 30) break;
  }
  return out;
}

function parseHelps(reminder) {
  if (!reminder || !reminder.notes) return [];
  try {
    let list = JSON.parse(reminder.notes);
    return Array.isArray(list) ? sanitizeHelps(list) : [];
  } catch (e) {
    return [];
  }
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

function energyDotsHtml(mood, forced) {
  let e = forced != null ? forced : energyFor(mood);
  if (e == null) return "";
  let lvl = Math.max(1, Math.min(5, e));
  return (
    '<span class="dots">' + "●".repeat(lvl) + "○".repeat(5 - lvl) + "</span>"
  );
}

let myLatestReminderRef = null;
let helpsState = { mine: [], partner: [], pKey: "", pMood: "" };
let trendState = { names: ["", ""], me: {}, partner: {} };
let entriesState = {};
let loveState = { sent: 0, max: 3, to: "" };

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
  let mine = {
    has: false,
    mood: "",
    note: "",
    nr: false,
    cap: [0, 0, 0],
    time: "",
    idx: -1,
  };
  if (myLatestReminderRef) {
    let mp = parseMood(myLatestReminderRef.title || "");
    let key = String(mp.mood).trim().toLowerCase();
    let ns = splitNotes(myLatestReminderRef.notes);
    mine = {
      has: true,
      mood: faceify(mp.mood),
      note: ns.text,
      nr: ns.noReply,
      cap: [
        ns.cap.social || 0,
        ns.cap.sensory || 0,
        ["ok", "text", "none"].indexOf(ns.cap.talk) + 1,
      ],
      id: myLatestReminderRef.identifier || "",
      time: relTime(myLatestReminderRef.creationDate),
      // -2 = the built-in Resting status
      idx: isRestingMood(mp.mood)
        ? -2
        : moods.findIndex((m) => String(m.title).trim().toLowerCase() === key),
    };
  }
  let settingsData = {
    hours: settings.reminderHours,
    quietOn: settings.quietEnabled,
    qs: settings.quietStart,
    qe: settings.quietEnd,
  };
  let helpsData = {
    mine: helpsState.mine,
    partner: helpsState.partner,
    pName: partnerUserName,
    pMood: helpsState.pMood,
    pKey: helpsState.pKey,
  };
  let data = {
    MOODS: json,
    MINE: safe(mine),
    SETTINGS: safe(settingsData),
    HELPS: safe(helpsData),
    TREND: safe(trendState),
    ENTRIES: safe(entriesState),
    LOVE: safe(
      Object.assign({}, loveState, {
        kinds: Object.keys(LOVE_KINDS).map((k) => ({
          k: k,
          e: LOVE_KINDS[k][0],
          t: LOVE_KINDS[k][1],
        })),
      }),
    ),
    CIRCLES: safe({
      active: activeCircle,
      me: myUserName,
      list: circles.map((c) => ({
        n: c.partner,
        l: c.list,
        auto: c.autoShare ? 1 : 0,
      })),
    }),
  };

  return `
var MOODS = __MOODS__;
var MINE = __MINE__;
var SETTINGS = __SETTINGS__;
var HELPS = __HELPS__;
var TREND = __TREND__;
var ENTRIES = __ENTRIES__;
var LOVE = __LOVE__;
var CIRCLES = __CIRCLES__;
var EDIT_ID = "";
var shareSel = [];
var fAuto = [];
var fDel = [];
var fListEdited = false;
var loveSel = "";
var nr = [false, false];
var CAPW = [[0, 0, 0], [0, 0, 0]];
var capShown = [false, false];
var tWho = 1;
var tRange = 14;
var helpRows = [];
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
function eh(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function chipsHtml(prefix, handler) {
  var h = '<button type="button" class="chip rest-chip" id="' + prefix + 'rest" onclick="' + handler + '(-2)">' +
    '<span class="chip-emoji">🌙</span><span class="chip-label">Resting</span>' +
    '<span class="rest-sub">No check-ins needed. Reminders pause.</span></button>';
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
  $("moodGrid").innerHTML = chipsHtml("chip_", "pick") + (MOODS.length ? "" : emptyMsg);
  $("editGrid").innerHTML = chipsHtml("echip_", "pickEdit") + (MOODS.length ? "" : emptyMsg);
  $("fName").addEventListener("input", function () {
    if (!fListEdited) { var v = $("fName").value.trim(); $("fList").value = v ? "Mood Dashboard - " + v : ""; }
    updateAdd();
  });
  $("fList").addEventListener("input", function () { fListEdited = true; updateAdd(); });
  $("capHost0").innerHTML = capHtml(0);
  $("capHost1").innerHTML = capHtml(1);
  $("tw0l").textContent = TREND.names[0];
  $("tw1l").textContent = TREND.names[1];
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
function renderNr() {
  $("nrBtn0").className = nr[0] ? "switch on" : "switch";
  $("nrBtn1").className = nr[1] ? "switch on" : "switch";
}
function toggleNr(w) { nr[w] = !nr[w]; renderNr(); }
function renderPick() {
  $("chip_rest").className = (selected === -2) ? "chip rest-chip sel" : "chip rest-chip";
  for (var k = 0; k < MOODS.length; k++) { $("chip_" + k).className = (k === selected) ? "chip sel" : "chip"; }
}
function openLog() {
  selected = -1;
  $("noteInput").value = "";
  $("logBtn").disabled = true;
  nr[0] = false;
  renderNr();
  resetCap(0, [0, 0, 0]);
  renderPick();
  shareSel = [];
  var anyOn = false;
  for (var si = 0; si < CIRCLES.list.length; si++) { shareSel.push(!!CIRCLES.list[si].auto); if (CIRCLES.list[si].auto) { anyOn = true; } }
  if (!anyOn) { shareSel[CIRCLES.active] = true; }
  renderShare();
  var sb = $("sameBtn");
  sb.disabled = false;
  if (MINE.has) { sb.style.display = "flex"; sb.textContent = "↺ Same as last: " + MINE.mood; } else { sb.style.display = "none"; }
  showSheet("logSheet");
}
function pick(i) {
  selected = i;
  renderPick();
  $("logBtn").disabled = false;
}
function submitMood() {
  if (selected === -1 || $("logBtn").disabled) { return; }
  $("logBtn").disabled = true;
  window.location.href = "http://localhost/saveMood?i=" + (selected === -2 ? "rest" : selected) + "&nr=" + (nr[0] ? 1 : 0) + capQuery(0) + shareQuery() + "&note=" + encodeURIComponent($("noteInput").value);
}
function submitSame() {
  $("sameBtn").disabled = true;
  window.location.href = "http://localhost/saveSame" + (shareQuery() ? "?" + shareQuery().slice(1) : "");
}

// ----- Edit current check-in -----
function openEdit(id) {
  var key = id || MINE.id;
  var e = ENTRIES[key];
  if (!e) { openLog(); return; }
  EDIT_ID = key;
  editSel = e.idx;
  $("editNote").value = e.note;
  nr[1] = !!e.nr;
  renderNr();
  resetCap(1, e.cap);
  $("editSub").textContent = "Currently " + e.mood + " · " + e.time + (CIRCLES.list.length > 1 ? ". Changes apply to " + CIRCLES.list[CIRCLES.active].n + "'s list only." : "");
  $("editSaveBtn").disabled = false;
  renderEdit();
  resetDelete();
  showSheet("editSheet");
}
function pickEdit(i) { editSel = i; renderEdit(); }
function renderEdit() {
  $("echip_rest").className = (editSel === -2) ? "chip rest-chip sel" : "chip rest-chip";
  for (var k = 0; k < MOODS.length; k++) { $("echip_" + k).className = (k === editSel) ? "chip sel" : "chip"; }
}
function submitEdit() {
  if ($("editSaveBtn").disabled) { return; }
  $("editSaveBtn").disabled = true;
  window.location.href = "http://localhost/saveEdit?id=" + encodeURIComponent(EDIT_ID) + "&i=" + (editSel === -2 ? "rest" : editSel) + "&nr=" + (nr[1] ? 1 : 0) + capQuery(1) + "&note=" + encodeURIComponent($("editNote").value);
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
  window.location.href = "http://localhost/deleteEntry?id=" + encodeURIComponent(EDIT_ID);
}

// ----- Friends (a separate shared list for each) -----
function renderShare() {
  var host = $("shareRow");
  if (CIRCLES.list.length < 2) { host.style.display = "none"; return; }
  var h = '<div class="caplabel">Share this check-in with</div><div class="share-chips">';
  for (var i = 0; i < CIRCLES.list.length; i++) {
    h += '<button type="button" class="switch' + (shareSel[i] ? ' on' : '') + '" onclick="toggleShare(' + i + ')">' + eh(CIRCLES.list[i].n) + '</button>';
  }
  host.innerHTML = h + '</div>';
  host.style.display = "block";
}
function toggleShare(i) {
  var on = 0;
  for (var k = 0; k < shareSel.length; k++) { if (shareSel[k]) { on++; } }
  if (shareSel[i] && on === 1) { return; }
  shareSel[i] = !shareSel[i];
  renderShare();
}
function shareQuery() {
  if (CIRCLES.list.length < 2) { return ""; }
  var t = [];
  for (var i = 0; i < shareSel.length; i++) { if (shareSel[i]) { t.push(i); } }
  return "&to=" + t.join(",");
}
function openFriends() {
  fAuto = [];
  fDel = [];
  for (var i = 0; i < CIRCLES.list.length; i++) { fAuto.push(!!CIRCLES.list[i].auto); fDel.push(false); }
  $("fName").value = "";
  $("fList").value = "";
  fListEdited = false;
  $("fAddBtn").disabled = true;
  renderFriends();
  showSheet("friendsSheet");
}
function renderFriends() {
  var n = CIRCLES.list.length;
  var remaining = 0;
  var changed = false;
  var i;
  for (i = 0; i < n; i++) { if (!fDel[i]) { remaining++; } }
  var h = "";
  for (i = 0; i < n; i++) {
    var c = CIRCLES.list[i];
    if (fDel[i] || (fAuto[i] ? 1 : 0) !== c.auto) { changed = true; }
    var lock = (!fDel[i] && remaining <= 1);
    h += '<div class="mrow' + (fDel[i] ? ' removed' : '') + '"><div class="mrow-top"><span class="mrow-label">' + eh(c.n) + '</span>' +
      '<button type="button" class="trash"' + (lock ? ' disabled style="opacity:0.3"' : '') + ' onclick="toggleFDel(' + i + ')">' + (fDel[i] ? 'Undo' : '🗑️') + '</button></div>' +
      '<div class="friend-list-name">List: ' + eh(c.l) + '</div>' +
      '<div class="mrow-energy"><button type="button" class="switch' + (fAuto[i] ? ' on' : '') + '" onclick="toggleFAuto(' + i + ')">' + (fAuto[i] ? 'Sharing my check-ins' : 'Not sharing') + '</button></div></div>';
  }
  $("friendList").innerHTML = h;
  $("fSaveBtn").disabled = !changed;
}
function toggleFAuto(i) { fAuto[i] = !fAuto[i]; renderFriends(); }
function toggleFDel(i) { fDel[i] = !fDel[i]; renderFriends(); }
function updateAdd() { $("fAddBtn").disabled = !($("fName").value.trim() && $("fList").value.trim()); }
function addFriend() {
  if ($("fAddBtn").disabled) { return; }
  $("fAddBtn").disabled = true;
  window.location.href = "http://localhost/addFriend?n=" + encodeURIComponent($("fName").value.trim()) + "&l=" + encodeURIComponent($("fList").value.trim());
}
function saveFriends() {
  if ($("fSaveBtn").disabled) { return; }
  $("fSaveBtn").disabled = true;
  var flags = [];
  var dels = [];
  for (var i = 0; i < fAuto.length; i++) { flags.push(fAuto[i] ? 1 : 0); if (fDel[i]) { dels.push(i); } }
  window.location.href = "http://localhost/saveFriends?s=" + flags.join(",") + "&d=" + dels.join(",");
}

// ----- Async Love -----
function openLove() {
  loveSel = "";
  $("loveNote").value = "";
  var h = "";
  for (var i = 0; i < LOVE.kinds.length; i++) {
    var k = LOVE.kinds[i];
    h += '<button type="button" class="chip" id="love_' + k.k + '" onclick="pickLove(' + i + ')"><span class="chip-emoji">' + k.e + '</span><span class="chip-label">' + eh(k.t) + '</span></button>';
  }
  $("loveGrid").innerHTML = h;
  $("loveTitle").textContent = "Send love to " + LOVE.to;
  $("loveLimit").textContent = LOVE.sent >= LOVE.max ? "That is plenty for today. They will feel it." : (LOVE.sent > 0 ? "You have sent " + LOVE.sent + " today (up to " + LOVE.max + ")." : "");
  $("loveSendBtn").disabled = true;
  showSheet("loveSheet");
}
function pickLove(i) {
  loveSel = LOVE.kinds[i].k;
  for (var k = 0; k < LOVE.kinds.length; k++) { $("love_" + LOVE.kinds[k].k).className = (k === i) ? "chip sel" : "chip"; }
  $("loveSendBtn").disabled = (LOVE.sent >= LOVE.max);
}
function submitLove() {
  if (!loveSel || $("loveSendBtn").disabled) { return; }
  $("loveSendBtn").disabled = true;
  window.location.href = "http://localhost/saveLove?k=" + encodeURIComponent(loveSel) + "&n=" + encodeURIComponent($("loveNote").value);
}

// ----- Capacity (social battery, sensory load, talking) -----
function capHtml(w) {
  var TW = ["🗣️ Okay to talk", "💬 Text only", "🔇 No talking"];
  var h = '<div class="caplabel">Social battery <span class="capend">1 drained · 5 full</span></div><div class="capseg">';
  var n;
  for (n = 1; n <= 5; n++) { h += '<button type="button" class="capb" id="cap' + w + '_0_' + n + '" onclick="setCap(' + w + ',0,' + n + ')">' + n + '</button>'; }
  h += '</div><div class="caplabel">Sensory load <span class="capend">1 calm · 5 overloaded</span></div><div class="capseg">';
  for (n = 1; n <= 5; n++) { h += '<button type="button" class="capb" id="cap' + w + '_1_' + n + '" onclick="setCap(' + w + ',1,' + n + ')">' + n + '</button>'; }
  h += '</div><div class="caplabel">Talking</div><div class="capseg">';
  for (var t = 1; t <= 3; t++) { h += '<button type="button" class="capb capt" id="cap' + w + '_2_' + t + '" onclick="setCap(' + w + ',2,' + t + ')">' + TW[t - 1] + '</button>'; }
  return h + '</div>';
}
function renderCap(w) {
  var n;
  for (n = 1; n <= 5; n++) {
    $("cap" + w + "_0_" + n).className = (CAPW[w][0] === n) ? "capb sel" : "capb";
    $("cap" + w + "_1_" + n).className = (CAPW[w][1] === n) ? "capb sel" : "capb";
  }
  for (var t = 1; t <= 3; t++) { $("cap" + w + "_2_" + t).className = (CAPW[w][2] === t) ? "capb capt sel" : "capb capt"; }
  var any = CAPW[w][0] || CAPW[w][1] || CAPW[w][2];
  $("capBtn" + w).className = (any || capShown[w]) ? "switch on" : "switch";
}
function resetCap(w, arr) {
  CAPW[w] = [arr[0] || 0, arr[1] || 0, arr[2] || 0];
  capShown[w] = !!(CAPW[w][0] || CAPW[w][1] || CAPW[w][2]);
  $("capHost" + w).style.display = capShown[w] ? "block" : "none";
  renderCap(w);
}
function toggleCap(w) {
  capShown[w] = !capShown[w];
  $("capHost" + w).style.display = capShown[w] ? "block" : "none";
  renderCap(w);
}
function setCap(w, k, v) { CAPW[w][k] = (CAPW[w][k] === v) ? 0 : v; renderCap(w); }
function capQuery(w) {
  var q = "";
  if (CAPW[w][0]) { q += "&soc=" + CAPW[w][0]; }
  if (CAPW[w][1]) { q += "&sen=" + CAPW[w][1]; }
  if (CAPW[w][2]) { q += "&talk=" + ["ok", "text", "none"][CAPW[w][2] - 1]; }
  return q;
}

// ----- Trends -----
function openTrends(who) { tWho = who; renderTrends(); showSheet("trendSheet"); }
function setTWho(w) { tWho = w; renderTrends(); }
function setTRange(r) { tRange = r; renderTrends(); }
function tstat(icon, text) { return '<div class="tstat"><span>' + icon + '</span><span>' + text + '</span></div>'; }
function renderTrends() {
  $("tw0").className = (tWho === 0) ? "eopt sel" : "eopt";
  $("tw1").className = (tWho === 1) ? "eopt sel" : "eopt";
  $("tr14").className = (tRange === 14) ? "eopt sel" : "eopt";
  $("tr28").className = (tRange === 28) ? "eopt sel" : "eopt";
  var t = (tWho === 0 ? TREND.me : TREND.partner)[String(tRange)];
  var s = t.stats;
  var who = TREND.names[tWho];
  var h = "";
  if (t.alert) {
    h += '<div class="theads">📉 ' + (tWho === 0
      ? "Your energy has been low on " + t.alert.low + " of the last 7 days. Running low for a while can mean you need more rest and fewer demands. Be gentle with yourself."
      : eh(who) + "'s energy has been low on " + t.alert.low + " of the last 7 days. Running low for a while can mean someone needs more rest and fewer demands. A gentle check-in with no pressure to reply might help.") + '</div>';
  }
  var cols = "";
  for (var i = 0; i < t.days.length; i++) {
    var d = t.days[i];
    var inner;
    if (d.e !== null) {
      var lvl = d.e <= 2 ? "low" : (d.e < 4 ? "mid" : "high");
      inner = '<div class="tbar t-' + lvl + '" style="height:' + Math.round(d.e / 5 * 100) + '%"></div>';
    } else if (d.r) {
      inner = '<div class="trest">🌙</div>';
    } else if (d.c > 0) {
      inner = '<div class="tbar t-unk" style="height:14%"></div>';
    } else {
      inner = '<div class="tdot"></div>';
    }
    cols += '<div class="tcol">' + inner + '</div>';
  }
  var last = t.days.length - 1;
  h += '<div class="tchart">' + cols + '</div>' +
    '<div class="tlabels"><span>' + t.days[0].l + '</span><span>' + t.days[Math.floor(last / 2)].l + '</span><span>' + t.days[last].l + '</span></div>' +
    '<div class="tlegend"><span><i class="lg lg-low"></i>Low (2 or below)</span><span><i class="lg lg-mid"></i>Middle</span><span><i class="lg lg-high"></i>High (4+)</span><span>🌙 Resting</span><span>· No check-in</span></div>';
  var lines = "";
  lines += tstat("📅", "Checked in on " + s.checkin + " of " + s.total + " days");
  if (s.avg !== null) {
    var trendTxt = "";
    if (s.prev !== null) {
      var diff = s.avg - s.prev;
      trendTxt = diff >= 0.5 ? " (up from " + s.prev + " before)" : (diff <= -0.5 ? " (down from " + s.prev + " before)" : " (about the same as before)");
    }
    lines += tstat("⚡", "Average energy " + s.avg + "/5" + trendTxt);
  }
  if (s.withE > 0) { lines += tstat("📉", "Low energy on " + s.low + " of " + s.withE + " days with a check-in"); }
  if (s.rest > 0) { lines += tstat("🌙", "Resting on " + s.rest + (s.rest === 1 ? " day" : " days")); }
  if (s.socN >= 2) { lines += tstat("🔋", "Social battery averaged " + s.soc + "/5" + (s.soc <= 2 ? " (low)" : "")); }
  if (s.senN >= 2) { lines += tstat("🔊", "Sensory load averaged " + s.sen + "/5" + (s.sen >= 4 ? " (high)" : "")); }
  if (s.cant > 0) { lines += tstat("🔇", "Could not talk on " + s.cant + (s.cant === 1 ? " day" : " days")); }
  if (s.checkin === 0) { lines = tstat("📅", "No check-ins in this period yet."); }
  h += lines + '<div class="tnote">Based on check-ins only. A quiet stretch is not always a bad sign: it can just mean someone is resting.</div>';
  $("trendBody").innerHTML = h;
}

// ----- What helps -----
function openHelps() {
  var p = HELPS.partner;
  var spec = "";
  var gen = "";
  for (var i = 0; i < p.length; i++) {
    if (p[i].m === "*") { gen = p[i].t; }
    else if (p[i].m.trim().toLowerCase() === HELPS.pKey) { spec = p[i].t; }
  }
  var h = "";
  if (spec) { h += '<div class="help-card"><div class="help-head">Right now · ' + eh(HELPS.pMood) + '</div><div class="help-text">' + eh(spec) + '</div></div>'; }
  if (gen) { h += '<div class="help-card"><div class="help-head">In general</div><div class="help-text">' + eh(gen) + '</div></div>'; }
  if (!h) { h = '<div class="sheet-empty">Nothing written yet.</div>'; }
  $("helpsBody").innerHTML = h;
  $("helpsTitle").textContent = "What helps " + HELPS.pName;
  $("helpsSub").textContent = "Written by " + HELPS.pName + " for the people who care about them.";
  showSheet("helpsSheet");
}
function openMyHelps() {
  var rows = [
    { m: "*", label: "💡 In general", ph: "e.g. Go gently. Quiet company, a snack, and no pressure to talk." },
    { m: "🌙 Resting", label: "🌙 Resting", ph: "What would help while you're resting?" }
  ];
  for (var i = 0; i < MOODS.length; i++) {
    rows.push({ m: MOODS[i].raw, label: MOODS[i].emoji + " " + MOODS[i].label, html: true, ph: "What helps when this is your status?" });
  }
  helpRows = rows;
  var h = "";
  for (var r = 0; r < rows.length; r++) {
    h += '<div class="hrow"><div class="hrow-label">' + (rows[r].html ? rows[r].label : eh(rows[r].label)) + '</div>' +
      '<textarea id="hta_' + r + '" class="note-input hta" rows="2" maxlength="240" placeholder="' + eh(rows[r].ph) + '"></textarea></div>';
  }
  $("helpsList").innerHTML = h;
  for (var r2 = 0; r2 < rows.length; r2++) {
    var v = "";
    for (var c = 0; c < HELPS.mine.length; c++) {
      if (HELPS.mine[c].m.trim().toLowerCase() === rows[r2].m.trim().toLowerCase()) { v = HELPS.mine[c].t; }
    }
    $("hta_" + r2).value = v;
  }
  $("helpsSaveBtn").disabled = false;
  showSheet("myHelpsSheet");
}
function saveHelpsNow() {
  if ($("helpsSaveBtn").disabled) { return; }
  var cards = [];
  for (var r = 0; r < helpRows.length; r++) {
    var v = $("hta_" + r).value.trim();
    if (v) { cards.push({ m: helpRows[r].m, t: v }); }
  }
  $("helpsSaveBtn").disabled = true;
  window.location.href = "http://localhost/saveHelps?d=" + encodeURIComponent(JSON.stringify(cards));
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
`.replace(
    /__(MOODS|MINE|SETTINGS|HELPS|TREND|ENTRIES|LOVE|CIRCLES)__/g,
    (m, k) => data[k],
  );
}

async function buildHtml(state) {
  let allReminders = await Reminder.all([cal]);
  if (!allReminders || allReminders.length === 0)
    allReminders = buildMockData();

  let myHelps = parseHelps(allReminders.find((r) => isHelpsFor(r, myUserName)));
  let partnerHelps = parseHelps(
    allReminders.find((r) => isHelpsFor(r, partnerUserName)),
  );

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

  // CRITICAL: Filter out data reminders (avatars, "Helps: <Name>") so they never show up in history
  let reminders = allReminders.filter((r) => !isDataTitle(r.title));
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
  let mySplit = splitNotes(myLatest ? myLatest.r.notes : "");
  let myResting = myLatest ? isRestingMood(myLatest.mood) : false;
  let myNote =
    mySplit.text || (myResting ? "No check-ins needed" : "Tap 'Log Mood'");
  let myTime = myLatest ? relTime(myLatest.r.creationDate) : "--";
  // A resting status is never "stale": silence is expected, not worrying
  // My own card never goes amber/dim: a "you're behind" cue reads as guilt
  let myStale = false;
  let partnerMood = partnerLatest ? partnerLatest.mood : "No Status";
  let partnerSplit = splitNotes(partnerLatest ? partnerLatest.r.notes : "");
  let partnerResting = partnerLatest
    ? isRestingMood(partnerLatest.mood)
    : false;
  let partnerNote =
    partnerSplit.text ||
    (partnerResting ? "No check-ins needed" : "No check-in yet");
  let partnerTime = partnerLatest
    ? relTime(partnerLatest.r.creationDate)
    : "--";
  let partnerStale =
    partnerLatest && !partnerResting
      ? isStale(partnerLatest.r.creationDate)
      : false;

  // "What helps" cards: show a pill when the partner wrote one for their current mood (or in general)
  let partnerKey = String(partnerLatest ? partnerLatest.mood : "")
    .trim()
    .toLowerCase();
  let showHelps = partnerHelps.some(
    (c) => c.m === "*" || c.m.trim().toLowerCase() === partnerKey,
  );
  // My own entries by identifier (tap one in History to edit or delete it)
  entriesState = {};
  let entryCount = 0;
  for (let r of reminders) {
    let ep = parseMood(r.title);
    if (ep.user.toLowerCase() !== myUserName.toLowerCase() || !r.identifier)
      continue;
    let ens = splitNotes(r.notes);
    let ekey = String(ep.mood).trim().toLowerCase();
    entriesState[r.identifier] = {
      mood: faceify(ep.mood),
      note: ens.text,
      nr: ens.noReply,
      cap: [
        ens.cap.social || 0,
        ens.cap.sensory || 0,
        ["ok", "text", "none"].indexOf(ens.cap.talk) + 1,
      ],
      time: relTime(r.creationDate),
      idx: isRestingMood(ep.mood)
        ? -2
        : moods.findIndex((m) => String(m.title).trim().toLowerCase() === ekey),
    };
    if (++entryCount >= 150) break;
  }

  // Async Love: notes from my friend to me (last 48h, not hidden) and how many I sent today
  let loves = allReminders.map(parseLove).filter(Boolean);
  let hiddenLove = loadHiddenLove();
  let nowMs = Date.now();
  let lovesIn = loves
    .filter(
      (l) =>
        l.from.toLowerCase() === partnerUserName.toLowerCase() &&
        l.to.toLowerCase() === myUserName.toLowerCase() &&
        LOVE_KINDS[l.kind] &&
        nowMs - l.t < 2 * DAY_MS &&
        (!l.id || hiddenLove.indexOf(l.id) === -1),
    )
    .sort((a, b) => b.t - a.t)
    .slice(0, 2);
  loveState = {
    sent: loves.filter(
      (l) =>
        l.from.toLowerCase() === myUserName.toLowerCase() &&
        nowMs - l.t < DAY_MS,
    ).length,
    max: LOVE_MAX_PER_DAY,
    to: partnerUserName,
  };

  // Trends for both people (also drives the "energy has been low" banner)
  let meEntries = collectEntries(reminders, myUserName);
  let partnerEntries = collectEntries(reminders, partnerUserName);
  trendState = {
    names: [myUserName, partnerUserName],
    me: {
      14: summarizeTrend(meEntries, 14),
      28: summarizeTrend(meEntries, 28),
    },
    partner: {
      14: summarizeTrend(partnerEntries, 14),
      28: summarizeTrend(partnerEntries, 28),
    },
  };
  // No banner while someone is resting: resting is already the response to low energy
  let myAlert = myResting ? null : trendState.me["14"].alert;
  let partnerAlert = partnerResting ? null : trendState.partner["14"].alert;
  helpsState = {
    mine: myHelps,
    partner: partnerHelps,
    pKey: partnerKey,
    pMood: faceify(partnerLatest ? partnerLatest.mood : ""),
  };

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
        let hs = splitNotes(r.notes);
        let isMine =
          p.user.toLowerCase() === myUserName.toLowerCase() && !!r.identifier;
        let cls =
          p.user.toLowerCase() === myUserName.toLowerCase()
            ? "tag-me"
            : "tag-partner";
        historyHtml +=
          '<div class="card' +
          (isMine ? " mine" : "") +
          '"' +
          (isMine
            ? ' data-id="' +
              esc(r.identifier) +
              '" onclick="openEdit(this.getAttribute(\'data-id\'))"'
            : "") +
          '><div><div class="user-tag ' +
          cls +
          '">' +
          esc(p.user) +
          "</div>" +
          '<div class="title">' +
          esc(faceify(p.mood)) +
          "</div>" +
          (hs.text ? '<div class="note">' + esc(hs.text) + "</div>" : "") +
          (hs.noReply ? '<div class="nr-pill">🔕 No reply needed</div>' : "") +
          capChipsHtml(hs.cap) +
          '</div><div class="time">' +
          esc(formatDate(r.creationDate)) +
          energyDotsHtml(p.mood, hs.cap.energy) +
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
    ".iconbtn.off{opacity:0.45}",
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
    ".resting{border-color:rgba(129,140,248,0.4)}",
    ".nr-pill{display:inline-block;font-size:11px;font-weight:600;color:#c7d2fe;background:rgba(99,102,241,0.18);border:1px solid rgba(99,102,241,0.35);border-radius:999px;padding:3px 9px;margin:0 0 8px 0}",
    ".helps-pill{display:inline-block;cursor:pointer;font-size:12px;font-weight:700;color:#fde68a;background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.4);border-radius:999px;padding:5px 11px;margin:2px 0 8px 0}",
    ".helps-pill:active{opacity:0.6}",
    ".samebtn{appearance:none;-webkit-appearance:none;display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;margin:0 0 12px 0;padding:12px;border-radius:14px;border:1px dashed rgba(129,140,248,0.5);background:rgba(99,102,241,0.12);color:#c7d2fe;font:inherit;font-weight:600;font-size:14px}",
    ".samebtn:disabled{opacity:0.5}",
    ".rest-chip{grid-column:1 / -1;flex-direction:row;align-items:center;gap:10px}",
    ".rest-chip .chip-emoji{font-size:24px}",
    ".rest-sub{margin-left:auto;text-align:right;font-size:12px;color:rgba(255,255,255,0.6)}",
    ".mood-grid .sheet-empty{grid-column:1 / -1}",
    ".nr-row{margin-top:10px}",
    ".help-card{padding:12px 14px;border-radius:14px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);margin-bottom:10px}",
    ".help-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#fde68a;margin-bottom:4px}",
    ".help-text{font-size:15px;line-height:1.4;overflow-wrap:anywhere}",
    ".hrow{margin-bottom:6px}",
    ".hrow-label{font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);margin-top:8px}",
    ".hta{margin-top:6px;resize:none;min-height:64px;line-height:1.35}",
    ".cap-row{margin-top:10px}",
    ".capbox{margin-top:10px;padding:12px;border-radius:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)}",
    ".caplabel{font-size:12px;font-weight:700;color:rgba(255,255,255,0.7);margin:10px 0 6px}",
    ".capbox .caplabel:first-child{margin-top:0}",
    ".capend{font-weight:500;color:rgba(255,255,255,0.45);margin-left:6px;font-size:11px}",
    ".capseg{display:flex;gap:6px}",
    ".capb{appearance:none;-webkit-appearance:none;flex:1;min-width:0;font:inherit;font-weight:700;font-size:15px;color:#fff;padding:10px 4px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06)}",
    ".capb.capt{font-size:12px}",
    ".capb.sel{background:rgba(99,102,241,0.25);border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,0.25)}",
    ".cap-chips{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 8px 0}",
    ".cap-chip{font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:3px 8px}",
    ".cap-chip.warn{color:#fde68a;background:rgba(251,191,36,0.12);border-color:rgba(251,191,36,0.35)}",
    ".alert-banner{cursor:pointer;margin:0 0 14px 0;padding:12px 14px;border-radius:14px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.35);color:#fde68a;font-size:13px;line-height:1.4}",
    ".alert-banner:active{opacity:0.6}",
    ".trend-body{max-height:50vh;overflow-y:auto;margin-top:12px}",
    ".tchart{display:flex;align-items:flex-end;gap:2px;height:110px;padding:6px 0 0;border-bottom:1px solid rgba(255,255,255,0.12)}",
    ".tcol{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center}",
    ".tbar{width:100%;border-radius:3px 3px 0 0;min-height:4px}",
    ".t-low{background:#fbbf24}",
    ".t-mid{background:#818cf8}",
    ".t-high{background:#34d399}",
    ".t-unk{background:rgba(255,255,255,0.25)}",
    ".tdot{width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.25);margin-bottom:2px}",
    ".trest{font-size:11px;line-height:1;margin-bottom:2px}",
    ".tlabels{display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px}",
    ".tlegend{display:flex;flex-wrap:wrap;gap:10px;font-size:10px;color:rgba(255,255,255,0.55);margin:8px 0 10px}",
    ".lg{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px}",
    ".lg-low{background:#fbbf24}",
    ".lg-mid{background:#818cf8}",
    ".lg-high{background:#34d399}",
    ".tstat{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;line-height:1.35}",
    ".tnote{font-size:12px;color:rgba(255,255,255,0.5);margin-top:12px;line-height:1.4}",
    ".theads{padding:12px 14px;border-radius:14px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.35);color:#fde68a;font-size:13px;line-height:1.45;margin-bottom:12px}",
    ".friend-bar{display:flex;gap:8px;flex-wrap:wrap;margin:-6px 0 14px 0}",
    ".fchip{cursor:pointer;text-decoration:none;font-size:13px;font-weight:700;color:rgba(255,255,255,0.75);background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:999px;padding:7px 14px}",
    ".fchip.active{color:#fff;background:#6366f1;border-color:#6366f1}",
    ".fchip.add{color:#a5b4fc}",
    ".love-pill{display:inline-block;cursor:pointer;font-size:12px;font-weight:700;color:#fbcfe8;background:rgba(244,114,182,0.14);border:1px solid rgba(244,114,182,0.4);border-radius:999px;padding:5px 11px;margin:2px 6px 8px 0}",
    ".love-pill:active{opacity:0.6}",
    ".love-card{margin:0 0 12px 0;padding:12px 14px;border-radius:14px;background:rgba(244,114,182,0.1);border:1px solid rgba(244,114,182,0.35)}",
    ".love-main{font-size:14px;line-height:1.4}",
    ".love-note{font-size:14px;font-style:italic;color:rgba(255,255,255,0.8);margin-top:4px}",
    ".love-meta{font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px}",
    ".love-hide{color:rgba(255,255,255,0.6)}",
    ".card.mine{cursor:pointer}",
    ".card.mine:active{opacity:0.7}",
    ".share-row{margin-top:10px}",
    ".share-chips{display:flex;flex-wrap:wrap;gap:6px}",
    ".friend-list-name{font-size:12px;color:rgba(255,255,255,0.5);margin:2px 0 4px 0;overflow-wrap:anywhere}",
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
    '<div class="iconbtn' +
    (settings.reminderHours ? "" : " off") +
    '" onclick="openRemind()">🔔</div>' +
    '<a class="refresh" href="http://localhost/refresh">↻ Refresh</a></div></div>' +
    '<div class="friend-bar">' +
    circles
      .map(
        (c, i) =>
          '<a class="fchip' +
          (i === activeCircle ? " active" : "") +
          '" href="http://localhost/switch?i=' +
          i +
          '">' +
          esc(c.partner) +
          "</a>",
      )
      .join("") +
    '<div class="fchip add" onclick="openFriends()">＋</div></div>' +
    '<div class="dual-container">' +
    // YOU CARD
    '<div class="hero' +
    (myStale ? " stale" : "") +
    (myResting ? " resting" : "") +
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
    energyDotsHtml(myMood, mySplit.cap.energy) +
    '<div class="note" style="margin-bottom:8px;">"' +
    esc(myNote) +
    '"</div>' +
    (mySplit.noReply ? '<div class="nr-pill">🔕 No reply needed</div>' : "") +
    capChipsHtml(mySplit.cap) +
    '<div class="time" style="text-align:left">' +
    esc(myTime) +
    "</div>" +
    "</div></div>" +
    // PARTNER CARD (Styled with Pink Accent)
    '<div class="hero hero-partner' +
    (partnerStale ? " stale" : "") +
    (partnerResting ? " resting" : "") +
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
    energyDotsHtml(partnerMood, partnerSplit.cap.energy) +
    '<div class="note" style="margin-bottom:8px;">"' +
    esc(partnerNote) +
    '"</div>' +
    (partnerSplit.noReply
      ? '<div class="nr-pill">🔕 No reply needed</div>'
      : "") +
    capChipsHtml(partnerSplit.cap) +
    (showHelps
      ? '<div class="helps-pill" onclick="openHelps()">💡 What helps</div>'
      : "") +
    '<div class="love-pill" onclick="openLove()">💌 Send love</div>' +
    '<div class="time" style="text-align:left">' +
    esc(partnerTime) +
    "</div>" +
    "</div>" +
    "</div>" +
    lovesIn
      .map(
        (l) =>
          '<div class="love-card"><div class="love-main">💌 <b>' +
          esc(l.from) +
          "</b> · " +
          LOVE_KINDS[l.kind][0] +
          " " +
          esc(LOVE_KINDS[l.kind][1]) +
          "</div>" +
          (l.note ? '<div class="love-note">"' + esc(l.note) + '"</div>' : "") +
          '<div class="love-meta">' +
          esc(relTime(l.t)) +
          " · no reply needed" +
          (l.id
            ? ' · <a class="love-hide" href="http://localhost/hideLove?id=' +
              encodeURIComponent(l.id) +
              '">Hide</a>'
            : "") +
          "</div></div>",
      )
      .join("") +
    (partnerAlert
      ? '<div class="alert-banner" onclick="openTrends(1)">📉 <b>' +
        esc(partnerUserName) +
        "</b>'s energy has been low on " +
        partnerAlert.low +
        " of the last 7 days. <u>See trends</u></div>"
      : "") +
    (myAlert
      ? '<div class="alert-banner" onclick="openTrends(0)">📉 Your energy has been low on ' +
        myAlert.low +
        " of the last 7 days. Be gentle with yourself. <u>See trends</u></div>"
      : "") +
    '<div class="btn" style="cursor:pointer" onclick="openLog()">📝 Log Mood</div>' +
    '<div class="btn-row">' +
    '<div class="btn btn-sec" style="cursor:pointer" onclick="openManage()">🎛 Moods</div>' +
    '<div class="btn btn-sec" style="cursor:pointer" onclick="openMyHelps()">💡 Helps me</div>' +
    '<div class="btn btn-sec" style="cursor:pointer" onclick="openTrends(1)">📈 Trends</div>' +
    "</div>" +
    '<h3 style="font-size:16px;color:rgba(255,255,255,0.8);margin:24px 0 4px 0;">History Feed</h3>' +
    '<div class="tnote" style="margin:0 0 10px 0">Tap one of your own entries to edit or delete it.</div>' +
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
    '<button type="button" id="sameBtn" class="samebtn" style="display:none" onclick="submitSame()"></button>' +
    '<div id="moodGrid" class="mood-grid"></div>' +
    '<input id="noteInput" class="note-input" type="text" maxlength="140" placeholder="Add a note (optional)" autocomplete="off" autocapitalize="sentences">' +
    '<div class="nr-row"><button type="button" id="nrBtn0" class="switch" onclick="toggleNr(0)">🔕 No reply needed</button> <button type="button" id="capBtn0" class="switch" onclick="toggleCap(0)">📊 Capacity</button></div>' +
    '<div id="capHost0" class="capbox" style="display:none"></div>' +
    '<div id="shareRow" class="share-row" style="display:none"></div>' +
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
    '<div class="nr-row"><button type="button" id="nrBtn1" class="switch" onclick="toggleNr(1)">🔕 No reply needed</button> <button type="button" id="capBtn1" class="switch" onclick="toggleCap(1)">📊 Capacity</button></div>' +
    '<div id="capHost1" class="capbox" style="display:none"></div>' +
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
    // --- Friends ---
    '<div id="friendsSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">Friends</h3>' +
    '<div class="sheet-sub">Each friend has their own Reminders list, so what you share with one person stays between the two of you.</div>' +
    '<div id="friendList" class="mlist"></div>' +
    '<div class="elabel">Add a friend</div>' +
    '<input id="fName" class="note-input" style="margin-top:0" type="text" maxlength="40" placeholder="Their name" autocomplete="off" autocapitalize="words">' +
    '<input id="fList" class="note-input" type="text" maxlength="80" placeholder="Reminders list name" autocomplete="off">' +
    '<div class="sheet-sub" style="margin-top:6px">Use a list you already share, or a new name and the list will be created for you to share. They must use your name exactly as it appears in your check-ins.</div>' +
    '<button type="button" id="fAddBtn" class="samebtn" style="display:flex" onclick="addFriend()" disabled>＋ Add friend</button>' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Close</button>' +
    '<button type="button" id="fSaveBtn" class="sbtn sbtn-primary" onclick="saveFriends()" disabled>Save changes</button>' +
    "</div></div>" +
    // --- Send love ---
    '<div id="loveSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 id="loveTitle" class="sheet-title">Send love</h3>' +
    '<div class="sheet-sub">No reply needed. They will see it next time they open the app or widget. There is no read receipt, and nothing buzzes their phone.</div>' +
    '<div id="loveGrid" class="mood-grid"></div>' +
    '<input id="loveNote" class="note-input" type="text" maxlength="80" placeholder="Add a short note (optional)" autocomplete="off" autocapitalize="sentences">' +
    '<div id="loveLimit" class="cwarn"></div>' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Cancel</button>' +
    '<button type="button" id="loveSendBtn" class="sbtn sbtn-primary" onclick="submitLove()" disabled>Send love</button>' +
    "</div></div>" +
    // --- Trends ---
    '<div id="trendSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">Trends</h3>' +
    '<div class="sheet-sub">How energy and capacity have been over time.</div>' +
    '<div class="eseg"><button type="button" id="tw0" class="eopt" onclick="setTWho(0)"><span id="tw0l" class="hlabel"></span></button><button type="button" id="tw1" class="eopt" onclick="setTWho(1)"><span id="tw1l" class="hlabel"></span></button></div>' +
    '<div class="eseg" style="margin-top:8px"><button type="button" id="tr14" class="eopt" onclick="setTRange(14)"><span class="hlabel">14 days</span></button><button type="button" id="tr28" class="eopt" onclick="setTRange(28)"><span class="hlabel">28 days</span></button></div>' +
    '<div id="trendBody" class="trend-body"></div>' +
    '<div class="sheet-actions"><button type="button" class="sbtn sbtn-primary" onclick="closeSheet()">Close</button></div>' +
    "</div>" +
    // --- What helps (viewing the partner's cards) ---
    '<div id="helpsSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 id="helpsTitle" class="sheet-title">What helps</h3>' +
    '<div id="helpsSub" class="sheet-sub"></div>' +
    '<div id="helpsBody"></div>' +
    '<div class="sheet-actions"><button type="button" class="sbtn sbtn-primary" onclick="closeSheet()">Got it</button></div>' +
    "</div>" +
    // --- What helps me (writing my own cards) ---
    '<div id="myHelpsSheet" class="sheet">' +
    '<div class="grabber"></div>' +
    '<h3 class="sheet-title">What helps me</h3>' +
    '<div class="sheet-sub">Write these when you have the energy. People who care about you see the matching card when your status changes, so they don\'t have to guess. Anyone with access to the shared list can read them.</div>' +
    '<div id="helpsList" class="mlist"></div>' +
    '<div class="sheet-actions">' +
    '<button type="button" class="sbtn" onclick="closeSheet()">Cancel</button>' +
    '<button type="button" id="helpsSaveBtn" class="sbtn sbtn-primary" onclick="saveHelpsNow()">Save</button>' +
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
    '<button type="button" class="samebtn" style="display:flex" onclick="closeSheet();openCustom()">＋ New mood</button>' +
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
  let title = null;
  if (q.i === "rest") {
    title = REST_TITLE;
  } else {
    let idx = parseInt(q.i, 10);
    if (isNaN(idx) || idx < 0 || idx >= moods.length) return;
    title = moods[idx].title;
  }

  // Capacity from the sheet, plus this mood's energy so trends don't depend on presets
  let cap = capFromQuery(q);
  let energy = energyOfTitle(title);
  if (energy != null) cap.energy = energy;

  let targets = q.to ? parseTargets(q.to) : [activeCircle];
  if (!targets.length) targets = [activeCircle];
  await writeCheckins(targets, title, buildNotes(q.note, q.nr === "1", cap));
}

// "Same as last" button: logs my previous check-in again, copying its note,
// "no reply needed" flag and capacity (energy is re-read so older check-ins gain it)
async function saveSameFromUrl(url) {
  let prev = myLatestReminderRef;
  if (!prev) return;
  let q = parseQuery(url || "");
  let targets = q.to ? parseTargets(q.to) : [activeCircle];
  if (!targets.length) targets = [activeCircle];
  let mood = parseMood(prev.title || "").mood;
  let ns = splitNotes(prev.notes);
  let cap = Object.assign({}, ns.cap);
  let energy = energyOfTitle(mood);
  if (cap.energy == null && energy != null) cap.energy = energy;
  await writeCheckins(targets, mood, buildNotes(ns.text, ns.noReply, cap));
}

// Edit sheet -> change mood, note, flags and capacity on my latest check-in
// One of MY check-ins in the active list, by identifier (never a data reminder or the friend's entry)
async function findMyEntry(id) {
  if (!id) return myLatestReminderRef;
  let all = await Reminder.all([cal]);
  let r = all.find((x) => x.identifier === id);
  if (!r || isDataTitle(r.title)) return null;
  if (parseMood(r.title || "").user.toLowerCase() !== myUserName.toLowerCase())
    return null;
  return r;
}

async function saveEditFromUrl(url) {
  let q = parseQuery(url || "");
  let r = await findMyEntry(q.id);
  if (!r || typeof r.save !== "function") return;
  let before = splitNotes(r.notes);
  let cap = capFromQuery(q);
  let moodTitle = null;
  if (q.i === "rest") {
    moodTitle = REST_TITLE;
  } else {
    let idx = parseInt(q.i, 10);
    if (!isNaN(idx) && idx >= 0 && idx < moods.length)
      moodTitle = moods[idx].title;
  }
  if (moodTitle) {
    r.title = "[" + myUserName + "] " + moodTitle;
    let e = energyOfTitle(moodTitle);
    if (e != null) cap.energy = e;
  } else {
    // mood unchanged: keep the energy already stored (or read it from my presets)
    let e =
      before.cap.energy != null
        ? before.cap.energy
        : energyOfTitle(parseMood(r.title || "").mood);
    if (e != null) cap.energy = e;
  }
  r.notes = buildNotes(q.note, q.nr === "1", cap);
  await r.save();
}

// "What helps me" sheet -> saves my cards into a "Helps: <Name>" reminder in each shared list
async function saveHelpsFromUrl(url) {
  let q = parseQuery(url || "");
  let cards;
  try {
    cards = sanitizeHelps(JSON.parse(q.d || "[]"));
  } catch (e) {
    return;
  }
  for (let k of shareCalendars()) {
    let all = await Reminder.all([k]);
    let existing = all.find((r) => isHelpsFor(r, myUserName));
    if (!cards.length) {
      if (existing) await existing.remove();
      continue;
    }
    let r = existing || new Reminder();
    if (!existing) {
      r.title = HELPS_PREFIX + myUserName;
      r.calendar = k;
    }
    r.notes = JSON.stringify(cards);
    await r.save();
  }
}

// ---- Quick log: log a mood with no UI ----
// From a Shortcut ("Run Script" with the mood name as input) or a URL:
//   scriptable:///run/mood-dashboard?mood=Low%20Battery&note=quiet&noreply=1
// Special names: "rest" (Resting) and "last" (same as my previous check-in)
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveQuickMood(spec, latestReminder) {
  let n = normName(spec);
  if (!n) return null;
  if (n === "last" || n === "same" || n === "same as last") {
    return latestReminder ? parseMood(latestReminder.title || "").mood : null;
  }
  if (n === "rest" || n === "resting") return REST_TITLE;
  let exact = moods.find((m) => normName(m.title) === n);
  if (exact) return exact.title;
  let partial = moods.find((m) => {
    let t = normName(m.title);
    return t && (t.includes(n) || n.includes(t));
  });
  return partial ? partial.title : null;
}

function readQuickParams() {
  let sp = args.shortcutParameter;
  let qp = args.queryParameters || {};
  let spec = null;
  let note = "";
  let noReply = false;
  let cap = {};
  let to = null;
  let viaShortcut = false;
  if (sp !== undefined && sp !== null && sp !== "") {
    viaShortcut = true;
    let obj = null;
    if (typeof sp === "object") obj = sp;
    else if (String(sp).trim().startsWith("{")) {
      try {
        obj = JSON.parse(String(sp));
      } catch (e) {}
    }
    if (obj) {
      spec = obj.mood;
      note = obj.note || "";
      noReply = !!obj.noReply;
      cap = capFromQuery({ soc: obj.social, sen: obj.sensory, talk: obj.talk });
      if (obj.to) to = [].concat(obj.to).map(String);
    } else {
      spec = String(sp).trim();
    }
  } else if (qp.mood) {
    spec = qp.mood;
    note = qp.note || "";
    noReply = qp.noreply === "1" || qp.noreply === "true";
    cap = capFromQuery(qp);
    if (qp.to) to = String(qp.to).split(",");
  }
  if (!spec) return null;
  return {
    spec: String(spec),
    note: note,
    noReply: noReply,
    cap: cap,
    to: to,
    viaShortcut: viaShortcut,
  };
}

async function performQuickLog(p) {
  let all = await Reminder.all([cal]);
  let mine =
    all
      .filter(
        (r) =>
          !isDataTitle(r.title || "") &&
          parseMood(r.title || "").user.toLowerCase() ===
            myUserName.toLowerCase(),
      )
      .sort((a, b) => getTime(b) - getTime(a))[0] || null;
  let title = resolveQuickMood(p.spec, mine);
  if (!title) return { ok: false, msg: 'No mood matches "' + p.spec + '"' };

  let cap = Object.assign({}, p.cap);
  let text = p.note;
  let noReply = p.noReply;
  let n = normName(p.spec);
  // "last" with nothing else given = an exact repeat of my previous check-in
  if (
    ["last", "same", "same as last"].indexOf(n) !== -1 &&
    mine &&
    !p.note &&
    !p.noReply &&
    !Object.keys(p.cap).length
  ) {
    let ns = splitNotes(mine.notes);
    text = ns.text;
    noReply = ns.noReply;
    cap = Object.assign({}, ns.cap);
  }
  let energy = energyOfTitle(title);
  if (energy != null) cap.energy = energy;

  // Default: every friend with sharing on; "to" (names) narrows it
  let targets = defaultTargets();
  if (p.to) {
    let names = p.to.map((x) => String(x).trim().toLowerCase());
    let picked = [];
    circles.forEach((c, i) => {
      if (names.indexOf(c.partner.toLowerCase()) !== -1) picked.push(i);
    });
    if (picked.length) targets = picked;
  }
  let n2 = await writeCheckins(targets, title, buildNotes(text, noReply, cap));
  if (!n2) return { ok: false, msg: "No shared list found to log into" };
  return {
    ok: true,
    msg:
      "Logged " +
      faceify(title) +
      (targets.length > 1 ? " for " + targets.length + " friends" : ""),
  };
}

// Edit sheet -> delete my latest check-in
async function deleteEntryFromUrl(url) {
  let q = parseQuery(url || "");
  let r = await findMyEntry(q.id);
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
    let cals = circles.map((c) => findCalendar(c.list)).filter(Boolean);
    let all = await Reminder.all(cals.length ? cals : [cal]);
    let latest = 0;
    let latestMood = "";
    for (let r of all) {
      let title = r.title || "";
      if (isDataTitle(title)) continue;
      let p = parseMood(title);
      if (p.user.toLowerCase() !== myUserName.toLowerCase()) continue;
      if (getTime(r) > latest) {
        latest = getTime(r);
        latestMood = p.mood;
      }
    }
    // No check-ins yet, or I'm resting: no nudges
    if (!latest || isRestingMood(latestMood)) {
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

// ---- Friends: writing to several lists, switching, adding, managing ----
async function notify(title, msg) {
  let a = new Alert();
  a.title = title;
  a.message = msg;
  a.addAction("OK");
  await a.present();
}

// "0,2" -> [0, 2] (valid, unique indices into circles)
function parseTargets(csv) {
  let out = [];
  String(csv || "")
    .split(",")
    .forEach((x) => {
      let i = parseInt(x, 10);
      if (!isNaN(i) && i >= 0 && i < circles.length && out.indexOf(i) === -1)
        out.push(i);
    });
  return out;
}

// Friends whose lists get my check-ins by default
function defaultTargets() {
  let t = [];
  circles.forEach((c, i) => {
    if (c.autoShare) t.push(i);
  });
  return t.length ? t : [activeCircle];
}

// Lists that also get my avatar and "what helps" cards (friends with sharing on)
function shareCalendars() {
  let out = [];
  circles.forEach((c) => {
    if (!c.autoShare) return;
    let k = findCalendar(c.list);
    if (k && out.indexOf(k) === -1) out.push(k);
  });
  return out;
}

// Writes one check-in into each chosen friend's list
async function writeCheckins(indices, title, notes) {
  let done = 0;
  for (let i of indices) {
    let c = circles[i];
    if (!c) continue;
    let k = findCalendar(c.list);
    if (!k) continue;
    let r = new Reminder();
    r.title = "[" + myUserName + "] " + title;
    r.notes = notes;
    r.calendar = k;
    await r.save();
    done++;
  }
  return done;
}

async function switchCircleFromUrl(url) {
  let q = parseQuery(url || "");
  let i = parseInt(q.i, 10);
  if (isNaN(i) || i < 0 || i >= circles.length || i === activeCircle) return;
  if (!findCalendar(circles[i].list)) {
    await notify(
      'List "' + circles[i].list + '" not found',
      "Open Reminders and check that the list exists and is shared with you.",
    );
    return;
  }
  activeCircle = i;
  applyActiveCircle();
  saveCircles();
}

// "Add a friend": connects to their list, or creates it if it doesn't exist yet
async function addFriendFromUrl(url) {
  let q = parseQuery(url || "");
  let name = String(q.n || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  let listN = String(q.l || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!name || !listN) return;
  if (name.toLowerCase() === myUserName.toLowerCase()) {
    await notify("That's you", "Use your friend's name here, not your own.");
    return;
  }
  let existing = circles.findIndex(
    (c) => c.partner.toLowerCase() === name.toLowerCase(),
  );
  if (existing !== -1) {
    activeCircle = existing;
    applyActiveCircle();
    saveCircles();
    return;
  }
  let k = findCalendar(listN);
  let created = false;
  if (!k) {
    try {
      k = await Calendar.createForReminders(listN);
      calendars = await Calendar.forReminders();
      created = true;
    } catch (e) {
      await notify(
        "Could not create the list",
        'Create a list named "' +
          listN +
          '" in the Reminders app (under iCloud), share it, then add it here again.',
      );
      return;
    }
  }
  circles.push({ partner: name, list: listN, autoShare: true });
  activeCircle = circles.length - 1;
  applyActiveCircle();
  saveCircles();
  await notify(
    created ? "List created" : "Connected",
    created
      ? 'Next: open the Reminders app, open "' +
          listN +
          '", tap the people icon (or ⓘ) and share it with ' +
          name +
          ". On their phone they add you here using the same list name. If Reminders won't let you share it, create the list there under iCloud instead and add it here by name."
      : 'Using the existing list "' +
          listN +
          '". Make sure ' +
          name +
          " has access to it.",
  );
}

// Friends sheet -> sharing switches and removals (removing only forgets the friend in this app)
async function saveFriendsFromUrl(url) {
  let q = parseQuery(url || "");
  let flags = String(q.s || "").split(",");
  if (flags.length !== circles.length) return;
  let del = String(q.d || "")
    .split(",")
    .filter((x) => x !== "")
    .map((x) => parseInt(x, 10));
  if (del.some((i) => isNaN(i) || i < 0 || i >= circles.length)) return;
  if (del.length >= circles.length) return; // keep at least one friend
  let activePartner = circles[activeCircle].partner;
  let kept = [];
  circles.forEach((c, i) => {
    if (del.indexOf(i) !== -1) return;
    kept.push({
      partner: c.partner,
      list: c.list,
      autoShare: flags[i] === "1",
    });
  });
  circles = kept;
  let idx = circles.findIndex((c) => c.partner === activePartner);
  activeCircle = idx === -1 ? 0 : idx;
  applyActiveCircle();
  saveCircles();
}

// ---- Async Love: tiny "no reply needed" notes of support ----
// Stored as a "Love: <Sender>" reminder (JSON in notes). There are no read receipts and
// nothing is sent to the other phone: they see it next time they open the app or widget.
const LOVE_PREFIX = "Love: ";
const DAY_MS = 24 * 60 * 60 * 1000;
const LOVE_MAX_PER_DAY = 3;
const LOVE_KINDS = {
  hug: ["🤗", "Sending you a hug"],
  tea: ["🍵", "Thinking of you"],
  candle: ["🕯️", "Here if you want me. No pressure."],
  moon: ["🌙", "Rest well"],
  seed: ["🌱", "No need to do anything"],
};
const loveHiddenPath = fm.joinPath(
  fm.documentsDirectory(),
  "mood_love_hidden.json",
);

function parseLove(r) {
  let title = String((r && r.title) || "").trim();
  if (!title.toLowerCase().startsWith("love:")) return null;
  try {
    let o = JSON.parse(r.notes || "{}");
    return {
      r: r,
      id: r.identifier || "",
      from: title.slice(5).trim(),
      to: String(o.to || ""),
      kind: String(o.k || ""),
      note: String(o.n || "").slice(0, 80),
      t: getTime(r),
    };
  } catch (e) {
    return null;
  }
}

// Notes I chose to hide (stored only on this phone: the sender never knows)
function loadHiddenLove() {
  try {
    if (fm.fileExists(loveHiddenPath)) {
      let a = JSON.parse(fm.readString(loveHiddenPath));
      if (Array.isArray(a)) return a.map(String);
    }
  } catch (e) {}
  return [];
}

async function hideLoveFromUrl(url) {
  let q = parseQuery(url || "");
  let id = String(q.id || "");
  if (!id) return;
  let h = loadHiddenLove();
  if (h.indexOf(id) === -1) h.push(id);
  fm.writeString(loveHiddenPath, JSON.stringify(h.slice(-200)));
}

async function saveLoveFromUrl(url) {
  let q = parseQuery(url || "");
  let kind = String(q.k || "");
  if (!LOVE_KINDS[kind] || !cal) return;
  let note = String(q.n || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  let all = await Reminder.all([cal]);
  let now = Date.now();
  let me = myUserName.toLowerCase();
  let mine = all.map(parseLove).filter((l) => l && l.from.toLowerCase() === me);
  // Housekeeping: my notes older than 14 days are removed from the list
  for (let l of mine) {
    if (now - l.t > 14 * DAY_MS && typeof l.r.remove === "function") {
      try {
        await l.r.remove();
      } catch (e) {}
    }
  }
  // A gentle daily limit keeps this a comfort, not a pressure
  if (mine.filter((l) => now - l.t < DAY_MS).length >= LOVE_MAX_PER_DAY) return;
  let r = new Reminder();
  r.title = LOVE_PREFIX + myUserName;
  r.notes = JSON.stringify({ to: partnerUserName, k: kind, n: note });
  r.calendar = cal;
  await r.save();
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
  a.title = 'List "' + circles[activeCircle].list + '" not found';
  a.message =
    'Create a Reminders list named "' +
    circles[activeCircle].list +
    '" (shared with ' +
    circles[activeCircle].partner +
    ") and run this again. " +
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
    if (url.indexOf("localhost/saveSame") !== -1) {
      pending = "saveSame";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/saveHelps") !== -1) {
      pending = "saveHelps";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/saveEdit") !== -1) {
      pending = "saveEdit";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/deleteEntry") !== -1) {
      pending = "deleteEntry";
      pendingUrl = url;
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
    if (url.indexOf("localhost/saveLove") !== -1) {
      pending = "saveLove";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/hideLove") !== -1) {
      pending = "hideLove";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/switch") !== -1) {
      pending = "switch";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/addFriend") !== -1) {
      pending = "addFriend";
      pendingUrl = url;
      return false;
    }
    if (url.indexOf("localhost/saveFriends") !== -1) {
      pending = "saveFriends";
      pendingUrl = url;
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
      if (action === "saveSame") await saveSameFromUrl(actionUrl);
      if (action === "saveHelps") await saveHelpsFromUrl(actionUrl);
      if (action === "saveEdit") await saveEditFromUrl(actionUrl);
      if (action === "deleteEntry") await deleteEntryFromUrl(actionUrl);
      if (action === "saveSettings") await saveSettingsFromUrl(actionUrl);
      if (action === "testReminder") await sendTestReminder();
      if (action === "changeAvatar") await changeMyAvatar();
      if (action === "saveLove") await saveLoveFromUrl(actionUrl);
      if (action === "hideLove") await hideLoveFromUrl(actionUrl);
      if (action === "switch") await switchCircleFromUrl(actionUrl);
      if (action === "addFriend") await addFriendFromUrl(actionUrl);
      if (action === "saveFriends") await saveFriendsFromUrl(actionUrl);
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
  let quick = readQuickParams();
  let skipDashboard = false;
  if (quick) {
    let res = await performQuickLog(quick);
    await scheduleCheckInReminder();
    if (quick.viaShortcut) {
      // Run from Shortcuts / Back Tap / Action Button: log silently, no UI
      Script.setShortcutOutput(res.msg);
      skipDashboard = true;
    } else if (!res.ok) {
      let a = new Alert();
      a.title = "Quick log";
      a.message = res.msg;
      a.addAction("OK");
      await a.present();
    }
  }
  if (!skipDashboard) await runDashboard();
}

Script.complete();
