package main

import (
	"fmt"
	"path"
	"strings"
)

type Folder struct {
	Path     string   `json:"path"`
	Songs    *float64 `json:"songs"`
	Duration string   `json:"duration,omitempty"`
}

type Track struct {
	File      string   `json:"file"`
	Title     string   `json:"title"`
	Track     string   `json:"track,omitempty"`
	DurationS *float64 `json:"duration_s"`
}

func folderOf(e obj) Folder {
	c := asObj(e["count"])
	return Folder{Path: str(e["directory"]), Songs: num(c["songs"]), Duration: str(c["playhours"])}
}

// formatTree splits /ls and /search results into folders and tracks.
func formatTree(body []byte) (folders []Folder, tracks []Track) {
	for _, item := range list(parse(body)["tree"]) {
		e := asObj(item)
		if _, ok := e["directory"]; ok {
			folders = append(folders, folderOf(e))
		} else if f, ok := e["file"]; ok {
			t := Track{File: str(f), Title: str(e["title"]), Track: str(e["track"]), DurationS: num(e["duration"])}
			if t.Title == "" {
				t.Title = path.Base(t.File)
			}
			tracks = append(tracks, t)
		}
	}
	return
}

// formatDirList handles /favourites, /history and /randomset, in server order.
func formatDirList(body []byte) []Folder {
	folders, _ := formatTree(body)
	return folders
}

type Station struct {
	Name        string   `json:"name"`
	BitrateKbps *float64 `json:"bitrate_kbps,omitempty"`
	StationUUID string   `json:"stationuuid"`
	URL         string   `json:"url"`
	Favicon     string   `json:"favicon,omitempty"`
}

func formatRadioSearch(body []byte) []Station {
	var out []Station
	for _, item := range list(parse(body)["tree"]) {
		s := asObj(item)
		out = append(out, Station{Name: strings.TrimSpace(str(s["name"])), BitrateKbps: num(s["bitrate"]),
			StationUUID: str(s["stationuuid"]), URL: str(s["url"]), Favicon: str(s["favicon"])})
	}
	return out
}

// formatRadioHistory returns stations newest first. A user without history yields {"tree": []}.
func formatRadioHistory(body []byte) []Station {
	raw := parse(body)
	stations := asObj(raw["stations"])
	var out []Station
	for _, id := range list(raw["radio_history"]) {
		s := asObj(stations[str(id)])
		if s == nil {
			continue
		}
		out = append(out, Station{Name: str(s["name"]), StationUUID: str(s["stationuuid"]), URL: str(s["url"]), Favicon: str(s["favicon"])})
	}
	return reverse(out)
}

type Album struct {
	Title  string `json:"title"`
	Artist string `json:"artist,omitempty"`
	Date   string `json:"date,omitempty"`
	URL    string `json:"url"`
	Art    string `json:"art,omitempty"`
}

// formatBandcampHistory returns albums newest first. A user without history yields {}.
func formatBandcampHistory(body []byte) []Album {
	raw := parse(body)
	links := asObj(raw["links"])
	var out []Album
	for _, u := range list(raw["bandcamp_history"]) {
		l := asObj(links[str(u)])
		if l == nil {
			continue
		}
		a := Album{Title: str(l["title"]), Artist: str(l["artist"]), Date: str(l["date"]), URL: str(l["url"]), Art: str(l["favicon"])}
		if a.Title == "" {
			a.Title = a.URL
		}
		out = append(out, a)
	}
	return reverse(out)
}

// formatBandcampLookup returns the first match (the web UI only ever uses tree[0]).
func formatBandcampLookup(body []byte) (Album, error) {
	items := list(parse(body)["tree"])
	if len(items) == 0 {
		return Album{}, fmt.Errorf("nothing found for that URL (is yt-dlp installed on the server?)")
	}
	t := asObj(items[0])
	a := Album{Title: str(t["title"]), Artist: str(t["artist"]), URL: str(t["url"]), Art: str(t["art"])}
	if a.Title == "" {
		a.Title = a.URL
	}
	return a, nil
}
