// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: lock;
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

// 5-Level Dot Energy Indicator
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

let calendars = await Calendar.forReminders();
let moodCalendar = calendars.find(
  (c) => c.title.toLowerCase() === listName.toLowerCase(),
);

let partnerLatest = null;

if (moodCalendar) {
  let reminders = await Reminder.allIncomplete([moodCalendar]);

  reminders.sort((a, b) => {
    let ta = a.creationDate ? new Date(a.creationDate).getTime() : 0;
    let tb = b.creationDate ? new Date(b.creationDate).getTime() : 0;
    return tb - ta;
  });

  for (let r of reminders) {
    let title = r.title || "";
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
}

let partnerStatusText = partnerLatest ? partnerLatest.mood : "No Check-in";
let partnerNoteText = partnerLatest ? partnerLatest.note : "";

let matchedPreset = partnerLatest
  ? moodPresets.find((p) =>
      p.title.toLowerCase().includes(partnerLatest.mood.toLowerCase()),
    )
  : null;
let energyLevel = matchedPreset ? matchedPreset.energy : 3;
let energyIconString = getEnergyIcon(energyLevel);

let displayStatusText = replaceCirclesWithFaces(partnerStatusText);

let widget = new ListWidget();
widget.setPadding(0, 0, 0, 0);

// Tapping the widget opens and runs the dashboard script
widget.url = "scriptable:///run/" + encodeURIComponent(dashboardScriptName);

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

let ranText = timeRow.addText("↻ " + ranAt);
ranText.font = Font.systemFont(8);
ranText.textColor = new Color("#FFFFFF", 0.4);
ranText.lineLimit = 1;

if (config.runsInWidget) {
  widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  Script.setWidget(widget);
} else {
  await widget.presentAccessoryRectangular();
}

Script.complete();
