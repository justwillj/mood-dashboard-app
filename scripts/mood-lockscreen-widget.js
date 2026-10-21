// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: lock;

// ==========================================
// MOOD LOCK SCREEN WIDGET (rectangular)
// Shared logic lives in mood-core.js
// Widget parameter (optional): a friend's name
// ==========================================

const core = importModule("mood-core");

// Must match the dashboard script's name in Scriptable EXACTLY
const dashboardScriptName = "mood-dashboard";

// Ask iOS to reload the widget after this many minutes (a hint, not a guarantee)
const REFRESH_MINUTES = 5;

async function buildRectangular() {
  const ctx = await core.loadWidgetContext(args.widgetParameter);
  const snap = await core.loadSnapshot(ctx, { light: true });
  const theme = ctx.theme;

  const view = core.summarizeCheckin(snap.partner, ctx.presets);
  const statusText = view.has ? view.statusText : "No Check-in";
  const noteText = view.split.text;
  const energyText = view.resting ? "🌙" : core.energyDots(view.energy);

  let updateLine =
    view.has && view.date
      ? "Updated " + core.relTime(view.date, { compact: true })
      : "No check-in yet";
  if (view.split.editedDate) {
    updateLine += " · ✏️ " + core.clockTime(view.split.editedDate);
  }

  const w = new ListWidget();
  w.url =
    "scriptable:///run/" +
    encodeURIComponent(dashboardScriptName) +
    "?friend=" +
    encodeURIComponent(ctx.partnerUserName);

  const headerRow = w.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();

  const nameLabel = headerRow.addText(ctx.partnerUserName.toUpperCase());
  nameLabel.font = Font.boldSystemFont(9);
  nameLabel.textColor = new Color(theme.accentPartner);
  nameLabel.lineLimit = 1;

  headerRow.addSpacer();

  const energyIcon = headerRow.addText(energyText);
  energyIcon.font = Font.boldSystemFont(9);
  energyIcon.textColor = new Color(theme.dots);

  w.addSpacer(2);

  const content = w.addStack();
  content.layoutVertically();

  const statusLabel = content.addText(statusText);
  statusLabel.font = Font.semiboldSystemFont(13);
  statusLabel.textColor = Color.white();
  statusLabel.lineLimit = 1;

  if (noteText) {
    content.addSpacer(1);
    const note = content.addText('"' + noteText + '"');
    note.font = Font.italicSystemFont(9.5);
    note.textColor = new Color(theme.note, 0.9);
    note.lineLimit = 1;
    note.minimumScaleFactor = 0.85;
    content.addSpacer(1);
  }

  const updated = content.addText(updateLine);
  updated.font = Font.systemFont(8);
  updated.textColor = new Color(theme.note, 0.7);

  return w;
}

const widget = await buildRectangular();
if (config.runsInWidget) {
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  Script.setWidget(widget);
} else {
  await widget.presentAccessoryRectangular();
}
Script.complete();
