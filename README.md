# DeepOverlay

A high-performance, minimalist sticky note overlay for the modern web. Built for research, translation tracking, and content organization.

---

## Core Capabilities

### Smart Element Anchoring
Unlike traditional overlays that use absolute page coordinates, DeepOverlay anchors notes to the specific DOM elements underneath them. This ensures your notes remain attached to the correct content even on complex, responsive websites.

### Relative Scaling
DeepOverlay calculates size ratios between your notes and their anchor elements. When an image or container shrinks due to browser resizing or mobile layouts, your notes scale proportionally to maintain context.

### Interaction Isolation
- **Edit Mode**: Completely blocks interaction with the underlying page, allowing you to draw and manage notes without accidental clicks or layout shifts.
- **Input Guard**: Captures keyboard events within note textareas to prevent website shortcuts (like video pausing or scrolling) from triggering while you type.
- **View Mode**: A passive, pointer-event-free layer that only displays your information when needed.

---

## Features

- **Management Dashboard**: A centralized hub to search, edit, and organize all your notes.
- **Domain Grouping**: Automatically groups notes by website domain for efficient navigation through large datasets.
- **Always On Architecture**: Injected automatically on page load for zero-latency access to your data.
- **Privacy First**: All data is stored locally via Browser Storage. No external servers or network requests.
- **Storage Monitor**: Real-time tracking of data usage within the dashboard.

---

## Usage

| Action | Control |
| :--- | :--- |
| **Toggle Visibility** | Alt + Shift + O |
| **Toggle Edit Mode** | Extension Popup |
| **Manage Data** | Extension Dashboard |
| **Create Note** | Click and Drag (Edit Mode) |
| **Move / Resize** | Grab or Handle (Edit Mode) |

---

## Technical Architecture

The extension is designed for maximum performance and minimal browser footprint:

- **Frontend**: Vanilla Javascript & Dynamic CSS.
- **Persistence**: Managed through `chrome.storage.local`.
- **Layout Engine**: Uses `requestAnimationFrame` and `getBoundingClientRect` for layout-independent positioning.
- **Theme**: Minimalist, high-contrast aesthetic.

---

## Installation

1. Clone this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `DeepOverlay` directory.

---

### Developed for Precise Content Overlay Organization
