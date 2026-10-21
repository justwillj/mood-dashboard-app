// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: cog;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: cog;

// ==========================================
// MOOD CORE
// Shared logic for mood-dashboard, mood-homescreen-widget and
// mood-lockscreen-widget.
//
//   const core = importModule("mood-core");
//
// This file is a MODULE. It never calls Script.complete(), never reads
// args/config, and has no top-level await. Entry scripts pass in anything
// they need (e.g. the widget parameter).
//
// Sections:
//   1. Constants
//   2. Themes
//   3. Storage (JSON files in Documents)
//   4. Reminders protocol (titles, notes, helps, love, avatars)
//   5. Formatting
//   6. Energy + analytics
//   7. Reminders reading + widget snapshot
// ==========================================

// ------------------------------------------
// 1. CONSTANTS
// ------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const LOW_ENERGY = 2;
const LOVE_MAX_PER_DAY = 3;

// Note-line marks stored in a check-in's notes
const NO_REPLY_MARK = "🔕 No reply needed";
const CAP_MARK = "📊";
const NEED_MARK = "🤝 Need:";
const EDIT_MARK = "✏️ Edited:";

const REST_TITLE = "🌙 Resting";
const HELPS_PREFIX = "Helps: ";
const LOVE_PREFIX = "Love: ";

const NEEDS = {
  space: { icon: "🎧", full: "🎧 Space & quiet" },
  parallel: { icon: "🛋️", full: "🛋️ Parallel play (no talking)" },
  distract: { icon: "💬", full: "💬 Distraction / memes" },
  comfort: { icon: "🫂", full: "🫂 Comfort & warmth" },
  advice: { icon: "💡", full: "💡 Advice wanted" },
};

// kind -> [emoji, text]
const LOVE_KINDS = {
  hug: ["🤗", "Sending you a hug"],
  tea: ["🍵", "Thinking of you"],
  candle: ["🕯️", "Here if you want me. No pressure."],
  moon: ["🌙", "Rest well"],
  seed: ["🌱", "No need to do anything"],
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DEFAULT_MOODS = [
  { title: "🟢 Locked In", energy: 5 },
  { title: "⚡ Focused", energy: 4 },
  { title: "🟣 Creative", energy: 3 },
  { title: "🟡 Chill", energy: 2 },
  { title: "☕ Cozy", energy: 2 },
  { title: "🔴 Low Battery", energy: 1 },
];
function defaultMoods() {
  return DEFAULT_MOODS.map((m) => Object.assign({}, m));
}

const DEFAULT_SETTINGS = {
  reminderHours: 0,
  quietEnabled: true,
  quietStart: 22,
  quietEnd: 8,
};

// File names inside the Scriptable Documents folder (do not rename:
// existing data lives here)
const FILES = {
  userConfig: "user_config.json",
  presets: "mood_presets.json",
  settings: "mood_settings.json",
  circles: "mood_circles.json",
  loveHidden: "mood_love_hidden.json",
};

function clampInt(v, lo, hi, fallback) {
  let n = parseInt(v, 10);
  return isNaN(n) ? fallback : Math.max(lo, Math.min(hi, n));
}

// ------------------------------------------
// 2. THEMES
// ------------------------------------------
// textDim / textSub may be CSS rgba() strings (dashboard WebView only).
// Scriptable's Color() only understands hex, so every theme also carries
// widgetDim / widgetSub hex values. Widgets must use getWidgetTheme().
const THEMES = {
  forest: {
    id: "forest",
    name: "Forest & Sage",
    bg: "#121915",
    card: "#1B241F",
    cardSec: "#161D19",
    heroMe: "#1A2620",
    heroPartner: "#241D1A",
    accentMe: "#8DA399",
    accentPartner: "#D97757",
    dots: "#E0A96D",
    note: "#E0A96D",
    text: "#F4F1EA",
    textDim: "#A3ADA7",
    textSub: "#75827A",
    widgetDim: "#A3ADA7",
    widgetSub: "#75827A",
    border: "rgba(167, 196, 181, 0.15)",
    borderPartner: "rgba(217, 119, 87, 0.3)",
    btnPrimary: "#4F6D60",
    btnPrimaryBorder: "#628576",
  },
  sand: {
    id: "sand",
    name: "Warm Sand & Clay",
    bg: "#181513",
    card: "#231F1C",
    cardSec: "#1D1916",
    heroMe: "#26211C",
    heroPartner: "#281D1A",
    accentMe: "#D69F54",
    accentPartner: "#C26D53",
    dots: "#E7B068",
    note: "#D69F54",
    text: "#F5EDE4",
    textDim: "#A89F96",
    textSub: "#7B736B",
    widgetDim: "#A89F96",
    widgetSub: "#7B736B",
    border: "rgba(214, 159, 84, 0.15)",
    borderPartner: "rgba(194, 109, 83, 0.38)",
    btnPrimary: "#7E5835",
    btnPrimaryBorder: "#966B43",
  },
  midnight: {
    id: "midnight",
    name: "Midnight Neon",
    bg: "#0B0C10",
    card: "#1E1F29",
    cardSec: "#171821",
    heroMe: "rgba(255,255,255,0.08)",
    heroPartner: "rgba(255,255,255,0.08)",
    accentMe: "#818CF8",
    accentPartner: "#F472B6",
    dots: "#00E5FF",
    note: "#FFB6C1",
    text: "#FFFFFF",
    textDim: "rgba(255,255,255,0.6)",
    textSub: "rgba(255,255,255,0.45)",
    widgetDim: "#D1D5DB",
    widgetSub: "#9CA3AF",
    border: "rgba(255,255,255,0.12)",
    borderPartner: "rgba(236,72,153,0.3)",
    btnPrimary: "#6366F1",
    btnPrimaryBorder: "#6366F1",
  },
};
const THEME_ORDER = ["forest", "sand", "midnight"];

function getTheme(name) {
  return THEMES[name] || THEMES.forest;
}

// Theme with hex-only text colors, safe for `new Color(...)` in widgets
function getWidgetTheme(name) {
  let t = getTheme(name);
  return Object.assign({}, t, { textDim: t.widgetDim, textSub: t.widgetSub });
}

function nextThemeName(current) {
  let i = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}

// ------------------------------------------
// 3. STORAGE
// ------------------------------------------
let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch (e) {
  fm = FileManager.local();
}

function docPath(name) {
  return fm.joinPath(fm.documentsDirectory(), name);
}

// Makes sure an iCloud file is on the device before reading it.
// (The old lock-screen check called a method that does not exist, so it never ran.)
async function ensureDownloaded(path) {
  try {
    if (
      typeof fm.isFileStoredIniCloud === "function" &&
      fm.isFileStoredIniCloud(path) &&
      typeof fm.isFileDownloaded === "function" &&
      !fm.isFileDownloaded(path)
    ) {
      await fm.downloadFileFromiCloud(path);
    }
  } catch (e) {}
}

function fileExists(name) {
  return fm.fileExists(docPath(name));
}

async function readJson(name, fallback) {
  let path = docPath(name);
  try {
    await ensureDownloaded(path);
    if (!fm.fileExists(path)) return fallback;
    return JSON.parse(fm.readString(path));
  } catch (e) {
    console.log("Could not read " + name + ": " + e.message);
    return fallback;
  }
}

function writeJson(name, obj) {
  fm.writeString(docPath(name), JSON.stringify(obj, null, 2));
}

// ---- user_config.json ----
async function loadUserConfig() {
  let raw = await readJson(FILES.userConfig, {});
  let cfg = raw && typeof raw === "object" ? raw : {};
  return {
    myUserName: String(cfg.myUserName || "You").trim(),
    partnerUserName: String(cfg.partnerUserName || "Partner").trim(),
    listName: String(cfg.listName || "Mood Dashboard").trim(),
    theme: THEMES[cfg.theme] ? cfg.theme : "forest",
  };
}

// Merges `patch` into the stored config (keeps any unknown keys)
async function saveUserConfig(patch) {
  let existing = await readJson(FILES.userConfig, {});
  let cfg = Object.assign(
    {},
    existing && typeof existing === "object" ? existing : {},
    patch,
  );
  writeJson(FILES.userConfig, cfg);
  return cfg;
}

// ---- mood_presets.json ----
// allowEmpty=true (dashboard): a saved empty list stays empty.
// allowEmpty=false (widgets): an empty/missing list falls back to defaults.
async function loadPresets(allowEmpty) {
  let raw = await readJson(FILES.presets, null);
  let list = null;
  if (Array.isArray(raw)) {
    list = raw
      .map((m) => (typeof m === "string" ? { title: m, energy: 3 } : m))
      .filter((m) => m && typeof m.title === "string" && m.title.trim())
      .map((m) =>
        Object.assign({}, m, { energy: clampInt(m.energy, 1, 5, 3) }),
      );
  }
  if (list && (list.length || allowEmpty)) return list;
  return defaultMoods();
}

function savePresets(moods) {
  writeJson(FILES.presets, moods);
}

// ---- mood_settings.json (check-in reminders) ----
async function loadSettings() {
  let saved = await readJson(FILES.settings, null);
  if (!saved || typeof saved !== "object") {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
  return {
    reminderHours: clampInt(saved.reminderHours, 0, 168, 0),
    quietEnabled: saved.quietEnabled !== false,
    quietStart: clampInt(saved.quietStart, 0, 23, 22),
    quietEnd: clampInt(saved.quietEnd, 0, 23, 8),
  };
}

function saveSettings(settings) {
  writeJson(FILES.settings, settings);
}

// ---- mood_circles.json (friends) ----
function cleanCircle(c) {
  if (!c || typeof c.partner !== "string" || typeof c.list !== "string")
    return null;
  let partner = c.partner.trim().slice(0, 40);
  let list = c.list.trim().slice(0, 80);
  if (!partner || !list) return null;
  return { partner: partner, list: list, autoShare: c.autoShare !== false };
}

// fallback = { partnerUserName, listName } from the user config
async function loadCircles(fallback) {
  let saved = await readJson(FILES.circles, null);
  let list = [];
  let active = 0;
  if (saved && typeof saved === "object") {
    let seen = {};
    (Array.isArray(saved.circles) ? saved.circles : []).forEach((c) => {
      let cc = cleanCircle(c);
      if (cc && !seen[cc.partner.toLowerCase()]) {
        seen[cc.partner.toLowerCase()] = true;
        list.push(cc);
      }
    });
    active = clampInt(saved.active, 0, Math.max(0, list.length - 1), 0);
  }
  if (!list.length) {
    list = [
      {
        partner: fallback.partnerUserName,
        list: fallback.listName,
        autoShare: true,
      },
    ];
    active = 0;
  }
  return { circles: list, active: active };
}

function saveCircles(circles, active) {
  writeJson(FILES.circles, { circles: circles, active: active });
}

// A widget parameter (friend's name) wins, else the friend chosen in the dashboard
function pickCircle(circles, active, want) {
  let w = String(want || "").trim().toLowerCase();
  let found = w && circles.find((c) => c.partner.trim().toLowerCase() === w);
  return found || circles[Math.max(0, Math.min(circles.length - 1, active))];
}

// ---- mood_love_hidden.json ----
async function loadHiddenLove() {
  let a = await readJson(FILES.loveHidden, []);
  return Array.isArray(a) ? a.map(String) : [];
}

function saveHiddenLove(ids) {
  writeJson(FILES.loveHidden, ids.slice(-200));
}

// ---- widget snapshot cache (one per friend) ----
function cacheFileFor(partner) {
  return (
    "mood_widget_cache_" +
    String(partner).toLowerCase().replace(/[^a-z0-9]+/g, "_") +
    ".json"
  );
}

async function readSnapshotCache(partner) {
  let c = await readJson(cacheFileFor(partner), null);
  return c && typeof c === "object" ? c : null;
}

function writeSnapshotCache(partner, snap) {
  try {
    fm.writeString(docPath(cacheFileFor(partner)), JSON.stringify(snap));
  } catch (e) {
    console.log("Could not write cache: " + e.message);
  }
}

// ------------------------------------------
// 4. REMINDERS PROTOCOL
// The "schema" of the shared Reminders list. Pure functions only.
// ------------------------------------------
const getTime = (r) =>
  r && r.creationDate ? new Date(r.creationDate).getTime() : 0;

function lc(s) {
  return String(s || "").trim().toLowerCase();
}

// "[Name] 🟢 Mood" -> { user, mood }; anything else -> user "Unknown"
function parseMood(title) {
  let match = String(title || "").match(/^\[(.*?)\]\s*(.*)$/);
  if (match) return { user: match[1], mood: match[2] };
  return { user: "Unknown", mood: String(title || "") };
}

// ---- data reminders (not check-ins) ----
// Avatar titles are exactly "<Name> Avatar". A check-in title always starts
// with "[", so a mood that merely contains the word "avatar" is never hidden.
function isAvatarTitle(title) {
  let t = lc(title);
  return !t.startsWith("[") && t.endsWith(" avatar");
}
function isAvatarFor(reminder, name) {
  return lc(reminder && reminder.title) === lc(name + " avatar");
}
function isHelpsTitle(title) {
  return lc(title).startsWith("helps:");
}
function isHelpsFor(reminder, name) {
  return lc(reminder && reminder.title) === lc(HELPS_PREFIX + name);
}
function isLoveTitle(title) {
  return lc(title).startsWith("love:");
}
function isDataTitle(title) {
  return isAvatarTitle(title) || isHelpsTitle(title) || isLoveTitle(title);
}

function isRestingMood(mood) {
  return lc(mood).startsWith("🌙 resting");
}

// ---- avatars ----
function avatarDataUri(reminder) {
  if (!reminder || !reminder.notes || !reminder.notes.startsWith("data:image"))
    return null;
  return reminder.notes;
}

// ---- notes: capacity line, needs, edit stamp, no-reply flag ----
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

function splitNotes(raw) {
  let keep = [];
  let noReply = false;
  let cap = {};
  let need = null;
  let editedDate = null;

  String(raw || "")
    .split("\n")
    .forEach((line) => {
      let l = line.trim();
      if (l === NO_REPLY_MARK) {
        noReply = true;
      } else if (l.startsWith(CAP_MARK)) {
        cap = parseCapLine(l);
      } else if (l.startsWith(NEED_MARK)) {
        need = l.replace(NEED_MARK, "").trim().toLowerCase();
      } else if (l.startsWith(EDIT_MARK)) {
        let parsed = new Date(l.replace(EDIT_MARK, "").trim());
        if (!isNaN(parsed.getTime())) editedDate = parsed;
      } else if (l) {
        keep.push(l);
      }
    });

  return {
    text: keep.join(" "),
    noReply: noReply,
    cap: cap,
    need: need,
    editedDate: editedDate,
  };
}

function buildNotes(text, noReply, cap, need, editedDate) {
  let clean = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        l !== NO_REPLY_MARK &&
        !l.startsWith(CAP_MARK) &&
        !l.startsWith(NEED_MARK) &&
        !l.startsWith(EDIT_MARK),
    )
    .join(" ");
  let lines = [];
  if (clean) lines.push(clean);
  if (need) lines.push(NEED_MARK + " " + need);
  let capLine = formatCapLine(cap);
  if (capLine) lines.push(capLine);
  if (editedDate)
    lines.push(EDIT_MARK + " " + new Date(editedDate).toISOString());
  if (noReply) lines.push(NO_REPLY_MARK);
  return lines.join("\n");
}

// Capacity values from URL / Shortcut parameters
function capFromQuery(q) {
  let cap = {};
  let soc = parseInt(q.soc, 10);
  let sen = parseInt(q.sen, 10);
  if (soc >= 1 && soc <= 5) cap.social = soc;
  if (sen >= 1 && sen <= 5) cap.sensory = sen;
  if (["ok", "text", "none"].indexOf(q.talk) !== -1) cap.talk = q.talk;
  return cap;
}

// ---- "What helps" cards ----
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

// Card text for a mood (falls back to the "*" general card). `raw` = notes JSON.
function pickHelpText(raw, mood) {
  try {
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) return "";
    let key = lc(mood);
    let ok = (c) => c && typeof c.m === "string" && typeof c.t === "string";
    let spec = list.find((c) => ok(c) && c.m.trim().toLowerCase() === key);
    let gen = list.find((c) => ok(c) && c.m === "*");
    return String((spec || gen || {}).t || "").trim().slice(0, 240);
  } catch (e) {
    return "";
  }
}

// ---- Async love ----
function parseLove(r) {
  let title = String((r && r.title) || "").trim();
  if (!isLoveTitle(title)) return null;
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

// Newest note from `fromName` to `toName` in the last 48h that isn't hidden
function findLove(list, fromName, toName, hidden) {
  let hid = hidden || [];
  let from = lc(fromName);
  let to = lc(toName);
  let best = null;
  for (let r of list) {
    let l = parseLove(r);
    if (!l || lc(l.from) !== from || lc(l.to) !== to) continue;
    if (!LOVE_KINDS[l.kind]) continue;
    if (Date.now() - l.t > 2 * DAY_MS) continue;
    if (l.id && hid.indexOf(l.id) !== -1) continue;
    if (!best || l.t > best.t)
      best = { k: l.kind, emoji: LOVE_KINDS[l.kind][0], t: l.t };
  }
  return best;
}

// ------------------------------------------
// 5. FORMATTING
// ------------------------------------------
function faceify(text) {
  return String(text || "")
    .replace(/🟢/g, "😤")
    .replace(/🔴/g, "🪫")
    .replace(/🟡/g, "😌")
    .replace(/🟣/g, "🎨")
    .replace(/\s+/g, " ")
    .trim();
}

function energyDots(level) {
  let lvl = Math.max(1, Math.min(5, level || 3));
  return "●".repeat(lvl) + "○".repeat(5 - lvl);
}

// "Today 3:15 PM" / "Oct 4, 3:15 PM"
function formatDate(d) {
  if (!d) return "Just now";
  let date = new Date(d);
  let df = new DateFormatter();
  df.dateFormat =
    date.toDateString() === new Date().toDateString()
      ? "'Today' h:mm a"
      : "MMM d, h:mm a";
  return df.string(date);
}

// "3:15 PM"
function clockTime(d) {
  if (!d) return "";
  let df = new DateFormatter();
  df.dateFormat = "h:mm a";
  return df.string(new Date(d));
}

// Default (app) style: "Just now", "5m ago", ..., older than a week -> formatDate.
// opts.compact (widgets): "just now", "5m ago", ..., "9d ago".
// Missing date -> "--".
function relTime(d, opts) {
  let compact = !!(opts && opts.compact);
  if (!d) return "--";
  let sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 60) return compact ? "just now" : "Just now";
  let min = Math.floor(sec / 60);
  if (min < 60) return min + "m ago";
  let hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + "h ago";
  let days = Math.floor(hrs / 24);
  if (!compact && days >= 7) return formatDate(d);
  return days + "d ago";
}

// Older than 24h?
function isStale(d) {
  return d ? Date.now() - new Date(d).getTime() > DAY_MS : false;
}

// ------------------------------------------
// 6. ENERGY + ANALYTICS
// ------------------------------------------
// Energy (1-5) of a mood from the presets: exact title match first,
// then the first preset whose title contains the text. null when unknown.
function energyFor(mood, presets) {
  let key = lc(mood);
  if (!key) return null;
  let list = presets || [];
  let p =
    list.find((x) => lc(x.title) === key) ||
    list.find((x) => String(x.title).toLowerCase().indexOf(key) !== -1);
  return p && p.energy != null ? p.energy : null;
}

// For writing a check-in: resting has no energy
function energyOfTitle(title, presets) {
  if (isRestingMood(title)) return null;
  let e = energyFor(title, presets);
  return e == null ? null : Math.max(1, Math.min(5, e));
}

// cap.energy (stored on the check-in) wins, then the preset, then `fallback`
function resolveEnergy(mood, cap, presets, fallback) {
  if (cap && cap.energy != null) return cap.energy;
  let e = energyFor(mood, presets);
  return e != null ? e : fallback == null ? null : fallback;
}

function dayKey(d) {
  return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
}
function avgOf(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}
function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

// Parse one check-in reminder ONCE into a plain record. Everything that needs
// the title or notes (history, trends, latest, edit sheet) reads this record.
function parseCheckin(r) {
  let p = parseMood(r.title || "");
  return {
    r: r,
    user: p.user,
    userLc: p.user.toLowerCase(),
    mood: p.mood,
    ns: splitNotes(r.notes),
    resting: isRestingMood(p.mood),
    t: getTime(r),
  };
}

// One person's entries for the trend charts, from already-parsed records
function entriesFromRecords(records, userName, presets) {
  let out = [];
  for (let rec of records) {
    if (!rec.r.creationDate || lc(rec.user) !== lc(userName)) continue;
    let energy = null;
    if (!rec.resting)
      energy =
        rec.ns.cap.energy != null
          ? rec.ns.cap.energy
          : energyFor(rec.mood, presets);
    out.push({
      t: new Date(rec.r.creationDate).getTime(),
      energy: energy,
      resting: rec.resting,
      social: rec.ns.cap.social != null ? rec.ns.cap.social : null,
      sensory: rec.ns.cap.sensory != null ? rec.ns.cap.sensory : null,
      talk: rec.ns.cap.talk || null,
    });
  }
  return out;
}

// Same as entriesFromRecords, starting from raw reminders (data reminders skipped)
function collectEntries(list, userName, presets) {
  let records = [];
  for (let r of list) {
    if (isDataTitle(r.title) || !r.creationDate) continue;
    records.push(parseCheckin(r));
  }
  return entriesFromRecords(records, userName, presets);
}

// R = number of days to chart (14 or 28). `alert` is always about the last 7 days.
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

// "Low lately" check used by the widgets: { low, days } or null.
// Same rule as the dashboard banner because it runs the same code.
function lowEnergyInfo(list, userName, presets) {
  return summarizeTrend(collectEntries(list, userName, presets), 7).alert;
}

// ------------------------------------------
// 7. READING REMINDERS + WIDGET SNAPSHOT
// ------------------------------------------
function findCalendar(calendars, name) {
  let n = lc(name);
  return calendars.find((c) => lc(c.title) === n) || null;
}

function sortNewestFirst(list) {
  return list.slice().sort((a, b) => getTime(b) - getTime(a));
}

// The one way to read a shared list: incomplete reminders, newest first.
// (A reminder ticked off in the Reminders app disappears everywhere.)
// Accepts one calendar or an array of calendars.
async function fetchReminders(calOrList) {
  let cals = Array.isArray(calOrList) ? calOrList : [calOrList];
  return sortNewestFirst(await Reminder.allIncomplete(cals));
}

// Newest check-in of me and of my friend from a newest-first list.
// opts.loosePartner (widgets): an untagged title that contains the friend's
// name also counts as theirs.
function latestCheckins(reminders, myName, partnerName, opts) {
  let loose = !!(opts && opts.loosePartner);
  let me = lc(myName);
  let them = lc(partnerName);
  let my = null;
  let partner = null;
  for (let r of reminders) {
    let title = r.title || "";
    if (isDataTitle(title)) continue;
    let m = title.match(/^\[(.*?)\]\s*(.*)$/);
    let user = m ? m[1].trim().toLowerCase() : "";
    let mood = m ? m[2].trim() : title.trim();
    let entry = { r: r, mood: mood, note: r.notes || "", date: r.creationDate };
    if (!my && user === me) {
      my = entry;
    } else if (
      !partner &&
      (user === them || (loose && !m && title.toLowerCase().includes(them)))
    ) {
      partner = entry;
    }
    if (my && partner) break;
  }
  return { my: my, partner: partner };
}

// Everything a widget needs to draw one check-in
function summarizeCheckin(latest, presets) {
  let split = splitNotes(latest ? latest.note : "");
  let resting = latest ? isRestingMood(latest.mood) : false;
  return {
    has: !!latest,
    statusText: latest ? faceify(latest.mood) || "No Status" : null,
    split: split,
    resting: resting,
    energy: resting
      ? null
      : resolveEnergy(latest ? latest.mood : "", split.cap, presets, 3),
    date: latest ? latest.date : null,
  };
}

// Context for a widget: names, theme and presets, with the friend chosen by
// the widget parameter (or the dashboard's active friend).
async function loadWidgetContext(widgetParameter) {
  let cfg = await loadUserConfig();
  let saved = await loadCircles(cfg);
  let pick = pickCircle(saved.circles, saved.active, widgetParameter);
  return {
    myUserName: cfg.myUserName,
    partnerUserName: pick.partner,
    listName: pick.list,
    themeName: cfg.theme,
    theme: getWidgetTheme(cfg.theme),
    presets: await loadPresets(false),
  };
}

const plainCheckin = (x) =>
  x ? { mood: x.mood, note: x.note, date: x.date } : null;

// Latest state for ctx.partnerUserName: { my, partner, helps, trend, love, fromCache }
// opts.light (lock screen): skip helps/trend/love and do not touch the cache file.
// Falls back to the cache when Reminders can't be read.
async function loadSnapshot(ctx, opts) {
  let light = !!(opts && opts.light);
  let snap = {
    my: null,
    partner: null,
    helps: "",
    trend: null,
    love: null,
    fromCache: false,
  };
  let ok = false;

  try {
    let calendars = await Calendar.forReminders();
    let cal = findCalendar(calendars, ctx.listName);
    if (cal) {
      let reminders = await fetchReminders(cal);
      let latest = latestCheckins(
        reminders,
        ctx.myUserName,
        ctx.partnerUserName,
        { loosePartner: true },
      );
      snap.my = plainCheckin(latest.my);
      snap.partner = plainCheckin(latest.partner);

      if (!light) {
        let helpsR = reminders.find((r) => isHelpsFor(r, ctx.partnerUserName));
        snap.helps = helpsR ? helpsR.notes || "" : "";
        snap.trend = lowEnergyInfo(reminders, ctx.partnerUserName, ctx.presets);
        let hidden = await loadHiddenLove();
        snap.love = findLove(
          reminders,
          ctx.partnerUserName,
          ctx.myUserName,
          hidden,
        );
      }

      if (snap.my || snap.partner) {
        ok = true;
        if (!light) {
          writeSnapshotCache(ctx.partnerUserName, {
            my: snap.my,
            partner: snap.partner,
            helps: snap.helps,
            trend: snap.trend,
            love: snap.love,
          });
        }
      }
    }
  } catch (e) {
    console.log("Reminders read failed: " + e.message);
  }

  if (!ok) {
    let cached = await readSnapshotCache(ctx.partnerUserName);
    if (cached) {
      snap.my = cached.my || null;
      snap.partner = cached.partner || null;
      snap.helps = cached.helps || "";
      snap.trend = cached.trend || null;
      snap.love = cached.love || null;
      snap.fromCache = true;
    }
  }
  return snap;
}

// ------------------------------------------
// EXPORTS
// ------------------------------------------
module.exports = {
  // constants
  DAY_MS, LOW_ENERGY, LOVE_MAX_PER_DAY,
  NO_REPLY_MARK, CAP_MARK, NEED_MARK, EDIT_MARK,
  REST_TITLE, HELPS_PREFIX, LOVE_PREFIX,
  NEEDS, LOVE_KINDS, MONTHS, FILES, DEFAULT_SETTINGS,
  defaultMoods, clampInt,
  // themes
  THEMES, THEME_ORDER, getTheme, getWidgetTheme, nextThemeName,
  // storage
  fm, docPath, fileExists, readJson, writeJson,
  loadUserConfig, saveUserConfig,
  loadPresets, savePresets,
  loadSettings, saveSettings,
  cleanCircle, loadCircles, saveCircles, pickCircle,
  loadHiddenLove, saveHiddenLove,
  cacheFileFor, readSnapshotCache, writeSnapshotCache,
  // protocol
  getTime, parseMood,
  isAvatarTitle, isAvatarFor, isHelpsTitle, isHelpsFor, isLoveTitle, isDataTitle,
  isRestingMood, avatarDataUri,
  parseCapLine, formatCapLine, splitNotes, buildNotes, capFromQuery,
  sanitizeHelps, parseHelps, pickHelpText,
  parseLove, findLove,
  // formatting
  faceify, energyDots, formatDate, clockTime, relTime, isStale,
  // energy + analytics
  energyFor, energyOfTitle, resolveEnergy,
  dayKey, avgOf, round1,
  parseCheckin, entriesFromRecords, collectEntries, summarizeTrend, lowEnergyInfo,
  // reading + snapshot
  findCalendar, sortNewestFirst, fetchReminders, latestCheckins,
  summarizeCheckin, loadWidgetContext, loadSnapshot,
};
