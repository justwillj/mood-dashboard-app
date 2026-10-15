// ==========================================
// DYNAMIC GITHUB FOLDER SYNC + CONFIG MANAGER
// ==========================================

const githubUser = "justwillj";
const repoName = "mood-dashboard-app";
const branch = "main";
const targetFolder = "scripts"; // Folder in your repo root

const fm = FileManager.local();
const userConfigPath = fm.joinPath(fm.documentsDirectory(), "user_config.json");

async function runSync() {
  // 1. Check if configuration exists or if user wants to set it up
  if (!fm.fileExists(userConfigPath)) {
    let success = await promptForNames(
      "Mood Dashboard Setup",
      "Please enter the names for your shared dashboard:",
    );
    if (!success) return; // Cancelled
  } else {
    // If config already exists, give options to Sync or Change Names
    let menuAlert = new Alert();
    menuAlert.title = "Dashboard Manager";
    menuAlert.message = "Choose an action:";
    menuAlert.addAction("🔄 Sync Scripts from GitHub");
    menuAlert.addAction("✏️ Change Dashboard Names");
    menuAlert.addCancelAction("Cancel");

    let choice = await menuAlert.presentAlert();
    if (choice === -1) return; // Cancelled
    if (choice === 1) {
      // User chose to change names
      let success = await promptForNames(
        "Update Names",
        "Update your dashboard names below:",
      );
      if (!success) return;
    }
  }

  // 2. GitHub API endpoint to list contents of repository folder
  let apiUrl =
    "https://api.github.com/repos/" +
    githubUser +
    "/" +
    repoName +
    "/contents/" +
    targetFolder +
    "?ref=" +
    branch;

  try {
    let req = new Request(apiUrl);
    req.headers = { "User-Agent": "Scriptable-AutoSync" };

    let responseText = await req.loadString();
    let items = JSON.parse(responseText);

    if (!Array.isArray(items)) {
      throw new Error(
        "Could not read directory contents. Check your folder name or repository visibility.",
      );
    }

    let syncedCount = 0;

    for (let i = 0; i < items.length; i++) {
      let item = items[i];

      if (item.type === "file" && item.name.endsWith(".js")) {
        let downloadUrl = item.download_url;

        if (downloadUrl) {
          let fileReq = new Request(downloadUrl);
          let scriptContent = await fileReq.loadString();

          if (scriptContent && scriptContent.trim().length > 0) {
            let filePath = fm.joinPath(fm.documentsDirectory(), item.name);
            fm.writeString(filePath, scriptContent);
            syncedCount++;
            console.log("Synced script: " + item.name);
          }
        }
      }
    }

    let alert = new Alert();
    alert.title = "Auto-Sync Complete";
    alert.message =
      "Successfully discovered and synced " +
      syncedCount +
      " script(s) from GitHub!";
    alert.addAction("OK");
    await alert.present();
  } catch (error) {
    let alert = new Alert();
    alert.title = "Sync Failed";
    alert.message = "Error communicating with GitHub API:\n\n" + error.message;
    alert.addAction("OK");
    await alert.present();
  }
}

// Helper function to handle name input and empty validation
async function promptForNames(title, message) {
  // Load existing values if available to pre-fill or fallback
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
  setupAlert.addTextField(existingMyName, existingMyName);
  setupAlert.addTextField(existingPartnerName, existingPartnerName);
  setupAlert.addAction("Save");
  setupAlert.addCancelAction("Cancel");

  let res = await setupAlert.presentAlert();
  if (res === -1) return false;

  let myName = setupAlert.textFieldValue(0).trim();
  let partnerName = setupAlert.textFieldValue(1).trim();

  // Validation: If fields are left empty, fallback gracefully instead of breaking
  if (!myName) myName = "You";
  if (!partnerName) partnerName = "Partner";

  let configData = {
    myUserName: myName,
    partnerUserName: partnerName,
  };
  fm.writeString(userConfigPath, JSON.stringify(configData, null, 2));
  return true;
}

await runSync();
Script.complete();
