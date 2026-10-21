// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: lock;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: lock;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: smile;
// ==========================================
// DUAL MOOD LOCK SCREEN WIDGET
// ==========================================

const dashboardScriptName = "mood-dashboard";

let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch (e) {
  fm = FileManager.local();
}

async function ensureDownloaded(path) {
  if (fm.isFileStorediCloud && !fm.isFileStorediCloud(path)) {
    try { await fm.downloadFileFromiCloud(path); } catch (e) {}
  }
}

function readFileSafe(path) {
  if (fm.fileExists(path)) {
    try { return fm.readString(path); } catch (e) {}
  }
  return null;
}

let partnerUserName = "Partner";
let listName = "Mood Dashboard";
let currentTheme = "forest";

const THEMES = {
  forest: {
    accentPartner: "#D97757",
    dots: "#E0A96D",
    note: "#E0A96D",
  },
  sand: {
    accentPartner: "#C26D53",
    dots: "#E7B068",
    note: "#D69F54",
  },
  midnight: {
    accentPartner: "#F472B6",
    dots: "#00E5FF",
    note: "#FFB6C1",
  },
};

const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");
await ensureDownloaded(userConfigPath);
let rawUserConfig = readFileSafe(userConfigPath);
if (rawUserConfig) {
  try {
    let config = JSON.parse(rawUserConfig);
    partnerUserName = (config.partnerUserName || "Partner").trim();
    listName = (config.listName || "Mood Dashboard").trim();
    if (config.theme && THEMES[config.theme]) {
      currentTheme = config.theme;
    }
  } catch (e) {
    console.log("Could not read user_config.json, using default.");
  }
}

let activeTheme = THEMES[currentTheme] || THEMES.forest;

const circlesPath = fm.joinPath(fm.documentsDirectory(), "mood_circles.json");
await ensureDownloaded(circlesPath);
let rawCircles = readFileSafe(circlesPath);
if (rawCircles) {
  try {
    let saved = JSON.parse(rawCircles);
    let friends = (Array.isArray(saved.circles) ? saved.circles : []).filter(
      (c) => c && typeof c.partner === "string" && typeof c.list === "string" && c.partner.trim() && c.list.trim()
    );
    if (friends.length) {
      let want = String(args.widgetParameter || "").trim().toLowerCase();
      let idx = Math.max(0, Math.min(friends.length - 1, parseInt(saved.active, 10) || 0));
      let pick = (want && friends.find(c => c.partner.trim().toLowerCase() === want)) || friends[idx];
      partnerUserName = pick.partner.trim();
      listName = pick.list.trim();
    }
  } catch (e) {}
}

const presetsPath = fm.joinPath(fm.documentsDirectory(), "mood_presets.json");
await ensureDownloaded(presetsPath);
let moodPresets = [];
let rawPresets = readFileSafe(presetsPath);
if (rawPresets) {
  try {
    let parsed = JSON.parse(rawPresets);
    moodPresets = parsed.map(m => typeof m === "string" ? { title: m, energy: 3 } : m);
  } catch (e) {}
}
if (moodPresets.length === 0) {
  moodPresets = [
    { title: "🟢 Locked In", energy: 5 },
    { title: "⚡ Focused", energy: 4 },
    { title: "🟣 Creative", energy: 3 },
    { title: "🟡 Chill", energy: 2 },
    { title: "☕ Cozy", energy: 2 },
    { title: "🔴 Low Battery", energy: 1 }
  ];
}

const NO_REPLY_MARK = "🔕 No reply needed";
const DAY_MS = 24 * 3600 * 1000;
const EDIT_MARK = "✏️ Edited:";

function isDataTitle(title) {
  let t = String(title || "").toLowerCase().trim();
  return t.includes("avatar") || t.startsWith("helps:") || t.startsWith("love:");
}

function isRestingMood(mood) {
  return String(mood || "").trim().toLowerCase().startsWith("🌙 resting");
}

function splitNotes(raw) {
  let keep = [];
  let noReply = false;
  let cap = {};
  let editedDate = null;

  String(raw || "")
    .split("\n")
    .forEach((line) => {
      let l = line.trim();
      if (l === NO_REPLY_MARK) noReply = true;
      else if (l.startsWith("📊")) {
        l.replace("📊", "").split("·").forEach(part => {
          let p = part.trim();
          let m = p.match(/^(Energy|Social|Sensory)\s+([1-5])\/5$/i);
          if (m) cap[m[1].toLowerCase()] = parseInt(m[2], 10);
        });
      } else if (l.startsWith(EDIT_MARK)) {
        let parsed = new Date(l.replace(EDIT_MARK, "").trim());
        if (!isNaN(parsed.getTime())) editedDate = parsed;
      } else if (l) {
        keep.push(l);
      }
    });

  return { text: keep.join(" "), noReply: noReply, cap: cap, editedDate: editedDate };
}

function formatRelativeTime(date) {
  if (!date) return "";
  let diffSec = Math.floor((new Date() - new Date(date)) / 1000);
  if (diffSec < 60) return "just now";
  let diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m ago";
  let diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return diffHours + "h ago";
  return Math.floor(diffHours / 24) + "d ago";
}

function formatShortTime(date) {
  if (!date) return "";
  let d = new Date(date);
  let df = new DateFormatter();
  df.dateFormat = "h:mm a";
  return df.string(d);
}

function getEnergyIcon(level) {
  let lvl = Math.max(1, Math.min(5, level || 3));
  return "●".repeat(lvl) + "○".repeat(5 - lvl);
}

function replaceCirclesWithFaces(text) {
  if (!text) return "No Status";
  return text.replace(/🟢/g, "😤").replace(/🔴/g, "🪫").replace(/🟡/g, "😌").replace(/🟣/g, "🎨").replace(/\s+/g, " ").trim();
}

let partnerLatest = null;
try {
  let calendars = await Calendar.forReminders();
  let moodCalendar = calendars.find(c => c.title.toLowerCase() === listName.toLowerCase());
  if (moodCalendar) {
    let reminders = await Reminder.allIncomplete([moodCalendar]);
    reminders.sort((a, b) => {
      let ta = a.creationDate ? new Date(a.creationDate).getTime() : 0;
      let tb = b.creationDate ? new Date(b.creationDate).getTime() : 0;
      return tb - ta;
    });
    for (let r of reminders) {
      let title = r.title || "";
      if (isDataTitle(title)) continue;
      let match = title.match(/^\[(.*?)\]\s*(.*)$/);
      let user = match ? match[1].trim() : "";
      let mood = match ? match[2].trim() : title.trim();
      if (!partnerLatest && (user.toLowerCase() === partnerUserName.toLowerCase() || (!match && title.toLowerCase().includes(partnerUserName.toLowerCase())))) {
        partnerLatest = { mood: mood, note: r.notes || "", date: r.creationDate };
        break;
      }
    }
  }
} catch (e) {}

let pStatusText = partnerLatest ? replaceCirclesWithFaces(partnerLatest.mood) : "No Check-in";
let pSplit = splitNotes(partnerLatest ? partnerLatest.note : "");
let pResting = partnerLatest ? isRestingMood(partnerLatest.mood) : false;
let partnerNoteText = pSplit.text || "";

let pMatchedPreset = partnerLatest ? moodPresets.find(p => p.title.toLowerCase().includes(partnerLatest.mood.toLowerCase())) : null;
let pEnergyLevel = pSplit.cap.energy != null ? pSplit.cap.energy : (pMatchedPreset ? pMatchedPreset.energy : 3);
let energyIconString = pResting ? "🌙" : getEnergyIcon(pEnergyLevel);

function buildRectangular() {
  let w = new ListWidget();
  w.url = "scriptable:///run/" + encodeURIComponent(dashboardScriptName) + "?friend=" + encodeURIComponent(partnerUserName);

  let headerRow = w.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();

  let nameLabel = headerRow.addText(partnerUserName.toUpperCase());
  nameLabel.font = Font.boldSystemFont(9);
  nameLabel.textColor = new Color(activeTheme.accentPartner);
  nameLabel.lineLimit = 1;

  headerRow.addSpacer();

  let energyIcon = headerRow.addText(energyIconString);
  energyIcon.font = Font.boldSystemFont(9);
  energyIcon.textColor = new Color(activeTheme.dots);

  w.addSpacer(2);

  let contentStack = w.addStack();
  contentStack.layoutVertically();

  let statusLabel = contentStack.addText(pStatusText);
  statusLabel.font = Font.semiboldSystemFont(13);
  statusLabel.textColor = Color.white();
  statusLabel.lineLimit = 1;

  if (partnerNoteText) {
    contentStack.addSpacer(1);
    let noteDisplay = contentStack.addText(`"${partnerNoteText}"`);
    noteDisplay.font = Font.italicSystemFont(9.5);
    noteDisplay.textColor = new Color(activeTheme.note, 0.9);
    noteDisplay.lineLimit = 1;
    noteDisplay.minimumScaleFactor = 0.85;
    contentStack.addSpacer(1);
  }

  let timeRow = contentStack.addStack();
  timeRow.layoutHorizontally();

  let updateLine = partnerLatest && partnerLatest.date
    ? "Updated " + formatRelativeTime(partnerLatest.date)
    : "No check-in yet";
  if (pSplit.editedDate) {
    updateLine += " · ✏️ " + formatShortTime(pSplit.editedDate);
  }

  let updatedText = timeRow.addText(updateLine);
  updatedText.font = Font.systemFont(8);
  updatedText.textColor = new Color(activeTheme.note, 0.7);

  return w;
}

let widget = buildRectangular();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentAccessoryRectangular();
}
Script.complete();
