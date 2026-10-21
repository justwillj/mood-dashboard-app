// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// ==========================================
// MOOD APP INSTALLER & GITHUB SYNC
// ==========================================

const githubUser = "justwillj";
const repoName = "mood-dashboard-app";
const branch = "main";
const targetFolder = "scripts";

// Known scripts fallback in case GitHub API hits rate limits
const FALLBACK_SCRIPTS = [
  "mood-core.js",
  "mood-dashboard.js",
  "mood-homescreen-widget.js",
  "mood-lockscreen-widget.js",
];

let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch (e) {
  fm = FileManager.local();
}

const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");
const circlesPath = fm.joinPath(fm.documentsDirectory(), "mood_circles.json");

async function runSync() {
  let isFirstTime = !fm.fileExists(userConfigPath);

  if (isFirstTime) {
    let success = await promptForNames(
      "Welcome to Mood Dashboard",
      "Let's get you set up! Enter your details below:",
    );
    if (!success) return;
  } else {
    let menuAlert = new Alert();
    menuAlert.title = "Mood App Manager";
    menuAlert.message = "Choose an option:";
    menuAlert.addAction("🔄 Update Scripts from GitHub");
    menuAlert.addAction("✏️ Change Setup (Names & List)");
    menuAlert.addAction("🚀 Launch Dashboard");
    menuAlert.addCancelAction("Cancel");

    let choice = await menuAlert.presentAlert();
    if (choice === -1) return;
    if (choice === 1) {
      let success = await promptForNames(
        "Update Setup",
        "Update your names or shared list below:",
      );
      if (!success) return;
    } else if (choice === 2) {
      Safari.open("scriptable:///run/" + encodeURIComponent("mood-dashboard"));
      return;
    }
  }

  // --- DOWNLOAD SCRIPTS ---
  let downloadList = [];
  let apiUrl = `https://api.github.com/repos/${githubUser}/${repoName}/contents/${targetFolder}?ref=${branch}&t=${Date.now()}`;

  try {
    let req = new Request(apiUrl);
    req.headers = { "User-Agent": "Scriptable-AutoSync" };
    let responseText = await req.loadString();
    let items = JSON.parse(responseText);

    if (Array.isArray(items)) {
      downloadList = items
        .filter((item) => item.name && item.name.endsWith(".js"))
        .map((item) => ({
          name: item.name,
          url:
            item.download_url ||
            `https://raw.githubusercontent.com/${githubUser}/${repoName}/${branch}/${targetFolder}/${item.name}?t=${Date.now()}`,
        }));
    }
  } catch (err) {
    console.log("GitHub API unavailable or rate-limited. Using fallback list.");
  }

  // Fallback if GitHub API failed (e.g. cellular IP rate limit)
  if (downloadList.length === 0) {
    downloadList = FALLBACK_SCRIPTS.map((filename) => ({
      name: filename,
      url: `https://raw.githubusercontent.com/${githubUser}/${repoName}/${branch}/${targetFolder}/${filename}?t=${Date.now()}`,
    }));
  }

  try {
    let syncedCount = 0;

    for (let script of downloadList) {
      let fileReq = new Request(script.url);
      let content = await fileReq.loadString();

      if (content && content.trim().length > 0) {
        let filePath = fm.joinPath(fm.documentsDirectory(), script.name);
        fm.writeString(filePath, content);
        syncedCount++;
        console.log("Successfully synced: " + script.name);
      }
    }

    // Success alert with immediate launch option
    let alert = new Alert();
    alert.title = isFirstTime ? "Setup Complete! 🎉" : "Sync Successful! 🔄";
    alert.message = isFirstTime
      ? `Successfully installed ${syncedCount} scripts.\n\nNext steps:\n1. Open Apple Reminders & share your list with your partner.\n2. Tap below to launch your dashboard!`
      : `Successfully updated ${syncedCount} script(s) from GitHub.`;

    alert.addAction("🚀 Open Dashboard");
    alert.addCancelAction("Done");

    let choice = await alert.presentAlert();
    if (choice === 0) {
      Safari.open("scriptable:///run/" + encodeURIComponent("mood-dashboard"));
    }
  } catch (error) {
    let alert = new Alert();
    alert.title = "Sync Failed";
    alert.message = error.message;
    alert.addAction("OK");
    await alert.present();
  }
}

async function promptForNames(title, message) {
  let existingMyName = "";
  let existingPartnerName = "";
  let existingListName = "Mood Dashboard";
  let existingTheme = "forest";

  if (fm.fileExists(userConfigPath)) {
    try {
      let cfg = JSON.parse(fm.readString(userConfigPath));
      existingMyName = cfg.myUserName === "You" ? "" : cfg.myUserName || "";
      existingPartnerName =
        cfg.partnerUserName === "Partner" ? "" : cfg.partnerUserName || "";
      existingListName = cfg.listName || "Mood Dashboard";
      existingTheme = cfg.theme || "forest";
    } catch (e) {}
  }

  let setupAlert = new Alert();
  setupAlert.title = title;
  setupAlert.message = message;
  setupAlert.addTextField("Your Name (e.g. Dylan)", existingMyName);
  setupAlert.addTextField("Partner Name (e.g. Will)", existingPartnerName);
  setupAlert.addTextField("Shared Reminders List", existingListName);
  setupAlert.addAction("Save & Continue");
  setupAlert.addCancelAction("Cancel");

  let res = await setupAlert.presentAlert();
  if (res === -1) return false;

  let myName = setupAlert.textFieldValue(0).trim() || "You";
  let partnerName = setupAlert.textFieldValue(1).trim() || "Partner";
  let lstName = setupAlert.textFieldValue(2).trim() || "Mood Dashboard";

  // Check / Auto-Create the Apple Reminders list
  try {
    let calendars = await Calendar.forReminders();
    let found = calendars.find(
      (c) => c.title.trim().toLowerCase() === lstName.toLowerCase(),
    );

    if (!found) {
      let createAlert = new Alert();
      createAlert.title = "List Not Found";
      createAlert.message = `The Reminders list "${lstName}" does not exist yet. Would you like to create it now in iCloud?`;
      createAlert.addAction("Create List");
      createAlert.addCancelAction("I'll do it manually");

      let createChoice = await createAlert.presentAlert();
      if (createChoice === 0) {
        try {
          await Calendar.createForReminders(lstName);
          console.log(`Created Reminders list: ${lstName}`);
        } catch (err) {
          console.log("Could not auto-create list: " + err.message);
        }
      }
    }
  } catch (permErr) {
    console.log("Reminders permission check skipped: " + permErr.message);
  }

  // Save user_config.json with default forest theme
  let configData = {
    myUserName: myName,
    partnerUserName: partnerName,
    listName: lstName,
    theme: existingTheme,
  };
  fm.writeString(userConfigPath, JSON.stringify(configData, null, 2));

  // Save mood_circles.json
  let circlesData = { circles: [], active: 0 };
  if (fm.fileExists(circlesPath)) {
    try {
      circlesData = JSON.parse(fm.readString(circlesPath));
    } catch (e) {}
  }

  if (!circlesData.circles || circlesData.circles.length === 0) {
    circlesData.circles = [
      { partner: partnerName, list: lstName, autoShare: true },
    ];
  } else {
    let idx = circlesData.active || 0;
    if (circlesData.circles[idx]) {
      circlesData.circles[idx].partner = partnerName;
      circlesData.circles[idx].list = lstName;
    }
  }
  fm.writeString(circlesPath, JSON.stringify(circlesData, null, 2));

  return true;
}

await runSync();
Script.complete();
