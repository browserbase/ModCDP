// MODCDP_TEST_SUPPORT: TEST SYNTAX SUPPORT ONLY, NOT A SEPARATE HARNESS.
// Do not put browser setup, URLs, env gating, or behavioral assertions here; those belong in translated tests or translated harness files.
// Any real test harness behavior must stay perfectly 1:1 across TypeScript, Python, and Go.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package transport_test

import "net"

func boolPtr(value bool) *bool {
	return &value
}

func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}
