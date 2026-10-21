Here is an updated, comprehensive `README.md` that highlights your new modular architecture, neurodivergent-friendly features, themes, widgets, and the streamlined installer script.

---

# Dual Mood Dashboard for iOS 🌿✨

An asynchronous, emotionally safe mood and capacity dashboard built for **[Scriptable](https://scriptable.app)** on iOS. Powered by shared Apple Reminders lists synced over iCloud, it provides a low-friction, zero-demand window into how you and the people you care about are doing.

Designed with **neurodivergent needs (AuDHD / Autism & ADHD)**, emotional safety, and low cognitive demand in mind, this tool removes the pressure of real-time emotional performance—giving everyone space to express feelings honestly without fear of confrontation, surveillance, or guilt.

---

## 🌟 Philosophy & Core Principles

Many people feel forced to _"put their feelings in a box and kick it off a cliff"_ because bringing up negative emotions often triggers defensive debates, panic, or unwanted "fixing." This app acts as a calm, steady container:

- **Zero-Pressure Asynchronous Presence:** No read receipts, no typing indicators, no active timestamps, and no "nudge" buttons. Silence is respected as valid rest.
- **Cognitive & Sensory Accessibility:** Standard emotion words can be hard to pin down during shutdown or burnout (Alexithymia). The app emphasizes **energy levels, nervous-system states, sensory load, and social battery**.
- **Boundaries Without Conflict:** Expressing a need (like needing quiet or parallel play) is a single tap, removing the anxiety of having to formulate a delicate explanation.

---

## ✨ Features

### 🎛️ Interactive Dashboard (`mood-dashboard.js`)

- **Dual Hero Cards:** Side-by-side view of your current state and your partner's status, complete with energy dots, capacity tags, and comfort needs.
- **🤝 "What I Need Right Now" (Comfort Chips):** Optional one-tap boundary and support tags on check-ins:
  - 🎧 _Space & quiet (resetting, not mad)_
  - 🛋️ _Parallel play (hang out, no talking)_
  - 💬 _Distraction / memes_
  - 🫂 _Comfort & warmth_
  - 💡 _Advice wanted_
- **📊 Granular Capacity Tracking:** Optional 1–5 indicators for **Social Battery**, **Sensory Load**, and communication preference (**🗣️ Okay to talk**, **💬 Text only**, **🔇 No talking**).
- **🔕 "No Reply Needed" Toggle:** Explicitly relieves the other person of any social obligation to respond.
- **💡 "What Helps" Cheat Sheets:** Pre-written support cards viewable when someone's mood changes, removing the burden of asking _"What can I do to help?"_ during burnout.
- **💌 Async Love Notes:** Low-stakes affection tokens (🤗 Hug, 🍵 Thinking of you, 🕯️ Safe space, 🌙 Rest well, 🌱 No pressure) with optional notes, capped at 3 per day to prevent anxious over-giving.
- **👥 Multi-Friend Circles:** Support for multiple friends, each backed by their own private shared Apple Reminders list. The top friend bar shows live mood tokens and recent activity dots (`● Dylan 🌙`).
- **✏️ Synced Edit Timestamps:** Editing a check-in records an edit timestamp (`✏️ edited 5m ago`) and syncs across all friends' lists you chose to share it with.
- **🌙 Resting Mode:** A built-in status that pauses check-in reminders and tells loved ones you are recharging.

### 🎨 Sensory-Friendly Themes

Easily cycle between three distinct color palettes using the **🎨** button on the dashboard (widgets automatically match):

1. **Forest & Sage (Default):** Calming moss, eucalyptus, soft terracotta accents, and warm cream text. Designed to minimize retinal glare and sensory overload.
2. **Warm Sand & Clay:** Earthy espresso slate, terracotta, and warm ochre tones.
3. **Midnight Neon:** High-contrast dark mode with crisp cyan, indigo, and magenta accents.

### 📱 Lock Screen & Home Screen Widgets

- **Home Screen Widget (`mood-homescreen-widget.js`):**
  - **Small:** Partner hero status, energy dots, and your status.
  - **Medium / Large:** Dual card overview with comfort badges, capacity chips, "What helps" suggestions, and love notes.
- **Lock Screen Widget (`mood-lockscreen-widget.js`):**
  - **Rectangular:** Partner mood, note, energy dots, and edited time.
  - **Circular:** Minimalist mood emoji token and relative time.
  - **Inline:** Clean single-line status above the clock.
- **Friend Parameter Support:** Set a friend's name in the widget settings (`Widget Parameter`) to pin a specific person to that widget instance.

---

## 📂 Project Architecture

The app is built modularly across clean, lightweight files:

| File                            | Purpose                                                                                                            |
| :------------------------------ | :----------------------------------------------------------------------------------------------------------------- |
| **`pull-script.js`**            | Interactive installer & updater. Sets up configs, auto-creates Reminders lists, and downloads scripts from GitHub. |
| **`mood-core.js`**              | Shared core engine: data protocol, iCloud storage, themes, capacity parsing, and widget snapshots.                 |
| **`mood-dashboard.js`**         | Full-featured interactive HTML/CSS/JS web dashboard rendered inside Scriptable.                                    |
| **`mood-homescreen-widget.js`** | Small, Medium, and Large Home Screen widget script.                                                                |
| **`mood-lockscreen-widget.js`** | Rectangular, Circular, and Inline iOS Lock Screen accessory widget script.                                         |

---

## 🚀 Quick Start & Installation

### Option A: The One-Tap Installer (Recommended)

1. Install the free **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)** app from the App Store on iOS.
2. Open Scriptable, tap **`+`** to create a new script, and name it **`Installer`**.
3. Copy and paste the contents of **[`pull-script.js`](scripts/pull-script.js)** into the editor and tap **Run (▶)**.
4. Follow the prompt to enter:
   - **Your Name** (e.g., `Dylan`)
   - **Partner / Friend's Name** (e.g., `Will`)
   - **Shared Reminders List Name** (e.g., `Mood Dashboard`)
5. If the Reminders list does not exist yet, the installer will ask if you want it to **automatically create the list in iCloud** for you.
6. Once the download completes, tap **🚀 Open Dashboard** to launch!

### Option B: Manual Installation

If you prefer to install files manually:

1. Ensure your Scriptable storage is set to iCloud Drive.
2. Create four scripts in Scriptable with these exact names:
   - `mood-core`
   - `mood-dashboard`
   - `mood-homescreen-widget`
   - `mood-lockscreen-widget`
3. Paste the corresponding code from the `scripts/` directory into each file.
4. Open the Apple **Reminders** app, create an iCloud list named `Mood Dashboard`, and share it with your partner.
5. Run `mood-dashboard` inside Scriptable to initialize your settings.

---

## 👥 Setting Up with Your Partner

1. **Share the Apple Reminders List:**
   - Open Apple **Reminders**.
   - Find your shared list (e.g., `Mood Dashboard`).
   - Tap the **Share** button (person icon or `...` menu) and invite your partner via Messages or link.
2. **On Your Partner's Phone:**
   - Have them accept the Reminders list invitation.
   - Run the installer on their phone, swapping the names (their name as "Your Name", your name as "Partner Name", and the **exact same list name**).
3. **Add Friends (Optional):**
   - In the dashboard, tap the **`＋`** icon on the top friend bar to add additional friends. Each friend gets their own isolated Apple Reminders list so conversations stay private.

---

## 📲 Adding Widgets to Your iOS Screens

### Home Screen Widget

1. Long-press your Home Screen until the apps jiggle, then tap **`+`** in the top corner.
2. Search for **Scriptable** and choose **Small**, **Medium**, or **Large**.
3. Tap the widget while in jiggle mode (or long-press > **Edit Widget**):
   - **Script:** Select `mood-homescreen-widget`.
   - **When Interacting:** _Run Script_.
   - **Parameter (Optional):** Enter a friend's name to lock the widget to that friend. If blank, it displays whoever is active in your dashboard.

### Lock Screen Widget

1. Long-press your iOS Lock Screen and tap **Customize**, then select the Lock Screen.
2. Tap the widget area below or above the clock.
3. Select **Scriptable** and choose **Rectangular**, **Circular**, or **Inline**.
4. Tap the widget to configure:
   - **Script:** Select `mood-lockscreen-widget`.
   - **Parameter (Optional):** Enter a friend's name to target a specific circle.

---

## 🔒 Privacy & How Your Data is Stored

- **No Third-Party Servers:** Your data never touches an external server. Everything syncs through your personal **Apple iCloud** account via Apple Reminders.
- **Plain Reminders Schema:** Check-ins are stored as normal reminders formatted as `[Name] Mood Title` with notes encoding capacity and comfort tags.
- **Offline Resilient:** Both widgets maintain a local fallback snapshot cache so they continue displaying your partner's latest status even when offline or when the device is locked.

---

## 📄 License

MIT License. Feel free to customize, adapt, and share this tool with the people in your life.
