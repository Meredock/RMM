//go:build !windows

package main

import "github.com/meredock/rmm-agent/internal/config"

func checkWindowsService(_ *config.Config) bool { return false }
