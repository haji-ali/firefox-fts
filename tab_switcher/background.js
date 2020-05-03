
const WINDOW_ID_NONE = browser.windows.WINDOW_ID_NONE;

let focusedWindowId = WINDOW_ID_NONE;
const windowsLastAccess = new Map();

browser.windows.onFocusChanged.addListener(windowId => {
	if (focusedWindowId !== WINDOW_ID_NONE) {
		// Remember current time for previously focused window as last access
		windowsLastAccess.set(focusedWindowId, (new Date).getTime());
	}
	focusedWindowId = windowId;
});

browser.windows.onRemoved.addListener(windowId => {
	windowsLastAccess.delete(windowId);

	if (focusedWindowId === windowId) {
		// Clear previously focused window id
		// to prevent writing it in map in onFocusChanged again
		focusedWindowId = WINDOW_ID_NONE;
	}
});

const tabsToDelete = new Map();
let doSort = false;

browser.runtime.onConnect.addListener(function (externalPort) {
	if (externalPort.name === 'FastTabSwitcher_Port') {
		// externalPort.onDisconnect.addListener(function () {
		// 	// Close all tabs
		// 	//if (confirm("are you sure?"))
		// 	// browser.tabs.create({url: "/switcher.html"}).then(
		// 	// 	() =>
		// 	// 		browser.tabs.executeScript({
		// 	// 			code: "confirm('are you sure?');"
		// 	// 		}).then(function (result) {
		// 	// 			if (result)
		// 	// 				tabsToDelete.forEach((key, tabId) => browser.tabs.remove(tabId));
		// 	// 		})
		// 	// );
		// 	// tabsToDelete.forEach((key, tabId) => browser.tabs.remove(tabId));
		// });
		externalPort.onMessage.addListener(msg => {
			const {id, data} = msg;
			processMessage(data).
				then((result) => externalPort.postMessage({id, data: result}));
		});
	}});

// browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
// 	sendResponse(processMessage(message));
// });

async function processMessage(message) {
	if (message.type === 'getWindowsLastAccess') {
		if (focusedWindowId !== WINDOW_ID_NONE) {
			// Set current time for currently focused window
			// since it is accessed right now
			windowsLastAccess.set(focusedWindowId, (new Date).getTime());
		}
		return windowsLastAccess;
	}
	else if (message.type == 'toggle_delete_tab'){
		const tmp = !tabsToDelete.has(message.tabId);
		if (tmp)
			tabsToDelete.set(message.tabId, true);
		else
			tabsToDelete.delete(message.tabId);
		return tmp;
	}
	else if (message.type == 'delete_tab_map'){
		return tabsToDelete;
	}
	else if (message.type == 'undelete_all'){
		tabsToDelete.clear();
	}
	else if (message.type == 'close_marked_tabs'){
		// tabsToDelete.forEach((key, tabId) => console.log(tabId));
		promises = Array.from(tabsToDelete.keys(),
							  (tabId) => browser.tabs.remove(tabId));
		await Promise.all(promises).then(() => tabsToDelete.clear());
	}
	else if (message.type == 'toggle_sort'){
		if (message.toggle)
			doSort = !doSort;
		return doSort;
	}
	return true;  // Success
}
