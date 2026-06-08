// Before running this live test, build a local Stagehand alias manifest and
// regenerate the TypeScript client:
//
//   pnpm --dir ../stagehand-server exec node src/protocol/generate_modcdp_alias_manifest.mjs ../modcdp2/testdata/codegen/stagehand_alias_manifest.json
//   pnpm run build:ts
//   pnpm run test:e2e:ts
//
// The manifest is intentionally untracked; do not commit it.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { type Page, StagehandClient } from "./stagehand_client_gen.js";

const CHALLENGE_URL = "https://pirate.github.io/stress-tests/challenge.html";

test("generated Stagehand client solves challenge suite", async () => {
  const client = new StagehandClient();
  await client.connect();
  try {
    let page = await client.browser.new_page({ url: "about:blank" });
    page = await page.goto({ url: CHALLENGE_URL, waitUntil: "load" });
    await page.wait_for_expression({
      expression: "document.querySelectorAll('.task').length === 45",
      timeout_ms: 20_000,
    });

    const fixtureFile = fileURLToPath(import.meta.url);

    const challenges: [string, (page: Page) => Promise<void>][] = [
      [
        "simple-button",
        async (page) => {
          const button = await page.locate({ locator: { css: "#start-button" } });
          await button.click();
        },
      ],
      [
        "radio-selection",
        async (page) => {
          await page.click({ locator: { css: `input[name="entity"][value="dont-choose-this-one"]` } });
        },
      ],
      [
        "checkbox-check",
        async (page) => {
          await page.click({ locator: { css: "input.challenge-checkbox", idx: 0 } });
          await page.click({ locator: { css: "input.challenge-checkbox", idx: 1 } });
          const first = await page.locate({ locator: { css: "input.challenge-checkbox" } });
          const third = await first.nth({ index: 2 });
          await third.click();
        },
      ],
      [
        "search-squash",
        async (page) => {
          const locator = { css: "#search-input" };
          await page.fill({ locator, value: "squash" });
          await page.key_press({ locator, key: "Enter" });
        },
      ],
      [
        "date-time-input",
        async (page) => {
          const now = new Date();
          await page.fill({ locator: { css: "#date-picker" }, value: now.toISOString().slice(0, 10) });
          await page.fill({
            locator: { css: "#time-picker" },
            value: `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
          });
        },
      ],
      [
        "copy-text",
        async (page) => {
          await page.fill({ locator: { css: "#copy-input" }, value: "abc" });
        },
      ],
      [
        "slider-drag",
        async (page) => {
          await page.click({ locator: { css: "#range-slider" }, offsetX: 295, offsetY: 8 });
        },
      ],
      [
        "hover-element",
        async (page) => {
          await page.hover({ locator: { css: "#hover-target" } });
          await page.wait_for_timeout({ ms: 1100 });
        },
      ],
      [
        "drag-drop",
        async (page) => {
          await page.drag_and_drop({ start: { css: "#drag-element" }, end: { css: "#drop-target" } });
        },
      ],
      [
        "file-drop",
        async (page) => {
          await page.drop_files({ files: [fixtureFile], locator: { css: "#file-drop-area" } });
        },
      ],
      [
        "multi-select",
        async (page) => {
          await page.select_option({
            locator: { css: "#multi-select-element" },
            values: ["option1", "option2", "option3"],
          });
        },
      ],
      [
        "canvas-captcha",
        async (page) => {
          await page.fill({ locator: { css: "#canvas-text-input" }, value: "CAPTCHA123" });
        },
      ],
      [
        "iframe-slider",
        async (page) => {
          await page.click({ locator: { css: "#iframe-slider", idx: 2 }, offsetX: 295, offsetY: 8 });
          await page.click({ locator: { css: "#iframe-slider-popover-button" } });
        },
      ],
      [
        "oopif-form-submit",
        async (page) => {
          await page.wait_for_locator({ locator: { css: "#first-name" }, timeout_ms: 20_000 });
          await page.fill({ locator: { css: "#first-name" }, value: "Ada" });
          await page.fill({ locator: { css: "#last-name" }, value: "Lovelace" });
          await page.fill({ locator: { css: "#email" }, value: "ada@example.com" });
          await page.click({ locator: { css: "#contact-form button[type='submit']" } });
        },
      ],
      [
        "oopif-open-shadow-button",
        async (page) => {
          await page.click({
            locator: {
              xpath: "/html[1]/body[1]/div[2]/div[15]/iframe[1]/html[1]/body[1]/shadow-demo[1]//div[1]/button[1]",
            },
          });
          await page.click({ locator: { css: "#oopif-open-shadow-confirm" } });
        },
      ],
      [
        "oopif-closed-shadow-button",
        async (page) => {
          await page.click({
            locator: {
              xpath: "/html[1]/body[1]/div[2]/div[16]/iframe[1]/html[1]/body[1]/shadow-demo[1]//div[1]/button[1]",
            },
          });
          await page.click({ locator: { css: "#oopif-closed-shadow-confirm" } });
        },
      ],
      [
        "shadow-dom-dblclick",
        async (page) => {
          await page.double_click({ locator: { text: "Double-click me" } });
        },
      ],
      [
        "right-click-component",
        async (page) => {
          const locator = await page.locate({ locator: { text: "Right-click me" } });
          await locator.click({ button: "secondary" });
        },
      ],
      [
        "scroll-accept",
        async (page) => {
          await page.scroll({ locator: { css: "#scroll-container" }, percent: 100 });
          await page.click({ locator: { css: "#accept-button" } });
        },
      ],
      [
        "draw-circle",
        async (page) => {
          await page.click({ locator: { css: "#draw-canvas" }, offsetX: 150, offsetY: 150 });
          await page.scroll({ deltaY: 320 });
          const canvas = await page.locate({ locator: { css: "#draw-canvas" } });
          assert.ok(canvas.coordinates?.left != null, "canvas locator is missing left coordinate");
          assert.ok(canvas.coordinates.top != null, "canvas locator is missing top coordinate");
          const left = canvas.coordinates.left;
          const top = canvas.coordinates.top;
          for (let i = 0; i < 24; i++) {
            const angle = (Math.PI * 2 * i) / 24;
            await page.hover({
              locator: { coordinates: { x: left + 150 + Math.cos(angle) * 100, y: top + 150 + Math.sin(angle) * 100 } },
            });
          }
        },
      ],
      [
        "cancel-dialog",
        async (page) => {
          await page.click({ dialog: { accept: false }, locator: { css: "#confirm-button" } });
        },
      ],
      [
        "geolocation-permission",
        async (page) => {
          await page.set_geolocation({
            accuracy: 25,
            latitude: 37.7749,
            longitude: -122.4194,
            origin: "https://pirate.github.io",
          });
          await page.click({ locator: { css: "#request-location-button" } });
        },
      ],
      [
        "arrow-key-presses",
        async (page) => {
          const locator = { css: "#key-press-area" };
          await page.click({ locator });
          await page.key_press({ key: "ArrowRight", repeat: 3, locator });
        },
      ],
      [
        "alert-secret",
        async (page) => {
          const result = await page.click({ dialog: { accept: true }, locator: { css: "#secret-alert-button" } });
          assert.match(result.message ?? "", /avocado/);
          await page.fill({ locator: { css: "#secret-word-input" }, value: "avocado" });
        },
      ],
      [
        "press-hold-button",
        async (page) => {
          await page.click_and_hold({ durationMs: 800, locator: { css: "#hold-button" } });
        },
      ],
      [
        "tooltip-secret",
        async (page) => {
          await page.hover({ locator: { css: "#tooltip-element" } });
          await page.fill({ locator: { css: "#tooltip-secret-input" }, value: "octopus" });
        },
      ],
      [
        "resize-textarea",
        async (page) => {
          const textarea = await page.locate({ locator: { css: "#resizable-textarea" } });
          assert.ok(textarea.coordinates?.right != null, "textarea locator is missing right coordinate");
          assert.ok(textarea.coordinates.bottom != null, "textarea locator is missing bottom coordinate");
          const right = textarea.coordinates.right;
          const bottom = textarea.coordinates.bottom;
          await page.drag_and_drop({
            start: { coordinates: { x: right - 2, y: bottom - 2 } },
            end: { coordinates: { x: right + 160, y: bottom + 90 } },
          });
          await page.fill({ locator: { css: "#resize-secret-input" }, value: "giraffe" });
        },
      ],
      [
        "file-upload",
        async (page) => {
          await page.set_input_files({ files: [fixtureFile], locator: { css: "#file-upload-input" } });
        },
      ],
      [
        "phone-input",
        async (page) => {
          const locator = { css: "#phone-input-field" };
          await page.click({ locator });
          await page.key_press({ locator, key: "Backspace" });
          await page.key_press({ method: "type", locator, value: "555-1234" });
        },
      ],
      [
        "expand-details",
        async (page) => {
          const locator = await page.locate({ locator: { css: "#details-element summary" } });
          await locator.click();
        },
      ],
      [
        "drag-square-to-circle",
        async (page) => {
          await page.click({ locator: { css: "#drag-canvas" }, offsetX: 175, offsetY: 125 });
          await page.scroll({ deltaY: 220 });
          const canvas = await page.locate({ locator: { css: "#drag-canvas" } });
          assert.ok(canvas.coordinates?.left != null, "drag canvas locator is missing left coordinate");
          assert.ok(canvas.coordinates.top != null, "drag canvas locator is missing top coordinate");
          const left = canvas.coordinates.left;
          const top = canvas.coordinates.top;
          await page.drag_and_drop({
            start: { coordinates: { x: left + 75, y: top + 125 } },
            end: { coordinates: { x: left + 250, y: top + 125 } },
          });
        },
      ],
      [
        "audio-transcription",
        async (page) => {
          await page.fill({ locator: { css: "#transcription-input" }, value: "everything" });
        },
      ],
      [
        "dropdown-selections",
        async (page) => {
          await page.select_option({ locator: { css: "#color-select" }, values: ["red"] });
          await page.select_option({ locator: { css: "#object-select" }, values: ["ball"] });
        },
      ],
      [
        "contenteditable-div",
        async (page) => {
          const locator = { css: "#editable-content" };
          await page.click({ locator });
          await page.key_press({ method: "type", locator, value: "banana" });
        },
      ],
      [
        "nested-tiny-button",
        async (page) => {
          await page.click({
            dialog: { accept: true },
            expect_timeout_ms: 20_000,
            locator: { css: "#deep-tiny-button" },
          });
        },
      ],
      [
        "wrapped-word-click",
        async (page) => {
          await page.hover({ locator: { css: "#wrapped-word-paragraph" } });
          const pointResult = await page.evaluate({
            expression: `(() => {
          const paragraph = document.getElementById("wrapped-word-paragraph");
          if (!(paragraph?.firstChild instanceof Text)) throw new Error("wrapped word paragraph text is missing");
          const paragraphRect = paragraph.getBoundingClientRect();
          const start = paragraph.textContent.indexOf("ox");
          const range = document.createRange();
          range.setStart(paragraph.firstChild, start);
          range.setEnd(paragraph.firstChild, start + 2);
          const rect = Array.from(range.getClientRects()).at(-1);
          range.detach();
          if (rect == null) throw new Error("wrapped word range has no visible rect");
          return { x: rect.left + rect.width / 2 - paragraphRect.left, y: rect.top + rect.height / 2 - paragraphRect.top };
        })()`,
          });
          const point = pointResult.value as { x?: unknown; y?: unknown };
          const x = point.x;
          const y = point.y;
          if (typeof x !== "number" || typeof y !== "number")
            throw new Error("wrapped word point is missing numeric coordinates");
          await page.click({ locator: { css: "#wrapped-word-paragraph" }, offsetX: x, offsetY: y });
        },
      ],
      [
        "long-link-maze",
        async (page) => {
          await page.click({ locator: { text: "TARGET-LINK::orion-needle-1847" } });
        },
      ],
      [
        "wall-secret-word",
        async (page) => {
          await page.fill({ locator: { css: "#wall-secret-input" }, value: "cobaltglass" });
        },
      ],
      [
        "closed-shadow-aria-word",
        async (page) => {
          await page.fill({ locator: { css: "#closed-shadow-aria-input" }, value: "violetcircuit" });
        },
      ],
      [
        "dynamic-frame-ordinal-trap",
        async (page) => {
          await page.click({ locator: { css: "#frame-trap-start" } });
          await page.wait_for_locator({ locator: { css: "#frame-trap-create-third" }, timeout_ms: 10_000 });
          await page.click({ locator: { css: "#frame-trap-create-third" } });
          await page.wait_for_locator({ locator: { css: "#frame-trap-insert-final" }, timeout_ms: 10_000 });
          await page.click({ locator: { css: "#frame-trap-insert-final" } });
          await page.wait_for_locator({ locator: { css: "#frame-trap-final-button" }, timeout_ms: 10_000 });
          await page.click({ locator: { css: "#frame-trap-final-button" } });
        },
      ],
      [
        "rotated-transform-click",
        async (page) => {
          await page.hover({ locator: { css: "#rotated-transform-button" } });
          const pointResult = await page.evaluate({
            expression: `(() => {
          const button = document.getElementById("rotated-transform-button");
          if (button == null) throw new Error("rotated transform button is missing");
          const rect = button.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`,
          });
          const point = pointResult.value as { x?: unknown; y?: unknown };
          const x = point.x;
          const y = point.y;
          if (typeof x !== "number" || typeof y !== "number")
            throw new Error("rotated transform point is missing numeric coordinates");
          await page.click({ locator: { coordinates: { x, y } } });
        },
      ],
      [
        "transparent-overlay-button",
        async (page) => {
          const locator = await page.locate({ locator: { css: "#transparent-overlay-target" } });
          await locator.click();
        },
      ],
      [
        "realistic-input-sequence",
        async (page) => {
          await page.scroll({ locator: { css: "#realistic-scroll-panel" }, deltaY: 450 });
          await page.scroll({ locator: { css: "#realistic-scroll-panel" }, deltaY: 450 });
          const locator = { css: "#realistic-type-input" };
          await page.click({ locator });
          for (const key of ["o", "r", "c", "h", "i", "d"]) await page.key_press({ locator, key });
          await page.click({ locator: { css: "#realistic-submit-button" } });
        },
      ],
      [
        "css-transform-text",
        async (page) => {
          await page.fill({ locator: { css: "#css-transform-text-input" }, value: "skyline" });
        },
      ],
      [
        "google-docs",
        async (page) => {
          const locator = { css: "#google-docs-answer-input" };
          await page.click({ locator });
          await page.key_press({ method: "type", locator, value: "snooker" });
        },
      ],
    ];

    for (const [taskId, run] of challenges) {
      await run(page);
      try {
        await page.wait_for_expression({
          expression: `document.getElementById(${JSON.stringify(taskId)})?.classList.contains('completed') === true`,
          timeout_ms: 20_000,
        });
      } catch (error) {
        throw new Error(`${taskId} did not complete`, { cause: error });
      }
    }
    const scoreResult = await page.evaluate({ expression: "document.querySelectorAll('.task.completed').length" });
    assert.equal(typeof scoreResult.value, "number");
    const score = scoreResult.value;
    const countsResult = await page.evaluate({
      expression: `(() => ({ completed: document.querySelectorAll('.task.completed').length, total: document.querySelectorAll('.task').length }))()`,
    });
    const counts = countsResult.value as { completed: number; total: number };
    assert.equal(score, counts.completed);
    assert.equal(counts.total, 45);
    assert.equal(score, 45);
  } finally {
    await client.close();
  }
}, 180_000);
