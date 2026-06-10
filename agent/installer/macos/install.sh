#!/usr/bin/env bash
set -e

# RMM Agent Installer for macOS (launchd)
# Run as root: sudo bash install.sh

if [ "$EUID" -ne 0 ]; then
    echo ""
    echo "  Error: This script must be run as root."
    echo "  Run: sudo bash install.sh"
    echo ""
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_TEMPLATE="$SCRIPT_DIR/../config.json"
CONFIG_DIR="/etc/rmm-agent"
CONFIG_FILE="$CONFIG_DIR/config.json"
INSTALL_BIN="/usr/local/bin/rmm-agent"
PLIST_FILE="/Library/LaunchDaemons/com.rmmagent.agent.plist"

# ── Pick the right binary for this Mac ────────────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] && [ -f "$SCRIPT_DIR/rmm-agent-arm64" ]; then
    BINARY_SRC="$SCRIPT_DIR/rmm-agent-arm64"
else
    BINARY_SRC="$SCRIPT_DIR/rmm-agent"
fi

echo ""
echo "  RMM Agent Installer (macOS - $ARCH)"
echo "  ======================================"
echo ""

# ── Load USB config ────────────────────────────────────────────────────────────
DASHBOARD_URL=""
REG_SECRET=""
DEVICE_NAME=""

if [ -f "$CONFIG_TEMPLATE" ]; then
    DASHBOARD_URL=$(python3 -c "import json; d=json.load(open('$CONFIG_TEMPLATE')); print(d.get('dashboard_url',''))" 2>/dev/null || echo "")
    REG_SECRET=$(python3 -c "import json; d=json.load(open('$CONFIG_TEMPLATE')); print(d.get('registration_secret',''))" 2>/dev/null || echo "")
    DEVICE_NAME=$(python3 -c "import json; d=json.load(open('$CONFIG_TEMPLATE')); print(d.get('device_name',''))" 2>/dev/null || echo "")
    [[ "$DASHBOARD_URL" == *"YOUR"* ]] && DASHBOARD_URL=""
    [[ "$REG_SECRET"    == *"YOUR"* ]] && REG_SECRET=""
    echo "  [+] Loaded config.json from package"
fi

if [ -z "$DASHBOARD_URL" ]; then
    read -rp "  Dashboard URL (e.g. http://192.168.1.100:3000): " DASHBOARD_URL
fi
if [ -z "$REG_SECRET" ]; then
    read -rp "  Registration Secret: " REG_SECRET
fi
if [ -z "$DEVICE_NAME" ]; then
    DEFAULT_NAME="$(hostname -s)"
    read -rp "  Device Name [press Enter for: $DEFAULT_NAME]: " DEVICE_NAME
    [ -z "$DEVICE_NAME" ] && DEVICE_NAME="$DEFAULT_NAME"
fi

echo ""
echo "  Dashboard URL : $DASHBOARD_URL"
echo "  Device Name   : $DEVICE_NAME"
echo ""

if [ ! -f "$BINARY_SRC" ]; then
    echo "  Error: binary not found at $BINARY_SRC"
    exit 1
fi

# ── Stop existing service ─────────────────────────────────────────────────────
if launchctl list | grep -q "com.rmmagent.agent" 2>/dev/null; then
    echo "  Stopping existing service..."
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi

# ── Install binary ────────────────────────────────────────────────────────────
install -m 755 "$BINARY_SRC" "$INSTALL_BIN"
echo "  [+] Installed $INSTALL_BIN"

# ── Write config ──────────────────────────────────────────────────────────────
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_FILE" <<EOF
{
  "dashboard_url": "$DASHBOARD_URL",
  "registration_secret": "$REG_SECRET",
  "device_name": "$DEVICE_NAME",
  "interval_seconds": 30,
  "agent_version": "1.0.0"
}
EOF
chmod 600 "$CONFIG_FILE"
echo "  [+] Wrote config $CONFIG_FILE"

# ── Install launchd plist ─────────────────────────────────────────────────────
cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.rmmagent.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/rmm-agent</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/rmm-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/rmm-agent.log</string>
</dict>
</plist>
EOF
chmod 644 "$PLIST_FILE"

launchctl load -w "$PLIST_FILE"
echo "  [+] Service loaded"

echo ""
echo "  Installation complete!"
echo ""
echo "  The RMM Agent is running and will auto-start on every boot."
echo "  This device should appear in your dashboard within 30 seconds."
echo ""
echo "  Useful commands:"
echo "    sudo launchctl list | grep rmm       # check status"
echo "    tail -f /var/log/rmm-agent.log       # view live logs"
echo "    sudo launchctl unload $PLIST_FILE    # stop agent"
echo "    sudo launchctl load   $PLIST_FILE    # start agent"
echo ""
