package main

import (
	"context"
	"errors"
	"strconv"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type toggleOutputInput struct {
	OutputID string `json:"outputid" jsonschema:"Output id from list_outputs"`
}

type muteInput struct {
	ID    string `json:"id" jsonschema:"Client id from list_snapcast_clients"`
	Muted bool   `json:"muted" jsonschema:"true = mute, false = unmute (the target state)"`
}

func (e *toolEnv) registerOutputs(s *mcp.Server, cfg *Config) {
	addTool(s, cfg, "list_outputs", "List the MPD audio outputs and whether each is enabled.", false,
		func(ctx context.Context, _ noInput) (any, error) {
			np, err := e.state(ctx)
			if err != nil {
				return nil, err
			}
			return append([]Output{}, np.Outputs...), nil
		})

	addTool(s, cfg, "toggle_output",
		"Enable or disable one MPD output (it flips the current state). Get the id from list_outputs.", true,
		func(ctx context.Context, in toggleOutputInput) (any, error) {
			if in.OutputID == "" {
				return nil, errors.New("outputid is required")
			}
			if _, err := e.api.Get(ctx, "toggleoutput", q("output", in.OutputID), false); err != nil {
				return nil, err
			}
			np, err := e.state(ctx)
			if err != nil {
				return nil, err
			}
			return append([]Output{}, np.Outputs...), nil
		})

	addTool(s, cfg, "list_snapcast_clients", "List the Snapcast clients (speakers/rooms) and whether each is muted.", false,
		func(ctx context.Context, _ noInput) (any, error) {
			np, err := e.state(ctx)
			if err != nil {
				return nil, err
			}
			if np.SnapcastClients == nil {
				return "Snapcast is not configured on this audioloader, or nothing is playing.", nil
			}
			return np.SnapcastClients, nil
		})

	addTool(s, cfg, "set_snapcast_mute", "Mute or unmute one Snapcast client. Get the id from list_snapcast_clients.", true,
		func(ctx context.Context, in muteInput) (any, error) {
			if in.ID == "" {
				return nil, errors.New("id is required")
			}
			if _, err := e.api.Get(ctx, "togglesnapcastclient", q("id", in.ID, "muted", strconv.FormatBool(in.Muted)), false); err != nil {
				return nil, err
			}
			np, err := e.state(ctx)
			if err != nil {
				return nil, err
			}
			return append([]SnapClient{}, np.SnapcastClients...), nil
		})
}
