package main

import (
	"context"
	"errors"
	"net/url"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type radioSearchInput struct {
	Query string `json:"query" jsonschema:"Station name to search for, at least 3 characters"`
}

type playRadioInput struct {
	StationUUID string `json:"stationuuid" jsonschema:"stationuuid as returned by search_radio"`
	URL         string `json:"url" jsonschema:"Stream URL"`
	Name        string `json:"name" jsonschema:"Station name"`
	Favicon     string `json:"favicon,omitempty" jsonschema:"Station logo URL (optional)"`
}

type lookupInput struct {
	URL string `json:"url" jsonschema:"Bandcamp album, or YouTube/youtu.be URL"`
}

type playBandcampInput struct {
	URL   string `json:"url" jsonschema:"Bandcamp or YouTube URL"`
	Title string `json:"title" jsonschema:"Album title (from lookup_bandcamp)"`
	Art   string `json:"art,omitempty" jsonschema:"Cover URL (from lookup_bandcamp)"`
}

func validHTTPURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func (e *toolEnv) registerStreams(s *mcp.Server, cfg *Config) {
	addTool(s, cfg, "search_radio",
		"Search internet radio stations (radio-browser.info) by name. Use the returned stationuuid, url, name and favicon with play_radio.",
		false, func(ctx context.Context, in radioSearchInput) (any, error) {
			if err := requireText(in.Query, "query needs at least 3 characters", 3); err != nil {
				return nil, err
			}
			body, err := e.api.Get(ctx, "search_radio", q("pattern", in.Query), false)
			if err != nil {
				return nil, err
			}
			return limit(formatRadioSearch(body)), nil
		})

	addTool(s, cfg, "play_radio",
		"Play a radio station. Adds it to the play queue and starts playback. Pass the fields exactly as returned by search_radio or get_radio_history.",
		true, func(ctx context.Context, in playRadioInput) (any, error) {
			if in.StationUUID == "" || in.Name == "" || !validHTTPURL(in.URL) {
				return nil, errors.New("stationuuid, name and a valid http(s) url are required")
			}
			_, err := e.api.Get(ctx, "addplay", q("url", in.URL, "name", in.Name, "stationuuid", in.StationUUID, "favicon", in.Favicon), true)
			if err != nil {
				return nil, err
			}
			return obj{"started": in.Name}, nil
		})

	addTool(s, cfg, "get_radio_history", "List recently played radio stations, newest first.", false,
		func(ctx context.Context, _ noInput) (any, error) {
			body, err := e.api.Get(ctx, "radio_history", nil, true)
			if err != nil {
				return nil, err
			}
			return limit(formatRadioHistory(body)), nil
		})

	addTool(s, cfg, "lookup_bandcamp",
		"Resolve a Bandcamp or YouTube URL to its title, artist and cover. Needs yt-dlp on the server. Use the result with play_bandcamp.",
		false, func(ctx context.Context, in lookupInput) (any, error) {
			if !validHTTPURL(in.URL) {
				return nil, errors.New("a valid http(s) url is required")
			}
			body, err := e.api.Get(ctx, "search_bandcamp", q("pattern", in.URL), false)
			if err != nil {
				return nil, err
			}
			return formatBandcampLookup(body)
		})

	addTool(s, cfg, "play_bandcamp",
		"Play a Bandcamp or YouTube URL. Adds it to the play queue and starts playback. Use lookup_bandcamp first to get the title and cover.",
		true, func(ctx context.Context, in playBandcampInput) (any, error) {
			if in.Title == "" || !validHTTPURL(in.URL) {
				return nil, errors.New("title and a valid http(s) url are required")
			}
			// Same parameters the web UI sends: name = title, favicon = cover.
			if _, err := e.api.Get(ctx, "addplay", q("url", in.URL, "name", in.Title, "favicon", in.Art), true); err != nil {
				return nil, err
			}
			return obj{"started": in.Title}, nil
		})

	addTool(s, cfg, "get_bandcamp_history", "List recently played Bandcamp/YouTube albums, newest first.", false,
		func(ctx context.Context, _ noInput) (any, error) {
			body, err := e.api.Get(ctx, "bandcamp_history", nil, true)
			if err != nil {
				return nil, err
			}
			return limit(formatBandcampHistory(body)), nil
		})
}
