// Background service worker - opens setup page when extension icon is clicked

chrome.action.onClicked.addListener((tab) => {
  // Open the setup page in a new tab
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup/popup.html')
  });
});
