package main

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type browseInput struct {
	Path string `json:"path,omitempty" jsonschema:"Library path such as Artist/Album, or . for the root (default)"`
}

type searchInput struct {
	Query string `json:"query" jsonschema:"Search text, at least 3 characters"`
}

type foldersTracks struct {
	Path    string          `json:"path,omitempty"`
	Query   string          `json:"query,omitempty"`
	Folders Limited[Folder] `json:"folders"`
	Tracks  Limited[Track]  `json:"tracks"`
}

func (e *toolEnv) registerLibrary(s *mcp.Server, cfg *Config) {
	addTool(s, cfg, "browse_folder",
		"List the sub-folders and tracks inside a music library folder. Use \".\" for the library root. Albums are leaf folders that contain tracks. Results are capped at 50 entries per kind.",
		false, func(ctx context.Context, in browseInput) (any, error) {
			p := in.Path
			if p == "" {
				p = "."
			}
			body, err := e.api.Get(ctx, "ls", q("directory", p), false)
			if err != nil {
				return nil, err
			}
			f, t := formatTree(body)
			return foldersTracks{Path: p, Folders: limit(f), Tracks: limit(t)}, nil
		})

	addTool(s, cfg, "search_library",
		"Search the music library for folders and tracks by text (artist, album or track). Requires at least 3 characters. Results are capped at 50 entries per kind.",
		false, func(ctx context.Context, in searchInput) (any, error) {
			if err := requireText(in.Query, "query needs at least 3 characters", 3); err != nil {
				return nil, err
			}
			body, err := e.api.Get(ctx, "search", q("pattern", in.Query), false)
			if err != nil {
				return nil, err
			}
			f, t := formatTree(body)
			return foldersTracks{Query: in.Query, Folders: limit(f), Tracks: limit(t)}, nil
		})

	addTool(s, cfg, "play_album",
		"Play an album (library folder). Adds the album to the play queue (after a short loading sound) and starts playback; it is recorded in the history.",
		true, func(ctx context.Context, in pathInput) (any, error) {
			if err := requireText(in.Path, "path is required", 1); err != nil {
				return nil, err
			}
			if _, err := e.api.Get(ctx, "addplay", q("directory", in.Path), true); err != nil {
				return nil, err
			}
			return obj{"started": in.Path}, nil
		})
}
