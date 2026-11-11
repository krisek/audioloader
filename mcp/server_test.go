package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }
func noFile(string) ([]byte, error)               { return nil, nil }

func TestConfig(t *testing.T) {
	long := "abcdefghijklmnopqrstuvwxyz"
	c, err := LoadConfig(env(map[string]string{"AL_MCP_PATH": "/" + long + "/mcp/", "AL_MCP_CLIENT_ID": "kris"}), noFile)
	if err != nil || c.Routes[0].Path != "/"+long+"/mcp" || c.Listen != "127.0.0.1:3401" || c.Upstream != "http://127.0.0.1:3400" {
		t.Fatalf("defaults wrong: %+v %v", c, err)
	}

	bad := []map[string]string{
		{},                       // no routes
		{"AL_MCP_PATH": "short"}, // weak secret
		{"AL_MCP_PATH": long, "AL_MCP_CLIENT_ID": "bad id/.."},
		{"AL_MCP_ROUTES": long + "=a," + long + "=b"}, // duplicate path
		{"AL_MCP_PATH": long, "AL_MCP_UPSTREAM_BEARER": "t", "AL_MCP_UPSTREAM_BASIC_USER": "u"},
	}
	for i, b := range bad {
		if _, err := LoadConfig(env(b), noFile); err == nil {
			t.Errorf("case %d should fail: %v", i, b)
		}
	}

	c, err = LoadConfig(env(map[string]string{"AL_MCP_ROUTES": long + "=kris," + long + "2=anna", "AL_MCP_PORT": "4000"}), noFile)
	if err != nil || len(c.Routes) != 2 || c.Listen != "127.0.0.1:4000" {
		t.Fatalf("routes: %+v %v", c, err)
	}
	file := func(string) ([]byte, error) { return []byte("# users\n" + long + "x bob\n"), nil }
	c, err = LoadConfig(env(map[string]string{"AL_MCP_ROUTES_FILE": "f"}), file)
	if err != nil || c.Routes[0].ClientID != "bob" {
		t.Fatalf("routes file: %+v %v", c, err)
	}
}

func TestOnlySecretPathsAreServed(t *testing.T) {
	m := newMock(nil)
	defer m.Close()
	srv := httptest.NewServer(NewHandler(testConfig(m.URL, nil)))
	defer srv.Close()

	for _, p := range []string{"/", "/mcp", "/" + secretKris[:len(secretKris)-1], "/" + secretKris + "x", "/.well-known/oauth-authorization-server"} {
		res, err := http.Get(srv.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 404 {
			t.Errorf("%s: got %d, want 404", p, res.StatusCode)
		}
	}
}

func TestToolsAndReadOnly(t *testing.T) {
	m := newMock(nil)
	defer m.Close()

	s, _ := connect(t, testConfig(m.URL, nil), secretKris)
	names := toolNames(t, s)
	if len(names) != 28 {
		t.Errorf("want 28 tools, got %d", len(names))
	}

	ro, _ := connect(t, testConfig(m.URL, func(c *Config) { c.ReadOnly = true }), secretKris)
	names = toolNames(t, ro)
	if len(names) != 13 || !names["now_playing"] || names["play_album"] || names["stop"] || names["toggle_output"] {
		t.Errorf("read-only tool set wrong: %v", names)
	}
}

func TestSecretSelectsUser(t *testing.T) {
	m := newMock(nil)
	defer m.Close()
	cfg := testConfig(m.URL, nil)

	for secret, want := range map[string]string{secretKris: "kris", secretAnna: "anna"} {
		s, _ := connect(t, cfg, secret)
		callTool(t, s, "get_history", map[string]any{})
		if got := m.last().Query.Get("client_id"); got != want {
			t.Errorf("secret %s: client_id %q, want %q", secret, got, want)
		}
	}
}
