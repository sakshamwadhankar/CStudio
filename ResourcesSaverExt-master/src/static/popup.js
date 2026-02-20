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

  document.getElementById('visbug-toggle-btn').addEventListener('click', () => {
    console.log('VisBug Activated!');
    // Visual feedback
    const btn = document.getElementById('visbug-toggle-btn');
    const originalText = btn.innerText;
    btn.innerText = 'Activated!';
    setTimeout(() => { btn.innerText = originalText; }, 1000);
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
