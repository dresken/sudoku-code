// ==UserScript==
// @name         SudokuPad Image Export
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Export SudokuPad puzzles as high resolution PNG or SVG images
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

    const DEFAULT_OUTPUT_SIZE = 8192;
    const BOARD_VIEWPORT = { x: -8, y: -8, width: 592, height: 592 };
    const SETTINGS_KEY = 'sudokupad-image-export-settings';
    const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M96 128C96 110.3 110.3 96 128 96H512C529.7 96 544 110.3 544 128V512C544 529.7 529.7 544 512 544H128C110.3 544 96 529.7 96 512V128ZM160 192V448H480V192H160ZM224 384L288 304L352 368L400 304L480 416H160L224 384ZM224 256C224 238.3 238.3 224 256 224C273.7 224 288 238.3 288 256C288 273.7 273.7 288 256 288C238.3 288 224 273.7 224 256Z"/></svg>';

    Framework.getApp().then(() => Framework.addAuxButton({
        name: 'imageexport', title: 'SudokuPad Image Export', content: icon, onClick: showDialog
    }));

    function showDialog() {
        const svg = document.getElementById('svgrenderer');
        if (!svg) return alert("Couldn't find the Sudoku SVG.");
        const viewBox = getViewBox(svg), saved = loadSettings();
        const initialViewport = saved.cropMode === 'board' ? BOARD_VIEWPORT :
            saved.cropMode === 'custom' && saved.customViewport ? saved.customViewport : viewBox;

        Framework.showDialog();
        const dialog = document.querySelector('.dialog-overlay .dialog-content, .dialog-content, .dialog-overlay .dialog, .dialog');
        if (!dialog) return alert('Unable to open the export dialog.');
        dialog.innerHTML = `<div class="image-export-dialog" style="min-width:420px;padding:16px;font:inherit;color:inherit">
            <h2 style="margin:0 0 16px">Image Exporter</h2>
            <div style="display:grid;grid-template-columns:92px 1fr;gap:12px 8px;align-items:center">
                <div>Format:</div><div style="display:grid;grid-template-columns:92px 1fr;gap:12px 8px;align-items:center"><label><input type="radio" name="format" value="png"> PNG</label><label style="margin-left:16px"><input type="radio" name="format" value="svg"> SVG</label></div>
                <div>Background:</div><label><input id="image-export-transparent" type="checkbox"> Transparent</label>
                <div>Resolution:</div><div><input id="image-export-resolution" type="number" min="1" step="1" style="width:96px"> px</div>
                <div>Crop:</div><div style="display:grid;grid-template-columns:92px 1fr 1fr;gap:12px 8px 8px;align-items:center"><label><input type="radio" name="crop" value="full">Full</label><label style="margin-left:10px"><input type="radio" name="crop" value="board">Board</label><label style="margin-left:10px"><input type="radio" name="crop" value="custom">Custom</label></div>
                <div style="align-self:start;padding-top:5px">Viewport:</div><div style="display:grid;grid-template-columns:16px 92px 16px 92px;gap:7px 8px;align-items:center">
                    <label for="image-export-x">X</label><input id="image-export-x" type="number" step="any">
                    <label for="image-export-y">Y</label><input id="image-export-y" type="number" step="any">
                    <label for="image-export-width">W</label><input id="image-export-width" type="number" min="1" step="any">
                    <label for="image-export-height">H</label><input id="image-export-height" type="number" min="1" step="any">
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" data-action="download">Download</button><button type="button" data-action="clipboard">Clipboard</button></div>
        </div>`;
        const form = dialog.querySelector('.image-export-dialog');
        form.querySelector(`[name=format][value="${saved.format}"]`).checked = true;
        form.querySelector('#image-export-transparent').checked = saved.transparent;
        form.querySelector('#image-export-resolution').value = saved.resolution;
        form.querySelector(`[name=crop][value="${saved.cropMode}"]`).checked = true;
        setViewportFields(form, initialViewport); updateDialogState(form);
        form.addEventListener('change', event => {
            if (event.target.name === 'crop') {
                if (event.target.value === 'full') setViewportFields(form, viewBox);
                if (event.target.value === 'board') setViewportFields(form, BOARD_VIEWPORT);
            }
            updateDialogState(form);
        });
        form.querySelector('[data-action=download]').addEventListener('click', () => runExport(collectOptions(form), 'download'));
        const clipboardButton = form.querySelector('[data-action=clipboard]');
        clipboardButton.addEventListener('click', async () => {
            const originalText = clipboardButton.textContent;
            try {
                await runExport(collectOptions(form), 'clipboard');

                clipboardButton.textContent = 'Copied!';
                clipboardButton.disabled = true;

                setTimeout(() => {
                    clipboardButton.textContent = originalText;
                    clipboardButton.disabled = false;
                }, 10000);
            } catch (_) {
                // runExport already reports errors
            }
        });
    }

    function collectOptions(form) {
        const options = {
            format: form.querySelector('[name=format]:checked').value,
            transparent: form.querySelector('#image-export-transparent').checked,
            resolution: positiveNumber(form.querySelector('#image-export-resolution').value, DEFAULT_OUTPUT_SIZE),
            cropMode: form.querySelector('[name=crop]:checked').value,
            viewport: getViewportFields(form)
        };
        saveSettings(options); return options;
    }

    async function runExport(options, destination) {
        const svg = await buildProcessedSvg(options);

        if (destination === 'download') {
            return options.format === 'png'
                ? downloadPNG(svg, options)
                : downloadSVG(svg);
        }

        return options.format === 'png'
            ? copyPNG(svg, options)
            : copySVG(svg);
    }

    async function buildProcessedSvg(options) {
        const source = document.getElementById('svgrenderer');
        if (!source) throw new Error("Couldn't find the Sudoku SVG.");
        const clone = source.cloneNode(true);
        copyStyles(source, clone); await embedExternalImages(clone);
        const { x, y, width, height } = options.viewport;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
        clone.setAttribute('width', width); clone.setAttribute('height', height);
        if (!options.transparent) {
            const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            background.setAttribute('x', x); background.setAttribute('y', y);
            background.setAttribute('width', width); background.setAttribute('height', height); background.setAttribute('fill', 'white');
            clone.insertBefore(background, clone.firstChild);
        }
        return clone;
    }

    async function downloadPNG(svg, options) { downloadBlob(await pngBlob(svg, options.resolution), `${getFilename()}.png`); }
    function downloadSVG(svg) { downloadBlob(svgBlob(svg), `${getFilename()}.svg`); }
    async function copyPNG(svg, options) {
        if (!navigator.clipboard || !window.ClipboardItem) return alert('Clipboard export is not supported by this browser.');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(svg, options.resolution) })]);
    }
    async function copySVG(svg) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) return alert('Clipboard export is not supported by this browser.');
        await navigator.clipboard.writeText(serializeSvg(svg));
    }

    function pngBlob(svg, outputSize) {
        return new Promise((resolve, reject) => {
            // Keep PNG rasterisation identical to the original exporter: the
            // SVG is rendered at the requested square resolution before it is
            // drawn to the equally sized canvas.
            const rasterSvg = svg.cloneNode(true);
            rasterSvg.setAttribute('width', outputSize); rasterSvg.setAttribute('height', outputSize);
            const url = URL.createObjectURL(svgBlob(rasterSvg)), img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'); canvas.width = outputSize; canvas.height = outputSize;
                const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, outputSize, outputSize); ctx.drawImage(img, 0, 0, outputSize, outputSize);
                URL.revokeObjectURL(url);
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create PNG.')), 'image/png');
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to render exported SVG.')); };
            img.src = url;
        });
    }
    function svgBlob(svg) { return new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' }); }
    function serializeSvg(svg) { return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg); }
    function downloadBlob(blob, filename) {
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    function getFilename() {
        const title = document.querySelector('.puzzle-title')?.textContent?.trim() || 'SudokuPad';
        return title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim() || 'SudokuPad';
    }

    function getViewBox(svg) { const values = (svg.getAttribute('viewBox') || '0 0 576 576').trim().split(/[ ,]+/).map(Number); return { x: values[0], y: values[1], width: values[2], height: values[3] }; }
    function getViewportFields(form) { return { x: Number(form.querySelector('#image-export-x').value), y: Number(form.querySelector('#image-export-y').value), width: positiveNumber(form.querySelector('#image-export-width').value, 1), height: positiveNumber(form.querySelector('#image-export-height').value, 1) }; }
    function setViewportFields(form, viewport) { ['x', 'y', 'width', 'height'].forEach(key => form.querySelector(`#image-export-${key}`).value = viewport[key]); }
    function positiveNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
    function updateDialogState(form) {
        form.querySelector('#image-export-resolution').disabled = form.querySelector('[name=format]:checked').value !== 'png';
        const custom = form.querySelector('[name=crop]:checked').value === 'custom';
        form.querySelectorAll('#image-export-x,#image-export-y,#image-export-width,#image-export-height').forEach(input => input.disabled = !custom);
    }
    function loadSettings() { try { return Object.assign({ format: 'png', transparent: true, resolution: DEFAULT_OUTPUT_SIZE, cropMode: 'full', customViewport: null }, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (_) { return { format: 'png', transparent: true, resolution: DEFAULT_OUTPUT_SIZE, cropMode: 'full', customViewport: null }; } }
    function saveSettings(options) { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ format: options.format, transparent: options.transparent, resolution: options.resolution, cropMode: options.cropMode, customViewport: options.viewport })); }

    async function embedExternalImages(svg) {
        for (const img of [...svg.querySelectorAll('image')]) {
            const href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
            if (!href || href.startsWith('data:')) continue;
            try {
                const response = await fetch(new URL(href, window.location.origin)); if (!response.ok) continue;
                const text = await response.text(); img.setAttribute('href', 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text))));
            } catch (error) { console.warn('Unable to embed image:', href, error); }
        }
    }
    function copyStyles(sourceRoot, cloneRoot) {
        const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll('*')], cloneNodes = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
        sourceNodes.forEach((source, index) => {
            const clone = cloneNodes[index]; if (!clone) return; const style = getComputedStyle(source);
            for (const property of style) clone.style.setProperty(property, style.getPropertyValue(property), style.getPropertyPriority(property));
        });
    }
})();
