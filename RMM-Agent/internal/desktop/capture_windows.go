//go:build windows

package desktop

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32dll = windows.NewLazySystemDLL("user32.dll")
	gdi32dll  = windows.NewLazySystemDLL("gdi32.dll")

	procGetDC            = user32dll.NewProc("GetDC")
	procReleaseDC        = user32dll.NewProc("ReleaseDC")
	procGetSystemMetrics = user32dll.NewProc("GetSystemMetrics")

	procSetProcessDpiAwarenessContext = user32dll.NewProc("SetProcessDpiAwarenessContext")
	procSetProcessDPIAware            = user32dll.NewProc("SetProcessDPIAware")

	procCreateCompatibleDC     = gdi32dll.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap = gdi32dll.NewProc("CreateCompatibleBitmap")
	procSelectObject           = gdi32dll.NewProc("SelectObject")
	procBitBlt                 = gdi32dll.NewProc("BitBlt")
	procGetDIBits              = gdi32dll.NewProc("GetDIBits")
	procDeleteObject           = gdi32dll.NewProc("DeleteObject")
	procDeleteDC               = gdi32dll.NewProc("DeleteDC")

	dpiOnce sync.Once
)

// dpiAwarePerMonitorV2 is DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 ((HANDLE)-4).
const dpiAwarePerMonitorV2 = ^uintptr(3)

// setDPIAware makes this process DPI-aware so screen metrics, GDI capture, and
// SetCursorPos all operate in true physical pixels. Without it, on a scaled
// display (e.g. 150%) GetSystemMetrics reports a smaller logical size while
// BitBlt reads physical pixels — capturing only the top-left corner (the
// "zoomed in" symptom) and throwing cursor coordinates out of alignment.
func setDPIAware() {
	dpiOnce.Do(func() {
		if procSetProcessDpiAwarenessContext.Find() == nil {
			if ret, _, _ := procSetProcessDpiAwarenessContext.Call(dpiAwarePerMonitorV2); ret != 0 {
				return
			}
		}
		// Fallback for Windows < 10 1703: system-DPI aware.
		procSetProcessDPIAware.Call()
	})
}

// bitmapInfoHeader mirrors BITMAPINFOHEADER (40 bytes, matches Win32 exactly).
type bitmapInfoHeader struct {
	size          uint32
	width         int32
	height        int32
	planes        uint16
	bitCount      uint16
	compression   uint32
	sizeImage     uint32
	xPelsPerMeter int32
	yPelsPerMeter int32
	clrUsed       uint32
	clrImportant  uint32
}

func captureScreen() (string, int, int, error) {
	setDPIAware()

	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN
	w, h := int(sw), int(sh)

	screenDC, _, _ := procGetDC.Call(0)
	if screenDC == 0 {
		return "", 0, 0, fmt.Errorf("GetDC failed")
	}
	defer procReleaseDC.Call(0, screenDC)

	memDC, _, _ := procCreateCompatibleDC.Call(screenDC)
	if memDC == 0 {
		return "", 0, 0, fmt.Errorf("CreateCompatibleDC failed")
	}
	defer procDeleteDC.Call(memDC)

	bmp, _, _ := procCreateCompatibleBitmap.Call(screenDC, sw, sh)
	if bmp == 0 {
		return "", 0, 0, fmt.Errorf("CreateCompatibleBitmap failed")
	}
	defer procDeleteObject.Call(bmp)

	// Select bitmap into memDC, capture screen, then deselect before GetDIBits.
	prevBmp, _, _ := procSelectObject.Call(memDC, bmp)
	procBitBlt.Call(memDC, 0, 0, sw, sh, screenDC, 0, 0, 0x00CC0020) // SRCCOPY
	procSelectObject.Call(memDC, prevBmp)

	bi := bitmapInfoHeader{
		size:     uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		width:    int32(w),
		height:   -int32(h), // negative = top-down DIB
		planes:   1,
		bitCount: 32,
	}
	pixels := make([]byte, w*h*4)
	procGetDIBits.Call(
		screenDC, bmp, 0, sh,
		uintptr(unsafe.Pointer(&pixels[0])),
		uintptr(unsafe.Pointer(&bi)),
		0, // DIB_RGB_COLORS
	)

	// GDI returns BGRA; convert to RGBA for image/jpeg.
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < len(pixels); i += 4 {
		img.Pix[i+0] = pixels[i+2] // R
		img.Pix[i+1] = pixels[i+1] // G
		img.Pix[i+2] = pixels[i+0] // B
		img.Pix[i+3] = 255
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 40}); err != nil {
		return "", 0, 0, err
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), w, h, nil
}
