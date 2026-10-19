// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: lock;
// ==========================================
// PARTNER MOOD LOCK SCREEN WIDGET (CLEAN ROW LAYOUT)
// ==========================================

// Must match the dashboard script's name in Scriptable EXACTLY (case and spaces)
const dashboardScriptName = "mood-dashboard";

const fm = FileManager.local();
const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");

let partnerUserName = "Partner";

if (fm.fileExists(userConfigPath)) {
  try {
    let userConfig = JSON.parse(fm.readString(userConfigPath));
    partnerUserName = (userConfig.partnerUserName || "Partner").trim();
  } catch (e) {
    console.log("Could not read user_config.json, using default.");
  }
}

let listName = "Mood Dashboard";

// ---- Which friend? A widget parameter (a friend's name) wins, else the friend chosen in the dashboard ----
const circlesPath = fm.joinPath(fm.documentsDirectory(), "mood_circles.json");
if (fm.fileExists(circlesPath)) {
  try {
    let saved = JSON.parse(fm.readString(circlesPath));
    let friends = (Array.isArray(saved.circles) ? saved.circles : []).filter(
      (c) =>
        c &&
        typeof c.partner === "string" &&
        typeof c.list === "string" &&
        c.partner.trim() &&
        c.list.trim(),
    );
    if (friends.length) {
      let want = String(args.widgetParameter || "")
        .trim()
        .toLowerCase();
      let idx = Math.max(
        0,
        Math.min(friends.length - 1, parseInt(saved.active, 10) || 0),
      );
      let pick =
        (want &&
          friends.find((c) => c.partner.trim().toLowerCase() === want)) ||
        friends[idx];
      partnerUserName = pick.partner.trim();
      listName = pick.list.trim();
    }
  } catch (e) {
    console.log("Could not read mood_circles.json, using defaults.");
  }
}
const presetsPath = fm.joinPath(fm.documentsDirectory(), "mood_presets.json");
let moodPresets = [];

if (fm.fileExists(presetsPath)) {
  try {
    let rawData = fm.readString(presetsPath);
    let parsed = JSON.parse(rawData);
    moodPresets = parsed.map((m) =>
      typeof m === "string" ? { title: m, energy: 3 } : m,
    );
  } catch (e) {
    console.log("Could not parse mood_presets.json: " + e.message);
  }
}

if (moodPresets.length === 0) {
  moodPresets = [
    { title: "🟢 Locked In", energy: 5 },
    { title: "⚡ Focused", energy: 4 },
    { title: "🟣 Creative", energy: 3 },
    { title: "🟡 Chill", energy: 2 },
    { title: "☕ Cozy", energy: 2 },
    { title: "🔴 Low Battery", energy: 1 },
  ];
}

// 5-Level Dot Energy Indicator
// ---- Conventions stored in the shared Reminders list (must match the dashboard) ----
const NO_REPLY_MARK = "🔕 No reply needed"; // last line of a check-in's notes
const DAY_MS = 24 * 60 * 60 * 1000;

// Reminders that store data (avatars, "Helps: <Name>" cards) rather than a mood check-in
function isDataTitle(title) {
  let t = String(title || "")
    .toLowerCase()
    .trim();
  return t.includes("avatar") || t.startsWith("helps:");
}

function isRestingMood(mood) {
  return String(mood || "")
    .trim()
    .toLowerCase()
    .startsWith("🌙 resting");
}

// Capacity line "📊 Energy 3/5 · Social 2/5 · Sensory 4/5 · Talk: text" (must match the dashboard)
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

// Splits notes into the visible note, capacity values and the "no reply needed" flag
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

// Tiny capacity summary for tight spaces: "🔋2 🔊4 💬"
function capCompact(cap) {
  let parts = [];
  if (cap.social != null) parts.push("🔋" + cap.social);
  if (cap.sensory != null) parts.push("🔊" + cap.sensory);
  if (cap.talk) parts.push({ ok: "🗣️", text: "💬", none: "🔇" }[cap.talk]);
  return parts.join(" ");
}

function getEnergyIcon(level) {
  let validLevel = Math.max(1, Math.min(5, level || 3));
  return "●".repeat(validLevel) + "○".repeat(5 - validLevel);
}

// Replaces circle emojis with face emojis
function replaceCirclesWithFaces(text) {
  if (!text) return "No Status";
  return text
    .replace(/🟢/g, "😤")
    .replace(/🔴/g, "🪫")
    .replace(/🟡/g, "😌")
    .replace(/🟣/g, "🎨")
    .replace(/\s+/g, " ")
    .trim();
}

// Compact relative time: "just now", "5m ago", "22h ago", "3d ago"
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

const cachePath = fm.joinPath(
  fm.documentsDirectory(),
  "mood_lockscreen_cache_" +
    partnerUserName.toLowerCase().replace(/[^a-z0-9]+/g, "_") +
    ".json",
);

// ---- Fetch latest partner mood (with cache fallback) ----
let partnerLatest = null;
let fetchOk = false;

try {
  let calendars = await Calendar.forReminders();
  let moodCalendar = calendars.find(
    (c) => c.title.toLowerCase() === listName.toLowerCase(),
  );

  if (moodCalendar) {
    let reminders = await Reminder.allIncomplete([moodCalendar]);

    reminders.sort((a, b) => {
      let ta = a.creationDate ? new Date(a.creationDate).getTime() : 0;
      let tb = b.creationDate ? new Date(b.creationDate).getTime() : 0;
      return tb - ta;
    });

    for (let r of reminders) {
      let title = r.title || "";

      // Skip data reminders (avatars, help cards): they are not mood check-ins
      if (isDataTitle(title)) continue;

      let match = title.match(/^\[(.*?)\]\s*(.*)$/);

      let user = match ? match[1].trim() : "";
      let mood = match ? match[2].trim() : title.trim();

      if (
        user.toLowerCase() === partnerUserName.toLowerCase() ||
        (!match && title.toLowerCase().includes(partnerUserName.toLowerCase()))
      ) {
        partnerLatest = {
          mood: mood,
          note: r.notes || "",
          date: r.creationDate,
        };
        break;
      }
    }

    // Only trust the result if we actually found something
    if (partnerLatest) {
      fetchOk = true;
      fm.writeString(cachePath, JSON.stringify({ partner: partnerLatest }));
    }
  }
} catch (e) {
  console.log("Reminders read failed: " + e.message);
}

if (!fetchOk && fm.fileExists(cachePath)) {
  try {
    let cached = JSON.parse(fm.readString(cachePath));
    partnerLatest = cached.partner || null;
  } catch (e) {
    console.log("Could not read cache.");
  }
}

let partnerStatusText = partnerLatest ? partnerLatest.mood : "No Check-in";
let pSplit = splitNotes(partnerLatest ? partnerLatest.note : "");
let pResting = partnerLatest ? isRestingMood(partnerLatest.mood) : false;
// 🔕 prefix = "no reply needed"; resting with no note says so
let partnerNoteText = pSplit.noReply
  ? "🔕 " + (pSplit.text || "No reply needed")
  : pSplit.text || (pResting ? "No check-ins needed" : "");

let matchedPreset = partnerLatest
  ? moodPresets.find((p) =>
      p.title.toLowerCase().includes(partnerLatest.mood.toLowerCase()),
    )
  : null;
let energyLevel = matchedPreset ? matchedPreset.energy : 3;
let energyIconString = pResting ? "" : getEnergyIcon(energyLevel);

let displayStatusText = replaceCirclesWithFaces(partnerStatusText);

// Short time for tiny spaces: "now", "5m", "22h", "3d"
function formatShortTime(date) {
  if (!date) return "--";
  let t = formatRelativeTime(date);
  return t === "just now" ? "now" : t.replace(" ago", "");
}

// First emoji/symbol of the mood (or first letter if the mood has no emoji)
function getFaceToken(text) {
  let token = (text || "").trim().split(" ")[0] || "?";
  if (/^[A-Za-z0-9]/.test(token)) return token.charAt(0).toUpperCase();
  return token;
}

function newLockWidget() {
  let w = new ListWidget();
  // Tapping the widget opens and runs the dashboard script
  w.url =
    "scriptable:///run/" +
    encodeURIComponent(dashboardScriptName) +
    "?friend=" +
    encodeURIComponent(partnerUserName);
  return w;
}

// RECTANGULAR: mood + dots, note, "Updated ..." + last refresh
function buildRectangular() {
  let widget = newLockWidget();
  widget.setPadding(0, 0, 0, 0);

  // Vertical container for all lines
  let contentStack = widget.addStack();
  contentStack.layoutVertically();

  // LINE 1: Title + Energy Dots on the same top row
  let headerRow = contentStack.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();

  let moodText = headerRow.addText(displayStatusText);
  moodText.font = Font.boldSystemFont(12);
  moodText.textColor = Color.white();
  moodText.lineLimit = 1;
  moodText.minimumScaleFactor = 0.8;

  headerRow.addSpacer();

  let energyIcon = headerRow.addText(energyIconString);
  energyIcon.font = Font.boldSystemFont(9);
  energyIcon.textColor = new Color("#00E5FF");

  contentStack.addSpacer(1);

  // LINE 2: Note text across full width
  if (partnerNoteText) {
    let noteDisplay = contentStack.addText(`"${partnerNoteText}"`);
    noteDisplay.font = Font.italicSystemFont(9.5);
    noteDisplay.textColor = new Color("#FFB6C1", 0.9);
    noteDisplay.lineLimit = 1;
    noteDisplay.minimumScaleFactor = 0.85;
    contentStack.addSpacer(1);
  }

  // LINE 3: "Updated 22h ago" on the left, last refresh time on the right
  let ranFormatter = new DateFormatter();
  ranFormatter.dateFormat = "h:mm a";
  let ranAt = ranFormatter.string(new Date());

  let timeRow = contentStack.addStack();
  timeRow.layoutHorizontally();
  timeRow.centerAlignContent();

  let updatedText = timeRow.addText(
    partnerLatest && partnerLatest.date
      ? "Updated " + formatRelativeTime(partnerLatest.date)
      : "No check-in yet",
  );
  updatedText.font = Font.systemFont(8);
  updatedText.textColor = new Color("#FFFFFF", 0.5);
  updatedText.lineLimit = 1;
  updatedText.minimumScaleFactor = 0.8;

  timeRow.addSpacer();

  // Capacity (🔋 social, 🔊 sensory, talking) takes the place of the refresh time when set
  let ranText = timeRow.addText(capCompact(pSplit.cap) || "↻ " + ranAt);
  ranText.font = Font.systemFont(8);
  ranText.textColor = new Color("#FFFFFF", 0.4);
  ranText.lineLimit = 1;

  return widget;
}

// CIRCULAR: just the mood emoji with how long ago it was set
function buildCircular() {
  let widget = newLockWidget();
  widget.addAccessoryWidgetBackground = true;
  widget.setPadding(0, 0, 0, 0);

  widget.addSpacer();

  let faceRow = widget.addStack();
  faceRow.layoutHorizontally();
  faceRow.addSpacer();
  let face = faceRow.addText(
    partnerLatest ? getFaceToken(displayStatusText) : "–",
  );
  face.font = Font.systemFont(24);
  faceRow.addSpacer();

  let timeRow = widget.addStack();
  timeRow.layoutHorizontally();
  timeRow.addSpacer();
  let t = timeRow.addText(
    partnerLatest && partnerLatest.date
      ? formatShortTime(partnerLatest.date)
      : "--",
  );
  t.font = Font.boldSystemFont(10);
  t.lineLimit = 1;
  timeRow.addSpacer();

  widget.addSpacer();

  return widget;
}

// INLINE: a single line of text (sits above the clock area)
function buildInline() {
  let widget = newLockWidget();
  let line = partnerLatest
    ? displayStatusText + " · " + formatShortTime(partnerLatest.date)
    : "No check-in yet";
  let t = widget.addText(line);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.8;
  return widget;
}

// ---- Pick family: real family in a widget, a chooser when run in the app ----
let family = "accessoryRectangular";
let cancelled = false;

if (config.runsInWidget) {
  family = config.widgetFamily || family;
} else {
  let familyAlert = new Alert();
  familyAlert.title = "Preview widget";
  familyAlert.addAction("Rectangular");
  familyAlert.addAction("Circular");
  familyAlert.addAction("Inline");
  familyAlert.addCancelAction("Cancel");
  let choice = await familyAlert.presentSheet();
  if (choice === -1) cancelled = true;
  family =
    ["accessoryRectangular", "accessoryCircular", "accessoryInline"][choice] ||
    family;
}

if (!cancelled) {
  let widget;
  if (family === "accessoryCircular") widget = buildCircular();
  else if (family === "accessoryInline") widget = buildInline();
  else widget = buildRectangular();

  if (config.runsInWidget) {
    widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
    Script.setWidget(widget);
  } else if (family === "accessoryCircular") {
    await widget.presentAccessoryCircular();
  } else if (family === "accessoryInline") {
    await widget.presentAccessoryInline();
  } else {
    await widget.presentAccessoryRectangular();
  }
}

Script.complete();
