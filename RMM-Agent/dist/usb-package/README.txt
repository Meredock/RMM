========================================
  RMM Agent - USB Installer Package
========================================

BEFORE YOU START
----------------
1. Open config.json (in the root of this folder) in Notepad.
2. Replace the placeholder values:
   - "dashboard_url"       : The URL of your RMM Dashboard
                             e.g. "http://192.168.1.100:3000"
   - "registration_secret" : The AGENT_REGISTRATION_SECRET value
                             from your dashboard's .env file
   - "device_name"         : (Optional) Leave blank to use the
                             computer's hostname automatically
3. Save the file and copy the whole folder to your USB stick.

You only need to do this once. All machines installed from the
same USB stick will connect to the same dashboard.


INSTALLING ON WINDOWS
---------------------
1. Plug in USB stick.
2. Open File Explorer → windows\ folder.
3. Right-click install.ps1 → "Run with PowerShell".
   (If prompted about execution policy, click "Open" or "Yes".)
4. If a UAC prompt appears, click Yes to allow admin access.
5. Follow any on-screen prompts.

The agent installs as a Windows Service ("RMMAgent") that
starts automatically on boot.


INSTALLING ON LINUX
-------------------
1. Plug in USB stick (or copy the linux\ folder to the machine).
2. Open a terminal in the linux\ folder.
3. Run: sudo bash install.sh
4. Follow any on-screen prompts.

The agent installs as a systemd service (rmm-agent) that
starts automatically on boot.


INSTALLING ON macOS
-------------------
1. Plug in USB stick (or copy the macos\ folder to the machine).
2. Open Terminal in the macos\ folder.
3. Run: sudo bash install.sh
4. Follow any on-screen prompts.

The agent installs as a launchd daemon that starts automatically
on boot.


UNINSTALLING
------------
Windows : Run uninstall.ps1 as Administrator (in windows\ folder)
Linux   : sudo systemctl stop rmm-agent && sudo systemctl disable rmm-agent
          sudo rm /usr/local/bin/rmm-agent /etc/systemd/system/rmm-agent.service
macOS   : sudo launchctl unload /Library/LaunchDaemons/com.rmmagent.agent.plist
          sudo rm /usr/local/bin/rmm-agent /Library/LaunchDaemons/com.rmmagent.agent.plist


TROUBLESHOOTING
---------------
Windows : Event Viewer → Windows Logs → Application  (source: RMMAgent)
Linux   : sudo journalctl -u rmm-agent -f
macOS   : tail -f /var/log/rmm-agent.log

If a device registers successfully you will see it appear in
the dashboard at your dashboard URL within about 30 seconds.
