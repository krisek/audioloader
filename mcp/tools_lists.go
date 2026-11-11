package main

import (
	"context"
	"errors"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func (e *toolEnv) dirList(ctx context.Context, endpoint string, newestFirst bool) (any, error) {
	body, err := e.api.Get(ctx, endpoint, nil, true)
	if err != nil {
		return nil, err
	}
	l := formatDirList(body)
	if newestFirst { // the server stores history oldest first
		l = reverse(l)
	}
	return limit(l), nil
}

func (e *toolEnv) registerLists(s *mcp.Server, cfg *Config) {
	addTool(s, cfg, "get_favourites", "List the favourite albums of the configured user.", false,
		func(ctx context.Context, _ noInput) (any, error) { return e.dirList(ctx, "favourites", false) })

	addTool(s, cfg, "get_history", "List recently played albums of the configured user, newest first.", false,
		func(ctx context.Context, _ noInput) (any, error) { return e.dirList(ctx, "history", true) })

	addTool(s, cfg, "get_random_set", "Show the current random set of albums (12 albums from different artists).", false,
		func(ctx context.Context, _ noInput) (any, error) { return e.dirList(ctx, "randomset", false) })

	addTool(s, cfg, "new_random_set", "Generate a fresh random set of albums and return it. Replaces the previous set.", true,
		func(ctx context.Context, _ noInput) (any, error) {
			body, err := e.api.Get(ctx, "generate_randomset", nil, true)
			if err != nil {
				return nil, err
			}
			if r := str(parse(body)["result"]); r != "" && r != "ok" {
				return nil, errors.New("the server could not generate a random set")
			}
			return e.dirList(ctx, "randomset", false)
		})

	addTool(s, cfg, "add_favourite", "Add an album to the favourites.", true,
		func(ctx context.Context, in pathInput) (any, error) {
			if err := requireText(in.Path, "path is required", 1); err != nil {
				return nil, err
			}
			if _, err := e.api.Get(ctx, "add_favourite", q("directory", in.Path), true); err != nil {
				return nil, err
			}
			return obj{"favourited": in.Path}, nil
		})

	addTool(s, cfg, "remove_favourite", "Remove an album from the favourites.", true,
		func(ctx context.Context, in pathInput) (any, error) {
			if err := requireText(in.Path, "path is required", 1); err != nil {
				return nil, err
			}
			if _, err := e.api.Get(ctx, "remove_favourite", q("directory", in.Path), true); err != nil {
				return nil, err
			}
			return obj{"removed": in.Path}, nil
		})
}
