// ==UserScript==
// @name         SudokuPad Export PNG
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Export the SudokuPad board as a high resolution PNG
// @author       AaronH
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    //const OUTPUT_SIZE = 4096;
    const OUTPUT_SIZE = 8192;

    Framework.getApp().then(() => {

	const icon = `
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
	    <path d="M96 128C96 110.3 110.3 96 128 96H512C529.7 96 544 110.3 544 128V512C544 529.7 529.7 544 512 544H128C110.3 544 96 529.7 96 512V128ZM160 192V448H480V192H160ZM224 384L288 304L352 368L400 304L480 416H160L224 384ZM224 256C224 238.3 238.3 224 256 224C273.7 224 288 238.3 288 256C288 273.7 273.7 288 256 288C238.3 288 224 273.7 224 256Z"/>
	</svg>`;

        Framework.addAuxButton({
            name: "exportpng",
            title: "Export PNG",
            content: icon,
            onClick: exportPNG
        });

    });

    async function exportPNG() {

        const svg = document.getElementById("svgrenderer");

        if (!svg) {
            alert("Couldn't find the Sudoku SVG.");
            return;
        }

        const clone = svg.cloneNode(true);

        copyStyles(svg, clone);

        await embedExternalImages(clone);

        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", OUTPUT_SIZE);
        clone.setAttribute("height", OUTPUT_SIZE);

        const xml =
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            new XMLSerializer().serializeToString(clone);

        const blob = new Blob([xml], {
            type: "image/svg+xml;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);

        const img = new Image();

        img.onload = () => {

            const canvas = document.createElement("canvas");
            canvas.width = OUTPUT_SIZE;
            canvas.height = OUTPUT_SIZE;

            const ctx = canvas.getContext("2d");

            ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
            ctx.drawImage(img, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

            URL.revokeObjectURL(url);

            canvas.toBlob(blob => {

                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                const title =
		    document.querySelector(".puzzle-title")?.textContent?.trim() ||
		    "SudokuPad";

		const filename = title
		    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
		    .replace(/\s+/g, " ")
		    .trim();

		link.download = `${filename}.png`;
                link.click();

                setTimeout(() => URL.revokeObjectURL(link.href), 1000);

            }, "image/png");

        };

        img.onerror = e => {
            URL.revokeObjectURL(url);
            console.error(e);
            alert("Failed to render exported SVG.");
        };

        img.src = url;
    }

    async function embedExternalImages(svg) {

        const images = [...svg.querySelectorAll("image")];

        for (const img of images) {

            let href =
                img.getAttribute("href") ||
                img.getAttributeNS("http://www.w3.org/1999/xlink", "href");

            if (!href)
                continue;

            try {

                const url = new URL(href, window.location.origin);

                const response = await fetch(url);

                if (!response.ok)
                    continue;

                const text = await response.text();

                const dataUri =
                    "data:image/svg+xml;base64," +
                    btoa(unescape(encodeURIComponent(text)));

                img.setAttribute("href", dataUri);

            } catch (e) {
                console.warn("Unable to embed image:", href, e);
            }
        }
    }

    function copyStyles(sourceRoot, cloneRoot) {

        const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
        const cloneNodes = [cloneRoot, ...cloneRoot.querySelectorAll("*")];

        sourceNodes.forEach((source, index) => {

            const clone = cloneNodes[index];

            if (!clone)
                return;

            const style = getComputedStyle(source);

            for (const property of style) {
                clone.style.setProperty(
                    property,
                    style.getPropertyValue(property),
                    style.getPropertyPriority(property)
                );
            }

        });

    }

})();
