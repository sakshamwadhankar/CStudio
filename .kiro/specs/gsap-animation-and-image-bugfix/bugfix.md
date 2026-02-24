# Bugfix Requirements Document

## Introduction

This document addresses two critical bugs in the ResourcesSaverExt project that affect the captured HTML output:

1. **The 2-Second Blank Screen Bug**: The GSAP Phantom Engine incorrectly animates hero section elements that are already in the initial viewport, causing them to be hidden with `opacity: 0` without ScrollTrigger firing, resulting in a blank screen for 2 seconds.

2. **Local Image 404s Bug**: Images with filter strings in their URLs (e.g., `filtersformat(webp)`) fail to save locally because the OS cannot handle these filenames, causing 404 errors when the rewritten HTML tries to load the local paths.

The fix involves replacing the `captureScript` in `useAppSaveAllResource.js` with a self-healing engine that prevents viewport-visible elements from being animated and catches broken image errors to swap to live CDN URLs.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the GSAP Phantom Engine processes elements in the hero section (already visible in the initial viewport) THEN the system sets their opacity to 0 and waits for ScrollTrigger to fire, but ScrollTrigger never fires because the elements are already at the top, leaving the screen blank for 2 seconds

1.2 WHEN image URLs contain filter strings like `filtersformat(webp)` THEN the system attempts to save these files locally with invalid filenames that the OS cannot handle, resulting in 404 errors when the captured HTML tries to load the rewritten local paths

1.3 WHEN the Phantom Engine applies animations to all elements tagged with `cstudio-animate-me` THEN the system does not check if elements are already visible in the viewport, causing unnecessary animation delays for above-the-fold content

### Expected Behavior (Correct)

2.1 WHEN the GSAP Phantom Engine processes elements in the hero section (already visible in the initial viewport) THEN the system SHALL exclude these elements from animation by checking if their position is within the initial viewport threshold (rect.top <= window.innerHeight * 0.3), ensuring they remain visible immediately on page load

2.2 WHEN image URLs contain filter strings or fail to load from local paths THEN the system SHALL inject a self-healing image error handler that catches 404 errors and automatically swaps the src attribute to the original live CDN URL, ensuring images display correctly

2.3 WHEN the Phantom Engine applies animations to elements tagged with `cstudio-animate-me` THEN the system SHALL only animate elements positioned below the initial viewport threshold (rect.top > window.innerHeight * 0.3), preventing blank screen issues for hero sections

### Unchanged Behavior (Regression Prevention)

3.1 WHEN elements are positioned below the initial viewport (rect.top > window.innerHeight * 0.3) THEN the system SHALL CONTINUE TO apply GSAP scroll-triggered animations with opacity and y-axis transitions

3.2 WHEN the pre-reveal phase executes THEN the system SHALL CONTINUE TO force visibility on hidden elements, remove scroll hijacks, hide fixed overlays, and tag elements with `cstudio-animate-me` class

3.3 WHEN the system captures the DOM snapshot THEN the system SHALL CONTINUE TO force absolute URLs for media elements, remove React/Next.js scripts, and inject the Phantom Engine script into the captured HTML

3.4 WHEN images load successfully from their original sources THEN the system SHALL CONTINUE TO display them without intervention from the error handler

3.5 WHEN the Phantom Engine initializes THEN the system SHALL CONTINUE TO load GSAP and ScrollTrigger from CDN, register the plugin, and refresh ScrollTrigger after animation setup
