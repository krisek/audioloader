package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// toolEnv is what every tool handler gets: the user's upstream client.
type toolEnv struct {
	api *Client
}

// addTool registers one tool. Write tools are skipped in read-only mode.
// Handler results are marshalled to indented JSON text; errors become readable tool errors.
func addTool[In any](s *mcp.Server, cfg *Config, name, desc string, write bool, h func(context.Context, In) (any, error)) {
	if write && cfg.ReadOnly {
		return
	}
	tool := &mcp.Tool{
		Name:        name,
		Description: desc,
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: !write},
	}
	mcp.AddTool(s, tool, func(ctx context.Context, _ *mcp.CallToolRequest, in In) (*mcp.CallToolResult, any, error) {
		out, err := h(ctx, in)
		if err != nil {
			return nil, nil, err
		}
		var text string
		if s, ok := out.(string); ok {
			text = s
		} else {
			b, merr := json.MarshalIndent(out, "", "  ")
			if merr != nil {
				return nil, nil, merr
			}
			text = string(b)
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}, nil, nil
	})
}

type noInput struct{}

type pathInput struct {
	Path string `json:"path" jsonschema:"Exact library path of the album, e.g. Artist/Album"`
}

var errInvalidFile = errors.New("path must be a relative library path")

func requireText(v, what string, min int) error {
	if len(strings.TrimSpace(v)) < min {
		return errors.New(what)
	}
	return nil
}

func q(kv ...string) url.Values {
	v := url.Values{}
	for i := 0; i+1 < len(kv); i += 2 {
		v.Set(kv[i], kv[i+1])
	}
	return v
}

// NewServer builds an MCP server whose tools act for one audioloader user.
func NewServer(cfg *Config, api *Client) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "audioloader", Version: "0.2.0"}, nil)
	env := &toolEnv{api: api}
	env.registerPlayback(s, cfg)
	env.registerLibrary(s, cfg)
	env.registerLists(s, cfg)
	env.registerStreams(s, cfg)
	env.registerQueue(s, cfg)
	env.registerOutputs(s, cfg)
	return s
}
