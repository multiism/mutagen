
if (typeof browser !== "undefined" && browser.pageAction) {
	browser.pageAction.onClicked.addListener(() => {
		browser.tabs.executeScript({
			file: "mutagen.js"
		});
	});
} else {
	chrome.pageAction.onClicked.addListener(() => {
		chrome.tabs.executeScript({
			file: "mutagen.js"
		});
	});
}
