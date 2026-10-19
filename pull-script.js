// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// ==========================================
// GITHUB SYNC (FIXED ITEM ITERATION & SETUP)
// ==========================================

const githubUser = "justwillj";
const repoName = "mood-dashboard-app";
const branch = "main";
const targetFolder = "scripts";

let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch (e) {
  fm = FileManager.local();
}

const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");
const circlesPath = fm.joinPath(fm.documentsDirectory(), "mood_circles.json");

async function runSync() {
  if (!fm.fileExists(userConfigPath)) {
    let success = await promptForNames(
      "Mood Dashboard Setup",
      "Enter your names and the shared Reminders list name below:",
    );
    if (!success) return;
  } else {
    let menuAlert = new Alert();
    menuAlert.title = "Dashboard Manager";
    menuAlert.message = "Choose an action:";
    menuAlert.addAction("🔄 Sync Scripts from GitHub");
    menuAlert.addAction("✏️ Change Setup (Names & List)");
    menuAlert.addCancelAction("Cancel");

    let choice = await menuAlert.presentAlert();
    if (choice === -1) return;
    if (choice === 1) {
      let success = await promptForNames(
        "Update Setup",
        "Update your names and list below:",
      );
      if (!success) return;
    }
  }

  // GitHub API endpoint for the folder contents
  let apiUrl =
    "https://api.github.com/repos/" +
    githubUser +
    "/" +
    repoName +
    "/contents/" +
    targetFolder +
    "?ref=" +
    branch +
    "&t=" +
    Date.now();

  try {
    let req = new Request(apiUrl);
    req.headers = { "User-Agent": "Scriptable-AutoSync" };

    let responseText = await req.loadString();
    let items = JSON.parse(responseText);

    if (!Array.isArray(items)) {
      throw new Error(
        "Could not read directory contents. Response was not an array. Check repo visibility or folder name.",
      );
    }

    let syncedCount = 0;

    for (let i = 0; i < items.length; i++) {
      let item = items[i];

      // Check if it's a JavaScript file
      if (item.name && item.name.endsWith(".js")) {
        // Construct standard raw download URL dynamically if download_url is missing
        let downloadUrl =
          item.download_url ||
          `https://raw.githubusercontent.com/${githubUser}/${repoName}/${branch}/${targetFolder}/${item.name}?t=${Date.now()}`;

        let fileReq = new Request(downloadUrl);
        let scriptContent = await fileReq.loadString();

        if (scriptContent && scriptContent.trim().length > 0) {
          let filePath = fm.joinPath(fm.documentsDirectory(), item.name);

          // Write fresh content to local disk
          fm.writeString(filePath, scriptContent);

          if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(filePath)) {
            try {
              await fm.downloadFileFromiCloud(filePath);
            } catch (err) {}
          }

          syncedCount++;
          console.log("Successfully synced: " + item.name);
        }
      }
    }

    let alert = new Alert();
    alert.title = "Sync Successful!";
    alert.message =
      "Successfully updated " + syncedCount + " script(s) from GitHub.";
    alert.addAction("OK");
    await alert.present();
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

  if (fm.fileExists(userConfigPath)) {
    try {
      let cfg = JSON.parse(fm.readString(userConfigPath));
      existingMyName = cfg.myUserName === "You" ? "" : cfg.myUserName || "";
      existingPartnerName =
        cfg.partnerUserName === "Partner" ? "" : cfg.partnerUserName || "";
      existingListName = cfg.listName || "Mood Dashboard";
    } catch (e) {}
  }

  let setupAlert = new Alert();
  setupAlert.title = title;
  setupAlert.message = message;
  setupAlert.addTextField("Your Name (e.g. Dylan)", existingMyName);
  setupAlert.addTextField("Partner Name (e.g. Will)", existingPartnerName);
  setupAlert.addTextField("Shared List Name", existingListName);
  setupAlert.addAction("Save");
  setupAlert.addCancelAction("Cancel");

  let res = await setupAlert.presentAlert();
  if (res === -1) return false;

  let myName = setupAlert.textFieldValue(0).trim() || "You";
  let partnerName = setupAlert.textFieldValue(1).trim() || "Partner";
  let lstName = setupAlert.textFieldValue(2).trim() || "Mood Dashboard";

  let configData = {
    myUserName: myName,
    partnerUserName: partnerName,
    listName: lstName,
  };
  fm.writeString(userConfigPath, JSON.stringify(configData, null, 2));

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
