# Bugfix Requirements Document

## Introduction

The downloaded website is completely blank with `invalid/` net::ERR_FAILED errors in the console. This is caused by three distinct bugs that occur during the DOM capture process in `useAppSaveAllResource.js`:

1. **VisBug UI Captured**: The VisBug browser extension's UI elements (including `<vis-bug>` custom element and chrome-extension:// paths) are being saved into the HTML. When the extension is not connected, Chrome converts these paths to `invalid/` causing failures, and the overlay blocks the entire screen.

2. **CSP Blocking GSAP**: The original site's strict Content-Security-Policy meta tag is blocking the injected GSAP CDN scripts from executing, preventing animations from running and leaving the page blank.

3. **Preloader Stuck**: Full-screen preloader overlays with high z-index values are not being removed by existing cleanup rules, leaving a permanent solid color covering all content.

The combined effect renders the downloaded site completely unusable with a blank white/black screen.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the DOM is captured with VisBug extension active THEN the system saves `<vis-bug>` custom elements and chrome-extension:// references into the HTML

1.2 WHEN the captured HTML contains chrome-extension:// paths and is opened without the extension THEN the system generates `invalid/` net::ERR_FAILED errors

1.3 WHEN the captured HTML contains VisBug's transparent UI shield overlay THEN the system renders a full-screen blocking element over all content

1.4 WHEN the original site has a Content-Security-Policy meta tag THEN the system preserves it in the captured HTML, blocking external GSAP CDN scripts from loading

1.5 WHEN the original site has a meta refresh tag THEN the system preserves it in the captured HTML, potentially causing unwanted redirects

1.6 WHEN the original site has full-screen preloader overlays with high z-index values THEN the system fails to remove them, leaving permanent solid color overlays

1.7 WHEN multiple bugs combine (VisBug UI + CSP blocking + stuck preloader) THEN the system produces a completely blank downloaded website

### Expected Behavior (Correct)

2.1 WHEN the DOM is captured with VisBug extension active THEN the system SHALL remove all `<vis-bug>` custom elements before saving the HTML

2.2 WHEN the DOM is captured THEN the system SHALL remove all chrome-extension:// references and related extension artifacts

2.3 WHEN the DOM is captured THEN the system SHALL remove VisBug's transparent UI shield overlay elements

2.4 WHEN the original site has a Content-Security-Policy meta tag THEN the system SHALL remove it to allow external GSAP CDN scripts to load

2.5 WHEN the original site has a meta refresh tag THEN the system SHALL remove it to prevent unwanted redirects

2.6 WHEN the original site has full-screen preloader overlays THEN the system SHALL hide or remove elements with fixed/absolute positioning, high z-index (>900), and full viewport coverage

2.7 WHEN the DOM cleanser runs THEN the system SHALL execute before any other capture logic to ensure a clean starting state

2.8 WHEN all three bugs are fixed THEN the system SHALL produce a functional downloaded website with visible content and working animations

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user has made edits using VisBug THEN the system SHALL CONTINUE TO preserve those edits in the captured HTML

3.2 WHEN GSAP animations are injected via CDN THEN the system SHALL CONTINUE TO inject and execute them correctly

3.3 WHEN images and other resources are captured THEN the system SHALL CONTINUE TO handle them correctly

3.4 WHEN other DOM capture functionality executes THEN the system SHALL CONTINUE TO work as before

3.5 WHEN the live base URL is set THEN the system SHALL CONTINUE TO set it correctly at the beginning of captureScript

3.6 WHEN non-preloader overlays exist (modals, popups, etc.) THEN the system SHALL CONTINUE TO handle them according to existing logic
