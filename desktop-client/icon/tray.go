// icon/tray.go
package icon

import _ "embed"

// TrayPNG is the neutral market archive icon used by the application and
// system tray on all supported platforms.
//
//go:embed market-archive.png
var TrayPNG []byte
