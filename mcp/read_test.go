package main

import (
	"strings"
	"testing"
)

func TestNowPlayingNumbersAndUpstreamAuth(t *testing.T) {
	m := newMock(nil)
	defer m.Close()
	s, _ := connect(t, testConfig(m.URL, func(c *Config) { c.Cookie = "audioloadermagic=x"; c.Authorization = "Bearer tok" }), secretKris)

	out, isErr := callTool(t, s, "now_playing", map[string]any{})
	if isErr {
		t.Fatal(out)
	}
	o := decode(t, out)
	if o["elapsed_s"] != 12.5 || o["volume"] != 80.0 {
		t.Errorf("numbers not converted: %v", o)
	}
	if outs := o["outputs"].([]any); outs[0].(map[string]any)["enabled"] != true || outs[1].(map[string]any)["enabled"] != false {
		t.Errorf("outputs wrong: %v", outs)
	}
	c := m.last()
	if c.Header.Get("Cookie") != "audioloadermagic=x" || c.Header.Get("Authorization") != "Bearer tok" || c.Query.Get("mpd_port") != "6600" {
		t.Errorf("upstream request wrong: %+v", c)
	}
}

func TestReadShapes(t *testing.T) {
	m := newMock(nil)
	defer m.Close()
	s, _ := connect(t, testConfig(m.URL, nil), secretKris)

	out, _ := callTool(t, s, "browse_folder", map[string]any{"path": "A/B"})
	if m.last().Query.Get("directory") != "A/B" {
		t.Error("directory not sent")
	}
	tracks := decode(t, out)["tracks"].(map[string]any)["items"].([]any)
	if tracks[1].(map[string]any)["title"] != "02.flac" {
		t.Errorf("title fallback: %v", tracks)
	}

	out, _ = callTool(t, s, "get_history", map[string]any{})
	if first := decode(t, out)["items"].([]any)[0].(map[string]any)["path"]; first != "New/Album" {
		t.Errorf("history must be newest first, got %v", first)
	}

	out, _ = callTool(t, s, "get_radio_history", map[string]any{})
	if first := decode(t, out)["items"].([]any)[0].(map[string]any)["name"]; first != "New FM" {
		t.Errorf("radio history order: %v", first)
	}
}

func TestEmptyHistoriesDoNotFail(t *testing.T) {
	m := newMock(nil)
	defer m.Close()
	oldRadio := fixtures["radio_history"]
	fixtures["radio_history"] = `{"tree":[]}`
	defer func() { fixtures["radio_history"] = oldRadio }()
	// bandcamp_history has no fixture, so the mock answers with an empty body, like an empty user.

	s, _ := connect(t, testConfig(m.URL, nil), secretKris)
	for _, tool := range []string{"get_radio_history", "get_bandcamp_history"} {
		out, isErr := callTool(t, s, tool, map[string]any{})
		if isErr || decode(t, out)["total"] != 0.0 {
			t.Errorf("%s: %v %s", tool, isErr, out)
		}
	}
}

func TestListsAreCapped(t *testing.T) {
	var sb strings.Builder
	sb.WriteString(`{"tree":[`)
	for i := 0; i < 120; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`{"directory":"d"}`)
	}
	sb.WriteString(`]}`)
	old := fixtures["ls"]
	fixtures["ls"] = sb.String()
	defer func() { fixtures["ls"] = old }()

	m := newMock(nil)
	defer m.Close()
	s, _ := connect(t, testConfig(m.URL, nil), secretKris)
	out, _ := callTool(t, s, "browse_folder", map[string]any{})
	f := decode(t, out)["folders"].(map[string]any)
	if f["total"] != 120.0 || f["shown"] != 50.0 || f["truncated"] != true {
		t.Errorf("cap wrong: %v", f)
	}
}
