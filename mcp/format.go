package main

import (
	"encoding/json"
	"strconv"
)

// maxItems caps every list returned to the agent.
const maxItems = 50

type obj = map[string]any

// num converts MPD's stringly-typed numbers (and real numbers) to *float64; nil when absent or garbage.
func num(v any) *float64 {
	switch t := v.(type) {
	case float64:
		return &t
	case string:
		if f, err := strconv.ParseFloat(t, 64); err == nil {
			return &f
		}
	}
	return nil
}

func str(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	}
	return ""
}

func truthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return t == "1" || t == "true"
	case float64:
		return t != 0
	}
	return false
}

// parse decodes a JSON object body. An empty body or non-JSON text yields an empty object.
func parse(body []byte) obj {
	var o obj
	if json.Unmarshal(body, &o) != nil || o == nil {
		return obj{}
	}
	return o
}

func list(v any) []any {
	l, _ := v.([]any)
	return l
}

func asObj(v any) obj {
	o, _ := v.(map[string]any)
	return o
}

// Limited is a capped list that says when it was cut.
type Limited[T any] struct {
	Total     int  `json:"total"`
	Shown     int  `json:"shown"`
	Truncated bool `json:"truncated"`
	Items     []T  `json:"items"`
}

func limit[T any](items []T) Limited[T] {
	if items == nil {
		items = []T{}
	}
	l := Limited[T]{Total: len(items), Items: items}
	if len(items) > maxItems {
		l.Items = items[:maxItems]
		l.Truncated = true
	}
	l.Shown = len(l.Items)
	return l
}

func reverse[T any](s []T) []T {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
	return s
}

type Output struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type SnapClient struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
	Muted     bool   `json:"muted"`
}

type NowPlaying struct {
	State           string       `json:"state"`
	Active          bool         `json:"active"`
	Title           string       `json:"title"`
	ArtistAlbum     string       `json:"artist_album"`
	ElapsedS        *float64     `json:"elapsed_s"`
	DurationS       *float64     `json:"duration_s"`
	Volume          *float64     `json:"volume"`
	File            string       `json:"file,omitempty"`
	NextAction      string       `json:"next_action,omitempty"`
	Outputs         []Output     `json:"outputs,omitempty"`
	SnapcastClients []SnapClient `json:"snapcast_clients,omitempty"`
}

func formatOutputs(raw obj) []Output {
	var out []Output
	for _, e := range list(raw["outputs"]) {
		o := asObj(e)
		out = append(out, Output{ID: str(o["outputid"]), Name: str(o["outputname"]), Enabled: truthy(o["outputenabled"])})
	}
	return out
}

func formatSnapclients(raw obj) []SnapClient {
	var out []SnapClient
	for _, e := range list(raw["snapcast_clients"]) {
		o := asObj(e)
		connected := true
		if v, ok := o["connected"]; ok {
			connected = truthy(v)
		}
		out = append(out, SnapClient{ID: str(o["id"]), Name: str(o["name"]), Connected: connected, Muted: truthy(o["muted"])})
	}
	return out
}

func formatNowPlaying(body []byte) NowPlaying {
	raw := parse(body)
	np := NowPlaying{
		State:           str(raw["state"]),
		Active:          truthy(raw["active"]),
		Title:           str(raw["display_title"]),
		ArtistAlbum:     str(raw["display_title_top"]),
		ElapsedS:        num(raw["elapsed"]),
		DurationS:       num(raw["duration"]),
		Volume:          num(raw["volume"]),
		File:            str(raw["file"]),
		NextAction:      str(raw["next_state"]),
		Outputs:         formatOutputs(raw),
		SnapcastClients: formatSnapclients(raw),
	}
	if np.State == "" {
		np.State = "stop"
	}
	if np.Title == "" {
		np.Title = str(raw["title"])
	}
	if np.Title == "" {
		np.Title = "not playing"
	}
	return np
}
