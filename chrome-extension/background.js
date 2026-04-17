yes// Background service worker for Chrome extension

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'get-ai-answer') {
    // Send message to popup to trigger AI answer
    chrome.runtime.sendMessage({ action: 'trigger-ai-answer' });
  } else if (command === 'toggle-listening') {
    // Send message to popup to toggle listening
    chrome.runtime.sendMessage({ action: 'toggle-listening' });
  }
});

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Interview Assistant extension installed');
});
