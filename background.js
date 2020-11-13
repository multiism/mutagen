const code = `
var script = document.createElement('script');
document.body.appendChild(script);
script.src = (typeof browser !== "undefined" ? browser : chrome).runtime.getURL("mutagen.js");
`;

if (typeof browser !== "undefined" && browser.pageAction) {
	browser.pageAction.onClicked.addListener(() => {
		browser.tabs.executeScript({ code });
	});
} else {
	chrome.pageAction.onClicked.addListener(() => {
		chrome.tabs.executeScript({ code });
	});
	chrome.runtime.onInstalled.addListener(function () {
		chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
			chrome.declarativeContent.onPageChanged.addRules([{
				conditions: [
					new chrome.declarativeContent.PageStateMatcher({
						css: ["textarea"]
					})
				],
				actions: [new chrome.declarativeContent.ShowPageAction()]
			}]);
		});
	});
}
