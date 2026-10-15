// ==========================================
// DYNAMIC GITHUB FOLDER SYNC
// ==========================================

const githubUser = "justwillj";
const repoName = "mood-dashboard-app";
const branch = "main";
const targetFolder = "scripts"; // Folder in your repo root

const fm = FileManager.iCloud();

async function syncFolder() {
  // GitHub API endpoint to list contents of a repository folder
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
    // GitHub API requires a User-Agent header
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

      // Look for files ending in .js inside the folder
      if (item.type === "file" && item.name.endsWith(".js")) {
        let downloadUrl = item.download_url;

        if (downloadUrl) {
          let fileReq = new Request(downloadUrl);
          let scriptContent = await fileReq.loadString();

          if (scriptContent && scriptContent.trim().length > 0) {
            // Save or update the file locally in Scriptable using its exact file name
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
      " script(s) from your GitHub 'scripts/' folder.";
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

await syncFolder();
Script.complete();
