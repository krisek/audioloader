package main

import (
	"context"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type fileInput struct {
	Path string `json:"path" jsonschema:"Exact library path of the track file, e.g. Artist/Album/01 Song.flac (see browse_folder or search_library)"`
}

func (e *toolEnv) registerQueue(s *mcp.Server, cfg *Config) {
	addTool(s, cfg, "get_queue",
		"List the tracks waiting in the play queue, in play order, and which one is playing now. Played tracks leave the queue.", false,
		func(ctx context.Context, _ noInput) (any, error) {
			body, err := e.api.Get(ctx, "queue", nil, false)
			if err != nil {
				return nil, err
			}
			o := parse(body)
			current := str(o["current_id"])
			items := []obj{}
			for _, it := range list(o["queue"]) {
				m, _ := it.(obj)
				entry := obj{"file": str(m["file"]), "playing": current != "" && str(m["id"]) == current}
				for _, k := range []string{"title", "artist", "album"} {
					if v := str(m[k]); v != "" {
						entry[k] = v
					}
				}
				if d := num(m["duration"]); d != nil && *d > 0 {
					entry["duration_s"] = *d
				}
				items = append(items, entry)
			}
			return limit(items), nil
		})

	addTool(s, cfg, "enqueue_file",
		"Append one track file from the library to the end of the play queue; playback starts if nothing is playing. Does not clear the queue and is not recorded in the history.", true,
		func(ctx context.Context, in fileInput) (any, error) {
			if err := requireText(in.Path, "path is required", 1); err != nil {
				return nil, err
			}
			if strings.HasPrefix(in.Path, "/") || strings.Contains(in.Path, "://") || strings.Contains(in.Path, "..") {
				return nil, errInvalidFile
			}
			if _, err := e.api.Get(ctx, "addplay", q("file", in.Path), false); err != nil {
				return nil, err
			}
			return obj{"enqueued": in.Path}, nil
		})
}
