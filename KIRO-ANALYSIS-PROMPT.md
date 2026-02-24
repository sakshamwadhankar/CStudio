# 🔍 Kiro Analysis Prompt - For Cloned Website Investigation

**Copy-paste this entire prompt to your Kiro instance that has the cloned website open:**

---

## Problem Statement

I have a Chrome extension that downloads/clones websites. The downloaded websites are appearing static with no animations working. I need you to analyze the downloaded HTML files and identify why GSAP (animation library) is not being injected.

## Background Context

### What Should Happen:
1. Extension downloads website
2. During download, a `captureScript` runs in the browser
3. Script should inject GSAP Phantom Engine into the HTML
4. Downloaded HTML should contain GSAP scripts
5. Animations should work when opening the downloaded HTML locally

### What's Actually Happening:
1. Extension downloads website ✅
2. Downloaded HTML is complete ✅
3. But GSAP scripts are MISSING ❌
4. No animation classes present ❌
5. Page appears static (no animations) ❌

### Recent Changes:
- Extension code was updated to use `textContent` instead of `innerHTML` for script injection
- Extension was rebuilt using Parcel
- Extension was reloaded in Chrome
- Fresh website was downloaded
- Problem persists

## Your Task

Please analyze the downloaded HTML files in this workspace and tell me:

### 1. GSAP Injection Check
- Search for: `gsap.min.js` in all HTML files
- Search for: `ScrollTrigger.min.js` in all HTML files
- Are these CDN URLs present in any `<script>` tags?
- If yes, where are they located (which file, which line)?
- If no, this confirms GSAP was not injected

### 2. Animation Classes Check
- Search for: `cstudio-animate-me` class in HTML files
- How many elements have this class?
- If zero, this means pre-reveal logic didn't run

### 3. Hidden Elements Check
- Search for: `opacity: 0` in HTML files
- Search for: `visibility: hidden` in HTML files
- How many elements are hidden?
- Are there `data-cstudio-hidden` attributes still present?

### 4. Crash Report Check
- Check the FIRST line of index.html
- Is there a `<!-- CRASH REPORT: ... -->` comment?
- If yes, what's the exact error message?
- This would indicate the captureScript crashed

### 5. Script Tags Analysis
- List all `<script>` tags in the HTML
- Are there React/Next.js scripts present? (look for `/_next/` or `/static/chunks/`)
- Are there any inline scripts?
- What's in the last `<script>` tag before `</body>`?

### 6. Body Content Check
- Is the `<body>` tag empty or does it have content?
- What's the approximate size of body content?
- Are there any `<div>` or `<section>` elements?

### 7. Meta Tags Check
- Is there a `Content-Security-Policy` meta tag?
- If yes, what's the policy?
- This could block external GSAP scripts

### 8. Console Errors (if you can check)
- If you can open the HTML in a browser
- Check browser console (F12 → Console)
- Are there any JavaScript errors?
- Are there any network errors (404s)?

## Expected vs Actual

### Expected (Working) HTML Should Have:
```html
<!DOCTYPE html>
<html>
<head>...</head>
<body>
  <!-- Content here -->
  
  <!-- GSAP Phantom Engine (should be present!) -->
  <script>
    window.addEventListener('error', function(e) {
      if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'SOURCE')) {
        const backupSrc = e.target.getAttribute('data-original-src');
        if (backupSrc && e.target.src !== backupSrc) {
          e.target.src = backupSrc;
        }
      }
    }, true);

    const s1 = document.createElement('script'); 
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js'; 
    document.body.appendChild(s1);
    
    const s2 = document.createElement('script'); 
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js'; 
    document.body.appendChild(s2);
    
    let chk = 0;
    const intGSAP = setInterval(() => {
      chk++;
      if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        clearInterval(intGSAP);
        gsap.registerPlugin(ScrollTrigger);
        // ... animation code ...
      }
    }, 100);
  </script>
</body>
</html>
```

### Actual (Broken) HTML Probably Has:
```html
<!DOCTYPE html>
<html>
<head>...</head>
<body>
  <!-- Content here -->
  
  <!-- NO GSAP SCRIPTS! -->
  <!-- This is the problem -->
</body>
</html>
```

## Specific Files to Check

Please analyze these files (if they exist in the workspace):
1. `index.html` - Main page
2. Any other `.html` files
3. Look in common download locations:
   - `Downloads/`
   - `Desktop/`
   - Any folder with recent modification date

## Output Format

Please provide your analysis in this format:

```markdown
## GSAP Injection Analysis

### 1. Files Found:
- List all HTML files you found
- Show their paths and modification dates

### 2. GSAP Scripts:
- ✅ Found / ❌ Not Found
- If found: File name, line number, exact content
- If not found: Confirmed missing

### 3. Animation Classes:
- Count of elements with `cstudio-animate-me`
- If zero: Confirmed pre-reveal didn't run

### 4. Hidden Elements:
- Count of elements with `opacity: 0`
- Count of elements with `visibility: hidden`
- Presence of `data-cstudio-*` attributes

### 5. Crash Report:
- ✅ Found / ❌ Not Found
- If found: Exact error message

### 6. Script Tags:
- Total count of `<script>` tags
- React/Next.js scripts present? (Yes/No)
- Last script before `</body>`: [content]

### 7. Issues Identified:
- List all problems found
- Prioritize by severity

### 8. Root Cause Hypothesis:
- Based on the evidence, what do you think is preventing GSAP injection?
- Is it a build issue, runtime issue, or logic issue?

### 9. Recommended Next Steps:
- What should be checked next?
- What files should be examined?
- What tests should be run?
```

## Additional Context

### Extension Build Info:
- Built on: 22/02/2026 09:05:01
- Build tool: Parcel 2.7.0
- Source file: `ResourcesSaverExt-master/src/devtoolApp/hooks/useAppSaveAllResource.js`
- Compiled to: `ResourcesSaverExt-master/unpacked2x/devtool.app.*.js`
- GSAP verified in build: ✅ Yes (in devtool.app.822398f4.js)

### Key Code Logic:
```javascript
// In captureScript (runs in browser during download):
const body = clone.querySelector('body');
if (body) {
  const engineScript = document.createElement('script');
  engineScript.textContent = `...GSAP code...`;
  body.appendChild(engineScript);
}
return clone.outerHTML;
```

### Possible Failure Points:
1. `body` is null/undefined
2. `appendChild` fails silently
3. `clone.outerHTML` doesn't include the appended script
4. Script is added but then removed by sanitization
5. Try-catch catches error and returns original HTML

## Important Notes

- Focus on the DOWNLOADED HTML files, not the extension source code
- We already know the extension source code is correct
- We need to understand what's in the actual downloaded files
- Look for evidence of what happened during the download process

---

**Please analyze the workspace and provide detailed findings. Thank you!**
