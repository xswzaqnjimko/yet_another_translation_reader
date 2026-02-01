# Aligning Text

A Chrome extension for reading original and translated texts side-by-side with synchronized scrolling and manual alignment correction. 
Currently (v1.0) only targeting archiveofourown.org work pages.

## Features (v1.0)

- **Two-panel viewer**: Read texts A and B side by side
- **Layout toggle**: Switch between Left/Right and Top/Bottom layouts
- **Swap panels**: Quickly swap which text is on which side
- **Proportional scroll sync**: Scroll one panel and the other follows proportionally
- **Active paragraph highlighting**: See which paragraph you're reading and its mapped counterpart
- **Click to jump**: Click any paragraph to highlight it and scroll to its counterpart
- **Manual anchor alignment**: Shift+click paragraphs to set alignment anchors and correct drift
- **Anchor sidebar**: View, jump to, and delete anchors from the sidebar

## Installation

1. Open Chrome and go to `chrome://extensions/` (or go to Settings - Extensions)
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `yet_another_translation_reader` folder

## Update/Removal

1. In chrome://extensions/, click "Remove" for this app (then refresh to see it's gone)
2. For update: redo "Load unpacked" and choose the updated `yet_another_translation_reader` folder

## Usage

### Basic reading
1. Click the extension icon in Chrome toolbar → opens setup page in a new tab
2. Paste a URL for Text A (e.g., original)
3. Paste another URL for Text B (e.g., translation)
   - To-be-tested probably-not-working-yet...: Use the "Current Tab" buttons to grab URLs from open AO3 tabs...to be tested & debugged...
4. Click "Open Aligning Text"
5. Read and enjoy!

### Setting alignment anchors
When paragraphs don't line up correctly (e.g., translator merged/split paragraphs):

1. **Shift+click** a paragraph in panel A
2. **Click** the corresponding paragraph in panel B (or Shift+click)
3. An anchor is created — alignment is now forced at that point
4. Repeat as needed to correct drift throughout the text

Anchors divide the text into segments, and proportional mapping is computed within each segment.

## Changelog

Current: 2026/01/31

### v1.0
- Added manual anchor system for alignment correction
- Added anchor sidebar (view, jump to, delete anchors)
- Fixed: "Chapter Text" and other AO3 landmark headings no longer appear as paragraphs
- Fixed: Multi-chapter works now correctly extract chapter content (not notes/summary)

### v0.1.1
- Setup page now opens as a full tab (doesn't close when switching tabs)
- Added "Current Tab" buttons to grab URLs from open AO3 tabs
- URLs are saved and persist between sessions

### v0.1.0
- Initial release
- Two-panel viewer with layout toggle and swap
- Proportional scroll sync
- Active paragraph highlighting

## Roadmap / To-Do

- [ ] "Current Tab" not quite working
- [ ] Minor mismatch sometimes, currently needs re-anchor...
- [ ] Sometimes, especially with long paragraphs, shows truncated paragraphs...UI/UX improvement needed
- [ ] i18n for UI
- [ ] As said above, currently only tested on AO3 yet...
- [ ] PDF/txt input support
- [ ] Etc. ...

## Server-Friendliness

This extension is designed to be respectful to the servers:
- No auto-refresh or polling
- Content is cached in memory after initial fetch
- Single fetch per URL per session
- Future versions will support reading from already-open tabs

## File Structure

```
yet_another_translation_reader/
├── manifest.json
├── background.js
├── README.md
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── viewer/
    ├── viewer.html
    ├── viewer.css
    └── viewer.js
```

## License

MIT

## Acknowledgement

Thanks AO3, thanks my friend(s), thanks GPT 5.2 Thinking & Claude Opus 4.5