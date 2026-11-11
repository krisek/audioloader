package main

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func (e *toolEnv) state(ctx context.Context) (NowPlaying, error) {
	body, err := e.api.Get(ctx, "currentsong", nil, false)
	if err != nil {
		return NowPlaying{}, err
	}
	return formatNowPlaying(body), nil
}

func (e *toolEnv) registerPlayback(s *mcp.Server, cfg *Config) {
	addTool(s, cfg, "now_playing",
		"Show what audioloader is playing right now: state (play/pause/stop), title, artist and album, elapsed and total seconds, volume, MPD outputs and Snapcast clients.",
		false, func(ctx context.Context, _ noInput) (any, error) { return e.state(ctx) })

	commands := []struct{ name, endpoint, desc string }{
		{"play", "play", "Start or resume playback of the current queue."},
		{"pause", "pause", "Pause playback."},
		{"play_pause", "playpause", "Toggle between playing and paused."},
		{"next", "next", "Skip to the next track."},
		{"previous", "prev", "Go back to the previous track."},
		{"stop", "stop", "Stop playback."},
	}
	for _, c := range commands {
		endpoint := c.endpoint
		addTool(s, cfg, c.name, c.desc+" Returns the new playback state.", true,
			func(ctx context.Context, _ noInput) (any, error) {
				if _, err := e.api.Get(ctx, endpoint, nil, false); err != nil {
					return nil, err
				}
				return e.state(ctx)
			})
	}
}
