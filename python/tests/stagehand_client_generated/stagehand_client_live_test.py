# Before running this live test, build a local Stagehand alias manifest and
# regenerate the Python client:
#
#   pnpm --dir ../stagehand-server exec node src/protocol/generate_modcdp_alias_manifest.mjs ../modcdp2/testdata/codegen/stagehand_alias_manifest.json
#   pnpm run build:python
#   pnpm run test:e2e:python
#
# The manifest is intentionally untracked; do not commit it.

from __future__ import annotations

import json
import unittest
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from tests.stagehand_client_generated import stagehand_client_gen as sh


CHALLENGE_URL = "https://pirate.github.io/stress-tests/challenge.html"


class GeneratedStagehandClientChallengeSuite(unittest.TestCase):
    def test_generated_stagehand_client_solves_challenge_suite(self) -> None:
        client = sh.StagehandClient()
        client.connect()
        try:
            page = client.browser.new_page(sh.BrowserNewPageParams(url="about:blank"))
            page = page.goto(sh.PageGotoParams(url=CHALLENGE_URL, wait_until="load"))
            page.wait_for_expression(
                sh.PageWaitForExpressionParams(
                    expression="document.querySelectorAll('.task').length === 45",
                    timeout_ms=20_000,
                )
            )

            fixture_file = str(Path(__file__).resolve())

            challenges: list[tuple[str, Callable[[sh.Page], object]]] = [
                (
                    "simple-button",
                    lambda page: page.locate(sh.PageLocateParams(locator=sh.Locator(css="#start-button"))).click(),
                ),
                (
                    "radio-selection",
                    lambda page: page.click(
                        sh.PageClickParams(locator=sh.Locator(css='input[name="entity"][value="dont-choose-this-one"]'))
                    ),
                ),
                (
                    "checkbox-check",
                    lambda page: (
                        page.click(sh.PageClickParams(locator=sh.Locator(css="input.challenge-checkbox", idx=0))),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="input.challenge-checkbox", idx=1))),
                        page.locate(sh.PageLocateParams(locator=sh.Locator(css="input.challenge-checkbox")))
                        .nth(sh.LocatorNthParams(index=2))
                        .click(),
                    ),
                ),
                (
                    "search-squash",
                    lambda page: (
                        page.fill(sh.PageFillParams(locator=sh.Locator(css="#search-input"), value="squash")),
                        page.key_press(sh.PageKeyPressParams(locator=sh.Locator(css="#search-input"), key="Enter")),
                    ),
                ),
                (
                    "date-time-input",
                    lambda page: (
                        page.fill(
                            sh.PageFillParams(
                                locator=sh.Locator(css="#date-picker"),
                                value=datetime.now().strftime("%Y-%m-%d"),
                            )
                        ),
                        page.fill(
                            sh.PageFillParams(
                                locator=sh.Locator(css="#time-picker"),
                                value=datetime.now().strftime("%H:%M"),
                            )
                        ),
                    ),
                ),
                (
                    "copy-text",
                    lambda page: page.fill(sh.PageFillParams(locator=sh.Locator(css="#copy-input"), value="abc")),
                ),
                (
                    "slider-drag",
                    lambda page: page.click(
                        sh.PageClickParams(locator=sh.Locator(css="#range-slider"), offset_x=295, offset_y=8)
                    ),
                ),
                (
                    "hover-element",
                    lambda page: (
                        page.hover(sh.PageHoverParams(locator=sh.Locator(css="#hover-target"))),
                        page.wait_for_timeout(sh.PageWaitForTimeoutParams(ms=1100)),
                    ),
                ),
                (
                    "drag-drop",
                    lambda page: page.drag_and_drop(
                        sh.PageDragAndDropParams(
                            start=sh.Locator(css="#drag-element"),
                            end=sh.Locator(css="#drop-target"),
                        )
                    ),
                ),
                (
                    "file-drop",
                    lambda page: page.drop_files(
                        sh.PageDropFilesParams(files=[fixture_file], locator=sh.Locator(css="#file-drop-area"))
                    ),
                ),
                (
                    "multi-select",
                    lambda page: page.select_option(
                        sh.PageSelectOptionParams(
                            locator=sh.Locator(css="#multi-select-element"),
                            values=["option1", "option2", "option3"],
                        )
                    ),
                ),
                (
                    "canvas-captcha",
                    lambda page: page.fill(
                        sh.PageFillParams(locator=sh.Locator(css="#canvas-text-input"), value="CAPTCHA123")
                    ),
                ),
                (
                    "iframe-slider",
                    lambda page: (
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#iframe-slider", idx=2), offset_x=295, offset_y=8)),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#iframe-slider-popover-button"))),
                    ),
                ),
                (
                    "oopif-form-submit",
                    lambda page: (
                        page.wait_for_locator(
                            sh.PageWaitForLocatorParams(locator=sh.Locator(css="#first-name"), timeout_ms=20_000)
                        ),
                        page.fill(sh.PageFillParams(locator=sh.Locator(css="#first-name"), value="Ada")),
                        page.fill(sh.PageFillParams(locator=sh.Locator(css="#last-name"), value="Lovelace")),
                        page.fill(sh.PageFillParams(locator=sh.Locator(css="#email"), value="ada@example.com")),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#contact-form button[type='submit']"))),
                    ),
                ),
                (
                    "oopif-open-shadow-button",
                    lambda page: (
                        page.click(
                            sh.PageClickParams(
                                locator=sh.Locator(
                                    xpath="/html[1]/body[1]/div[2]/div[15]/iframe[1]/html[1]/body[1]/shadow-demo[1]//div[1]/button[1]"
                                )
                            )
                        ),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#oopif-open-shadow-confirm"))),
                    ),
                ),
                (
                    "oopif-closed-shadow-button",
                    lambda page: (
                        page.click(
                            sh.PageClickParams(
                                locator=sh.Locator(
                                    xpath="/html[1]/body[1]/div[2]/div[16]/iframe[1]/html[1]/body[1]/shadow-demo[1]//div[1]/button[1]"
                                )
                            )
                        ),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#oopif-closed-shadow-confirm"))),
                    ),
                ),
                (
                    "shadow-dom-dblclick",
                    lambda page: page.double_click(sh.PageDoubleClickParams(locator=sh.Locator(text="Double-click me"))),
                ),
                (
                    "right-click-component",
                    lambda page: page.locate(sh.PageLocateParams(locator=sh.Locator(text="Right-click me"))).click(
                        sh.LocatorClickParams(button="secondary")
                    ),
                ),
                (
                    "scroll-accept",
                    lambda page: (
                        page.scroll(sh.PageScrollParams(locator=sh.Locator(css="#scroll-container"), percent=100)),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#accept-button"))),
                    ),
                ),
                ("draw-circle", self._draw_circle),
                (
                    "cancel-dialog",
                    lambda page: page.click(
                        sh.PageClickParams(dialog={"accept": False}, locator=sh.Locator(css="#confirm-button"))
                    ),
                ),
                (
                    "geolocation-permission",
                    lambda page: (
                        page.set_geolocation(
                            sh.PageSetGeolocationParams(
                                accuracy=25,
                                latitude=37.7749,
                                longitude=-122.4194,
                                origin="https://pirate.github.io",
                            )
                        ),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#request-location-button"))),
                    ),
                ),
                (
                    "arrow-key-presses",
                    lambda page: (
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#key-press-area"))),
                        page.key_press(
                            sh.PageKeyPressParams(locator=sh.Locator(css="#key-press-area"), key="ArrowRight", repeat=3)
                        ),
                    ),
                ),
                ("alert-secret", self._alert_secret),
                (
                    "press-hold-button",
                    lambda page: page.click_and_hold(
                        sh.PageClickAndHoldParams(locator=sh.Locator(css="#hold-button"), duration_ms=800)
                    ),
                ),
                (
                    "tooltip-secret",
                    lambda page: (
                        page.hover(sh.PageHoverParams(locator=sh.Locator(css="#tooltip-element"))),
                        page.fill(sh.PageFillParams(locator=sh.Locator(css="#tooltip-secret-input"), value="octopus")),
                    ),
                ),
                ("resize-textarea", self._resize_textarea),
                (
                    "file-upload",
                    lambda page: page.set_input_files(
                        sh.PageSetInputFilesParams(files=[fixture_file], locator=sh.Locator(css="#file-upload-input"))
                    ),
                ),
                (
                    "phone-input",
                    lambda page: (
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#phone-input-field"))),
                        page.key_press(sh.PageKeyPressParams(locator=sh.Locator(css="#phone-input-field"), key="Backspace")),
                        page.key_press(
                            sh.PageKeyPressParams(
                                method="type",
                                locator=sh.Locator(css="#phone-input-field"),
                                value="555-1234",
                            )
                        ),
                    ),
                ),
                (
                    "expand-details",
                    lambda page: page.locate(sh.PageLocateParams(locator=sh.Locator(css="#details-element summary"))).click(),
                ),
                ("drag-square-to-circle", self._drag_square_to_circle),
                (
                    "audio-transcription",
                    lambda page: page.fill(
                        sh.PageFillParams(locator=sh.Locator(css="#transcription-input"), value="everything")
                    ),
                ),
                (
                    "dropdown-selections",
                    lambda page: (
                        page.select_option(sh.PageSelectOptionParams(locator=sh.Locator(css="#color-select"), values=["red"])),
                        page.select_option(sh.PageSelectOptionParams(locator=sh.Locator(css="#object-select"), values=["ball"])),
                    ),
                ),
                (
                    "contenteditable-div",
                    lambda page: (
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#editable-content"))),
                        page.key_press(
                            sh.PageKeyPressParams(method="type", locator=sh.Locator(css="#editable-content"), value="banana")
                        ),
                    ),
                ),
                (
                    "nested-tiny-button",
                    lambda page: page.click(
                        sh.PageClickParams(
                            dialog={"accept": True},
                            expect_timeout_ms=20_000,
                            locator=sh.Locator(css="#deep-tiny-button"),
                        )
                    ),
                ),
                ("wrapped-word-click", self._wrapped_word_click),
                (
                    "long-link-maze",
                    lambda page: page.click(sh.PageClickParams(locator=sh.Locator(text="TARGET-LINK::orion-needle-1847"))),
                ),
                (
                    "wall-secret-word",
                    lambda page: page.fill(sh.PageFillParams(locator=sh.Locator(css="#wall-secret-input"), value="cobaltglass")),
                ),
                (
                    "closed-shadow-aria-word",
                    lambda page: page.fill(
                        sh.PageFillParams(locator=sh.Locator(css="#closed-shadow-aria-input"), value="violetcircuit")
                    ),
                ),
                (
                    "dynamic-frame-ordinal-trap",
                    lambda page: (
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#frame-trap-start"))),
                        page.wait_for_locator(
                            sh.PageWaitForLocatorParams(locator=sh.Locator(css="#frame-trap-create-third"), timeout_ms=10_000)
                        ),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#frame-trap-create-third"))),
                        page.wait_for_locator(
                            sh.PageWaitForLocatorParams(locator=sh.Locator(css="#frame-trap-insert-final"), timeout_ms=10_000)
                        ),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#frame-trap-insert-final"))),
                        page.wait_for_locator(
                            sh.PageWaitForLocatorParams(locator=sh.Locator(css="#frame-trap-final-button"), timeout_ms=10_000)
                        ),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#frame-trap-final-button"))),
                    ),
                ),
                ("rotated-transform-click", self._rotated_transform_click),
                (
                    "transparent-overlay-button",
                    lambda page: page.locate(sh.PageLocateParams(locator=sh.Locator(css="#transparent-overlay-target"))).click(),
                ),
                (
                    "realistic-input-sequence",
                    lambda page: (
                        page.scroll(sh.PageScrollParams(locator=sh.Locator(css="#realistic-scroll-panel"), delta_y=450)),
                        page.scroll(sh.PageScrollParams(locator=sh.Locator(css="#realistic-scroll-panel"), delta_y=450)),
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#realistic-type-input"))),
                        [
                            page.key_press(sh.PageKeyPressParams(locator=sh.Locator(css="#realistic-type-input"), key=key))
                            for key in ["o", "r", "c", "h", "i", "d"]
                        ],
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#realistic-submit-button"))),
                    ),
                ),
                (
                    "css-transform-text",
                    lambda page: page.fill(
                        sh.PageFillParams(locator=sh.Locator(css="#css-transform-text-input"), value="skyline")
                    ),
                ),
                (
                    "google-docs",
                    lambda page: (
                        page.click(sh.PageClickParams(locator=sh.Locator(css="#google-docs-answer-input"))),
                        page.key_press(
                            sh.PageKeyPressParams(
                                method="type",
                                locator=sh.Locator(css="#google-docs-answer-input"),
                                value="snooker",
                            )
                        ),
                    ),
                ),
            ]

            for task_id, run in challenges:
                run(page)
                page.wait_for_expression(
                    sh.PageWaitForExpressionParams(
                        expression=f"document.getElementById({json.dumps(task_id)})?.classList.contains('completed') === true",
                        timeout_ms=20_000,
                    )
                )

            score = page.evaluate(
                sh.PageEvaluateParams(expression="document.querySelectorAll('.task.completed').length")
            ).value
            counts = page.evaluate(
                sh.PageEvaluateParams(
                    expression="(() => ({ completed: document.querySelectorAll('.task.completed').length, total: document.querySelectorAll('.task').length }))()"
                )
            ).value
            self.assertEqual(score, counts["completed"])
            self.assertEqual(counts["total"], 45)
            self.assertEqual(score, 45)
        finally:
            client.close()

    def _draw_circle(self, page: sh.Page) -> None:
        page.click(sh.PageClickParams(locator=sh.Locator(css="#draw-canvas"), offset_x=150, offset_y=150))
        page.scroll(sh.PageScrollParams(delta_y=320))
        canvas = page.locate(sh.PageLocateParams(locator=sh.Locator(css="#draw-canvas")))
        self.assertIsNotNone(canvas.coordinates)
        assert canvas.coordinates is not None
        self.assertIsNotNone(canvas.coordinates.left)
        self.assertIsNotNone(canvas.coordinates.top)
        left = canvas.coordinates.left
        top = canvas.coordinates.top
        assert left is not None and top is not None
        for index in range(24):
            import math

            angle = math.pi * 2 * index / 24
            page.hover(
                sh.PageHoverParams(
                    locator=sh.Locator(
                        coordinates=sh.LocatorCoordinates(
                            x=left + 150 + math.cos(angle) * 100,
                            y=top + 150 + math.sin(angle) * 100,
                        )
                    )
                )
            )

    def _alert_secret(self, page: sh.Page) -> None:
        result = page.click(sh.PageClickParams(dialog={"accept": True}, locator=sh.Locator(css="#secret-alert-button")))
        self.assertRegex(result.message or "", "avocado")
        page.fill(sh.PageFillParams(locator=sh.Locator(css="#secret-word-input"), value="avocado"))

    def _resize_textarea(self, page: sh.Page) -> None:
        textarea = page.locate(sh.PageLocateParams(locator=sh.Locator(css="#resizable-textarea")))
        self.assertIsNotNone(textarea.coordinates)
        assert textarea.coordinates is not None
        self.assertIsNotNone(textarea.coordinates.right)
        self.assertIsNotNone(textarea.coordinates.bottom)
        right = textarea.coordinates.right
        bottom = textarea.coordinates.bottom
        assert right is not None and bottom is not None
        page.drag_and_drop(
            sh.PageDragAndDropParams(
                start=sh.Locator(coordinates=sh.LocatorCoordinates(x=right - 2, y=bottom - 2)),
                end=sh.Locator(coordinates=sh.LocatorCoordinates(x=right + 160, y=bottom + 90)),
            )
        )
        page.fill(sh.PageFillParams(locator=sh.Locator(css="#resize-secret-input"), value="giraffe"))

    def _drag_square_to_circle(self, page: sh.Page) -> None:
        page.click(sh.PageClickParams(locator=sh.Locator(css="#drag-canvas"), offset_x=175, offset_y=125))
        page.scroll(sh.PageScrollParams(delta_y=220))
        canvas = page.locate(sh.PageLocateParams(locator=sh.Locator(css="#drag-canvas")))
        self.assertIsNotNone(canvas.coordinates)
        assert canvas.coordinates is not None
        self.assertIsNotNone(canvas.coordinates.left)
        self.assertIsNotNone(canvas.coordinates.top)
        left = canvas.coordinates.left
        top = canvas.coordinates.top
        assert left is not None and top is not None
        page.drag_and_drop(
            sh.PageDragAndDropParams(
                start=sh.Locator(coordinates=sh.LocatorCoordinates(x=left + 75, y=top + 125)),
                end=sh.Locator(coordinates=sh.LocatorCoordinates(x=left + 250, y=top + 125)),
            )
        )

    def _wrapped_word_click(self, page: sh.Page) -> None:
        page.hover(sh.PageHoverParams(locator=sh.Locator(css="#wrapped-word-paragraph")))
        point = page.evaluate(
            sh.PageEvaluateParams(
                expression="""(() => {
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
        })()"""
            )
        ).value
        self.assertIsInstance(point, dict)
        x = point["x"]
        y = point["y"]
        self.assertIsInstance(x, (int, float))
        self.assertIsInstance(y, (int, float))
        page.click(sh.PageClickParams(locator=sh.Locator(css="#wrapped-word-paragraph"), offset_x=x, offset_y=y))

    def _rotated_transform_click(self, page: sh.Page) -> None:
        page.hover(sh.PageHoverParams(locator=sh.Locator(css="#rotated-transform-button")))
        point = page.evaluate(
            sh.PageEvaluateParams(
                expression="""(() => {
          const button = document.getElementById("rotated-transform-button");
          if (button == null) throw new Error("rotated transform button is missing");
          const rect = button.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()"""
            )
        ).value
        self.assertIsInstance(point, dict)
        x = point["x"]
        y = point["y"]
        self.assertIsInstance(x, (int, float))
        self.assertIsInstance(y, (int, float))
        page.click(sh.PageClickParams(locator=sh.Locator(coordinates=sh.LocatorCoordinates(x=x, y=y))))


if __name__ == "__main__":
    unittest.main()
