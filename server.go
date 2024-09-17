package main

import (
    "encoding/json"
    "fmt"
    "github.com/krisek/gompd/mpd"
    "github.com/go-redis/redis/v8"
    "github.com/robfig/cron/v3"
    "github.com/rs/cors"
    "html/template"
    "net/http"
    "strconv"
    "os"
    "time"
    "strings"
    "context"
    "path/filepath"
    "regexp"
    "io/ioutil"
    "os/exec"
    "math/rand"
    "github.com/huin/goupnp"
    "github.com/huin/goupnp/dcps/av1"
    "net/url"
    "bytes"
    "github.com/PuerkitoBio/goquery"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type FileInfo struct {
    Directory    string                 `json:"directory,omitempty"`
    LastModified string                 `json:"last-modified"`
    Count        map[string]interface{} `json:"count,omitempty"`
    Artist       string                 `json:"artist,omitempty"`
    File         string                 `json:"file,omitempty"`
    Format       string                 `json:"format,omitempty"`
    Time         string                 `json:"time,omitempty"`

    Duration     string					`json:"duration,omitempty"`
    Genre        string					`json:"genre,omitempty"`
    Codec        string					`json:"codec,omitempty"`
    Track        string					`json:"track,omitempty"`
    Date         string					`json:"date,omitempty"`
    Album        string					`json:"album,omitempty"`
    Title        string					`json:"title,omitempty"`
    Stream       string                 `json:"stream,omitempty"`

}

var (
    ctx = context.Background()
    redisClient *redis.Client
    bandcampEnabled, _ = strconv.ParseBool(getEnv("AL_BANDCAMP_ENABLED", "true"))
    clientDB = getEnv("AL_CLIENT_DB", getEnv("HOME", "/tmp") + "/Music/audioloader-db")
    defaultStream = getEnv("AL_DEFAULT_STREAM", "http://" + os.Getenv("HOST") + ":8000/audio.ogg")
    mpdHost = getEnv("AL_MPD_HOST", "localhost")
    mpdPort = getEnv("AL_MPD_PORT", "6600")
    listeningPort = getEnv("AL_LISTENING_PORT", "3400")
    libraryPath = getEnv("AL_LIBRARY_PATH", getEnv("HOME", "/media") + "/Music" )
    logLevel = getEnv("AL_LOG_LEVEL", "info")
    maxBackoffDuration = 256 * time.Second // Maximum backoff of 256 seconds
    maxRetryDuration   = 1 * time.Hour     // Total maximum retry duration of 1 hour
)

// Helper function to get environment variables with a default value
func getEnv(key, defaultVal string) string {
    if value, exists := os.LookupEnv(key); exists {
        return value
    }
    return defaultVal
}

// getMPDClient creates a new MPD client connection using the provided host and port.
// It retries the connection in case of failure with an exponential backoff strategy.
func getMPDClient(host string, port string) (*mpd.Client, error) {
    if port == "" {
        port = mpdPort
    }
    address := fmt.Sprintf("%s:%s", host, port)
    
    var backoff time.Duration = 1 * time.Second
    var totalWaitTime time.Duration

    for {
        client, err := mpd.Dial("tcp", address)
        if err == nil {
            // Success! Return the client
            return client, nil
        }

        // Log the error
        log.Printf("Failed to connect to MPD server at %s: %v. Retrying in %v...", address, err, backoff)

        // Check if we've exceeded the maximum retry duration
        totalWaitTime += backoff
        if totalWaitTime >= maxRetryDuration {
            return nil, fmt.Errorf("could not connect to MPD server after multiple retries: %w", err)
        }

        // Sleep for the current backoff duration
        time.Sleep(backoff)

        // Increase the backoff time (exponential backoff)
        backoff *= 2
        if backoff > maxBackoffDuration {
            backoff = maxBackoffDuration // Cap the backoff at the max duration
        }
    }
}

func main() {

	// Configure zerolog
	var level zerolog.Level
	switch logLevel {
	case "debug":
		level = zerolog.DebugLevel
	case "info":
		level = zerolog.InfoLevel
	case "warn":
		level = zerolog.WarnLevel
	case "error":
		level = zerolog.ErrorLevel
	default:
		level = zerolog.WarnLevel
	}

	log.Logger = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: "2006-01-02 15:04:05"}).
		Level(level).With().
        Timestamp().
        Logger()

    // Initialize Redis client
    redisClient = redis.NewClient(&redis.Options{
        Addr: "localhost:6379",
        DB:   0,
    })

    // Initialize Cron scheduler
    c := cron.New()
    c.Start()

    fs := http.FileServer(http.Dir("./static"))
    http.Handle("/static/", http.StripPrefix("/static/", fs))

    // Set up HTTP routes
    http.HandleFunc("/cover", coverHandler)
    http.HandleFunc("/kodi", kodiHandler)
    http.HandleFunc("/upnp", upnpHandler)
    http.HandleFunc("/generate_randomset", generateRandomSetHandler)
    http.HandleFunc("/remove_favourite", favouritesHandler)
    http.HandleFunc("/add_favourite", favouritesHandler)
    http.HandleFunc("/active_players", activePlayersHandler)
    http.HandleFunc("/radio_history", radioHistoryHandler)
    http.HandleFunc("/bandcamp_history", bandcampHistoryHandler)
    http.HandleFunc("/history", dataHandler)
    http.HandleFunc("/randomset", dataHandler)
    http.HandleFunc("/favourites", dataHandler)
    http.HandleFunc("/search_radio", searchRadioHandler)
    http.HandleFunc("/search_bandcamp", searchBandcampHandler)
    http.HandleFunc("/remove_history", removeHistoryHandler)
    http.HandleFunc("/listfiles", mpdProxyHandler)
    http.HandleFunc("/lsinfo", mpdProxyHandler)
    http.HandleFunc("/ls", mpdProxyHandler)
    http.HandleFunc("/search", mpdProxyHandler)
    http.HandleFunc("/addplay", mpdProxyHandler)
    http.HandleFunc("/play", mpdProxyHandler)
    http.HandleFunc("/pause", mpdProxyHandler)
    http.HandleFunc("/playpause", mpdProxyHandler)
    http.HandleFunc("/next", mpdProxyHandler)
    http.HandleFunc("/prev", mpdProxyHandler)
    http.HandleFunc("/stop", mpdProxyHandler)
    http.HandleFunc("/status", mpdProxyHandler)
    http.HandleFunc("/poll_currentsong", pollCurrentSongHandler)
    http.HandleFunc("/currentsong", currentSongHandler)
    http.HandleFunc("/count", countHandler)
    http.HandleFunc("/toggleoutput", toggleOutputHandler)
    http.HandleFunc("/", catchAllHandler)

    // Enable CORS
    handler := cors.Default().Handler(http.DefaultServeMux)

    // Start HTTP server
    log.Info().Str("function", "main").Msg(fmt.Sprintf("Starting server on: http://localhost:%v/", listeningPort))
    http.ListenAndServe(":" + listeningPort, handler)
    // log.Fatal()
}

func coverHandler(w http.ResponseWriter, r *http.Request) {
    directory := r.URL.Query().Get("directory")
    log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Getting cover for: %s", directory))

    responseType := r.URL.Query().Get("response_type")
    if responseType == "" {
        responseType = "direct"
    }
    cover := "vinyl.webp"

    // Connect to Redis
    rdb := redis.NewClient(&redis.Options{
        Addr:     "localhost:6379",
        Password: "", // no password set
        DB:       0,  // use default DB
    })

    ctx := context.Background()

    // Attempt to get the cover from Redis
    val, err := rdb.Get(ctx, "audioloader:cover:"+directory).Result()
    if err == redis.Nil {
        cover = "vinyl.webp"
    } else if err != nil {
        log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Redis error: %v", err))
        cover = "vinyl.webp"
    } else {
        cover = val
        log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Got cover from Redis: %s", cover))
    }

    // If the cover is not found, search the MPD directory
    if cover == "vinyl.webp" || cover == "" {
        mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))
        dirContent, err := mpdClient.ListFiles(directory)
        mpdClient.Close()

        if err != nil {
            log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Error listing files: %v", err))
            http.Error(w, "Failed to list files", http.StatusInternalServerError)
            return
        }
        
        imagePattern := regexp.MustCompile(`\.(jpg|jpeg|png|gif)$`)
        coverPattern := regexp.MustCompile(`(?i)folder|cover|front`)

        images := []string{}
        for _, fileData := range dirContent {
            file := fileData["file"]
            if imagePattern.MatchString(file) {
                images = append(images, file)
            }
        }


        log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Found images: %v", images))
        for _, image := range images {
            if coverPattern.MatchString(image) {
                cover = image
                break
            }
        }

        if cover == "vinyl.webp" && len(images) > 0 {
            cover = images[0]
        }

        log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Selected cover: %s", cover))

        // Save the cover in Redis
        if err := rdb.Set(ctx, "audioloader:cover:"+directory, cover, 0).Err(); err != nil {
            log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Error setting cover in Redis: %v", err))
        }
    }

    // Determine response
    if responseType == "redirect" {
        var fullPath string
        if cover == "vinyl.webp" {
            fullPath = "/static/assets/vinyl.webp"
        } else {
            fullPath = "/music" + "/" + directory + "/" + cover
        }
        http.Redirect(w, r, fullPath, http.StatusFound)
    } else {
        var coverPath string
        if cover == "vinyl.webp" {
            coverPath = "./static/assets/vinyl.webp"
        } else {
            coverPath = filepath.Join(libraryPath, directory, cover)		
        }
        if _, err := os.Stat(coverPath); os.IsNotExist(err) {
            log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Cover not found, falling back to default: %v", coverPath))
            coverPath = "./static/assets/vinyl.webp"
        }
        log.Debug().Str("function", "coverHandler").Msg(fmt.Sprintf("Serving cover: %v", coverPath))
        http.ServeFile(w, r, coverPath)
    }
}

type ClientData struct {
    History []string `json:"history,omitempty"`
    Randomset []string `json:"randomset,omitempty"`
    Favourites []string `json:"favourites,omitempty"`
    RadioHistory []string `json:"radio_history,omitempty"`
    BandcampHistory []string `json:"bandcamp_history,omitempty"`
    Stations        map[string]StationData `json:"stations,omitempty"`
    Links        map[string]LinkData `json:"links,omitempty"`
}

// StationData holds individual radio station info.
type StationData struct {
    URL        string `json:"url"`
    StationUUID string `json:"stationuuid"`
    Name       string `json:"name"`
    Favicon    string `json:"favicon"`
}

// LinkData holds individual bandcamp album info.
type LinkData struct {
    URL        string `json:"url"`
    Title       string `json:"title"`
    Favicon    string `json:"favicon"`
    Artist    string `json:"artist"`
    Date    string `json:"date"`
}

// readData reads the client's data from a JSON file.
// readData reads client data from a JSON file and returns a ClientData struct.
func readData(clientID string, dataType string) (ClientData, error) {
    // Construct the file path
    clientDataFile := filepath.Join(clientDB, fmt.Sprintf("%s.%s.json", clientID, dataType))

    // Validate clientID and file path
    if clientID == "" || !filepath.HasPrefix(clientDataFile, clientDB) {
        return ClientData{}, fmt.Errorf("invalid clientID or file path")
    }

    // Check for invalid characters in the clientID
    if !regexp.MustCompile(`^[A-Za-z0-9_\-\.]+$`).MatchString(clientID) {
        return ClientData{}, fmt.Errorf("invalid characters in clientID")
    }

    // Read the file
    data, err := ioutil.ReadFile(clientDataFile)
    if err != nil {
        log.Debug().Str("function", "readData").Msg(fmt.Sprintf("Error %s for %s not readable: %v\n", dataType, clientID, err))
        return ClientData{}, fmt.Errorf("not readable")
    }

    // Unmarshal JSON into ClientData struct
    var clientdata ClientData
    if err := json.Unmarshal(data, &clientdata); err != nil {
        log.Debug().Str("function", "readData").Msg(fmt.Sprintf("Error parsing JSON for %s: %v\n", clientID, err))
        return ClientData{}, fmt.Errorf("Cannot encode")
    }

    return clientdata, nil
}

func reverse(s []map[string]interface{}) []map[string]interface{} {
    a := make([]map[string]interface{}, len(s))
    for i, v := range s {
        a[len(s)-1-i] = v
    }
    return a
}

func getRadioStationURL(stationUUID string) string {
    // Placeholder for pyradios implementation
    // Replace this with the actual implementation later
    return ""
}

func kodiHandler(w http.ResponseWriter, r *http.Request) {
    // Implement Kodi handler
}

// Define constants or use environment/config variables as needed
var defaultStreamURL = "http://localhost:8000/audio.ogg"

// upnpHandler manages both UPnP and MPD control
func upnpHandler(w http.ResponseWriter, r *http.Request) {
    server := r.URL.Query().Get("server")
    if server == "" || server == "undefined" {
        json.NewEncoder(w).Encode(map[string]string{"result": "no server given"})
        return
    }

    action := r.URL.Query().Get("action")
    if action == "" {
        action = "Player.Stop"
    }
    streamURL := r.URL.Query().Get("stream")
    if streamURL == "" {
        streamURL = defaultStreamURL
    }

    if strings.Contains(server, "upnp") || strings.Contains(server, "xml") {
        // Handle UPnP device actions
        err := handleUPnP(server, action, streamURL)
        if err != nil {
            log.Debug().Str("function", "upnpHandler").Msg(fmt.Sprintf("UPnP Error: %v", err))
            json.NewEncoder(w).Encode(map[string]string{"result": "load failed"})
            return
        }
    } else if strings.Contains(server, "_6600") {
        // Handle MPD device actions
        err := handleMPD(server, action, streamURL)
        if err != nil {
            log.Debug().Str("function", "upnpHandler").Msg(fmt.Sprintf("MPD Error: %v", err))
            json.NewEncoder(w).Encode(map[string]string{"result": "load failed"})
            return
        }
    } else {
        // No matching device type
        json.NewEncoder(w).Encode(map[string]string{"result": "unsupported server"})
        return
    }

    // Success response
    json.NewEncoder(w).Encode(map[string]string{"result": "loaded"})
}

// handleUPnP controls UPnP devices using the AVTransport service
func handleUPnP(server, action, streamURL string) error {
    // Parse the server URL
    parsedURL, err := url.Parse(server)
    if err != nil {
        return fmt.Errorf("failed to parse server URL: %v", err)
    }

    // Discover and connect to the UPnP device
    device, err := goupnp.DeviceByURL(parsedURL)
    if err != nil {
        return fmt.Errorf("failed to discover UPnP device: %v", err)
    }

    // Parse the device's URLBase into *url.URL
    deviceURL, err := url.Parse(device.URLBase.String())
    if err != nil {
        return fmt.Errorf("failed to parse device URLBase: %v", err)
    }

    // Access the AVTransport service
    transport, err := av1.NewAVTransport1ClientsByURL(deviceURL)
    if err != nil || len(transport) == 0 {
        return fmt.Errorf("failed to connect to AVTransport service: %v", err)
    }

    client := transport[0] // Assuming there is at least one transport client

    // Perform action based on the provided action string
    switch action {
    case "Player.Open":
        // Set the URI for playback and start playing
        err := client.SetAVTransportURI(0, streamURL, "Audioloader")
        if err != nil {
            return fmt.Errorf("failed to set AVTransport URI: %v", err)
        }
        err = client.Play(0, "1")
        if err != nil {
            return fmt.Errorf("failed to start playback: %v", err)
        }
    default:
        // Stop playback
        err := client.Stop(0)
        if err != nil {
            return fmt.Errorf("failed to stop playback: %v", err)
        }
    }

    return nil
}

// handleMPD controls MPD servers
func handleMPD(server, action, streamURL string) error {
    // Parse MPD host and port
    mpdHostPort := strings.Split(server, "_")
    if len(mpdHostPort) != 2 {
        return fmt.Errorf("invalid MPD server format")
    }
    mpdHost := mpdHostPort[0]
    mpdPort := mpdHostPort[1]

    // Get MPD client
    mpdClient, err := getMPDClient(mpdHost, mpdPort)
    if err != nil {
        return fmt.Errorf("failed to connect to MPD: %v", err)
    }
    defer mpdClient.Close()

    switch action {
    case "Player.Open":
        err = mpdClient.Clear()
        if err != nil {
            return fmt.Errorf("failed to clear playlist: %v", err)
        }
        err = mpdClient.Add(streamURL)
        if err != nil {
            return fmt.Errorf("failed to add stream to playlist: %v", err)
        }
        err = mpdClient.Play(-1)
        if err != nil {
            return fmt.Errorf("failed to start playback: %v", err)
        }
    default:
        err = mpdClient.Stop()
        if err != nil {
            return fmt.Errorf("failed to stop playback: %v", err)
        }
    }

    return nil
}

func randomChoice(albums []string, k int) []string {
    n := len(albums)
    if k >= n {
        k = n
    }
    shuffled := make([]string, n)
    copy(shuffled, albums)
    rand.Shuffle(n, func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
    return shuffled[:k]
}

func uniqueStrings(input []string) []string {
    uniqueMap := make(map[string]bool)
    var result []string
    for _, item := range input {
        if _, exists := uniqueMap[item]; !exists {
            uniqueMap[item] = true
            result = append(result, item)
        }
    }
    return result
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}

func isValidFileName(fileName string) bool {
    return regexp.MustCompile(`^[A-Za-z0-9_\-\.\/]+$`).MatchString(fileName)
}


func generateRandomSet(w http.ResponseWriter, r *http.Request) bool {
    clientID := r.URL.Query().Get("client_id")
    
    filter := r.URL.Query().Get("set_filter")
    clientData := ClientData{Randomset: []string{}}
    artists := make(map[string]bool)
    mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))
    albums, err := mpdClient.List("album")
    if err != nil {
        log.Debug().Str("function", "generateRandomSet").Msg(fmt.Sprintf("Error listing albums: %v\n", err))
        http.Error(w, "failed to generate randomset", http.StatusInternalServerError)
        return false
    }
    
    rand.Seed(time.Now().UnixNano()) // Seed for randomness

    for i := 0; len(clientData.Randomset) < 12 && i < 20; i++ {
        randomAlbums := randomChoice(albums, 12) // Get 12 random albums
        
        for _, album := range randomAlbums {
            albumData, err := mpdClient.Search("album", album)
            if err != nil {
                log.Debug().Str("function", "").Msg(fmt.Sprintf("Error searching album %s: %v\n", album, err))
                continue
            }

            if len(albumData) == 0 {
                continue
            }

            artist := albumData[0]["Artist"]
            if _, exists := artists[artist]; exists {
                continue
            }

            if filter == "" || !regexp.MustCompile(filter).MatchString(albumData[0]["file"]) {
                clientData.Randomset = append(clientData.Randomset, filepath.Dir(albumData[0]["file"]))
                artists[artist] = true
            }
        }
    }

    // Ensure randomset has unique albums and limit to 12
    clientData.Randomset = uniqueStrings(clientData.Randomset)[:min(12, len(clientData.Randomset))]
    log.Debug().Str("function", "generateRandomSet").Msg(fmt.Sprintf("clientdata unique - %v", clientData.Randomset))

    // Save to file
    clientDataFile := filepath.Join(clientDB, fmt.Sprintf("%s.randomset.json", clientID))

    log.Debug().Str("function", "generateRandomSet").Msg(fmt.Sprintf("clientDataFile - %v", clientDataFile))
    log.Debug().Str("function", "generateRandomSet").Msg(fmt.Sprintf("filepath.HasPrefix(clientDataFile, clientDB)- %v %v", filepath.HasPrefix(clientDataFile, clientDB), isValidFileName(clientDataFile)))
    if clientID != "" && filepath.HasPrefix(clientDataFile, clientDB) && isValidFileName(clientDataFile) {
        file, err := os.Create(clientDataFile)
        log.Debug().Str("function", "generateRandomSet").Msg(fmt.Sprintf("clientDataFile created %v", clientDataFile))
        if err != nil {
            log.Debug().Str("function", "generateRandomSet").Msg(fmt.Sprintf("Error writing randomset file: %v\n", err))
            http.Error(w, "failed to save randomset", http.StatusInternalServerError)
            return false
        }
        defer file.Close()

        encoder := json.NewEncoder(file)
        if err := encoder.Encode(clientData); err != nil {
            log.Debug().Str("function", "generateRandomSet").Msg(fmt.Sprintf("Error encoding JSON: %v\n", err))
            http.Error(w, "failed to save randomset", http.StatusInternalServerError)
            return false
        }
    }
    mpdClient.Close()
    return true

}

func generateRandomSetHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    if(generateRandomSet(w, r)){
        w.Write([]byte(`{"result": "ok"}`))
    } else {
        w.Write([]byte(`{"result": "nok"}`))
    }



}

// WriteData writes client data to a formatted JSON file.
func writeData(clientID, dataType string, clientData ClientData) error {
    clientDataFile := filepath.Join(clientDB, fmt.Sprintf("%s.%s.json", clientID, dataType))

    if clientID == "" || !filepath.HasPrefix(clientDataFile, clientDB) {
        return fmt.Errorf("invalid clientID or file path")
    }

    if !regexp.MustCompile(`^[A-Za-z0-9_\-\.]+$`).MatchString(clientID) {
        return fmt.Errorf("invalid characters in clientID")
    }

    // Use json.MarshalIndent to write formatted (indented) JSON
    data, err := json.MarshalIndent(clientData, "", "    ") // 4-space indentation
    if err != nil {
        return err
    }

    return os.WriteFile(clientDataFile, data, 0644)
}

// FavouritesHandler handles adding or removing favourites.
func favouritesHandler(w http.ResponseWriter, r *http.Request) {
    clientID := r.URL.Query().Get("client_id")
    if clientID == "" {
        http.Error(w, "client_id is required", http.StatusBadRequest)
        return
    }

    directory := r.URL.Query().Get("directory")
    if directory == "" {
        directory = "."
    }

    // Read existing favourites data
    clientData, err := readData(clientID, "favourites")
    if err != nil {
        log.Error().Str("function", "favouritesHandler").Msg(fmt.Sprintf("readData failed for favourites %s: %v\n", clientID, err))
        // http.Error(w, "Failed to load favourites", http.StatusInternalServerError)
        // return
    }

    if clientData.Favourites == nil {
        clientData.Favourites = []string{}
    }	

    // Handle adding or removing favourite
    path := r.URL.Path
    if path == "/add_favourite" {
        if !contains(clientData.Favourites, directory) {
            clientData.Favourites = append(clientData.Favourites, directory)
        }
    } else if path == "/remove_favourite" {
        clientData.Favourites = remove(clientData.Favourites, directory)
    } else {
        http.Error(w, "Invalid endpoint", http.StatusBadRequest)
        return
    }

    // Write updated data back to the file
    if err := writeData(clientID, "favourites", clientData); err != nil {
        log.Error().Str("function", "favouritesHandler").Msg(fmt.Sprintf("writeData failed for favourites %s: %v\n", clientID, err))
        http.Error(w, "Failed to save favourites", http.StatusInternalServerError)
        return
    }

    // Respond with success
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"result": "ok"})
}

// Helper function to check if a slice contains a specific item
func contains(slice []string, item string) bool {
    for _, a := range slice {
        if a == item {
            return true
        }
    }
    return false
}

// Helper function to remove an item from a slice
func remove(slice []string, item string) []string {
    for i, a := range slice {
        if a == item {
            return append(slice[:i], slice[i+1:]...)
        }
    }
    return slice
}

// ActivePlayersHandler handles requests to retrieve active players
func activePlayersHandler(w http.ResponseWriter, r *http.Request) {
    players := getActivePlayers()

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(players)
}

func radioHistoryHandler(w http.ResponseWriter, r *http.Request) {
    clientID := r.URL.Query().Get("client_id")
    if clientID == "" {
        http.Error(w, "client_id is required", http.StatusBadRequest)
        return
    }

    clientData, err := readData(clientID, "radio_history")
    if err != nil {
        log.Error().Str("function", "radioHistoryHandler").Msg(fmt.Sprintf("readData failed for radio_history %s: %v\n", clientID, err))
        json.NewEncoder(w).Encode(map[string]interface{}{
            "tree": []interface{}{},
            "info": map[string]interface{}{},
            })
        return
    }

    // Return the clientData in JSON format
    w.Header().Set("Content-Type", "application/json")
    if err := json.NewEncoder(w).Encode(clientData); err != nil {
        log.Error().Str("function", "radioHistoryHandler").Msg(fmt.Sprintf("Failed to encode radio history data for %s: %v\n", clientID, err))
        json.NewEncoder(w).Encode(map[string]interface{}{
            "tree": []interface{}{},
            "info": map[string]interface{}{},
            })
        return
    }
}

func bandcampHistoryHandler(w http.ResponseWriter, r *http.Request) {
    clientID := r.URL.Query().Get("client_id")
    if clientID == "" {
        http.Error(w, "client_id is required", http.StatusBadRequest)
        return
    }

    clientData, err := readData(clientID, "bandcamp_history")
    w.Header().Set("Content-Type", "application/json")

    if err != nil {
        log.Error().Str("function", "bandcampHistoryHandler").Msg(fmt.Sprintf("readData failed for bandcamp_history %s: %v\n", clientID, err))
        // http.Error(w, "Failed to load bandcamp history", http.StatusInternalServerError)
        // return
        json.NewEncoder(w).Encode(map[string]interface{}{
            "tree": []interface{}{},
            "info": map[string]interface{}{},
            })
        return
    }

    // Return the clientData in JSON format
    
    if err := json.NewEncoder(w).Encode(clientData); err != nil {
        log.Error().Str("function", "bandcampHistoryHandler").Msg(fmt.Sprintf("Failed to encode bandcamp history data for %s: %v\n", clientID, err))
        json.NewEncoder(w).Encode(map[string]interface{}{
            "tree": []interface{}{},
            "info": map[string]interface{}{},
            })
        // http.Error(w, "Failed to encode data", http.StatusInternalServerError)
        return
    }
}

func isHTTP(s string) bool {
    return strings.HasPrefix(s, "http:")
}

func formatPlaytime(playtime int) string {
    hours := playtime / 3600
    minutes := (playtime % 3600) / 60
    seconds := playtime % 60
    var playhours string
    if playtime < 3600 {
        // Omit the hour if it's less than an hour
        playhours = fmt.Sprintf("%v:%v", minutes, seconds)
    } else {
        // Include the hour
        playhours = fmt.Sprintf("%v:%v:%v", hours, minutes, seconds)
    }
    return playhours
}

func capitalizeFirstLetter(s string) string {
    if len(s) == 0 {
        return s
    }
    // Capitalize the first letter and append the rest of the string
    return strings.ToUpper(string(s[0])) + s[1:]
}

func dataHandler(w http.ResponseWriter, r *http.Request) {
    clientDataTree := map[string]interface{}{
        "tree": []interface{}{},
        "info": map[string]interface{}{},
    }

    clientID := r.URL.Query().Get("client_id")
    dataPath := r.URL.Path[1:]

    log.Debug().Str("function", "dataHandler").Msg(fmt.Sprintf("%v - %v", clientID, dataPath))

    // Read the data based on the path (history, randomset, etc.)
    ClientData, err := readData(clientID, dataPath)
    if err != nil {
        log.Error().Str("function", "dataHandler").Msg(fmt.Sprintf("readData failed %s: %v\n", clientID, err))
    }
    
    // Function to process the data for any string slice (History, Randomset, etc.)
    processDirectories := func(directories []string) []FileInfo {
        var fileInfos []FileInfo
        mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))
        for _, directory := range directories {
            log.Debug().Str("function", "dataHandler").Msg(fmt.Sprintf("processing %v", directory))
            directoryStr := directory

            // If it's not a root or HTTP directory
            if directoryStr != "/" && !isHTTP(directoryStr) {
                count, err := mpdClient.Count("base", directoryStr)
                if err != nil {
                    log.Debug().Str("function", "dataHandler").Msg(fmt.Sprintf("Could not get count for %s: %v\n", directoryStr, err))
                    continue
                }
                seconds, err := strconv.Atoi(count[1])

                fileInfo := FileInfo{
                    Directory: directoryStr,
                    Count: map[string]interface{}{
                        "playhours": formatPlaytime(seconds),
                        "playtime":  count[1],
                        "songs":     count[0],
                    },
                }
                fileInfos = append(fileInfos, fileInfo)
            } else if isHTTP(directoryStr) {
                // Handle HTTP directory
                fileInfo := FileInfo{
                    Directory: directoryStr,
                    Stream:    directoryStr,
                }
                fileInfos = append(fileInfos, fileInfo)
            }
        }

        // Reverse the fileInfos slice
        for i, j := 0, len(fileInfos)-1; i < j; i, j = i+1, j-1 {
            fileInfos[i], fileInfos[j] = fileInfos[j], fileInfos[i]
        }
        mpdClient.Close()
        return fileInfos
    }

    // Process different fields in ClientData
    var fileInfos []FileInfo

    // Check if History has data and process it
    if len(ClientData.History) > 0 {
        fileInfos = append(fileInfos, processDirectories(ClientData.History)...)
    }

    if dataPath == "randomset" && len(ClientData.Randomset) == 0 {
        generateRandomSet(w, r)
        dataHandler(w, r)
        return
    }

    // Check if Randomset has data and process it
    if len(ClientData.Randomset) > 0 {
        fileInfos = append(fileInfos, processDirectories(ClientData.Randomset)...)
    }

    // Check if Favourites has data and process it
    if len(ClientData.Favourites) > 0 {
        fileInfos = append(fileInfos, processDirectories(ClientData.Favourites)...)
    }

    // Assign the processed fileInfos to the tree
    clientDataTree["tree"] = fileInfos

    // Write the response
    json.NewEncoder(w).Encode(clientDataTree)
}

type RadioStation struct {
    Name     string `json:"name"`
    Favicon  string `json:"favicon"`
    Bitrate  int    `json:"bitrate"`
    UUID    string `json:"stationuuid"`
    Url     string `json:"url"`
}

type Content struct {
    Tree []RadioStation `json:"tree"`
}

func searchRadioHandler(w http.ResponseWriter, r *http.Request) {
    content := Content{Tree: []RadioStation{}}
    pattern := r.URL.Query().Get("pattern")
    
    if len(pattern) < 3 {
        json.NewEncoder(w).Encode(content)
        return
    }

    client := &http.Client{Timeout: 10 * time.Second}
    url := fmt.Sprintf("https://de1.api.radio-browser.info/json/stations/search?name=%s&name_exact=false", pattern)
    
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        log.Error().Str("function", "searchRadioHandler").Msg(fmt.Sprintf("Error creating request: %v", err))
        http.Error(w, "Internal Server Error", http.StatusInternalServerError)
        return
    }

    resp, err := client.Do(req)
    if err != nil {
        log.Debug().Str("function", "").Msg(fmt.Sprintf("Error making request to Radio Browser API: %v", err))
        http.Error(w, "Internal Server Error", http.StatusInternalServerError)
        return
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        log.Error().Str("function", "searchRadioHandler").Msg(fmt.Sprintf("API responded with status code: %v", resp.StatusCode))
        http.Error(w, "Failed to fetch radio stations", http.StatusBadRequest)
        return
    }
    log.Debug().Str("function", "searchRadioHandler").Msg(fmt.Sprintf("radio stations: %s", resp.Body))
    var stations []RadioStation
    if err := json.NewDecoder(resp.Body).Decode(&stations); err != nil {
        log.Error().Str("function", "searchRadioHandler").Msg(fmt.Sprintf("Error decoding response: %v", err))
        http.Error(w, "Failed to process response", http.StatusInternalServerError)
        return
    }

    // Filter and modify stations as necessary
    for _, station := range stations {
        if station.Name != "" && (station.Bitrate > 60 || station.Bitrate == 0) {
            if station.Favicon == "" {
                station.Favicon = "assets/radio.png"
            }
            content.Tree = append(content.Tree, station)
        }
    }

    // Return the content as JSON
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(content)
}

// searchBandcampHandler handles the search_bandcamp route
func searchBandcampHandler(w http.ResponseWriter, r *http.Request) {
    pattern := r.URL.Query().Get("pattern")
    
    if len(pattern) < 20 || !(strings.Contains(pattern, "bandcamp.com/") || strings.Contains(pattern, "youtube") || strings.Contains(pattern, "youtu.be")) {
        json.NewEncoder(w).Encode(map[string]interface{}{"tree": []interface{}{}})
        return
    }

    content := map[string]interface{}{
        "tree": []map[string]interface{}{},
    }

    // Check if the pattern is for Bandcamp
    if strings.Contains(pattern, "bandcamp.com") {
        albumList, err := handleBandcampSearch(pattern)
        if err != nil {
            log.Error().Str("function", "searchBandcampHandler").Msg(fmt.Sprintf("Exception during Bandcamp search: %v", err))
            json.NewEncoder(w).Encode(content)
            return
        }
        content["tree"] = albumList
    }

    // Check if the pattern is for YouTube
    if strings.Contains(pattern, "youtube") || strings.Contains(pattern, "youtu.be") {
        youtubeLink := handleYouTubeSearch(pattern)
        content["tree"] = append(content["tree"].([]map[string]interface{}), youtubeLink)
    }

    json.NewEncoder(w).Encode(content)
}

// handleBandcampSearch fetches album info for Bandcamp URLs
func handleBandcampSearch(pattern string) ([]map[string]interface{}, error) {
    log.Debug().Str("function", "searchBandcampHandler").Msg(fmt.Sprintf("Searching for Bandcamp album: %s", pattern))

    albumInfo, err := getBandcampAlbumInfo(pattern)
    if err != nil {
        return nil, err
    }

    return []map[string]interface{}{albumInfo}, nil
}

// handleYouTubeSearch returns metadata for YouTube links
func handleYouTubeSearch(pattern string) map[string]interface{} {
    log.Debug().Str("function", "handleYouTubeSearch").Msg(fmt.Sprintf("Returning YouTube link: %s", pattern))

    return map[string]interface{}{
        "url":    pattern,
        "title":  pattern,
        "year":   "",
        "art":    "https://i.ytimg.com/vi_webp/VbChrk8Vs64/mqdefault.webp",
        "artist": "",
    }
}

// getBandcampAlbumInfo fetches metadata and track URLs from a Bandcamp album page
func getBandcampAlbumInfo(url string) (map[string]interface{}, error) {
    log.Debug().Str("function", "getBandcampAlbumInfo").Msg(fmt.Sprintf("Fetching Bandcamp album info from: %s", url))

    // Fetch the page content
    resp, err := http.Get(url)
    if err != nil || resp.StatusCode != 200 {
        return nil, fmt.Errorf("failed to retrieve the Bandcamp page")
    }
    defer resp.Body.Close()

    doc, err := goquery.NewDocumentFromReader(resp.Body)
    if err != nil {
        return nil, fmt.Errorf("failed to parse HTML")
    }

    // Extract album details
    title, artist, releaseYear, coverArt := extractAlbumDetails(doc)

    // Use yt-dlp to get track URLs
    // trackURLs, err := getBandcampTrackURLs(url)
    // if err != nil {
    //    return nil, err
    // }

    // Construct the album data
    albumData := map[string]interface{}{
        "artist":       artist,
        "title":        title,
        "art":    coverArt,
        "url": url,
        "date": releaseYear,
        // "tracks":       trackURLs,
    }

    return albumData, nil
}

// extractAlbumDetails extracts metadata from Bandcamp HTML
func extractAlbumDetails(doc *goquery.Document) (string, string, string, string) {
    // Extract title, artist, release year, and cover art
    description := doc.Find("meta[name='description']").AttrOr("content", "")
    title, artist, releaseYear := parseBandcampDescription(description)

    coverArt := doc.Find("meta[property='og:image']").AttrOr("content", "")

    return title, artist, releaseYear, coverArt
}

func getBandcampTrackURLs(url string) ([]string, error) {
    // Define the yt-dlp command with options to extract URLs
    log.Debug().Str("function", "getBandcampTrackURLs").Msg(fmt.Sprintf("Running yt-dlp -f bestaudio -g %v", url))
    cmd := exec.Command("yt-dlp", "-f", "bestaudio", "-g", url)

    // Capture the output
    var out bytes.Buffer
    cmd.Stdout = &out

    // Run the command
    err := cmd.Run()
    if err != nil {
        return nil, fmt.Errorf("yt-dlp command failed: %v", err)
    }

    // Split the output into lines (each URL is on a new line)
    trackURLs := bytes.Split(out.Bytes(), []byte("\n"))

    // Convert from [][]byte to []string, removing empty lines
    var result []string
    for _, track := range trackURLs {
        if len(track) > 0 {
            result = append(result, string(track))
        }
    }

    return result, nil
}

// parseBandcampDescription extracts the album title, artist, and release year from the description.
func parseBandcampDescription(description string) (string, string, string) {
    // Trim any extra newlines and spaces
    description = strings.TrimSpace(description)

    // Regular expression to match title, artist, and release date
    re := regexp.MustCompile(`^(.+?) by (.+?), released (\d{1,2} \w+ \d{4})`)
    matches := re.FindStringSubmatch(description)

    // Check if we found a match
    if len(matches) > 0 {
        title := strings.TrimSpace(matches[1])
        artist := strings.TrimSpace(matches[2])
        releaseDate := strings.TrimSpace(matches[3])

        // Extract the release year from the release date
        reYear := regexp.MustCompile(`\d{4}`)
        yearMatch := reYear.FindString(releaseDate)

        return title, artist, yearMatch
    }

    // Return empty strings if no match is found
    return "", "", ""
}

func removeHistoryHandler(w http.ResponseWriter, r *http.Request) {
    // Get the 'playable' parameter from the URL query or fall back to 'url'
    playable := r.URL.Query().Get("directory")
    if playable == "" {
        playable = r.URL.Query().Get("url")
    }
    stationuuid := r.URL.Query().Get("stationuuid")
    var history string

    // Determine the history type (radio, bandcamp, or general history)
    if stationuuid != "" {
        history = "radio_history"
    } else if strings.HasPrefix(playable, "http") {
        history = "bandcamp_history"
    } else {
        history = "history"
    }

    clientID := r.URL.Query().Get("client_id")
    if clientID == "" {
        clientID = "guest"
    }

    log.Debug().Str("function", "removeHistoryHandler").Msg(fmt.Sprintf("need to deal with %v %v", history))

    // Read the client history
    clientHistory, err := readData(clientID, history)
    if err != nil {
        http.Error(w, "Failed to read client history", http.StatusInternalServerError)
        log.Debug().Str("function", "").Msg(fmt.Sprintf("Failed to read client history: %v", err))
        return
    }

    log.Debug().Str("function", "removeHistoryHandler").Msg(fmt.Sprintf("read %v", clientHistory, playable))

    // Remove the playable from the specific history type slice
    if playable != "" {
        if history == "radio_history" && len(clientHistory.RadioHistory) > 0 {
            clientHistory.RadioHistory = removeItem(clientHistory.RadioHistory, stationuuid)
            delete(clientHistory.Stations, stationuuid)
        } else if history == "bandcamp_history" && len(clientHistory.BandcampHistory) > 0 {
            clientHistory.BandcampHistory = removeItem(clientHistory.BandcampHistory, playable)
        } else if history == "history" && len(clientHistory.History) > 0 {
            clientHistory.History = removeItem(clientHistory.History, playable)
        }
    }

    // Write back the updated history
    err = writeData(clientID, history, clientHistory)
    if err != nil {
        http.Error(w, "Failed to write updated history", http.StatusInternalServerError)
        log.Error().Str("function", "removeHistoryHandler").Msg(fmt.Sprintf("Failed to write updated history: %v", err))
        return
    }

    // Respond with success
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"result": "ok"})
}

// Helper function to remove an item from a slice (returns a new slice)
func removeItem(slice []string, item string) []string {
    newSlice := []string{}
    for _, v := range slice {
        if v != item {
            newSlice = append(newSlice, v)
        }
    }
    return newSlice
}

func mpdProxyHandler(w http.ResponseWriter, r *http.Request) {
    var content map[string]interface{} = make(map[string]interface{})
    var err error
    log.Debug().Str("function", "mpdProxyHandler").Msg(fmt.Sprintf("mpdProxyHandler url: %v", r.URL.Path))
    mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))

    switch r.URL.Path {
    case "/play":
        err = mpdClient.Play(-1)
        content["message"] = "Playing"
    case "/pause":
        err = mpdClient.Pause(true)
        content["message"] = "Paused"
    case "/playpause":
        status, err := mpdClient.Status()
        if err != nil {
            http.Error(w, "Failed to get status", http.StatusInternalServerError)
            return
        }
        if status["state"] == "pause" {
            err = mpdClient.Play(-1)
            content["message"] = "Playing"
        } else {
            err = mpdClient.Pause(true)
            content["message"] = "Paused"
        }
    case "/next":
        err = mpdClient.Next()
        content["message"] = "Next track"
    case "/prev":
        err = mpdClient.Previous()
        content["message"] = "Previous track"
    case "/stop":
        mpdClient.Stop()
        mpdClient.Clear()
        content["message"] = "Stopped"
    case "/status":
        status, err := mpdClient.Status()
        if err != nil {
            http.Error(w, "Failed to get status", http.StatusInternalServerError)
            return
        }
        content["status"] = status
    case "/listfiles":
        directory := r.URL.Query().Get("directory")
        if directory == "" {
            directory = "."
        }
        files, err := mpdClient.ListInfo(directory)
        if err != nil {
            http.Error(w, "Failed to list files", http.StatusInternalServerError)
            return
        }
        content["tree"] = files
    case "/lsinfo":
        directory := r.URL.Query().Get("directory")
        if directory == "" {
            directory = "."
        }
        info, err := mpdClient.ListInfo(directory)
        if err != nil {
            http.Error(w, "Failed to get lsinfo", http.StatusInternalServerError)
            return
        }
        content["tree"] = info


    case "/search":
        pattern := r.URL.Query().Get("pattern")
        if pattern == "" {
            pattern = "ugar"
        }
        searchResult, err := mpdClient.Search("any", pattern)
        if err != nil {
            http.Error(w, "Failed to search", http.StatusInternalServerError)
            return
        }
    
        var fileInfos []FileInfo
        for _, fileRecord := range searchResult {
            file := fileRecord["file"]
            fileInfo := FileInfo{
                LastModified: fileRecord["last-modified"],
                Artist:      fileRecord["artist"],
                Album:      fileRecord["album"],
                File:        file,
                Format:      fileRecord["format"],
                // Add additional fields here
                Duration:    fileRecord["duration"],
                Genre:       fileRecord["genre"],
                Codec:       fileRecord["codec"],
                Track:       fileRecord["track"],
                Date:        fileRecord["date"],
                Title:        fileRecord["title"],
            }
            fileInfos = append(fileInfos, fileInfo)
        }
    
        // Get directories from search results
        resultDirectories := make(map[string]bool)
        for _, elem := range searchResult {
            file := elem["file"]
            resultDirectories[filepath.Dir(file)] = true
        }
    
        // Add directories to fileInfos
        for directory := range resultDirectories {

            subDirCount, err := mpdClient.Count("base", directory)
            log.Debug().Str("function", "").Msg(fmt.Sprintf("subDirCount: %v", subDirCount))
            if err != nil {
                http.Error(w, "Failed to count", http.StatusInternalServerError)
                return
            }
            seconds, err := strconv.Atoi(subDirCount[1])
            if err != nil {
                http.Error(w, "Failed to parse count", http.StatusInternalServerError)
                return
            }
            duration := time.Duration(seconds) * time.Second
            hours := fmt.Sprintf("%d", int(duration.Hours()))
            minutes := fmt.Sprintf("%02d", int(duration.Minutes())%60)
            secondsStr := fmt.Sprintf("%02d", int(duration.Seconds())%60)
            playhours := fmt.Sprintf("%s:%s:%s", hours, minutes, secondsStr)
    
            fileInfo := FileInfo{
                Directory:    directory,
                Count: map[string]interface{}{
                    "playhours": playhours,
                    "playtime":  subDirCount[1],
                    "songs":     subDirCount[0],
                },
            }
            fileInfos = append(fileInfos, fileInfo)
        }
    
        content["tree"] = fileInfos


    case "/ls":
        directory := r.URL.Query().Get("directory")
        if directory == "" {
            directory = "/"
        }
        if directory == "." {
            directory = "/"
        }
        listFiles, err := mpdClient.ListInfo(directory)
        if err != nil {
            log.Debug().Str("function", "").Msg(fmt.Sprintf("%v", err))
            http.Error(w, "Failed to list files", http.StatusInternalServerError)
            return
        }
    
        lsInfo := listFiles

        var count []string

        if directory != "/" {
            count, err = mpdClient.Count("base", directory)
        } else {
            count, err = mpdClient.Count("modified-since", "0")
        }
        log.Debug().Str("function", "mpdProxyHandler:ls").Msg(fmt.Sprintf("count: %v", count))
    
        musicFiles := make(map[string]bool)
        for _, file := range lsInfo {
            file := file["file"]
            musicFiles[filepath.Base(file)] = true
        }
        for _, fileRecord := range listFiles {
            file := fileRecord["file"]
            if _, ok := musicFiles[filepath.Base(file)]; !ok {
                fileRecord["file"] = directory + "/" + file
                lsInfo = append(lsInfo, fileRecord)
            }
        }
        log.Debug().Str("function", "mpdProxyHandler:ls").Msg(fmt.Sprintf("lsinfo: %v", lsInfo))
    
        // Adjusting the info structure
        info := map[string]string{
            "playtime": count[1],
            "songs":    count[0],
        }
        content["info"] = info
    
        // Adjusting the tree structure
        var fileInfos []FileInfo
        log.Debug().Str("function", "mpdProxyHandler:ls").Msg(fmt.Sprintf("iterating lsinfo"))
        for _, name := range lsInfo {
            log.Debug().Str("function", "").Msg(fmt.Sprintf("name: %v", name))
            dir := name["directory"]
            if dir == "" {
                fileInfo := FileInfo{
                    LastModified: name["last-modified"],
                    Artist:      name["artist"],
                    Album:      name["album"],
                    File:        name["file"],
                    Format:      name["format"],
                    // Add additional fields here
                    Duration:    name["duration"],
                    Genre:       name["genre"],
                    Codec:       name["codec"],
                    Track:       name["track"],
                    Date:        name["date"],
                    Title:        name["title"],
                }
                fileInfos = append(fileInfos, fileInfo)
                continue
            }
            subDir := dir

            subDirCount, err := mpdClient.Count("base", dir)
            log.Debug().Str("function", "").Msg(fmt.Sprintf("subDirCount: %v", subDirCount))
            seconds, err := strconv.Atoi(subDirCount[1])
            if err != nil {
                http.Error(w, "Failed to parse count", http.StatusInternalServerError)
                return
            }
            duration := time.Duration(seconds) * time.Second
            hours := fmt.Sprintf("%d", int(duration.Hours()))
            minutes := fmt.Sprintf("%02d", int(duration.Minutes())%60)
            secondsStr := fmt.Sprintf("%02d", int(duration.Seconds())%60)

            var playhours string
            if hours == "00" {
                // Omit the hour if it's less than an hour
                playhours = fmt.Sprintf("%s:%s", minutes, secondsStr)
            } else {
                // Include the hour
                playhours = fmt.Sprintf("%s:%s:%s", hours, minutes, secondsStr)
            }

            fileInfo := FileInfo{
                Directory:    subDir,
                LastModified: name["last-modified"],
                Count: map[string]interface{}{
                    "playhours": playhours,
                    "playtime":  subDirCount[1],
                    "songs":     subDirCount[0],
                },
                Artist:      name["artist"],
                Album:      name["album"],
                File:        name["file"],
                Format:      name["format"],
                // Add additional fields here
                Duration:    name["duration"],
                Genre:       name["genre"],
                Codec:       name["codec"],
                Track:       name["track"],
                Date:        name["date"],
                Title:        name["title"],
            }
            fileInfos = append(fileInfos, fileInfo)
        }
    
        log.Debug().Str("function", "mpdProxyHandler:ls").Msg(fmt.Sprintf("fileInfos: %v", fileInfos))
        content["tree"] = fileInfos
    
    case "/addplay":
        var playables []string
        playable := r.URL.Query().Get("directory")
        if playable == "" {
            playable = r.URL.Query().Get("url")
        }
        url := r.URL.Query().Get("url")
        stationUUID := r.URL.Query().Get("stationuuid")
        name := r.URL.Query().Get("name")
        favicon := r.URL.Query().Get("favicon")
        
        // Check if the playable URL is a radio station
        if r.URL.Query().Get("stationuuid") != "" && !strings.Contains(playable, "bandcamp.com") && !strings.Contains(playable, "youtube") && !strings.Contains(playable, "youtu.be") {
            // Placeholder for pyradios implementation
            stationURL := r.URL.Query().Get("url")
            playable = stationURL
        }
        
        // Check if the playable URL is a YouTube video
        if strings.Contains(playable, "youtube") || strings.Contains(playable, "youtu.be") || strings.Contains(playable, "bandcamp.com") {
            playables, _ = getBandcampTrackURLs(playable)
        }
        
        mpdClient.Consume(true)
        
        if r.URL.Query().Get("directory") != "" || len(playables) > 0{
            mpdClient.Add("signal.mp3")
        }
        
        if len(playables) > 0 {
            log.Debug().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("Playables: %v", playables))
            for _, item := range(playables) {
                mpdClient.Add(item)
            }
        } else if playable != "" {
            log.Debug().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("Playable: %v", playable))
            mpdClient.Add(playable)
        }
        
        mpdClient.Play(-1)
    
        // Manage history
        clientID := r.URL.Query().Get("client_id")
        if r.URL.Query().Get("directory") != "" && clientID != "" {
            log.Debug().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("writing history: %v", playable))
            ClientData, err := readData(clientID, "history")
            if err != nil {
                log.Error().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("%v", err))
            }
            
            // Check if 'playable' exists in the client history
            for i, item := range ClientData.History {
                if item == playable {
                    // Remove the item from history
                    ClientData.History = append(ClientData.History[:i], ClientData.History[i+1:]...)
                    break
                }
            }

            ClientData.History = append(ClientData.History, playable)

            // Limit the history to the last 10 items
            if len(ClientData.History) > 10 {
                ClientData.History = ClientData.History[len(ClientData.History)-10:]
            }

            ClientDataFile := filepath.Join(clientDB, fmt.Sprintf("%s.history.json", clientID))

            // Validate the client ID and file path
            re := regexp.MustCompile(`[^A-Za-z0-9_\-\.]`)
            if clientID != "" && filepath.HasPrefix(ClientDataFile, clientDB) && re.MatchString(ClientDataFile) {
                // Write the updated history back to the file
                file, err := os.Create(ClientDataFile)
                if err != nil {
                    http.Error(w, "Unable to write file", http.StatusInternalServerError)
                    return
                }
                defer file.Close()

                // Write JSON data to file
                encoder := json.NewEncoder(file)
                if err := encoder.Encode(ClientData); err != nil {
                    http.Error(w, "Failed to write JSON data", http.StatusInternalServerError)
                    return
                }
            }			

        }
        if url != "" && playable != "" && ! (strings.Contains(playable, "youtube") || strings.Contains(playable, "youtu.be") || strings.Contains(playable, "bandcamp.com"))  && clientID != "" {
            log.Debug().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("writing radio_history: %v", playable))

            clientData, err := readData(clientID, "radio_history")
            if err != nil {
                clientData = ClientData{
                    RadioHistory: []string{},
                    Stations:     map[string]StationData{},
                }
            }
            
            // Ensure 'stations' exists in client data
            if clientData.Stations == nil {
                clientData.Stations = make(map[string]StationData)
            }

            // Update radio history
            // Remove the stationUUID from the history if it exists
            for i, uuid := range clientData.RadioHistory {
                if uuid == stationUUID {
                    clientData.RadioHistory = append(clientData.RadioHistory[:i], clientData.RadioHistory[i+1:]...)
                    break
                }
            }

            // Append the stationUUID to the history and trim history to last 12 entries
            clientData.RadioHistory = append(clientData.RadioHistory, stationUUID)
            if len(clientData.RadioHistory) > 12 {
                clientData.RadioHistory = clientData.RadioHistory[len(clientData.RadioHistory)-12:]
            }

            // Update stations information
            clientData.Stations[stationUUID] = StationData{
                URL:        playable,
                StationUUID: stationUUID,
                Name:       name,
                Favicon:    favicon,
            }
            // Write the updated data back to the file
            if err := writeData(clientID, "radio_history", clientData); err != nil {
                log.Error().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("Failed to write radio history for %s: %v", clientID, err))
                http.Error(w, "Failed to update radio history", http.StatusInternalServerError)
                return
            }
        }
        if url != "" && playable != "" && (strings.Contains(playable, "youtube") || strings.Contains(playable, "youtu.be") || strings.Contains(playable, "bandcamp.com")) && clientID != ""  {
            log.Debug().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("writing bandcamp_history: %v", playable))

            clientData, err := readData(clientID, "bandcamp_history")
            if err != nil {
                clientData = ClientData{
                    BandcampHistory: []string{},
                    Links:     map[string]LinkData{},
                }
            }
            
            // Ensure 'stations' exists in client data
            if clientData.Links == nil {
                clientData.Links = make(map[string]LinkData)
            }

            for i, item := range clientData.BandcampHistory {
                if item == playable {
                    clientData.BandcampHistory = append(clientData.BandcampHistory[:i], clientData.BandcampHistory[i+1:]...)
                    break
                }
            }

            clientData.BandcampHistory = append(clientData.BandcampHistory, playable)
            if len(clientData.BandcampHistory) > 36 {
                clientData.BandcampHistory = clientData.BandcampHistory[len(clientData.BandcampHistory)-36:]
            }
            _, exists := clientData.Links[playable]
            if exists {
                log.Debug().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("Key '%s' exists with value in clientData.Links\n", playable))
            } else {
                // Update links information
                albumInfo, _ := getBandcampAlbumInfo(playable)

                clientData.Links[playable] = LinkData{
                    URL:        playable,
                    Favicon:    albumInfo["art"].(string),
                    Title:      albumInfo["title"].(string),
                    Date:       albumInfo["date"].(string),
                    Artist:     albumInfo["artist"].(string),
                }
            }

            // Write the updated data back to the file
            if err := writeData(clientID, "bandcamp_history", clientData); err != nil {
                log.Error().Str("function", "mpdProxyHandler:addplay").Msg(fmt.Sprintf("Failed to write bandcamp history for %s: %v", clientID, err))
                http.Error(w, "Failed to update bandcamp history", http.StatusInternalServerError)
                return
            }
        }

    
    default:
        http.Error(w, "Not Found", http.StatusNotFound)
        return
    }

    if err != nil {
        http.Error(w, fmt.Sprintf("Failed to execute command: %v", err), http.StatusInternalServerError)
        return
    }
    mpdClient.Close()
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(content)
}

func getActivePlayers() []map[string]interface{} {
    players := []map[string]interface{}{}

    // Initialize Redis client
    rdb := redis.NewClient(&redis.Options{
        Addr: "localhost:6379",
        DB:   0,
    })

    defer rdb.Close()

    // Scan for keys
    iter := rdb.Scan(ctx, 0, "upnp:player:*:last_seen", 0).Iterator()
    for iter.Next(ctx) {
        key := iter.Val()
        lastSeenStr, err := rdb.Get(ctx, key).Result()
        if err != nil {
            log.Debug().Str("function", "getActivePlayers").Msg(fmt.Sprintf("Failed to get last seen: %v", err))
            continue
        }

        lastSeen, err := strconv.ParseFloat(lastSeenStr, 64)
        if err != nil {
            log.Debug().Str("function", "getActivePlayers").Msg(fmt.Sprintf("Failed to parse last seen: %v", err))
            continue
        }

        if time.Now().Unix()-int64(lastSeen) < 1200 {
            dataStr, err := rdb.Get(ctx, strings.Replace(key, "last_seen", "data", 1)).Result()
            if err != nil {
                log.Debug().Str("function", "getActivePlayers").Msg(fmt.Sprintf("Failed to get data: %v", err))
                continue
            }

            var data map[string]interface{}
            if err := json.Unmarshal([]byte(dataStr), &data); err != nil {
                log.Debug().Str("function", "getActivePlayers").Msg(fmt.Sprintf("Failed to unmarshal data: %v", err))
                continue
            }

            players = append(players, data)
        }

        // Housekeeping
        if time.Now().Unix()-int64(lastSeen) > 1800 {
            rdb.Del(ctx, strings.Replace(key, "last_seen", "data", 1))
            rdb.Del(ctx, key)
        }
    }
    if err := iter.Err(); err != nil {
        log.Debug().Str("function", "getActivePlayers").Msg(fmt.Sprintf("Failed to iterate: %v", err))
    }

    return players
}

func processCurrentSong(currentsong map[string]interface{}) map[string]interface{} {
    // Initialize states
    states := []string{"play", "pause", "stop"}
    for _, state := range states {
        currentsong[state] = false
        if currentsong["state"] == state {
            currentsong[state] = true
        }
    }

    // Set title and display titles
    if currentsong["Title"] == "" || currentsong["Title"] == nil  {
        currentsong["title"] = currentsong["file"]
        currentsong["display_title"] = currentsong["file"]
        currentsong["display_title_top"] = currentsong["Name"]
    } else {
        titleElements := []string{}
        if track, ok := currentsong["Track"].(string); ok {
            titleElements = append(titleElements, track)
        }
        if title, ok := currentsong["Title"].(string); ok {
            titleElements = append(titleElements, title)
        }

        albumElements := []string{}
        if artist, ok := currentsong["Artist"].(string); ok {
            albumElements = append(albumElements, artist)
        }
        if album, ok := currentsong["Album"].(string); ok {
            albumElements = append(albumElements, album)
        }

        currentsong["display_title"] = strings.Join(titleElements, " - ")
        currentsong["display_title_top"] = strings.Join(albumElements, " - ")
    }

    // Set active state
    currentsong["active"] = false
    if state, ok := currentsong["state"].(string); ok {
        if state == "play" || state == "pause" {
            currentsong["active"] = true
        }
    }

    // Set not playing state
    if !currentsong["active"].(bool) {
        currentsong["title"] = "not playing"
        currentsong["display_title"] = "not playing"
    }

    // Set next state and title
    if state, ok := currentsong["state"].(string); ok {
        if state == "play" {
            currentsong["next_state"] = "pause"
            currentsong["next_title"] = "playing ➙ pause"
            currentsong["next_icon"] = "pause_circle_outline"
        } else if state == "pause" {
            currentsong["next_state"] = "play"
            currentsong["next_title"] = "paused ➙ play"
            currentsong["next_icon"] = "play_circle_outline"
        }
    }

    return currentsong
}

func pollCurrentSongHandler(w http.ResponseWriter, r *http.Request) {
    var err error
    
    mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))

    // Wait for MPD events with a timeout
    timeout := 60 * time.Second
    done := make(chan bool)
    go func() {
        result, err := mpdClient.Idle("playlist", "player")
        if err == nil {
            log.Debug().Str("function", "pollCurrentSongHandler").Msg(fmt.Sprintf("Failed to wait for mpd events: %v", err))
        } else {
            log.Debug().Str("function", "pollCurrentSongHandler").Msg(fmt.Sprintf("We've got something back: %v", result))
        }
        done <- true
    }()

    select {
    case <-done:
        // MPD event received
        log.Debug().Str("function", "pollCurrentSongHandler").Msg(fmt.Sprintf("Something happened in mpd"))
    case <-time.After(timeout):
        // Timeout occurred
        log.Debug().Str("function", "pollCurrentSongHandler").Msg(fmt.Sprintf("Timeout waiting for mpd events"))
    }

    mpdClient.Close()
    mpdClient, _ = getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))

    // Get current song and status
    currentsong, err := mpdClient.CurrentSong()
    if err != nil {
        log.Debug().Str("function", "pollCurrentSongHandler").Msg(fmt.Sprintf("Failed to get current song: %v", err))
    }
    
    status, err := mpdClient.Status()
    if err != nil {
        log.Debug().Str("function", "pollCurrentSongHandler").Msg(fmt.Sprintf("Failed to get status: %v", err))
    }

    // Convert mpd.Attrs to map[string]interface{}
    currentsongMap := make(map[string]interface{})
    for k, v := range currentsong {
        currentsongMap[k] = v
    }
    for k, v := range status {
        currentsongMap[k] = v
    }

    // Add additional information
    currentsongMap["players"] = getActivePlayers() // Preserve the structure of players
    currentsongMap["bandcamp_enabled"] = bandcampEnabled
    currentsongMap["default_stream"] = defaultStream
    
    // Process current song
    currentsongMap = processCurrentSong(currentsongMap)

    // Close MPD client connection
    mpdClient.Close()

    // Return the content as JSON
    w.Header().Set("Content-Type", "application/json")

    // Directly encode the final currentsongMap to JSON
    if err := json.NewEncoder(w).Encode(currentsongMap); err != nil {
        log.Debug().Str("function", "pollCurrentSongHandler").Msg(fmt.Sprintf("Error encoding JSON response: %v", err))
        // If encoding fails, send an empty JSON object as a fallback
        emptyResponse := map[string]interface{}{}
        json.NewEncoder(w).Encode(emptyResponse)
    }
}

func currentSongHandler(w http.ResponseWriter, r *http.Request) {
    // Connect to MPD
    mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))

    // Get current song and status
    currentsong, err := mpdClient.CurrentSong()
    if err != nil {
        http.Error(w, "Failed to get current song", http.StatusInternalServerError)
        log.Debug().Str("function", "currentSongHandler").Msg(fmt.Sprintf("Failed to get current song: %v", err))
        return
    }

    status, err := mpdClient.Status()
    if err != nil {
        http.Error(w, "Failed to get status", http.StatusInternalServerError)
        log.Debug().Str("function", "currentSongHandler").Msg(fmt.Sprintf("Failed to get status: %v", err))
        return
    }

    // Convert mpd.Attrs to map[string]interface{}
    currentsongMap := make(map[string]interface{})
    for k, v := range currentsong {
        currentsongMap[k] = v
    }
    for k, v := range status {
        currentsongMap[k] = v
    }

    // Add additional information (players, bandcamp_enabled, default_stream)
    currentsongMap["players"] = getActivePlayers()
    currentsongMap["bandcamp_enabled"] = bandcampEnabled
    currentsongMap["default_stream"] = defaultStream

    // Process current song
    currentsongMap = processCurrentSong(currentsongMap)

    // Instead of converting to mpd.Attrs (which flattens the map), just encode the JSON directly
    mpdClient.Close()

    // Return the content as JSON
    w.Header().Set("Content-Type", "application/json")
    if err := json.NewEncoder(w).Encode(currentsongMap); err != nil {
        http.Error(w, "Failed to encode JSON", http.StatusInternalServerError)
        log.Debug().Str("function", "currentSongHandler").Msg(fmt.Sprintf("Failed to encode JSON: %v", err))
    }
}

func countHandler(w http.ResponseWriter, r *http.Request) {
    // Get the directory from the request
    directory := r.URL.Query().Get("directory")
    if directory == "" {
        directory = "."
    }
    log.Debug().Str("function", "countHandler").Msg(fmt.Sprintf("Directory: %v", directory))

    mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))
    // Get the count of the specified directory

    count, err := mpdClient.Count("base", directory)
    mpdClient.Close()
    if err != nil {
        http.Error(w, "Failed to get count", http.StatusInternalServerError)
        log.Debug().Str("function", "countHandler").Msg(fmt.Sprintf("Failed to get count: %v", err))
        return
    }
    log.Debug().Str("function", "countHandler").Msg(fmt.Sprintf("Count: %v", count))
    // Calculate the play hours

    seconds, err := strconv.Atoi(count[1])
    duration := time.Duration(seconds) * time.Second
    hours := int(duration.Hours())
    minutes := int(duration.Minutes()) % 60

    // Prepare the content to return
    content := map[string]interface{}{
        "playhours": fmt.Sprintf("%d:%02d", hours, minutes),
        "count": count[0],
        "name":      directory,
    }


    // Return the content as JSON
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(content)
}

func toggleOutputHandler(w http.ResponseWriter, r *http.Request) {
    outputID := r.URL.Query().Get("output")
    log.Debug().Str("function", "toggleOutputHandler").Msg(fmt.Sprintf("outputID: %v", outputID))

    mpdClient, _ := getMPDClient(mpdHost, r.URL.Query().Get("mpd_port"))
    // Get the current outputs
    outputs, err := mpdClient.ListOutputs()
    log.Debug().Str("function", "toggleOutputHandler").Msg(fmt.Sprintf("outputs: %v", outputs))

    if err != nil {
        http.Error(w, "Failed to get outputs", http.StatusInternalServerError)
        log.Debug().Str("function", "toggleOutputHandler").Msg(fmt.Sprintf("Failed to get outputs: %v", err))
        return
    }

    // Find the specified output and toggle its state
    for _, output := range outputs {
        if output["outputid"] == outputID {
            outputInt, err := strconv.Atoi(outputID)
            if output["outputenabled"] == "1" {
                err = mpdClient.DisableOutput(outputInt)
            } else {
                err = mpdClient.EnableOutput(outputInt)
            }
            if err != nil {
                http.Error(w, "Failed to toggle output", http.StatusInternalServerError)
                log.Debug().Str("function", "toggleOutputHandler").Msg(fmt.Sprintf("Failed to toggle output: %v", err))
                return
            }
            break
        }
    }

    // Get the updated outputs
    outputs, err = mpdClient.ListOutputs()
    if err != nil {
        http.Error(w, "Failed to get outputs", http.StatusInternalServerError)
        log.Debug().Str("function", "toggleOutputHandler").Msg(fmt.Sprintf("Failed to get outputs: %v", err))
        return
    }

    mpdClient.Close()

    // Return the outputs as JSON
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(outputs)
}

func catchAllHandler(w http.ResponseWriter, r *http.Request) {
    // Redirect root path to /static/
    if r.URL.Path == "/" {
        http.Redirect(w, r, "/static/", http.StatusMovedPermanently)
        return
    }

    // Get the absolute path of the requested URL
    absPath := filepath.Join("./", r.URL.Path)

    // Check if the path is a file
    fileInfo, err := os.Stat(absPath)
    if err != nil || !fileInfo.Mode().IsRegular() {
        // If the path is not a file and does not end with a trailing slash, redirect to the path with a trailing slash
        if r.URL.Path[len(r.URL.Path)-1] != '/' {
            http.Redirect(w, r, r.URL.Path+"/", http.StatusMovedPermanently)
            return
        }

        // Serve the index.html template
        tmpl, err := template.ParseFiles("index.html")
        if err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        tmpl.Execute(w, r.URL.Query())
    } else {
        // If the path is a file, you can serve it directly or handle it as needed
        http.ServeFile(w, r, absPath)
    }
}