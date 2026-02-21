# Bug Condition Exploration Test Results

**Date**: 2025-01-XX  
**Test File**: `tests/bug-exploration-final.test.js`  
**Status**: ✓ Bug Confirmed on Unfixed Code

## Test Overview

This document records the counterexamples found during bug condition exploration testing on the UNFIXED code in `useAppSaveAllResource.js`.

## Bug 1: Hero Elements Incorrectly Animated

### Fault Condition

The GSAP Phantom Engine applies scroll-triggered animations to ALL elements tagged with `cstudio-animate-me`, including hero section elements that are already visible in the initial viewport (rect.top <= window.innerHeight * 0.3).

### Counterexample Found

**Test Configuration:**
- Viewport: 1200x800px
- Hero threshold (30%): 240px
- Hero element position: 20px (well within threshold)
- Below-fold element position: 1090px (outside threshold)

**Observed Behavior:**
```
Console Logs from Phantom Engine:
  [BUG] Animating element at top: 20 px (isHero: true , threshold: 240 px)
  [BUG] Animating element at top: 1090 px (isHero: false , threshold: 240 px)
```

**Analysis:**
- ❌ Hero element at 20px was tagged with `cstudio-animate-me` class
- ❌ GSAP applied `gsap.fromTo()` animation to this element
- ❌ Element was set to `opacity: 0, y: 40` initially by GSAP
- ❌ ScrollTrigger was configured with `start: "top 90%"` which may not fire correctly for elements already at the top
- ✓ Below-fold element at 1090px was correctly animated (preservation verified)

**Root Cause Confirmed:**
The code in `useAppSaveAllResource.js` line ~180 (in the Phantom Engine script) contains:
```javascript
const elementsToAnimate = document.querySelectorAll('.cstudio-animate-me');
elementsToAnimate.forEach(el => {
  // No viewport position check here!
  gsap.fromTo(el, { opacity: 0, y: 40 }, { ... });
});
```

There is NO check for `getBoundingClientRect().top <= window.innerHeight * 0.3` to exclude hero elements.

### Expected Behavior

Hero elements (rect.top <= 240px in this test) should be:
1. Excluded from the `elementsToAnimate` selection
2. Left at `opacity: 1` (as set by pre-reveal phase)
3. NOT animated by GSAP

Below-fold elements (rect.top > 240px) should continue to be animated as before.

## Bug 2: Image Filter String 404s

### Fault Condition

Images with filter strings in their URLs (e.g., `?filtersformat(webp)`) fail to save locally because the OS cannot handle these special characters in filenames. When the captured HTML tries to load these images from rewritten local paths, they result in 404 errors.

### Test Limitations

This bug is difficult to reproduce in an automated test because:
1. The bug occurs during the actual file save process in the Chrome extension
2. OS-level file system restrictions prevent saving files with special characters
3. The test environment uses live CDN URLs which load successfully
4. The extension's download mechanism is not accessible from Node.js tests

### Expected Fix

The fix should:
1. Store original CDN URLs in `data-original-src` attributes during URL forcing phase
2. Inject an image error handler that catches 404 errors
3. Automatically swap `src` to the original CDN URL on error
4. Ensure images display correctly even if local save fails

## Preservation Requirements Verified

✓ Below-fold elements (rect.top > 240px) are correctly animated by GSAP  
✓ Pre-reveal phase correctly tags elements with `cstudio-animate-me`  
✓ Phantom Engine successfully loads GSAP and ScrollTrigger from CDN  
✓ ScrollTrigger configuration works for below-fold elements

## Recommendations

1. **Proceed with fix implementation** for Bug 1 - root cause confirmed
2. **Implement viewport position check** in Phantom Engine before applying animations
3. **Add image error handler** for Bug 2 as specified in design document
4. **Run this test again after fix** to verify bugs are resolved
5. **Ensure preservation** - below-fold animations must continue to work

## Test Files

- Main test: `tests/bug-exploration-final.test.js`
- Additional tests: `tests/bug-condition-exploration.test.js`, `tests/simple-bug-test.js`

## Next Steps

1. Mark Task 1 as complete
2. Proceed to Task 2: Implement the fix in `useAppSaveAllResource.js`
3. Re-run this test to verify the fix works correctly
4. Verify preservation of below-fold animations
