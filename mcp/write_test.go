package main

import (
	"strings"
	"testing"
)

func TestWriteToolsParameters(t *testing.T) {
	m := newMock(nil)
	defer m.Close()
	s, _ := connect(t, testConfig(m.URL, nil), secretKris)

	callTool(t, s, "play_album", map[string]any{"path": "Björk/Homogenic & more"})
	c := m.last()
	if c.Path != "/addplay" || c.Query.Get("directory") != "Björk/Homogenic & more" || c.Query.Get("client_id") != "kris" {
		t.Errorf("play_album: %+v", c)
	}

	callTool(t, s, "play_radio", map[string]any{"stationuuid": "j1", "url": "http://j/stream?a=1&b=2", "name": "Jazz FM"})
	c = m.last()
	if c.Query.Get("url") != "http://j/stream?a=1&b=2" || c.Query.Get("stationuuid") != "j1" || c.Query.Get("name") != "Jazz FM" {
		t.Errorf("play_radio: %+v", c)
	}

	callTool(t, s, "play_bandcamp", map[string]any{"url": "https://x.bandcamp.com/album/y", "title": "Y", "art": "http://art/1.jpg"})
	c = m.last()
	if c.Query.Get("name") != "Y" || c.Query.Get("favicon") != "http://art/1.jpg" || c.Query.Get("client_id") != "kris" {
		t.Errorf("play_bandcamp: %+v", c)
	}

	callTool(t, s, "set_snapcast_mute", map[string]any{"id": "abc", "muted": true})
	found := false
	for _, call := range m.calls {
		if call.Path == "/togglesnapcastclient" {
			found = true
			if call.Query.Get("muted") != "true" || call.Query.Get("id") != "abc" {
				t.Errorf("mute: %+v", call)
			}
		}
	}
	if !found {
		t.Error("togglesnapcastclient not called")
	}

	callTool(t, s, "toggle_output", map[string]any{"outputid": "1"})
	for _, call := range m.calls {
		if call.Path == "/toggleoutput" && call.Query.Get("output") != "1" {
			t.Errorf("toggle_output: %+v", call)
		}
	}
}

func TestValidationHappensBeforeUpstream(t *testing.T) {
	m := newMock(nil)
	defer m.Close()
	s, _ := connect(t, testConfig(m.URL, nil), secretKris)

	cases := []struct {
		tool string
		args map[string]any
	}{
		{"search_library", map[string]any{"query": "ab"}},
		{"search_radio", map[string]any{"query": "x"}},
		{"play_radio", map[string]any{"stationuuid": "a", "name": "b", "url": "not a url"}},
		{"play_album", map[string]any{"path": ""}},
	}
	for _, c := range cases {
		res, err := s.CallTool(t.Context(), toParams(c.tool, c.args))
		if err == nil && !res.IsError {
			t.Errorf("%s should be rejected", c.tool)
		}
	}
	if len(m.calls) != 0 {
		t.Errorf("invalid calls reached the upstream: %v", m.calls)
	}
}

func TestUpstreamErrorsAreReadable(t *testing.T) {
	for status, want := range map[int]string{500: "HTTP 500", 401: "authentication"} {
		m := newMock(map[string]int{"currentsong": status})
		s, _ := connect(t, testConfig(m.URL, nil), secretKris)
		out, isErr := callTool(t, s, "now_playing", map[string]any{})
		if !isErr || !strings.Contains(out, want) {
			t.Errorf("status %d: isErr=%v out=%q", status, isErr, out)
		}
		m.Close()
	}

	// unreachable upstream
	s, _ := connect(t, testConfig("http://127.0.0.1:1", nil), secretKris)
	out, isErr := callTool(t, s, "now_playing", map[string]any{})
	if !isErr || !strings.Contains(out, "cannot reach") {
		t.Errorf("unreachable: %v %q", isErr, out)
	}
}

func TestEnqueueFileAndQueue(t *testing.T) {
	old := fixtures["queue"]
	fixtures["queue"] = `{"queue":[{"id":"7","file":"A/1.flac","title":"One","duration":180.5},{"id":"8","file":"A/2.flac"}],"current_id":"7"}`
	defer func() { fixtures["queue"] = old }()
	m := newMock(nil)
	defer m.Close()
	s, _ := connect(t, testConfig(m.URL, nil), secretKris)

	if _, isErr := callTool(t, s, "enqueue_file", map[string]any{"path": "A/1.flac"}); isErr {
		t.Fatal("enqueue failed")
	}
	if c := m.last(); c.Path != "/addplay" || c.Query.Get("file") != "A/1.flac" || c.Query.Get("directory") != "" {
		t.Errorf("wrong upstream call: %+v", c)
	}
	n := len(m.calls)
	for _, bad := range []string{"", "/etc/passwd", "../x", "http://x/y.mp3"} {
		if _, isErr := callTool(t, s, "enqueue_file", map[string]any{"path": bad}); !isErr {
			t.Errorf("%q should be refused", bad)
		}
	}
	if len(m.calls) != n {
		t.Error("invalid paths must not reach the upstream")
	}

	out, _ := callTool(t, s, "get_queue", map[string]any{})
	items := decode(t, out)["items"].([]any)
	first := items[0].(map[string]any)
	if len(items) != 2 || first["playing"] != true || first["duration_s"] != 180.5 || items[1].(map[string]any)["playing"] != false {
		t.Errorf("queue shape: %v", items)
	}
}
