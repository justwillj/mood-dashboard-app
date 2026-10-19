// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: smile;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: smile;
// ==========================================
// DUAL MOOD HOME SCREEN WIDGET
// ==========================================

// Must match the dashboard script's name in Scriptable EXACTLY (case and spaces)
const dashboardScriptName = "mood-dashboard";

let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch (e) {
  fm = FileManager.local();
}

const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");
let cachePath = fm.joinPath(fm.documentsDirectory(), "mood_widget_cache.json");

let myUserName = "You";
let partnerUserName = "Partner";
let listName = "Mood Dashboard";

if (fm.fileExists(userConfigPath)) {
  try {
    let userConfig = JSON.parse(fm.readString(userConfigPath));
    myUserName = (userConfig.myUserName || "You").trim();
    partnerUserName = (userConfig.partnerUserName || "Partner").trim();
    listName = (userConfig.listName || "Mood Dashboard").trim();
  } catch (e) {
    console.log("Could not read user_config.json, using defaults.");
  }
}

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

// One cache per friend so switching friends never shows the wrong person
cachePath = fm.joinPath(
  fm.documentsDirectory(),
  "mood_widget_cache_" +
    partnerUserName.toLowerCase().replace(/[^a-z0-9]+/g, "_") +
    ".json",
);
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

function isHelpsTitleFor(title, name) {
  return (
    String(title || "")
      .trim()
      .toLowerCase() === ("Helps: " + name).trim().toLowerCase()
  );
}

// The partner's "what helps" card for their current mood (falls back to their general card)
function pickHelpText(raw, mood) {
  try {
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) return "";
    let key = String(mood || "")
      .trim()
      .toLowerCase();
    let ok = (c) => c && typeof c.m === "string" && typeof c.t === "string";
    let spec = list.find((c) => ok(c) && c.m.trim().toLowerCase() === key);
    let gen = list.find((c) => ok(c) && c.m === "*");
    return String((spec || gen || {}).t || "")
      .trim()
      .slice(0, 240);
  } catch (e) {
    return "";
  }
}

// Energy (1-5) of a mood from this phone's presets; null when unknown
function presetEnergy(mood) {
  let key = String(mood || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  let p =
    moodPresets.find((x) => String(x.title).trim().toLowerCase() === key) ||
    moodPresets.find((x) => String(x.title).toLowerCase().includes(key));
  return p && p.energy != null ? p.energy : null;
}

// "Low lately" check for one person over the last 7 days (same rule as the dashboard):
// a day averaging 2 or below is "low"; alert when 3+ days are low and they are 60%+ of days with data
function lowEnergyInfo(list, userName) {
  let today = new Date();
  today.setHours(0, 0, 0, 0);
  let days = {};
  for (let r of list) {
    if (isDataTitle(r.title) || !r.creationDate) continue;
    let m = String(r.title || "").match(/^\[(.*?)\]\s*(.*)$/);
    if (!m || m[1].trim().toLowerCase() !== userName.toLowerCase()) continue;
    let mood = m[2].trim();
    if (isRestingMood(mood)) continue;
    let sp = splitNotes(r.notes);
    let e = sp.cap.energy != null ? sp.cap.energy : presetEnergy(mood);
    if (e == null) continue;
    let d = new Date(r.creationDate);
    d.setHours(0, 0, 0, 0);
    let age = Math.round((today - d) / DAY_MS);
    if (age < 0 || age > 6) continue;
    (days[age] = days[age] || []).push(e);
  }
  let keys = Object.keys(days);
  let low = keys.filter((k) => {
    let a = days[k];
    let avg = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.round(avg * 10) / 10 <= 2;
  }).length;
  return low >= 3 && low >= 0.6 * keys.length ? { low: low } : null;
}

// Async Love: the newest note from my friend to me in the last 48h (not hidden on this phone)
const LOVE_EMOJI = {
  hug: "🤗",
  tea: "🍵",
  candle: "🕯️",
  moon: "🌙",
  seed: "🌱",
};

function findLove(list, fromName, toName) {
  let hidden = [];
  try {
    let hp = fm.joinPath(fm.documentsDirectory(), "mood_love_hidden.json");
    if (fm.fileExists(hp)) hidden = JSON.parse(fm.readString(hp)).map(String);
  } catch (e) {}
  let best = null;
  for (let r of list) {
    let title = String(r.title || "").trim();
    if (!title.toLowerCase().startsWith("love:")) continue;
    if (title.slice(5).trim().toLowerCase() !== fromName.toLowerCase())
      continue;
    let t = r.creationDate ? new Date(r.creationDate).getTime() : 0;
    if (Date.now() - t > 2 * DAY_MS) continue;
    if (r.identifier && hidden.indexOf(String(r.identifier)) !== -1) continue;
    try {
      let o = JSON.parse(r.notes || "{}");
      if (String(o.to || "").toLowerCase() !== toName.toLowerCase()) continue;
      if (!LOVE_EMOJI[o.k]) continue;
      if (!best || t > best.t) best = { k: o.k, emoji: LOVE_EMOJI[o.k], t: t };
    } catch (e) {}
  }
  return best;
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
let partnerHelpsRaw = "";
let partnerTrend = null;
let partnerLove = null;
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

    // The partner's "what helps" cards live in a "Helps: <Name>" reminder
    let helpsReminder = reminders.find((r) =>
      isHelpsTitleFor(r.title, partnerUserName),
    );
    partnerHelpsRaw = helpsReminder ? helpsReminder.notes || "" : "";

    for (let r of reminders) {
      let title = r.title || "";

      // Skip data reminders (avatars, help cards): they are not mood check-ins
      if (isDataTitle(title)) continue;

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

    partnerTrend = lowEnergyInfo(reminders, partnerUserName);
    partnerLove = findLove(reminders, partnerUserName, myUserName);

    // Only trust the result if we actually found something
    if (myLatest || partnerLatest) {
      fetchOk = true;
      fm.writeString(
        cachePath,
        JSON.stringify({
          my: myLatest,
          partner: partnerLatest,
          helps: partnerHelpsRaw,
          trend: partnerTrend,
          love: partnerLove,
        }),
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
    partnerHelpsRaw = cached.helps || "";
    partnerTrend = cached.trend || null;
    partnerLove = cached.love || null;
  } catch (e) {
    console.log("Could not read cache.");
  }
}

// ---- Derived display values ----
let pStatusText = partnerLatest
  ? replaceCirclesWithFaces(partnerLatest.mood)
  : "No Check-in";
let pSplit = splitNotes(partnerLatest ? partnerLatest.note : "");
let pResting = partnerLatest ? isRestingMood(partnerLatest.mood) : false;
// 🔕 prefix = "no reply needed"; resting with no note says so
let pNoteText = pSplit.noReply
  ? "🔕 " + (pSplit.text || "No reply needed")
  : pSplit.text || (pResting ? "No check-ins needed" : "");
let helpText = partnerLatest
  ? pickHelpText(partnerHelpsRaw, partnerLatest.mood)
  : "";

// Older than 24h = amber time + dimmed mood (not when resting: silence is expected then)
function isOld(date) {
  return !!date && Date.now() - new Date(date).getTime() > DAY_MS;
}
let myResting = myLatest ? isRestingMood(myLatest.mood) : false;
let pStale = partnerLatest && !pResting ? isOld(partnerLatest.date) : false;
let myStale = false; // my own time never goes amber: a "you're behind" cue reads as guilt
const DIM_WHITE = new Color("#FFFFFF", 0.6);

let pMatchedPreset = partnerLatest
  ? moodPresets.find((p) =>
      p.title.toLowerCase().includes(partnerLatest.mood.toLowerCase()),
    )
  : null;
let pEnergyLevel =
  pSplit.cap.energy != null
    ? pSplit.cap.energy
    : pMatchedPreset
      ? pMatchedPreset.energy
      : 3;
let pEnergyDots = pResting ? "" : getEnergyIcon(pEnergyLevel);

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
function addLiveTime(stack, date, size, hex, prefix, stale) {
  let label = date ? formatRelativeTime(date) : "--";
  let t = stack.addText((prefix || "") + label);
  t.font = Font.systemFont(size);
  // Amber once it's been over 24 hours, like the dashboard
  t.textColor = stale ? new Color("#FBBF24", 0.9) : new Color(hex);
  t.lineLimit = 1;
}

// ---- Widget builders ----
function newBaseWidget() {
  let w = new ListWidget();
  w.backgroundColor = new Color("#0B0C10");
  // Tapping the widget opens and runs the dashboard script
  w.url =
    "scriptable:///run/" +
    encodeURIComponent(dashboardScriptName) +
    "?friend=" +
    encodeURIComponent(partnerUserName);
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
  status.textColor = pStale ? DIM_WHITE : Color.white();
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
  youMood.textColor = myStale ? DIM_WHITE : Color.white();
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
    pResting ? "Resting since " : "Updated ",
    pStale,
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

  // A note of love from my friend replaces the refresh time (no reply needed)
  let ranLabel = headerStack.addText(
    partnerLove
      ? "💌 " + partnerLove.emoji + " from " + partnerUserName
      : "↻ " + ranAt,
  );
  ranLabel.font = Font.systemFont(8);
  ranLabel.textColor = partnerLove
    ? new Color("#F9A8D4")
    : new Color("#6B7280");

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
  pStatus.textColor = pStale ? DIM_WHITE : Color.white();
  pStatus.lineLimit = 1;

  if (pNoteText) {
    partnerCard.addSpacer(2);
    let pNote = partnerCard.addText(`"${pNoteText}"`);
    pNote.font = Font.italicSystemFont(10);
    pNote.textColor = new Color("#D1D5DB");
    pNote.lineLimit = 1;
  }

  // 💡 the partner's "what helps" card (medium: only if there's room, large: always)
  if (helpText && (isLarge || !pNoteText)) {
    partnerCard.addSpacer(2);
    let pHelp = partnerCard.addText("💡 " + helpText);
    pHelp.font = Font.systemFont(9.5);
    pHelp.textColor = new Color("#FDE68A");
    pHelp.lineLimit = isLarge ? 4 : 2;
  }

  partnerCard.addSpacer(2);

  let pTimeRow = partnerCard.addStack();
  pTimeRow.layoutHorizontally();
  addLiveTime(
    pTimeRow,
    partnerLatest ? partnerLatest.date : null,
    8,
    "#9CA3AF",
    pResting ? "Resting since " : "Updated ",
    pStale,
  );

  // Right side: capacity (🔋 social, 🔊 sensory, talking) and a "low lately" heads-up
  let showTrend = !pResting && !!partnerTrend;
  let pRight = [
    capCompact(pSplit.cap),
    showTrend ? "📉 Low " + partnerTrend.low + " of 7 days" : "",
  ]
    .filter(Boolean)
    .join("  ");
  if (pRight) {
    pTimeRow.addSpacer();
    let pr = pTimeRow.addText(pRight);
    pr.font = Font.systemFont(8.5);
    pr.textColor = showTrend ? new Color("#FBBF24", 0.9) : new Color("#9CA3AF");
    pr.lineLimit = 1;
    pr.minimumScaleFactor = 0.8;
  }

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
  myMood.textColor = myStale ? DIM_WHITE : Color.white();
  myMood.lineLimit = 1;

  myCard.addSpacer();

  let myTimeRow = myCard.addStack();
  myTimeRow.layoutHorizontally();
  addLiveTime(
    myTimeRow,
    myLatest ? myLatest.date : null,
    8,
    "#6B7280",
    "",
    myStale,
  );

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
