// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: lock;
// 1. Specify your Apple Reminders list name
const listName = "Mood Dashboard";

// 2. Fetch all reminder calendars/lists
let calendars = await Calendar.forReminders();
let moodCalendar = calendars.find(
  (c) => c.title.toLowerCase() === listName.toLowerCase(),
);

let currentStatus = null;

if (moodCalendar) {
  // Fetch incomplete reminders from the Mood Dashboard list
  let reminders = await Reminder.allIncomplete([moodCalendar]);

  // Sort to get the most recently created reminder
  if (reminders.length > 0) {
    reminders.sort((a, b) => b.creationDate - a.creationDate);
    currentStatus = reminders[0];
  }
}

// 3. Fallback text if no reminder is found
let moodTitle = currentStatus ? currentStatus.title : "No Status Set";
let moodNote = currentStatus && currentStatus.notes ? currentStatus.notes : "";
let updateTime = currentStatus ? formatDate(currentStatus.creationDate) : "";

// 4. Build Widget UI
let widget = new ListWidget();
widget.setPadding(8, 8, 8, 8);

// Main Status Line (Bold)
let titleText = widget.addText(moodTitle);
titleText.font = Font.boldSystemFont(14);
titleText.textColor = Color.white();

widget.addSpacer(2);

// Subtext Note (Italic & Translucent)
if (moodNote) {
  let noteText = widget.addText(moodNote);
  noteText.font = Font.italicSystemFont(11);
  noteText.textColor = new Color("#FFFFFF", 0.75);
  noteText.lineLimit = 2;
  widget.addSpacer(4);
}

// Timestamp
if (updateTime) {
  let timeText = widget.addText(`Updated ${updateTime}`);
  timeText.font = Font.systemFont(9);
  timeText.textColor = new Color("#FFFFFF", 0.45);
}

// Helper function to format timestamp (e.g., "2:36 PM")
function formatDate(date) {
  if (!date) return "";
  let df = new DateFormatter();
  df.useNoDateStyle(); // Fixed: Scriptable method for time-only formatting
  df.useShortTimeStyle();
  return df.string(date);
}

// 5. Preview & Render
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentAccessoryRectangular();
}

Script.complete();
