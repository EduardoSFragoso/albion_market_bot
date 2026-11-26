package client

import (
	"encoding/json"
	"net/http"
	"sync"

	"strings"

	"github.com/ao-data/albiondata-client/internal/dashboard"
	"github.com/ao-data/albiondata-client/internal/marketarchive"
	"github.com/ao-data/albiondata-client/internal/preferences"
	"github.com/ao-data/albiondata-client/lib"
	"github.com/ao-data/albiondata-client/log"
)

type dispatcher struct{}

var (
	wsHub *WSHub
	dis   *dispatcher

	// uploaderCacheMu guards uploaderCache.
	uploaderCacheMu sync.Mutex
	// uploaderCache holds one uploader per ingest target, reused across
	// every upload. Every market order, gold price, or mail upload calls
	// createUploaders, and building a fresh uploader per call used to open
	// a brand new, never-closed NATS connection (with its own internal
	// reconnect/buffering goroutines) or a fresh http.Transport whose idle
	// keep-alive connections were never reclaimed - both leaked memory
	// continuously, and far more sharply during network instability, when
	// abandoned NATS connections would sit retrying with buffered data.
	uploaderCache   = map[string]uploader{}
	marketArchiveMu sync.RWMutex
	marketArchive   *marketarchive.Store
	uploadPrefsMu   sync.RWMutex
	uploadPrefs     *preferences.Store
)

// SetMarketArchiveStore configures the local copy written alongside the
// public market-order upload.
func SetMarketArchiveStore(store *marketarchive.Store) {
	marketArchiveMu.Lock()
	marketArchive = store
	marketArchiveMu.Unlock()
}

// SetUploadPreferencesStore configures saved category choices for public AODP uploads.
func SetUploadPreferencesStore(store *preferences.Store) {
	uploadPrefsMu.Lock()
	uploadPrefs = store
	uploadPrefsMu.Unlock()
}

func currentUploadPreferences() preferences.UploadCategories {
	uploadPrefsMu.RLock()
	store := uploadPrefs
	uploadPrefsMu.RUnlock()
	if store == nil {
		return preferences.DefaultUploadCategories()
	}
	return store.Get()
}

func currentMarketArchiveStore() *marketarchive.Store {
	marketArchiveMu.RLock()
	defer marketArchiveMu.RUnlock()
	return marketArchive
}

func createDispatcher() {
	dis = &dispatcher{}

	if ConfigGlobal.EnableWebsockets {
		wsHub = newHub()
		go wsHub.run()
		go runHTTPServer()
	}
}

func createUploaders(targets []string) []uploader {
	uploaderCacheMu.Lock()
	defer uploaderCacheMu.Unlock()

	var uploaders []uploader
	for _, target := range targets {
		if target == "" {
			continue
		}
		if len(target) < 4 {
			log.Infof("Got an ingest target that was less than 4 characters, not a valid ingest target: %v", target)
			continue
		}

		if cached, ok := uploaderCache[target]; ok {
			uploaders = append(uploaders, cached)
			continue
		}

		var u uploader
		if target[0:8] == "http+pow" || target[0:9] == "https+pow" {
			u = newHTTPUploaderPow(target)
		} else if target[0:4] == "http" || target[0:5] == "https" {
			u = newHTTPUploader(target)
		} else if target[0:4] == "nats" {
			u = newNATSUploader(target)
		} else {
			log.Infof("An invalid ingest target was specified: %v", target)
			continue
		}

		uploaderCache[target] = u
		uploaders = append(uploaders, u)
	}

	return uploaders
}

func sendMsgToPublicUploaders(upload interface{}, topic string, state *albionState, identifier string, recordCount int) {
	data, err := json.Marshal(upload)
	if err != nil {
		log.Errorf("Error while marshalling payload for %v: %v", err, topic)
		return
	}
	if topic == lib.NatsMarketOrdersIngest {
		if archive := currentMarketArchiveStore(); archive != nil {
			serverID := 0
			if state != nil {
				serverID, _ = state.GetServer()
			}
			if err := archive.AppendPayload(data, serverName(serverID)); err != nil {
				log.Errorf("Could not save market orders to local archive; continuing with AODP upload: %v", err)
			}
		}
	}
	dashboard.RecordDataObserved(topic, int64(recordCount))
	if !publicTopicEnabled(topic, currentUploadPreferences()) {
		log.Infof("Skipped public upload for disabled category %s", topic)
		return
	}
	dashboard.IncrementCounterBy(topic, int64(recordCount))

	var PublicIngestBaseUrls = ConfigGlobal.PublicIngestBaseUrls
	// http+pow://albion-online-data.com is used as a magic placeholder for every realm there is
	if strings.Contains(ConfigGlobal.PublicIngestBaseUrls, "https+pow://albion-online-data.com") {
		// we replace the placeholder with the correct one based on the serverID from albionState
		PublicIngestBaseUrls = strings.Replace(PublicIngestBaseUrls, "https+pow://albion-online-data.com", state.AODataIngestBaseURL, -1)
	}

	var publicUploaders = createUploaders(strings.Split(PublicIngestBaseUrls, ","))
	var privateUploaders = createUploaders(strings.Split(ConfigGlobal.PrivateIngestBaseUrls, ","))

	sendMsgToUploaders(data, topic, publicUploaders, state, identifier)
	sendMsgToUploaders(data, topic, privateUploaders, state, identifier)

	// If websockets are enabled, send the data there too
	if ConfigGlobal.EnableWebsockets {
		sendMsgToWebSockets(data, topic)
	}
}

func publicTopicEnabled(topic string, prefs preferences.UploadCategories) bool {
	switch topic {
	case lib.NatsMarketOrdersIngest:
		return prefs.MarketOrders
	case lib.NatsMarketHistoriesIngest:
		return prefs.MarketHistories
	case lib.NatsGoldPricesIngest:
		return prefs.GoldPrices
	case lib.NatsMapDataIngest, lib.NatsFestivitiesIngest, lib.NatsBanditEvent:
		return prefs.WorldData
	default:
		return true
	}
}

func serverName(serverID int) string {
	switch serverID {
	case 1:
		return "West"
	case 2:
		return "East"
	case 3:
		return "Europe"
	default:
		return "Unknown"
	}
}

func sendMsgToPrivateUploaders(upload lib.PersonalizedUpload, topic string, state *albionState, identifier string) {
	if ConfigGlobal.DisableUpload {
		log.Info("Upload is disabled.")
		return
	}

	// TODO: Re-enable this when issue #14 is fixed
	// Will personalize with blanks for now in order to allow people to see the format
	// if state.CharacterName == "" || state.CharacterId == "" {
	// 	log.Error("The player name or id has not been set. Please restart the game and make sure the client is running.")
	// 	notification.Push("The player name or id has not been set. Please restart the game and make sure the client is running.")
	// 	return
	// }

	upload.Personalize(state.CharacterId, state.CharacterName)

	data, err := json.Marshal(upload)
	if err != nil {
		log.Errorf("Error while marshalling payload for %v: %v", err, topic)
		return
	}

	var privateUploaders = createUploaders(strings.Split(ConfigGlobal.PrivateIngestBaseUrls, ","))
	if len(privateUploaders) > 0 {
		sendMsgToUploaders(data, topic, privateUploaders, state, identifier)
	}

	// If websockets are enabled, send the data there too
	if ConfigGlobal.EnableWebsockets {
		sendMsgToWebSockets(data, topic)
	}
}

func sendMsgToUploaders(msg []byte, topic string, uploaders []uploader, state *albionState, identifier string) {
	if ConfigGlobal.DisableUpload {
		log.Info("Upload is disabled.")
		return
	}

	for _, u := range uploaders {
		u.sendToIngest(msg, topic, state, identifier)
	}
}

func runHTTPServer() {
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(wsHub, w, r)
	})

	err := http.ListenAndServe(":8099", nil)

	if err != nil {
		log.Panic("ListenAndServe: ", err)
	}
}

func sendMsgToWebSockets(msg []byte, topic string) {
	// TODO (gradius): send JSON data with topic string
	// TODO (gradius): this seems super hacky, and I'm sure there's a better way.
	var result string
	result = "{\"topic\": \"" + topic + "\", \"data\": " + string(msg) + "}"
	wsHub.broadcast <- []byte(result)
}
