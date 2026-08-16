// Package winget drives the Windows Package Manager: export the installed-app
// list and import (install) a chosen set on another machine — the engine for
// app replication. winget must run in the interactive user session, so on
// Windows these run via CreateProcessAsUser with file-based I/O.
package winget

// Export returns the winget export manifest (JSON) of installed apps.
func Export() (string, error) { return export() }

// Import installs the apps in the given winget manifest (JSON).
func Import(manifest string) (string, error) { return importApps(manifest) }
