// ==========================================
// GITHUB SYNC WITH FIXED FILEMANAGER API
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

async function runSync() {
  if (!fm.fileExists(userConfigPath)) {
    let success = await promptForNames(
      "Mood Dashboard Setup",
      "Enter dashboard names:",
    );
    if (!success) return;
  } else {
    let menuAlert = new Alert();
    menuAlert.title = "Dashboard Manager";
    menuAlert.message = "Choose an action:";
    menuAlert.addAction("🔄 Sync Scripts from GitHub");
    menuAlert.addAction("✏️ Change Dashboard Names");
    menuAlert.addCancelAction("Cancel");

    let choice = await menuAlert.presentAlert();
    if (choice === -1) return;
    if (choice === 1) {
      let success = await promptForNames("Update Names", "Update names below:");
      if (!success) return;
    }
  }

  // Add timestamp query param to bypass GitHub raw CDN caching
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
        "Could not read directory contents. Check folder name or repo visibility.",
      );
    }

    let syncedCount = 0;

    for (let i = 0; i < items.length; i++) {
      let item = items[i];

      if (item.type === "file" && item.name.endsWith(".js")) {
        let downloadUrl = item.download_url
          ? item.download_url + "?t=" + Date.now()
          : null;

        if (downloadUrl) {
          let fileReq = new Request(downloadUrl);
          let scriptContent = await fileReq.loadString();

          if (scriptContent && scriptContent.trim().length > 0) {
            let filePath = fm.joinPath(fm.documentsDirectory(), item.name);

            // Overwrite file with new content
            fm.writeString(filePath, scriptContent);

            // Check if file is stored in iCloud and force download/sync if needed
            if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(filePath)) {
              try {
                await fm.downloadFileFromiCloud(filePath);
              } catch (err) {
                console.log("iCloud sync notice: " + err.message);
              }
            }

            syncedCount++;
            console.log("Successfully updated: " + item.name);
          }
        }
      }
    }

    let alert = new Alert();
    alert.title = "Sync Successful!";
    alert.message = "Updated " + syncedCount + " script(s) from GitHub.";
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
  let existingMyName = "You";
  let existingPartnerName = "Partner";
  if (fm.fileExists(userConfigPath)) {
    try {
      let cfg = JSON.parse(fm.readString(userConfigPath));
      existingMyName = cfg.myUserName || "You";
      existingPartnerName = cfg.partnerUserName || "Partner";
    } catch (e) {}
  }

  let setupAlert = new Alert();
  setupAlert.title = title;
  setupAlert.message = message;
  setupAlert.addTextField("Your Name", existingMyName);
  setupAlert.addTextField("Partner Name", existingPartnerName);
  setupAlert.addAction("Save");
  setupAlert.addCancelAction("Cancel");

  let res = await setupAlert.presentAlert();
  if (res === -1) return false;

  let myName = setupAlert.textFieldValue(0).trim() || "You";
  let partnerName = setupAlert.textFieldValue(1).trim() || "Partner";

  let configData = {
    myUserName: myName,
    partnerUserName: partnerName,
  };
  fm.writeString(userConfigPath, JSON.stringify(configData, null, 2));
  return true;
}

await runSync();
Script.complete();
