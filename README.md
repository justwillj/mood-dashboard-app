# Dual Mood Dashboard for iOS 🌙✨

A collaborative, glassmorphic mood and status dashboard designed for couples, built for **Scriptable** on iOS. It uses a shared Apple Reminders list for real-time iCloud synchronization, allowing you and your partner to stay connected throughout the day.

---

## 🌟 Key Features

- **Dual Hero Cards:** Instantly view both your current status and your partner's status side-by-side at the top of the dashboard.
- **Real-Time iCloud Sync:** Powered by native Apple Reminders (`Mood Dashboard`), changes sync instantly across devices.
- **Collapsible History Feed:** Past check-ins are automatically grouped by **Year** and **Month** with interactive accordion toggles to keep your history clean and organized.
- **Color-Coded User Badges:** Easily distinguish between your check-ins and your partner's with subtle indigo and pink styling.
- **Custom Mood Presets:** Create, save, and manage custom moods on the fly. Presets are stored locally in `mood_presets.json` and persist across sessions.
- **Mock Data Fallback:** Automatically generates sample history data if your reminders list is empty, making UI testing effortless.

---

## 📱 Tech Stack

- **Front-End:** HTML5, CSS3 (Glassmorphism design system), and JavaScript rendered inside Scriptable's native `WebView`.
- **Back-End / Storage:** Apple Reminders API (via iCloud) & local JSON configuration.
- **Routing Bridge:** Localhost bridge (`http://localhost/`) enabling native iOS interactive alert sheets from the web view.

---

## 🛠️ Setup & Installation

### 1. Prerequisites

- Ensure you have the **Scriptable** app installed on your iOS device.
- Create a shared Apple Reminders list named **`Mood Dashboard`** and share it with your partner via iCloud.

### 2. Script Installation

1. Open the **Scriptable** app on your iPhone or iPad.
2. Create a **New Script** and paste the dashboard code into the editor.
3. Update your user names at the top of the script to match you and your partner:
   ```javascript
   const myUserName = "YourName";
   const partnerUserName = "PartnerName";
   ```
