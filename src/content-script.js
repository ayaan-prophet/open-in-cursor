// Content script to handle option-click events
document.addEventListener('click', (event) => {
    // Check if option/alt key is pressed and the target is a link
    if (event.altKey && event.target.tagName === 'A') {
        event.preventDefault();
        
        const link = event.target;
        const linkUrl = link.href;
        const selectionText = window.getSelection().toString();
        const pageUrl = window.location.href;
        
        // Send message to background script
        chrome.runtime.sendMessage({
            action: 'openInVscode',
            data: {
                linkUrl,
                selectionText,
                pageUrl
            }
        });
    }
}); 