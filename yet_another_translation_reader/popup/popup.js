document.addEventListener('DOMContentLoaded', () => {
  const urlA = document.getElementById('url-a');
  const urlB = document.getElementById('url-b');
  const grabA = document.getElementById('grab-a');
  const grabB = document.getElementById('grab-b');
  const openBtn = document.getElementById('open-viewer');
  const errorMsg = document.getElementById('error-msg');

  // Load saved URLs if any
  chrome.storage.local.get(['lastUrlA', 'lastUrlB'], (result) => {
    if (result.lastUrlA) urlA.value = result.lastUrlA;
    if (result.lastUrlB) urlB.value = result.lastUrlB;
  });

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  function hideError() {
    errorMsg.classList.add('hidden');
  }

  function isValidAO3Url(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'archiveofourown.org' && 
             parsed.pathname.includes('/works/');
    } catch {
      return false;
    }
  }

  // Grab URL from the most recently active AO3 tab
  async function grabCurrentTabUrl(targetInput) {
    try {
      // Query for the most recently active tab (not this setup page)
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      let tab = tabs[0];
      
      // If current tab is this setup page, find another recent tab
      if (tab && tab.url && tab.url.startsWith('chrome-extension://')) {
        const allTabs = await chrome.tabs.query({ url: 'https://archiveofourown.org/*' });
        if (allTabs.length > 0) {
          tab = allTabs[allTabs.length - 1]; // Most recent AO3 tab
        }
      }
      
      if (tab && tab.url) {
        if (isValidAO3Url(tab.url)) {
          targetInput.value = tab.url;
          hideError();
          // Save immediately
          chrome.storage.local.set({ 
            lastUrlA: urlA.value, 
            lastUrlB: urlB.value 
          });
        } else {
          showError('Current tab is not an AO3 work page. Navigate to an AO3 work first.');
        }
      } else {
        showError('Could not get current tab URL.');
      }
    } catch (err) {
      showError('Error accessing tabs: ' + err.message);
    }
  }

  grabA.addEventListener('click', () => grabCurrentTabUrl(urlA));
  grabB.addEventListener('click', () => grabCurrentTabUrl(urlB));

  openBtn.addEventListener('click', () => {
    hideError();
    
    const a = urlA.value.trim();
    const b = urlB.value.trim();

    if (!a || !b) {
      showError('Please enter both URLs.');
      return;
    }

    if (!isValidAO3Url(a)) {
      showError('Text A URL must be a valid AO3 work URL.');
      return;
    }

    if (!isValidAO3Url(b)) {
      showError('Text B URL must be a valid AO3 work URL.');
      return;
    }

    // Save URLs for convenience
    chrome.storage.local.set({ lastUrlA: a, lastUrlB: b });

    // Open viewer with URLs as query params
    const viewerUrl = chrome.runtime.getURL('viewer/viewer.html') + 
      `?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
    
    chrome.tabs.create({ url: viewerUrl });
  });

  // Allow Enter key to submit
  [urlA, urlB].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        openBtn.click();
      }
    });
  });
});
