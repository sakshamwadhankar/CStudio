# GSAP Animation and Image Bugfix Design

## Overview

This design addresses two critical bugs in the ResourcesSaverExt's DOM capture and animation system:

1. **The 2-Second Blank Screen Bug**: The GSAP Phantom Engine incorrectly animates hero section elements that are already visible in the initial viewport, causing them to be hidden with `opacity: 0` without ScrollTrigger firing, resulting in a blank screen for 2 seconds.

2. **Local Image 404s Bug**: Images with filter strings in their URLs (e.g., `filtersformat(webp)`) fail to save locally because the OS cannot handle these filenames, causing 404 errors when the rewritten HTML tries to load the local paths.

The fix strategy involves replacing the `captureScript` in `useAppSaveAllResource.js` with a self-healing engine that:
- Prevents viewport-visible elements from being animated (only animate elements with `rect.top > window.innerHeight * 0.3`)
- Catches broken image errors and swaps to live CDN URLs automatically

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bugs - when hero section elements are animated despite being in the initial viewport, or when image URLs contain filter strings that cause local save failures
- **Property (P)**: The desired behavior - hero elements should remain visible immediately, and images should display correctly by falling back to CDN URLs on error
- **Preservation**: Existing scroll-triggered animations for below-the-fold content, pre-reveal phase behavior, and DOM snapshot capture must remain unchanged
- **GSAP Phantom Engine**: The deferred animation system injected into captured HTML that applies scroll-triggered animations using GSAP and ScrollTrigger from CDN
- **captureScript**: The JavaScript code executed via `chrome.devtools.inspectedWindow.eval()` that captures the live DOM and injects the Phantom Engine
- **Pre-Reveal Phase**: The step that forces visibility on hidden elements, removes scroll hijacks, hides fixed overlays, and tags elements with `cstudio-animate-me` class before DOM snapshot
- **Initial Viewport Threshold**: The boundary at `window.innerHeight * 0.3` (30% of viewport height) used to determine if an element is in the hero section

## Bug Details

### Fault Condition

The bugs manifest when the GSAP Phantom Engine processes elements during the captured HTML's page load. There are two distinct fault conditions:

**Bug 1 - Blank Screen Fault Condition:**
The Phantom Engine applies scroll-triggered animations to ALL elements tagged with `cstudio-animate-me`, including hero section elements that are already visible in the initial viewport. These elements get set to `opacity: 0, y: 40` and wait for ScrollTrigger to fire, but ScrollTrigger never fires because the elements are already at the top of the page (their trigger point `"top 90%"` is already passed on page load).

**Bug 2 - Image 404 Fault Condition:**
Images with filter strings in their URLs (e.g., `https://cdn.example.com/image.jpg?filtersformat(webp)`) are rewritten to local paths during the save process, but the OS cannot create files with these special characters, causing the local save to fail. When the captured HTML tries to load these images from the rewritten local paths, they result in 404 errors.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { element: HTMLElement, imageUrl: string }
  OUTPUT: boolean
  
  RETURN (
    // Bug 1: Hero element animation condition
    (input.element.classList.contains('cstudio-animate-me') AND
     input.element.getBoundingClientRect().top <= window.innerHeight * 0.3)
    
    OR
    
    // Bug 2: Image filter string condition
    (input.imageUrl.includes('filters') OR
     input.imageUrl.includes('format(') OR
     imageLoadFails(input.imageUrl))
  )
END FUNCTION
```

### Examples

**Bug 1 Examples:**
- Hero heading at `rect.top = 100px` (viewport height = 800px): Gets animated with `opacity: 0`, ScrollTrigger never fires → blank for 2 seconds
- Hero image at `rect.top = 200px` (viewport height = 1080px): Gets animated with `opacity: 0`, ScrollTrigger never fires → blank for 2 seconds
- Call-to-action button at `rect.top = 150px` (viewport height = 900px): Gets animated with `opacity: 0`, ScrollTrigger never fires → blank for 2 seconds
- Edge case - Element at exactly `rect.top = 240px` (30% of 800px viewport): Should NOT be animated (at threshold boundary)

**Bug 2 Examples:**
- Image URL `https://cdn.example.com/hero.jpg?filtersformat(webp)`: Local save fails, rewritten path causes 404
- Image URL `https://cdn.example.com/logo.png?filtersquality(80)`: Local save fails, rewritten path causes 404
- Image URL `https://cdn.example.com/bg.jpg?filtersresize(1920x1080)`: Local save fails, rewritten path causes 404
- Edge case - Image URL `https://cdn.example.com/normal.jpg`: Should load normally from local path

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Elements positioned below the initial viewport threshold (`rect.top > window.innerHeight * 0.3`) must continue to receive GSAP scroll-triggered animations with opacity and y-axis transitions
- The pre-reveal phase must continue to force visibility on hidden elements, remove scroll hijacks, hide fixed overlays, and tag elements with `cstudio-animate-me` class
- The DOM snapshot capture must continue to force absolute URLs for media elements, remove React/Next.js scripts, and inject the Phantom Engine script
- Images that load successfully from their original sources must continue to display without intervention
- The Phantom Engine initialization must continue to load GSAP and ScrollTrigger from CDN, register the plugin, and refresh ScrollTrigger after animation setup

**Scope:**
All inputs that do NOT involve hero section elements (within 30% viewport threshold) or broken image URLs should be completely unaffected by this fix. This includes:
- Below-the-fold content animations (elements with `rect.top > window.innerHeight * 0.3`)
- Successfully loading images without filter strings
- All other DOM capture and pre-reveal phase operations

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Indiscriminate Animation Application**: The Phantom Engine applies animations to ALL elements with the `cstudio-animate-me` class without checking their viewport position
   - Current code: `document.querySelectorAll('.cstudio-animate-me')` selects all tagged elements
   - Missing logic: No `getBoundingClientRect()` check to filter out hero section elements
   - Result: Hero elements get `opacity: 0, y: 40` initial state and wait for ScrollTrigger that never fires

2. **ScrollTrigger Configuration Issue**: The trigger point `"top 90%"` assumes elements start below the viewport
   - For hero elements already at the top, their trigger point is already passed on page load
   - ScrollTrigger doesn't retroactively fire for elements that are already past their trigger point
   - Result: Elements remain in their initial animated state (`opacity: 0`) indefinitely

3. **Missing Image Error Handling**: The current code forces absolute URLs but doesn't handle local save failures
   - Filter strings in URLs cause OS-level file save failures
   - No error handler to catch 404s and fall back to live CDN URLs
   - Result: Broken images in captured HTML

4. **URL Rewriting Without Validation**: The system rewrites image URLs to local paths without validating if the local file exists
   - The download process may silently fail for problematic filenames
   - No mechanism to detect and recover from these failures
   - Result: Rewritten paths point to non-existent local files

## Correctness Properties

Property 1: Fault Condition - Hero Elements Remain Visible

_For any_ element where the bug condition holds (element is tagged with `cstudio-animate-me` AND `rect.top <= window.innerHeight * 0.3`), the fixed Phantom Engine SHALL exclude this element from scroll-triggered animations, ensuring it remains visible immediately on page load with `opacity: 1` and no y-axis transform.

**Validates: Requirements 2.1, 2.3**

Property 2: Fault Condition - Images Self-Heal on Error

_For any_ image where the bug condition holds (image URL contains filter strings OR image fails to load from local path), the fixed system SHALL inject an error handler that catches the load failure and automatically swaps the src attribute to the original live CDN URL, ensuring the image displays correctly.

**Validates: Requirements 2.2**

Property 3: Preservation - Below-Fold Animations Continue

_For any_ element where the bug condition does NOT hold (element is tagged with `cstudio-animate-me` AND `rect.top > window.innerHeight * 0.3`), the fixed Phantom Engine SHALL produce exactly the same scroll-triggered animation behavior as the original code, preserving GSAP animations with opacity and y-axis transitions.

**Validates: Requirements 3.1**

Property 4: Preservation - Pre-Reveal and DOM Capture Unchanged

_For any_ operation in the pre-reveal phase or DOM snapshot capture that does NOT involve hero element animation or image error handling, the fixed code SHALL produce exactly the same behavior as the original code, preserving scroll unlock, visibility forcing, script removal, and Phantom Engine injection.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `ResourcesSaverExt-master/src/devtoolApp/hooks/useAppSaveAllResource.js`

**Function**: `captureScript` (inline string within `handleOnSave` callback)

**Specific Changes**:

1. **Add Viewport Position Check in Phantom Engine**: Modify the element selection logic to filter out hero section elements
   - Replace: `const elementsToAnimate = document.querySelectorAll('.cstudio-animate-me');`
   - With: Filter logic that checks `getBoundingClientRect().top > window.innerHeight * 0.3`
   - Implementation: Use `Array.from()` and `filter()` to exclude elements within the threshold

2. **Inject Image Error Handler**: Add a self-healing script that catches image 404 errors
   - Location: After the pre-reveal phase, before the Phantom Engine injection
   - Implementation: Add event listener for `error` event on all `img` elements
   - Behavior: On error, swap `src` attribute to original CDN URL (stored in `data-original-src`)

3. **Store Original Image URLs**: During the absolute URL forcing phase, preserve original URLs
   - Modify: The section that forces absolute URLs for media elements
   - Add: `el.setAttribute('data-original-src', originalUrl)` before rewriting to local path
   - Purpose: Enable the error handler to fall back to the correct CDN URL

4. **Add Viewport Height Calculation**: Ensure viewport dimensions are available in the Phantom Engine
   - Add: `const viewportThreshold = window.innerHeight * 0.3;` at the start of Phantom Engine
   - Use: In the filter logic to determine which elements to animate

5. **Update Animation Loop**: Modify the forEach loop to only animate filtered elements
   - Keep: The existing `gsap.fromTo()` animation configuration
   - Change: Only apply to elements that pass the viewport position check
   - Preserve: The ScrollTrigger configuration for below-fold elements

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Create test HTML pages with hero sections and problematic image URLs. Capture these pages using the UNFIXED code and observe the blank screen delay and image 404 errors. Measure the timing of when elements become visible and verify image load failures.

**Test Cases**:
1. **Hero Section Blank Screen Test**: Create a page with hero heading at `rect.top = 100px`, capture with unfixed code, observe 2-second blank screen (will fail on unfixed code)
2. **Image Filter String Test**: Create a page with image URL containing `filtersformat(webp)`, capture with unfixed code, observe 404 error in captured HTML (will fail on unfixed code)
3. **Below-Fold Animation Test**: Create a page with content at `rect.top = 1000px`, capture with unfixed code, verify animation works correctly (should pass on unfixed code - this is preservation)
4. **Threshold Boundary Test**: Create a page with element at exactly `rect.top = window.innerHeight * 0.3`, capture with unfixed code, observe behavior (may fail on unfixed code)

**Expected Counterexamples**:
- Hero elements remain at `opacity: 0` for 2+ seconds after page load
- Images with filter strings show 404 errors in browser console
- Possible causes: Missing viewport check in animation loop, no error handler for image failures, local file save failures for problematic filenames

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL element WHERE isBugCondition(element) DO
  result := captureScript_fixed(element)
  ASSERT expectedBehavior(result)
  // Hero elements should be visible immediately (opacity: 1)
  // Images should display correctly (either from local or CDN fallback)
END FOR
```

**Test Cases**:
1. Capture page with hero at `rect.top = 100px`, verify element is visible immediately (no blank screen)
2. Capture page with image URL containing `filtersformat(webp)`, verify image displays correctly via CDN fallback
3. Capture page with multiple hero elements, verify all are visible immediately
4. Capture page with image that fails to load locally, verify error handler swaps to CDN URL

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL element WHERE NOT isBugCondition(element) DO
  ASSERT captureScript_original(element) = captureScript_fixed(element)
  // Below-fold animations should work identically
  // Successfully loading images should be unaffected
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (different viewport sizes, element positions, image URLs)
- It catches edge cases that manual unit tests might miss (elements near threshold boundary, various image URL formats)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for below-fold animations and normal images, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Below-Fold Animation Preservation**: Observe that elements with `rect.top > window.innerHeight * 0.3` animate correctly on unfixed code, then write test to verify this continues after fix
2. **Normal Image Loading Preservation**: Observe that images without filter strings load correctly on unfixed code, then write test to verify this continues after fix
3. **Pre-Reveal Phase Preservation**: Observe that scroll unlock, visibility forcing, and element tagging work correctly on unfixed code, then write test to verify this continues after fix
4. **DOM Snapshot Preservation**: Observe that script removal, absolute URL forcing, and Phantom Engine injection work correctly on unfixed code, then write test to verify this continues after fix

### Unit Tests

- Test viewport position calculation for elements at various `rect.top` values (0px, 100px, 240px, 500px, 1000px)
- Test image error handler triggers on 404 and swaps to CDN URL
- Test that `data-original-src` attribute is correctly set during URL forcing phase
- Test edge case where element is exactly at threshold boundary (`rect.top === window.innerHeight * 0.3`)
- Test that hero elements are excluded from animation loop
- Test that below-fold elements are included in animation loop

### Property-Based Tests

- Generate random viewport heights (600px to 2000px) and element positions, verify correct animation application based on 30% threshold
- Generate random image URLs (with and without filter strings), verify error handler only activates for problematic URLs
- Generate random page structures with mixed hero and below-fold content, verify animations apply correctly to each category
- Test across many scenarios to ensure no regressions in pre-reveal phase or DOM snapshot capture

### Integration Tests

- Test full capture flow with real-world page containing hero section and below-fold content
- Test full capture flow with page containing images with filter strings
- Test that captured HTML loads correctly with hero elements visible immediately
- Test that captured HTML displays images correctly with CDN fallback working
- Test that below-fold animations still trigger on scroll in captured HTML
- Test switching between different page types (hero-heavy vs content-heavy) and verify correct behavior
