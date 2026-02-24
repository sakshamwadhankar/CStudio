# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - DOM Cleanser Removes Problematic Elements
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist (VisBug UI captured, CSP blocking GSAP, preloader stuck)
  - **Scoped PBT Approach**: Scope the property to concrete failing cases - HTML with VisBug elements, CSP meta tags, and high z-index preloaders
  - Create test HTML files simulating each bug condition:
    - VisBug UI Test: HTML with `<vis-bug>` element and chrome-extension:// paths
    - CSP Blocking Test: HTML with CSP meta tag that blocks external scripts
    - Preloader Test: HTML with fixed position div (z-index: 500, height: 100vh)
    - Combined Bug Test: HTML with all three bugs present
  - Run UNFIXED captureScript against test cases
  - **EXPECTED OUTCOME**: Test FAILS with counterexamples:
    - VisBug elements and chrome-extension:// paths persist in captured DOM
    - CSP meta tags block external script execution
    - High z-index preloaders (50-1000 range) are not removed
    - Combined effect produces blank screen with invalid/ errors
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Functionality Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for clean DOM captures (no VisBug, no CSP, no preloaders)
  - Write property-based tests capturing observed behavior patterns:
    - User Edits Preservation: Verify user edits are preserved in captured HTML
    - GSAP Injection Preservation: Verify GSAP CDN injection works correctly
    - Image Handling Preservation: Verify images are handled correctly
    - URL Absolutization Preservation: Verify URLs are absolutized correctly
    - Other DOM Capture Preservation: Verify pre-reveal, scroll unlock, script nuking, phantom engine work as before
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [-] 3. Fix for VisBug CSP Preloader bugs

  - [x] 3.1 Inject God-Mode DOM Cleanser into captureScript
    - Open `ResourcesSaverExt-master/src/devtoolApp/hooks/useAppSaveAllResource.js`
    - Locate the `captureScript` variable (around line 100)
    - Find the line `const liveBase = window.location.origin;`
    - Inject the God-Mode DOM Cleanser block immediately after this line
    - Part A - Kill CSP & META REFRESH:
      ```javascript
      document.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());
      ```
    - Part B - Kill VisBug UI & Extension Leftovers:
      ```javascript
      document.querySelectorAll('vis-bug, #visbug').forEach(el => el.remove());
      document.querySelectorAll('[src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());
      ```
    - Part C - Aggressive Preloader Nuke:
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
    - Ensure all existing captureScript logic remains unchanged after the cleanser block
    - _Bug_Condition: isBugCondition(capturedDOM) where capturedDOM contains VisBug elements, CSP meta tags, or high z-index preloaders_
    - _Expected_Behavior: visBugElementsRemoved(result) AND cspMetaTagsRemoved(result) AND preloaderOverlaysHidden(result) AND contentVisible(result) AND gsapExecuting(result) AND noInvalidPathErrors(result)_
    - _Preservation: User edits, GSAP injection, image handling, URL absolutization, pre-reveal, scroll unlock, script nuking, and phantom engine behavior must remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - DOM Cleanser Removes Problematic Elements
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES with all assertions satisfied:
      - VisBug elements (`<vis-bug>`, `#visbug`) are removed from captured DOM
      - Chrome-extension:// and invalid/ paths are removed
      - CSP and meta refresh tags are removed
      - High z-index preloaders (>50) are hidden with display:none, opacity:0, pointer-events:none
      - Content is visible in downloaded HTML
      - GSAP scripts execute correctly
      - No invalid/ errors in console
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Functionality Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions):
      - User edits are still preserved in captured HTML
      - GSAP CDN injection still works correctly
      - Images are still handled correctly
      - URLs are still absolutized correctly
      - Pre-reveal, scroll unlock, script nuking, phantom engine still work as before
      - liveBase variable is still set correctly at the beginning
      - Non-preloader overlays are still handled according to existing logic
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Verify all exploration tests pass (bug is fixed)
  - Verify all preservation tests pass (no regressions)
  - Test with real websites that have VisBug extension active
  - Test with real websites that have CSP restrictions
  - Test with real websites that have preloader overlays
  - Test with real websites that have all three bugs combined
  - Ensure downloaded HTML displays visible content with working animations and no invalid/ errors
  - Ask the user if questions arise
