// Content script to handle option-click events
document.addEventListener('click', (event) => {
    // Check if option/alt key is pressed and the target is a link
    if (event.altKey && event.target.tagName === 'A') {
        event.preventDefault();
        
        // Check if the extension is available
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            console.warn('Extension not available');
            return;
        }
        
        const link = event.target;
        const linkUrl = link.href;
        const selectionText = window.getSelection().toString();
        const pageUrl = window.location.href;
        
        // For PR links, extract file path from link text if no selection
        let filePath = selectionText;
        if (!filePath && linkUrl.includes('/pull/')) {
            // Get the link text content which contains the file path
            filePath = link.textContent.trim();
            
            // Clean up the text - remove any extra whitespace or newlines
            filePath = filePath.replace(/\s+/g, ' ').trim();
            
            // If the link text looks like a file path (contains slashes or dots)
            if (filePath.includes('/') || filePath.includes('.')) {
                console.log('Extracted file path from link text:', filePath);
            } else {
                // Fallback: try to get from title attribute or other attributes
                filePath = link.title || link.getAttribute('aria-label') || '';
                console.log('Tried fallback attributes for file path:', filePath);
            }
        }
        
        // Send message to background script with error handling
        try {
            chrome.runtime.sendMessage({
                action: 'openInVscode',
                data: {
                    linkUrl,
                    selectionText: filePath, // Use the extracted file path
                    pageUrl
                }
            }, (response) => {
                // Handle any errors from the background script
                if (chrome.runtime.lastError) {
                    console.warn('Extension message error:', chrome.runtime.lastError.message);
                }
            });
        } catch (error) {
            console.warn('Failed to send message to extension:', error.message);
        }
    }
}); 