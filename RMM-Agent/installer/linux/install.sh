#!/usr/bin/env bash
set -e

# RMM Agent Installer for Linux (systemd)
# Run as root: sudo bash install.sh

if [ "$EUID" -ne 0 ]; then
    echo ""
    echo "  Error: This script must be run as root."
    echo "  Run: sudo bash install.sh"
    echo ""
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_SRC="$SCRIPT_DIR/rmm-agent"
CONFIG_TEMPLATE="$SCRIPT_DIR/../config.json"
INSTALL_BIN="/usr/local/bin/rmm-agent"
CONFIG_DIR="/etc/rmm-agent"
CONFIG_FILE="$CONFIG_DIR/config.json"
SERVICE_FILE="/etc/systemd/system/rmm-agent.service"

echo ""
echo "  RMM Agent Installer (Linux)"
echo "  ============================"
echo ""

# ── Load USB config ────────────────────────────────────────────────────────────
DASHBOARD_URL=""
REG_SECRET=""
DEVICE_NAME=""

if [ -f "$CONFIG_TEMPLATE" ] && command -v python3 &>/dev/null; then
    DASHBOARD_URL=$(python3 -c "import json,sys; d=json.load(open('$CONFIG_TEMPLATE')); print(d.get('dashboard_url',''))" 2>/dev/null || echo "")
    REG_SECRET=$(python3 -c "import json,sys; d=json.load(open('$CONFIG_TEMPLATE')); print(d.get('registration_secret',''))" 2>/dev/null || echo "")
    DEVICE_NAME=$(python3 -c "import json,sys; d=json.load(open('$CONFIG_TEMPLATE')); print(d.get('device_name',''))" 2>/dev/null || echo "")
    [ "$DASHBOARD_URL" = "None" ] && DASHBOARD_URL=""
    [ "$REG_SECRET" = "None" ] && REG_SECRET=""
    [ "$DEVICE_NAME" = "None" ] && DEVICE_NAME=""
    # Ignore placeholder values
    [[ "$DASHBOARD_URL" == *"YOUR"* ]] && DASHBOARD_URL=""
    [[ "$REG_SECRET"    == *"YOUR"* ]] && REG_SECRET=""
    echo "  [+] Loaded config.json from package"
fi

# ── Prompt for missing values ─────────────────────────────────────────────────
if [ -z "$DASHBOARD_URL" ]; then
    read -rp "  Dashboard URL (e.g. http://192.168.1.100:3000): " DASHBOARD_URL
fi
if [ -z "$REG_SECRET" ]; then
    read -rp "  Registration Secret: " REG_SECRET
fi
if [ -z "$DEVICE_NAME" ]; then
    DEFAULT_NAME="$(hostname)"
    read -rp "  Device Name [press Enter for: $DEFAULT_NAME]: " DEVICE_NAME
    [ -z "$DEVICE_NAME" ] && DEVICE_NAME="$DEFAULT_NAME"
fi

echo ""
echo "  Dashboard URL : $DASHBOARD_URL"
echo "  Device Name   : $DEVICE_NAME"
echo ""

# ── Verify binary ─────────────────────────────────────────────────────────────
if [ ! -f "$BINARY_SRC" ]; then
    echo "  Error: rmm-agent binary not found at $BINARY_SRC"
    exit 1
fi

# ── Stop existing service if running ─────────────────────────────────────────
if systemctl is-active --quiet rmm-agent 2>/dev/null; then
    echo "  Stopping existing service..."
    systemctl stop rmm-agent
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

# ── Install systemd service ───────────────────────────────────────────────────
cat > "$SERVICE_FILE" <<'EOF'
[Unit]
Description=RMM Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/rmm-agent
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable rmm-agent
systemctl start  rmm-agent

STATUS=$(systemctl is-active rmm-agent)
echo "  [+] Service status: $STATUS"

echo ""
echo "  Installation complete!"
echo ""
echo "  The RMM Agent is running and will auto-start on every boot."
echo "  This device should appear in your dashboard within 30 seconds."
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status rmm-agent   # check status"
echo "    sudo journalctl -u rmm-agent -f   # view live logs"
echo "    sudo systemctl stop  rmm-agent    # stop agent"
echo "    sudo systemctl start rmm-agent    # start agent"
echo ""
