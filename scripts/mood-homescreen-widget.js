// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: smile;

// ==========================================
// MOOD HOME SCREEN WIDGET (small / medium / large)
// Shared logic lives in mood-core.js
// Widget parameter (optional): a friend's name
// ==========================================

const core = importModule("mood-core");

// Must match the dashboard script's name in Scriptable EXACTLY
const dashboardScriptName = "mood-dashboard";

// Ask iOS to reload the widget after this many minutes (a hint, not a guarantee)
const REFRESH_MINUTES = 5;

const AMBER = "#FBBF24";
const DIM_WHITE = new Color("#FFFFFF", 0.6);

// ---- Data -> one plain view object the layouts read from ----
async function loadView() {
  const ctx = await core.loadWidgetContext(args.widgetParameter);
  const snap = await core.loadSnapshot(ctx);

  const p = core.summarizeCheckin(snap.partner, ctx.presets);
  const me = core.summarizeCheckin(snap.my, ctx.presets);

  const noteText = p.split.noReply
    ? "🔕 " + (p.split.text || "No reply needed")
    : p.split.text || (p.resting ? "No check-ins needed" : "");

  return {
    theme: ctx.theme,
    partnerName: ctx.partnerUserName,
    // partner
    statusText: p.has ? p.statusText : "No Check-in",
    dots: p.resting ? "" : core.energyDots(p.energy),
    noteText: noteText,
    helpText: snap.partner
      ? core.pickHelpText(snap.helps, snap.partner.mood)
      : "",
    resting: p.resting,
    stale: snap.partner && !p.resting ? core.isStale(p.date) : false,
    date: p.date,
    editedDate: p.split.editedDate,
    cap: p.split.cap,
    trend: !p.resting && snap.trend ? snap.trend : null,
    love: snap.love,
    // me
    myStatusText: me.has ? me.statusText : "No Status",
    myDate: me.date,
    myEditedDate: me.split.editedDate,
    // misc
    ranAt: core.clockTime(new Date()),
  };
}

// ---- Small helpers ----
function newBaseWidget(v) {
  const w = new ListWidget();
  w.backgroundColor = new Color(v.theme.bg);
  w.url =
    "scriptable:///run/" +
    encodeURIComponent(dashboardScriptName) +
    "?friend=" +
    encodeURIComponent(v.partnerName);
  return w;
}

// Tiny capacity summary for tight spaces: "🔋2 🔊4 💬"
function capCompact(cap) {
  const parts = [];
  if (cap.social != null) parts.push("🔋" + cap.social);
  if (cap.sensory != null) parts.push("🔊" + cap.sensory);
  if (cap.talk) parts.push({ ok: "🗣️", text: "💬", none: "🔇" }[cap.talk]);
  return parts.join(" ");
}

function addText(stack, text, font, color, opts) {
  const t = stack.addText(text);
  t.font = font;
  t.textColor = color;
  if (opts && opts.lines) t.lineLimit = opts.lines;
  if (opts && opts.scale) t.minimumScaleFactor = opts.scale;
  return t;
}

// ---- SMALL ----
function buildSmall(v) {
  const th = v.theme;
  const w = newBaseWidget(v);
  w.setPadding(12, 12, 12, 12);

  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  addText(
    top,
    v.partnerName.toUpperCase(),
    Font.boldSystemFont(9),
    new Color(th.accentPartner),
    { lines: 1, scale: 0.7 },
  );
  top.addSpacer();
  addText(top, v.dots, Font.boldSystemFont(8), new Color(th.dots));

  w.addSpacer(6);

  addText(
    w,
    v.statusText,
    Font.boldSystemFont(15),
    v.stale ? DIM_WHITE : new Color(th.text),
    { lines: 2, scale: 0.8 },
  );

  if (v.noteText) {
    w.addSpacer(3);
    addText(
      w,
      '"' + v.noteText + '"',
      Font.italicSystemFont(10),
      new Color(th.textDim),
      { lines: 2, scale: 0.85 },
    );
  }

  w.addSpacer();

  const you = w.addStack();
  you.layoutHorizontally();
  you.centerAlignContent();
  addText(you, "YOU", Font.boldSystemFont(8), new Color(th.accentMe));
  you.addSpacer(5);
  addText(
    you,
    v.myStatusText,
    Font.semiboldSystemFont(10),
    new Color(th.text),
    { lines: 1, scale: 0.7 },
  );

  w.addSpacer(3);

  addText(
    w,
    (v.resting ? "Resting since " : "Updated ") +
      core.relTime(v.date, { compact: true }),
    Font.systemFont(8),
    v.stale ? new Color(AMBER, 0.9) : new Color(th.textSub),
    { lines: 1 },
  );

  return w;
}

// ---- MEDIUM & LARGE ----
function buildMedium(v, isLarge) {
  const th = v.theme;
  const w = newBaseWidget(v);
  w.setPadding(14, 16, 14, 16);

  const header = w.addStack();
  header.layoutHorizontally();
  addText(
    header,
    "MOOD DASHBOARD",
    Font.boldSystemFont(10),
    new Color(th.accentMe),
  );
  header.addSpacer();
  addText(
    header,
    v.love ? "💌 " + v.love.emoji + " from " + v.partnerName : "↻ " + v.ranAt,
    Font.systemFont(8),
    new Color(v.love ? th.accentPartner : th.textSub),
  );

  w.addSpacer(8);

  // -- friend card --
  const card = w.addStack();
  card.layoutVertically();
  card.backgroundColor = new Color(th.card);
  card.cornerRadius = 14;
  card.setPadding(10, 12, 10, 12);

  const row1 = card.addStack();
  row1.layoutHorizontally();
  row1.centerAlignContent();
  addText(
    row1,
    v.partnerName.toUpperCase(),
    Font.boldSystemFont(10),
    new Color(th.accentPartner),
  );
  row1.addSpacer();
  addText(row1, v.dots, Font.boldSystemFont(9), new Color(th.dots));

  card.addSpacer(3);
  addText(
    card,
    v.statusText,
    Font.boldSystemFont(14),
    v.stale ? DIM_WHITE : new Color(th.text),
    { lines: 1 },
  );

  if (v.noteText) {
    card.addSpacer(2);
    addText(
      card,
      '"' + v.noteText + '"',
      Font.italicSystemFont(10),
      new Color(th.textDim),
      { lines: 1 },
    );
  }

  if (v.helpText && (isLarge || !v.noteText)) {
    card.addSpacer(2);
    addText(
      card,
      "💡 " + v.helpText,
      Font.systemFont(9.5),
      new Color("#FDE68A"),
      { lines: isLarge ? 4 : 2 },
    );
  }

  card.addSpacer(2);

  const timeRow = card.addStack();
  timeRow.layoutHorizontally();
  let timeLabel =
    (v.resting ? "Resting since " : "Updated ") +
    core.relTime(v.date, { compact: true });
  if (v.editedDate) {
    timeLabel += " · ✏️ " + core.relTime(v.editedDate, { compact: true });
  }
  addText(
    timeRow,
    timeLabel,
    Font.systemFont(8),
    v.stale ? new Color(AMBER, 0.9) : new Color(th.textSub),
    { lines: 1 },
  );

  const right = [
    capCompact(v.cap),
    v.trend ? "📉 Low " + v.trend.low + " of 7 days" : "",
  ]
    .filter(Boolean)
    .join("  ");
  if (right) {
    timeRow.addSpacer();
    addText(
      timeRow,
      right,
      Font.systemFont(8.5),
      new Color(v.trend ? AMBER : "#9CA3AF", v.trend ? 0.9 : 1),
      { lines: 1, scale: 0.8 },
    );
  }

  w.addSpacer(8);

  // -- my card --
  const mine = w.addStack();
  mine.layoutHorizontally();
  mine.centerAlignContent();
  mine.backgroundColor = new Color(th.cardSec);
  mine.cornerRadius = 10;
  mine.setPadding(8, 10, 8, 10);

  addText(mine, "YOU", Font.boldSystemFont(9), new Color(th.accentMe));
  mine.addSpacer(8);
  addText(
    mine,
    v.myStatusText,
    Font.semiboldSystemFont(11),
    new Color(th.text),
    { lines: 1 },
  );
  mine.addSpacer();

  let myTime = core.relTime(v.myDate, { compact: true });
  if (v.myEditedDate) {
    myTime += " · ✏️ " + core.relTime(v.myEditedDate, { compact: true });
  }
  addText(mine, myTime, Font.systemFont(8), new Color(th.textSub), {
    lines: 1,
  });

  if (isLarge) w.addSpacer();
  return w;
}

// ---- Pick size ----
let family = "medium";
let cancelled = false;

if (config.runsInWidget) {
  family = config.widgetFamily || "medium";
} else {
  const sizeAlert = new Alert();
  sizeAlert.title = "Preview size";
  sizeAlert.addAction("Small");
  sizeAlert.addAction("Medium");
  sizeAlert.addAction("Large");
  sizeAlert.addCancelAction("Cancel");
  const choice = await sizeAlert.presentSheet();
  if (choice === -1) cancelled = true;
  family = ["small", "medium", "large"][choice] || "medium";
}

if (!cancelled) {
  const view = await loadView();
  const widget =
    family === "small"
      ? buildSmall(view)
      : buildMedium(view, family === "large");

  if (config.runsInWidget) {
    widget.refreshAfterDate = new Date(
      Date.now() + REFRESH_MINUTES * 60 * 1000,
    );
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
