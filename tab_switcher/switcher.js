let selectedString;
let allTabsSorted;
// Maps keywords to tabs.
let allTabKeywords;
let isSettingKeyword = false;
let doSort = false;
let maxDead = 10;
let activeTabIndex = undefined;
let preventClosingCurrent = true;

/**
 * Always reloads the browser tabs and stores them to `allTabsSorted`
 * in most-recently-used order.
 */
async function reloadTabs(query, selectActive) {
	const tabs = await getAllTabs();
	if (doSort){
		allTabsSorted = await sortTabsMru(tabs);
	}
	else{
		allTabsSorted = tabs;
	}
	allTabKeywords = {};//await getAllTabKeywords(); // Too slow

	if (maxDead >= 0) {
		// get recently closed, with limit or unlimited if maxDead is 0
		let recentlyClosed = await browser.sessions.getRecentlyClosed(
			maxDead > 0 ? { maxResults: maxDead } : {}
		);

		recentlyClosed = recentlyClosed
			.filter(item => item.tab) // filter out recently closed windows
			.map(item => item.tab) // move tab element to top
		;

		// add it to the end of allTabsSorted
		allTabsSorted = allTabsSorted.concat(recentlyClosed)
	}

	const currentWin = await browser.windows.getCurrent();
	activeTabIndex = allTabsSorted.findIndex(tab => tab.active && tab.windowId == currentWin.id);

	updateVisibleTabs(query, true, selectActive);
}

async function getAllTabs() {
	const allTabs = await browser.tabs.query({windowType: 'normal'});
	return allTabs;
}

async function getAllTabKeywords() {
	const keywords = {};
	for (let tab of allTabsSorted) {
		let keyword = await browser.sessions.getTabValue(tab.id, "keyword");
		if (keyword) {
			keywords[keyword] = tab;
		}
	}
	return keywords;
}

async function sortTabsMru(tabs) {
	const windowsLastAccess = await browser.runtime.sendMessage(
		{type: 'getWindowsLastAccess'});

	const sortKey = tab => {
		if (tab.active) {
			// lastAccessed of active tab is always current time
			// so we are using it's window last access
			return windowsLastAccess.get(tab.windowId);
		} else {
			return tab.lastAccessed;
		}
	};

	const sorted = tabs.sort((a, b) => sortKey(b) - sortKey(a));
	return sorted;
}

/**
 * Filters the visible tabs using the given query.
 * If `preserveSelectedTabIndex` is set to `true`, will preserve
 * the previously selected position, if any.
 */
async function updateVisibleTabs(query, preserveSelectedTabIndex, selectActive) {

	let tabs = allTabsSorted;
	if (query) {
		tabs = tabs.filter(tabsFilter(query));
		// Check if this query matched a keyword for a tab.
		const keywordTab = allTabKeywords[query];
		if (keywordTab) {
			// Put this at the top.
			tabs.splice(0, 0, keywordTab);
		}
	}
	// Determine the index of a tab to highlight
	const prevTabId = getSelectedTabId();
	let tabIndex = 0;
	if (selectActive && activeTabIndex)
		tabIndex = activeTabIndex;
	else if (preserveSelectedTabIndex && prevTabId) {
		let prevTabIndex = getSelectedTabIndex();
		let tab = allTabsSorted[prevTabIndex];
		if (tab.id != prevTabId && tab.sessionId != prevTabId){
			// Find index from id
			const newIndex = allTabsSorted.
				  findIndex(tab => (tab.id == prevTabId || tab.sessionId == prevTabId));
			if (newIndex && newIndex >= 0)
				prevTabIndex = newIndex;
		}
		const numVisibleTabs = tabs.length;
		if (prevTabIndex < numVisibleTabs) {
			tabIndex = prevTabIndex;
		} else {
			tabIndex = numVisibleTabs - 1;
		}
	}

	// Update the body of the table with filtered tabs
	$('#tabs_table tbody').empty().append(
		tabs.map((tab, tabIndex) =>
				 {
					 const isDead = Object.prototype.hasOwnProperty.call(tab, "sessionId");
					 const tabId = isDead ? tab.sessionId : tab.id;
					 return $('<tr></tr>').append(
						 $('<td></td>').append(
							 tab.favIconUrl
								 ? $('<img width="16" height="16">')
								 .attr('src',
									   !tab.incognito
									   ? tab.favIconUrl
									   : '/icons/mask16.svg'
									  )
								 : null
						 ),
						 $('<td></td>').text(tab.title).addClass("tabs_table__row_title"),
						 $('<td></td>').text(tab.url),
					 )
						 .data('index', tabIndex)
						 .data('tabId', tabId)
						 .data('dead', isDead)
						 .on('click', () => {setSelectedString(tabIndex);
											 $('#search_input').focus();})
						 .on('dblclick', e => activateTab())
						 .addClass(isDead ? "dead" : "alive");
				 }
				)
	);
	// Highlight the selected tab
	setSelectedString(tabIndex);
}

function tabsFilter(query) {
	const patterns = query.toLowerCase().split(" ");
	return tab => patterns.every(
		pattern => (tab.url || '').toLowerCase().indexOf(pattern) !== -1
			|| (tab.title || '').toLowerCase().indexOf(pattern) !== -1);
}

async function beginSetTabKeyword() {
	isSettingKeyword = true;
	const tabs = await browser.tabs.query({active: true, currentWindow: true});
	const keyword = await browser.sessions.getTabValue(tabs[0].id, "keyword");
	$("#tabs_table__container").hide();
	$("#keyword_label").show();
	$("#search_input").attr("aria-labelledby", "keyword_label")
		// If there's an existing keyword, let the user see/edit it.
		.val(keyword)
		// Select it so the user can simply type over it to enter a new one.
		.select();
}

async function setTabKeyword() {
	const tabs = await browser.tabs.query({active: true, currentWindow: true});
	let keyword = $('#search_input').val();
	await browser.sessions.setTabValue(tabs[0].id, "keyword", keyword);
	closeSwitcher();
}

function closeSwitcher(){
	window.close();
}


/** 
 * After opening with Ctrl+Space press Space again while Ctrl is still
 * held to move selection down the list, and releasing makes the switch
*/
function enableQuickSwitch() {
	const States = {
		pending: 0,
		enabled: 1,
		disabled: 2,
	};

	let state = States.pending;

	$(window).on('keydown', event => {
		const key = event.originalEvent.key;

		if (key === ' ' && state !== States.disabled && event.ctrlKey) {
			state = States.enabled;
			const stringToSelect = event.shiftKey
				? getNextPageUpIndex(1)
				: getNextPageDownIndex(1)
			;
			setSelectedString(stringToSelect);
			event.preventDefault();
		}
		if (key === 'Control') {
			state = States.disabled;
		}
	});

	$(window).on('keyup', event => {
		const key = event.originalEvent.key;

		if (key === 'Control') {
			if (state === States.enabled) {
				activateTab();
			} else {
				state = States.disable;
			}
		}
	});
}

function setSelectedString(index) {
	const table = $('#tabs_table tbody');

	const selector = String.raw`tr:nth-child(${index+1})`;
	const newSelected = table.find(selector);
	if (!newSelected.length || index < 0) {
		return;
	}

	if (selectedString) {
		selectedString.removeClass('tabs_table__selected');
	}

	newSelected.addClass('tabs_table__selected');

	selectedString = newSelected;
	scrollToSelection();
}

function scrollToSelection() {
	if (!selectedString) {
		return;
	}
	const scrollPadding = 20;
	const tableContainer = $('#tabs_table__container');
	const stringOffset = selectedString[0].offsetTop;
	const scrollMax = stringOffset - scrollPadding;
	const scrollMin = stringOffset
		  + selectedString.height() - tableContainer.height() + scrollPadding;
	if (scrollMax < scrollMin) {
		// Resetting scroll since there is no enough space
		tableContainer.scrollTop(0);
		if (tableContainer.height() < selectedString.height()){
			// Fixes a bug where the table is not yet populated for some reason
			// and so scrolling fails
			setTimeout(scrollToSelection, 0);
		}
		return;
	}

	const scrollValue = Math.max(0, scrollMin,
		Math.min(scrollMax, tableContainer.scrollTop()));
	tableContainer.scrollTop(scrollValue);
}

/** 
 * Returns an index of the next tab in the list, if we go pageSize _up_ the list. 
 * If we are already at the top, then the next index is the index of the last (bottom) tab.
 */
function getNextPageUpIndex(pageSize) {
	const currentSelectedIndex = getSelectedTabIndex();
	if (currentSelectedIndex === 0) {
		return getTableSize() - 1;
	} else {
		return Math.max(currentSelectedIndex - pageSize, 0);
	}
}

/** 
 * Returns an index of the next tab in the list, if we go pageSize _down_ the list. 
 * If we are already at the bottom, then the next index is the index of the first (top) tab.
 */
function getNextPageDownIndex(pageSize) {
	const currentSelectedIndex = getSelectedTabIndex();
	const lastElementIndex = getTableSize() - 1;
	if (currentSelectedIndex === lastElementIndex) {
		return 0;
	} else {
		return Math.min(currentSelectedIndex + pageSize, lastElementIndex)
	}
}

function getTableSize() {
	return $('#tabs_table tbody tr').length;
}

async function activateTab() {
	if (!selectedString) {
		return;
	}

	const tabId = getSelectedTabId();
	if (isSelectedTabDead()){
		// restore tab
		await browser.sessions.restore(tabId);
		closeSwitcher();
	}

	{
		const tab = await browser.tabs.get(tabId);
		// Switch to the target tab
		await browser.tabs.update(tabId, {active: true});

		// Check if we should focus other browser window
		const currentWin = await browser.windows.getCurrent();
		if (currentWin.id !== tab.windowId) {
			// Focus on the browser window containing the tab
			await browser.windows.update(tab.windowId, {focused: true});

			// Popup will close itself on window switch.
			// And if we call window.close() here
			// origin browser window will become foreground again.
		} else {
			// Close the tab switcher pop up
			closeSwitcher();
		}
	}
}

async function closeTab() {
	if (!selectedString || isSelectedTabDead() || isSelectedTabActive()) {
		return;
	}

	const tabIndex = getSelectedTabIndex();
	if (preventClosingCurrent && tabIndex == activeTabIndex)
		return;

	// Close the selected tab
	const tabId = getSelectedTabId();
	await browser.tabs.remove(tabId);

	// Reload tabs, using the current query
	const query = $('#search_input').val();
	await reloadTabs(query);
	
	// Ensure the extension popup remains focused after potential tab switch
	window.focus();
}


/**
 * Returns the index of the currently selected tab, or `undefined` if none is selected.
 */
function getSelectedTabIndex() {
	return selectedString ? selectedString.data('index') : undefined;
}

/** 
 * Returns the browser identifier of the currently selected tab,
 * or `undefined` if none is selected.
 */
function getSelectedTabId() {
	return selectedString ? selectedString.data('tabId') : undefined;
}

function isSelectedTabDead() {
	return selectedString ? selectedString.data('dead') : undefined;
}


function isSelectedTabActive() {
	return selectedString ? selectedString.data('active') : undefined;
}


async function main(){
	reloadTabs(null, true);

	$('#search_input')
		.focus()
		.on('input', event => {
			if (isSettingKeyword) {
				return;
			}
			if (event.target.value == "=") {
				beginSetTabKeyword();
			} else {
				updateVisibleTabs(event.target.value, false);
			}
		});
}

document.addEventListener("DOMContentLoaded", main);

// Seems to fix bug when popup loses focus but stays open
window.addEventListener("blur", closeSwitcher);

$(window).on('keydown', event => {
	const key = event.originalEvent.key;

	if ((key === 'ArrowDown') ||
		(event.ctrlKey && key === 'n'))
	{
		setSelectedString(getNextPageDownIndex(1));
		event.preventDefault();
	} else if ((key === 'ArrowUp') ||
			   (event.ctrlKey && key === 'p'))
	{
		setSelectedString(getNextPageUpIndex(1));
		event.preventDefault();
	} else if (key === 'PageDown') {
		setSelectedString(getNextPageDownIndex(13));
		event.preventDefault();
	} else if (key === 'PageUp') {
		setSelectedString(getNextPageUpIndex(13));
		event.preventDefault();
	} else if (key === 'Escape') {
		closeSwitcher();
	} else if (key === 'Enter') {
		if (isSettingKeyword) {
			setTabKeyword();
		} else {
			activateTab();
		}
	} else if (event.ctrlKey && key === 'Delete') {
		closeTab();
		event.preventDefault();
	} else if (event.altKey && key === 'r') {
		doSort = !doSort;
		reloadTabs();
	}
});
