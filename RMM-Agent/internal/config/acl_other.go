//go:build !windows

package config

// secureFile is a no-op off Windows; Save already writes the file 0600.
func secureFile(string) {}
