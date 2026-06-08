// Before running this live test, build a local Stagehand alias manifest and
// regenerate the Go client:
//
//   pnpm --dir ../stagehand-server exec node src/protocol/generate_modcdp_alias_manifest.mjs ../modcdp2/testdata/codegen/stagehand_alias_manifest.json
//   pnpm run build:go
//   pnpm run test:e2e:go
//
// The manifest is intentionally untracked; do not commit it.

package stagehandclient

import (
	"encoding/json"
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

const challengeURL = "https://pirate.github.io/stress-tests/challenge.html"

func TestGeneratedStagehandClientChallengeSuite(t *testing.T) {
	fixtureFile, err := filepath.Abs("stagehand_client_live_test.go")
	if err != nil {
		t.Fatal(err)
	}

	client := StagehandClient()
	if err := client.Connect(); err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	page, err := client.Browser.NewPage(BrowserNewPageParams{Url: "about:blank"})
	if err != nil {
		t.Fatal(err)
	}
	page, err = page.Goto(PageGotoParams{Url: challengeURL, WaitUntil: "load"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := page.WaitForExpression(PageWaitForExpressionParams{
		Expression: "document.querySelectorAll('.task').length === 45",
		TimeoutMs:  20_000,
	}); err != nil {
		t.Fatal(err)
	}

	type challenge struct {
		id  string
		run func(Page) error
	}

	challenges := []challenge{
		{"simple-button", func(page Page) error {
			button, err := page.Locate(PageLocateParams{Locator: Locator{Css: "#start-button"}})
			if err != nil {
				return err
			}
			_, err = button.Click()
			return err
		}},
		{"radio-selection", func(page Page) error {
			_, err := page.Click(PageClickParams{Locator: Locator{Css: `input[name="entity"][value="dont-choose-this-one"]`}})
			return err
		}},
		{"checkbox-check", func(page Page) error {
			firstIdx := 0
			secondIdx := 1
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "input.challenge-checkbox", Idx: &firstIdx}}); err != nil {
				return err
			}
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "input.challenge-checkbox", Idx: &secondIdx}}); err != nil {
				return err
			}
			first, err := page.Locate(PageLocateParams{Locator: Locator{Css: "input.challenge-checkbox"}})
			if err != nil {
				return err
			}
			third, err := first.Nth(LocatorNthParams{Index: 2})
			if err != nil {
				return err
			}
			_, err = third.Click()
			return err
		}},
		{"search-squash", func(page Page) error {
			locator := Locator{Css: "#search-input"}
			if _, err := page.Fill(PageFillParams{Locator: locator, Value: "squash"}); err != nil {
				return err
			}
			_, err := page.KeyPress(PageKeyPressParams{Locator: locator, Key: "Enter"})
			return err
		}},
		{"date-time-input", func(page Page) error {
			now := time.Now()
			if _, err := page.Fill(PageFillParams{Locator: Locator{Css: "#date-picker"}, Value: now.Format("2006-01-02")}); err != nil {
				return err
			}
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#time-picker"}, Value: now.Format("15:04")})
			return err
		}},
		{"copy-text", func(page Page) error {
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#copy-input"}, Value: "abc"})
			return err
		}},
		{"slider-drag", func(page Page) error {
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#range-slider"}, OffsetX: 295, OffsetY: 8})
			return err
		}},
		{"hover-element", func(page Page) error {
			if _, err := page.Hover(PageHoverParams{Locator: Locator{Css: "#hover-target"}}); err != nil {
				return err
			}
			_, err := page.WaitForTimeout(PageWaitForTimeoutParams{Ms: 1100})
			return err
		}},
		{"drag-drop", func(page Page) error {
			_, err := page.DragAndDrop(PageDragAndDropParams{
				Start: Locator{Css: "#drag-element"},
				End:   Locator{Css: "#drop-target"},
			})
			return err
		}},
		{"file-drop", func(page Page) error {
			_, err := page.DropFiles(PageDropFilesParams{
				Files:   []json.RawMessage{json.RawMessage(strconv.Quote(fixtureFile))},
				Locator: Locator{Css: "#file-drop-area"},
			})
			return err
		}},
		{"multi-select", func(page Page) error {
			_, err := page.SelectOption(PageSelectOptionParams{
				Locator: Locator{Css: "#multi-select-element"},
				Values:  []string{"option1", "option2", "option3"},
			})
			return err
		}},
		{"canvas-captcha", func(page Page) error {
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#canvas-text-input"}, Value: "CAPTCHA123"})
			return err
		}},
		{"iframe-slider", func(page Page) error {
			idx := 2
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "#iframe-slider", Idx: &idx}, OffsetX: 295, OffsetY: 8}); err != nil {
				return err
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#iframe-slider-popover-button"}})
			return err
		}},
		{"oopif-form-submit", func(page Page) error {
			if _, err := page.WaitForLocator(PageWaitForLocatorParams{Locator: Locator{Css: "#first-name"}, TimeoutMs: 20_000}); err != nil {
				return err
			}
			if _, err := page.Fill(PageFillParams{Locator: Locator{Css: "#first-name"}, Value: "Ada"}); err != nil {
				return err
			}
			if _, err := page.Fill(PageFillParams{Locator: Locator{Css: "#last-name"}, Value: "Lovelace"}); err != nil {
				return err
			}
			if _, err := page.Fill(PageFillParams{Locator: Locator{Css: "#email"}, Value: "ada@example.com"}); err != nil {
				return err
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#contact-form button[type='submit']"}})
			return err
		}},
		{"oopif-open-shadow-button", func(page Page) error {
			if _, err := page.Click(PageClickParams{Locator: Locator{Xpath: "/html[1]/body[1]/div[2]/div[15]/iframe[1]/html[1]/body[1]/shadow-demo[1]//div[1]/button[1]"}}); err != nil {
				return err
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#oopif-open-shadow-confirm"}})
			return err
		}},
		{"oopif-closed-shadow-button", func(page Page) error {
			if _, err := page.Click(PageClickParams{Locator: Locator{Xpath: "/html[1]/body[1]/div[2]/div[16]/iframe[1]/html[1]/body[1]/shadow-demo[1]//div[1]/button[1]"}}); err != nil {
				return err
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#oopif-closed-shadow-confirm"}})
			return err
		}},
		{"shadow-dom-dblclick", func(page Page) error {
			_, err := page.DoubleClick(PageDoubleClickParams{Locator: Locator{Text: "Double-click me"}})
			return err
		}},
		{"right-click-component", func(page Page) error {
			locator, err := page.Locate(PageLocateParams{Locator: Locator{Text: "Right-click me"}})
			if err != nil {
				return err
			}
			_, err = locator.Click(LocatorClickParams{Button: "secondary"})
			return err
		}},
		{"scroll-accept", func(page Page) error {
			if _, err := page.Scroll(PageScrollParams{Locator: Locator{Css: "#scroll-container"}, Percent: json.RawMessage("100")}); err != nil {
				return err
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#accept-button"}})
			return err
		}},
		{"draw-circle", func(page Page) error {
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "#draw-canvas"}, OffsetX: 150, OffsetY: 150}); err != nil {
				return err
			}
			if _, err := page.Scroll(PageScrollParams{DeltaY: 320}); err != nil {
				return err
			}
			canvas, err := page.Locate(PageLocateParams{Locator: Locator{Css: "#draw-canvas"}})
			if err != nil {
				return err
			}
			if canvas.Coordinates == nil || canvas.Coordinates.Left == nil || canvas.Coordinates.Top == nil {
				t.Fatalf("draw canvas locator is missing coordinates: %+v", canvas.Coordinates)
			}
			left := *canvas.Coordinates.Left
			top := *canvas.Coordinates.Top
			for i := 0; i < 24; i++ {
				angle := math.Pi * 2 * float64(i) / 24
				x := left + 150 + math.Cos(angle)*100
				y := top + 150 + math.Sin(angle)*100
				if _, err := page.Hover(PageHoverParams{Locator: Locator{Coordinates: &LocatorCoordinates{X: &x, Y: &y}}}); err != nil {
					return err
				}
			}
			return nil
		}},
		{"cancel-dialog", func(page Page) error {
			_, err := page.Click(PageClickParams{
				Dialog:  &PageClickParamsDialog{Accept: false},
				Locator: Locator{Css: "#confirm-button"},
			})
			return err
		}},
		{"geolocation-permission", func(page Page) error {
			if _, err := page.SetGeolocation(PageSetGeolocationParams{
				Accuracy:  25,
				Latitude:  37.7749,
				Longitude: -122.4194,
				Origin:    "https://pirate.github.io",
			}); err != nil {
				return err
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#request-location-button"}})
			return err
		}},
		{"arrow-key-presses", func(page Page) error {
			locator := Locator{Css: "#key-press-area"}
			if _, err := page.Click(PageClickParams{Locator: locator}); err != nil {
				return err
			}
			_, err := page.KeyPress(PageKeyPressParams{Locator: locator, Key: "ArrowRight", Repeat: 3})
			return err
		}},
		{"alert-secret", func(page Page) error {
			result, err := page.Click(PageClickParams{
				Dialog:  &PageClickParamsDialog{Accept: true},
				Locator: Locator{Css: "#secret-alert-button"},
			})
			if err != nil {
				return err
			}
			if !strings.Contains(result.Message, "avocado") {
				t.Fatalf("alert message did not contain secret: %q", result.Message)
			}
			_, err = page.Fill(PageFillParams{Locator: Locator{Css: "#secret-word-input"}, Value: "avocado"})
			return err
		}},
		{"press-hold-button", func(page Page) error {
			_, err := page.ClickAndHold(PageClickAndHoldParams{DurationMs: 800, Locator: Locator{Css: "#hold-button"}})
			return err
		}},
		{"tooltip-secret", func(page Page) error {
			if _, err := page.Hover(PageHoverParams{Locator: Locator{Css: "#tooltip-element"}}); err != nil {
				return err
			}
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#tooltip-secret-input"}, Value: "octopus"})
			return err
		}},
		{"resize-textarea", func(page Page) error {
			textarea, err := page.Locate(PageLocateParams{Locator: Locator{Css: "#resizable-textarea"}})
			if err != nil {
				return err
			}
			if textarea.Coordinates == nil || textarea.Coordinates.Right == nil || textarea.Coordinates.Bottom == nil {
				t.Fatalf("textarea locator is missing coordinates: %+v", textarea.Coordinates)
			}
			right := *textarea.Coordinates.Right
			bottom := *textarea.Coordinates.Bottom
			startX := right - 2
			startY := bottom - 2
			endX := right + 160
			endY := bottom + 90
			if _, err := page.DragAndDrop(PageDragAndDropParams{
				Start: Locator{Coordinates: &LocatorCoordinates{X: &startX, Y: &startY}},
				End:   Locator{Coordinates: &LocatorCoordinates{X: &endX, Y: &endY}},
			}); err != nil {
				return err
			}
			_, err = page.Fill(PageFillParams{Locator: Locator{Css: "#resize-secret-input"}, Value: "giraffe"})
			return err
		}},
		{"file-upload", func(page Page) error {
			_, err := page.SetInputFiles(PageSetInputFilesParams{Files: []string{fixtureFile}, Locator: Locator{Css: "#file-upload-input"}})
			return err
		}},
		{"phone-input", func(page Page) error {
			locator := Locator{Css: "#phone-input-field"}
			if _, err := page.Click(PageClickParams{Locator: locator}); err != nil {
				return err
			}
			if _, err := page.KeyPress(PageKeyPressParams{Locator: locator, Key: "Backspace"}); err != nil {
				return err
			}
			_, err := page.KeyPress(PageKeyPressParams{Method: "type", Locator: locator, Value: "555-1234"})
			return err
		}},
		{"expand-details", func(page Page) error {
			locator, err := page.Locate(PageLocateParams{Locator: Locator{Css: "#details-element summary"}})
			if err != nil {
				return err
			}
			_, err = locator.Click()
			return err
		}},
		{"drag-square-to-circle", func(page Page) error {
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "#drag-canvas"}, OffsetX: 175, OffsetY: 125}); err != nil {
				return err
			}
			if _, err := page.Scroll(PageScrollParams{DeltaY: 220}); err != nil {
				return err
			}
			canvas, err := page.Locate(PageLocateParams{Locator: Locator{Css: "#drag-canvas"}})
			if err != nil {
				return err
			}
			if canvas.Coordinates == nil || canvas.Coordinates.Left == nil || canvas.Coordinates.Top == nil {
				t.Fatalf("drag canvas locator is missing coordinates: %+v", canvas.Coordinates)
			}
			left := *canvas.Coordinates.Left
			top := *canvas.Coordinates.Top
			startX := left + 75
			startY := top + 125
			endX := left + 250
			endY := top + 125
			_, err = page.DragAndDrop(PageDragAndDropParams{
				Start: Locator{Coordinates: &LocatorCoordinates{X: &startX, Y: &startY}},
				End:   Locator{Coordinates: &LocatorCoordinates{X: &endX, Y: &endY}},
			})
			return err
		}},
		{"audio-transcription", func(page Page) error {
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#transcription-input"}, Value: "everything"})
			return err
		}},
		{"dropdown-selections", func(page Page) error {
			if _, err := page.SelectOption(PageSelectOptionParams{Locator: Locator{Css: "#color-select"}, Values: []string{"red"}}); err != nil {
				return err
			}
			_, err := page.SelectOption(PageSelectOptionParams{Locator: Locator{Css: "#object-select"}, Values: []string{"ball"}})
			return err
		}},
		{"contenteditable-div", func(page Page) error {
			locator := Locator{Css: "#editable-content"}
			if _, err := page.Click(PageClickParams{Locator: locator}); err != nil {
				return err
			}
			_, err := page.KeyPress(PageKeyPressParams{Method: "type", Locator: locator, Value: "banana"})
			return err
		}},
		{"nested-tiny-button", func(page Page) error {
			_, err := page.Click(PageClickParams{
				Dialog:          &PageClickParamsDialog{Accept: true},
				ExpectTimeoutMs: 20_000,
				Locator:         Locator{Css: "#deep-tiny-button"},
			})
			return err
		}},
		{"wrapped-word-click", func(page Page) error {
			if _, err := page.Hover(PageHoverParams{Locator: Locator{Css: "#wrapped-word-paragraph"}}); err != nil {
				return err
			}
			pointResult, err := page.Evaluate(PageEvaluateParams{Expression: `(() => {
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
        })()`})
			if err != nil {
				return err
			}
			var point struct {
				X float64 `json:"x"`
				Y float64 `json:"y"`
			}
			if err := json.Unmarshal(pointResult.Value, &point); err != nil {
				return err
			}
			_, err = page.Click(PageClickParams{Locator: Locator{Css: "#wrapped-word-paragraph"}, OffsetX: point.X, OffsetY: point.Y})
			return err
		}},
		{"long-link-maze", func(page Page) error {
			_, err := page.Click(PageClickParams{Locator: Locator{Text: "TARGET-LINK::orion-needle-1847"}})
			return err
		}},
		{"wall-secret-word", func(page Page) error {
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#wall-secret-input"}, Value: "cobaltglass"})
			return err
		}},
		{"closed-shadow-aria-word", func(page Page) error {
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#closed-shadow-aria-input"}, Value: "violetcircuit"})
			return err
		}},
		{"dynamic-frame-ordinal-trap", func(page Page) error {
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "#frame-trap-start"}}); err != nil {
				return err
			}
			if _, err := page.WaitForLocator(PageWaitForLocatorParams{Locator: Locator{Css: "#frame-trap-create-third"}, TimeoutMs: 10_000}); err != nil {
				return err
			}
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "#frame-trap-create-third"}}); err != nil {
				return err
			}
			if _, err := page.WaitForLocator(PageWaitForLocatorParams{Locator: Locator{Css: "#frame-trap-insert-final"}, TimeoutMs: 10_000}); err != nil {
				return err
			}
			if _, err := page.Click(PageClickParams{Locator: Locator{Css: "#frame-trap-insert-final"}}); err != nil {
				return err
			}
			if _, err := page.WaitForLocator(PageWaitForLocatorParams{Locator: Locator{Css: "#frame-trap-final-button"}, TimeoutMs: 10_000}); err != nil {
				return err
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#frame-trap-final-button"}})
			return err
		}},
		{"rotated-transform-click", func(page Page) error {
			if _, err := page.Hover(PageHoverParams{Locator: Locator{Css: "#rotated-transform-button"}}); err != nil {
				return err
			}
			pointResult, err := page.Evaluate(PageEvaluateParams{Expression: `(() => {
          const button = document.getElementById("rotated-transform-button");
          if (button == null) throw new Error("rotated transform button is missing");
          const rect = button.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`})
			if err != nil {
				return err
			}
			var point struct {
				X float64 `json:"x"`
				Y float64 `json:"y"`
			}
			if err := json.Unmarshal(pointResult.Value, &point); err != nil {
				return err
			}
			_, err = page.Click(PageClickParams{Locator: Locator{Coordinates: &LocatorCoordinates{X: &point.X, Y: &point.Y}}})
			return err
		}},
		{"transparent-overlay-button", func(page Page) error {
			locator, err := page.Locate(PageLocateParams{Locator: Locator{Css: "#transparent-overlay-target"}})
			if err != nil {
				return err
			}
			_, err = locator.Click()
			return err
		}},
		{"realistic-input-sequence", func(page Page) error {
			panel := Locator{Css: "#realistic-scroll-panel"}
			if _, err := page.Scroll(PageScrollParams{Locator: panel, DeltaY: 450}); err != nil {
				return err
			}
			if _, err := page.Scroll(PageScrollParams{Locator: panel, DeltaY: 450}); err != nil {
				return err
			}
			locator := Locator{Css: "#realistic-type-input"}
			if _, err := page.Click(PageClickParams{Locator: locator}); err != nil {
				return err
			}
			for _, key := range []string{"o", "r", "c", "h", "i", "d"} {
				if _, err := page.KeyPress(PageKeyPressParams{Locator: locator, Key: key}); err != nil {
					return err
				}
			}
			_, err := page.Click(PageClickParams{Locator: Locator{Css: "#realistic-submit-button"}})
			return err
		}},
		{"css-transform-text", func(page Page) error {
			_, err := page.Fill(PageFillParams{Locator: Locator{Css: "#css-transform-text-input"}, Value: "skyline"})
			return err
		}},
		{"google-docs", func(page Page) error {
			locator := Locator{Css: "#google-docs-answer-input"}
			if _, err := page.Click(PageClickParams{Locator: locator}); err != nil {
				return err
			}
			_, err := page.KeyPress(PageKeyPressParams{Method: "type", Locator: locator, Value: "snooker"})
			return err
		}},
	}

	if len(challenges) != 45 {
		t.Fatalf("expected 45 challenges, got %d", len(challenges))
	}
	for _, challenge := range challenges {
		if err := challenge.run(page); err != nil {
			t.Fatalf("%s failed: %v", challenge.id, err)
		}
		if _, err := page.WaitForExpression(PageWaitForExpressionParams{
			Expression: "document.getElementById(" + strconv.Quote(challenge.id) + ")?.classList.contains('completed') === true",
			TimeoutMs:  20_000,
		}); err != nil {
			t.Fatalf("%s did not complete: %v", challenge.id, err)
		}
	}

	scoreResult, err := page.Evaluate(PageEvaluateParams{Expression: "document.querySelectorAll('.task.completed').length"})
	if err != nil {
		t.Fatal(err)
	}
	var score int
	if err := json.Unmarshal(scoreResult.Value, &score); err != nil {
		t.Fatal(err)
	}
	countsResult, err := page.Evaluate(PageEvaluateParams{Expression: "(() => ({ completed: document.querySelectorAll('.task.completed').length, total: document.querySelectorAll('.task').length }))()"})
	if err != nil {
		t.Fatal(err)
	}
	var counts struct {
		Completed int `json:"completed"`
		Total     int `json:"total"`
	}
	if err := json.Unmarshal(countsResult.Value, &counts); err != nil {
		t.Fatal(err)
	}
	if score != counts.Completed {
		t.Fatalf("score %d did not match completed count %d", score, counts.Completed)
	}
	if counts.Total != 45 {
		t.Fatalf("expected 45 total challenges, got %d", counts.Total)
	}
	if score != 45 {
		t.Fatalf("expected score 45, got %d", score)
	}
}
