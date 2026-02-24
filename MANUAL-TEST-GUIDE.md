# Manual Testing Guide for CaptureScript Fix

## Prerequisites
1. Chrome browser with Developer Tools
2. Your extension loaded in Chrome
3. A test website (preferably one with React/Next.js that was showing blank screens)

## Step-by-Step Testing Process

### 1. Reload the Extension
```
1. Open Chrome and go to: chrome://extensions
2. Find "Resources Saver" extension
3. Click the reload icon (circular arrow)
4. Verify the extension reloaded successfully
```

### 2. Open DevTools and Navigate to Test Site
```
1. Open a new tab
2. Navigate to your test website (e.g., the one that was showing blank screens)
3. Press F12 to open DevTools
4. Go to the "Resources Saver" tab in DevTools
```

### 3. Capture the Website
```
1. In the Resources Saver tab, click "Save All Resources"
2. Wait for the download to complete
3. Note the ZIP file name and location
```

### 4. Extract and Test the Downloaded ZIP
```
1. Extract the ZIP file to a folder
2. Open the folder and locate index.html
3. Right-click index.html → Open with VS Code (or any text editor)
```

### 5. Check for Crash Report (Critical Step!)
```
Look at the FIRST LINE of index.html:

✅ SUCCESS CASE:
<!DOCTYPE html>
<html>...

❌ FAILURE CASE:
<!-- CRASH REPORT: [error message] at line [number] -->
<!DOCTYPE html>
<html>...
```

### 6. Test the Downloaded Site Locally
```
1. Open index.html in Chrome (double-click or drag to browser)
2. Check if the page loads correctly (not blank/black screen)
3. Scroll down the page
4. Verify animations work (elements fade in as you scroll)
5. Check if images load correctly
```

## Expected Results

### ✅ Success Indicators:
- [ ] No crash report comment in index.html
- [ ] Page loads with content visible (not blank)
- [ ] Scroll animations work smoothly
- [ ] Images display correctly
- [ ] No console errors related to GSAP
- [ ] Page is scrollable (no scroll lock)
- [ ] No black preloader screens

### ❌ Failure Indicators:
- [ ] Crash report comment appears in index.html
- [ ] Page shows blank/black screen
- [ ] Console shows React hydration errors
- [ ] Images show 404 errors
- [ ] Page is not scrollable
- [ ] Animations don't work

## If You See a Crash Report

1. **Copy the entire crash report line** from index.html
2. **Share it** so we can identify the exact line causing the issue
3. **Check browser console** (F12 → Console tab) for additional errors

Example crash report:
```html
<!-- CRASH REPORT: Cannot read property 'style' of null at line 42 -->
```

## Debugging Tips

### Check Browser Console
```
1. Open the downloaded index.html in Chrome
2. Press F12 → Console tab
3. Look for errors (red text)
4. Copy any error messages
```

### Check Network Tab
```
1. F12 → Network tab
2. Reload the page (Ctrl+R)
3. Look for failed requests (red status codes)
4. Check if GSAP scripts loaded successfully:
   - gsap.min.js (should be 200 OK)
   - ScrollTrigger.min.js (should be 200 OK)
```

### Verify GSAP Injection
```
1. Open index.html in VS Code
2. Search for: "gsap"
3. You should find:
   - Script loading gsap.min.js from CDN
   - Script loading ScrollTrigger.min.js from CDN
   - GSAP animation code with ScrollTrigger
```

## Test Checklist

- [ ] Extension reloaded in chrome://extensions
- [ ] Navigated to test website
- [ ] Clicked "Save All Resources"
- [ ] ZIP file downloaded successfully
- [ ] Extracted ZIP file
- [ ] Opened index.html in text editor
- [ ] Checked first line for crash report
- [ ] Opened index.html in browser
- [ ] Page loads without blank screen
- [ ] Scroll animations work
- [ ] Images load correctly
- [ ] No console errors

## Report Results

After testing, report:
1. ✅ or ❌ for each success indicator
2. Any crash report messages found
3. Browser console errors (if any)
4. Screenshots of the working/broken page
5. Which test website you used

---

**Note:** If the page still shows blank, the crash report will tell us exactly where the script is failing, allowing us to fix the specific issue.
