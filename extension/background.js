// Only open the packaged app. No background polling, content scripts, or
// relay that accepts URLs from other pages.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({url: chrome.runtime.getURL('skyline.html')});
});
