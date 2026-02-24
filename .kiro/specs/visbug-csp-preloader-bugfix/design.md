# VisBug CSP Preloader Bugfix Design

## Overview

This bugfix addresses three critical issues that cause downloaded websites to display as completely blank with `invalid/` net::ERR_FAILED errors. The bugs occur during DOM capture in `useAppSaveAllResource.js` when: (1) VisBug browser extension UI elements are captured into the HTML, (2) Content-Security-Policy meta tags block external GSAP CDN scripts, and (3) full-screen preloader overlays with high z-index values are not removed. The fix injects a "God-Mode DOM Cleanser" at the very beginning of the `captureScript` variable to remove these problematic elements before any other capture logic executes.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when VisBug UI elements, CSP meta tags, or high z-index preloader overlays are present in the captured DOM
- **Property (P)**: The desired behavior - a clean DOM without VisBug artifacts, CSP restrictions, or stuck preloaders that allows content to display and GSAP to execute
- **Preservation**: Existing functionality that must remain unchanged - user edits, GSAP injection, image handling, and other DOM capture features
- **captureScript**: The JavaScript code string in `useAppSaveAllResource.js` (line ~100) that executes in the inspected window to capture and sanitize the DOM
- **God-Mode DOM Cleanser**: The three-part cleanup block that removes VisBug UI, CSP/refresh meta tags, and high z-index preloader overlays
- **VisBug UI**: Custom elements (`<vis-bug>`, `#visbug`) and chrome-extension:// paths injected by the VisBug browser extension
- **CSP Meta Tag**: `<meta http-equiv="Content-Security-Policy">` that blocks external script execution
- **Preloader Overlay**: Fixed position elements with high z-index (>50) and full viewport coverage that block content visibility

## Bug Details

### Fault Condition

The bug manifests when the DOM capture process encounters VisBug extension artifacts, Content-Security-Policy meta tags, or full-screen preloader overlays. The `captureScript` variable currently begins with `const liveBase = window.location.origin;` and immediately proceeds to URL absolutization, allowing these problematic elements to persist in the captured HTML.

**Formal Specification:**
```
FUNCTION isBugCondition(capturedDOM)
  INPUT: capturedDOM of type HTMLDocument
  OUTPUT: boolean
  
  RETURN (capturedDOM.contains(visBugElement) OR 
          capturedDOM.contains(chromeExtensionPath) OR
          capturedDOM.contains(cspMetaTag) OR
          capturedDOM.contains(metaRefreshTag) OR
          capturedDOM.contains(highZIndexPreloader))
         AND (contentNotVisible OR gsapNotExecuting OR invalidPathErrors)
END FUNCTION

WHERE:
  visBugElement = element matching 'vis-bug, #visbug'
  chromeExtensionPath = element with src/href starting with 'chrome-extension://' or 'invalid/'
  cspMetaTag = meta[http-equiv="Content-Security-Policy"]
  metaRefreshTag = meta[http-equiv="refresh"]
  highZIndexPreloader = fixed position element with z-index > 50 and full viewport coverage
```

### Examples

- **VisBug UI Captured**: User has VisBug extension active while capturing DOM → `<vis-bug>` custom element and chrome-extension:// paths are saved → Opening downloaded HTML shows `invalid/` errors and transparent overlay blocks entire screen
- **CSP Blocking GSAP**: Original site has `<meta http-equiv="Content-Security-Policy" content="...">` → CSP meta tag is preserved in captured HTML → GSAP CDN scripts fail to execute → Page remains blank with no animations
- **Preloader Stuck**: Original site has `<div style="position: fixed; z-index: 9999; height: 100vh;">` preloader → Existing cleanup rules don't catch it → Downloaded site shows permanent solid color overlay covering all content
- **Combined Effect**: All three bugs present simultaneously → Downloaded website is completely unusable with blank white/black screen and console errors

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- User edits made with VisBug must continue to be preserved in the captured HTML
- GSAP animation injection via CDN must continue to work correctly
- Image and resource handling must remain unchanged
- Other DOM capture functionality (URL absolutization, pre-reveal, scroll unlock, script nuking, phantom engine) must continue to work as before
- The `liveBase` variable must continue to be set at the beginning of `captureScript`
- Non-preloader overlays (modals, popups, dialogs) must continue to be handled according to existing logic

**Scope:**
All inputs that do NOT involve VisBug UI elements, CSP meta tags, or high z-index preloader overlays should be completely unaffected by this fix. This includes:
- DOM capture for sites without VisBug extension active
- DOM capture for sites without CSP restrictions
- DOM capture for sites without preloader overlays
- All existing DOM sanitization and phantom engine functionality

## Hypothesized Root Cause

Based on the bug description and implementation approach, the most likely issues are:

1. **Missing VisBug Cleanup**: The `captureScript` does not remove VisBug custom elements or chrome-extension:// paths before capturing the DOM
   - VisBug injects `<vis-bug>` custom elements and UI overlays that get saved into the HTML
   - Chrome converts disconnected chrome-extension:// paths to `invalid/` causing ERR_FAILED errors
   - The transparent UI shield overlay blocks the entire screen

2. **CSP Meta Tag Preservation**: The `captureScript` does not remove Content-Security-Policy meta tags
   - Original site's CSP restrictions are preserved in the captured HTML
   - External GSAP CDN scripts are blocked from executing
   - Page remains blank without animations

3. **Insufficient Preloader Detection**: The existing preloader cleanup logic (line ~150 in captureScript) only targets elements with `z-index > 1000` and `bottom === 0`
   - Many preloaders use `z-index` values between 50-1000
   - Some preloaders use `height: 100vh` or `height: 100%` instead of `bottom: 0`
   - These preloaders are not caught by existing rules

4. **Execution Order**: The cleanup logic needs to run BEFORE any other capture logic to ensure a clean starting state
   - Current script begins with URL absolutization
   - Problematic elements should be removed first

## Correctness Properties

Property 1: Fault Condition - DOM Cleanser Removes Problematic Elements

_For any_ captured DOM where VisBug UI elements, CSP meta tags, meta refresh tags, or high z-index preloader overlays are present, the fixed captureScript SHALL remove these elements before any other capture logic executes, ensuring the downloaded HTML displays visible content with working GSAP animations and no invalid/ errors.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**

Property 2: Preservation - Existing Functionality Unchanged

_For any_ DOM capture operation, the fixed captureScript SHALL preserve all existing functionality including user edits, GSAP injection, image handling, URL absolutization, pre-reveal, scroll unlock, script nuking, and phantom engine behavior, producing the same results as the original code for all non-buggy scenarios.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `ResourcesSaverExt-master/src/devtoolApp/hooks/useAppSaveAllResource.js`

**Function**: `handleOnSave` (specifically the `captureScript` variable around line 100)

**Specific Changes**:
1. **Inject God-Mode DOM Cleanser**: Add cleanup block immediately after `const liveBase = window.location.origin;` line
   - This ensures cleanup runs before any other capture logic
   - Maintains the `liveBase` variable as the first line (preservation requirement)

2. **Part A - Kill CSP & META REFRESH**: Remove security policy and refresh tags
   ```javascript
   document.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());
   ```
   - Removes CSP meta tags that block external GSAP CDN scripts
   - Removes meta refresh tags that cause unwanted redirects

3. **Part B - Kill VisBug UI & Extension Leftovers**: Remove VisBug custom elements and chrome-extension paths
   ```javascript
   document.querySelectorAll('vis-bug, #visbug').forEach(el => el.remove());
   document.querySelectorAll('[src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());
   ```
   - Removes `<vis-bug>` custom elements and `#visbug` ID elements
   - Removes all elements with chrome-extension:// or invalid/ paths

4. **Part C - Aggressive Preloader Nuke**: Hide full-screen fixed overlays with high z-index
   ```javascript
   document.querySelectorAll('div, section').forEach(el => {
     const style = window.getComputedStyle(el);
     if (style.position === 'fixed' && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0')) {
       if (parseInt(style.zIndex) > 50) {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
       }
     }
   });
   ```
   - Targets fixed position elements with full viewport coverage
   - Lowers z-index threshold from 1000 to 50 to catch more preloaders
   - Adds multiple height/bottom checks to catch different preloader patterns
   - Uses triple-kill approach (display, opacity, pointer-events) for maximum effectiveness

5. **Preserve Existing Logic**: All existing captureScript functionality remains unchanged after the cleanser block
   - URL absolutization continues to work
   - Pre-reveal and scroll unlock continue to work
   - Script nuking and phantom engine continue to work

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Create test HTML files that simulate each bug condition (VisBug UI elements, CSP meta tags, high z-index preloaders) and run the UNFIXED captureScript against them. Observe failures and verify the root cause.

**Test Cases**:
1. **VisBug UI Test**: Create HTML with `<vis-bug>` element and chrome-extension:// paths → Run unfixed captureScript → Verify these elements persist in captured DOM (will fail on unfixed code)
2. **CSP Blocking Test**: Create HTML with CSP meta tag and external script → Run unfixed captureScript → Verify CSP tag persists and blocks script execution (will fail on unfixed code)
3. **Preloader Test**: Create HTML with fixed position div (z-index: 500, height: 100vh) → Run unfixed captureScript → Verify preloader persists in captured DOM (will fail on unfixed code)
4. **Combined Bug Test**: Create HTML with all three bugs → Run unfixed captureScript → Verify blank screen with invalid/ errors (will fail on unfixed code)

**Expected Counterexamples**:
- VisBug elements and chrome-extension:// paths are present in captured HTML
- CSP meta tags block external script execution
- High z-index preloaders (50-1000 range) are not removed by existing cleanup
- Possible causes: missing cleanup logic, insufficient preloader detection, wrong execution order

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL capturedDOM WHERE isBugCondition(capturedDOM) DO
  result := captureScript_fixed(capturedDOM)
  ASSERT visBugElementsRemoved(result)
  ASSERT cspMetaTagsRemoved(result)
  ASSERT preloaderOverlaysHidden(result)
  ASSERT contentVisible(result)
  ASSERT gsapExecuting(result)
  ASSERT noInvalidPathErrors(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL capturedDOM WHERE NOT isBugCondition(capturedDOM) DO
  ASSERT captureScript_original(capturedDOM) = captureScript_fixed(capturedDOM)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for clean DOM captures (no VisBug, no CSP, no preloaders), then write property-based tests capturing that behavior.

**Test Cases**:
1. **User Edits Preservation**: Observe that user edits are preserved on unfixed code, then write test to verify this continues after fix
2. **GSAP Injection Preservation**: Observe that GSAP CDN injection works on unfixed code (for clean DOMs), then write test to verify this continues after fix
3. **Image Handling Preservation**: Observe that images are handled correctly on unfixed code, then write test to verify this continues after fix
4. **URL Absolutization Preservation**: Observe that URLs are absolutized correctly on unfixed code, then write test to verify this continues after fix

### Unit Tests

- Test God-Mode DOM Cleanser removes VisBug UI elements (`<vis-bug>`, `#visbug`)
- Test cleanser removes chrome-extension:// and invalid/ paths
- Test cleanser removes CSP and meta refresh tags
- Test cleanser hides high z-index preloaders (z-index > 50)
- Test cleanser handles multiple height/bottom patterns (100vh, 100%, 0px)
- Test cleanser executes before URL absolutization
- Test edge cases (no problematic elements present, partial bug conditions)

### Property-Based Tests

- Generate random DOM structures with varying combinations of VisBug elements, CSP tags, and preloaders → Verify cleanser removes all problematic elements
- Generate random clean DOM structures (no bugs) → Verify captured output is identical to original captureScript behavior
- Generate random user edit scenarios → Verify edits are preserved after fix
- Test across many z-index values (0-10000) and position types (fixed, absolute, relative) → Verify only high z-index fixed preloaders are targeted

### Integration Tests

- Test full DOM capture flow with VisBug extension active → Verify downloaded HTML has no VisBug artifacts or invalid/ errors
- Test full DOM capture flow with CSP-restricted site → Verify GSAP CDN scripts execute correctly
- Test full DOM capture flow with preloader overlay → Verify content is visible in downloaded HTML
- Test full DOM capture flow with all three bugs → Verify downloaded site is functional with visible content and working animations
- Test that existing functionality (user edits, GSAP injection, image handling) continues to work correctly
