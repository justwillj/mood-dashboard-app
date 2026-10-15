// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: lock;
// ==========================================
// PARTNER MOOD LOCK SCREEN WIDGET (ROBUST)
// ==========================================

const fm = FileManager.local();
const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");

let partnerUserName = "Partner";

if (fm.fileExists(userConfigPath)) {
  try {
    let config = JSON.parse(fm.readString(userConfigPath));
    partnerUserName = (config.partnerUserName || "Partner").trim();
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
    { title: "🟢 Locked In", energy: 4 },
    { title: "⚡ Focused", energy: 4 },
    { title: "🟣 Creative", energy: 3 },
    { title: "🟡 Chill", energy: 2 },
    { title: "☕ Cozy", energy: 2 },
    { title: "🔴 Low Battery", energy: 1 },
  ];
}

function getEnergyIcon(level) {
  let validLevel = Math.max(1, Math.min(4, level || 3));
  return "█".repeat(validLevel) + "░".repeat(4 - validLevel);
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
    let match = title.match(/^\[(.*?)\]\s*(.*)\$/);

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
let relativeTime = partnerLatest ? formatRelativeTime(partnerLatest.date) : "";

let matchedPreset = moodPresets.find((p) =>
  p.title.toLowerCase().includes(partnerStatusText.toLowerCase()),
);
let energyLevel = matchedPreset ? matchedPreset.energy : 3;
let energyIconString = getEnergyIcon(energyLevel);

let widget = new ListWidget();
widget.setPadding(4, 6, 4, 6);
widget.url = "scriptable://run?scriptName=Dual%20Mood%20Dashboard";

let mainStack = widget.addStack();
mainStack.layoutHorizontally();

let leftStack = mainStack.addStack();
leftStack.layoutVertically();

let moodText = leftStack.addText(partnerStatusText);
moodText.font = Font.boldSystemFont(14);
moodText.textColor = Color.white();
moodText.lineLimit = 1;

leftStack.addSpacer(2);

if (partnerNoteText) {
  let noteDisplay = leftStack.addText(`"${partnerNoteText}"`);
  noteDisplay.font = Font.italicSystemFont(10);
  noteDisplay.textColor = new Color("#FFB6C1", 0.9);
  noteDisplay.lineLimit = 1;
  leftStack.addSpacer(2);
}

if (relativeTime) {
  let timeDisplay = leftStack.addText(`Updated ${relativeTime}`);
  timeDisplay.font = Font.systemFont(9);
  timeDisplay.textColor = new Color("#FFFFFF", 0.5);
  timeDisplay.lineLimit = 1;
}

mainStack.addSpacer();

let rightStack = mainStack.addStack();
rightStack.layoutVertically();

let energyIcon = rightStack.addText(energyIconString);
energyIcon.font = Font.boldSystemFont(12);
energyIcon.textColor = new Color("#00E5FF");

function formatRelativeTime(date) {
  if (!date) return "";
  let now = new Date();
  let diffSec = Math.floor((now - new Date(date)) / 1000);

  if (diffSec < 60) return "just now";
  let diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  let diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  let diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

if (config.runsInWidget) {
  Script.setWidget(widget);
  widget.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);
} else {
  widget.presentAccessoryRectangular();
}

Script.complete();
