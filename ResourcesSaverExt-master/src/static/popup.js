//console.log('Hello from -> Popup');

const updateToggleVisibility = (version) => {
  const toggleContainer = document.getElementById('visbug-toggle-container');
  if (version === '3') {
    toggleContainer.style.display = 'block';
  } else {
    toggleContainer.style.display = 'none';
  }
};

const handleSwitchVersion = (version) => {
  document.querySelectorAll('.switch-version-btn').forEach((i) => {
    // Don't strip classes from the toggle button which also checks for switch-version-btn class in CSS likely? 
    // Actually the CSS class 'switch-version-btn' controls the look. 
    // We only want to remove 'active' from the version toggles, not the VisBug button if it shares the class.
    // But the IDs are specific.
    if (i.id !== 'visbug-toggle-btn') {
      i.classList.remove('active');
    }
  });

  localStorage.setItem('resources-saver-version', version);

  if (version === '2') {
    document.getElementById('switch-version-2').classList.add('active');
  } else if (version === '3') {
    document.getElementById('switch-version-3').classList.add('active');
  }

  updateToggleVisibility(version);
};

window.onload = () => {
  document.getElementById('switch-version-2').addEventListener('click', () => {
    handleSwitchVersion('2');
  });

  document.getElementById('switch-version-3').addEventListener('click', () => {
    handleSwitchVersion('3');
  });

  document.getElementById('visbug-toggle-btn').addEventListener('click', async () => {
    // Visual feedback
    const btn = document.getElementById('visbug-toggle-btn');
    btn.innerText = 'Injecting...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error("No active tab found");
      }

      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        alert("VisBug cannot be injected into this page. Please try on a normal website.");
        throw new Error("Restricted URL: " + tab.url);
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // 1. Inject CSS
          if (!document.querySelector('link[href*="visbug.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = chrome.runtime.getURL('visbug_assets/visbug.css');
            document.head.appendChild(link);
          }

          // 2. Inject VisBug JS (ES Module)
          if (!document.querySelector('script[src*="visbug.js"]')) {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = chrome.runtime.getURL('visbug_assets/visbug.js');
            document.body.appendChild(script);
          }

          // 3. Activate Component
          // We wait slightly for module to load or just append the element (VisBug upgrades automatically)
          if (!document.querySelector('vis-bug')) {
            const visbug = document.createElement('vis-bug');
            document.body.prepend(visbug);
            console.log('CStudio: VisBug Element Injected');
          }
        }
      });

      btn.innerText = 'Activated!';
      btn.style.backgroundColor = '#2196F3'; // Blue to indicate active
    } catch (err) {
      console.error('Injection failed:', err);
      btn.innerText = 'Error (See Console)';
      btn.style.backgroundColor = '#f44336';
    }

    setTimeout(() => {
      if (btn.innerText === 'Activated!') btn.innerText = 'Enable Live Editor (VisBug)';
    }, 2000);
  });

  const version = localStorage.getItem('resources-saver-version');

  if (version === '3') {
    document.getElementById('switch-version-3').classList.add('active');
    updateToggleVisibility('3');
  } else {
    // Default to V2 if not set or set to legacy/2
    document.getElementById('switch-version-2').classList.add('active');
    updateToggleVisibility('2');
    if (version !== '2') {
      // Ensure valid default if it was something else
      localStorage.setItem('resources-saver-version', '2');
    }
  }
};
