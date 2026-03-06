// ──────────────────────────────────────────────
// KEEP-ALIVE MECHANISM - Prevent Context Invalidation
// ──────────────────────────────────────────────
// Manifest V3 service workers can be terminated during long operations.
// This keep-alive mechanism prevents the browser from killing the worker
// during heavy cloning operations (e.g., downloading many remote assets).

let keepAliveInterval = null;

function keepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  
  keepAliveInterval = setInterval(() => {
    // A dummy call to keep the context alive
    chrome.runtime.getPlatformInfo(() => {
      // Intentionally empty. Resolves the promise to keep worker active.
    });
  }, 20000); // 20 seconds - well under the 30s timeout
  
  console.log('[CStudio] Keep-alive mechanism activated');
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[CStudio] Keep-alive mechanism deactivated');
  }
}

// Activate keep-alive when DevTools connects
chrome.runtime.onConnect.addListener(port => {
  console.log('[CStudio] Port connected, activating keep-alive');
  keepAlive();
  
  port.onDisconnect.addListener(() => {
    console.log('[CStudio] Port disconnected');
    // Keep the worker alive even after disconnect to handle any pending operations
    // It will naturally sleep after 30s of inactivity
  });
});

// Activate keep-alive on any message
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Activate keep-alive for heavy operations
  if (msg.type === 'CSTUDIO_KEEP_ALIVE_START') {
    console.log('[CStudio] Heavy operation starting, activating keep-alive');
    keepAlive();
    sendResponse({ status: 'keep-alive-activated' });
    return true;
  }
  
  if (msg.type === 'CSTUDIO_KEEP_ALIVE_STOP') {
    console.log('[CStudio] Heavy operation complete, deactivating keep-alive');
    stopKeepAlive();
    sendResponse({ status: 'keep-alive-deactivated' });
    return true;
  }
  
  // For any other message, refresh keep-alive
  keepAlive();
});
