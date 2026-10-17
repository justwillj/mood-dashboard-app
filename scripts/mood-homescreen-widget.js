// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: smile;
// ==========================================
// DUAL MOOD HOME SCREEN WIDGET
// ==========================================

// Must match the dashboard script's name in Scriptable EXACTLY (case and spaces)
const dashboardScriptName = "mood-dashboard";

const fm = FileManager.local();
const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");
const cachePath = fm.joinPath(
  fm.documentsDirectory(),
  "mood_widget_cache.json",
);

let myUserName = "You";
let partnerUserName = "Partner";

if (fm.fileExists(userConfigPath)) {
  try {
    let userConfig = JSON.parse(fm.readString(userConfigPath));
    myUserName = (userConfig.myUserName || "You").trim();
    partnerUserName = (userConfig.partnerUserName || "Partner").trim();
  } catch (e) {
    console.log("Could not read user_config.json, using defaults.");
  }
}

const listName = "Mood Dashboard";
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

function getEnergyIcon(level) {
  let validLevel = Math.max(1, Math.min(5, level || 3));
  return "●".repeat(validLevel) + "○".repeat(5 - validLevel);
}

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

// ---- Fetch latest moods (with cache fallback) ----
let myLatest = null;
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

      // Skip avatar storage reminders (they hold base64 image data, not moods)
      if (title.toLowerCase().includes("avatar")) continue;

      let match = title.match(/^\[(.*?)\]\s*(.*)$/);

      let user = match ? match[1].trim() : "";
      let mood = match ? match[2].trim() : title.trim();

      if (!myLatest && user.toLowerCase() === myUserName.toLowerCase()) {
        myLatest = { mood: mood, note: r.notes || "", date: r.creationDate };
      } else if (
        !partnerLatest &&
        (user.toLowerCase() === partnerUserName.toLowerCase() ||
          (!match &&
            title.toLowerCase().includes(partnerUserName.toLowerCase())))
      ) {
        partnerLatest = {
          mood: mood,
          note: r.notes || "",
          date: r.creationDate,
        };
      }

      if (myLatest && partnerLatest) break;
    }

    // Only trust the result if we actually found something
    if (myLatest || partnerLatest) {
      fetchOk = true;
      fm.writeString(
        cachePath,
        JSON.stringify({ my: myLatest, partner: partnerLatest }),
      );
    }
  }
} catch (e) {
  console.log("Reminders read failed: " + e.message);
}

if (!fetchOk && fm.fileExists(cachePath)) {
  try {
    let cached = JSON.parse(fm.readString(cachePath));
    myLatest = cached.my || null;
    partnerLatest = cached.partner || null;
  } catch (e) {
    console.log("Could not read cache.");
  }
}

// ---- Derived display values ----
let pStatusText = partnerLatest
  ? replaceCirclesWithFaces(partnerLatest.mood)
  : "No Check-in";
let pNoteText = partnerLatest ? partnerLatest.note : "";

let pMatchedPreset = partnerLatest
  ? moodPresets.find((p) =>
      p.title.toLowerCase().includes(partnerLatest.mood.toLowerCase()),
    )
  : null;
let pEnergyLevel = pMatchedPreset ? pMatchedPreset.energy : 3;
let pEnergyDots = getEnergyIcon(pEnergyLevel);

let myStatusText = myLatest
  ? replaceCirclesWithFaces(myLatest.mood)
  : "No Status";

// Time this script last actually ran (useful to see if iOS is refreshing)
let ranFormatter = new DateFormatter();
ranFormatter.dateFormat = "h:mm a";
let ranAt = ranFormatter.string(new Date());

// Adds a live-ticking "<prefix><relative time> ago" to a stack
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

// Adds compact "<prefix>22h ago" text to a stack
function addLiveTime(stack, date, size, hex, prefix) {
  let label = date ? formatRelativeTime(date) : "--";
  let t = stack.addText((prefix || "") + label);
  t.font = Font.systemFont(size);
  t.textColor = new Color(hex);
  t.lineLimit = 1;
}

// ---- Widget builders ----
function newBaseWidget() {
  let w = new ListWidget();
  w.backgroundColor = new Color("#0B0C10");
  // Tapping the widget opens and runs the dashboard script
  w.url = "scriptable:///run/" + encodeURIComponent(dashboardScriptName);
  return w;
}

// SMALL (~158pt square): partner mood is the hero, "you" is one compact line
function buildSmallWidget() {
  let widget = newBaseWidget();
  widget.setPadding(12, 12, 12, 12);

  let topRow = widget.addStack();
  topRow.layoutHorizontally();
  topRow.centerAlignContent();

  let name = topRow.addText(partnerUserName.toUpperCase());
  name.font = Font.boldSystemFont(9);
  name.textColor = new Color("#F472B6");
  name.lineLimit = 1;
  name.minimumScaleFactor = 0.7;

  topRow.addSpacer();

  let dots = topRow.addText(pEnergyDots);
  dots.font = Font.boldSystemFont(8);
  dots.textColor = new Color("#00E5FF");

  widget.addSpacer(6);

  let status = widget.addText(pStatusText);
  status.font = Font.boldSystemFont(15);
  status.textColor = Color.white();
  status.lineLimit = 2;
  status.minimumScaleFactor = 0.8;

  if (pNoteText) {
    widget.addSpacer(3);
    let note = widget.addText(`"${pNoteText}"`);
    note.font = Font.italicSystemFont(10);
    note.textColor = new Color("#D1D5DB");
    note.lineLimit = 2;
    note.minimumScaleFactor = 0.85;
  }

  widget.addSpacer();

  let youRow = widget.addStack();
  youRow.layoutHorizontally();
  youRow.centerAlignContent();

  let youTag = youRow.addText("YOU");
  youTag.font = Font.boldSystemFont(8);
  youTag.textColor = new Color("#818CF8");

  youRow.addSpacer(5);

  let youMood = youRow.addText(myStatusText);
  youMood.font = Font.semiboldSystemFont(10);
  youMood.textColor = Color.white();
  youMood.lineLimit = 1;
  youMood.minimumScaleFactor = 0.7;

  widget.addSpacer(3);

  let timeRow = widget.addStack();
  timeRow.layoutHorizontally();
  addLiveTime(
    timeRow,
    partnerLatest ? partnerLatest.date : null,
    8,
    "#9CA3AF",
    "Updated ",
  );

  return widget;
}

// MEDIUM (and LARGE, which reuses it and pins content to the top)
function buildMediumWidget(isLarge) {
  let widget = newBaseWidget();
  widget.setPadding(14, 16, 14, 16);

  let headerStack = widget.addStack();
  headerStack.layoutHorizontally();

  let headerTitle = headerStack.addText("MOOD DASHBOARD");
  headerTitle.font = Font.boldSystemFont(10);
  headerTitle.textColor = new Color("#818CF8");

  headerStack.addSpacer();

  let ranLabel = headerStack.addText("↻ " + ranAt);
  ranLabel.font = Font.systemFont(8);
  ranLabel.textColor = new Color("#6B7280");

  widget.addSpacer(8);

  let partnerCard = widget.addStack();
  partnerCard.layoutVertically();
  partnerCard.backgroundColor = new Color("#1E1F29");
  partnerCard.cornerRadius = 14;
  partnerCard.setPadding(10, 12, 10, 12);

  let pRow1 = partnerCard.addStack();
  pRow1.layoutHorizontally();
  pRow1.centerAlignContent();

  let pNameLabel = pRow1.addText(partnerUserName.toUpperCase());
  pNameLabel.font = Font.boldSystemFont(10);
  pNameLabel.textColor = new Color("#F472B6");

  pRow1.addSpacer();

  let pDots = pRow1.addText(pEnergyDots);
  pDots.font = Font.boldSystemFont(9);
  pDots.textColor = new Color("#00E5FF");

  partnerCard.addSpacer(3);

  let pStatus = partnerCard.addText(pStatusText);
  pStatus.font = Font.boldSystemFont(14);
  pStatus.textColor = Color.white();
  pStatus.lineLimit = 1;

  if (pNoteText) {
    partnerCard.addSpacer(2);
    let pNote = partnerCard.addText(`"${pNoteText}"`);
    pNote.font = Font.italicSystemFont(10);
    pNote.textColor = new Color("#D1D5DB");
    pNote.lineLimit = 1;
  }

  partnerCard.addSpacer(2);

  let pTimeRow = partnerCard.addStack();
  pTimeRow.layoutHorizontally();
  addLiveTime(
    pTimeRow,
    partnerLatest ? partnerLatest.date : null,
    8,
    "#9CA3AF",
    "Updated ",
  );

  widget.addSpacer(8);

  let myCard = widget.addStack();
  myCard.layoutHorizontally();
  myCard.centerAlignContent();
  myCard.backgroundColor = new Color("#171821");
  myCard.cornerRadius = 10;
  myCard.setPadding(8, 10, 8, 10);

  let myTag = myCard.addText("YOU");
  myTag.font = Font.boldSystemFont(9);
  myTag.textColor = new Color("#818CF8");

  myCard.addSpacer(8);

  let myMood = myCard.addText(myStatusText);
  myMood.font = Font.semiboldSystemFont(11);
  myMood.textColor = Color.white();
  myMood.lineLimit = 1;

  myCard.addSpacer();

  let myTimeRow = myCard.addStack();
  myTimeRow.layoutHorizontally();
  addLiveTime(myTimeRow, myLatest ? myLatest.date : null, 8, "#6B7280", "");

  if (isLarge) widget.addSpacer();

  return widget;
}

// ---- Pick size: real family in a widget, a chooser when run in the app ----
let family = "medium";
let cancelled = false;

if (config.runsInWidget) {
  family = config.widgetFamily || "medium";
} else {
  let sizeAlert = new Alert();
  sizeAlert.title = "Preview size";
  sizeAlert.addAction("Small");
  sizeAlert.addAction("Medium");
  sizeAlert.addAction("Large");
  sizeAlert.addCancelAction("Cancel");
  let choice = await sizeAlert.presentSheet();
  if (choice === -1) cancelled = true;
  family = ["small", "medium", "large"][choice] || "medium";
}

if (!cancelled) {
  let widget =
    family === "small"
      ? buildSmallWidget()
      : buildMediumWidget(family === "large");

  if (config.runsInWidget) {
    widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
    Script.setWidget(widget);
  } else if (family === "small") {
    await widget.presentSmall();
  } else if (family === "large") {
    await widget.presentLarge();
  } else {
    await widget.presentMedium();
  }
}

Script.complete();
