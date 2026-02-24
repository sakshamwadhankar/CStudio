# Edit Capture Diagnostic Guide

## Issue
Animations work perfectly, media loads, but VisBug edits don't appear in downloaded HTML.

## Fixes Applied
1. ✅ Preloader detection: Changed `zIndex > 40` → `zIndex > 50` (removed backgroundColor check)
2. ✅ Added comprehensive debug logging to track edit capture
3. ✅ Extension rebuilt successfully

## Testing Steps

### 1. Reload Extension
```
1. Open chrome://extensions
2. Find "CStudio Edit Clone"
3. Click the reload icon 🔄
```

### 2. Test on a Website
```
1. Open any website (e.g., https://example.com)
2. Open DevTools (F12)
3. Go to Console tab (keep it open to see debug messages)
```

### 3. Enable V3 Mode
```
1. Click the CStudio extension icon in Chrome toolbar
2. Make sure "V3" button is highlighted/active
3. Click "Enable Live Editor (VisBug)" button
4. Wait for "Activated!" message
```

### 4. Make Edits with VisBug
```
1. VisBug toolbar should appear on the page
2. Make some visible edits:
   - Change text color
   - Modify font size
   - Change background color
   - Adjust padding/margin
3. Keep the edits visible on screen
```

### 5. Capture with Debug Logging
```
1. In DevTools, go to "CStudio" tab
2. Click "Save All Resources"
3. IMMEDIATELY check the Console tab
4. Look for debug messages starting with "[CStudio V3 Debug]"
```

## Debug Messages to Check

You should see these messages in Console:

```
[CStudio V3 Debug] Capture script executing
[CStudio V3 Debug] localStorage resources-saver-version: 3
[CStudio V3 Debug] Total elements with style attributes: XX
[CStudio V3 Debug] Potentially VisBug-edited elements: XX
[CStudio V3 Debug] Potentially edited element 0: DIV className "..."
[CStudio V3 Debug] DOM cloned, checking for VisBug elements in clone...
[CStudio V3 Debug] VisBug elements in clone before removal: XX
[CStudio V3 Debug] Elements with style attributes in clone: XX
[CStudio V3 Debug] Comparing first potentially edited element:
[CStudio V3 Debug] Original style: color: red; font-size: 24px;
[CStudio V3 Debug] Cloned style: color: red; font-size: 24px;
[CStudio V3 Debug] Styles match? true
```

## What to Report Back

### If Debug Messages Appear:
Send me:
1. The number of "Potentially VisBug-edited elements"
2. Whether "Styles match?" shows `true` or `false`
3. The actual style text from "Original style:" and "Cloned style:"

### If No Debug Messages:
This means:
- V3 mode might not be active (check localStorage)
- OR captureScript isn't running (extension context issue)

### If Styles Don't Match:
This means `cloneNode(true)` isn't capturing the edits properly - we'll need a different approach.

### If Styles Match but Still Not in Downloaded HTML:
This means the edits ARE being captured but something else is removing them during processing.

## Quick Verification

After downloading the ZIP:
1. Extract it
2. Open `index.html` in VS Code
3. Search for the style you added (e.g., if you changed color to red, search for "color: red" or "color:red")
4. If found → capture works, issue is elsewhere
5. If not found → capture is failing

## Common Issues

### Issue: "resources-saver-version: null" or "2"
**Solution:** V3 mode not enabled. Click V3 button in extension popup.

### Issue: No debug messages at all
**Solution:** Extension context invalidated. Close and reopen DevTools.

### Issue: "Potentially VisBug-edited elements: 0"
**Solution:** VisBug edits not applied or not using inline styles. Try different edit types.

### Issue: Styles match but not in downloaded HTML
**Solution:** Edits being removed during sanitization. We need to adjust the sanitization logic.

## Next Steps Based on Results

Share the debug console output and I'll provide the exact fix needed!
