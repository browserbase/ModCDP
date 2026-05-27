// MODCDP_TRANSLATE_TEST: GO-SPECIFIC INTERNAL COVERAGE.
// The public translated tests cover behavior through user-facing transport APIs.
package transport

import (
	"strings"
	"testing"
)

func TestUpstreamTransportRejectsInvalidIncomingMessages(t *testing.T) {
	transport := NewUpstreamTransport(UpstreamTransportConfig{})

	for _, testCase := range []struct {
		name    string
		message string
		want    string
	}{
		{name: "json", message: "{", want: "invalid CDP message"},
		{name: "response id", message: `{"id":"one","result":{}}`, want: "invalid CDP response id"},
		{name: "event method", message: `{"params":{}}`, want: "invalid CDP event method"},
		{name: "event params", message: `{"method":"Runtime.executionContextCreated","params":[]}`, want: "invalid CDP event params"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			err := transport.parseAndEmitRecv([]byte(testCase.message))
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("parse error = %v", err)
			}
		})
	}
}
