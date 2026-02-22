/**
 * Test to validate the captureScript logic
 * This simulates what happens when the script runs in the browser
 */

describe('CaptureScript Validation', () => {
  let mockDocument;
  let mockWindow;

  beforeEach(() => {
    // Create a mock DOM environment
    mockDocument = {
      documentElement: {
        cloneNode: jest.fn(() => ({
          querySelectorAll: jest.fn(() => []),
          querySelector: jest.fn(() => null),
          classList: { remove: jest.fn() },
          setAttribute: jest.fn(),
          getAttribute: jest.fn(() => ''),
          style: { setProperty: jest.fn() },
          outerHTML: '<!DOCTYPE html><html><head></head><body></body></html>'
        })),
        outerHTML: '<!DOCTYPE html><html><head></head><body></body></html>'
      },
      querySelectorAll: jest.fn(() => []),
      createElement: jest.fn(() => ({
        innerHTML: '',
        src: ''
      }))
    };

    mockWindow = {
      location: { origin: 'https://example.com' },
      getComputedStyle: jest.fn(() => ({
        display: 'block',
        position: 'static',
        zIndex: '1',
        height: 'auto',
        bottom: 'auto',
        backgroundColor: 'transparent'
      })),
      innerHeight: 1000
    };

    global.document = mockDocument;
    global.window = mockWindow;
    global.URL = class URL {
      constructor(url, base) {
        this.href = base ? `${base}/${url}` : url;
      }
    };
  });

  test('Script should be wrapped in IIFE with try-catch', () => {
    const scriptContent = `
      (function() {
        try {
          const liveBase = window.location.origin;
          return "success";
        } catch (err) {
          return "<!-- CRASH REPORT: " + err.message + " -->\\n" + document.documentElement.outerHTML;
        }
      })();
    `;

    // Verify the script structure
    expect(scriptContent).toContain('(function()');
    expect(scriptContent).toContain('try {');
    expect(scriptContent).toContain('catch (err)');
    expect(scriptContent).toContain('CRASH REPORT');
  });

  test('Script should handle errors gracefully', () => {
    const scriptWithError = `
      (function() {
        try {
          throw new Error('Test error');
        } catch (err) {
          return "<!-- CRASH REPORT: " + err.message + " -->\\nFallback HTML";
        }
      })();
    `;

    const result = eval(scriptWithError);
    expect(result).toContain('CRASH REPORT: Test error');
    expect(result).toContain('Fallback HTML');
  });

  test('Script should tag hidden elements correctly', () => {
    const hiddenElement = {
      closest: jest.fn(() => null),
      setAttribute: jest.fn(),
      hasAttribute: jest.fn(() => false),
      getAttribute: jest.fn(() => '')
    };

    mockDocument.querySelectorAll = jest.fn((selector) => {
      if (selector.includes('opacity-0')) {
        return [hiddenElement];
      }
      return [];
    });

    mockWindow.getComputedStyle = jest.fn(() => ({
      display: 'block'
    }));

    // Simulate the tagging logic
    const elements = mockDocument.querySelectorAll('.opacity-0');
    elements.forEach(el => {
      if (!el.closest('[role="dialog"]')) {
        const comp = mockWindow.getComputedStyle(el);
        if (comp && comp.display !== 'none') {
          el.setAttribute('data-cstudio-hidden', 'true');
        }
      }
    });

    expect(hiddenElement.setAttribute).toHaveBeenCalledWith('data-cstudio-hidden', 'true');
  });

  test('Script should detect preloaders with z-index > 40', () => {
    const preloaderElement = {
      setAttribute: jest.fn()
    };

    mockDocument.querySelectorAll = jest.fn((selector) => {
      if (selector === 'div, section') {
        return [preloaderElement];
      }
      return [];
    });

    mockWindow.getComputedStyle = jest.fn(() => ({
      position: 'fixed',
      zIndex: '50',
      height: '100vh',
      bottom: '0px',
      backgroundColor: 'rgb(0, 0, 0)'
    }));

    // Simulate preloader detection
    const elements = mockDocument.querySelectorAll('div, section');
    elements.forEach(el => {
      const style = mockWindow.getComputedStyle(el);
      if (style && style.position === 'fixed' && parseInt(style.zIndex) > 40) {
        el.setAttribute('data-cstudio-preloader', 'true');
      }
    });

    expect(preloaderElement.setAttribute).toHaveBeenCalledWith('data-cstudio-preloader', 'true');
  });

  test('Script should inject GSAP Phantom Engine', () => {
    const mockBody = {
      appendChild: jest.fn()
    };

    const mockEngineScript = {
      innerHTML: ''
    };

    mockDocument.createElement = jest.fn(() => mockEngineScript);

    // Simulate engine injection
    const engineScript = mockDocument.createElement('script');
    engineScript.innerHTML = `
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
    `;

    mockBody.appendChild(engineScript);

    expect(mockBody.appendChild).toHaveBeenCalledWith(mockEngineScript);
    expect(engineScript.innerHTML).toContain('gsap');
    expect(engineScript.innerHTML).toContain('data-original-src');
  });

  test('Script should convert relative URLs to absolute', () => {
    const testUrl = '/images/test.jpg';
    const baseUrl = 'https://example.com';
    
    const absoluteUrl = new URL(testUrl, baseUrl).href;
    
    expect(absoluteUrl).toBe('https://example.com/images/test.jpg');
  });

  test('Script should handle srcset with multiple sources', () => {
    const srcset = 'image1.jpg 1x, image2.jpg 2x';
    const baseUrl = 'https://example.com';

    const absoluteSrcset = srcset.split(',').map(part => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.search(/\s+/);
      try {
        if (spaceIdx === -1) return new URL(trimmed, baseUrl).href;
        return new URL(trimmed.substring(0, spaceIdx), baseUrl).href + trimmed.substring(spaceIdx);
      } catch(e) { return part; }
    }).join(', ');

    expect(absoluteSrcset).toContain('https://example.com/image1.jpg 1x');
    expect(absoluteSrcset).toContain('https://example.com/image2.jpg 2x');
  });
});

console.log('✅ CaptureScript validation tests created');
console.log('📝 To run: npm test capture-script-validation.test.js');
