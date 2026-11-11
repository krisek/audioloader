package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	secretKris = "k7Qx9-very/long-unpredictable-kris"
	secretAnna = "Zp3Lm-very/long-unpredictable-anna"
)

type call struct {
	Path   string
	Query  url.Values
	Header http.Header
}

type mock struct {
	*httptest.Server
	mu    sync.Mutex
	calls []call
}

var fixtures = map[string]string{
	"currentsong": `{"state":"play","active":true,"display_title":"1 - Song","display_title_top":"Artist - Album","elapsed":"12.5","duration":"200.1","volume":"80",
	  "outputs":[{"outputid":"0","outputname":"Speakers","outputenabled":"1"},{"outputid":"1","outputname":"Snap","outputenabled":"0"}],
	  "snapcast_clients":[{"id":"abc","name":"Kitchen","connected":true,"muted":false}]}`,
	"ls":            `{"tree":[{"directory":"A/B","count":{"songs":"10","playhours":"0:42:10"}},{"file":"A/B/01.flac","title":"One","duration":"180.5"},{"file":"A/B/02.flac"}]}`,
	"history":       `{"tree":[{"directory":"Old/Album","count":{"songs":"8"}},{"directory":"New/Album","count":{"songs":"9"}}]}`,
	"radio_history": `{"radio_history":["u1","u2"],"stations":{"u1":{"name":"Old FM","stationuuid":"u1","url":"http://o"},"u2":{"name":"New FM","stationuuid":"u2","url":"http://n"}}}`,
}

func newMock(overrides map[string]int) *mock {
	m := &mock{}
	m.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		m.mu.Lock()
		m.calls = append(m.calls, call{r.URL.Path, r.URL.Query(), r.Header.Clone()})
		m.mu.Unlock()
		if st, ok := overrides[name]; ok {
			w.WriteHeader(st)
			return
		}
		if body, ok := fixtures[name]; ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(body))
		}
	}))
	return m
}

func (m *mock) last() call {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls[len(m.calls)-1]
}

func testConfig(upstream string, mod func(*Config)) *Config {
	c := &Config{Upstream: upstream, MPDPort: "6600", Timeout: 2e9,
		Routes: []Route{{Path: "/" + secretKris, ClientID: "kris"}, {Path: "/" + secretAnna, ClientID: "anna"}}}
	if mod != nil {
		mod(c)
	}
	return c
}

// connect starts the MCP handler and connects an SDK client to one secret path.
func connect(t *testing.T, cfg *Config, secret string) (*mcp.ClientSession, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(NewHandler(cfg))
	t.Cleanup(srv.Close)
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0"}, nil)
	sess, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{Endpoint: srv.URL + "/" + secret}, nil)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { sess.Close() })
	return sess, srv
}

func callTool(t *testing.T, s *mcp.ClientSession, name string, args any) (string, bool) {
	t.Helper()
	res, err := s.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	var sb strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			sb.WriteString(tc.Text)
		}
	}
	return sb.String(), res.IsError
}

func toolNames(t *testing.T, s *mcp.ClientSession) map[string]bool {
	t.Helper()
	res, err := s.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	m := map[string]bool{}
	for _, tool := range res.Tools {
		m[tool.Name] = true
	}
	return m
}

func decode(t *testing.T, s string) map[string]any {
	t.Helper()
	var o map[string]any
	if err := json.Unmarshal([]byte(s), &o); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, s)
	}
	return o
}

func toParams(name string, args any) *mcp.CallToolParams {
	return &mcp.CallToolParams{Name: name, Arguments: args}
}
