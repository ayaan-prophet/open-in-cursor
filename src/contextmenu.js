const PULL_REQUEST_PATH_REGEXP = /.+\/([^/]+)\/(pull)\/[^/]+\/(.*)/;

class OptionValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OptionValidationError';
    }
}

async function getOptions() {
    const options = await chrome.storage.sync.get({
        remoteHost: '',
        basePath: '',
        insidersBuild: false,
        debug: false,
    });

    if (options.basePath === '') {
        throw new OptionValidationError('Looks like you haven\'t configured this extension yet. You can find more information about this by visiting the extension\'s README page.');
    }

    return options;
}

function getVscodeLink({
    repo, file, isFolder, line,
}, {
    remoteHost, insidersBuild, basePath, debug,
}) {
    let vscodeLink = insidersBuild
        ? 'cursor-insiders'
        : 'cursor';

    // vscode://vscode-remote/ssh-remote+[host]/[path/to/file]:[line]
    // OR
    // vscode://file/[path/to/file]:[line]
    if (remoteHost !== '') {
        vscodeLink += `://cursor-remote/ssh-remote+${remoteHost}`;
    } else {
        vscodeLink += '://file';
    }

    // windows paths don't start with slash
    if (basePath[0] !== '/') {
        vscodeLink += '/';
    }

    vscodeLink += `${basePath}/${repo}/${file}`;

    // opening a folder and not a file
    if (isFolder) {
        vscodeLink += '/';
    }

    if (line) {
        vscodeLink += `:${line}:1`;
    }

    if (debug) {
        // eslint-disable-next-line no-console
        console.log(`About to open link: ${vscodeLink}`);
    }

    return vscodeLink;
}

function isPR(linkUrl) {
    return PULL_REQUEST_PATH_REGEXP.test(linkUrl);
}

function parseLink(linkUrl, selectionText, pageUrl, debug = false) {
    if (debug) {
        // eslint-disable-next-line no-console
        console.log(`parseLink called with: linkUrl=${linkUrl}, selectionText=${selectionText}, pageUrl=${pageUrl}`);
    }
    
    const url = new URL(linkUrl ?? pageUrl);
    const path = url.pathname;

    if (isPR(url.pathname)) {
        const pathInfo = PULL_REQUEST_PATH_REGEXP.exec(path);
        const repo = pathInfo[1];
        const isFolder = false;
        
        // For PR links, if no selection text is provided, try to extract file path from the link URL
        let file = selectionText;
        if (!file && linkUrl) {
            // Try to extract file path from the link URL itself
            const linkUrlObj = new URL(linkUrl);
            const linkPath = linkUrlObj.pathname;
            
            // Look for file patterns in the URL path
            const fileMatch = linkPath.match(/\/files\/([^/]+(?:\/[^/]+)*)/);
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(`PR file match result: ${fileMatch}`);
            }
            if (fileMatch) {
                file = fileMatch[1];
            } else {
                // Fallback: try to extract from the last part of the path that looks like a file
                const pathParts = linkPath.split('/');
                for (let i = pathParts.length - 1; i >= 0; i--) {
                    if (pathParts[i].includes('.') || pathParts[i].includes('/')) {
                        file = pathParts.slice(i).join('/');
                        break;
                    }
                }
            }
        }
        
        let line = null;
        if (pageUrl.includes(linkUrl)) {
            line = pageUrl.replace(linkUrl, '').replace('R', '').replace('L', '');
        }
        return {
            repo,
            file,
            isFolder,
            line,
        };
    }

    const pathRegexp = /.+\/([^/]+)\/(blob|tree)\/[^/]+\/(.*)/;

    if (!pathRegexp.test(path)) {
        throw new Error(`Invalid link. Could not extract info from: ${path}.`);
    }

    const pathInfo = pathRegexp.exec(path);

    const repo = pathInfo[1];
    const isFolder = pathInfo[2] === 'tree';
    const file = pathInfo[3];

    let line;

    if (url.hash.indexOf('#L') === 0) {
        line = url.hash.substring(2);
    }

    return {
        repo,
        file,
        isFolder,
        line,
    };
}

async function getCurrentTab() {
    const queryOptions = { active: true, lastFocusedWindow: true };
    const [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

function injectedAlert(message) {
    // eslint-disable-next-line no-undef
    alert(message);
}

function injectedWindowOpen(url) {
    // eslint-disable-next-line no-undef
    window.open(url);
}

async function openInVscode({ linkUrl, selectionText, pageUrl }) {
    let tab;
    try {
        tab = await getCurrentTab();
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Unexpected error');
        // eslint-disable-next-line no-console
        console.error(e);
        return;
    }

    try {
        const options = await getOptions();
        const parsedLinkData = parseLink(linkUrl, selectionText, pageUrl, options.debug);
        const url = getVscodeLink(parsedLinkData, options);
        await chrome.scripting.executeScript(
            {
                target: { tabId: tab.id },
                func: injectedWindowOpen,
                args: [url],
            },
        );
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        await chrome.scripting.executeScript(
            {
                target: { tabId: tab.id },
                func: injectedAlert,
                args: [e.message ?? e],
            },
        );
        if (e.name === 'OptionValidationError') {
            chrome.runtime.openOptionsPage();
        }
    }
}

const contextMenuId = 'open-in-vscode-context-menu';

chrome.contextMenus.create({
    id: contextMenuId,
    title: 'Open in Cursor',
    contexts: ['link', 'page'],
});

chrome.contextMenus.onClicked.addListener(({ menuItemId, ...info }) => {
    if (menuItemId !== contextMenuId) {
        return;
    }

    openInVscode(info);
});

chrome.action.onClicked.addListener((({ url }) => {
    openInVscode({ linkUrl: url, pageUrl: url });
}));

// Listen for messages from content script (option-click events)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openInVscode') {
        openInVscode(message.data);
        // Send a response to prevent the "message port closed" error
        sendResponse({ success: true });
    }
    // Return true to indicate we will send a response asynchronously
    return true;
});
