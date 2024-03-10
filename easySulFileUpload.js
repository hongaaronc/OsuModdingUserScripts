// ==UserScript==
// @name         osu! Beatmap Discussion File Upload
// @namespace    http://tampermonkey.net/
// @version      2024-03-01
// @description  Allow easy adding of images to discussions page. Paste or drag+drop a file into the new post box. Auto-embeds images. Will replace any highlighted text with a markdown link. Also works with multiple-file uploads.
// @author       Nostril
// @match        https://osu.ppy.sh/beatmapsets/*/discussion*
// @run-at       document-body
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(function() {
    'use strict';
    // ------------------------------------------------------------------------- SET UP INSTRUCTIONS ------------------------------------------------------------------------
    // 1. If you don't have one already, register for an account at https://s-ul.eu and log in
    // 2. Download and install the TamperMonkey extension
    //     - For Chrome users, I'd recommend downloading it from the Chrome Web Store: https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo
    //     - For other browsers, download here: https://www.tampermonkey.net/
    // 3. Click on the TamperMonkey extension icon -> "Create a new script..."
    // 4. Select this ENTIRE script (Ctrl+A), then paste it in
    // 5. Press Ctrl+S to save the script.
    // 6. Relaunch Chrome, then go to an osu! Beatmap Discussion page to try it out, you should now be able to use these features.
    // 7. If the script asks for permission to access cross-origin resources, press "Always allow domain"
    // 8. (Optional) You may want to set your API key manually if for example, you want to use a different s-ul account from the one that you are currently logged into
    //     - Find your API key at: https://s-ul.eu/account/preferences, then paste it in the field below (between the quotation marks)
    const api_key = "";
    // 9. If you encounter any issues with this script, feel free to reach out to Nostril on osu! DMs (https://osu.ppy.sh/users/11479122)

    // Global Vars/Constants
    const embeddableFileTypes = ["image/gif", "image/jpeg", "image/png"];
    let registeredDropAreas = new Array();

    // Your code here...

    // Create an observer which detects changes to the DOM, and sets up any Post/Reply boxes as they are loaded in
    const observer = new MutationObserver(mutations => {
        let mainDropArea = document.body.getElementsByClassName("beatmap-discussion-new")?.[0];
        let mainPostArea = document.getElementById("new")?.getElementsByTagName("textarea")?.[0];
        setUpElement(mainDropArea, mainPostArea);

        let replyPostAreas = document.body.getElementsByClassName("beatmap-discussion-post__message--editor");
        for(let replyPostArea of replyPostAreas) {
            let replyDropArea = replyPostArea.parentElement.parentElement.parentElement;
            setUpElement(replyDropArea, replyPostArea);
        }
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    function setUpElement(targetDropArea, targetPostArea) {
        if (getRegisteredDropArea(targetDropArea) != undefined) {
            return;
        }
        registeredDropAreas.push({ targetDropArea: targetDropArea, enterCount: 0 });
        targetDropArea.addEventListener("dragenter", onDragEnter);
        targetDropArea.addEventListener("dragleave", onDragLeave);
        targetDropArea.addEventListener("dragexit", onDragExit);
        targetDropArea.addEventListener("drop", (event) => { onDrop(targetDropArea, targetPostArea, event) });
        targetDropArea.addEventListener("paste", (event) => { onPaste(targetDropArea, targetPostArea, event) });
        targetDropArea.style.transition = "0.35s ease-in-out";
    }

    function getRegisteredDropArea(targetDropArea) {
        return registeredDropAreas.find((element) => element.targetDropArea === targetDropArea);
    }

    // Prevent drag + drop from opening the file in browser
    window.addEventListener('dragover', onDragOver);
    function onDragOver(e) {
        e.stopPropagation();
        e.preventDefault();
    }

    function onDragEnter(e) {
        getRegisteredDropArea(this).enterCount++;

        updateOverlay(this, "show");

        e.stopPropagation();
        e.preventDefault();
    }
    function onDragLeave(e) {
        var dropArea = getRegisteredDropArea(this);
        dropArea.enterCount--;

        if (dropArea.enterCount <= 0) {
            updateOverlay(this, "hide");
        }

        e.stopPropagation();
        e.preventDefault();
    }
    function onDragExit(e) {
        getRegisteredDropArea(this).enterCount = 0;

        updateOverlay(this, "hide");

        e.stopPropagation();
        e.preventDefault();
    }

    function updateOverlay(target, state) {
        if (state == "show") {
            target.style.transform = "scale(0.95)";
            target.style.filter = "brightness(0.8)";
            target.style.boxShadow = "0 0 32px 0px rgba(100,190,255,1)";
        } else if (state == "hide") {
            target.style.transform = "scale(1)";
            target.style.filter = "brightness(1)";
            target.style.boxShadow = "none";
        } else if (state == "uploading") {
            target.style.transform = "scale(0.95)";
            target.style.filter = "brightness(0.8)";
            target.style.boxShadow = "0 0 64px 4px rgba(255,230,100,1)";
        } else if (state == "uploaded") {
            target.style.transform = "scale(0.95)";
            target.style.filter = "brightness(0.8)";
            target.style.boxShadow = "0 0 128px 4px rgba(140,255,100,1)";

            setTimeout(function() { updateOverlay(target, "hide") }, 350);
        } else if (state == "errored") {
            target.style.transform = "scale(0.95)";
            target.style.filter = "brightness(0.8)";
            target.style.boxShadow = "0 0 128px 4px rgba(255,0,100,1)";

            setTimeout(function() { updateOverlay(target, "hide") }, 350);
        }
    }

    // Handle file drop
    function onDrop(targetDropArea, targetPostArea, e) {
        let files = e.dataTransfer.files;

        uploadFiles(targetDropArea, targetPostArea, files, false);

        if (files.length > 0) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    // Handle file paste
    function onPaste(targetDropArea, targetPostArea, e) {
        let clipboardData, pastedText, pastedFile;
        clipboardData = e.clipboardData || window.clipboardData;

        let files = clipboardData.files;

        uploadFiles(targetDropArea, targetPostArea, files, true);

        if (files.length > 0) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    function uploadFiles(targetDropArea, targetPostArea, files, isClipboard) {
        if (files.length == 0) {
            return;
        }

        let useMultipleInlineLinks = false;
        let wasTextSelected = isTextSelected();

        if (files.length > 1 && wasTextSelected) {
            useMultipleInlineLinks = true;
            insertTextAtSelection(targetPostArea, getSelectionText() + ' ');
        }

        let linkText = wasTextSelected ? getSelectionText() : null;

        updateOverlay(targetDropArea, "uploading");

        let filesFinished = 0;
        let filesInProgress = files.length;
        let errored = false;

        for(let i = 0; i < files.length; i++) {
            let file = files[i];

            let fileName = file.name;
            if (isClipboard) {
                fileName = getClipboardFileName(file);
            }

            uploadFile(file, fileName,
            // eslint-disable-next-line
            function(downloadUrl) {
                filesFinished++;
                filesInProgress--;

                let pasteText = "";
                if (useMultipleInlineLinks) {
                    linkText = "[" + filesFinished.toString() + "]";
                }
                if (embeddableFileTypes.includes(file.type)) {
                    if (wasTextSelected) {
                        pasteText = convertToMarkdownLink(linkText, fileName, downloadUrl);
                    } else {
                        pasteText = convertToMarkdownEmbed(linkText, fileName, downloadUrl);
                    }
                } else {
                    pasteText = convertToMarkdownLink(linkText, fileName, downloadUrl);
                }
                insertTextAtSelection(targetPostArea, pasteText);

                if (filesInProgress == 0) {
                    if (!errored) {
                        updateOverlay(targetDropArea, "uploaded");
                    }
                } else {
                    // Add new lines between files if multiple were uploaded
                    if (!useMultipleInlineLinks) {
                        insertTextAtSelection(targetPostArea, '\n');
                    }
                }
                // eslint-disable-next-line
            }, function() {
                errored = true;
                updateOverlay(targetDropArea, "errored");
            });
		}
    }

    async function uploadFile(file, fileName, finishCallback = null, errorCallback = null) {
        let params = new FormData();
        params.append("wizard", true);
        if (api_key != "") {
            params.append("key", api_key);
        }
        params.append("file", file, fileName);

        GM.xmlHttpRequest({
            method: "POST",
            url: "https://s-ul.eu/api/v1/upload",
            data: file,
            responseType: "json",
            headers: {
                "content-type": file.type,
                "x-name": encodeURIComponent(fileName),
                "x-size": file.size,
                "x-type": file.type,
            },
            upload: {
                onprogress: function(response) {
                    let progress = response.loaded / response.total * 100;
                    console.log("Upload progress: " + progress);
                }
            },
            onload: function(response) {
                let downloadUrl = response.response.url;
                if (downloadUrl != undefined) {
                    finishCallback(response.response.url)
                } else {
                    errorCallback(response);
                }
            },
            onerror: function(response) { errorCallback(response) },
            ontimeout: function(response) { errorCallback(response) },
            onabort: function(response) { errorCallback(response) }
        });
    }

    function getClipboardFileName(file) {
        const date = file.lastModifiedDate;

        let day = date.getDate();
        if(day < 10) { day = "0" + day; }

        let month = date.getMonth() + 1;
        if(month < 10) { month = "0" + String(month); }

        const year = date.getFullYear() + "";

        let hours = date.getHours();
        if(hours < 10) { hours = "0" + String(hours); }

        let minutes = date.getMinutes();
        if(minutes < 10) { minutes = "0" + String(minutes); }

        let seconds = date.getSeconds();
        if(seconds < 10) { seconds = "0" + String(seconds); }

        const dtsString = String(year) + String(month) + String(day) + "_" + String(hours) + String(minutes) + String(seconds);

        let extension = file.name.split('.').pop();

        return "Clipboard_" + dtsString + '.' + extension;
    }

    function convertToMarkdownEmbed(linkText, altText, url) {
        return "![" + (linkText != null ? linkText : altText) + "](" + url + ")";
    }

    function convertToMarkdownLink(linkText, altText, url) {
        return "[" + (linkText != null ? linkText : altText) + "](" + url + ")";
    }

    function isTextSelected() {
        return getSelectionText() != "";
    }

    function getSelectionText() {
        if (window.getSelection) {
            return window.getSelection().toString();
        } else if (document.selection && document.selection.type != "Control") {
            return document.selection.createRange().text;
        }
        return "";
    }

    function insertTextAtSelection(target, text) {
        let startPosition = target.selectionStart;
        let endPosition = target.selectionEnd;

        let before = target.value.substring(0, startPosition);
        let after = target.value.substring(endPosition, target.value.length);

        let newText = before + text + after;

        let previousValue = target.value; // Store previous value for tracking
        target.value = newText; // Update value of the TextArea

        // Need to track the value change to create an inputEvent
        let tracker = target._valueTracker;
        if (tracker) {
            tracker.setValue(previousValue);
        }

        //Create an input event so that it's as if a user typed it, so that the TextArea recognizes the change and calls appropriate listeners
        let inputEvent = new Event('input', { bubbles: true });
        inputEvent.simulated = true;
        target.dispatchEvent(inputEvent);

        target.selectionStart = target.selectionEnd = startPosition + text.length;
    }
})();
